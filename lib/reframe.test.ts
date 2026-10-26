// Spec 021 item M3: the highlight easing engine (the one curve the render's ffmpeg expressions, the
// editor's CSS preview and the templates share) and what the edit route refuses (highlights on cut
// words, on a teaser, or on each other).
// Run: npx tsx --test lib/reframe.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    boxAt, boxStyle, cubicBezierY, easeAt, easeSegments, FULL_FRAME, HIGHLIGHT_LABELS, HIGHLIGHT_LAYOUTS,
    highlightProblems, highlightSpan, LayoutKeyframesSchema, progressAt, type Box, type LayoutKeyframes,
} from './reframe';
import { keepRanges } from './edit';

test('cubicBezierY: the picture curve starts slow, ends fast, and is monotonic', () => {
    assert.equal(cubicBezierY(0), 0);
    assert.equal(cubicBezierY(1), 1);
    assert.equal(cubicBezierY(-0.5), 0);
    assert.equal(cubicBezierY(1.5), 1);
    // cubic-bezier(.65, 0, .25, 1): a slow start (P1 pulls y down) and a fast end (P2 pulls y up).
    assert.ok(cubicBezierY(0.2) < 0.1, `y(0.2) = ${cubicBezierY(0.2)}`);
    assert.ok(cubicBezierY(0.9) > 0.95, `y(0.9) = ${cubicBezierY(0.9)}`);
    let last = 0;
    for (let i = 0; i <= 100; i++) {
        const y = cubicBezierY(i / 100);
        assert.ok(y >= last - 1e-9, `not monotonic at x = ${i / 100}`);
        last = y;
    }
});

test('easeSegments and easeAt: the piecewise table matches the true curve', () => {
    const table = easeSegments();
    assert.equal(table.length, 17);
    assert.equal(table[0], 0);
    assert.equal(table[16], 1);
    // On the grid the table is exact; between points the 16 straight segments stay close to the curve,
    // so the render's expressions and the preview's CSS cannot visibly drift apart.
    for (let i = 0; i <= 16; i++) assert.ok(Math.abs(easeAt(i / 16, table) - cubicBezierY(i / 16)) < 1e-12);
    for (let i = 0; i <= 200; i++) {
        const x = i / 200;
        assert.ok(Math.abs(easeAt(x, table) - cubicBezierY(x)) < 0.02, `off the curve at x = ${x}`);
    }
    assert.equal(easeAt(-1, table), 0);
    assert.equal(easeAt(2, table), 1);
});

const K: LayoutKeyframes = {
    from: FULL_FRAME,
    to: { x: 96, y: 54, scale: 0.55, brightness: 0.5, blur: 8 },
    inMs: 700, outMs: 700,
};

test('progressAt: eased in, held, eased out — and squeezed to fit a short highlight', () => {
    assert.equal(progressAt(K, 0, 6000), 0);
    assert.equal(progressAt(K, 3000, 6000), 1);                 // the hold
    assert.equal(progressAt(K, 6000, 6000), 0);                 // back home at the end
    assert.ok(progressAt(K, 350, 6000) > 0 && progressAt(K, 350, 6000) < 1);
    // Mirrored: the out at 350 ms before the end matches the in at 350 ms.
    assert.ok(Math.abs(progressAt(K, 6000 - 350, 6000) - progressAt(K, 350, 6000)) < 1e-9);
    // A 1 s highlight squeezes the 700 + 700 ms moves to 500 + 500, so the hold still exists as a moment.
    assert.equal(progressAt(K, 500, 1000), 1);
    assert.equal(progressAt(K, 1000, 1000), 0);
    // Through the table it is the same shape within the table's error.
    const table = easeSegments();
    for (const ms of [0, 200, 350, 700, 3000, 5650, 6000]) {
        assert.ok(Math.abs(progressAt(K, ms, 6000, table) - progressAt(K, ms, 6000)) < 0.02, `table drifts at ${ms} ms`);
    }
});

test('boxAt: every number lerped by the same progress; boxStyle turns it into the preview CSS', () => {
    assert.deepEqual(boxAt(K, 0, 6000), FULL_FRAME);
    assert.deepEqual(boxAt(K, 3000, 6000), K.to);
    const mid = boxAt(K, 350, 6000);
    const p = progressAt(K, 350, 6000);
    assert.ok(Math.abs(mid.x - 96 * p) < 1e-9);
    assert.ok(Math.abs(mid.scale - (1 + (0.55 - 1) * p)) < 1e-9);
    assert.ok(Math.abs(mid.blur - 8 * p) < 1e-9);

    const css = boxStyle({ x: 192, y: 108, scale: 0.5, brightness: 1, blur: 0 });
    assert.equal(css.transform, 'translate(10.000%, 10.000%) scale(0.5000)');
    assert.equal(css.transformOrigin, 'top left');
    assert.equal(css.filter, 'none');
    const dim = boxStyle({ ...FULL_FRAME, brightness: 0.5, blur: 8 } as Box);
    assert.equal(dim.filter, 'brightness(0.500) blur(8.0px)');
});

test('LayoutKeyframesSchema: what a template may declare', () => {
    assert.ok(LayoutKeyframesSchema.safeParse(K).success);
    assert.ok(!LayoutKeyframesSchema.safeParse({ ...K, inMs: 50 }).success);               // too quick to see
    assert.ok(!LayoutKeyframesSchema.safeParse({ ...K, to: { ...K.to, scale: 9 } }).success);
    assert.ok(!LayoutKeyframesSchema.safeParse({ ...K, to: { ...K.to, extra: 1 } }).success);
});

// A one-minute recording with 10–20 s cut out, as the route sees it.
const CUTS = [{ id: 'c1', startMs: 10_000, endMs: 20_000, kind: 'manual' as const, reason: 'manual' as const }];
const h = (id: string, srcMs: number, durationMs = 4000) => ({ id, anchor: { srcMs }, durationMs, words: 'the words' });

test('highlightProblems: cut words, teasers and overlaps are refused; a clean set passes', () => {
    const o = { cuts: CUTS, teasers: [{ startMs: 30_000, endMs: 36_000 }], durationMs: 60_000 };
    // Clean: inside a kept stretch, off the teaser.
    assert.equal(highlightProblems([h('a', 2000)], o).size, 0);
    // Starts inside the cut.
    assert.match(highlightProblems([h('b', 12_000)], o).get('b')!, /nothing is kept/);
    // Starts kept but runs into the cut.
    assert.match(highlightProblems([h('c', 8000)], o).get('c')!, /crosses a cut/);
    // Sits on the teaser (that stretch plays twice).
    assert.match(highlightProblems([h('d', 33_000)], o).get('d')!, /teaser/);
    // Two on the same stretch: the later one is flagged, the earlier one stays.
    const pair = highlightProblems([h('e', 5000), h('f', 7000, 2000)], o);
    assert.equal(pair.get('e'), undefined);
    assert.match(pair.get('f')!, /overlaps/);
    // The same two with room between them pass, across the cut.
    assert.equal(highlightProblems([h('g', 2000), h('i', 24_000)], o).size, 0);
});

test('highlightSpan: its place on the edited episode, and null while its words are cut', () => {
    const ranges = keepRanges(60_000, CUTS);
    const span = highlightSpan(h('a', 25_000), ranges, 50_000);
    // 25 000 in the recording is 25 000 − (cut 10 040…19 960) ≈ 15 080 edited.
    assert.ok(span && Math.abs(span.startMs - 15_080) < 2, `start ${span?.startMs}`);
    assert.ok(span && span.endMs - span.startMs === 4000);
    assert.equal(highlightSpan(h('b', 12_000), ranges, 50_000), null);
    // Clipped at the edited end.
    const tail = highlightSpan(h('c', 58_000), ranges, 49_920);
    assert.ok(tail && tail.endMs === 49_920);
});

test('the six layouts each have a label', () => {
    assert.equal(HIGHLIGHT_LAYOUTS.length, 6);
    for (const k of HIGHLIGHT_LAYOUTS) assert.ok(HIGHLIGHT_LABELS[k].length > 2);
});
