// Spec 020 item E2, the Studio editor's timeline: zoom and scroll, ruler ticks, click positions,
// speaker turns and colours, snapping, and dragging a cut's edges (spec 019 item 2.2).
// Run: npx tsx --test lib/timeline.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Cut } from './edit';
import {
    clampScroll, clampToWords, clampZoom, cutAt, edgeAt, edgeLimits, fitPxPerMs, keptWords, MAX_PX_PER_MS, MIN_CUT_MS, moveCutEdge,
    msAt, nearest, pct, preciseTime, rangeOf, removedRanges, snapMs, SPEAKER_COLORS, speakerBlocks, speakerColors, stepFor, tickLabel,
    ticks, ticksBetween, tickStep, tickText, wordEdges, zoomAround,
    timelineAxis, dropPosition, playedAxis, pieceEdgeAt, hiddenAt, rippleLimits, rippleTrim, uncut, joinMarks, MIN_PIECE_MS,
} from './timeline';
import { playOrder } from './sequence';

test('zoom: from the whole recording to 2 ms a pixel, around a fixed point', () => {
    assert.equal(fitPxPerMs(3_600_000, 1800), 0.0005);
    assert.equal(fitPxPerMs(0, 1800), MAX_PX_PER_MS);
    assert.equal(clampZoom(0.0001, 0.0005), 0.0005);         // never further out than the whole recording
    assert.equal(clampZoom(3, 0.0005), MAX_PX_PER_MS);        // never closer than 2 ms a pixel
    assert.equal(clampZoom(0.01, 0.0005), 0.01);
    assert.equal(clampZoom(0.1, 2), MAX_PX_PER_MS);           // a short clip: as close as allowed
    // Zooming in twice around x = 300 keeps the moment under it in place.
    const scroll = zoomAround(0.01, 0.02, 1000, 300);
    assert.equal((scroll + 300) / 0.02, (1000 + 300) / 0.01);
    assert.equal(clampScroll(-50, 60_000, 0.1, 1000), 0);
    assert.equal(clampScroll(9_000, 60_000, 0.1, 1000), 5000);
});

test('ruler: at least 80 pixels between labels, down to hundredths of a second', () => {
    assert.equal(tickStep(3_600_000, 1000), 300_000);      // an hour across 1000 px: every 5 minutes
    assert.equal(tickStep(3_600_000, 16_000), 30_000);     // zoomed in 16 times: every 30 seconds
    assert.equal(tickStep(60_000, 1000), 5000);            // a minute: every 5 seconds
    assert.equal(tickStep(10_000_000, 100), 3_600_000);    // never wider than an hour
    assert.equal(tickStep(0, 1000), 3_600_000);
    assert.equal(stepFor(MAX_PX_PER_MS), 200);             // closest zoom: every 0.2 s
    assert.equal(stepFor(8), 10);
    assert.equal(stepFor(0), 3_600_000);
    assert.deepEqual(ticks(60_000, 1000), [0, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 55000, 60000]);
    assert.deepEqual(ticks(0, 1000), []);
    assert.deepEqual(ticksBetween(1_150, 1_700, 200), [1200, 1400, 1600]);
    assert.deepEqual(ticksBetween(-500, 300, 200), [0, 200]);
    assert.equal(tickLabel(65_000), '1:05');
    assert.equal(tickLabel(3_725_000), '1:02:05');
    assert.equal(tickText(65_400, 1000), '1:05');
    assert.equal(tickText(65_400, 200), '1:05.4');
    assert.equal(tickText(65_430, 20), '1:05.43');
    assert.equal(preciseTime(65_004.6), '1:05.00');
});

test('positions: percentages and clicks stay inside the recording', () => {
    assert.equal(pct(30_000, 60_000), 50);
    assert.equal(pct(-5, 60_000), 0);
    assert.equal(pct(90_000, 60_000), 100);
    assert.equal(pct(10, 0), 0);
    assert.equal(msAt(250, 1000, 60_000), 15_000);
    assert.equal(msAt(-20, 1000, 60_000), 0);
    assert.equal(msAt(1200, 1000, 60_000), 60_000);
    assert.equal(msAt(10, 0, 60_000), 0);
});

test('speaker turns and colours', () => {
    const w = (speaker: string, start: number, end: number) => ({ speaker, start, end, text: 'x' });
    const blocks = speakerBlocks([w('Ana', 0, 400), w('Ana', 500, 900), w('Ben', 1000, 1500), w('Ana', 2000, 2600)]);
    assert.deepEqual(blocks, [
        { speaker: 'Ana', startMs: 0, endMs: 900 },
        { speaker: 'Ben', startMs: 1000, endMs: 1500 },
        { speaker: 'Ana', startMs: 2000, endMs: 2600 },
    ]);
    assert.deepEqual(speakerBlocks([]), []);
    assert.deepEqual(speakerColors(blocks), { Ana: SPEAKER_COLORS[0], Ben: SPEAKER_COLORS[1] });
    const many = Array.from({ length: 9 }, (_, i) => ({ speaker: `S${i}`, startMs: i, endMs: i + 1 }));
    assert.equal(speakerColors(many).S8, SPEAKER_COLORS[0]);
});

test('snapping: to the nearest target within reach, otherwise to 10 ms', () => {
    assert.equal(nearest([100, 200, 300], 240), 200);
    assert.equal(nearest([100, 200, 300], 260), 300);
    assert.equal(nearest([100, 200, 300], 5), 100);
    assert.equal(nearest([100, 200, 300], 999), 300);
    assert.equal(nearest([], 5), undefined);
    const words = [{ start: 1000, end: 1400 }, { start: 1500, end: 1900 }];
    assert.deepEqual(wordEdges(words), [1000, 1400, 1500, 1900]);
    // A playhead at 1455, word edges, and nothing else: 1450 snaps to the playhead (5 ms away)
    // rather than the word end (50 ms away).
    assert.deepEqual(snapMs(1450, [[1455], wordEdges(words)], 60), { ms: 1455, to: 1455 });
    assert.deepEqual(snapMs(1430, [[], wordEdges(words)], 40), { ms: 1400, to: 1400 });
    assert.deepEqual(snapMs(1444, [[], wordEdges(words)], 40), { ms: 1440, to: null });   // out of reach: 10 ms steps
});

// Words: "so" 0–300, "um" 400–600 (cut, a filler), "we" 700–900, "went" 1500–1900.
const words = [
    { text: 'so', start: 0, end: 300 }, { text: 'um', start: 400, end: 600 },
    { text: 'we', start: 700, end: 900 }, { text: 'went', start: 1500, end: 1900 },
];
const filler: Cut = { startMs: 400, endMs: 600, reason: 'filler' };
const pause: Cut = { startMs: 1000, endMs: 1400, reason: 'pause' };
const cuts = [filler, pause];

test('cuts on the timeline: what is taken out, the cut under the pointer, the edge under the pointer', () => {
    assert.deepEqual(removedRanges([{ startMs: 0, endMs: 440 }, { startMs: 560, endMs: 1000 }], 1200),
        [{ startMs: 440, endMs: 560 }, { startMs: 1000, endMs: 1200 }]);
    assert.deepEqual(removedRanges([], 500), [{ startMs: 0, endMs: 500 }]);
    const inner: Cut = { startMs: 1100, endMs: 1200, reason: 'manual' };
    assert.equal(cutAt([...cuts, inner], 1150), inner);       // the shortest wins
    assert.equal(cutAt(cuts, 1450), undefined);
    assert.deepEqual(edgeAt(cuts, 1010, 20), { cut: pause, edge: 'start' });
    assert.equal(edgeAt(cuts, 800, 20), null);
    // Two touching cuts: the side of the pointer decides.
    const a: Cut = { startMs: 0, endMs: 500, reason: 'manual' }, b: Cut = { startMs: 500, endMs: 900, reason: 'manual' };
    assert.deepEqual(edgeAt([a, b], 495, 20), { cut: a, edge: 'end' });
    assert.deepEqual(edgeAt([a, b], 505, 20), { cut: b, edge: 'start' });
});

test('cut edges keep clear of the words that are heard, unless Alt frees them', () => {
    // Without the pause cut, every word but "um" is heard.
    const kept = keptWords(words, cuts, pause);
    assert.deepEqual(kept.map(w => w.text), ['so', 'we', 'went']);
    // The pause's start may go back to the end of "we", its end up to the start of "went".
    assert.deepEqual(edgeLimits(pause, 'start', kept, 5000), [900, 1400 - MIN_CUT_MS]);
    assert.deepEqual(edgeLimits(pause, 'end', kept, 5000), [1000 + MIN_CUT_MS, 1500]);
    // The filler's start may go back to the end of "so"; its end up to the start of "we".
    const keptForFiller = keptWords(words, cuts, filler);
    assert.deepEqual(keptForFiller.map(w => w.text), ['so', 'um', 'we', 'went']);
    assert.deepEqual(edgeLimits(filler, 'start', keptForFiller, 5000), [300, 600 - MIN_CUT_MS]);
    assert.deepEqual(edgeLimits(filler, 'end', keptForFiller, 5000), [400 + MIN_CUT_MS, 700]);
    // Dragged past a limit: held at it. Into a word: out to its nearer edge.
    assert.equal(clampToWords(700, kept, [900, 1390]), 900);
    assert.equal(clampToWords(1200, kept, [900, 1390]), 1200);
    // Shrinking the filler from the left into "um" itself: "um" becomes heard, so the edge leaves it.
    assert.equal(clampToWords(450, keptForFiller, [300, 590]), 400);
    assert.equal(clampToWords(560, keptForFiller, [300, 590]), 400);   // the nearer edge, 600, is past the limit
    // A word wider than the limits leaves the edge where it is.
    assert.equal(clampToWords(150, [{ start: 0, end: 300 }], [100, 200]), 150);
});

test('moving an edge makes the cut your own, and a cut never shrinks below 10 ms', () => {
    const moved = moveCutEdge(cuts, pause, 'start', 950.4);
    assert.deepEqual(moved, [filler, { startMs: 950, endMs: 1400, reason: 'manual' }]);
    assert.equal(moved[0], filler);                              // the others are untouched
    assert.deepEqual(moveCutEdge(cuts, pause, 'end', 900)[1], { startMs: 1000, endMs: 1000 + MIN_CUT_MS, reason: 'manual' });
    assert.deepEqual(moveCutEdge(cuts, filler, 'start', -40)[0], { startMs: 0, endMs: 600, reason: 'manual' });
    assert.deepEqual(rangeOf(1300, 1250.6, 5000), { startMs: 1251, endMs: 1300 });
    assert.deepEqual(rangeOf(4990, 6000, 5000), { startMs: 4990, endMs: 5000 });
    assert.equal(rangeOf(100, 105, 5000), null);
});

// ---- Sections in play order (spec 020 item E11) ----

test('the timeline axis: in the recording\'s order, every moment where it always was', () => {
    const a = timelineAxis([10_000, 30_000], null, 60_000);
    assert.equal(a.moved, false);
    assert.equal(a.pieces.length, 3);
    assert.equal(a.toView(12_345), 12_345);
    assert.equal(a.toSrc(45_000), 45_000);
    assert.deepEqual(a.spans(5_000, 35_000), [{ fromMs: 5_000, toMs: 35_000 }]);
});

test('the timeline axis: sections laid out in play order, whole', () => {
    // Sections 0–10 s, 10–30 s and 30–60 s, played third, first, second.
    const a = timelineAxis([10_000, 30_000], [2, 0, 1], 60_000);
    assert.equal(a.moved, true);
    assert.deepEqual(a.pieces.map(p => [p.section, p.viewStart]), [[2, 0], [0, 30_000], [1, 40_000]]);
    assert.equal(a.toView(31_000), 1_000);
    assert.equal(a.toView(5_000), 35_000);
    assert.equal(a.toView(10_000), 40_000);       // a split belongs to the section it starts
    assert.equal(a.toSrc(35_000), 5_000);
    assert.equal(a.toSrc(59_999), 29_999);
    for (const ms of [0, 9_999, 10_000, 29_999, 30_000, 59_999]) assert.equal(a.toSrc(a.toView(ms)), ms);
    // A stretch across a split is drawn in two places.
    assert.deepEqual(a.spans(8_000, 12_000), [{ fromMs: 38_000, toMs: 40_000 }, { fromMs: 40_000, toMs: 42_000 }]);
    // An order that does not fit the splits is the recording's.
    assert.equal(timelineAxis([10_000], [2, 0, 1], 60_000).moved, false);
});

test('where a dragged section lands', () => {
    const a = timelineAxis([10_000, 30_000], null, 60_000);   // 0–10, 10–30, 30–60
    assert.equal(dropPosition(a, 0, 59_000), 2);   // the first, dropped late in the last: last
    assert.equal(dropPosition(a, 0, 35_000), 1);   // into the last's first half: before it
    assert.equal(dropPosition(a, 2, 1_000), 0);    // the last, dropped in the first's first half: first
    assert.equal(dropPosition(a, 2, 8_000), 1);    // its second half: after it
    assert.equal(dropPosition(a, 1, 12_000), 1);   // over itself: where it was
});

// ---- Only what plays (spec 020 item E13) ----

// What plays of an edit, as the timeline closes it up.
const played = (cuts: Cut[], splits: number[] = [], order: number[] | null = null, total = 60_000) =>
    playedAxis(playOrder({ cuts, splits, order }, total), splits, order, total);
const kept = (cuts: Cut[], splits: number[] = [], total = 60_000) => played(cuts, splits, null, total).pieces.map(p => [p.srcStart, p.srcEnd]);

test('only what plays: the kept stretches end to end, divided at the splits', () => {
    const a = played([{ startMs: 10_000, endMs: 12_000, reason: 'filler' }, { startMs: 30_000, endMs: 31_000, reason: 'manual' }], [20_000]);
    assert.equal(a.collapsed, true);
    assert.equal(a.reordered, false);
    // Each kept stretch is heard 40 ms into the cuts either side of it.
    assert.deepEqual(a.pieces.map(p => [p.srcStart, p.srcEnd, p.viewStart, p.section]), [
        [0, 10_040, 0, 0], [11_960, 20_000, 10_040, 0], [20_000, 30_040, 18_080, 1], [30_960, 60_000, 28_120, 1],
    ]);
    assert.equal(a.lengthMs, 57_160);
    assert.deepEqual(a.sections.map(s => [s.section, s.viewStart, s.viewEnd]), [[0, 0, 18_080], [1, 18_080, 57_160]]);
    // Kept moments where they play; a cut one where its cut closed up.
    assert.equal(a.toView(5_000), 5_000);
    assert.equal(a.toView(12_000), 10_080);
    assert.equal(a.toView(11_000), 10_040);
    assert.equal(a.toSrc(10_040), 11_960);         // at a join: the stretch after it
    assert.equal(a.toSrc(10_039), 10_039);
    assert.equal(a.toSrc(99_999), 60_000);
    // A cut is drawn nowhere; a stretch across one, as the kept parts either side.
    assert.deepEqual(a.spans(10_500, 11_500), []);
    assert.deepEqual(a.spans(9_000, 13_000), [{ fromMs: 9_000, toMs: 10_040 }, { fromMs: 10_040, toMs: 11_080 }]);
    // How far each end reaches: to the kept stretch of its section beside it, or to the split.
    assert.deepEqual(a.pieces.map(p => [p.reachStart, p.reachEnd, p.mergeStart, p.mergeEnd]), [
        [0, 11_960, false, true], [10_040, 20_000, true, false], [20_000, 30_960, false, true], [30_040, 60_000, true, false],
    ]);
    assert.deepEqual(hiddenAt(a.pieces[0], 'end'), { startMs: 10_040, endMs: 11_960 });
    assert.equal(hiddenAt(a.pieces[1], 'end'), null);
});

test('only what plays: a section cut whole, a cut at the start, and sections in another order', () => {
    const a = played([{ startMs: 0, endMs: 2_000, reason: 'pause' }, { startMs: 20_000, endMs: 40_000, reason: 'manual' }], [20_000, 40_000]);
    // The 40 ms either side of a section cut whole play with the sections beside it, as the render plays them.
    assert.deepEqual(a.pieces.map(p => [p.srcStart, p.srcEnd, p.section]), [[1_960, 20_040, 0], [39_960, 60_000, 2]]);
    assert.deepEqual(a.sections.map(s => [s.viewStart, s.viewEnd]), [[0, 18_080], [18_080, 18_080], [18_080, 38_120]]);
    assert.equal(a.toView(30_000), 18_080);         // in the section cut whole: where it would play
    assert.deepEqual(rippleLimits(a.pieces[0], 'end'), [1_960 + MIN_PIECE_MS, 20_040]);
    assert.equal(a.toView(500), 0);
    assert.deepEqual(hiddenAt(a.pieces[0], 'start'), { startMs: 0, endMs: 1_960 });

    const b = played([{ startMs: 5_000, endMs: 6_000, reason: 'filler' }], [20_000], [1, 0]);
    assert.equal(b.reordered, true);
    assert.deepEqual(b.pieces.map(p => [p.srcStart, p.srcEnd, p.viewStart]), [[20_000, 60_000, 0], [0, 5_040, 40_000], [5_960, 20_000, 45_040]]);
    assert.equal(b.toView(1_000), 41_000);
    assert.equal(dropPosition(b, 1, 1_000), 0);
    // Everything cut: nothing to draw.
    const none = played([{ startMs: 0, endMs: 60_000, reason: 'manual' }]);
    assert.deepEqual([none.pieces.length, none.lengthMs, none.toView(30_000), none.toSrc(10)], [0, 0, 0, 0]);
});

test('the end of a kept stretch under the pointer, on its side of the join', () => {
    const a = played([{ startMs: 10_000, endMs: 12_000, reason: 'filler' }]);   // joins at 10 040
    assert.deepEqual(pieceEdgeAt(a, 10_035, 10), { index: 0, edge: 'end' });
    assert.deepEqual(pieceEdgeAt(a, 10_045, 10), { index: 1, edge: 'start' });
    assert.deepEqual(pieceEdgeAt(a, 10_040, 10), { index: 1, edge: 'start' });
    assert.deepEqual(pieceEdgeAt(a, 5, 10), { index: 0, edge: 'start' });
    assert.equal(pieceEdgeAt(a, 5_000, 10), null);
    assert.deepEqual(rippleLimits(a.pieces[0], 'end'), [MIN_PIECE_MS, 11_960]);
    assert.deepEqual(rippleLimits(a.pieces[1], 'start'), [10_040, 60_000 - MIN_PIECE_MS]);
});

test('ripple trim: dragged out it brings back what was cut, dragged in it cuts, and the edge ends where it was dropped', () => {
    const filler: Cut = { startMs: 10_000, endMs: 12_000, reason: 'filler' };
    const a = played([filler]);
    const [left, right] = a.pieces;
    // Out, part of the way: the cut gets shorter, as the producer's own.
    assert.deepEqual(rippleTrim([filler], left, 'end', 10_500, 60_000), [{ startMs: 10_460, endMs: 12_000, reason: 'manual' }]);
    assert.deepEqual(kept(rippleTrim([filler], left, 'end', 10_500, 60_000)), [[0, 10_500], [11_960, 60_000]]);
    assert.deepEqual(kept(rippleTrim([filler], right, 'start', 11_000, 60_000)), [[0, 10_040], [11_000, 60_000]]);
    // Out all the way: the cut goes and the two stretches are one.
    assert.deepEqual(rippleTrim([filler], left, 'end', 99_000, 60_000), []);
    assert.deepEqual(rippleTrim([filler], right, 'start', 0, 60_000), []);
    // In: a cut of the producer's own, the words in it too; dragged back out, it comes back.
    const cutIn = rippleTrim([filler], left, 'end', 8_000, 60_000);
    assert.deepEqual(kept(cutIn), [[0, 8_000], [11_960, 60_000]]);
    const back = played(cutIn).pieces[0];
    assert.deepEqual(kept(rippleTrim(cutIn, back, 'end', 9_000, 60_000)), [[0, 9_000], [11_960, 60_000]]);
    assert.deepEqual(rippleTrim(cutIn, back, 'end', 11_960, 60_000), []);
    assert.deepEqual(kept(rippleTrim([filler], right, 'start', 15_000, 60_000)), [[0, 10_040], [15_000, 60_000]]);
    // Never shorter than MIN_PIECE_MS, never past its reach.
    assert.deepEqual(kept(rippleTrim([filler], left, 'end', 0, 60_000)), [[0, MIN_PIECE_MS], [11_960, 60_000]]);
    // Bringing back keeps every other cut as it was.
    const pause: Cut = { startMs: 30_000, endMs: 31_000, reason: 'pause' };
    assert.deepEqual(rippleTrim([filler, pause], left, 'end', 11_960, 60_000), [pause]);
});

test('ripple trim at a split, and at the ends of the recording', () => {
    // The end of the first section is cut, across the split; the second section starts with what is kept.
    const tail: Cut = { startMs: 15_000, endMs: 25_000, reason: 'manual' };
    const a = played([tail], [20_000]);
    assert.deepEqual(a.pieces.map(p => [p.srcStart, p.srcEnd]), [[0, 15_040], [24_960, 60_000]]);
    // Out to the split: the first section plays to its end, the second starts where it did.
    assert.deepEqual(kept(rippleTrim([tail], a.pieces[0], 'end', 20_000, 60_000), [20_000]), [[0, 20_000], [24_960, 60_000]]);
    assert.deepEqual(kept(rippleTrim([tail], a.pieces[1], 'start', 20_000, 60_000), [20_000]), [[0, 15_040], [20_000, 60_000]]);
    // In from a split: each side ends where it was dropped, and the other side is untouched.
    const b = played([], [20_000]);
    assert.deepEqual(kept(rippleTrim([], b.pieces[0], 'end', 18_000, 60_000), [20_000]), [[0, 18_000], [20_000, 60_000]]);
    assert.deepEqual(kept(rippleTrim([], b.pieces[1], 'start', 22_000, 60_000), [20_000]), [[0, 20_000], [22_000, 60_000]]);
    // The start and end of the recording.
    const c = played([]);
    assert.deepEqual(kept(rippleTrim([], c.pieces[0], 'start', 3_000, 60_000)), [[3_000, 60_000]]);
    assert.deepEqual(kept(rippleTrim([], c.pieces[0], 'end', 57_000, 60_000)), [[0, 57_000]]);
    const d = played(rippleTrim([], c.pieces[0], 'start', 3_000, 60_000));
    assert.deepEqual(kept(rippleTrim(rippleTrim([], c.pieces[0], 'start', 3_000, 60_000), d.pieces[0], 'start', 0, 60_000)), [[0, 60_000]]);
});

test('bringing back a stretch of time', () => {
    const cuts: Cut[] = [{ startMs: 0, endMs: 1_000, reason: 'filler' }, { startMs: 2_000, endMs: 3_000, reason: 'pause' }, { startMs: 5_000, endMs: 6_000, reason: 'filler' }];
    assert.deepEqual(uncut(cuts, 500, 2_500), [{ startMs: 0, endMs: 500, reason: 'manual' }, { startMs: 2_500, endMs: 3_000, reason: 'manual' }, cuts[2]]);
    assert.equal(uncut(cuts, 4_000, 4_000), cuts);
});

test('where something is cut on a closed-up timeline, and whose cut it is', () => {
    const a = played([
        { startMs: 10_000, endMs: 12_000, reason: 'filler' },
        { startMs: 11_000, endMs: 13_000, reason: 'pause' },
        { startMs: 30_000, endMs: 31_000, reason: 'manual' },
        { startMs: 0, endMs: 1_000, reason: 'pause' },
    ], [40_000]);
    assert.deepEqual(joinMarks(a, [
        { startMs: 10_000, endMs: 12_000, reason: 'filler' },
        { startMs: 11_000, endMs: 13_000, reason: 'pause' },
        { startMs: 30_000, endMs: 31_000, reason: 'manual' },
        { startMs: 0, endMs: 1_000, reason: 'pause' },
    ]).map(m => [m.viewMs, m.startMs, m.endMs, m.suggested]), [
        [0, 0, 960, true],
        [9_080, 10_040, 12_960, true],
        [26_160, 30_040, 30_960, false],
    ]);
});
