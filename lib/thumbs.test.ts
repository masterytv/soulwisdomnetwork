// Spec 020 item E2: the timeline's picture strip, a frame every 5 s on sheets of a hundred.
// Run: npx tsx --test lib/thumbs.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THUMBS, thumbAt, thumbCount, ThumbIndexSchema } from './thumbs';

const index = { ...THUMBS, count: 250 };

test('a frame every 5 s, from the start to the end', () => {
    assert.equal(thumbCount(180_000), 36);
    assert.equal(thumbCount(180_001), 37);
    assert.equal(thumbCount(1), 1);
    assert.equal(thumbCount(0), 0);
});

test('the frame nearest a moment, on its sheet', () => {
    assert.deepEqual(thumbAt(index, 0), { sheet: 0, x: 0, y: 0 });
    assert.deepEqual(thumbAt(index, 7_600), { sheet: 0, x: 320, y: 0 });       // nearest 10 s: frame 2
    assert.deepEqual(thumbAt(index, 5_000 * 13), { sheet: 0, x: 480, y: 90 });  // frame 13: row 1, column 3
    assert.deepEqual(thumbAt(index, 5_000 * 123), { sheet: 1, x: 480, y: 180 }); // frame 123: sheet 1, row 2, column 3
    assert.deepEqual(thumbAt(index, 99_999_999), { sheet: 2, x: 9 * 160, y: 4 * 90 }); // past the end: the last frame, 249
    assert.deepEqual(thumbAt(index, -50), { sheet: 0, x: 0, y: 0 });
    assert.equal(thumbAt({ ...index, count: 0 }, 1000), null);
});

test('the index file is checked when read', () => {
    assert.ok(ThumbIndexSchema.safeParse({ ...index, sheets: ['a.jpg', 'b.jpg', 'c.jpg'] }).success);
    assert.ok(!ThumbIndexSchema.safeParse({ ...index, count: -1, sheets: [] }).success);
    assert.ok(!ThumbIndexSchema.safeParse({ ...index }).success);
});
