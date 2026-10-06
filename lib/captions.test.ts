// Spec 020 item E8: the YouTube caption track as the Studio editor shows it, reading speed, and copy and paste.
// Run: npx tsx --test lib/captions.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCues, cueAt, cueCps, cueTooFast, editCues, MAX_CPS, toSrt, type Cue } from './captions';
import { editedWords } from './edit';
import { lowerThird, LayerSchema, logoBug, pasteAt, SITE_LOGO } from './layers';
import { newSound, SoundSchema } from './audio';
import { DEFAULT_BRAND } from './studioSettings';
import { playOrder } from './sequence';

// Ten words, 500 ms each with 100 ms between them: "w0" at 0-500, "w1" at 600-1100, ...
const words = Array.from({ length: 10 }, (_, i) => ({ text: `w${i}`, start: i * 600, end: i * 600 + 500 }));

test('the editor shows the track the render writes: the kept words on the edited timeline', () => {
    const clips = playOrder({ cuts: [{ startMs: 1150, endMs: 2950, reason: 'manual' }] }, 6000, words);
    const cues = editCues(words, clips);
    // The render's .srt, without teasers and intro: the same cues.
    assert.equal(toSrt(cues), toSrt(buildCues(editedWords(words, clips))));
    const text = cues.flatMap(c => c.lines).join(' ');
    assert.ok(!/w2|w3|w4/.test(text), text);
    assert.match(text, /^w0 w1 w5/);
    // w5 (3000 ms in the recording) is heard straight after w1 once the cut is out.
    const after = editedWords(words, clips).find(w => w.text === 'w5')!;
    assert.ok(after.start < 3000 && after.start > 1100, String(after.start));
});

test('a transition shortens the edit, and the words after it move with it; the word at the split stays', () => {
    const dissolve = { at: { atSplit: 3000 }, transition: 'dissolve' as const, durationMs: 1000 };
    const plain = editedWords(words, playOrder({ cuts: [], splits: [3000] }, 6000, words));
    const dissolved = editedWords(words, playOrder({ cuts: [], splits: [3000], joins: [dissolve] }, 6000, words));
    const at = (ws: typeof words, t: string) => ws.find(w => w.text === t)?.start;
    assert.equal(at(dissolved, 'w9')!, at(plain, 'w9')! - 1000);
    // "w5" starts exactly at the split: it is the first word of the part after the dissolve, not cut.
    assert.equal(at(dissolved, 'w5'), 2000);
    assert.match(editCues(words, playOrder({ cuts: [], splits: [3000], joins: [dissolve] }, 6000, words)).flatMap(c => c.lines).join(' '), /w4 w5 w6/);
    // A word across two ranges played back to back is kept.
    assert.deepEqual(editedWords([{ text: 'x', start: 900, end: 1100 }], [{ startMs: 0, endMs: 1000 }, { startMs: 1000, endMs: 2000 }]), [{ text: 'x', start: 900, end: 1100 }]);
});

test('reading speed: over 20 characters a second is marked', () => {
    const cue = (chars: number, ms: number): Cue => ({ startMs: 1000, endMs: 1000 + ms, lines: ['x'.repeat(chars)] });
    assert.equal(cueCps(cue(40, 2000)), 20);
    assert.equal(cueTooFast(cue(40, 2000)), false);
    assert.equal(cueTooFast(cue(41, 2000)), true);
    // Two lines count the space between them.
    assert.equal(cueCps({ startMs: 0, endMs: 1000, lines: ['abc', 'def'] }), 7);
    assert.equal(MAX_CPS, 20);
});

test('the caption on screen at a moment', () => {
    const cues: Cue[] = [{ startMs: 0, endMs: 1000, lines: ['a'] }, { startMs: 1500, endMs: 2500, lines: ['b'] }, { startMs: 2500, endMs: 3000, lines: ['c'] }];
    assert.deepEqual([0, 999, 1000, 1200, 1500, 2499, 2500, 3000].map(ms => cueAt(cues, ms)), [0, 0, -1, -1, 1, 1, 2, -1]);
    assert.equal(cueAt([], 0), -1);
});

test('paste: a copy at the playhead with a new id, anchored as the original was', () => {
    const lt = { ...lowerThird(5000, 'Ana', 'Guest', DEFAULT_BRAND), id: 'lt1' };
    const copy = pasteAt(lt, 42_000, 30_000);
    assert.notEqual(copy.id, lt.id);
    assert.deepEqual(copy.anchor, { srcMs: 42_000 });
    assert.equal(copy.text, lt.text);
    assert.equal(LayerSchema.safeParse(copy).success, true);
    // A deep copy: changing the paste leaves the original alone.
    copy.place.x = 0.9;
    assert.notEqual(lt.place.x, 0.9);
    // Pinned ones stay pinned, at the playhead's time in the edit.
    const logo = logoBug({ path: SITE_LOGO, name: 'logo' });
    assert.deepEqual(pasteAt(logo, 42_000, 30_000.4).anchor, { atMs: 30_000 });
    // Sounds too.
    const hit = newSound({ path: 'library/s1.wav', name: 'h', durationMs: 900 }, 'effect', { srcMs: 0, atMs: 0 });
    const pasted = pasteAt(hit, 7_000, 6_000);
    assert.equal(SoundSchema.safeParse(pasted).success, true);
    assert.deepEqual([pasted.anchor, pasted.track, pasted.id !== hit.id], [{ srcMs: 7_000 }, hit.track, true]);
});
