// Quality report on every finished episode (docs/specs/019-editor-light-v2.md, item 0.2). A render
// can succeed and still be wrong: too quiet, a long silence, a black stretch, sound drifting from
// the picture, or an on-screen item that never shows. One ffmpeg pass over the finished file
// measures loudness, true peak, silences and black frames; ffprobe gives the stream lengths. The
// numbers and a list of warnings go on the episode (editRender.qc, final.qc) and show in the
// Studio. Warnings never fail the job: the producer decides.
// The parsers and the rules are pure, so the tests run on canned ffmpeg output.

import { spawn } from 'child_process';
import type { KeptRange } from '../../../lib/edit';
import { anchorCut, isWhole, layerSpan, type Anchor } from '../../../lib/layers';
import type { RenderQc } from '../../../types/episode';
import { LOUDNESS } from './media';

export const QC_LIMITS = {
    loudnessTolerance: 1,        // LU either side of LOUDNESS.integrated
    lengthToleranceSeconds: 1,   // finished length against teasers + intro + edited episode + outro
    deadAirSeconds: 3,           // a silence this long is dead air
    silenceNoiseDb: -50,
    blackSeconds: 0.5,
    syncFrames: 2,               // audio and video lengths may differ by this many frames
    fps: 30,
    listed: 20,                  // silences and black stretches kept on the episode, at most
} as const;

export interface Span { startSec: number; endSec: number }

// What the caller knows about the file: how long it should be, and where the edited episode sits
// in it (black is only looked for there: the teasers, intro and outro are the same every time).
export interface QcExpect {
    lengthSeconds?: number;
    episode?: Span;
    normalization?: string | null;   // loudnorm's second pass, when this job ran it
    onScreen?: string[];             // warnings from onScreenChecks
}

export interface Measured {
    durationSeconds: number;
    videoSeconds: number | null;
    audioSeconds: number | null;
    integratedLufs: number | null;
    truePeakDb: number | null;
    silences: Span[];
    black: Span[];
}

const num = (s: string | undefined) => (s === undefined || /inf|nan/i.test(s) ? null : Number(s));

// ebur128's summary at the end of the run: "I: -14.0 LUFS" under "Integrated loudness", and
// "Peak: -1.2 dBFS" under "True peak". The per-frame lines (t: …) are not read.
export function parseLoudness(stderr: string): { integratedLufs: number | null; truePeakDb: number | null } {
    const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
    if (!stderr.includes('Summary:')) return { integratedLufs: null, truePeakDb: null };
    const i = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+|-?inf)\s*LUFS/.exec(summary);
    const p = /True peak:\s*\n\s*Peak:\s*(-?[\d.]+|-?inf)\s*dBFS/.exec(summary);
    return { integratedLufs: num(i?.[1]), truePeakDb: num(p?.[1]) };
}

// silencedetect: "silence_start: 12.5" then "silence_end: 16.1 | silence_duration: 3.6". A silence
// still open when the file ends runs to `durationSeconds`.
export function parseSilences(stderr: string, durationSeconds: number): Span[] {
    const out: Span[] = [];
    let open: number | null = null;
    for (const m of stderr.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
        const t = Math.max(0, Number(m[2]));
        if (m[1] === 'start') open = t;
        else { out.push({ startSec: open ?? 0, endSec: t }); open = null; }
    }
    if (open !== null) out.push({ startSec: open, endSec: durationSeconds });
    return out;
}

// blackdetect: "black_start:0 black_end:2 black_duration:2".
export function parseBlack(stderr: string): Span[] {
    return [...stderr.matchAll(/black_start:\s*(-?[\d.]+)\s+black_end:\s*(-?[\d.]+)/g)]
        .map(m => ({ startSec: Number(m[1]), endSec: Number(m[2]) }));
}

const secs = (s: number) => {
    const t = Math.max(0, Math.round(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// The warnings, in the order the producer should look at them.
export function qcWarnings(m: Measured, expect: QcExpect = {}): string[] {
    const w: string[] = [];
    const target = LOUDNESS.integrated;
    if (m.integratedLufs === null) w.push('The loudness could not be measured.');
    else if (Math.abs(m.integratedLufs - target) > QC_LIMITS.loudnessTolerance) {
        w.push(`The loudness is ${m.integratedLufs.toFixed(1)} LUFS; it should be ${target} ± ${QC_LIMITS.loudnessTolerance}.`);
    }
    if (m.truePeakDb !== null && m.truePeakDb > LOUDNESS.truePeak) {
        w.push(`The true peak is ${m.truePeakDb.toFixed(1)} dBTP, above ${LOUDNESS.truePeak}: loud moments may distort.`);
    }
    if (expect.normalization && expect.normalization !== 'linear') {
        w.push(`The loudness was set "${expect.normalization}", not in one even step, so quiet and loud parts were levelled differently.`);
    }
    if (expect.lengthSeconds !== undefined && Math.abs(m.durationSeconds - expect.lengthSeconds) > QC_LIMITS.lengthToleranceSeconds) {
        w.push(`The video is ${secs(m.durationSeconds)} long; teasers, intro, edit and outro add up to ${secs(expect.lengthSeconds)}.`);
    }
    for (const s of m.silences.filter(s => s.endSec - s.startSec >= QC_LIMITS.deadAirSeconds).slice(0, 5)) {
        w.push(`Dead air: ${(s.endSec - s.startSec).toFixed(1)} s of silence at ${secs(s.startSec)}.`);
    }
    const ep = expect.episode;
    const black = ep ? m.black.filter(b => b.endSec > ep.startSec && b.startSec < ep.endSec) : m.black;
    for (const b of black.slice(0, 5)) w.push(`Black picture for ${(b.endSec - b.startSec).toFixed(1)} s at ${secs(b.startSec)}.`);
    if (m.videoSeconds !== null && m.audioSeconds !== null
        && Math.abs(m.videoSeconds - m.audioSeconds) > QC_LIMITS.syncFrames / QC_LIMITS.fps) {
        w.push(`The sound is ${Math.abs(m.videoSeconds - m.audioSeconds).toFixed(2)} s ${m.audioSeconds > m.videoSeconds ? 'longer' : 'shorter'} than the picture; check it stays in sync.`);
    }
    w.push(...(expect.onScreen ?? []));
    return w;
}

// On-screen text and images against the edit: one that starts in a cut shows at the next kept
// moment, one past the end is never shown, and one running past the end is cut short. `label`
// names it for the producer.
export function onScreenChecks(items: { anchor: Anchor; durationMs: number; label: string }[], ranges: KeptRange[], editedMs: number): string[] {
    const w: string[] = [];
    for (const it of items) {
        const span = layerSpan(it, ranges, editedMs);
        if (!span) { w.push(`On screen: "${it.label}" comes after the end of the edit, so it is not shown.`); continue; }
        if (anchorCut(it, ranges)) w.push(`On screen: "${it.label}" starts in a cut part, so it shows at the next kept moment (${secs(span.startMs / 1000)} in the episode).`);
        // A layer set to last to the end (the logo bug) is meant to end with the episode.
        if (!isWhole(it) && span.startMs + it.durationMs > editedMs + 1) w.push(`On screen: "${it.label}" runs past the end of the edit and is cut short.`);
    }
    return w;
}

// Counts the text events in an ASS file against the plan (captions plus text overlays).
export function assCheck(ass: string | null, expected: number): string[] {
    const drawn = ass ? (ass.match(/^Dialogue:/gm) ?? []).length : 0;
    return drawn < expected ? [`On screen: ${expected - drawn} of ${expected} captions and texts are missing from the subtitle file.`] : [];
}

// ─── measuring ──────────────────────────────────────────────────────────────

// ffmpeg prints thousands of lines on a long file; only the ones the parsers read are kept. Also
// used by silences.ts.
const KEEP = /silence_(start|end)|black_start|Summary:|Integrated loudness|^\s+I:|True peak|^\s+Peak:/;

export function runFiltered(cmd: string, args: string[]): Promise<{ stdout: string; kept: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let partial = '';
        const kept: string[] = [];
        let tail = '';
        child.stdout.on('data', d => { stdout += d; });
        child.stderr.on('data', d => {
            const lines = (partial + d).split('\n');
            partial = lines.pop() ?? '';
            for (const l of lines) if (KEEP.test(l)) kept.push(l);
            tail = (tail + d).slice(-1000);
        });
        child.on('error', reject);
        child.on('close', code => {
            if (KEEP.test(partial)) kept.push(partial);
            if (code === 0) resolve({ stdout, kept: kept.join('\n') });
            else reject(new Error(`${cmd} exited with ${code}: ${tail.split('\n').slice(-3).join(' ').trim()}`));
        });
    });
}

async function streamSeconds(file: string) {
    const { stdout } = await runFiltered('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration:format=duration', '-of', 'json', file]);
    const j = JSON.parse(stdout) as { streams?: { codec_type?: string; duration?: string }[]; format?: { duration?: string } };
    const of = (type: string) => num(j.streams?.find(s => s.codec_type === type)?.duration) ;
    return { durationSeconds: Number(j.format?.duration ?? 0), videoSeconds: of('video'), audioSeconds: of('audio') };
}

// Measures the finished file and returns the report. It never throws: a check that cannot run
// becomes a warning, so the render it follows still succeeds.
export async function measureRender(file: string, expect: QcExpect = {}): Promise<RenderQc> {
    try {
        const lengths = await streamSeconds(file);
        const { kept } = await runFiltered('ffmpeg', ['-hide_banner', '-nostats', '-i', file,
            '-af', `ebur128=peak=true:framelog=verbose,silencedetect=noise=${QC_LIMITS.silenceNoiseDb}dB:d=${QC_LIMITS.deadAirSeconds}`,
            '-vf', `blackdetect=d=${QC_LIMITS.blackSeconds}:pix_th=0.1`,
            '-f', 'null', '-']);
        const m: Measured = {
            ...lengths,
            ...parseLoudness(kept),
            silences: parseSilences(kept, lengths.durationSeconds),
            black: parseBlack(kept),
        };
        return {
            integratedLufs: m.integratedLufs, truePeakDb: m.truePeakDb,
            normalization: expect.normalization ?? null,
            durationSeconds: m.durationSeconds, expectedSeconds: expect.lengthSeconds ?? null,
            videoSeconds: m.videoSeconds, audioSeconds: m.audioSeconds,
            silences: m.silences.slice(0, QC_LIMITS.listed), black: m.black.slice(0, QC_LIMITS.listed),
            warnings: qcWarnings(m, expect),
        };
    } catch (error) {
        return {
            integratedLufs: null, truePeakDb: null, normalization: expect.normalization ?? null,
            durationSeconds: null, expectedSeconds: expect.lengthSeconds ?? null, videoSeconds: null, audioSeconds: null,
            silences: [], black: [],
            warnings: [`The quality check could not run: ${(error as Error).message}`, ...(expect.onScreen ?? [])],
        };
    }
}
