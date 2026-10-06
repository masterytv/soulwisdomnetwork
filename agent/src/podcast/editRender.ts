// Editor Light (spec 015), phase 2: renders the edited episode as an mp4 with ffmpeg.
// Cuts the episode to its play order (lib/sequence.ts), joins teasers → intro → edited → outro at 1920x1080 30fps,
// lays b-roll over the edited timeline (using kenBurns from media.ts), cleans audio
// (highpass → afftdn/arnndn → acompressor → normalizeLoudness), and writes a JSON report.
// Part I: burns in captions, text overlays (such as name titles) and image overlays (lib/onScreen.ts).
// Spec 020 item E4: transitions. At a split, the parts on either side overlap (xfade for the picture,
// acrossfade for the sound); between the teasers, intro, episode and outro likewise; at the start and
// end, a fade from and to black. Every length is in whole frames, so each offset is exact.
// Run: npx tsx agent/src/podcast/editRender.ts --video in.mp4 --edit edit.json --out out.mp4 ...

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { editedWords, applyToChapters, applyToQuotes, type EpisodeEdit } from '../../../lib/edit';
import { sequenceLength, sequenceOf, timelineTime, type Clip } from '../../../lib/sequence';
import { DEFAULT_SECTION_JOINS, SECTION_JOIN_LABELS, XFADE, type SectionJoin, type SectionJoins, type Transition } from '../../../lib/transitions';
import { buildCues, editCues, toSrt } from '../../../lib/captions';
import { mmss } from '../../../lib/showNotes';
import { hasAudio, kenBurns, normalizeLoudness, probeDuration } from './media';
import type { CaptionStyle } from '../../../lib/onScreen';
import { layerAudioFilter, layersAss, layerSpan, pictureFilter, type PictureLayer, type TextLayer } from '../../../lib/layers';
import { soundFilter, soundsMix, soundSpan, type Sound } from '../../../lib/audio';
import type { RenderQc } from '../../../types/episode';
import { assCheck, measureRender, onScreenChecks } from './renderQc';

// ─── helpers ───────────────────────────────────────────────────────────────

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = '';
        child.stdout.on('data', d => { stdout += d; });
        child.stderr.on('data', d => { stderr += d; });
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) resolve({ stdout, stderr });
            else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-800)}`));
        });
    });
}

// The Outfit fonts for captions and text; the other caption fonts are installed on the runner.
const FONTS_DIR = path.resolve('agent/assets/fonts');

const FILL_1080 = 'scale=iw*sar:ih,setsar=1,scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,setsar=1';

// The voice cleanup, run once over the whole episode's sound (cleanTrack). Run per kept
// range instead, the noise reducer and compressor would restart at every cut and pump.
// aresample pins the track's first sample to time 0 and fills any gaps with silence, so a
// moment in the cleaned track sits at the same time as in the video it came from.
export function cleanupFilter(clean: 'light' | 'strong', noiseModel: string | undefined): string {
    const denoise = clean === 'strong' && noiseModel ? `arnndn=model=${noiseModel}` : 'afftdn=nr=12';
    return `aresample=async=1:first_pts=0,highpass=f=80,${denoise},acompressor=threshold=-20dB:ratio=2:attack=5:release=50`;
}

async function cleanTrack(video: string, out: string, clean: 'light' | 'strong', noiseModel: string | undefined) {
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-vn',
        '-af', cleanupFilter(clean, noiseModel), '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', out]);
}

// Per-range audio: trim, format and a short fade at each join so cuts don't click.
function audioFilter(segDur: number, fadeSecs: number): string {
    let af = `atrim=duration=${segDur.toFixed(6)},asetpts=PTS-STARTPTS`;
    af += ',aformat=sample_rates=48000:channel_layouts=stereo';
    if (segDur > fadeSecs * 2)
        af += `,afade=t=in:d=${fadeSecs},afade=t=out:st=${(segDur - fadeSecs).toFixed(6)}:d=${fadeSecs}`;
    return af;
}

// The render's frame rate. Each kept stretch becomes a whole number of frames, counted from where it
// starts and ends in the edited episode, so the finished video keeps to the edit's times (within half
// a frame) however many cuts there are. Rounding each stretch up on its own, as before, made a long
// edit run later and later: about 20 ms a cut, so captions and chapters drifted.
export const FPS = 30;
export const frameAt = (ms: number) => Math.round(ms * FPS / 1000);
// The frames a stretch of the play order fills.
export const framesOf = (clip: { startMs: number; endMs: number; atMs: number }) =>
    Math.max(1, frameAt(clip.atMs + clip.endMs - clip.startMs) - frameAt(clip.atMs));

// A piece of the video to join: its picture and sound labels in the filter graph, its length in
// frames, and the transition into it from the piece before (null: a straight cut).
export interface Piece { v: string; a: string; frames: number; join: { xfade: string; frames: number } | null }

// Joins pieces in order: a straight cut is a concat; a transition is an xfade and an acrossfade that
// overlap the two by its length, never more than the piece before has left after its own transition
// in, nor more than the piece itself. Returns the filter, the frame each piece starts at in the
// result, and its length in frames.
export function chainPieces(pieces: Piece[], out: { v: string; a: string }, tag: string): { filter: string; starts: number[]; frames: number } {
    let filter = '';
    let v = pieces[0].v, a = pieces[0].a, frames = pieces[0].frames, tail = pieces[0].frames;
    const starts = [0];
    for (let i = 1; i < pieces.length; i++) {
        const p = pieces[i];
        const last = i === pieces.length - 1;
        const nv = last ? out.v : `${tag}v${i}`, na = last ? out.a : `${tag}a${i}`;
        const d = p.join ? Math.min(p.join.frames, tail, p.frames) : 0;
        if (d > 0) {
            const secs = (d / FPS).toFixed(6);
            // Both sides at the same frame rate and time base, as xfade needs.
            filter += `[${v}]fps=${FPS}[${tag}x${i}];[${p.v}]fps=${FPS}[${tag}y${i}];`;
            filter += `[${tag}x${i}][${tag}y${i}]xfade=transition=${p.join!.xfade}:duration=${secs}:offset=${((frames - d) / FPS).toFixed(6)}[${nv}];`;
            filter += `[${a}][${p.a}]acrossfade=d=${secs}:c1=tri:c2=tri[${na}];`;
            starts.push(frames - d);
            frames += p.frames - d;
            tail = p.frames - d;
        } else {
            filter += `[${v}][${p.v}]concat=n=2:v=1:a=0[${nv}];[${a}][${p.a}]concat=n=2:v=0:a=1[${na}];`;
            starts.push(frames);
            frames += p.frames;
            tail = p.frames;
        }
        v = nv; a = na;
    }
    if (pieces.length === 1) filter += `[${v}]null[${out.v}];[${a}]anull[${out.a}];`;
    return { filter, starts, frames };
}

// ─── types ──────────────────────────────────────────────────────────────────

interface BrollArg { atMs: number; seconds: number; image: string }

interface RenderReport {
    inputSeconds: number;
    outputSeconds: number;
    cuts: number;
    timeSavedSeconds: number;
    renderSeconds: number;
    qc: RenderQc;                 // the quality report on the finished file (renderQc.ts)
    warnings: string[];           // transitions that played as straight cuts, and why
    soundsPlayed: string[];       // the sounds (item E7) the episode plays, by id in the order they start, for credits and the log
}

// ─── the render ─────────────────────────────────────────────────────────────

export async function renderEdit(opts: {
    video: string;
    edit: EpisodeEdit;
    out: string;
    teasers?: string[];
    intro?: string;
    outro?: string;
    broll?: BrollArg[];
    clean?: 'off' | 'light' | 'strong' | 'auphonic';
    detect?: 'auphonic';
    noiseModel?: string;
    blockMinutes?: number;
    // On screen (Part I, and layers since spec 020 item E5): captions in this look (null for none), text
    // layers, and picture and video layers (each with its local file), all placed on the edited episode.
    onScreen?: { captions: CaptionStyle | null; texts: TextLayer[]; pictures: { layer: PictureLayer; file: string }[] };
    // The accepted transcript and show-note times, when known: their new times are written
    // next to the output, so the final cut never has to be transcribed again.
    words?: { text: string; start: number; end: number }[];
    chapters?: { title: string; startMs: number }[];
    quotes?: { text: string; speaker: string; startMs: number; endMs: number }[];
    // The transitions between the video's sections (the edit's own or the Studio's); straight cuts when left out.
    sections?: SectionJoins;
    // Music and effects (spec 020 item E7, lib/audio.ts), each with its local file: mixed under the voice
    // on the edited episode, the ducked ones lowered while anyone speaks.
    sounds?: { sound: Sound; file: string }[];
}): Promise<RenderReport> {
    const start = Date.now();
    const clean = opts.clean ?? 'light';
    const blockMinutes = opts.blockMinutes ?? 15;
    const inSeconds = await probeDuration(opts.video);
    const inMs = Math.round(inSeconds * 1000);
    // What plays, in order, and where each stretch lands in the edited episode: every time below
    // (b-roll, on-screen items, captions, words, chapters, quotes) is mapped through it.
    let seq = sequenceOf(opts.edit, inMs, opts.words);
    let ranges = seq.clips;
    let editedMs = sequenceLength(ranges);
    const fadeSecs = 0.015;

    // Auphonic, run once when it detects cuts, cleans the voice, or both. It works in
    // "export_uncut_audio" mode, so its cleaned audio keeps the original timing and
    // the cuts above still line up with it.
    let cleanedAudio: string | null = null;
    if (opts.detect === 'auphonic' || clean === 'auphonic') {
        const { auphonicProcess, auphonicCutsToEdit } = await import('./auphonic');
        const result = await auphonicProcess(opts.video, {
            detectOnly: true,
            fillerCutting: true,
            silenceCutting: true,
            coughCutting: true,
            noiseReduction: clean === 'auphonic',
        });
        if (clean === 'auphonic') cleanedAudio = result.cleanedAudio;
        if (opts.detect === 'auphonic') {
            seq = sequenceOf({ ...opts.edit, cuts: [...opts.edit.cuts, ...auphonicCutsToEdit(result.regions)] }, inMs, opts.words);
            ranges = seq.clips;
            editedMs = sequenceLength(ranges);
        }
    }

    // Temporary files: the cleaned sound, b-roll clips and blocks. All of them are removed
    // at the end, whether the render worked or not.
    const stamp = Date.now();
    const tmpDir = path.join(path.dirname(opts.out), `_broll_${stamp}`);
    const cleanDir = path.join(path.dirname(opts.out), `_clean_${stamp}`);
    let blockDir = '';
    const onScreenWarnings: string[] = [];
    try {
        // The voice cleanup runs once, over the whole episode (see cleanupFilter).
        if ((clean === 'light' || clean === 'strong') && !cleanedAudio && ranges.length > 0) {
            fs.mkdirSync(cleanDir, { recursive: true });
            cleanedAudio = path.join(cleanDir, 'cleaned.wav');
            await cleanTrack(opts.video, cleanedAudio, clean, opts.noiseModel);
        }

        // Pre-render b-roll clips with kenBurns to temp files.
        const brollFiles: string[] = [];
        if (opts.broll) {
            fs.mkdirSync(tmpDir, { recursive: true });
            for (let i = 0; i < opts.broll.length; i++) {
                const b = opts.broll[i];
                const editedAt = timelineTime(ranges, b.atMs, true);
                if (editedAt === null) { brollFiles.push(''); continue; }
                const brollOut = path.join(tmpDir, `broll_${i}.mp4`);
                await kenBurns(b.image, brollOut, b.seconds, 'in', 30);
                brollFiles.push(brollOut);
            }
        }

        // Layers (spec 020 item E5): when each picture is up, and a moving still made into a clip with
        // the b-roll's Ken Burns. A still is looped for its length; a video is used as it is.
        const MOTION_OF = { kenBurnsIn: 'in', kenBurnsOut: 'out', pan: 'right' } as const;
        const pictures: { layer: PictureLayer; file: string; span: { startMs: number; endMs: number }; clip: boolean; sound: boolean }[] = [];
        for (const [i, p] of [...(opts.onScreen?.pictures ?? [])].sort((a, b) => a.layer.track - b.layer.track).entries()) {
            const span = layerSpan(p.layer, ranges, editedMs);
            if (!span) continue;
            let file = p.file, clip = p.layer.kind === 'video';
            if (p.layer.kind === 'image' && p.layer.motion !== 'none') {
                fs.mkdirSync(tmpDir, { recursive: true });
                file = path.join(tmpDir, `layer_${i}.mp4`);
                await kenBurns(p.file, file, (span.endMs - span.startMs) / 1000, MOTION_OF[p.layer.motion], FPS);
                clip = true;
            }
            const sound = p.layer.kind === 'video' && p.layer.volumeDb !== null && await hasAudio(p.file);
            pictures.push({ layer: p.layer, file, span, clip, sound });
        }
        pictures.sort((a, b) => a.layer.track - b.layer.track || a.span.startMs - b.span.startMs);

        // ── Block rendering ──────────────────────────────────────────────────────
        // Every render goes through blocks: each range gets its own seeked input,
        // so even a single-range episode is seeked rather than passed whole.
        // Blocks are .mkv with pcm_s16le audio, joined with the concat demuxer into one file per
        // part (the stretches between transitions at splits; one part when there are none).
        // The part files feed the transitions, teasers/intro/b-roll/outro/loudness.
        const useBlocks = ranges.length > 0;
        const partFiles: { file: string; clips: Clip[] }[] = [];

        if (useBlocks) {
            blockDir = path.join(path.dirname(opts.out), `_blocks_${stamp}`);
            fs.mkdirSync(blockDir, { recursive: true });

            // Group ranges into blocks: accumulate source duration until blockMinutes, and never
            // across a part's end.
            type Block = { ranges: typeof ranges; part: number };
            const blocks: Block[] = [];
            let curBlock: Block = { ranges: [], part: ranges[0].part ?? 0 };
            let blockMs = 0;
            for (const r of ranges) {
                const rDur = r.endMs - r.startMs;
                const part = r.part ?? 0;
                if ((blockMs + rDur > blockMinutes * 60 * 1000 || curBlock.ranges.length >= 20 || part !== curBlock.part) && curBlock.ranges.length > 0) {
                    blocks.push(curBlock);
                    curBlock = { ranges: [], part };
                    blockMs = 0;
                }
                curBlock.part = part;
                curBlock.ranges.push(r);
                blockMs += rDur;
            }
            if (curBlock.ranges.length > 0) blocks.push(curBlock);

            // Render each block: each range gets its own seeked input.
            const blockFiles: string[] = [];
            for (let bi = 0; bi < blocks.length; bi++) {
                const block = blocks[bi];
                const blockFile = path.join(blockDir, `block_${bi}.mkv`);

                const blockArgs: string[] = ['-y', '-hide_banner', '-loglevel', 'error'];
                let bFilter = '';
                const bSegV: string[] = [];
                const bSegA: string[] = [];
                for (let i = 0; i < block.ranges.length; i++) {
                    const r = block.ranges[i];
                    const frames = framesOf(r);
                    const segDur = frames / FPS;
                    const seekStart = (r.startMs / 1000).toFixed(3);
                    const seekLen = (segDur + 1).toFixed(3);
                    // Video input: seeked from the original video.
                    blockArgs.push('-ss', seekStart, '-t', seekLen, '-i', opts.video);
                    // Audio input: seeked from cleaned audio (when present) or the original video.
                    if (cleanedAudio) {
                        blockArgs.push('-ss', seekStart, '-t', seekLen, '-i', cleanedAudio);
                    }
                    const vIdx = i * (cleanedAudio ? 2 : 1);
                    const aIdx = cleanedAudio ? vIdx + 1 : vIdx;
                    // The last frame is held a moment, so a stretch at the very end of a recording whose
                    // picture stops a little early still fills its frames.
                    bFilter += `[${vIdx}:v]fps=${FPS},tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${frames},setpts=PTS-STARTPTS,${FILL_1080},format=yuv420p[bsv${i}];`;
                    bFilter += `[${aIdx}:a]${audioFilter(segDur, fadeSecs)}[bsa${i}];`;
                    bSegV.push(`bsv${i}`);
                    bSegA.push(`bsa${i}`);
                }

                // Concat this block's segments (video and audio interleaved: v0,a0,v1,a1,...).
                const interleaved: string[] = [];
                for (let i = 0; i < bSegV.length; i++) { interleaved.push(bSegV[i]); interleaved.push(bSegA[i]); }
                bFilter += `${interleaved.map(l => `[${l}]`).join('')}concat=n=${bSegV.length}:v=1:a=1[bov][boa];`;

                blockArgs.push('-filter_complex', bFilter, '-map', '[bov]', '-map', '[boa]');
                blockArgs.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS));
                blockArgs.push('-c:a', 'pcm_s16le', '-ar', '48000', blockFile);
                await run('ffmpeg', blockArgs);
                blockFiles.push(blockFile);
            }

            // Join each part's blocks with the concat demuxer. Full paths, because it reads each path
            // relative to the list file, which breaks when the output folder is relative.
            for (const part of [...new Set(blocks.map(b => b.part))]) {
                const files = blockFiles.filter((_, i) => blocks[i].part === part);
                const concatList = path.join(blockDir, `concat_${part}.txt`);
                fs.writeFileSync(concatList, files.map(f => `file '${path.resolve(f)}'`).join('\n') + '\n');
                const joinedFile = path.join(blockDir, `part_${part}.mkv`);
                await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
                    '-f', 'concat', '-safe', '0', '-i', concatList,
                    '-c', 'copy', joinedFile]);
                partFiles.push({ file: joinedFile, clips: ranges.filter(r => (r.part ?? 0) === part) });
            }
            for (const bf of blockFiles) { try { fs.unlinkSync(bf); } catch {} }
        }

        // ── Assembly pass: teasers, intro, episode, b-roll, outro, loudness ──────
        // When blocks are used, the episode sound comes from the part files — do not
        // add the cleaned audio as a separate input here.
        const inputs: { file: string; before: string[] }[] = [];
        const add = (file: string, before: string[] = []) => inputs.push({ file, before }) - 1;
        const teaserIdxs = (opts.teasers ?? []).map(t => add(t));
        const introIdx = opts.intro ? add(opts.intro) : -1;
        const partIdxs = partFiles.map(p => add(p.file));
        const outroIdx = opts.outro ? add(opts.outro) : -1;
        const brollIdxs = brollFiles.map(bf => bf ? add(bf) : -1);
        // Picture layers: one input each; a still is looped for as long as it is up.
        const pictureIdxs = pictures.map(p => add(p.file, p.clip ? [] : ['-loop', '1', '-t', ((p.span.endMs - p.span.startMs) / 1000 + 0.5).toFixed(3)]));
        // Sounds: one input each, a looping one read round and round.
        const sounds = (opts.sounds ?? []).flatMap(s => { const span = soundSpan(s.sound, ranges, editedMs); return span ? [{ ...s, span }] : []; });
        const soundIdxs = sounds.map(s => add(s.file, s.sound.loop ? ['-stream_loop', '-1'] : []));
        // Every section's length in whole frames.
        const framesOfFile = async (f: string) => Math.max(1, frameAt(Math.round((await probeDuration(f)) * 1000)));
        const teaserFrames = await Promise.all((opts.teasers ?? []).map(framesOfFile));
        const introFrames = opts.intro ? await framesOfFile(opts.intro) : 0;
        const outroFrames = opts.outro ? await framesOfFile(opts.outro) : 0;

        let filter = '';

        // A teaser, the intro or the outro, cut to whole frames, so every join's offset is exact.
        const section = (i: number, tag: string, frames: number) => {
            const secs = (frames / FPS).toFixed(6);
            filter += `[${i}:v]${FILL_1080},fps=${FPS},tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${frames},setpts=PTS-STARTPTS,format=yuv420p[${tag}v];`;
            filter += `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,apad=whole_dur=${secs},atrim=duration=${secs},asetpts=PTS-STARTPTS[${tag}a];`;
            return { v: `${tag}v`, a: `${tag}a`, frames };
        };

        // The episode: its parts, each straight after the one before or overlapping it by the
        // transition at their split; or, when everything was cut, a frame of black.
        let episodeFrames = 1;
        if (partFiles.length) {
            const pieces: Piece[] = partFiles.map((p, k) => {
                filter += `[${partIdxs[k]}:v]${FILL_1080},fps=${FPS},format=yuv420p[ptv${k}];`;
                filter += `[${partIdxs[k]}:a]aformat=sample_rates=48000:channel_layouts=stereo[pta${k}];`;
                const first = p.clips[0], last = p.clips[p.clips.length - 1];
                const prev = k > 0 ? partFiles[k - 1].clips[partFiles[k - 1].clips.length - 1] : null;
                const join = prev ? seq.joins.find(j => j.part === first.part) : undefined;
                return {
                    v: `ptv${k}`, a: `pta${k}`,
                    frames: frameAt(last.atMs + last.endMs - last.startMs) - frameAt(first.atMs),
                    join: join && prev ? { xfade: XFADE[join.transition], frames: frameAt(prev.atMs + prev.endMs - prev.startMs) - frameAt(first.atMs) } : null,
                };
            });
            const chained = chainPieces(pieces, { v: 'epv', a: 'epa' }, 'pj');
            filter += chained.filter;
            episodeFrames = chained.frames;
        } else {
            filter += `color=c=black:s=1920x1080:r=${FPS}:d=${(1 / FPS).toFixed(6)},format=yuv420p[epv];`;
            filter += `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${(1 / FPS).toFixed(6)}[epa];`;
        }

        // B-roll overlays.
        let epV = 'epv';
        let bi = 0;
        for (let i = 0; i < (opts.broll ?? []).length; i++) {
            if (brollIdxs[i] < 0) continue;
            const b = opts.broll![i];
            const at = timelineTime(ranges, b.atMs, true);
            if (at === null) continue;
            const startSec = at / 1000;
            const endSec = startSec + b.seconds;
            const fadeDur = 0.5;
            const br = `br${bi}`;
            const next = `ep${bi + 1}`;
            filter += `[${brollIdxs[i]}:v]setpts=PTS-STARTPTS+${startSec}/TB,format=yuv420p,fade=t=in:st=${startSec.toFixed(3)}:d=${fadeDur}:alpha=1,fade=t=out:st=${(endSec - fadeDur).toFixed(3)}:d=${fadeDur}:alpha=1[${br}];`;
            filter += `[${epV}][${br}]overlay=x=0:y=0:enable='between(t,${startSec.toFixed(3)},${endSec.toFixed(3)})':eof_action=pass,format=yuv420p[${next}];`;
            epV = next;
            bi++;
        }

        // On screen: picture layers over the b-roll (V2 first), then captions and text over everything.
        // The sound: each video layer's own and every music or effect under the voice, the ducked ones
        // lowered while anyone speaks (lib/audio.ts soundsMix, from Part H's musicMix).
        let epA = 'epa';
        const ducked: string[] = [], others: string[] = [];
        pictures.forEach((p, i) => {
            filter += pictureFilter(pictureIdxs[i], epV, `ly${i}`, p.layer, p.span);
            epV = `ly${i}`;
            const sound = p.sound && p.layer.kind === 'video' ? layerAudioFilter(pictureIdxs[i], `lya${i}`, p.layer, p.span) : null;
            if (sound) { filter += sound; others.push(`lya${i}`); }
        });
        sounds.forEach((s, i) => {
            filter += soundFilter(soundIdxs[i], `snd${i}`, s.sound, s.span);
            (s.sound.duck ? ducked : others).push(`snd${i}`);
        });
        if (ducked.length || others.length) {
            filter += soundsMix('epa', ducked, others, 'epam');
            epA = 'epam';
        }
        if (opts.onScreen) {
            const cues = opts.onScreen.captions && opts.words?.length ? editCues(opts.words, ranges) : [];
            const texts = opts.onScreen.texts.flatMap(layer => { const span = layerSpan(layer, ranges, editedMs); return span ? [{ layer, span }] : []; });
            const ass = layersAss(cues, opts.onScreen.captions, texts);
            // For the quality report: what the plan asked for against the edit and the subtitle file.
            onScreenWarnings.push(
                ...onScreenChecks([
                    ...opts.onScreen.texts.map(t => ({ anchor: t.anchor, durationMs: t.durationMs, label: t.text })),
                    ...(opts.onScreen.pictures).map(p => ({ anchor: p.layer.anchor, durationMs: p.layer.durationMs, label: p.layer.media.name || 'picture' })),
                ], ranges, editedMs),
                ...assCheck(ass, cues.length + texts.length),
            );
            if (ass) {
                fs.mkdirSync(tmpDir, { recursive: true });
                const assFile = path.join(tmpDir, 'onscreen.ass');
                fs.writeFileSync(assFile, ass);
                filter += `[${epV}]subtitles=filename=${filterPath(assFile)}:fontsdir=${filterPath(FONTS_DIR)},format=yuv420p[eps];`;
                epV = 'eps';
            }
        }

        // The programme: teasers → intro → episode → outro, each straight after the one before or
        // overlapping it by the transition between them (the edit's own, or the Studio settings').
        const sections: SectionJoins = opts.sections ?? DEFAULT_SECTION_JOINS;
        const warnings = Object.entries(seq.skipped).map(([key, why]) => `The transition at ${mmss(Number(key.slice('split:'.length)))}: ${why}`);
        const pieces: Piece[] = [];
        let prevLeft = 0;      // what the piece before has left after its own transition in
        const put = (p: { v: string; a: string; frames: number }, at: SectionJoin | null) => {
            const t: Transition | null = at && pieces.length ? sections[at] : null;
            let join: Piece['join'] = null;
            if (at && t && t.transition !== 'cut') {
                const d = frameAt(t.durationMs);
                if (d <= prevLeft && d <= p.frames) join = { xfade: XFADE[t.transition], frames: d };
                else warnings.push(`${SECTION_JOIN_LABELS[at]}: the transition is longer than the clips around it, so it plays as a straight cut.`);
            }
            pieces.push({ ...p, join });
            prevLeft = p.frames - (join?.frames ?? 0);
        };
        teaserIdxs.forEach((ti, i) => put(section(ti, `ts${i}`, teaserFrames[i]), i > 0 ? 'betweenTeasers' : null));
        if (introIdx >= 0) put(section(introIdx, 'in', introFrames), teaserIdxs.length ? 'afterTeasers' : null);
        const episodePiece = pieces.length;
        put({ v: epV, a: epA, frames: episodeFrames }, introIdx >= 0 ? 'afterIntro' : teaserIdxs.length ? 'afterTeasers' : null);
        if (outroIdx >= 0) put(section(outroIdx, 'ou', outroFrames), 'beforeOutro');
        const programme = chainPieces(pieces, { v: 'pgv', a: 'pga' }, 'pg');
        filter += programme.filter;

        // At the very start and end, a transition is a fade from or to black (white for Fade through white).
        let outV = 'pgv', outA = 'pga';
        for (const at of ['start', 'end'] as const) {
            const t = sections[at];
            if (t.transition === 'cut') continue;
            const d = Math.min(frameAt(t.durationMs), programme.frames) / FPS;
            const st = at === 'start' ? 0 : programme.frames / FPS - d;
            const dir = at === 'start' ? 'in' : 'out';
            filter += `[${outV}]fade=t=${dir}:st=${st.toFixed(6)}:d=${d.toFixed(6)}${t.transition === 'fadeWhite' ? ':color=white' : ''}[f${dir}v];`;
            filter += `[${outA}]afade=t=${dir}:st=${st.toFixed(6)}:d=${d.toFixed(6)}[f${dir}a];`;
            outV = `f${dir}v`; outA = `f${dir}a`;
        }
        filter += `[${outV}]null[outv];[${outA}]anull[outa];`;

        // Run ffmpeg.
        const rawOut = opts.out + '.raw.mp4';
        const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error'];
        for (const inp of inputs) args.push(...inp.before, '-i', inp.file);
        args.push('-filter_complex', filter, '-map', '[outv]', '-map', '[outa]');
        args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS));
        args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', rawOut);
        await run('ffmpeg', args);

        // Loudness normalization as a separate two-pass.
        let normalization: string | null = null;
        if (clean !== 'off') {
            ({ normalization } = await normalizeLoudness(rawOut, opts.out));
            try { fs.unlinkSync(rawOut); } catch {}
        } else {
            fs.renameSync(rawOut, opts.out);
        }

        const outSecs = await probeDuration(opts.out);
        // Everything before the episode (teasers, then the intro, less the transitions that overlap
        // them) pushes its times later.
        const offsetMs = Math.round(programme.starts[episodePiece] * 1000 / FPS);
        const qc = await measureRender(opts.out, {
            lengthSeconds: programme.frames / FPS,
            episode: { startSec: offsetMs / 1000, endSec: offsetMs / 1000 + episodeFrames / FPS },
            normalization,
            onScreen: onScreenWarnings,
        });
        const report: RenderReport = {
            inputSeconds: inSeconds,
            outputSeconds: outSecs,
            cuts: opts.edit.cuts.length,
            timeSavedSeconds: Math.max(0, inSeconds - (editedMs / 1000)),
            renderSeconds: (Date.now() - start) / 1000,
            qc,
            warnings,
            soundsPlayed: [...sounds].sort((a, b) => a.span.startMs - b.span.startMs).map(s => s.sound.id),
        };
        const base = opts.out.replace(/\.\w+$/, '');
        if (opts.words?.length || opts.chapters?.length || opts.quotes?.length) {
            const shift = <T extends { startMs: number; endMs?: number }>(x: T): T =>
                ({ ...x, startMs: x.startMs + offsetMs, ...(x.endMs !== undefined ? { endMs: x.endMs + offsetMs } : {}) });
            if (opts.words?.length) {
                const words = editedWords(opts.words, ranges, offsetMs);
                fs.writeFileSync(`${base}.words.json`, JSON.stringify(words));
                fs.writeFileSync(`${base}.srt`, toSrt(buildCues(words)));
            }
            fs.writeFileSync(`${base}.chapters.json`, JSON.stringify({
                chapters: applyToChapters(opts.chapters ?? [], ranges).map(shift),
                quotes: applyToQuotes(opts.quotes ?? [], ranges).map(shift),
            }, null, 2));
        }
        const reportPath = `${base}.report.json`;
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        return report;
    } finally {
        // Clean up temp directories so failed runs leave nothing behind.
        for (const dir of [tmpDir, cleanDir, blockDir]) {
            if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
        }
    }
}

// A file path inside a filter, quoted for ffmpeg; a quote in the path cannot be passed safely.
function filterPath(p: string): string {
    if (p.includes("'")) throw new Error(`The path ${p} has a quote in it, which ffmpeg filters cannot take`);
    return `'${p}'`;
}

// ─── command line ────────────────────────────────────────────────────────────

interface ParsedArgs {
    video?: string; editPath?: string; out?: string;
    teasers: string[]; intro?: string; outro?: string;
    broll: BrollArg[]; clean: 'off' | 'light' | 'strong' | 'auphonic'; detect?: 'auphonic'; noiseModel?: string; blockMinutes?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
    const args: ParsedArgs = { teasers: [], broll: [], clean: 'light' };
    for (let i = 0; i < argv.length; i++) {
        switch (argv[i]) {
            case '--video': args.video = argv[++i]; break;
            case '--edit': args.editPath = argv[++i]; break;
            case '--out': args.out = argv[++i]; break;
            case '--teaser': args.teasers.push(argv[++i]); break;
            case '--intro': args.intro = argv[++i]; break;
            case '--outro': args.outro = argv[++i]; break;
            case '--broll': args.broll.push(JSON.parse(argv[++i])); break;
            case '--clean': args.clean = argv[++i] as 'off' | 'light' | 'strong' | 'auphonic'; break;
            case '--detect': args.detect = argv[++i] as 'auphonic'; break;
            case '--noise-model': args.noiseModel = argv[++i]; break;
            case '--block-minutes': args.blockMinutes = Number(argv[++i]); break;
        }
    }
    return args;
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    if (!args.video || !args.editPath || !args.out) {
        console.error('Usage: editRender.ts --video in.mp4 --edit edit.json --out out.mp4 [--teaser a.mp4] [--intro intro.mp4] [--outro outro.mp4] [--broll json] [--clean off|light|strong] [--block-minutes N]');
        process.exit(1);
    }
    // The edit file may also carry "words", "chapters" and "quotes" for the new times.
    const edit: EpisodeEdit & Pick<Parameters<typeof renderEdit>[0], 'words' | 'chapters' | 'quotes'> =
        JSON.parse(fs.readFileSync(args.editPath, 'utf8'));
    renderEdit({
        video: args.video, edit, out: args.out,
        teasers: args.teasers.length ? args.teasers : undefined,
        intro: args.intro, outro: args.outro,
        broll: args.broll.length ? args.broll : undefined,
        clean: args.clean, detect: args.detect, noiseModel: args.noiseModel,
        blockMinutes: args.blockMinutes,
        words: edit.words, chapters: edit.chapters, quotes: edit.quotes,
    }).then(r => console.log(JSON.stringify(r, null, 2)))
      .catch(e => { console.error('Render failed:', e); process.exit(1); });
}
