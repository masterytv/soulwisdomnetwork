// Spec 020 item E3: the edit as a sequence. What plays in order and where each moment lands, the
// same as the kept ranges today, and following a stretch that starts early (as a transition will
// make it, item E4).
// Run: npx tsx --test lib/sequence.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyToChapters, applyToQuotes, editedDuration, editedTime, editedWords, keepRanges, type Cut } from './edit';
import { layerSpan } from './layers';
import { playOrder, previewRanges, sequenceLength, sequenceOf, sourceTime, timelineTime, type Clip } from './sequence';
import type { Join } from './transitions';

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
    assert.deepEqual(layerSpan({ anchor: { srcMs: 9000 }, durationMs: 5000 }, overlapped, 7000), { startMs: 6000, endMs: 7000 });
});

// Spec 020 item E4: transitions at splits.
const dissolveAt = (atSplit: number, durationMs = 1000, transition: Join['transition'] = 'dissolve'): Join => ({ at: { atSplit }, transition, durationMs });

test('a transition at a split overlaps the parts, so the episode is shorter by its length', () => {
    const seq = sequenceOf({ cuts: [], splits: [5000], joins: [dissolveAt(5000)] }, 10_000);
    assert.deepEqual(seq.clips, [{ startMs: 0, endMs: 5000, atMs: 0, part: 0 }, { startMs: 5000, endMs: 10_000, atMs: 4000, part: 1 }]);
    assert.equal(sequenceLength(seq.clips), 9000);
    assert.deepEqual(seq.joins, [{
        atMs: 4000, durationMs: 1000, transition: 'dissolve', splitMs: 5000, part: 1,
        aFromMs: 4000, aEndMs: 5000, bStartMs: 5000, bUntilMs: 6000,
    }]);
    assert.deepEqual(seq.skipped, {});
    // Times after it come 1 s earlier; times before it stay.
    assert.equal(timelineTime(seq.clips, 4500), 4500);
    assert.equal(timelineTime(seq.clips, 7000), 6000);
    assert.equal(sourceTime(seq.clips, 4500), 4500);          // in the overlap: the earlier part
    assert.equal(sourceTime(seq.clips, 5500), 6500);
    // The preview plays the start of the later part on a second video, so one video skips it.
    assert.deepEqual(previewRanges(seq), [{ startMs: 0, endMs: 5000 }, { startMs: 6000, endMs: 10_000 }]);
    // A cut at the split leaves the transition between what is kept either side.
    assert.equal(sequenceLength(playOrder({ cuts: [], splits: [5000], joins: [dissolveAt(5000, 1000, 'cut')] }, 10_000)), 10_000);
    assert.equal(sequenceLength(playOrder({ cuts: [], splits: [5000] }, 10_000)), 10_000);
});

test('a split inside a cut still joins what is kept on either side', () => {
    const cuts: Cut[] = [{ startMs: 4500, endMs: 5500, reason: 'manual' }];
    const seq = sequenceOf({ cuts, splits: [5000], joins: [dissolveAt(5000, 500)] }, 10_000);
    assert.deepEqual(seq.clips.map(c => [c.startMs, c.endMs, c.atMs, c.part]), [[0, 4540, 0, 0], [5460, 10_000, 4040, 1]]);
    assert.equal(seq.joins[0].aEndMs, 4540);
    assert.equal(seq.joins[0].bStartMs, 5460);
    // Over a cut inside the overlap, the walk counts kept material only.
    const cut2: Cut[] = [{ startMs: 5200, endMs: 5700, reason: 'manual' }];
    const seq2 = sequenceOf({ cuts: cut2, splits: [5000], joins: [dissolveAt(5000, 1000)] }, 10_000);
    assert.equal(seq2.joins[0].bUntilMs, 5660 + (1000 - 240));
    // A split close to the edge of a kept stretch does not leave a sliver.
    const near = sequenceOf({ cuts, splits: [4480], joins: [dissolveAt(4480, 500)] }, 10_000);
    assert.deepEqual(near.clips.map(c => [c.startMs, c.endMs, c.part]), [[0, 4540, 0], [5460, 10_000, 1]]);
});

test('a transition with no room plays as a straight cut, and says why', () => {
    const tooLong = sequenceOf({ cuts: [], splits: [1000], joins: [dissolveAt(1000, 3000)] }, 10_000);
    assert.equal(sequenceLength(tooLong.clips), 10_000);
    assert.deepEqual(tooLong.joins, []);
    assert.match(tooLong.skipped['split:1000'], /straight cut/);
    // Two transitions around a 1 s part: the first takes 0.8 s of it, leaving no room for the second.
    const both = sequenceOf({ cuts: [], splits: [4000, 5000], joins: [dissolveAt(4000, 800), dissolveAt(5000, 800)] }, 10_000);
    assert.equal(both.joins.length, 1);
    assert.equal(sequenceLength(both.clips), 9200);
    assert.ok(both.skipped['split:5000']);
    // Nothing kept between two transitions' splits: the second never plays.
    const empty = sequenceOf({ cuts: [{ startMs: 2500, endMs: 4500, reason: 'manual' }], splits: [3000, 4000], joins: [dissolveAt(3000, 500), dissolveAt(4000, 500)] }, 10_000);
    assert.equal(empty.joins.length, 1);
    assert.equal(empty.joins[0].splitMs, 3000);
    assert.match(empty.skipped['split:4000'], /does not play/);
});

test('chapters, quotes, words and on-screen items follow a transition', () => {
    const clips = playOrder({ cuts: [], splits: [5000], joins: [dissolveAt(5000, 1000, 'fade')] }, 10_000);
    assert.deepEqual(applyToChapters([{ startMs: 8000, title: 'Late' }], clips), [{ startMs: 7000, title: 'Late' }]);
    assert.deepEqual(editedWords([{ start: 6000, end: 6400 }], clips), [{ start: 5000, end: 5400 }]);
    assert.deepEqual(layerSpan({ anchor: { srcMs: 9000 }, durationMs: 2000 }, clips, sequenceLength(clips)), { startMs: 8000, endMs: 9000 });
});

// ─── Moving sections (spec 020 item E9) ──────────────────────────────────────

test('moved sections: the play order, the times in it, and a transition into a moved part', async () => {
    const { moveSection, orderAfterSplit, orderAfterUnsplit, validOrder, editedTime, editedWords } = await import('./edit');
    const { sequenceOf, playStep, previewRanges } = await import('./sequence');
    // Three sections of 10 s (splits at 10 s and 20 s), played third, first, second.
    const edit = { cuts: [], splits: [10_000, 20_000], order: [2, 0, 1] };
    const seq = sequenceOf(edit, 30_000);
    assert.deepEqual(seq.clips.map(c => [c.startMs, c.endMs, c.atMs, c.part]), [[20_000, 30_000, 0, 2], [0, 10_000, 10_000, 0], [10_000, 20_000, 20_000, 1]]);
    // A moment of the recording lands where its section plays; a cut moment rounds to where the next kept one plays.
    assert.equal(editedTime(25_000, seq.clips), 5_000);
    assert.equal(editedTime(3_000, seq.clips), 13_000);
    const cut = sequenceOf({ ...edit, cuts: [{ startMs: 2000, endMs: 4000, reason: 'manual' as const }] }, 30_000);
    assert.equal(editedTime(3_000, cut.clips), null);
    assert.equal(editedTime(3_000, cut.clips, true), cut.clips.find(c => c.startMs >= 4000 - 50 && c.startMs <= 4100)!.atMs);
    // Words come out in the order they are heard.
    const words = [{ text: 'a', start: 1000, end: 1400 }, { text: 'b', start: 21_000, end: 21_400 }];
    assert.deepEqual(editedWords(words, seq.clips).map(w => [w.text, w.start]), [['b', 1000], ['a', 11_000]]);
    // A dissolve at the split the first section played starts at (10 s): into section 1, from section 0 before it.
    const withJoin = sequenceOf({ ...edit, joins: [{ at: { atSplit: 10_000 }, transition: 'dissolve' as const, durationMs: 1000 }] }, 30_000);
    assert.deepEqual(withJoin.joins.map(j => [j.part, j.atMs, j.aEndMs, j.bStartMs]), [[1, 19_000, 10_000, 10_000]]);
    // A transition into the section that now plays first has nothing before it.
    const first = sequenceOf({ ...edit, joins: [{ at: { atSplit: 20_000 }, transition: 'dissolve' as const, durationMs: 1000 }] }, 30_000);
    assert.equal(first.joins.length, 0);
    assert.match(first.skipped['split:20000'], /now plays first/);
    // Without a moved section, everything is as before (the recording's order).
    assert.deepEqual(sequenceOf({ cuts: [], splits: [10_000, 20_000], order: [0, 1, 2] }, 30_000).clips.map(c => c.startMs), [0]);
    // The order helpers.
    assert.equal(validOrder([2, 0, 1], 3), true);
    assert.equal(validOrder([2, 0, 0], 3), false);
    assert.deepEqual(moveSection(null, 3, 2, 0), [2, 0, 1]);
    assert.equal(moveSection([1, 0, 2], 3, 1, 0), null);           // back to the recording's order
    assert.deepEqual(orderAfterSplit([2, 0, 1], [10_000, 20_000], 25_000), [2, 3, 0, 1]);
    assert.deepEqual(orderAfterSplit([2, 0, 1], [10_000, 20_000], 5_000), [3, 0, 1, 2]);
    assert.equal(orderAfterUnsplit([2, 0, 1], [10_000, 20_000], 20_000), null);   // sections 1 and 2 join: the recording's order again
    assert.deepEqual(orderAfterUnsplit([2, 1, 0], [10_000, 20_000], 10_000), [1, 0]);
    // The preview steps through the play order: from the end of the third section to the start of the first.
    const ranges = previewRanges(seq);
    assert.deepEqual(playStep(ranges, 25_000, 0), { index: 0, seekTo: null });
    assert.deepEqual(playStep(ranges, 30_000, 0), { index: 1, seekTo: 0 });
    // The first section runs straight into the second, which plays next: no seek.
    assert.deepEqual(playStep(ranges, 10_010, 1), { index: 2, seekTo: null });
    // At the end of the last in play order (20 s, the start of the third in the recording): the end, not the third again.
    assert.deepEqual(playStep(ranges, 20_010, 2), { index: 2, seekTo: null });
    // Moved by hand into a cut: the next kept moment.
    assert.deepEqual(playStep(previewRanges(cut), 3000, 1), { index: 2, seekTo: cut.clips[2].startMs });
});
