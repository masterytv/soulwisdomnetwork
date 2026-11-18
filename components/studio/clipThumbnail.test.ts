// The "Soul Wisdom Clips" thumbnail's layout (docs/specs/025-clips.md, step 4): the speaker on the side they face, as
// large as fits on the bottom edge; the title in the other side, clear of YouTube's time stamp; centred with no one.
// Run: npx tsx --test components/studio/clipThumbnail.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipThumbLayout, STAMP } from './clipThumbnail';
import { THUMB_HEIGHT as H, THUMB_WIDTH as W } from '@/lib/thumbnail';

const overlaps = (a: { x: number; w: number }, b: { x: number; w: number }) => a.x < b.x + b.w && b.x < a.x + a.w;

test('a tall cut-out on the right: on the bottom edge, nearly full height, the title on the left beside it', () => {
    const l = clipThumbLayout({ width: 500, height: 900 }, 'right');
    assert.ok(l.speaker);
    assert.equal(l.speaker.y + l.speaker.h, H);
    assert.ok(l.speaker.h >= H * 0.94 && l.speaker.x + l.speaker.w <= W);
    assert.ok(l.title.x + l.title.w <= l.speaker.x, 'the title stays beside the speaker');
    assert.equal(l.align, 'left');
    assert.ok(l.title.y + l.title.h <= STAMP.y, 'the title stays above the time stamp');
});

test('on the left: the title on the right, ending clear of the right edge', () => {
    const l = clipThumbLayout({ width: 500, height: 900 }, 'left');
    assert.equal(l.speaker!.x, 24);
    assert.ok(l.title.x >= l.speaker!.x + l.speaker!.w);
    assert.ok(l.title.x + l.title.w <= W - 60);
    assert.equal(l.align, 'right');
});

test('a wide cut-out (two people) is held to 55% of the width; the title keeps at least 40%', () => {
    const l = clipThumbLayout({ width: 1800, height: 700 }, 'right');
    assert.ok(l.speaker!.w <= W * 0.55 + 1);
    // The title keeps its 40% and is drawn over the cut-out's inner edge, which is the speaker's side, not their face.
    assert.equal(l.title.w, W * 0.4);
    assert.ok(overlaps(l.title, l.speaker!));
});

test('a small cut-out is enlarged, but not past two and a half times', () => {
    const l = clipThumbLayout({ width: 200, height: 250 }, 'right');
    assert.equal(l.speaker!.h, 625);
});

test('no one to cut out: the title alone, centred, clear of the time stamp', () => {
    const l = clipThumbLayout(null, 'right');
    assert.equal(l.speaker, null);
    assert.equal(l.align, 'center');
    assert.equal(l.title.x + l.title.w / 2, W / 2);
    assert.ok(l.title.y + l.title.h <= STAMP.y);
});
