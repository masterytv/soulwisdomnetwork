// Clips (docs/specs/025-clips.md), stage 2: Claude's suggested topics checked and placed in code: the opening
// found where Claude says, whole thoughts at both ends, 2 to 20 minutes, and no two overlapping by over half.
// Run: npx tsx --test lib/clipPicks.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
    CLIP_PICK_ASK, CLIP_PICK_COUNT, clipPickInstructions, ClipPicksSchema, ClipSuggestionSchema, findOpening, isTakenClip, placePick,
    rankClipPicks, suggestionToClip, type PlacedPick,
} from './clipPicks';
import { ClipEditSchema } from './clips';

const MIN = 60_000;
// One word a second for 40 minutes, named by their number, a sentence ending every tenth word (at 9 s, 19 s, …).
const WORDS = Array.from({ length: 2400 }, (_, i) => ({ text: `w${i}${i % 10 === 9 ? '.' : ''}`, start: i * 1000, end: i * 1000 + 600 }));
const opening = (from: number) => Array.from({ length: 8 }, (_, k) => `w${from + k}`).join(' ');

const pick = (o: Partial<z.infer<typeof ClipPicksSchema>['picks'][number]> = {}) => ({
    startMs: 300_000, endMs: 900_000, title: 'A topic', score: 8, opening: opening(300), reason: 'Why.', standsAlone: true, ...o,
});

test('limits', () => {
    assert.equal(CLIP_PICK_COUNT, 8);
    assert.equal(CLIP_PICK_ASK, 10);
});

test('findOpening: the words in order, near the time Claude gave, ignoring case and marks', () => {
    assert.equal(findOpening(WORDS, 300_000, opening(300)), 300);
    assert.equal(findOpening(WORDS, 320_000, 'W300, w301 w302. w303 w304 w305'), 300);   // 20 s off is within reach
    assert.equal(findOpening(WORDS, 400_000, opening(300)), -1);                            // too far from it
    assert.equal(findOpening(WORDS, 300_000, 'w300 w302 w301 w303 w304 w305'), -1);         // out of order
    assert.equal(findOpening(WORDS, 300_000, ''), -1);
});

test('placePick: from the opening to a whole thought near the end', () => {
    const p = placePick(WORDS, pick({ endMs: 907_000 })) as PlacedPick;
    assert.equal(p.startMs, 300_000 - 120);
    assert.equal(p.endMs, 909_600 + 300);    // the sentence ending at word 909
    assert.equal(p.title, 'A topic');
});

test('placePick: the start stays at the opening, even with a sentence starting nearby', () => {
    // Word 304 starts no sentence; the nearest that does is word 300, but the clip opens where its words were found.
    const p = placePick(WORDS, pick({ startMs: 304_000, opening: opening(304) })) as PlacedPick;
    assert.equal(p.startMs, 304_000 - 120);
});

test('placePick: an opening not in the final cut is unverified; too short or long is left out', () => {
    assert.equal(placePick(WORDS, pick({ opening: 'words nobody said at all here' })), 'unverified');
    assert.equal(placePick(WORDS, pick({ endMs: 360_000 })), null);           // a minute
    assert.equal(placePick(WORDS, pick({ endMs: 300_000 + 25 * MIN })), null); // 25 minutes
});

test('placePick: cleans what Claude wrote', () => {
    const p = placePick(WORDS, pick({ title: '  A  <topic>  ', score: 14 })) as PlacedPick;
    assert.equal(p.title, 'A topic');
    assert.equal(p.score, 10);
});

test('rankClipPicks: best first, standing alone breaks a tie, no two overlapping by over half, at most the count', () => {
    const base = { title: 't', opening: 'o', reason: 'r', standsAlone: true };
    const ranked = rankClipPicks([
        { ...base, startMs: 0, endMs: 10 * MIN, score: 7 },
        { ...base, startMs: 2 * MIN, endMs: 12 * MIN, score: 9 },              // overlaps the first by 8 of 10 minutes
        { ...base, startMs: 20 * MIN, endMs: 30 * MIN, score: 7, standsAlone: false },
        { ...base, startMs: 30 * MIN, endMs: 40 * MIN, score: 7 },
    ]);
    assert.deepEqual(ranked.map(r => r.startMs), [2 * MIN, 30 * MIN, 20 * MIN]);
    const many = Array.from({ length: 12 }, (_, i) => ({ ...base, startMs: i * 10 * MIN, endMs: i * 10 * MIN + 5 * MIN, score: 5 }));
    assert.equal(rankClipPicks(many).length, CLIP_PICK_COUNT);
});

test('isTakenClip and suggestionToClip', () => {
    const s = { id: 'abcd1234', startMs: 5 * MIN, endMs: 15 * MIN, title: 't', score: 8, opening: 'o', reason: 'r', standsAlone: true };
    assert.equal(ClipSuggestionSchema.safeParse(s).success, true);
    assert.equal(isTakenClip(s, [{ startMs: 6 * MIN, endMs: 14 * MIN }]), true);
    assert.equal(isTakenClip(s, [{ startMs: 14 * MIN, endMs: 24 * MIN }]), false);
    const clip = suggestionToClip(s, 'efgh5678');
    assert.deepEqual(clip.source, { kind: 'pick', id: 'abcd1234' });
    assert.equal(ClipEditSchema.safeParse(clip).success, true);
});

test('clipPickInstructions: the count, the chapters as hints, the direction when given', () => {
    const text = clipPickInstructions(10, [{ title: 'Opening', startMs: 0 }, { title: 'The vision', startMs: 600_000 }], '  stories please ');
    assert.match(text, /up to 10 topics/);
    assert.match(text, /\[600000ms\] The vision/);
    assert.match(text, /Direction from the producer: stories please$/);
    assert.doesNotMatch(clipPickInstructions(10, [], ''), /chapters|Direction/);
});
