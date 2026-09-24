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

// One clip from the original at full quality, re-encoded so it starts exactly on time
// (a stream copy can only cut on keyframes).
export function cutClip(input: string, output: string, startSeconds: number, durationSeconds: number) {
    return run('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-ss', startSeconds.toFixed(3), '-i', input, '-t', durationSeconds.toFixed(3),
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart',
        output,
    ]);
}
