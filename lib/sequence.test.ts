// Spec 020 item E3: the edit as a sequence. What plays in order and where each moment lands, the
// same as the kept ranges today, and following a stretch that starts early (as a transition will
// make it, item E4).
// Run: npx tsx --test lib/sequence.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyToChapters, applyToQuotes, editedDuration, editedTime, editedWords, keepRanges, type Cut } from './edit';
import { placeOverlays } from './onScreen';
import { playOrder, sequenceLength, sourceTime, timelineTime, type Clip } from './sequence';

const cuts: Cut[] = [{ startMs: 2000, endMs: 3000, reason: 'manual' }, { startMs: 6000, endMs: 7000, reason: 'pause' }];

test('the play order is the kept ranges, back to back', () => {
    const clips = playOrder({ cuts }, 10_000);
    const ranges = keepRanges(10_000, cuts);
    assert.deepEqual(clips.map(c => ({ startMs: c.startMs, endMs: c.endMs })), ranges);
    assert.deepEqual(clips.map(c => c.atMs), [0, 2040, 5120]);
    assert.equal(sequenceLength(clips), editedDuration(ranges));
    // Splits alone change nothing that plays.
    assert.deepEqual(playOrder({ cuts, splits: [1000, 4500] }, 10_000), clips);
    assert.deepEqual(playOrder({ cuts: [] }, 0), []);
});

test('times map as they always have', () => {
    const clips = playOrder({ cuts }, 10_000);
    const ranges = keepRanges(10_000, cuts);
    for (const ms of [0, 1500, 2040, 2500, 3500, 5999, 6500, 9000, 10_000, 12_000]) {
        assert.equal(timelineTime(clips, ms), editedTime(ms, ranges), String(ms));
        assert.equal(timelineTime(clips, ms, true), editedTime(ms, ranges, true), String(ms));
    }
    assert.equal(sourceTime(clips, 0), 0);
    assert.equal(sourceTime(clips, 2100), 3020);              // 60 ms into the second stretch (2960–6040)
    assert.equal(sourceTime(clips, sequenceLength(clips)), 10_000);
    assert.equal(sourceTime(clips, sequenceLength(clips) + 1), null);
});

// Two stretches, the second starting 1 s before the first ends, as a 1 s transition would make them.
const overlapped: Clip[] = [{ startMs: 0, endMs: 4000, atMs: 0 }, { startMs: 6000, endMs: 10_000, atMs: 3000 }];

test('a stretch that starts early moves everything after it', () => {
    assert.equal(editedDuration(overlapped), 7000);
    assert.equal(sequenceLength(overlapped), 7000);
    assert.equal(timelineTime(overlapped, 1000), 1000);
    assert.equal(timelineTime(overlapped, 6000), 3000);
    assert.equal(timelineTime(overlapped, 8000), 5000);
    assert.equal(timelineTime(overlapped, 5000), null);
    assert.equal(timelineTime(overlapped, 5000, true), 3000);  // a cut moment: where the next stretch starts
    assert.equal(timelineTime(overlapped, 11_000, true), 7000);
    assert.equal(sourceTime(overlapped, 3500), 3500);           // in the overlap: the earlier stretch
    assert.equal(sourceTime(overlapped, 4500), 7500);
    // Chapters, quotes, words and on-screen items follow.
    assert.deepEqual(applyToChapters([{ startMs: 7000, title: 'Two' }], overlapped), [{ startMs: 4000, title: 'Two' }]);
    assert.deepEqual(applyToQuotes([{ startMs: 6500, endMs: 9000, text: 'q', speaker: 'A' }], overlapped)[0], { startMs: 3500, endMs: 6000, text: 'q', speaker: 'A' });
    assert.deepEqual(editedWords([{ start: 6200, end: 6500 }, { start: 3900, end: 6100 }], overlapped), [{ start: 3200, end: 3500 }]);
    assert.deepEqual(placeOverlays([{ atMs: 9000, seconds: 5 }], overlapped, 7000), [{ overlay: { atMs: 9000, seconds: 5 }, startMs: 6000, endMs: 7000 }]);
});
