// The Studio editor's timeline media (spec 020 item E2), made once at ingest beside the audio's
// silences: the waveform's peaks (spec 019 item 2.1, lib/peaks.ts) from audio.m4a, and the picture
// strip's thumbnail sheets (lib/thumbs.ts) from the 720p proxy. Free: peaks take seconds; the
// thumbnails decode the whole proxy, about a minute and a half for a 49-minute episode.

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PEAKS_SAMPLE_RATE, PeaksBuilder } from '../../../lib/peaks';
import { THUMBS, thumbCount } from '../../../lib/thumbs';
import { PermanentError } from './errors';

// Decodes the audio to 8 kHz mono 16-bit samples, read as they come, into peaks.
export function measurePeaks(file: string): Promise<Int8Array> {
    return new Promise((resolve, reject) => {
        const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1',
            '-ar', String(PEAKS_SAMPLE_RATE), '-f', 's16le', '-acodec', 'pcm_s16le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
        const builder = new PeaksBuilder();
        let carry: Buffer | null = null;   // an odd byte left over between chunks
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => {
            const data: Buffer = carry ? Buffer.concat([carry, chunk]) : chunk;
            const even = data.length & ~1;
            carry = even < data.length ? data.subarray(even) : null;
            // Copied, so the samples are aligned for Int16Array.
            const aligned = new Uint8Array(data.subarray(0, even));
            builder.push(new Int16Array(aligned.buffer, 0, even / 2));
        });
        child.stderr.on('data', d => { stderr = (stderr + d).slice(-2000); });
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) resolve(builder.finish());
            else reject(new PermanentError(`ffmpeg could not read the audio for its waveform: ${stderr.trim().split('\n').slice(-3).join(' ')}`));
        });
    });
}

// One frame every 5 s, 160×90 (letterboxed if the picture is not 16:9), a hundred to a JPEG sheet:
// thumbs_0.jpg, thumbs_1.jpg… in `outDir`. Returns the sheets in order and how many frames there are.
export async function makeThumbs(video: string, outDir: string, durationSeconds: number): Promise<{ sheets: string[]; count: number }> {
    fs.mkdirSync(outDir, { recursive: true });
    const { width: w, height: h, cols, rows, everyMs } = THUMBS;
    await new Promise<void>((resolve, reject) => {
        const child = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-an',
            '-vf', `fps=1000/${everyMs},scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,tile=${cols}x${rows}`,
            '-q:v', '5', '-start_number', '0', path.join(outDir, 'thumbs_%d.jpg')], { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', d => { stderr = (stderr + d).slice(-2000); });
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve()
            : reject(new PermanentError(`ffmpeg could not make the timeline thumbnails: ${stderr.trim().split('\n').slice(-3).join(' ')}`)));
    });
    const sheets = fs.readdirSync(outDir)
        .map(name => /^thumbs_(\d+)\.jpg$/.exec(name))
        .filter((m): m is RegExpExecArray => !!m)
        .sort((a, b) => Number(a[1]) - Number(b[1]))
        .map(m => path.join(outDir, m[0]));
    if (!sheets.length) throw new PermanentError('ffmpeg made no timeline thumbnails');
    // Never more frames than the sheets hold, in case the recording is shorter than it said.
    return { sheets, count: Math.min(thumbCount(durationSeconds * 1000), sheets.length * cols * rows) };
}
