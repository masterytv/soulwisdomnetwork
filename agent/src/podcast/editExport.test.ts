// Spec 019 item 4.1: the files that open the edit in Resolve, Premiere or Final Cut. The timeline is in whole
// frames of the recording's rate, back to back; the files name only the recording; a variable frame rate gets a
// constant-frame-rate copy. auto-editor itself is downloaded only by the workflow, so a stand-in writes the paths
// the way it does (checked against the real 31.7.2 binary while building this).
// Run: npx tsx --test agent/src/podcast/editExport.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { exportRanges, frameRateOf, framesOf, makeEditExports, nameOnly, v3Timeline } from './editExport';

test('the timeline\'s frame rate: the nearest standard one, and whether the recording\'s varies', () => {
    assert.deepEqual(frameRateOf('30000/1001', '30000/1001'), { rate: '30000/1001', fps: 30000 / 1001, variable: false });
    assert.equal(frameRateOf('25/1', '25/1').rate, '25/1');
    assert.equal(frameRateOf('30/1', '2950/100').variable, true);       // Zoom: 30 nominal, fewer frames on average
    assert.equal(frameRateOf('30/1', '29990/1000').variable, false);    // within half a percent
    assert.equal(frameRateOf('0/0', '25/1').rate, '25/1');
    assert.throws(() => frameRateOf('0/0', '0/0'), /not known/);
});

test('the kept stretches back to back, in whole frames of the recording', () => {
    const clips = [
        { startMs: 0, endMs: 2000, atMs: 0 },
        { startMs: 5010, endMs: 10500, atMs: 2000 },
        { startMs: 11000, endMs: 11010, atMs: 7490 },      // under a frame: left out
        { startMs: 12000, endMs: 20000, atMs: 6000 },      // after a transition, it overlapped; here it does not
    ];
    const frames = framesOf(clips, 25);
    assert.deepEqual(frames, [
        { inFrame: 0, outFrame: 50, atFrame: 0 },
        { inFrame: 125, outFrame: 263, atFrame: 50 },
        { inFrame: 300, outFrame: 500, atFrame: 188 },
    ]);
    const v3 = v3Timeline(frames, '/w/rec.mp4', { width: 1920, height: 1080, nominal: '25/1', average: '25/1', sampleRate: 48000, channels: 2 }, '25/1');
    assert.deepEqual(v3.v[0][1], { src: '/w/rec.mp4', start: 50, dur: 138, offset: 125, stream: 0 });
    assert.deepEqual(v3.a, v3.v);
    assert.deepEqual([v3.timebase, v3.resolution, v3.layout], ['25/1', [1920, 1080], 'stereo']);
    assert.deepEqual(exportRanges(frames, 25)[1], { startMs: 5000, endMs: 10520, atMs: 2000 });
});

test('the files name the recording only, written plainly or as a file URL', () => {
    const dir = '/home/runner/work/_temp/edit-files';
    assert.equal(nameOnly(`<pathurl>${dir}/Zoom Ep 4 &amp; Co.mp4</pathurl>`, dir), '<pathurl>Zoom Ep 4 &amp; Co.mp4</pathurl>');
    assert.equal(nameOnly(`<media-rep src="file://${dir}/Zoom%20Ep%204.mp4" />`, dir), '<media-rep src="file:///Zoom%20Ep%204.mp4" />');
    assert.equal(nameOnly('<name>Zoom Ep 4</name>', dir), '<name>Zoom Ep 4</name>');
});

// Stands in for auto-editor: reads the v3 timeline and writes the media path as it does (FCP7: plain; FCPXML: a file URL).
function standIn(dir: string) {
    const bin = path.join(dir, 'auto-editor');
    fs.writeFileSync(bin, `#!/usr/bin/env node
const fs = require('fs');
const [timeline, , kind, , out] = process.argv.slice(2);
const t = JSON.parse(fs.readFileSync(timeline, 'utf8'));
const src = t.v[0][0].src.replace(/&/g, '&amp;');
const clips = t.v[0].map(c => c.start + ':' + c.offset + ':' + c.dur).join(',');
fs.writeFileSync(out, kind.startsWith('final-cut-pro')
    ? '<fcpxml timebase="' + t.timebase + '" clips="' + clips + '"><media-rep src="file://' + encodeURI(t.v[0][0].src) + '"/></fcpxml>'
    : '<xmeml kind="' + kind + '" clips="' + clips + '"><pathurl>' + src + '</pathurl></xmeml>');
`);
    fs.chmodSync(bin, 0o755);
    return bin;
}

const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);

test('the editor files and their captions; a variable frame rate gets a constant copy that they name instead', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-files-'));
    const bin = standIn(dir);
    const steady = path.join(dir, 'steady.mp4'), varying = path.join(dir, 'varying.mp4');
    ff(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30000/1001:duration=6', '-f', 'lavfi', '-i', 'sine=d=6:sample_rate=48000',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', steady]);
    // Half at 25 fps and half at 30: 25 nominal, 27.5 on average.
    ff(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=3', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=3',
        '-f', 'lavfi', '-i', 'sine=d=6:sample_rate=48000', '-filter_complex', '[0][1]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-map', '2:a',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-fps_mode', 'vfr', '-c:a', 'aac', varying]);
    const clips = [{ startMs: 0, endMs: 1000, atMs: 0 }, { startMs: 3000, endMs: 5000, atMs: 1000 }];
    const words = [{ text: 'kept', start: 200, end: 600 }, { text: 'cut', start: 1500, end: 1900 }, { text: 'later', start: 3500, end: 3900 }];

    const a = await makeEditExports({ video: steady, name: 'GMT Zoom Ep 4 & Co.mp4', title: 'Ep 4', clips, words, workDir: path.join(dir, 'a'), bin });
    assert.deepEqual(a.files.map(f => f.kind), ['resolve', 'premiere', 'finalcut', 'captions']);
    assert.deepEqual(a.warnings, []);
    assert.equal(a.frameRate.rate, '30000/1001');
    const resolve = fs.readFileSync(a.files[0].local, 'utf8');
    assert.match(resolve, /kind="resolve-fcp7" clips="0:0:30,30:90:60"/);
    assert.match(resolve, /<pathurl>GMT Zoom Ep 4 &amp; Co\.mp4<\/pathurl>/);
    assert.match(fs.readFileSync(a.files[2].local, 'utf8'), /src="file:\/\/\/GMT%20Zoom%20Ep%204%20&%20Co\.mp4"/);
    assert.equal(a.files[1].name, 'Ep 4 - Premiere Pro.xml');
    // The captions are on the exported timeline, in its whole frames: "later" (3.5 s in the recording) is 1.5 s in,
    // less the 2 ms the frames moved its stretch's start (3 s is frame 89.91, so 90: 3.003 s).
    const srt = fs.readFileSync(a.files[3].local, 'utf8');
    assert.match(srt, /kept/);
    assert.ok(!/cut/.test(srt));
    assert.match(srt, /00:00:01,498 --> /);

    const b = await makeEditExports({ video: varying, name: 'GMT Zoom Ep 4.mp4', title: 'Ep 4', clips, workDir: path.join(dir, 'b'), bin });
    assert.deepEqual(b.files.map(f => f.kind), ['constantRate', 'resolve', 'premiere', 'finalcut']);
    assert.equal(b.files[0].name, 'GMT Zoom Ep 4 (constant 25 fps).mp4');
    assert.match(b.warnings[0], /frame rate varies .* relink to that/);
    assert.match(fs.readFileSync(b.files[1].local, 'utf8'), /<pathurl>GMT Zoom Ep 4 \(constant 25 fps\)\.mp4<\/pathurl>/);
    const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=r_frame_rate,avg_frame_rate', '-of', 'csv=p=0', b.files[0].local], { encoding: 'utf8' });
    assert.equal(probe.trim(), '25/1,25/1');

    await assert.rejects(makeEditExports({ video: steady, name: 'x.mp4', title: 'x', clips: [], workDir: path.join(dir, 'c'), bin }), /Nothing is kept/);
    fs.rmSync(dir, { recursive: true, force: true });
});
