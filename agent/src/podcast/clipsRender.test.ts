// Clips (docs/specs/025-clips.md): a stretch cut from a made-up final cut has the right length, starts dark (the fade),
// keeps its sound, and the loudness and frames come out as the thumbnail search needs them. Runs ffmpeg.
// Run: npx tsx --test agent/src/podcast/clipsRender.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { clipArgs, frameArgs, grabClipFrame, momentaryLoudness, renderClip } from './clipsRender';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clips-'));
const src = path.join(dir, 'final.mp4');
// Eight seconds of a moving test picture and a tone that gets louder at 5 s.
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30',
    '-f', 'lavfi', '-i', "sine=frequency=440:sample_rate=48000,volume='if(gte(t,5),1,0.1)':eval=frame",
    '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', src]);

const probe = (file: string, entries: string) => execFileSync('ffprobe', ['-v', 'error', ...entries.split(' '), '-of', 'csv=p=0', file]).toString().trim();

test('renderClip: the stretch asked for, faded in from black, with its sound', async () => {
    const out = path.join(dir, 'clip.mp4');
    await renderClip(src, out, 2, 4);
    assert.ok(Math.abs(parseFloat(probe(out, '-show_entries format=duration')) - 4) < 0.1);
    assert.equal(probe(out, '-select_streams a -show_entries stream=codec_name'), 'aac');
    assert.equal(probe(out, '-select_streams v -show_entries stream=width,height'), '1920,1080');
    // The first frame is the start of the fade: nearly black.
    const first = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', out, '-frames:v', '1', '-vf', 'scale=1:1,format=gray', '-f', 'rawvideo', '-']);
    assert.ok(first[0] < 20, `first frame brightness ${first[0]}`);
});

test('clipArgs: seeks before the input and fades both ends', () => {
    const args = clipArgs('in.mp4', 'out.mp4', 10, 300);
    assert.ok(args.indexOf('-ss') < args.indexOf('-i'));
    const filter = args[args.indexOf('-filter_complex') + 1];
    assert.match(filter, /fade=t=in:st=0:d=0\.5/);
    assert.match(filter, /fade=t=out:st=299\.500:d=0\.5/);
    assert.match(filter, /afade=t=out:st=299\.500/);
});

test('momentaryLoudness: every 100 ms, on the final cut\'s times, louder where the tone is', async () => {
    const series = await momentaryLoudness(src, 3, 4);
    assert.ok(series.length >= 30, `${series.length} points`);
    assert.ok(series[0].ms >= 3000 && series[series.length - 1].ms <= 7100);
    const at = (ms: number) => series.reduce((best, p) => (Math.abs(p.ms - ms) < Math.abs(best.ms - ms) ? p : best)).lufs;
    assert.ok(at(6800) - at(4600) > 10, `${at(4600)} → ${at(6800)}`);
});

test('frames: small for Claude, full size cropped to the speaker, and the still', async () => {
    const small = path.join(dir, 'small.jpg'), full = path.join(dir, 'full.jpg'), still = path.join(dir, 'still.jpg');
    await grabClipFrame(src, small, 4, { size: 'small' });
    await grabClipFrame(src, full, 4, { size: 'full', crop: { x: 960, y: 100, w: 800, h: 980 } });
    await grabClipFrame(src, still, 4, { size: 'still' });
    assert.equal(probe(small, '-show_entries stream=width,height'), '640,360');
    assert.equal(probe(full, '-show_entries stream=width,height'), '800,980');
    assert.equal(probe(still, '-show_entries stream=width,height'), '1280,720');
    assert.doesNotMatch(frameArgs('a', 'b', 1, { size: 'small', crop: { x: 0, y: 0, w: 2, h: 2 } }).join(' '), /crop=/);
});
