// The "Soul Wisdom Clips" thumbnail's moment (docs/specs/025-clips.md, step 4): turns and the main speaker, loudness
// and word cues, the candidates, Claude's looks made safe, ranking, the crop, the side and when moments go stale.
// Run: npx tsx --test lib/clipThumbs.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    candidateMoments, cleanLook, cropBox, loudMoments, mainSpeaker, MOMENT_CANDIDATES, MOMENT_GAP_MS, momentInputs, parseMomentary, rankMoments,
    sameMoments, speakersIn, standOn, turnsOnFinal, wordCues, type MomentLook, type Turn,
} from './clipThumbs';

const S = 1000, MIN = 60_000;
const look = (o: Partial<MomentLook> = {}): MomentLook => ({
    frame: 1, usable: true, expression: 7, fit: 7, emotion: 'wonder', left: 0.5, top: 0.1, right: 0.9, bottom: 1, facing: 'camera', ...o,
});

test('turnsOnFinal and the main speaker: by time spoken inside the clip', () => {
    const turns = turnsOnFinal([
        { name: 'Tom', start: 0, end: 60 * S }, { name: ' Jo Ann ', start: 60 * S, end: 200 * S }, { name: '', start: 200 * S, end: 210 * S },
    ], ms => ms - 10 * S);
    assert.deepEqual(turns.map(t => [t.speaker, t.startMs, t.endMs]), [['Tom', -10 * S, 50 * S], ['Jo Ann', 50 * S, 190 * S]]);
    assert.equal(mainSpeaker(turns, 0, 100 * S), 'Jo Ann');     // 50 s against 50 s: then by name
    assert.equal(mainSpeaker(turns, 0, 60 * S), 'Tom');
    assert.deepEqual(speakersIn(turns, 0, 100 * S).map(s => s.ms), [50 * S, 50 * S]);
    assert.equal(mainSpeaker(turns, 300 * S, 400 * S), null);
});

test('parseMomentary: the frame log of ebur128', () => {
    const log = '[Parsed_ebur128_0 @ 0x1] t: 0.1      TARGET:-23 LUFS    M: -inf S:-120.7     I: -70.0 LUFS\n' +
        '[Parsed_ebur128_0 @ 0x1] t: 0.2      TARGET:-23 LUFS    M: -21.4 S:-22.0     I: -21.0 LUFS\nother line';
    assert.deepEqual(parseMomentary(log), [{ ms: 200, lufs: -21.4 }]);
});

test('loudMoments: peaks well over the speaker\'s own median, in their turns only, loudest first', () => {
    const turns: Turn[] = [{ speaker: 'Tom', startMs: 0, endMs: 10 * S }];
    const series = Array.from({ length: 200 }, (_, i) => ({ ms: i * 100, lufs: -24 }));
    series[30].lufs = -18;     // 6 LU over, in the turn
    series[60].lufs = -19;
    series[70].lufs = -22;     // only 2 LU over
    series[150].lufs = -10;    // outside the turn
    assert.deepEqual(loudMoments(series, turns, 0, 20 * S), [3000, 6000]);
});

test('wordCues: laughter, exclamations, reactions, the title\'s words, questions, in that order', () => {
    const w = (text: string, start: number) => ({ text, start, end: start + 300 });
    const cues = wordCues([w('Why?', 1000), w('soul', 2000), w('Wow', 3000), w('(laughs)', 4000), w('there!', 5000), w('outside', 99_000)],
        0, 10_000, 'The *Soul* Remembers');
    assert.deepEqual(cues.map(c => c.cue), ['laughter', 'exclamation', 'reaction', 'title', 'question']);
});

test('candidateMoments: cues first, a beat after, only in the speaker\'s turns, spaced, away from the ends', () => {
    const turns: Turn[] = [{ speaker: 'Tom', startMs: 0, endMs: 60 * S }, { speaker: 'Tom', startMs: 120 * S, endMs: 300 * S }];
    const c = candidateMoments({
        startMs: 0, endMs: 300 * S, turns,
        loud: [130 * S, 132 * S, 2 * S, 90 * S],             // 132 s too close; 2 s at the edge; 90 s not their turn
        cues: [{ ms: 40 * S, cue: 'laughter' }, { ms: 200 * S, cue: 'title' }], quotes: [150 * S], max: 6,
    });
    assert.deepEqual(c.filter(x => x.cue !== 'spaced').map(x => [x.ms, x.cue]),
        [[40_300, 'laughter'], [130_300, 'loud'], [152_000, 'quote'], [200_300, 'title']]);
    assert.equal(c.length, 6);
    for (const x of c) assert.ok(x.ms >= 5 * S && x.ms <= 295 * S && turns.some(t => x.ms >= t.startMs && x.ms < t.endMs), String(x.ms));
    for (let i = 1; i < c.length; i++) assert.ok(c[i].ms - c[i - 1].ms >= 10 * S);
    assert.ok(candidateMoments({ startMs: 0, endMs: 30 * MIN, turns: [{ speaker: 'T', startMs: 0, endMs: 30 * MIN }], loud: [], cues: [], quotes: [] }).length
        === MOMENT_CANDIDATES);
});

test('cleanLook: scores kept to 1-10, the box inside the frame and the right way round', () => {
    const l = cleanLook(look({ expression: 14, fit: 0, left: 0.9, right: 0.4, top: -0.2, bottom: 1.3, emotion: ' Wonder!! ' }));
    assert.deepEqual([l.expression, l.fit, l.left, l.right, l.top, l.bottom, l.emotion], [10, 1, 0.4, 0.9, 0, 1, 'wonder']);
    assert.equal(cleanLook(look({ left: 0.5, right: 0.52 })).usable, false);     // too thin to be a person
});

test('rankMoments: usable only, fit then expression, spaced apart', () => {
    const f = (ms: number, o: Partial<MomentLook>) => ({ ms, look: look(o) });
    const ranked = rankMoments([
        f(0, { fit: 6, expression: 9 }), f(5 * S, { fit: 9 }), f(60 * S, { fit: 9, expression: 9 }), f(120 * S, { fit: 10, usable: false }), f(200 * S, { fit: 6, expression: 8 }),
    ]);
    assert.deepEqual(ranked.map(r => r.ms), [60 * S, 5 * S, 200 * S]);     // 0 s is within 20 s of 5 s
    assert.equal(MOMENT_GAP_MS, 20 * S);
});

test('cropBox: the speaker with a margin, kept in the frame, even-sized', () => {
    // The box is 768 x 864 px: a fifth of its width each side, 0.3 of its height above (cut at the top), a fifth below (cut).
    assert.deepEqual(cropBox({ left: 0.5, top: 0.2, right: 0.9, bottom: 1 }, 1920, 1080), { x: 806, y: 0, w: 1074, h: 1080 });
    assert.deepEqual(cropBox({ left: 0.25, top: 0.5, right: 0.5, bottom: 0.75 }, 1920, 1080), { x: 384, y: 458, w: 672, h: 406 });
    assert.deepEqual(cropBox({ left: 0, top: 0, right: 1, bottom: 1 }, 1920, 1080), { x: 0, y: 0, w: 1920, h: 1080 });
});

test('standOn: the speaker faces the title, never mirrored', () => {
    assert.equal(standOn('left'), 'right');
    assert.equal(standOn('right'), 'left');
    assert.equal(standOn('camera'), 'right');
});

test('moments go stale when the ends, the title, the feeling, the speaker or the final cut change', () => {
    const clip = { startMs: 0, endMs: 5 * MIN, thumbText: ' *Soul* Remembers ', thumbFeeling: ['wonder', 'delight'], thumbSpeaker: null };
    const a = momentInputs(clip, 1);
    assert.equal(sameMoments(a, momentInputs({ ...clip, thumbFeeling: ['delight', 'wonder'] }, 1)), true);
    assert.equal(sameMoments(a, momentInputs({ ...clip, thumbText: 'Other' }, 1)), false);
    assert.equal(sameMoments(a, momentInputs({ ...clip, thumbSpeaker: 'Jo Ann' }, 1)), false);
    assert.equal(sameMoments(a, momentInputs(clip, 2)), false);
    assert.equal(sameMoments(null, a), false);
});
