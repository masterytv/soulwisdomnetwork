// Editor Light (spec 015), phase 2: renders the edited episode as an mp4 with ffmpeg.
// Cuts the episode to its play order (lib/sequence.ts), joins teasers → intro → edited → outro at 1920x1080 30fps,
// lays b-roll over the edited timeline (using kenBurns from media.ts), cleans audio
// (highpass → afftdn/arnndn → acompressor → normalizeLoudness), and writes a JSON report.
// Part I: burns in captions, text overlays (such as name titles) and image overlays (lib/onScreen.ts).
// Run: npx tsx agent/src/podcast/editRender.ts --video in.mp4 --edit edit.json --out out.mp4 ...

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { editedWords, applyToChapters, applyToQuotes, type EpisodeEdit } from '../../../lib/edit';
import { playOrder, sequenceLength, timelineTime } from '../../../lib/sequence';
import { buildCues, toSrt } from '../../../lib/captions';
import { kenBurns, normalizeLoudness, probeDuration } from './media';
import { buildAss, imageOverlayFilter, placeOverlays, type CaptionStyle, type ImageOverlay, type TextOverlay } from '../../../lib/onScreen';
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
function cleanupFilter(clean: 'light' | 'strong', noiseModel: string | undefined): string {
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

// ─── types ──────────────────────────────────────────────────────────────────

interface BrollArg { atMs: number; seconds: number; image: string }

interface RenderReport {
    inputSeconds: number;
    outputSeconds: number;
    cuts: number;
    timeSavedSeconds: number;
    renderSeconds: number;
    qc: RenderQc;                 // the quality report on the finished file (renderQc.ts)
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
    // On-screen text and pictures (Part I): captions in this look (null for none), text overlays and
    // image overlays (each with its local file), all placed on the edited episode.
    onScreen?: { captions: CaptionStyle | null; texts: TextOverlay[]; images: { overlay: ImageOverlay; file: string }[] };
    // The accepted transcript and show-note times, when known: their new times are written
    // next to the output, so the final cut never has to be transcribed again.
    words?: { text: string; start: number; end: number }[];
    chapters?: { title: string; startMs: number }[];
    quotes?: { text: string; speaker: string; startMs: number; endMs: number }[];
}): Promise<RenderReport> {
    const start = Date.now();
    const clean = opts.clean ?? 'light';
    const blockMinutes = opts.blockMinutes ?? 15;
    const inSeconds = await probeDuration(opts.video);
    const inMs = Math.round(inSeconds * 1000);
    // What plays, in order, and where each stretch lands in the edited episode: every time below
    // (b-roll, on-screen items, captions, words, chapters, quotes) is mapped through it.
    let ranges = playOrder(opts.edit, inMs, opts.words);
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
            ranges = playOrder({ ...opts.edit, cuts: [...opts.edit.cuts, ...auphonicCutsToEdit(result.regions)] }, inMs, opts.words);
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

        // ── Block rendering ──────────────────────────────────────────────────────
        // Every render goes through blocks: each range gets its own seeked input,
        // so even a single-range episode is seeked rather than passed whole.
        // Blocks are .mkv with pcm_s16le audio, joined with the concat demuxer.
        // The joined file feeds the teasers/intro/b-roll/outro/loudness.
        const useBlocks = ranges.length > 0;
        let episodeVideoForAssembly = opts.video;

        if (useBlocks) {
            blockDir = path.join(path.dirname(opts.out), `_blocks_${stamp}`);
            fs.mkdirSync(blockDir, { recursive: true });

            // Group ranges into blocks: accumulate source duration until blockMinutes.
            type Block = { ranges: typeof ranges };
            const blocks: Block[] = [];
            let curBlock: Block = { ranges: [] };
            let blockMs = 0;
            for (const r of ranges) {
                const rDur = r.endMs - r.startMs;
                if ((blockMs + rDur > blockMinutes * 60 * 1000 || curBlock.ranges.length >= 20) && curBlock.ranges.length > 0) {
                    blocks.push(curBlock);
                    curBlock = { ranges: [] };
                    blockMs = 0;
                }
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
                    bFilter += `[${vIdx}:v]fps=${FPS},trim=end_frame=${frames},setpts=PTS-STARTPTS,${FILL_1080},format=yuv420p[bsv${i}];`;
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

            // Join the blocks with the concat demuxer. Full paths, because it reads each path
            // relative to the list file, which breaks when the output folder is relative.
            const concatList = path.join(blockDir, 'concat.txt');
            fs.writeFileSync(concatList, blockFiles.map(f => `file '${path.resolve(f)}'`).join('\n') + '\n');
            const joinedFile = path.join(blockDir, 'joined.mkv');
            await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
                '-f', 'concat', '-safe', '0', '-i', concatList,
                '-c', 'copy', joinedFile]);

            episodeVideoForAssembly = joinedFile;
            for (const bf of blockFiles) { try { fs.unlinkSync(bf); } catch {} }
        }

        // ── Assembly pass: teasers, intro, episode, b-roll, outro, loudness ──────
        // When blocks are used, the episode sound comes from the joined file — do not
        // add the cleaned audio as a separate input here.
        const inputs: string[] = [];
        let idx = 0;
        const teasers = opts.teasers ?? [];
        const teaserIdxs: number[] = [];
        for (const t of teasers) { inputs.push(t); teaserIdxs.push(idx++); }
        const introIdx = opts.intro ? (inputs.push(opts.intro), idx++) : -1;
        const episodeIdx = idx++; inputs.push(episodeVideoForAssembly);
        const outroIdx = opts.outro ? (inputs.push(opts.outro), idx++) : -1;
        const brollIdxs: number[] = [];
        for (const bf of brollFiles) { if (bf) { inputs.push(bf); brollIdxs.push(idx++); } else brollIdxs.push(-1); }
        // Image overlays: one input each, placed on the edited timeline.
        const images = placeOverlays((opts.onScreen?.images ?? []).map(i => ({ ...i.overlay, file: i.file })), ranges, editedMs);
        const imageIdxs: number[] = [];
        for (const im of images) { inputs.push(im.overlay.file); imageIdxs.push(idx++); }

        let filter = '';

        // Teasers.
        const teaserLabels: string[] = [];
        for (let i = 0; i < teaserIdxs.length; i++) {
            filter += `[${teaserIdxs[i]}:v]${FILL_1080},format=yuv420p[tv${i}];`;
            filter += `[${teaserIdxs[i]}:a]aformat=sample_rates=48000:channel_layouts=stereo[ta${i}];`;
            teaserLabels.push(`tv${i}`, `ta${i}`);
        }

        // Intro + outro.
        if (introIdx >= 0) {
            filter += `[${introIdx}:v]${FILL_1080},format=yuv420p[intv];`;
            filter += `[${introIdx}:a]aformat=sample_rates=48000:channel_layouts=stereo[inta];`;
        }
        if (outroIdx >= 0) {
            filter += `[${outroIdx}:v]${FILL_1080},format=yuv420p[outv];`;
            filter += `[${outroIdx}:a]aformat=sample_rates=48000:channel_layouts=stereo[outa];`;
        }

        // The episode: the joined blocks, or, when everything was cut, a moment of black.
        if (useBlocks) {
            filter += `[${episodeIdx}:v]${FILL_1080},format=yuv420p[epv];`;
            filter += `[${episodeIdx}:a]aformat=sample_rates=48000:channel_layouts=stereo[epa];`;
        } else {
            filter += `color=c=black:s=1920x1080:d=0.04,format=yuv420p[epv];`;
            filter += `anullsrc=channel_layout=stereo:sample_rate=48000:d=0.04[epa];`;
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

        // On screen (Part I): images over the b-roll, then captions and text over everything.
        images.forEach((im, i) => {
            filter += imageOverlayFilter(imageIdxs[i], epV, `im${i}`, im);
            epV = `im${i}`;
        });
        if (opts.onScreen) {
            const cues = opts.onScreen.captions && opts.words?.length ? buildCues(editedWords(opts.words, ranges)) : [];
            const placedTexts = placeOverlays(opts.onScreen.texts, ranges, editedMs);
            const ass = buildAss(cues, opts.onScreen.captions, placedTexts);
            // For the quality report: what the plan asked for against the edit and the subtitle file.
            onScreenWarnings.push(
                ...onScreenChecks([
                    ...opts.onScreen.texts.map(t => ({ atMs: t.atMs, seconds: t.seconds, label: t.text })),
                    ...opts.onScreen.images.map(i => ({ atMs: i.overlay.atMs, seconds: i.overlay.seconds, label: i.overlay.name || 'image' })),
                ], ranges, editedMs),
                ...assCheck(ass, cues.length + placedTexts.length),
            );
            if (ass) {
                fs.mkdirSync(tmpDir, { recursive: true });
                const assFile = path.join(tmpDir, 'onscreen.ass');
                fs.writeFileSync(assFile, ass);
                filter += `[${epV}]subtitles=filename=${filterPath(assFile)}:fontsdir=${filterPath(FONTS_DIR)},format=yuv420p[eps];`;
                epV = 'eps';
            }
        }

        // Final concat: teasers → intro → episode → outro (video and audio interleaved).
        const allV: string[] = [];
        const allA: string[] = [];
        for (let i = 0; i < teaserLabels.length; i += 2) { allV.push(teaserLabels[i]); allA.push(teaserLabels[i + 1]); }
        if (introIdx >= 0) { allV.push('intv'); allA.push('inta'); }
        allV.push(epV); allA.push('epa');
        if (outroIdx >= 0) { allV.push('outv'); allA.push('outa'); }
        const finalInterleave: string[] = [];
        for (let i = 0; i < allV.length; i++) { finalInterleave.push(allV[i]); finalInterleave.push(allA[i]); }
        filter += `${finalInterleave.map(l => `[${l}]`).join('')}concat=n=${allV.length}:v=1:a=1[outv][outa];`;

        // Run ffmpeg.
        const rawOut = opts.out + '.raw.mp4';
        const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error'];
        for (const inp of inputs) args.push('-i', inp);
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
        // Everything before the episode (teasers, then the intro) pushes its times later.
        let offsetMs = 0;
        for (const f of [...(opts.teasers ?? []), ...(opts.intro ? [opts.intro] : [])]) offsetMs += Math.round((await probeDuration(f)) * 1000);
        const outroMs = opts.outro ? Math.round((await probeDuration(opts.outro)) * 1000) : 0;
        const qc = await measureRender(opts.out, {
            lengthSeconds: (offsetMs + editedMs + outroMs) / 1000,
            episode: { startSec: offsetMs / 1000, endSec: (offsetMs + editedMs) / 1000 },
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
