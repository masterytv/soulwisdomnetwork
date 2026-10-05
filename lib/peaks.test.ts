// Spec 019 item 2.1 (built in spec 020 item E2): the waveform's peaks, as made at ingest and read
// by the timeline.
// Run: npx tsx --test lib/peaks.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnPeaks, decodePeak, encodePeak, PEAKS_BUCKET_MS, PEAKS_SAMPLE_RATE, PeaksBuilder, peakLevels } from './peaks';

test('µ-law bytes: full scale is 127, silence 0, quiet sounds keep detail, and they decode back', () => {
    assert.equal(encodePeak(1), 127);
    assert.equal(encodePeak(-1), -127);
    assert.equal(encodePeak(0), 0);
    assert.equal(encodePeak(2), 127);                       // clipped
    // A breath at −40 dBFS is about a fifth of the height, not one step of 127.
    const breath = encodePeak(0.01);
    assert.ok(breath >= 20 && breath <= 35, String(breath));
    for (const x of [0.001, 0.01, 0.1, 0.5, -0.3]) assert.ok(Math.abs(decodePeak(encodePeak(x)) - x) <= Math.abs(x) * 0.05 + 0.0005, String(x));
});

test('peaks: the lowest and highest sample of every 10 ms, fed in pieces', () => {
    const perBucket = PEAKS_SAMPLE_RATE * PEAKS_BUCKET_MS / 1000;
    const b = new PeaksBuilder();
    // Bucket 1: a full-scale square wave; bucket 2: silence; bucket 3 (half full): a small positive offset.
    const loud = Int16Array.from({ length: perBucket }, (_, i) => (i % 2 ? 32767 : -32768));
    b.push(loud.subarray(0, 30));
    b.push(loud.subarray(30));
    b.push(new Int16Array(perBucket));
    b.push(Int16Array.from({ length: perBucket / 2 }, () => 3277));
    const peaks = b.finish();
    assert.equal(peaks.length, 6);
    assert.deepEqual([...peaks.subarray(0, 4)], [-127, 127, 0, 0]);
    assert.equal(peaks[4], peaks[5]);                      // only one value in the last bucket
    assert.ok(peaks[4] > 60);
});

test('levels and columns: a zoomed-out column reads the loudest and quietest under it', () => {
    // 1,000 buckets (10 s): silent, with one loud bucket at 5.00 s and a small dip at 7.50 s.
    const peaks = new Int8Array(2000);
    peaks[2 * 500] = -100; peaks[2 * 500 + 1] = 110;
    peaks[2 * 750] = -20; peaks[2 * 750 + 1] = 5;
    const levels = peakLevels(peaks);
    assert.ok(levels.length > 3);
    assert.equal(levels[levels.length - 1].length <= 128, true);
    // Each level keeps the extremes of the one before.
    for (const l of levels) {
        assert.equal(Math.min(...l), -100);
        assert.equal(Math.max(...l), 110);
    }
    // 10 columns of 1 s: the loud bucket shows in column 5 only, the dip in column 7.
    const cols = columnPeaks(levels, 0, 1000, 10);
    assert.deepEqual([cols[10], cols[11]], [-100, 110]);
    assert.deepEqual([cols[14], cols[15]], [-20, 5]);
    assert.deepEqual([cols[0], cols[1], cols[18], cols[19]], [0, 0, 0, 0]);
    // Zoomed right in, 2 ms a column: the loud bucket spans five columns.
    const close = columnPeaks(levels, 4996, 2, 10);
    assert.deepEqual([...close].filter(v => v === 110).length, 5);
    // Past the end, and before the start, nothing.
    assert.deepEqual([...columnPeaks(levels, 20_000, 100, 3)], [0, 0, 0, 0, 0, 0]);
    assert.deepEqual([...columnPeaks(levels, -500, 100, 2)], [0, 0, 0, 0]);
    assert.equal(columnPeaks([], 0, 10, 4).length, 8);
});
