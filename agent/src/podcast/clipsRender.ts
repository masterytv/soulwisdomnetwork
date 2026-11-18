// The ffmpeg work for clips (docs/specs/025-clips.md): one stretch of the final cut as its own 16:9 video with a
// half-second fade at each end; the loudness of a stretch, moment by moment, for the thumbnail's loud cues; and
// frames from it, small for Claude to look at or full size and cropped to the speaker for the cut-out. `input` is
// the final cut, a file or a signed Storage link read only around what is needed.

import { CLIP_FADE_S } from '../../../lib/clips';
import { LOOK_HEIGHT, LOOK_WIDTH, parseMomentary } from '../../../lib/clipThumbs';
import { spawn } from 'child_process';
import { AAC, redactUrls, runWithLog, urlInputOptions } from './media';

// A clip encodes at a few times its own length on a runner; this is far past a slow one, so a run still going is stuck.
export const clipTimeLimitMs = (durationSeconds: number) => Math.round((180 + 2 * durationSeconds) * 1000);

// The arguments for one clip: cut exactly (the seek before the input, then re-encoded), its clock restarted at
// zero, the picture and sound faded in and out. The final cut's loudness is kept: it is already at −14 LUFS.
export function clipArgs(input: string, output: string, startSeconds: number, durationSeconds: number): string[] {
    const fadeOut = Math.max(0, durationSeconds - CLIP_FADE_S).toFixed(3);
    return [
        '-y', '-hide_banner', '-loglevel', 'warning',
        ...urlInputOptions(input),
        '-ss', startSeconds.toFixed(3), '-t', durationSeconds.toFixed(3), '-i', input,
        '-filter_complex',
        `[0:v]setpts=PTS-STARTPTS,fade=t=in:st=0:d=${CLIP_FADE_S},fade=t=out:st=${fadeOut}:d=${CLIP_FADE_S},format=yuv420p[v];` +
        `[0:a]asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${CLIP_FADE_S},afade=t=out:st=${fadeOut}:d=${CLIP_FADE_S}[a]`,
        '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-profile:v', 'high',
        ...AAC, '-b:a', '192k', '-ar', '48000',
        '-t', durationSeconds.toFixed(3),
        '-movflags', '+faststart',
        output,
    ];
}

export async function renderClip(input: string, output: string, startSeconds: number, durationSeconds: number) {
    await runWithLog('ffmpeg', clipArgs(input, output, startSeconds, durationSeconds), clipTimeLimitMs(durationSeconds));
}

// The momentary loudness every 100 ms over a stretch, on the final cut's times (sound only, read once). ffmpeg
// prints a line for each 100 ms at its verbose level; they are read as they come, since runWithLog keeps only the
// last few thousand characters of what ffmpeg says.
export function momentaryLoudness(input: string, startSeconds: number, durationSeconds: number): Promise<{ ms: number; lufs: number }[]> {
    const offset = Math.round(startSeconds * 1000);
    return new Promise((resolve, reject) => {
        const child = spawn('ffmpeg', [
            '-hide_banner', '-nostats', '-loglevel', 'verbose', ...urlInputOptions(input),
            '-ss', startSeconds.toFixed(3), '-t', durationSeconds.toFixed(3), '-i', input,
            '-vn', '-af', 'ebur128=framelog=verbose', '-f', 'null', '-',
        ], { stdio: ['ignore', 'ignore', 'pipe'] });
        const out: { ms: number; lufs: number }[] = [];
        let rest = '', tail = '';
        child.stderr.on('data', d => {
            const text = rest + String(d);
            const cut = text.lastIndexOf('\n');
            rest = cut < 0 ? text : text.slice(cut + 1);
            if (cut >= 0) for (const p of parseMomentary(text.slice(0, cut))) out.push({ ms: p.ms + offset, lufs: p.lufs });
            tail = (tail + String(d)).slice(-1000);
        });
        const timer = setTimeout(() => child.kill('SIGKILL'), clipTimeLimitMs(durationSeconds));
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('close', code => {
            clearTimeout(timer);
            for (const p of parseMomentary(rest)) out.push({ ms: p.ms + offset, lufs: p.lufs });
            if (code === 0) resolve(out);
            else reject(new Error(`ffmpeg could not measure the loudness (${code}): ${redactUrls(tail.split('\n').slice(-3).join(' '))}`));
        });
    });
}

// One frame as a JPEG. Small: 640x360 for Claude. Full: the frame at 1920x1080, then cropped to `crop` (pixels of
// that size) when given; without a crop and with `size` 1280, the 1280x720 still the "From the clip" background uses.
export function frameArgs(input: string, output: string, seconds: number, o: { size: 'small' | 'full' | 'still'; crop?: { x: number; y: number; w: number; h: number } }) {
    const scale = o.size === 'small' ? `scale=${LOOK_WIDTH}:${LOOK_HEIGHT}` : o.size === 'still' ? 'scale=1280:720' : 'scale=1920:1080';
    const crop = o.crop && o.size === 'full' ? `,crop=${o.crop.w}:${o.crop.h}:${o.crop.x}:${o.crop.y}` : '';
    return [
        '-y', '-hide_banner', '-loglevel', 'error', ...urlInputOptions(input),
        '-ss', seconds.toFixed(3), '-i', input, '-frames:v', '1',
        '-vf', `scale=iw*sar:ih,setsar=1,${scale}:flags=lanczos${crop}`,
        '-q:v', o.size === 'small' ? '4' : '2',
        output,
    ];
}

export async function grabClipFrame(input: string, output: string, seconds: number, o: Parameters<typeof frameArgs>[3]) {
    await runWithLog('ffmpeg', frameArgs(input, output, seconds, o), 2 * 60_000);
}
