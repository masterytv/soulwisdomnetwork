// Thumbnails (docs/specs/011-thumbnails.md): where the "Host over AI image" cut-out stands.
// Run: npx tsx --test lib/thumbnail.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUTOUT_LAYOUT, cutoutBox, THUMB_HEIGHT, THUMB_KINDS, THUMB_LABELS, THUMB_WIDTH } from './thumbnail';

test('a head-and-shoulders cut-out stands on the bottom edge, on the right, nearly full height', () => {
    const box = cutoutBox(667, 694);
    assert.equal(box.y + box.h, THUMB_HEIGHT);
    assert.equal(box.x + box.w, THUMB_WIDTH - CUTOUT_LAYOUT.right);
    assert.ok(box.h >= THUMB_HEIGHT * 0.9 && box.h <= THUMB_HEIGHT * CUTOUT_LAYOUT.maxHeight + 1);
    assert.ok(box.textWidth >= CUTOUT_LAYOUT.minText);
});

test('two hosts side by side are held to the right part of the picture', () => {
    const box = cutoutBox(1180, 520);
    assert.ok(box.w <= THUMB_WIDTH * CUTOUT_LAYOUT.maxWidth + 1);
    assert.equal(box.y + box.h, THUMB_HEIGHT);
    assert.equal(box.textWidth, CUTOUT_LAYOUT.minText);
});

test('a small cut-out is not blown up past the limit', () => {
    const box = cutoutBox(120, 200);
    assert.equal(box.w, Math.round(120 * CUTOUT_LAYOUT.maxScale));
    assert.equal(box.h, Math.round(200 * CUTOUT_LAYOUT.maxScale));
});

test('every kind has a label', () => {
    for (const kind of THUMB_KINDS) assert.ok(THUMB_LABELS[kind]);
});
