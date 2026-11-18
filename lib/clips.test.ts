// Clips (docs/specs/025-clips.md), stage 1: lengths, the chapters as clips, clean ends on sentences and
// words, and the AI imagery flag.
// Run: npx tsx --test lib/clips.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    canMake, chapterClip, chapterSpans, ClipEditSchema, clipLength, clipShowsBroll, hasChapterClip, sentenceBounds, wordSnap, type ClipEdit,
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
        title: '', description: '', thumbText: '', synthetic: false,
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
        id: 'abcd1234', source: { kind: 'own' }, startMs: 0, endMs: 5 * MIN, title: 'T', description: 'D', thumbText: '*Big* idea', synthetic: false,
    };
    assert.equal(ClipEditSchema.safeParse(clip).success, true);
    assert.equal(ClipEditSchema.safeParse({ ...clip, source: { kind: 'chapter', index: 0, count: 4 } }).success, false);
    assert.equal(ClipEditSchema.safeParse({ ...clip, title: 'x'.repeat(101) }).success, false);
    assert.equal(ClipEditSchema.safeParse({ ...clip, id: 'no' }).success, false);
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
