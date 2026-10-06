// Spec 020 item E7: music and effects in a real render (ffmpeg). A music bed shorter than the episode loops
// to its end and is lowered while the voice speaks (the ducking from Part H's musicMix); an effect anchored
// to a moment of the recording plays there after a cut, at full level, not ducked.
// Run: npx tsx --test agent/src/podcast/soundsRender.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { newSound } from '../../../lib/audio';
import { renderEdit } from './editRender';

const ffmpeg = (args: string[]) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
// The loudness of half a second around one frequency, in dB (-200 for silence).
function level(file: string, seconds: number, hz: number): number {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(seconds), '-t', '0.5', '-i', file, '-vn',
        '-af', `bandpass=f=${hz}:width_type=q:w=8,bandpass=f=${hz}:width_type=q:w=8,astats=measure_overall=RMS_level:measure_perchannel=none`, '-f', 'null', '-'], { encoding: 'utf8' });
    const m = /RMS level dB: (-?[\d.]+|-inf)/.exec(r.stderr ?? '');
    return m && m[1] !== '-inf' ? Number(m[1]) : -200;
}

test('sounds in a render: a looping bed ducked under the voice, an effect on its moment', { timeout: 300_000 }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sounds-'));
    const video = path.join(dir, 'episode.mp4'), bed = path.join(dir, 'bed.wav'), hit = path.join(dir, 'hit.wav'), out = path.join(dir, 'out.mp4');
    // A 10 s episode whose "voice" (1 kHz, about -15 dBFS, as speech is) speaks for its first 5 s; a 3 s bed at 300 Hz; a half-second hit at 2.5 kHz.
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x808080:s=640x360:r=30:d=10', '-f', 'lavfi', '-i', "sine=f=1000:r=48000:d=10,volume='if(lt(t,5),2,0)':eval=frame",
        '-t', '10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', video]);
    ffmpeg(['-f', 'lavfi', '-i', 'sine=f=300:r=48000:d=3', '-ac', '2', bed]);
    ffmpeg(['-f', 'lavfi', '-i', 'sine=f=2500:r=48000:d=0.5', '-ac', '2', hit]);
    // A 1 s cut at 1-2 s: the voice now speaks for 0-4 s, the rest is quiet until 9 s.
    const music = { ...newSound({ path: 'library/sbed.wav', name: 'bed', library: 'bed1' }, 'music', { srcMs: 0, atMs: 0 }), gainDb: -6, fadeInMs: 0, fadeOutMs: 0 };
    const effect = newSound({ path: 'library/shit.wav', name: 'hit', durationMs: 500, library: 'hit1' }, 'effect', { srcMs: 7000, atMs: 0 });
    const report = await renderEdit({
        video, out, clean: 'off',
        edit: { version: 1, cuts: [{ startMs: 1000, endMs: 2000, reason: 'manual' }] },
        sounds: [{ sound: music, file: bed }, { sound: effect, file: hit }],
    });
    assert.deepEqual(report.soundsPlayed.sort(), [effect.id, music.id].sort());
    // The bed is lower while the voice speaks than in the quiet after it, by 10 dB or more at speaking level.
    const under = level(out, 2.5, 300), open = level(out, 6.8, 300);
    assert.ok(open > -35, `the bed in the quiet ${open}`);
    assert.ok(open - under >= 10, `ducked under the voice: ${under} against ${open}`);
    // It loops: the 3 s file still plays at 8.3 s.
    assert.ok(level(out, 8.3, 300) > -35, `looped ${level(out, 8.3, 300)}`);
    // The voice keeps its level (no normalizing in the mix).
    assert.ok(level(out, 2.5, 1000) > -25, `the voice ${level(out, 2.5, 1000)}`);
    // The hit, at 7 s of the recording, plays 1 s earlier after the cut, and not before.
    assert.ok(level(out, 6.0, 2500) > -30, `the hit on its moment ${level(out, 6.0, 2500)}`);
    assert.ok(level(out, 5.0, 2500) < -60, `nothing before ${level(out, 5.0, 2500)}`);
    fs.rmSync(dir, { recursive: true, force: true });
});
