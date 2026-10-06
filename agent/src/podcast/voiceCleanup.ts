// Why: the render's voice clean-up choices beyond today's chain (docs/specs/019-editor-light-v2.md item 3.2,
// lib/voice.ts). Each makes a cleaned track of the whole recording's sound, at the same times as the video, which
// the render cuts its kept ranges from (editRender.ts cleanedAudio), so a clean-up never restarts at a cut.
//
// DeepFilterNet runs as its own command-line program (deep-filter v0.5.6, pinned and checksum-checked in
// the workflow), not as the LADSPA plugin inside ffmpeg: the plugin works as if live, and whenever it falls
// behind it slips silence in, so the voice drifted later than the picture (measured 20 ms → 80 ms within a
// minute, differently on each run). The program with -D keeps the voice where it was, to the sample, and
// gives the same output every time. It works on one core at about 0.4× the audio's length, so the recording
// is cut into pieces that run side by side, overlapping by PIECE_OVERLAP_SEC and joined with crossfades.
//
// Auphonic gets only the stretch the edit keeps (lib/voice.ts auphonicSpan), since its free plan counts
// what it is sent; the result is put back at its place in a track of the recording's length.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function ffmpeg(args: string[]): Promise<void> {
    return run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
}

function run(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        p.stderr.on('data', d => { err += d; });
        p.on('error', reject);
        p.on('close', code => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.slice(-600)}`))));
    });
}

// Before DeepFilterNet: the recording's sound from time 0 (gaps filled), without rumble, as one channel at
// 48 kHz (what the model works in; a recording's speech is the same in both channels).
export const DEEPFILTER_BEFORE = 'aresample=async=1:first_pts=0,highpass=f=80';
// After it: today's compressor, and both channels again.
export const DEEPFILTER_AFTER = 'acompressor=threshold=-20dB:ratio=2:attack=5:release=50,pan=stereo|c0=c0|c1=c0';

// Each piece runs this much into its neighbours, so both are settled where they are crossfaded.
export const PIECE_OVERLAP_SEC = 1;
// Shorter recordings are cleaned in one piece.
const MIN_PIECE_SEC = 60;

// Where each piece starts and ends (seconds), and the part of it kept: the pieces cover the recording,
// each kept part reaching half the overlap into the next, so neighbours share exactly PIECE_OVERLAP_SEC
// to crossfade over.
export function pieces(durationSec: number, count: number): { from: number; to: number; keepFrom: number; keepTo: number }[] {
    const n = Math.max(1, Math.min(count, Math.floor(durationSec / MIN_PIECE_SEC)));
    const half = PIECE_OVERLAP_SEC / 2;
    return Array.from({ length: n }, (_, i) => {
        const a = (durationSec * i) / n, b = (durationSec * (i + 1)) / n;
        const keepFrom = i === 0 ? 0 : a - half, keepTo = i === n - 1 ? durationSec : b + half;
        return { from: Math.max(0, keepFrom - PIECE_OVERLAP_SEC), to: Math.min(durationSec, keepTo + PIECE_OVERLAP_SEC), keepFrom, keepTo };
    });
}

// The ffmpeg graph that joins the cleaned pieces (inputs 0..n-1, each starting at its `from`), with
// crossfades over the overlaps, then applies `after`, to exactly `durationSec`.
export function joinGraph(parts: ReturnType<typeof pieces>, durationSec: number, after: string): string {
    const f = (x: number) => x.toFixed(6);
    // Each output may end a few ms early (the -D compensation trims its tail), so it is padded first.
    let g = parts.map((p, i) => `[${i}]apad,atrim=start=${f(p.keepFrom - p.from)}:end=${f(p.keepTo - p.from)},asetpts=PTS-STARTPTS[p${i}];`).join('');
    let last = 'p0';
    for (let i = 1; i < parts.length; i++) {
        g += `[${last}][p${i}]acrossfade=d=${f(PIECE_OVERLAP_SEC)}:c1=tri:c2=tri[j${i}];`;
        last = `j${i}`;
    }
    return `${g}[${last}]${after},apad,atrim=end=${f(durationSec)}[out]`;
}

export interface DeepFilterOptions {
    bin: string;                  // the deep-filter program
    workDir: string;
    durationSec: number;          // the recording's length
    pieces?: number;              // how many run side by side (default: the cores, at most 4)
}

// The recording's voice cleaned by DeepFilterNet, as 48 kHz stereo WAV at the video's times.
export async function deepFilterTrack(input: string, out: string, o: DeepFilterOptions) {
    const dir = fs.mkdtempSync(path.join(o.workDir, 'dfn-'));
    try {
        const mono = path.join(dir, 'voice.wav');
        await ffmpeg(['-i', input, '-vn', '-af', DEEPFILTER_BEFORE, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', mono]);
        const parts = pieces(o.durationSec, o.pieces ?? Math.min(4, os.availableParallelism()));
        const outs = await Promise.all(parts.map(async (p, i) => {
            const piece = path.join(dir, `piece${i}.wav`);
            await ffmpeg(['-ss', p.from.toFixed(6), '-t', (p.to - p.from).toFixed(6), '-i', mono, '-c:a', 'pcm_s16le', piece]);
            const done = path.join(dir, `out${i}`);
            // -D: no delay against the input. The default attenuation limit (100 dB: none), as in the comparison.
            await run(o.bin, ['-D', '-o', done, piece]);
            return path.join(done, `piece${i}.wav`);
        }));
        await ffmpeg([...outs.flatMap(f => ['-i', f]), '-filter_complex', joinGraph(parts, o.durationSec, DEEPFILTER_AFTER),
            '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s16le', out]);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// ─── Auphonic ────────────────────────────────────────────────────────────────

// The stretch Auphonic is sent, as 48 kHz stereo FLAC (lossless and about half a WAV's size).
export function auphonicInput(input: string, span: { startMs: number; endMs: number }, out: string) {
    return ffmpeg(['-ss', (span.startMs / 1000).toFixed(3), '-t', ((span.endMs - span.startMs) / 1000).toFixed(3), '-i', input,
        '-vn', '-af', 'aresample=async=1:first_pts=0', '-ac', '2', '-ar', '48000', '-c:a', 'flac', out]);
}

// What Auphonic sent back, put at its place in a track as long as the recording: silence before and after.
export function placeAt(cleaned: string, startMs: number, durationSec: number, out: string) {
    return ffmpeg(['-i', cleaned, '-af', `aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(startMs)}:all=1,apad,atrim=end=${durationSec.toFixed(6)}`,
        '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', out]);
}
