// Editor Light, phase 2 test: generates a 20s test video, renders it with cuts,
// and checks the output length, stream count, and JSON report.
// Run: npx tsx --test agent/src/podcast/editRender.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync, spawn } from 'child_process';
import * as os from 'os';
import { keepRanges, editedDuration, editedTime, type Cut, type EpisodeEdit } from '../../../lib/edit';
import { playOrder, sequenceLength } from '../../../lib/sequence';
import { chainPieces, FPS, frameAt, framesOf, renderEdit } from './editRender';
import { spawnSync } from 'child_process';

function run(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
    });
}

function probeStreams(file: string): Promise<{ video: number; audio: number; duration: number; audioRate: number }> {
    return new Promise((resolve, reject) => {
        const child = spawn('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,sample_rate', '-of', 'csv=p=0', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        child.stdout.on('data', d => out += d);
        child.on('close', () => {
            const lines = out.trim().split('\n');
            let audioRate = 0;
            const video = lines.filter(l => l.startsWith('video')).length;
            const audioLines = lines.filter(l => l.startsWith('audio'));
            if (audioLines.length > 0) audioRate = parseInt(audioLines[0].split(',')[1] || '0', 10);
            const audio = audioLines.length;
            const duration = parseFloat(lines[lines.length - 1]);
            resolve({ video, audio, duration, audioRate });
        });
        child.on('error', reject);
    });
}

// Per-stream durations so we can check video and audio are in sync.
function probeStreamDurations(file: string): Promise<{ videoDur: number; audioDur: number }> {
    return new Promise((resolve, reject) => {
        const child = spawn('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'csv=p=0', file], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        child.stdout.on('data', d => out += d);
        child.on('close', () => {
            const lines = out.trim().split('\n');
            let videoDur = 0, audioDur = 0;
            for (const l of lines) {
                const parts = l.split(',');
                if (parts[0] === 'video') videoDur = parseFloat(parts[1] || '0');
                if (parts[0] === 'audio') audioDur = parseFloat(parts[1] || '0');
            }
            resolve({ videoDur, audioDur });
        });
        child.on('error', reject);
    });
}

// The average colour of one frame, as [r, g, b].
function frameColour(file: string, seconds: number): Promise<number[]> {
    return new Promise((resolve, reject) => {
        const child = spawn('ffmpeg', ['-v', 'error', '-ss', String(seconds), '-i', file, '-frames:v', '1',
            '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
        const chunks: Buffer[] = [];
        child.stdout.on('data', d => chunks.push(d));
        child.on('error', reject);
        child.on('close', () => resolve([...Buffer.concat(chunks)].slice(0, 3)));
    });
}
const isBlue = ([r, g, b]: number[]) => b > 200 && r < 60 && g < 60;

test('render with cuts, teasers, intro, outro, b-roll, and --clean light', async () => {
    const dir = path.join(process.env.TMPDIR || '/tmp', 'edit-render-test');
    fs.mkdirSync(dir, { recursive: true });

    // Generate a 20s test video (testsrc + sine).
    const video = path.join(dir, 'episode.mp4');
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'testsrc=duration=20:size=1920x1080:rate=30',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=20',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-shortest',
        video,
    ]);

    // Generate a 2s teaser.
    const teaser = path.join(dir, 'teaser.mp4');
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'testsrc=duration=2:size=1920x1080:rate=30',
        '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-shortest',
        teaser,
    ]);

    // Generate a 2s intro.
    const intro = path.join(dir, 'intro.mp4');
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'testsrc=duration=2:size=1920x1080:rate=30',
        '-f', 'lavfi', '-i', 'sine=frequency=880:duration=2',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-shortest',
        intro,
    ]);

    // Generate a 1x1 PNG for b-roll.
    const brollImg = path.join(dir, 'broll.png');
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'color=c=blue:s=1920x1080:d=0.04',
        '-frames:v', '1', brollImg,
    ]);

    // Define three cuts.
    const cuts: Cut[] = [
        { startMs: 3000, endMs: 5000, reason: 'filler' },
        { startMs: 8000, endMs: 9000, reason: 'pause' },
        { startMs: 12000, endMs: 14000, reason: 'manual' },
    ];
    const edit: EpisodeEdit = { cuts, version: 1 };

    // Compute expected edited duration.
    const ranges = keepRanges(20_000, cuts);
    const expectedEditedMs = editedDuration(ranges);
    const expectedTotal = 2000 + 2000 + expectedEditedMs + 2000; // teaser + intro + edited + outro

    // Write the edit JSON.
    const editPath = path.join(dir, 'edit.json');
    fs.writeFileSync(editPath, JSON.stringify(edit));

    const out = path.join(dir, 'output.mp4');
    await renderEdit({
        video,
        edit,
        out,
        teasers: [teaser],
        intro,
        outro: intro, // same file
        broll: [{ atMs: 6000, seconds: 3, image: brollImg }],
        clean: 'light',
        words: [
            { text: 'before', start: 1000, end: 1400 },
            { text: 'gone', start: 8300, end: 8700 },
            { text: 'after', start: 15000, end: 15400 },
        ],
        chapters: [{ title: 'Middle', startMs: 10_000 }],
    });

    // Check output length.
    const probe = await probeStreams(out);
    const diff = Math.abs(probe.duration - expectedTotal / 1000);
    assert.ok(diff < 0.150, `output duration ${probe.duration}s differs from expected ${expectedTotal / 1000}s by ${diff}s`);

    // Check one video stream at 1920x1080.
    assert.equal(probe.video, 1, 'exactly one video stream');

    // Check 48kHz audio.
    assert.equal(probe.audio, 1, 'exactly one audio stream');
    assert.equal(probe.audioRate, 48000, 'audio is 48 kHz');

    // The b-roll (a plain blue still) shows in the middle of its window, on the edited timeline, and not after it.
    const brollStart = 4 + (editedTime(6000, ranges, true) ?? 0) / 1000; // after the 2 s teaser and 2 s intro
    assert.ok(isBlue(await frameColour(out, brollStart + 1.5)), 'b-roll visible mid-window');
    assert.ok(!isBlue(await frameColour(out, brollStart + 3 + 1.5)), 'b-roll gone after its window');

    // Times and captions come straight from the edit: the cut word is gone and the word after
    // the second cut moved by exactly the time removed before it, plus the 4 s teaser and intro.
    const base = out.replace(/\.\w+$/, '');
    const words = JSON.parse(fs.readFileSync(`${base}.words.json`, 'utf8')) as { text: string; start: number }[];
    assert.deepEqual(words.map(w => w.text), ['before', 'after']);
    const expectedAfter = 4000 + (editedTime(15000, ranges) ?? 0);
    assert.ok(Math.abs(words[1].start - expectedAfter) < 100, `'after' at ${words[1].start} ms, expected ${expectedAfter}`);
    assert.ok(fs.readFileSync(`${base}.srt`, 'utf8').startsWith('1'), 'captions file written');
    const times = JSON.parse(fs.readFileSync(`${base}.chapters.json`, 'utf8'));
    assert.equal(times.chapters[0].startMs, 4000 + (editedTime(10_000, ranges) ?? 0));

    // Check the JSON report exists.
    const reportPath = out.replace(/\.\w+$/, '') + '.report.json';
    assert.ok(fs.existsSync(reportPath), 'JSON report exists');
    const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.ok(reportData.inputSeconds > 0);
    assert.ok(reportData.outputSeconds > 0);
    assert.equal(reportData.cuts, 3);
    // The quality report (renderQc.ts): measured, and the length matches teasers + intro + edit + outro.
    assert.ok(reportData.qc, 'quality report present');
    assert.ok(reportData.qc.integratedLufs !== null, 'loudness measured');
    assert.ok(Math.abs(reportData.qc.durationSeconds - reportData.qc.expectedSeconds) <= 1, `length ${reportData.qc.durationSeconds} vs ${reportData.qc.expectedSeconds}`);
    assert.ok(!reportData.qc.warnings.some((w: string) => w.startsWith('The video is')), 'no length warning');
});

test('windows for long episodes (spec 019 item 4.2), and a retry that finds the windows kept', async () => {
    const dir = path.join(process.env.TMPDIR || '/tmp', 'edit-render-block-test');
    fs.mkdirSync(dir, { recursive: true });

    // Generate a 180 s (3 minute) test video (testsrc + sine).
    const video = path.join(dir, 'episode.mp4');
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'testsrc=duration=180:size=1920x1080:rate=30',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=180',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-shortest',
        video,
    ]);

    // 30 cuts spread across the 180 s clip, each 2 s wide, every ~6 s.
    const cuts: Cut[] = [];
    for (let i = 0; i < 30; i++) {
        cuts.push({ startMs: i * 6000, endMs: i * 6000 + 2000, reason: 'filler' });
    }
    const edit: EpisodeEdit = { cuts, version: 1 };

    // Expected: the edited length the Studio works out (its play order), to the nearest frame. Each
    // stretch was once rounded up to a whole frame on its own, which made the video 20 ms longer
    // per cut than the edit said: here 0.6 s, on a long episode with many cuts many seconds.
    const expectedSec = frameAt(sequenceLength(playOrder(edit, 180_000))) / FPS;

    // A stand-in for the job's Storage: what the render keeps, by name.
    const keptDir = fs.mkdtempSync(path.join(dir, 'kept-'));
    const log: string[] = [];
    const store = {
        get: async (name: string, local: string) => {
            const f = path.join(keptDir, name);
            if (!fs.existsSync(f)) return false;
            fs.copyFileSync(f, local);
            log.push(`get ${name}`);
            return true;
        },
        put: async (local: string, name: string) => { fs.copyFileSync(local, path.join(keptDir, name)); log.push(`put ${name}`); },
    };
    const out = path.join(dir, 'output.mp4');
    await renderEdit({
        video,
        edit,
        out,
        clean: 'off',
        blockMinutes: 1,
        store,
    });
    // More than one window, each kept as it was made.
    const made = log.filter(l => l.startsWith('put window-'));
    assert.ok(made.length >= 2, log.join(', '));
    // A retry: every window is found, none is made again, and the video is the same length.
    log.length = 0;
    const again = path.join(dir, 'again.mp4');
    await renderEdit({ video, edit, out: again, clean: 'off', blockMinutes: 1, store });
    assert.deepEqual([...log].sort(), made.map(l => l.replace('put', 'get')).sort());
    assert.equal((await probeStreams(again)).duration, (await probeStreams(out)).duration);

    // Check output length within 2 frames of expected.
    const probe = await probeStreams(out);
    const diff = Math.abs(probe.duration - expectedSec);
    assert.ok(diff < 2 / FPS, `output duration ${probe.duration}s differs from expected ${expectedSec}s by ${diff}s`);

    // Exactly one video stream and one audio stream.
    assert.equal(probe.video, 1, 'exactly one video stream');
    assert.equal(probe.audio, 1, 'exactly one audio stream');

    // Video and audio stream durations within 50 ms of each other.
    const probeDetail = await probeStreamDurations(out);
    const vAdiff = Math.abs(probeDetail.videoDur - probeDetail.audioDur);
    assert.ok(vAdiff < 0.050, `video ${probeDetail.videoDur}s vs audio ${probeDetail.audioDur}s differ by ${vAdiff}s`);
});

test('single-range seek: cut removes the first colour, second colour shows', async () => {
    const dir = path.join(process.env.TMPDIR || '/tmp', 'edit-render-seek-test');
    fs.mkdirSync(dir, { recursive: true });

    // A 20 s clip: first 8 s red, last 12 s blue.
    const video = path.join(dir, 'clip.mp4');
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'color=c=red:s=640x360:d=8:r=30',
        '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:d=12:r=30',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=20',
        '-filter_complex', '[0][1]concat=n=2:v=1:a=0[v]',
        '-map', '[v]', '-map', '2:a',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-shortest',
        video,
    ]);

    // Cut the first 8 s (the red part).
    const edit: EpisodeEdit = { cuts: [{ startMs: 0, endMs: 8000, reason: 'manual' }], version: 1 };

    const out = path.join(dir, 'output.mp4');
    await renderEdit({ video, edit, out, clean: 'off' });

    // Check output length within 200 ms of 12 s.
    const probe = await probeStreams(out);
    const diff = Math.abs(probe.duration - 12);
    assert.ok(diff < 0.200, `output duration ${probe.duration}s differs from 12s by ${diff}s`);

    // Frame at 1 s should be blue (blue channel greater than red channel).
    const colour = await frameColour(out, 1);
    assert.ok(colour[2] > colour[0], `frame at 1s is blue (b=${colour[2]} > r=${colour[0]})`);
});

test('each stretch fills the frames between its start and end in the edited episode', () => {
    // Three stretches of 780 ms (23.4 frames each): 23, 24 and 23 frames, so the edit's times at
    // their ends (780, 1560, 2340 ms) land within half a frame of the video's (767, 1567, 2333 ms).
    const clips = [{ startMs: 0, endMs: 780, atMs: 0 }, { startMs: 1000, endMs: 1780, atMs: 780 }, { startMs: 2000, endMs: 2780, atMs: 1560 }];
    assert.deepEqual(clips.map(framesOf), [23, 24, 23]);
    let frames = 0;
    for (const c of clips) {
        frames += framesOf(c);
        assert.ok(Math.abs(frames * 1000 / FPS - (c.atMs + c.endMs - c.startMs)) <= 500 / FPS);
    }
    assert.equal(framesOf({ startMs: 0, endMs: 5, atMs: 0 }), 1);       // never less than a frame
});

// Spec 020 item E4: transitions.

// When a white flash first shows, and when a beep first sounds, in a file (seconds).
function flashTimes(file: string): number[] {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YMAX', '-an', '-f', 'null', '-'], { encoding: 'utf8' });
    const out: number[] = [];
    let t = 0;
    for (const line of r.stderr.split('\n')) {
        const m = /pts_time:([\d.]+)/.exec(line);
        if (m) t = Number(m[1]);
        const y = /YMAX=([\d.]+)/.exec(line);
        if (y && Number(y[1]) > 230 && (!out.length || t - out[out.length - 1] > 0.3)) out.push(t);
    }
    return out;
}
function beepTimes(file: string): number[] {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vn', '-af', 'highpass=f=800,silencedetect=noise=-30dB:d=0.05', '-f', 'null', '-'], { encoding: 'utf8' });
    return [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map(m => Number(m[1]));
}

test('joining pieces: a cut is a concat, a transition overlaps them, never by more than either has', () => {
    const plain = chainPieces([{ v: 'a', a: 'aa', frames: 90, join: null }], { v: 'ov', a: 'oa' }, 't');
    assert.deepEqual([plain.starts, plain.frames], [[0], 90]);
    assert.match(plain.filter, /\[a\]null\[ov\];\[aa\]anull\[oa\];/);
    const chain = chainPieces([
        { v: 'a', a: 'aa', frames: 90, join: null },
        { v: 'b', a: 'ba', frames: 60, join: { xfade: 'fade', frames: 15 } },
        { v: 'c', a: 'ca', frames: 30, join: null },
        { v: 'd', a: 'da', frames: 30, join: { xfade: 'fadeblack', frames: 60 } },   // longer than either side: as long as the shorter
    ], { v: 'ov', a: 'oa' }, 't');
    assert.deepEqual(chain.starts, [0, 75, 135, 135]);
    assert.equal(chain.frames, 90 + 60 - 15 + 30 + 30 - 30);
    assert.match(chain.filter, /xfade=transition=fade:duration=0\.500000:offset=2\.500000/);
    assert.match(chain.filter, /acrossfade=d=0\.500000:c1=tri:c2=tri/);
    assert.match(chain.filter, /concat=n=2:v=1:a=0\[tv2\]/);
    assert.match(chain.filter, /xfade=transition=fadeblack:duration=1\.000000:offset=4\.500000\[ov\]/);
});

test('a dissolve at a split overlaps the parts: shorter by its length, blended, and in sync after', async () => {
    const dir = path.join(process.env.TMPDIR || '/tmp', 'edit-render-dissolve-test');
    fs.mkdirSync(dir, { recursive: true });
    // 10 s: red then blue at 5 s, with a white flash and a beep together at 2.5 s and 7.5 s.
    const video = path.join(dir, 'clip.mp4');
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', "color=c=red:s=640x360:r=30:d=10,drawbox=c=blue:t=fill:enable='gte(t,5)',drawbox=x=0:y=0:w=640:h=60:c=white:t=fill:enable='between(mod(t,5),2.5,2.53)'",
        '-f', 'lavfi', '-i', "aevalsrc='0.5*sin(2*PI*1000*t)*between(mod(t,5),2.5,2.56)':s=48000:d=10",
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video]);
    const edit: EpisodeEdit = { cuts: [], version: 1, splits: [5000], joins: [{ at: { atSplit: 5000 }, transition: 'dissolve', durationMs: 1000 }] };
    const out = path.join(dir, 'output.mp4');
    const report = await renderEdit({ video, edit, out, clean: 'off', words: [{ text: 'late', start: 7500, end: 7900 }] });
    const probe = await probeStreams(out);
    assert.ok(Math.abs(probe.duration - 9) < 1.5 / FPS, `length ${probe.duration}, not 9 s`);
    const lengths = await probeStreamDurations(out);
    assert.ok(Math.abs(lengths.videoDur - lengths.audioDur) < 0.05, `video ${lengths.videoDur} s, audio ${lengths.audioDur} s`);
    assert.deepEqual(report.warnings, []);
    const [red, mid, blue] = [await frameColour(out, 2), await frameColour(out, 4.5), await frameColour(out, 6)];
    assert.ok(red[0] > 200 && red[2] < 60, `red at 2 s: ${red}`);
    assert.ok(mid[0] > 70 && mid[2] > 70, `half red, half blue at 4.5 s: ${mid}`);
    assert.ok(isBlue(blue), `blue at 6 s: ${blue}`);
    // The flash and beep after the dissolve land 1 s early, together.
    const flashes = flashTimes(out), beeps = beepTimes(out);
    assert.equal(flashes.length, 2, `flashes ${flashes}`);
    assert.ok(Math.abs(flashes[1] - 6.5) < 1.5 / FPS, `second flash at ${flashes[1]}`);
    assert.ok(flashes.every(f => beeps.some(b => Math.abs(b - f) < 1.5 / FPS)), `beeps ${beeps} against flashes ${flashes}`);
    // So do the words.
    const words = JSON.parse(fs.readFileSync(path.join(dir, 'output.words.json'), 'utf8'));
    assert.deepEqual(words, [{ text: 'late', start: 6500, end: 6900 }]);
});

test('transitions between the intro, the episode and the outro, and fades at the start and end', async () => {
    const dir = path.join(process.env.TMPDIR || '/tmp', 'edit-render-sections-test');
    fs.mkdirSync(dir, { recursive: true });
    const intro = path.join(dir, 'intro.mp4');
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=640x360:r=30:d=2',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', intro]);
    const video = path.join(dir, 'clip.mp4');
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=30:d=3',
        '-f', 'lavfi', '-i', 'sine=frequency=660:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video]);
    const cut = { transition: 'cut' as const, durationMs: 500 };
    const out = path.join(dir, 'output.mp4');
    const report = await renderEdit({
        video, edit: { cuts: [], version: 1 }, out, clean: 'off', intro, outro: intro,
        sections: {
            start: { transition: 'fade', durationMs: 500 }, betweenTeasers: cut, afterTeasers: cut,
            afterIntro: { transition: 'dissolve', durationMs: 500 }, beforeOutro: { transition: 'fade', durationMs: 500 },
            end: { transition: 'fade', durationMs: 500 },
        },
        words: [{ text: 'one', start: 1000, end: 1300 }],
    });
    // 2 + 3 + 2 s, less two half-second transitions.
    const probe = await probeStreams(out);
    assert.ok(Math.abs(probe.duration - 6) < 1.5 / FPS, `length ${probe.duration}, not 6 s`);
    assert.ok(Math.abs((report.qc.durationSeconds ?? 0) - (report.qc.expectedSeconds ?? -1)) < 0.1, `quality report: ${report.qc.durationSeconds} against ${report.qc.expectedSeconds}`);
    const [first, green, red] = [await frameColour(out, 0), await frameColour(out, 1), await frameColour(out, 3)];
    assert.ok(first.every(c => c < 40), `black at the start: ${first}`);
    assert.ok(green[1] > 100 && green[0] < 60, `green intro at 1 s: ${green}`);
    assert.ok(red[0] > 200 && red[1] < 60, `red episode at 3 s: ${red}`);
    // The episode starts 0.5 s before the intro ends, so its words come 1.5 s in, then 1 s more.
    const words = JSON.parse(fs.readFileSync(path.join(dir, 'output.words.json'), 'utf8'));
    assert.deepEqual(words, [{ text: 'one', start: 2500, end: 2800 }]);
    // A transition longer than the clip it joins plays as a straight cut, and says so.
    const short = await renderEdit({
        video, edit: { cuts: [], version: 1 }, out: path.join(dir, 'short.mp4'), clean: 'off', intro,
        sections: { start: cut, betweenTeasers: cut, afterTeasers: cut, afterIntro: { transition: 'dissolve', durationMs: 2500 }, beforeOutro: cut, end: cut },
    });
    assert.ok(Math.abs(short.outputSeconds - 5) < 1.5 / FPS, `length ${short.outputSeconds}, not 5 s`);
    assert.equal(short.warnings.length, 1);
});

test('moved sections play in their new order, picture and sound together (spec 020 item E9)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-render-order-'));
    // Three 3 s sections: red with a 300 Hz tone, green with 600 Hz, blue with 900 Hz.
    const video = path.join(dir, 'clip.mp4');
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'color=c=red:s=640x360:d=3:r=30', '-f', 'lavfi', '-i', 'color=c=green:s=640x360:d=3:r=30', '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:d=3:r=30',
        '-f', 'lavfi', '-i', 'sine=f=300:d=3', '-f', 'lavfi', '-i', 'sine=f=600:d=3', '-f', 'lavfi', '-i', 'sine=f=900:d=3',
        '-filter_complex', '[0][1][2]concat=n=3:v=1:a=0[v];[3][4][5]concat=n=3:v=0:a=1[a]', '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video]);
    const edit: EpisodeEdit = { cuts: [], version: 1, splits: [3000, 6000], order: [2, 0, 1] };
    const out = path.join(dir, 'out.mp4');
    await renderEdit({ video, edit, out, clean: 'off', words: [{ text: 'red', start: 1000, end: 1500 }, { text: 'blue', start: 7000, end: 7500 }] });
    assert.ok(Math.abs((await probeStreams(out)).duration - 9) < 0.1);
    // Blue, then red, then green.
    const [b, r, g] = await Promise.all([1.5, 4.5, 7.5].map(t => frameColour(out, t)));
    assert.ok(b[2] > 150 && b[0] < 80, `blue first: ${b}`);
    assert.ok(r[0] > 150 && r[2] < 80, `red second: ${r}`);
    assert.ok(g[1] > 100 && g[0] < 80, `green third: ${g}`);
    // The sound moved with the picture: 900 Hz first (the blue section's), counted by zero crossings over 1 s.
    const tone = (at: number) => {
        const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(at), '-t', '1', '-i', out, '-ac', '1', '-ar', '48000', '-f', 's16le', '-']);
        const s = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
        let crossings = 0;
        for (let i = 1; i < s.length; i++) if ((s[i - 1] < 0) !== (s[i] < 0)) crossings++;
        return crossings / 2;
    };
    assert.ok(Math.abs(tone(1) - 900) < 30 && Math.abs(tone(4) - 300) < 30 && Math.abs(tone(7) - 600) < 30, `${tone(1)} ${tone(4)} ${tone(7)}`);
    // The words in the new order, at their new times: "blue" (7 s in the recording) first, at 1 s.
    const words = JSON.parse(fs.readFileSync(path.join(dir, 'out.words.json'), 'utf8')) as { text: string; start: number }[];
    assert.deepEqual(words.map(w => [w.text, Math.round(w.start / 100) * 100]), [['blue', 1000], ['red', 4000]]);
    fs.rmSync(dir, { recursive: true, force: true });
});
