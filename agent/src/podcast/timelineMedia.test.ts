// The Studio editor's timeline media made at ingest (spec 020 item E2): the waveform's peaks from a
// second of tone and a second of silence, and the thumbnail sheets from a short video.

import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { PEAKS_BUCKET_MS } from '../../../lib/peaks';
import { THUMBS } from '../../../lib/thumbs';
import { makeThumbs, measurePeaks } from './timelineMedia';

const ffmpeg = (args: string[]) => {
    const made = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
    assert.equal(made.status, 0, made.stderr?.toString());
};

test('peaks: loud where the tone is, flat where it is silent, one pair every 10 ms', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'peaks-'));
    const file = path.join(dir, 'audio.m4a');
    try {
        ffmpeg(['-f', 'lavfi', '-i', 'sine=f=440:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=1',
            '-filter_complex', '[0:a]aformat=sample_rates=44100:channel_layouts=mono[a];[a][1:a]concat=n=2:v=0:a=1', '-c:a', 'aac', file]);
        const peaks = await measurePeaks(file);
        const buckets = peaks.length / 2;
        assert.ok(Math.abs(buckets - 2000 / PEAKS_BUCKET_MS) <= 6, String(buckets));
        const loud = (i: number) => Math.max(Math.abs(peaks[2 * i]), Math.abs(peaks[2 * i + 1]));
        // The tone (ffmpeg's sine is at 1/8 of full scale) in the middle of the first second, silence in the second.
        assert.ok(loud(50) > 60, String(loud(50)));
        assert.ok(peaks[100] < 0 && peaks[101] > 0);
        assert.ok(loud(160) <= 2, String(loud(160)));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('thumbnails: a frame every 5 s, on 1600×900 sheets of a hundred', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbs-'));
    const file = path.join(dir, 'video.mp4');
    try {
        // 12 s, and 4:3, so the frames are letterboxed into 160×90.
        ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=10:d=12', '-c:v', 'libx264', '-preset', 'ultrafast', file]);
        const { sheets, count } = await makeThumbs(file, path.join(dir, 'thumbs'), 12);
        assert.equal(count, 3);
        assert.deepEqual(sheets.map(s => path.basename(s)), ['thumbs_0.jpg']);
        const size = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', sheets[0]]).stdout.toString().trim();
        assert.equal(size, `${THUMBS.width * THUMBS.cols},${THUMBS.height * THUMBS.rows}`);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
