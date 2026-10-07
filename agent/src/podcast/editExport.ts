// Why: "Open in Resolve, Premiere or Final Cut" (docs/specs/019-editor-light-v2.md item 4.1). A way out for the
// rare episode that needs more than cutting, now that Descript is being left: the edit's cuts as files a full
// editor opens, beside the render. auto-editor (Unlicense, docs/licences/auto-editor.md; the pinned 31.7.2
// binary, downloaded by podcast_edit_render.yml) reads the timeline we write in its v3 JSON and exports FCP7
// XML for Premiere, FCP7 XML for DaVinci Resolve, and FCPXML 1.10 for Final Cut Pro.
//
// What goes in: the episode's kept stretches in their play order (lib/sequence.ts), back to back, in whole
// frames of the recording's own frame rate (an editor cannot open a 1000 fps timeline, which is what
// milliseconds would give). Transitions become straight cuts, and the teasers, intro, outro, b-roll, layers,
// sounds and burned-in captions are not in it: the producer adds what they need there. A captions .srt on
// the exported timeline goes with it.
//
// The files name the original recording by its file name only (auto-editor writes the runner's paths), so the
// producer relinks to their own copy. Zoom recordings can have a variable frame rate, which an editor app plays
// as constant and drifts; then a constant-frame-rate copy is made and the files name that instead.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildCues, toSrt } from '../../../lib/captions';
import { editedWords } from '../../../lib/edit';
import type { Clip } from '../../../lib/sequence';

function run(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        p.stdout.on('data', d => { out += d; });
        p.stderr.on('data', d => { err += d; });
        p.on('error', reject);
        p.on('close', code => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)} exited ${code}: ${(err || out).slice(-600)}`))));
    });
}

// ─── The frame rate ──────────────────────────────────────────────────────────

// The rates editors offer, as ffmpeg writes them.
const STANDARD_RATES = ['24000/1001', '24/1', '25/1', '30000/1001', '30/1', '50/1', '60000/1001', '60/1'];
// How far the average rate may be from the nominal one before the recording counts as variable.
const VFR_TOLERANCE = 0.005;

const value = (rate: string) => { const [n, d] = rate.split('/').map(Number); return d ? n / d : n; };

export interface FrameRate { rate: string; fps: number; variable: boolean }

// The timeline's rate from ffprobe's r_frame_rate (nominal) and avg_frame_rate (frames over duration): the
// nearest standard rate, and whether the two differ enough that the recording's frames are not evenly spaced.
export function frameRateOf(nominal: string, average: string): FrameRate {
    const n = value(nominal), a = value(average);
    const base = Number.isFinite(n) && n > 0 ? n : a;
    if (!Number.isFinite(base) || base <= 0) throw new Error(`The recording's frame rate is not known (${nominal}, ${average})`);
    const rate = STANDARD_RATES.reduce((best, r) => (Math.abs(value(r) - base) < Math.abs(value(best) - base) ? r : best));
    const variable = Number.isFinite(a) && a > 0 && Math.abs(a - n) / n > VFR_TOLERANCE;
    return { rate, fps: value(rate), variable };
}

export interface SourceInfo { width: number; height: number; nominal: string; average: string; sampleRate: number; channels: number }

export async function probeSource(file: string): Promise<SourceInfo> {
    const j = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_entries',
        'stream=codec_type,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels', '-of', 'json', file])) as {
        streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string; avg_frame_rate?: string; sample_rate?: string; channels?: number }[];
    };
    const v = j.streams.find(s => s.codec_type === 'video');
    const a = j.streams.find(s => s.codec_type === 'audio');
    if (!v?.width || !v.height) throw new Error('The recording has no picture');
    return {
        width: v.width, height: v.height, nominal: v.r_frame_rate ?? '0/0', average: v.avg_frame_rate ?? '0/0',
        sampleRate: Number(a?.sample_rate ?? 48000), channels: a?.channels ?? 2,
    };
}

// ─── The timeline ────────────────────────────────────────────────────────────

// One stretch on the exported timeline, in frames: where it is in the recording (in, out) and on the timeline.
export interface FrameClip { inFrame: number; outFrame: number; atFrame: number }

// The play order's stretches back to back, each from the frame nearest its start in the recording to the frame
// nearest its end; a stretch shorter than a frame is left out.
export function framesOf(clips: Clip[], fps: number): FrameClip[] {
    const out: FrameClip[] = [];
    let at = 0;
    for (const c of clips) {
        const inFrame = Math.round(c.startMs * fps / 1000), outFrame = Math.round(c.endMs * fps / 1000);
        if (outFrame <= inFrame) continue;
        out.push({ inFrame, outFrame, atFrame: at });
        at += outFrame - inFrame;
    }
    return out;
}

// auto-editor's v3 timeline: each clip's `start` is its place on the timeline, `offset` its place in the source,
// `dur` its length, all in frames of `timebase`. One picture track and one sound track from the same file.
export function v3Timeline(frames: FrameClip[], src: string, info: SourceInfo, rate: string) {
    const track = frames.map(f => ({ src, start: f.atFrame, dur: f.outFrame - f.inFrame, offset: f.inFrame, stream: 0 }));
    return {
        version: '3', timebase: rate, background: '#000000', resolution: [info.width, info.height],
        samplerate: info.sampleRate, layout: info.channels === 1 ? 'mono' : 'stereo',
        v: [track], a: [track.map(c => ({ ...c }))],
    };
}

// The exported timeline's stretches in milliseconds, as lib/edit.ts editedWords takes them.
export function exportRanges(frames: FrameClip[], fps: number) {
    const ms = (f: number) => f * 1000 / fps;
    return frames.map(f => ({ startMs: ms(f.inFrame), endMs: ms(f.outFrame), atMs: ms(f.atFrame) }));
}

// auto-editor names the file by the runner's folder; the producer has it somewhere else. The folder is taken off,
// as written plainly (FCP7 XML) and in a file URL (FCPXML), so each file names only the recording.
export function nameOnly(xml: string, dir: string): string {
    const plain = dir.endsWith('/') ? dir : `${dir}/`;
    const encoded = encodeURI(plain);
    return xml.split(`file://${encoded}`).join('file:///').split(`file://${plain}`).join('file:///')
        .split(`>${plain}`).join('>').split(`>${encoded}`).join('>');
}

// ─── The files ───────────────────────────────────────────────────────────────

export const EXPORTS = [
    { kind: 'resolve', arg: 'resolve-fcp7', suffix: 'DaVinci Resolve.xml', label: 'DaVinci Resolve' },
    { kind: 'premiere', arg: 'premiere', suffix: 'Premiere Pro.xml', label: 'Premiere Pro' },
    { kind: 'finalcut', arg: 'final-cut-pro:version=10', suffix: 'Final Cut Pro.fcpxml', label: 'Final Cut Pro' },
] as const;

export interface ExportFile {
    kind: 'resolve' | 'premiere' | 'finalcut' | 'captions' | 'constantRate';
    local: string;
    name: string;                 // what it is called in Drive and when downloaded
    contentType: string;
}

export interface ExportResult { files: ExportFile[]; warnings: string[]; frameRate: FrameRate }

// Writes the three editor files, the captions for their timeline, and (for a variable frame rate) the
// constant-frame-rate copy they then name. `name` is the recording's original file name; `title` names the files.
export async function makeEditExports(o: {
    video: string; name: string; title: string; clips: Clip[]; words?: { text: string; start: number; end: number }[];
    workDir: string; bin: string;
}): Promise<ExportResult> {
    const dir = path.resolve(o.workDir, 'edit-files');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const info = await probeSource(o.video);
    const frameRate = frameRateOf(info.nominal, info.average);
    const warnings: string[] = [];
    const files: ExportFile[] = [];

    // The files name the recording, or for a variable frame rate the copy made here, by its own name.
    let media = path.join(dir, path.basename(o.name).replace(/[\\/]/g, '-') || 'recording.mp4');
    if (frameRate.variable) {
        const copyName = `${path.parse(media).name} (constant ${frameRate.fps.toFixed(2).replace(/\.00$/, '')} fps).mp4`;
        media = path.join(dir, copyName);
        await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', o.video, '-fps_mode', 'cfr', '-r', frameRate.rate,
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
            '-movflags', '+faststart', media]);
        files.push({ kind: 'constantRate', local: media, name: copyName, contentType: 'video/mp4' });
        warnings.push(`The recording's frame rate varies (${info.average} on average, ${info.nominal} nominal), which editor apps play as constant, so the picture would drift from the sound. The editor files use "${copyName}", a constant-frame-rate copy beside them: relink to that, not the original.`);
    } else {
        fs.symlinkSync(path.resolve(o.video), media);
    }

    const frames = framesOf(o.clips, frameRate.fps);
    if (!frames.length) throw new Error('Nothing is kept in this edit');
    const timeline = path.join(dir, 'timeline.v3');
    fs.writeFileSync(timeline, JSON.stringify(v3Timeline(frames, media, info, frameRate.rate)));
    for (const e of EXPORTS) {
        const ext = e.kind === 'finalcut' ? '.fcpxml' : '.xml';
        const out = path.join(dir, `${e.kind}${ext}`);
        await run(o.bin, [timeline, '--export', e.arg, '-o', out]);
        if (!fs.existsSync(out)) throw new Error(`auto-editor made no ${e.label} file`);
        fs.writeFileSync(out, nameOnly(fs.readFileSync(out, 'utf8'), dir));
        files.push({ kind: e.kind, local: out, name: `${o.title} - ${e.suffix}`, contentType: 'application/xml' });
    }
    if (o.words?.length) {
        const srt = path.join(dir, 'captions.srt');
        fs.writeFileSync(srt, toSrt(buildCues(editedWords(o.words, exportRanges(frames, frameRate.fps)))));
        files.push({ kind: 'captions', local: srt, name: `${o.title} - captions for the editor files.srt`, contentType: 'application/x-subrip' });
    }
    return { files, warnings, frameRate };
}
