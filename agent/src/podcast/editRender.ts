// Editor Light (spec 015), phase 2: renders the edited episode as an mp4 with ffmpeg.
// Cuts the episode to its play order (lib/sequence.ts), joins teasers → intro → edited → outro at 1920x1080 30fps,
// lays b-roll over the edited timeline (using kenBurns from media.ts), cleans audio
// (highpass → afftdn/arnndn → acompressor, or DeepFilterNet or Auphonic: spec 019 item 3.2, voiceCleanup.ts;
// then normalizeLoudness), and writes a JSON report.
// Part I: burns in captions, text overlays (such as name titles) and image overlays (lib/onScreen.ts).
// Spec 020 item E4: transitions. At a split, the parts on either side overlap (xfade for the picture,
// acrossfade for the sound); between the teasers, intro, episode and outro likewise; at the start and
// end, a fade from and to black. Every length is in whole frames, so each offset is exact.
// Spec 019 item 4.2: the sound is made once for the whole programme (renderWindows.ts PcmAssembler), and the
// picture in windows of the finished video, each built with everything that shows in it and encoded once (two
// at a time), then joined without encoding again. A retried run finds the windows it kept (`store`).
// Run: npx tsx agent/src/podcast/editRender.ts --video in.mp4 --edit edit.json --out out.mp4 ...

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { editedWords, applyToChapters, applyToQuotes, type EpisodeEdit } from '../../../lib/edit';
import { sequenceLength, sequenceOf, timelineTime, type Clip } from '../../../lib/sequence';
import { DEFAULT_SECTION_JOINS, SECTION_JOIN_LABELS, XFADE, type SectionJoin, type SectionJoins, type Transition } from '../../../lib/transitions';
import { buildCues, editCues, toSrt } from '../../../lib/captions';
import { mmss } from '../../../lib/showNotes';
import { hasAudio, kenBurns, normalizeLoudness, probeDuration } from './media';
import type { CaptionStyle } from '../../../lib/onScreen';
import { layerAudioFilter, layersAss, layerSpan, pictureFilter, type PictureLayer, type TextLayer, type VideoLayer } from '../../../lib/layers';
import { soundFilter, soundsMix, soundSpan, type Sound } from '../../../lib/audio';
import type { RenderQc } from '../../../types/episode';
import { assCheck, measureRender, onScreenChecks } from './renderQc';
import { auphonicInput, deepFilterTrack, placeAt, speakerMix } from './voiceCleanup';
import { auphonicClean, auphonicCreditsHours } from './cleanupVersions';
import { auphonicSpan, hm } from '../../../lib/voice';
import {
    chainStarts, clipPcm, FPS, frameAt, PcmAssembler, RATE, readPcm, SAMPLES_PER_FRAME, windowContents, windowStarts,
    type PlannedPart, type PlannedPiece,
} from './renderWindows';

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
// afftdn hands its sound on AFFTDN_DELAY_SEC late (measured at 44.1 and 48 kHz, whatever its settings), which
// put the voice that much behind the picture; its first 25 ms are dropped and the end padded, so the
// standard clean-up stays within a third of a millisecond (spec 019 item 3.2).
export const AFFTDN_DELAY_SEC = 0.025;
export function cleanupFilter(clean: 'light' | 'strong', noiseModel: string | undefined): string {
    const denoise = clean === 'strong' && noiseModel ? `arnndn=model=${noiseModel}`
        : `afftdn=nr=12,atrim=start=${AFFTDN_DELAY_SEC},asetpts=PTS-STARTPTS,apad=pad_dur=${AFFTDN_DELAY_SEC}`;
    return `aresample=async=1:first_pts=0,highpass=f=80,${denoise},acompressor=threshold=-20dB:ratio=2:attack=5:release=50`;
}

async function cleanTrack(video: string, out: string, clean: 'light' | 'strong', noiseModel: string | undefined) {
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-vn',
        '-af', cleanupFilter(clean, noiseModel), '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', out]);
}

// The render's frame rate. Each kept stretch becomes a whole number of frames, counted from where it
// starts and ends in the edited episode, so the finished video keeps to the edit's times (within half
// a frame) however many cuts there are. Rounding each stretch up on its own, as before, made a long
// edit run later and later: about 20 ms a cut, so captions and chapters drifted.
export { FPS, frameAt };
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
// `audio` false joins the pictures only (the render's windows; the sound is made on its own).
export function chainPieces(pieces: Piece[], out: { v: string; a: string }, tag: string, audio = true): { filter: string; starts: number[]; frames: number } {
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
            if (audio) filter += `[${a}][${p.a}]acrossfade=d=${secs}:c1=tri:c2=tri[${na}];`;
            starts.push(frames - d);
            frames += p.frames - d;
            tail = p.frames - d;
        } else {
            filter += `[${v}][${p.v}]concat=n=2:v=1:a=0[${nv}];`;
            if (audio) filter += `[${a}][${p.a}]concat=n=2:v=0:a=1[${na}];`;
            starts.push(frames);
            frames += p.frames;
            tail = p.frames;
        }
        v = nv; a = na;
    }
    if (pieces.length === 1) filter += `[${v}]null[${out.v}];` + (audio ? `[${a}]anull[${out.a}];` : '');
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
    // The voice clean-up: 'light' is the standard chain (cleanupFilter); 'deepfilter' and 'auphonic' are spec 019
    // item 3.2's choices (voiceCleanup.ts), each needing its part of `voice`.
    clean?: 'off' | 'light' | 'strong' | 'deepfilter' | 'auphonic';
    voice?: {
        deepFilter?: string;                       // the deep-filter program
        // Auphonic: the key, the production's title, and a call made just before the audio is sent (the job
        // then keeps the hold on the month's free hours even if the render fails later).
        auphonic?: { apiKey: string; title: string; onSending?: () => Promise<void> };
    };
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
    // Where finished windows (and an expensive voice clean-up) are kept, so a retried run skips them (spec 019
    // item 4.2): `get` fetches a kept file to `local` and says whether there was one.
    store?: { get: (name: string, local: string) => Promise<boolean>; put: (local: string, name: string) => Promise<void> };
    // One audio file per speaker (spec 019 item 3.3), local: the voice is made from them instead of the recording's sound.
    tracks?: string[];
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

    // Auphonic's cut detection, when asked for. It works in "export_uncut_audio" mode, so our cut list stays the
    // record. (Auphonic as the voice clean-up is below, with the other clean-ups.)
    let cleanedAudio: string | null = null;
    if (opts.detect === 'auphonic') {
        const { auphonicProcess, auphonicCutsToEdit } = await import('./auphonic');
        const result = await auphonicProcess(opts.video, {
            detectOnly: true,
            fillerCutting: true,
            silenceCutting: true,
            coughCutting: true,
            noiseReduction: false,
        });
        seq = sequenceOf({ ...opts.edit, cuts: [...opts.edit.cuts, ...auphonicCutsToEdit(result.regions)] }, inMs, opts.words);
        ranges = seq.clips;
        editedMs = sequenceLength(ranges);
    }

    // Temporary files: the cleaned sound, b-roll clips and blocks. All of them are removed
    // at the end, whether the render worked or not.
    const stamp = Date.now();
    const tmpDir = path.join(path.dirname(opts.out), `_broll_${stamp}`);
    const cleanDir = path.join(path.dirname(opts.out), `_clean_${stamp}`);
    let blockDir = '';
    const onScreenWarnings: string[] = [];
    try {
        // The voice cleanup runs once, over the whole episode (see cleanupFilter), into a track at the video's times.
        // Speaker tracks (spec 019 item 3.3): the voice is made from them, then cleaned up as the recording's would be.
        let voiceSource = opts.video;
        if (opts.tracks?.length && ranges.length > 0) {
            fs.mkdirSync(cleanDir, { recursive: true });
            voiceSource = path.join(cleanDir, 'tracks.wav');
            const lags = await speakerMix(opts.video, opts.tracks, voiceSource, inSeconds);
            console.log(`  🎚️ ${opts.tracks.length} speaker tracks, shifted ${lags.map(l => `${l} ms`).join(', ')} to the recording`);
            if (clean === 'off') cleanedAudio = voiceSource;
        }
        if (clean !== 'off' && ranges.length > 0) {
            fs.mkdirSync(cleanDir, { recursive: true });
            cleanedAudio = path.join(cleanDir, 'cleaned.wav');
            // DeepFilterNet's minutes and Auphonic's hours are not spent twice: a retried run finds the cleaned
            // track an earlier attempt kept (as FLAC, about half the size).
            const keptName = `voice-${clean}-${windowKey([path.basename(opts.video), String(inMs), JSON.stringify(auphonicSpan(opts.edit, inMs, opts.words)), ...(opts.tracks ?? []).map(t => path.basename(t))], '', 0)}.flac`;
            const keptFile = path.join(cleanDir, keptName);
            const kept = (clean === 'deepfilter' || clean === 'auphonic') && opts.store
                && await opts.store.get(keptName, keptFile).catch(() => false);
            if (kept) await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', keptFile, '-c:a', 'pcm_s16le', cleanedAudio]);
            else if (clean === 'light' || clean === 'strong') await cleanTrack(voiceSource, cleanedAudio, clean, opts.noiseModel);
            else if (clean === 'deepfilter') {
                if (!opts.voice?.deepFilter) throw new Error('DeepFilterNet was chosen, but its program is not on the runner (DEEPFILTER_BIN)');
                await deepFilterTrack(voiceSource, cleanedAudio, { bin: opts.voice.deepFilter, workDir: cleanDir, durationSec: inSeconds });
            } else {
                const a = opts.voice?.auphonic;
                if (!a) throw new Error('Auphonic was chosen, but there is no AUPHONIC_API_KEY repo secret');
                const span = auphonicSpan(opts.edit, inMs, opts.words)!;
                const hours = await auphonicCreditsHours(a.apiKey);
                const needed = (span.endMs - span.startMs) / 3600_000;
                if (hours !== null && hours < needed) {
                    throw new Error(`The Auphonic account has ${hm(hours * 3600)} left and this episode needs ${hm(needed * 3600)}. Choose Standard or DeepFilterNet for it.`);
                }
                const sent = path.join(cleanDir, 'auphonic-in.flac'), back = path.join(cleanDir, 'auphonic-out.flac');
                await auphonicInput(voiceSource, span, sent);
                await a.onSending?.();
                await auphonicClean(sent, back, a.apiKey, a.title);
                await placeAt(back, span.startMs, inSeconds, cleanedAudio);
            }
            if (!kept && (clean === 'deepfilter' || clean === 'auphonic') && opts.store) {
                await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', cleanedAudio, '-c:a', 'flac', keptFile]);
                await opts.store.put(keptFile, keptName).catch(error => console.warn(`⚠️ The cleaned voice was not kept for a retry: ${(error as Error).message}`));
            }
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

        // ── The plan (spec 019 item 4.2, renderWindows.ts) ──────────────────────
        // The episode's parts (the stretches between transitions at splits) and the programme's pieces
        // (teasers, intro, episode, outro), each in whole frames with its first frame in the finished video.
        const sections: SectionJoins = opts.sections ?? DEFAULT_SECTION_JOINS;
        const warnings = Object.entries(seq.skipped).map(([key, why]) => `The transition at ${mmss(Number(key.slice('split:'.length)))}: ${why}`);
        const groups: Clip[][] = [];
        for (const r of ranges) {
            if (!groups.length || (r.part ?? 0) !== (groups[groups.length - 1][0].part ?? 0)) groups.push([]);
            groups[groups.length - 1].push(r);
        }
        const parts: PlannedPart[] = groups.map((clips, k) => {
            let at = 0;
            const planned = clips.map(c => { const p = { startMs: c.startMs, endMs: c.endMs, at, frames: framesOf(c) }; at += p.frames; return p; });
            const first = clips[0], prev = k > 0 ? groups[k - 1][groups[k - 1].length - 1] : null;
            const join = prev ? seq.joins.find(j => j.part === first.part) : undefined;
            return {
                clips: planned, start: 0, frames: at,
                join: join && prev ? frameAt(prev.atMs + prev.endMs - prev.startMs) - frameAt(first.atMs) : 0,
                xfade: join ? XFADE[join.transition] : null,
            };
        });
        const partChain = chainStarts(parts);
        parts.forEach((p, k) => { p.start = partChain.starts[k]; p.join = partChain.joins[k]; });
        const episodeFrames = parts.length ? partChain.frames : 1;

        const framesOfFile = async (f: string) => Math.max(1, frameAt(Math.round((await probeDuration(f)) * 1000)));
        const pieces: PlannedPiece[] = [];
        let prevLeft = 0;      // what the piece before has left after its own transition in
        const put = (kind: PlannedPiece['kind'], file: string | null, frames: number, at: SectionJoin | null) => {
            const t: Transition | null = at && pieces.length ? sections[at] : null;
            let join = 0, xfade: string | null = null;
            if (at && t && t.transition !== 'cut') {
                const d = frameAt(t.durationMs);
                if (d <= prevLeft && d <= frames) { join = d; xfade = XFADE[t.transition]; }
                else warnings.push(`${SECTION_JOIN_LABELS[at]}: the transition is longer than the clips around it, so it plays as a straight cut.`);
            }
            pieces.push({ kind, file, start: 0, frames, join, xfade });
            prevLeft = frames - join;
        };
        for (const [i, t] of (opts.teasers ?? []).entries()) put('teaser', t, await framesOfFile(t), i > 0 ? 'betweenTeasers' : null);
        if (opts.intro) put('intro', opts.intro, await framesOfFile(opts.intro), opts.teasers?.length ? 'afterTeasers' : null);
        const episodePiece = pieces.length;
        put('episode', null, episodeFrames, opts.intro ? 'afterIntro' : opts.teasers?.length ? 'afterTeasers' : null);
        if (opts.outro) put('outro', opts.outro, await framesOfFile(opts.outro), 'beforeOutro');
        const programme = chainStarts(pieces);
        pieces.forEach((p, k) => { p.start = programme.starts[k]; p.join = programme.joins[k]; });
        const edgeFrames = { start: sections.start.transition === 'cut' ? 0 : Math.min(frameAt(sections.start.durationMs), programme.frames),
            end: sections.end.transition === 'cut' ? 0 : Math.min(frameAt(sections.end.durationMs), programme.frames) };

        // What shows over the episode, in its own time: b-roll, picture layers, then captions and text.
        const broll = (opts.broll ?? []).flatMap((b, i) => {
            const at = brollFiles[i] ? timelineTime(ranges, b.atMs, true) : null;
            return at === null ? [] : [{ file: brollFiles[i], startSec: at / 1000, endSec: at / 1000 + b.seconds }];
        });
        let assFile: string | null = null;
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
                assFile = path.join(tmpDir, 'onscreen.ass');
                fs.writeFileSync(assFile, ass);
            }
        }
        const sounds = (opts.sounds ?? []).flatMap(s => { const span = soundSpan(s.sound, ranges, editedMs); return span ? [{ ...s, span }] : []; });

        // ── The sound, made once for the whole programme ────────────────────────
        // The voice (cleaned, or as recorded) from time 0 of the video, as raw 48 kHz stereo; the kept stretches
        // in order with a 15 ms fade at each cut and the parts crossfaded at transitions; music, effects and
        // video layers' sound mixed under it; then the teasers, intro and outro joined around it, the fades at
        // the very start and end, and the loudness.
        blockDir = path.join(path.dirname(opts.out), `_blocks_${stamp}`);
        fs.mkdirSync(blockDir, { recursive: true });
        const raw = (name: string) => path.join(blockDir, name);
        const S16 = ['-f', 's16le', '-ar', String(RATE), '-ac', '2'];
        const voiceRaw = raw('voice.raw');
        await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', cleanedAudio ?? opts.video, '-vn',
            '-af', 'aresample=async=1:first_pts=0', ...S16, voiceRaw]);
        const hold = Math.max(1, ...parts.map(p => p.join), ...pieces.map(p => p.join)) * SAMPLES_PER_FRAME;
        const episodeRaw = raw('episode.raw');
        {
            const asm = new PcmAssembler(episodeRaw, hold);
            const fd = fs.openSync(voiceRaw, 'r');
            for (const p of parts) p.clips.forEach((c, k) => asm.add(clipPcm(fd, c.startMs, c.frames, fadeSecs * 1000), k === 0 ? p.join * SAMPLES_PER_FRAME : 0));
            if (!parts.length) asm.add(new Int16Array(SAMPLES_PER_FRAME * 2));
            asm.close();
            fs.closeSync(fd);
        }
        let mixedRaw = episodeRaw;
        const layerSounds = pictures.filter(p => p.sound && p.layer.kind === 'video');
        if (sounds.length || layerSounds.length) {
            const args = ['-y', '-hide_banner', '-loglevel', 'error', ...S16, '-i', episodeRaw];
            let f = '[0:a]anull[epa];';
            const ducked: string[] = [], others: string[] = [];
            layerSounds.forEach((p, i) => {
                args.push('-i', p.file);
                f += layerAudioFilter(i + 1, `lya${i}`, p.layer as VideoLayer, p.span) ?? '';
                others.push(`lya${i}`);
            });
            sounds.forEach((s, i) => {
                args.push(...(s.sound.loop ? ['-stream_loop', '-1'] : []), '-i', s.file);
                f += soundFilter(layerSounds.length + i + 1, `snd${i}`, s.sound, s.span);
                (s.sound.duck ? ducked : others).push(`snd${i}`);
            });
            f += soundsMix('epa', ducked, others, 'epam');
            f += `[epam]apad,atrim=end_sample=${episodeFrames * SAMPLES_PER_FRAME}[mix]`;
            mixedRaw = raw('mixed.raw');
            await run('ffmpeg', [...args, '-filter_complex', f, '-map', '[mix]', ...S16, mixedRaw]);
        }
        const programmeRaw = raw('programme.raw');
        {
            const asm = new PcmAssembler(programmeRaw, hold);
            for (const [k, p] of pieces.entries()) {
                const overlap = p.join * SAMPLES_PER_FRAME;
                if (p.kind === 'episode') {
                    const fd = fs.openSync(mixedRaw, 'r');
                    const chunk = 10 * RATE;
                    for (let at = 0, total = p.frames * SAMPLES_PER_FRAME; at < total; at += chunk) asm.add(readPcm(fd, at, Math.min(chunk, total - at)), at === 0 ? overlap : 0);
                    fs.closeSync(fd);
                    continue;
                }
                const secs = (p.frames / FPS).toFixed(6), file = raw(`section_${k}.raw`), sound = await hasAudio(p.file!);
                await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', p.file!,
                    ...(sound ? [] : ['-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=${RATE}`]),
                    '-filter_complex', `[${sound ? 0 : 1}:a]aformat=sample_rates=${RATE}:channel_layouts=stereo,apad=whole_dur=${secs},atrim=duration=${secs}[a]`,
                    '-map', '[a]', ...S16, file]);
                const fd = fs.openSync(file, 'r');
                asm.add(readPcm(fd, 0, p.frames * SAMPLES_PER_FRAME), overlap);
                fs.closeSync(fd);
            }
            asm.close();
        }
        // At the very start and end, a transition is a fade from or to black, and the sound fades with it.
        const fades = [
            ...(edgeFrames.start ? [`afade=t=in:st=0:d=${(edgeFrames.start / FPS).toFixed(6)}`] : []),
            ...(edgeFrames.end ? [`afade=t=out:st=${((programme.frames - edgeFrames.end) / FPS).toFixed(6)}:d=${(edgeFrames.end / FPS).toFixed(6)}`] : []),
        ];
        const programmeWav = raw('programme.wav'), audioOut = raw('programme.m4a');
        await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...S16, '-i', programmeRaw,
            '-af', [...fades, `atrim=end_sample=${programme.frames * SAMPLES_PER_FRAME}`].join(','), '-c:a', 'pcm_s16le', programmeWav]);
        let normalization: string | null = null;
        if (clean !== 'off') ({ normalization } = await normalizeLoudness(programmeWav, audioOut));
        else await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', programmeWav, '-c:a', 'aac', '-b:a', '192k', audioOut]);
        for (const f of [voiceRaw, episodeRaw, mixedRaw, programmeRaw, programmeWav]) { try { fs.unlinkSync(f); } catch {} }

        // ── The picture, in windows, each encoded once ──────────────────────────
        const starts = windowStarts(pieces, parts, programme.frames,
            { maxFrames: blockMinutes * 60 * FPS, maxClips: MAX_WINDOW_CLIPS, edges: edgeFrames });
        const windows = starts.map((from, i) => ({ from, to: starts[i + 1] ?? programme.frames }));
        const windowFiles: string[] = new Array(windows.length);
        const renderWindow = async (w: { from: number; to: number }, i: number) => {
            const c = windowContents(pieces, parts, w.from, w.to);
            const inputs: string[] = [];
            const add = (before: string[], file: string) => { inputs.push(...before, '-i', file); return inputs.filter(a => a === '-i').length - 1; };
            let f = '';
            const local: Piece[] = [];
            for (const { piece, index } of c.pieces) {
                const join = local.length && piece.join ? { xfade: piece.xfade!, frames: piece.join } : null;
                if (piece.kind !== 'episode') {
                    const n = add([], piece.file!);
                    f += `[${n}:v]${FILL_1080},fps=${FPS},tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${piece.frames},setpts=PTS-STARTPTS,format=yuv420p[s${index}];`;
                    local.push({ v: `s${index}`, a: '', frames: piece.frames, join });
                    continue;
                }
                const ep = c.episode!;
                if (!ep.parts.length) {
                    f += `color=c=black:s=1920x1080:r=${FPS}:d=${(ep.frames / FPS).toFixed(6)},format=yuv420p[ep];`;
                } else {
                    // Each kept stretch seeked on its own, cut to its frames; the parts joined as in the episode.
                    const partPieces: Piece[] = ep.parts.map(({ part, clips, frames }, k) => {
                        const labels = clips.map((cl, j) => {
                            const n = add(['-ss', (cl.startMs / 1000).toFixed(3), '-t', (cl.frames / FPS + 1).toFixed(3)], opts.video);
                            f += `[${n}:v]fps=${FPS},tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${cl.frames},setpts=PTS-STARTPTS,${FILL_1080},format=yuv420p[c${k}_${j}];`;
                            return `[c${k}_${j}]`;
                        });
                        f += labels.length > 1 ? `${labels.join('')}concat=n=${labels.length}:v=1:a=0[pt${k}];` : `${labels[0]}null[pt${k}];`;
                        return { v: `pt${k}`, a: '', frames, join: k > 0 && part.join ? { xfade: part.xfade!, frames: part.join } : null };
                    });
                    f += chainPieces(partPieces, { v: 'epc', a: '' }, 'pj', false).filter;
                    // Over it, in the episode's own time: b-roll, picture layers, captions and text.
                    const fromSec = ep.from / FPS, toSec = (ep.from + ep.frames) / FPS;
                    f += `[epc]setpts=PTS-STARTPTS+${fromSec.toFixed(6)}/TB[e0];`;
                    let v = 'e0';
                    broll.filter(b => b.startSec < toSec && b.endSec > fromSec).forEach((b, j) => {
                        const n = add([], b.file);
                        f += `[${n}:v]setpts=PTS-STARTPTS+${b.startSec}/TB,format=yuv420p,fade=t=in:st=${b.startSec.toFixed(3)}:d=0.5:alpha=1,fade=t=out:st=${(b.endSec - 0.5).toFixed(3)}:d=0.5:alpha=1[br${j}];`;
                        f += `[${v}][br${j}]overlay=x=0:y=0:enable='between(t,${b.startSec.toFixed(3)},${b.endSec.toFixed(3)})':eof_action=pass,format=yuv420p[eb${j}];`;
                        v = `eb${j}`;
                    });
                    pictures.filter(p => p.span.startMs / 1000 < toSec && p.span.endMs / 1000 > fromSec).forEach((p, j) => {
                        const n = add(p.clip ? [] : ['-loop', '1', '-t', ((p.span.endMs - p.span.startMs) / 1000 + 0.5).toFixed(3)], p.file);
                        f += pictureFilter(n, v, `ly${j}`, p.layer, p.span);
                        v = `ly${j}`;
                    });
                    if (assFile) { f += `[${v}]subtitles=filename=${filterPath(assFile)}:fontsdir=${filterPath(FONTS_DIR)},format=yuv420p[es];`; v = 'es'; }
                    // After an overlay the last frame has no length, and the fps before a transition drops it: held
                    // one frame and cut to the episode's frames, the stream always has exactly as many as planned.
                    f += `[${v}]setpts=PTS-STARTPTS,fps=${FPS},tpad=stop_mode=clone:stop=1,trim=end_frame=${ep.frames}[ep];`;
                }
                local.push({ v: 'ep', a: '', frames: ep.frames, join });
            }
            f += chainPieces(local, { v: 'pg', a: '' }, 'pc', false).filter;
            const lo = w.from - c.first, hi = w.to - c.first;
            const edges = [
                ...(w.from === 0 && edgeFrames.start ? [`fade=t=in:st=0:d=${(edgeFrames.start / FPS).toFixed(6)}${sections.start.transition === 'fadeWhite' ? ':color=white' : ''}`] : []),
                ...(w.to === programme.frames && edgeFrames.end ? [`fade=t=out:st=${((hi - lo - edgeFrames.end) / FPS).toFixed(6)}:d=${(edgeFrames.end / FPS).toFixed(6)}${sections.end.transition === 'fadeWhite' ? ':color=white' : ''}`] : []),
            ];
            f += `[pg]trim=start_frame=${lo}:end_frame=${hi},setpts=PTS-STARTPTS${edges.map(e => `,${e}`).join('')},format=yuv420p[out]`;
            const encode = ['-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS)];
            // A retried run finds the windows an earlier attempt finished (opts.store), named by what made them.
            const name = `window-${i}-${windowKey([...inputs, f, ...encode], path.dirname(opts.out), stamp)}.mkv`;
            const file = path.join(blockDir, name);
            if (opts.store && await opts.store.get(name, file).catch(() => false) && await frameCount(file) === w.to - w.from) {
                windowFiles[i] = file;
                return;
            }
            await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', f, ...encode, file]);
            const made = await frameCount(file);
            if (made !== w.to - w.from) throw new Error(`Window ${i + 1} has ${made} frames where ${w.to - w.from} were planned`);
            windowFiles[i] = file;
            await opts.store?.put(file, name).catch(error => console.warn(`⚠️ Window ${i + 1} not kept for a retry: ${(error as Error).message}`));
        };
        // Two at a time: ffmpeg's decoding, scaling and subtitles use one core each, the encoder the rest.
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(PARALLEL_WINDOWS, windows.length) }, async () => {
            while (next < windows.length) { const i = next++; await renderWindow(windows[i], i); }
        }));

        // The windows joined without encoding again, with the programme's sound.
        const list = path.join(blockDir, 'windows.txt');
        fs.writeFileSync(list, windowFiles.map(f => `file '${path.resolve(f)}'`).join('\n') + '\n');
        await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', audioOut,
            '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart', opts.out]);

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

// A window has at most this many kept stretches (each is a seeked input of its own), and two are made at once.
export const MAX_WINDOW_CLIPS = 20;
const PARALLEL_WINDOWS = 2;

// What names a window for a retry: the ffmpeg arguments that make it, with this run's folders taken out.
export function windowKey(args: string[], workDir: string, stamp: number): string {
    const text = args.join('\u0000').split(workDir).join('').split(String(stamp)).join('');
    return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

// The frames in a video file's picture, counted from its packets (no decoding).
async function frameCount(file: string): Promise<number> {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets',
        '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file]);
    return Number(stdout.trim());
}

// ─── command line ────────────────────────────────────────────────────────────

interface ParsedArgs {
    video?: string; editPath?: string; out?: string;
    teasers: string[]; intro?: string; outro?: string;
    broll: BrollArg[]; clean: 'off' | 'light' | 'strong' | 'deepfilter' | 'auphonic'; detect?: 'auphonic'; noiseModel?: string; blockMinutes?: number;
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
            case '--clean': args.clean = argv[++i] as ParsedArgs['clean']; break;
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
        console.error('Usage: editRender.ts --video in.mp4 --edit edit.json --out out.mp4 [--teaser a.mp4] [--intro intro.mp4] [--outro outro.mp4] [--broll json] [--clean off|light|strong|deepfilter|auphonic] [--block-minutes N]');
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
