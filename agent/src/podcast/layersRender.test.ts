// Spec 020 item E5: layers in a real render (ffmpeg). A video layer slides in from the right with its own
// sound mixed under the episode's, a still with a slow zoom fills the frame, and a half see-through picture
// lets the episode show through, each where and when the edit says, after a cut. Item E6: a lower third's
// band in the brand's colour, and the logo bug over full-frame b-roll for the whole episode.
// Run: npx tsx --test agent/src/podcast/layersRender.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { brollLayer, logoBug, lowerThird, type ImageLayer, type VideoLayer } from '../../../lib/layers';
import { renderEdit } from './editRender';

const ffmpeg = (args: string[]) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
// The colour of a small patch, as [r, g, b].
const patch = (file: string, seconds: number, x: number, y: number) => [...execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
    '-ss', String(seconds), '-i', file, '-frames:v', '1', '-vf', `crop=8:8:${x}:${y},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
// The loudness of half a second of sound, in dB (-200 for silence). ffmpeg prints its stats on stderr.
function level(file: string, seconds: number): number {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(seconds), '-t', '0.5', '-i', file, '-vn',
        '-af', 'astats=measure_overall=RMS_level:measure_perchannel=none', '-f', 'null', '-'], { encoding: 'utf8' });
    const m = /RMS level dB: (-?[\d.]+|-inf)/.exec(r.stderr ?? '');
    return m && m[1] !== '-inf' ? Number(m[1]) : -200;
}

const base = { track: 2, opacity: 1, in: { transition: 'none' as const, durationMs: 0 }, out: { transition: 'none' as const, durationMs: 0 } };

test('layers in a render: a video sliding in with its sound, a moving still, a see-through picture', { timeout: 600_000 }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layers-'));
    const video = path.join(dir, 'episode.mp4'), clip = path.join(dir, 'clip.mp4'), blue = path.join(dir, 'blue.png'), red = path.join(dir, 'red.png');
    // A grey episode with silent sound, 10 s; a green clip with a 1 kHz tone; a blue and a red picture.
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x808080:s=640x360:r=30:d=10', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '10',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video]);
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x00c000:s=320x180:r=30:d=6', '-f', 'lavfi', '-i', 'sine=f=1000:r=48000:d=6', '-t', '6',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip]);
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x0000ff:s=600x400', '-frames:v', '1', blue]);
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=0xff0000:s=400x200', '-frames:v', '1', red]);
    const out = path.join(dir, 'out.mp4');
    // A 1 s cut at 1-2 s: everything after it plays 1 s earlier.
    const greenLayer: VideoLayer = {
        ...base, id: 'v', kind: 'video', anchor: { srcMs: 3000 }, durationMs: 3000, place: { x: 1 - 60 / 1920, y: 1 - 60 / 1080, align: 3 },
        in: { transition: 'slideLeft', durationMs: 1000 }, media: { path: 'x', name: 'clip' }, w: 0.25, trimInMs: 1000, volumeDb: 0,
    };
    const zoom: ImageLayer = {
        ...base, id: 'z', kind: 'image', anchor: { srcMs: 7000 }, durationMs: 2000, place: { x: 0, y: 0, align: 7 },
        media: { path: 'x', name: 'blue' }, w: 1, motion: 'kenBurnsIn',
    };
    const faint: ImageLayer = {
        ...base, id: 'f', kind: 'image', anchor: { atMs: 0 }, durationMs: 1500, place: { x: 0.5, y: 0.5, align: 5 }, opacity: 0.5,
        media: { path: 'x', name: 'red' }, w: 0.25, motion: 'none',
    };
    await renderEdit({
        video, out, clean: 'off',
        edit: { version: 1, cuts: [{ startMs: 1000, endMs: 2000, reason: 'manual' }] },
        onScreen: { captions: null, texts: [], pictures: [{ layer: greenLayer, file: clip }, { layer: zoom, file: blue }, { layer: faint, file: red }] },
    });
    // The see-through red picture, pinned at 0-1.5 s in the middle: half red over grey.
    const [fr, fg, fb] = patch(out, 0.7, 956, 536);
    assert.ok(fr > 160 && fr < 220 && fg > 40 && fg < 100 && fb > 40 && fb < 100, `half red ${[fr, fg, fb]}`);
    // The green clip is at 3 s of the recording, 2 s into the edit, for 3 s, in the bottom right (480×270),
    // sliding in from the right over its first second.
    const inPlace = { x: 1920 - 60 - 240, y: 1080 - 60 - 135 };
    const [gr, gg] = patch(out, 3.6, inPlace.x, inPlace.y);
    assert.ok(gg > 150 && gr < 80, `green in place ${[gr, gg]}`);
    const [er, eg] = patch(out, 2.25, inPlace.x - 200, inPlace.y);
    assert.ok(Math.abs(er - eg) < 25, `not there yet, still sliding in ${[er, eg]}`);
    const [ar, ag] = patch(out, 5.5, inPlace.x, inPlace.y);
    assert.ok(Math.abs(ar - ag) < 25, `gone after its 3 s ${[ar, ag]}`);
    // Its tone plays while it is up, and not before.
    assert.ok(level(out, 3.5) > -30, `the clip's sound ${level(out, 3.5)}`);
    assert.ok(level(out, 1.0) < -60, `silence before ${level(out, 1.0)}`);
    // The blue still, at 7 s of the recording (6 s into the edit), fills the frame while it zooms.
    const [br, bg, bb] = patch(out, 6.8, 960, 540);
    assert.ok(bb > 200 && br < 60 && bg < 60, `blue fills the frame ${[br, bg, bb]}`);
    const [cr, , cb] = patch(out, 6.8, 20, 20);
    assert.ok(cb > 200 && cr < 60, `to the corners ${[cr, cb]}`);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('elements in a render: a lower third on a brand band, the logo bug over full-frame b-roll', { timeout: 300_000 }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elements-'));
    const video = path.join(dir, 'episode.mp4'), blue = path.join(dir, 'blue.png'), red = path.join(dir, 'red.png'), out = path.join(dir, 'out.mp4');
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x808080:s=640x360:r=30:d=6', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '6',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video]);
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x0000ff:s=640x360', '-frames:v', '1', blue]);
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=0xff0000:s=512x512', '-frames:v', '1', red]);
    const brand = { font: 'Outfit Black' as const, colors: { background: '#140a2e', accent: '#f7c65b' }, hosts: [] };
    const third = { ...lowerThird(500, 'Ana Example', 'Author', brand), in: { transition: 'none' as const, durationMs: 0 } };
    // B-roll over the whole frame at 3-6 s, still; the logo bug listed first, drawn above it all the same.
    const broll = { ...brollLayer({ index: 0, startMs: 3000, durationSeconds: 3, path: 'x' }), motion: 'none' as const };
    const bug = logoBug({ path: 'x', name: 'logo' });
    await renderEdit({
        video, out, clean: 'off', edit: { version: 1, cuts: [] },
        onScreen: { captions: null, texts: [third], pictures: [{ layer: bug, file: red }, { layer: broll, file: blue }] },
    });
    // The band behind the lower third, in its left padding (90 px in, 120 up): the brand's dark purple over grey.
    const [r, g, b] = patch(out, 2, 82, 925);
    assert.ok(r < 70 && g < 60 && b > g + 10, `brand band ${[r, g, b]}`);
    // The logo bug, 8% wide in the top right, 60 px in, four-fifths solid: red over grey, then over the blue b-roll.
    const [lr, , lb] = patch(out, 2, 1780, 130);
    assert.ok(lr > 180 && lb < 80, `logo over the episode ${[lr, lb]}`);
    const [br, , bb] = patch(out, 4.5, 1780, 130);
    assert.ok(br > 170 && bb > 30 && bb < 90, `logo over the b-roll ${[br, bb]}`);
    const [cr, , cb] = patch(out, 4.5, 960, 540);
    assert.ok(cb > 200 && cr < 60, `the b-roll under it ${[cr, cb]}`);
    fs.rmSync(dir, { recursive: true, force: true });
});
