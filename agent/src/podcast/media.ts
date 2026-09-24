import { spawn } from 'child_process';
import { PermanentError } from './errors';

function run(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', d => { stdout += d; });
        child.stderr.on('data', d => { stderr = (stderr + d).slice(-4000); });
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) resolve(stdout);
            // ffmpeg failing on a file is bad input, not a network blip.
            else reject(new PermanentError(`${cmd} exited with ${code}: ${stderr.split('\n').slice(-5).join(' ').trim()}`));
        });
    });
}

export async function probeDuration(file: string): Promise<number> {
    const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    const seconds = parseFloat(out.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) throw new PermanentError(`Could not read duration of ${file}`);
    return seconds;
}

// 720p (never upscaled) H.264 preview for the review page and later AI passes.
export function makeProxy(input: string, output: string) {
    return run('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error', '-i', input,
        '-vf', "scale=-2:'min(720,ih)'",
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        output,
    ]);
}

// Mono speech-quality audio: what gets transcribed and what the review page plays.
export function makeAudio(input: string, output: string) {
    return run('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error', '-i', input,
        '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '96k',
        '-movflags', '+faststart',
        output,
    ]);
}

// Width and height as displayed (non-square pixels applied).
export async function videoSize(file: string) {
    const out = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,sample_aspect_ratio', '-of', 'csv=p=0', file]);
    const [w, h, sar] = out.trim().split(',');
    const [sn, sd] = (sar && sar.includes(':') ? sar.split(':').map(Number) : [1, 1]);
    const ratio = sn > 0 && sd > 0 ? sn / sd : 1;
    const width = Math.round(Number(w) * ratio), height = Number(h);
    if (!width || !height) throw new PermanentError(`Could not read the frame size of ${file}`);
    return { width, height };
}

// True when a frame is 16:9 to within half a percent: it fits a 1920x1080 frame with no bars.
export const isWidescreen = ({ width, height }: { width: number; height: number }) => Math.abs(width / height / (16 / 9) - 1) < 0.005;

// Fills a 1920x1080 frame without distortion: square the pixels, scale evenly until both
// sides cover the frame, then trim the overflow equally from the edges.
const FILL_1080 = 'scale=iw*sar:ih,setsar=1,scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,setsar=1';

// The whole episode, filled to 1920x1080 (for recordings that are not 16:9). Audio untouched.
export function fillFrame(input: string, output: string) {
    return run('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error', '-i', input,
        '-vf', FILL_1080,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        output,
    ]);
}

// One clip from the original at full quality, re-encoded so it starts exactly on time
// (a stream copy can only cut on keyframes). `fill` crops it like fillFrame.
export function cutClip(input: string, output: string, startSeconds: number, durationSeconds: number, fill = false) {
    return run('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-ss', startSeconds.toFixed(3), '-i', input, '-t', durationSeconds.toFixed(3),
        ...(fill ? ['-vf', FILL_1080] : []),
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart',
        output,
    ]);
}
