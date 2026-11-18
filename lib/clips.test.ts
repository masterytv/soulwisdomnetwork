// Clips (docs/specs/025-clips.md), stage 1: lengths, the chapters as clips, clean ends on sentences and
// words, and the AI imagery flag.
// Run: npx tsx --test lib/clips.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    canMake, chapterClip, chapterSpans, ClipEditSchema, clipLength, clipRenderInputs, clipShowsBroll, hasChapterClip, sameClipRender, sentenceBounds,
    withClipDefaults, wordSnap, clipChapters, clipMetadata, clipWords, type ClipEdit,
} from './clips';

const w = (text: string, start: number, end: number) => ({ text, start, end });
const MIN = 60_000;

// One word a second for 30 minutes, a sentence ending every tenth word (at 9 s, 19 s, …).
const WORDS = Array.from({ length: 1800 }, (_, i) => w(`w${i}${i % 10 === 9 ? '.' : ''}`, i * 1000, i * 1000 + 600));

test('clipLength: the aim is 5 to 15 minutes, the limits 2 to 20', () => {
    assert.equal(clipLength(1 * MIN), 'too short');
    assert.equal(clipLength(3 * MIN), 'short');
    assert.equal(clipLength(5 * MIN), 'good');
    assert.equal(clipLength(15 * MIN), 'good');
    assert.equal(clipLength(18 * MIN), 'long');
    assert.equal(clipLength(21 * MIN), 'too long');
    assert.equal(canMake(2 * MIN), true);
    assert.equal(canMake(20 * MIN), true);
    assert.equal(canMake(2 * MIN - 1), false);
    assert.equal(canMake(20 * MIN + 1), false);
});

test('chapterSpans: each chapter runs to the next one, the last to the end, in time order', () => {
    const spans = chapterSpans([
        { title: 'B', originalMs: 0, startMs: 10 * MIN },
        { title: 'A', originalMs: 0, startMs: 0 },
        { title: 'C', originalMs: 0, startMs: 18 * MIN },
    ], 30 * MIN);
    assert.deepEqual(spans.map(s => [s.index, s.title, s.startMs, s.endMs]), [
        [0, 'A', 0, 10 * MIN], [1, 'B', 10 * MIN, 18 * MIN], [2, 'C', 18 * MIN, 30 * MIN],
    ]);
});

test('chapterClip: one chapter or two joined, and none past the last', () => {
    const spans = chapterSpans([{ title: 'A', originalMs: 0, startMs: 0 }, { title: 'B', originalMs: 0, startMs: 4 * MIN }], 12 * MIN);
    assert.deepEqual(chapterClip(spans, 0, 2, 'abcd1234'), {
        id: 'abcd1234', source: { kind: 'chapter', index: 0, count: 2 }, startMs: 0, endMs: 12 * MIN,
        title: '', description: '', thumbText: '', thumbFeeling: [], thumbSpeaker: null, thumbMoment: null, thumbBackground: 'brand', synthetic: false,
    });
    assert.equal(chapterClip(spans, 1, 2, 'abcd1234'), null);
    const items = [chapterClip(spans, 0, 2, 'abcd1234')!];
    assert.equal(hasChapterClip(items, 0, 2), true);
    assert.equal(hasChapterClip(items, 0, 1), false);
});

test('sentenceBounds: starts where a thought starts and ends where one ends, with a little air', () => {
    // Asked for 103.5 s to 412 s: the nearest sentence start is word 100 (100 s), the nearest sentence
    // end word 409 (409 s).
    const b = sentenceBounds(WORDS, 103_500, 412_000)!;
    assert.equal(b.startMs, 100_000 - 120);
    assert.equal(b.endMs, 409_600 + 300);
});

test('sentenceBounds: a long pause counts as the end of a thought', () => {
    const words = [w('one', 0, 500), w('two', 600, 1000), w('three', 4000, 4500), w('four', 4600, 5000), w('five', 5100, 5500)];
    const b = sentenceBounds(words, 3000, 5000)!;
    assert.equal(b.startMs, 4000 - 120);      // "three" follows a 3 s pause
});

test('sentenceBounds: with no sentence within reach, the words asked for', () => {
    const words = Array.from({ length: 200 }, (_, i) => w(`x${i}`, i * 500, i * 500 + 300));
    const b = sentenceBounds(words, 30_000, 60_000)!;
    assert.equal(b.startMs, 30_000 - 120);
    assert.equal(b.endMs, 60_000);            // the air after the last word stops at the next word
    assert.equal(sentenceBounds(words, 200_000, 300_000), null);
});

test('wordSnap: whole words, the first heard after the start and the last before the end', () => {
    const b = wordSnap(WORDS, 100_300, 220_200)!;
    assert.equal(b.startMs, 100_000 - 120);   // word 100 is still being said at 100.3 s
    assert.equal(b.endMs, 220_600 + 300);
});

test('ClipEditSchema: what the page sends', () => {
    const clip: ClipEdit = {
        id: 'abcd1234', source: { kind: 'own' }, startMs: 0, endMs: 5 * MIN, title: 'T', description: 'D', thumbText: '*Big* idea', thumbFeeling: ['wonder'], thumbSpeaker: null, thumbMoment: null, thumbBackground: 'brand', synthetic: false,
    };
    assert.equal(ClipEditSchema.safeParse(clip).success, true);
    assert.equal(ClipEditSchema.safeParse({ ...clip, source: { kind: 'chapter', index: 0, count: 4 } }).success, false);
    assert.equal(ClipEditSchema.safeParse({ ...clip, title: 'x'.repeat(101) }).success, false);
    assert.equal(ClipEditSchema.safeParse({ ...clip, id: 'no' }).success, false);
    assert.equal(ClipEditSchema.safeParse({ ...clip, thumbFeeling: ['wonder', 'surprise', 'anger'] }).success, false);
    assert.equal(ClipEditSchema.safeParse({ ...clip, thumbFeeling: ['boredom'] }).success, false);
});

test('clipShowsBroll: each end mapped back through its chapter', () => {
    // The edit cut 60 s from the first chapter, so the second starts 60 s earlier on the final cut.
    const chapters = [{ title: 'A', originalMs: 0, startMs: 0 }, { title: 'B', originalMs: 10 * MIN, startMs: 9 * MIN }];
    const still = (startMs: number) => [{ startMs, durationSeconds: 5 }];
    // The clip 9:00-14:00 on the final cut is 10:00-15:00 in the original.
    assert.equal(clipShowsBroll(still(12 * MIN), chapters, 9 * MIN, 14 * MIN), true);
    assert.equal(clipShowsBroll(still(9.5 * MIN), chapters, 9 * MIN, 14 * MIN), false);
    assert.equal(clipShowsBroll([], chapters, 0, 5 * MIN), false);
    assert.equal(clipShowsBroll(still(0), [], 9 * MIN, 14 * MIN), true);   // no way to tell
});

test('clip renders: current while the ends and the final cut match', () => {
    const inputs = clipRenderInputs({ startMs: 1000, endMs: 5 * MIN }, 42);
    assert.equal(sameClipRender(inputs, clipRenderInputs({ startMs: 1000, endMs: 5 * MIN }, 42)), true);
    assert.equal(sameClipRender(inputs, clipRenderInputs({ startMs: 1000, endMs: 5 * MIN + 1 }, 42)), false);
    assert.equal(sameClipRender(inputs, clipRenderInputs({ startMs: 1000, endMs: 5 * MIN }, 43)), false);
    assert.equal(sameClipRender({ ...inputs, version: 0 }, inputs), false);
    assert.equal(sameClipRender(null, inputs), false);
});

test('withClipDefaults: a clip saved before stage 3 reads with the new fields', () => {
    const old = { id: 'abcd1234', startMs: 0, endMs: 1, title: '', description: '', thumbText: '', synthetic: false };
    assert.deepEqual(withClipDefaults(old), { ...old, thumbFeeling: [], thumbSpeaker: null, thumbMoment: null, thumbBackground: 'brand' });
    assert.equal(withClipDefaults({ ...old, thumbBackground: 'clip' as const }).thumbBackground, 'clip');
});

test('clipChapters: from the clip start, the first at 0:00, three or more, each at least 10 seconds', () => {
    const chapters = [{ title: 'A', startMs: 0 }, { title: 'B', startMs: 4 * MIN }, { title: 'C', startMs: 6 * MIN }, { title: 'D', startMs: 9 * MIN }];
    assert.deepEqual(clipChapters(chapters, 3 * MIN, 12 * MIN), ['0:00 A', '1:00 B', '3:00 C', '6:00 D']);
    assert.deepEqual(clipChapters(chapters, 3 * MIN, 7 * MIN), ['0:00 A', '1:00 B', '3:00 C']);
    assert.deepEqual(clipChapters(chapters, 5 * MIN, 8 * MIN), []);               // only two inside
    assert.deepEqual(clipChapters(chapters, 3 * MIN, 9 * MIN + 5000), ['0:00 A', '1:00 B', '3:00 C']);   // D: 5 s, dropped
    assert.deepEqual(clipChapters([{ title: 'A', startMs: 0 }, { title: 'B', startMs: 5000 }, { title: 'C', startMs: MIN }, { title: 'E', startMs: 2 * MIN }], 0, 5 * MIN),
        ['0:00 A', '1:00 C', '2:00 E']);                                           // B: 5 s after A, dropped
});

test('clipMetadata: the link first, the description, the chapters, the credits and two hashtags; clean titles', () => {
    const m = clipMetadata({ title: ' The <Soul>  Remembers ', description: 'What she saw.', synthetic: true }, {
        url: 'https://youtu.be/x', linkText: 'Watch the full conversation', chapters: ['0:00 A', '1:00 B', '2:00 C'],
        hashtags: ['NDE', '#Soul', '#Third'], tags: Array.from({ length: 20 }, (_, i) => `t${i}`), credits: ['Music: X'],
    });
    assert.equal(m.title, 'The Soul Remembers');
    assert.equal(m.description, 'Watch the full conversation: https://youtu.be/x\n\nWhat she saw.\n\nChapters\n0:00 A\n1:00 B\n2:00 C\n\nMusic and sound\nMusic: X\n\n#NDE #Soul');
    assert.equal(m.tags.length, 15);
    assert.equal(m.containsSyntheticMedia, true);
    assert.equal(clipMetadata({ title: 't', description: 'd', synthetic: false }, { url: '', linkText: '', chapters: [], hashtags: [], tags: [] }).description, 'd');
});

test('clipWords: the clip\'s words, timed from its start', () => {
    const words = [{ text: 'a', start: 900, end: 1100 }, { text: 'b', start: 2000, end: 2500 }, { text: 'c', start: 5200, end: 5600 }];
    assert.deepEqual(clipWords(words, 1000, 5000), [{ text: 'b', start: 1000, end: 1500 }]);
});
