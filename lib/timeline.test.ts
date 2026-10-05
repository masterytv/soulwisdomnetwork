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
} from './timeline';

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
