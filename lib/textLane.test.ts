// Text and motion graphics on V3 never overlap (lib/textLane.ts, lib/layers.ts onTextLane and freeStart).
// Run: npx tsx --test lib/textLane.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brollLayer, fillsFrame, freeStart, layerSpan, motionChapter, motionEndScreen, motionGraphics, motionKeyIdea, motionLowerThird, onTextLane, pictureFilter, TEXT_GAP_MS, type Layer } from './layers';
import { keyIdeaAdditions } from './highlights';
import { fitOnLane, keepTextLane, spaceFirstEdit, spaceTextLane } from './textLane';
import type { Clip } from './sequence';

// Ten minutes, nothing cut.
const WHOLE: Clip[] = [{ startMs: 0, endMs: 600_000, atMs: 0 } as Clip];
const EDITED = 600_000;
const spans = (layers: Layer[], clips = WHOLE) => layers.filter(onTextLane).map(l => layerSpan(l, clips, EDITED)!).sort((a, b) => a.startMs - b.startMs);
const apart = (layers: Layer[], clips = WHOLE) => spans(layers, clips).every((s, i, all) => i === 0 || s.startMs >= all[i - 1].endMs + TEXT_GAP_MS - 1);

test('the lane is V3 text and episode graphics; not b-roll, highlights or the end screen', () => {
    assert.equal(onTextLane(motionKeyIdea(1000, 'a', 'b')), true);
    assert.equal(onTextLane(motionEndScreen()), false);
    assert.equal(onTextLane(brollLayer({ index: 0, startMs: 0, durationSeconds: 5, path: 'p' })), false);
});

test('a free start: the nearest, or the first after; none when nothing is long enough', () => {
    const taken = [{ startMs: 10_000, endMs: 16_000 }, { startMs: 20_000, endMs: 26_000 }];
    assert.equal(freeStart(taken, 12_000, 6000), 3500);                  // before the first is nearer than after it
    assert.equal(freeStart(taken, 12_000, 6000, Infinity, true), 26_500); // the gap between is only 3 s
    assert.equal(freeStart(taken, 16_600, 3000), 16_500);
    assert.equal(freeStart([{ startMs: 0, endMs: 9000 }], 0, 6000, 12_000), null);
});

test('dragging a key idea onto a chapter moves it past it; trimming stops short of its neighbour', () => {
    const chapter = motionChapter(100_000, 2, 'Asking whether it\'s real');
    const idea = motionKeyIdea(103_000, 'ADC', 'After-death communication');
    const moved = fitOnLane(idea, [chapter], WHOLE, EDITED, 'move');
    assert.ok(apart([chapter, moved]));
    assert.equal((moved.anchor as { srcMs: number }).srcMs, 107_500);
    // Its end dragged out over the next one stops half a second short.
    const after = motionKeyIdea(120_000, 'NDE', 'Near-death experience');
    const long = { ...motionKeyIdea(110_000, 'x', 'y'), durationMs: 15_000 };
    const trimmed = fitOnLane(long, [after], WHOLE, EDITED, 'end');
    assert.equal(trimmed.durationMs, 9500);
    assert.equal((trimmed.anchor as { srcMs: number }).srcMs, 110_000);
    // Something off the lane is never moved.
    const b = brollLayer({ index: 0, startMs: 100_000, durationSeconds: 5, path: 'p' });
    assert.equal(fitOnLane(b, [chapter], WHOLE, EDITED, 'move'), b);
});

test('the editor keeps the rule for what changed, and leaves the rest where it was', () => {
    const a = motionKeyIdea(100_000, 'a', 'x'), b = motionKeyIdea(200_000, 'b', 'y');
    const before = [a, b];
    assert.equal(keepTextLane(before, before, WHOLE, EDITED), before);
    const pasted = { ...a, id: 'm-copy' };
    const after = keepTextLane(before, [...before, pasted], WHOLE, EDITED);
    assert.deepEqual(after[0], a);
    assert.ok(apart(after));
    const dragged = keepTextLane(before, [a, { ...b, anchor: { srcMs: 102_000 } }], WHOLE, EDITED);
    assert.deepEqual(dragged[0], a);
    assert.ok(apart(dragged));
});

test('on the edited clock: cuts that close a gap still keep them apart', () => {
    // 4 s cut between the banner's end and the lower third's start: they would overlap in the edit.
    const clips: Clip[] = [{ startMs: 0, endMs: 6000, atMs: 0 } as Clip, { startMs: 10_000, endMs: 600_000, atMs: 6000 } as Clip];
    const card = { ...motionChapter(0, 2, 'x'), anchor: { atMs: 0 } } as Layer;
    const third = motionLowerThird(10_500, 'Mikias', false);
    const spaced = spaceTextLane([card, third], clips, 596_000);
    assert.ok(apart(spaced, clips));
    assert.deepEqual(spaced[0], card);
});

test('first set-up: lower thirds wait for chapters too, and the first cuts are counted', () => {
    const words = [{ speaker: 'Tom', start: 1000, end: 1400 }, { speaker: 'Mikias', start: 120_500, end: 121_000 }, { speaker: 'Mikias', start: 599_000, end: 599_500 }];
    const layers = motionGraphics({ title: 'T', show: 'S', words, chapters: [{ title: 'One', startMs: 0 }, { title: 'Two', startMs: 120_000 }], hosts: ['Tom'] });
    assert.ok(apart(layers));
    const cut = spaceFirstEdit({ cuts: [{ startMs: 2000, endMs: 8000 } as never] }, layers, words);
    assert.ok(cut.every(l => !onTextLane(l) || l.anchor));
});

test('suggested key ideas wait for what is on V3, or are left out', () => {
    const chapter = motionChapter(100_000, 2, 'x');
    const added = keyIdeaAdditions([chapter], [
        { term: 'ADC', definition: 'a', startMs: 101_000 },
        { term: 'NDE', definition: 'b', startMs: 101_500 },
    ] as never);
    assert.equal(added.length, 2);
    assert.ok(apart([chapter, ...added]));
    // Nothing free within 20 s of its moment: left out.
    const wall = Array.from({ length: 6 }, (_, i) => motionChapter(200_000 + i * 7500, i + 3, 'x'));
    assert.equal(keyIdeaAdditions(wall, [{ term: 'Z', definition: 'z', startMs: 201_000 }] as never).length, 0);
});

test('full-frame footage fills the frame, cropped at its centre; a smaller picture keeps its shape', () => {
    const footage = brollLayer({ index: 0, startMs: 0, durationSeconds: 5, path: 'p.mp4', kind: 'video', footageSeconds: 9 });
    assert.ok(fillsFrame(footage));
    assert.match(pictureFilter(1, 'v', 'o', footage, { startMs: 0, endMs: 5000 }), /force_original_aspect_ratio=increase.*crop=1920:1080/);
    const small = { ...footage, w: 0.3, place: { x: 0.5, y: 0.5, align: 5 as const } };
    assert.match(pictureFilter(1, 'v', 'o', small, { startMs: 0, endMs: 5000 }), /scale=576:-2/);
});
