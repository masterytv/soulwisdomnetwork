// Spec 019 item 3.2: the render's voice clean-ups keep the voice where the picture is. DeepFilterNet's pieces
// are joined back without a shift or a bump (with a stand-in for its program, which CI does not download),
// Auphonic's stretch goes back at its place, and the standard chain no longer runs 25 ms late.
// Run: npx tsx --test agent/src/podcast/voiceCleanup.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { auphonicInput, bestLagMs, deepFilterTrack, joinGraph, pieces, PIECE_OVERLAP_SEC, placeAt, speakerMix } from './voiceCleanup';
import { cleanupFilter } from './editRender';
import { auphonicCreditsHours } from './cleanupVersions';

const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
const seconds = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }));

// A sound that never repeats: rising tones in bursts of half a second, 1.3 s apart, over a little noise.
function voice(out: string, secs: number) {
    ff(['-f', 'lavfi', '-i', `aevalsrc=0.4*sin(2*PI*(150+40*t)*t)*lt(mod(t\\,1.3)\\,0.5):s=48000:d=${secs}`,
        '-f', 'lavfi', '-i', `anoisesrc=c=pink:a=0.003:d=${secs}:r=48000`,
        '-filter_complex', '[0][1]amix=inputs=2:normalize=0', '-ac', '2', '-c:a', 'pcm_s16le', out]);
}

// The file's sound, one channel at 8 kHz.
function samples(f: string, filter = 'anull'): Int16Array {
    const b = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', f, '-af', filter, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { maxBuffer: 1 << 28 });
    return new Int16Array(b.buffer, b.byteOffset, b.length / 2);
}

// How far `b` runs behind `a` (ms) over two seconds from `fromSec`.
function lagMs(a: Int16Array, b: Int16Array, fromSec: number): number {
    const from = fromSec * 8000, n = 16000, max = 400;
    let best = -Infinity, lag = 0;
    for (let L = -max; L <= max; L++) {
        let s = 0;
        for (let i = from; i < from + n; i++) s += a[i] * (b[i + L] ?? 0);
        if (s > best) { best = s; lag = L; }
    }
    return lag / 8;
}

test('the pieces cover the recording, and neighbours share exactly the crossfade', () => {
    const p = pieces(250, 4);
    assert.equal(p.length, 4);
    assert.deepEqual([p[0].keepFrom, p[3].keepTo, p[0].from, p[3].to], [0, 250, 0, 250]);
    for (let i = 1; i < p.length; i++) {
        assert.ok(Math.abs(p[i - 1].keepTo - p[i].keepFrom - PIECE_OVERLAP_SEC) < 1e-9);
        assert.ok(p[i].from <= p[i].keepFrom - PIECE_OVERLAP_SEC + 1e-9 && p[i - 1].to >= p[i - 1].keepTo);
    }
    // Short recordings in one piece; never more pieces than whole minutes.
    assert.equal(pieces(90, 4).length, 1);
    assert.equal(pieces(150, 4).length, 2);
    assert.equal(pieces(30, 4).length, 1);
    assert.match(joinGraph(pieces(250, 2), 250, 'anull'), /\[p0\]\[p1\]acrossfade=d=1\.000000:c1=tri:c2=tri\[j1\];\[j1\]anull,apad,atrim=end=250\.000000\[out\]$/);
});

test('DeepFilterNet in pieces: the same length, no shift at the joins, and no bump (a stand-in program)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfn-'));
    // Stands in for deep-filter -D -o DIR FILE: copies the file, 30 ms short at the end as -D leaves it.
    const bin = path.join(dir, 'deep-filter');
    fs.writeFileSync(bin, '#!/bin/sh\nmkdir -p "$3"\nexec ffmpeg -y -hide_banner -loglevel error -i "$4" -af "areverse,atrim=start=0.03,areverse" -c:a pcm_s16le "$3/$(basename "$4")"\n');
    fs.chmodSync(bin, 0o755);
    const src = path.join(dir, 'src.wav');
    voice(src, 250);
    const four = path.join(dir, 'four.wav'), one = path.join(dir, 'one.wav');
    await deepFilterTrack(src, four, { bin, workDir: dir, durationSec: 250, pieces: 4 });
    await deepFilterTrack(src, one, { bin, workDir: dir, durationSec: 250, pieces: 1 });
    assert.ok(Math.abs(seconds(four) - 250) < 0.001, String(seconds(four)));
    const a = samples(src), b = samples(four), c = samples(one);
    // Where pieces join (62.5, 125, 187.5 s) and between, the sound is where it was.
    for (const at of [10, 61.5, 124, 186.5, 240]) assert.ok(Math.abs(lagMs(a, b, at)) <= 0.25, `${at}: ${lagMs(a, b, at)} ms`);
    // And as loud as in one piece: the crossfade is between the same sound twice.
    const rms = (x: Int16Array, from: number, to: number) => Math.sqrt(x.slice(from * 8000, to * 8000).reduce((t, v) => t + v * v, 0) / ((to - from) * 8000));
    let diff = 0;
    for (let i = 61 * 8000; i < 64 * 8000; i++) diff += (b[i] - c[i]) ** 2;
    assert.ok(Math.sqrt(diff / (3 * 8000)) < 0.02 * rms(c, 61, 64), `${Math.sqrt(diff / (3 * 8000))} against ${rms(c, 61, 64)}`);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('the standard chain keeps the voice with the picture (afftdn ran 25 ms late)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'std-'));
    const src = path.join(dir, 'src.wav');
    voice(src, 12);
    const a = samples(src);
    assert.ok(Math.abs(lagMs(a, samples(src, cleanupFilter('light', undefined)), 4)) <= 0.5);
    assert.ok(Math.abs(lagMs(a, samples(src, 'afftdn=nr=12'), 4) - 25) <= 0.5, 'afftdn alone is 25 ms late');
    const out = path.join(dir, 'out.wav');
    ff(['-i', src, '-af', cleanupFilter('light', undefined), out]);
    assert.ok(Math.abs(seconds(out) - 12) < 0.01);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('Auphonic gets the kept stretch, and what comes back goes back at its place', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auph-'));
    const src = path.join(dir, 'src.wav');
    voice(src, 20);
    const sent = path.join(dir, 'sent.flac'), back = path.join(dir, 'back.wav');
    await auphonicInput(src, { startMs: 4000, endMs: 15000 }, sent);
    assert.ok(Math.abs(seconds(sent) - 11) < 0.01);
    await placeAt(sent, 4000, 20, back);
    assert.ok(Math.abs(seconds(back) - 20) < 0.001);
    const a = samples(src), b = samples(back);
    assert.ok(Math.abs(lagMs(a, b, 8)) <= 0.25, String(lagMs(a, b, 8)));
    // Silence where nothing was sent.
    assert.ok(b.slice(0, 3.9 * 8000).every(v => v === 0) && b.slice(15.1 * 8000).every(v => v === 0));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('Auphonic: the hours left on the account, when it says', async () => {
    const reply = (data: unknown) => (async () => new Response(JSON.stringify({ data }), { status: 200 })) as unknown as typeof fetch;
    assert.equal(await auphonicCreditsHours('k', { fetch: reply({ credits: 1.25 }) }), 1.25);
    assert.equal(await auphonicCreditsHours('k', { fetch: reply({ username: 'x' }) }), null);
    await assert.rejects(auphonicCreditsHours('k', { fetch: (async () => new Response('no', { status: 401 })) as unknown as typeof fetch }), /401/);
});

test('speaker tracks are lined up with the recording, cleaned on their own and mixed to its length (spec 019 item 3.3)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracks-'));
    // Two people taking turns over 40 s: A speaks in odd 3 s turns, B in even ones (a few rising tones each).
    const turns = (odd: boolean) => `0.4*sin(2*PI*(${odd ? 180 : 260}+30*mod(t\\,3))*t)*eq(mod(floor(t/3)\\,2)\\,${odd ? 1 : 0})*lt(mod(t\\,1.1)\\,0.7)`;
    const a = path.join(dir, 'a.wav'), b = path.join(dir, 'b.wav'), rec = path.join(dir, 'rec.wav');
    ff(['-f', 'lavfi', '-i', `aevalsrc=${turns(true)}:s=48000:d=40`, '-ac', '1', a]);
    ff(['-f', 'lavfi', '-i', `aevalsrc=${turns(false)}:s=48000:d=40`, '-ac', '1', b]);
    ff(['-i', a, '-i', b, '-filter_complex', '[0][1]amix=inputs=2:normalize=0', '-ac', '2', rec]);
    // A's track starts 300 ms late (as if its recording began earlier), B's 200 ms early.
    const aLate = path.join(dir, 'a-late.wav'), bEarly = path.join(dir, 'b-early.wav');
    ff(['-i', a, '-af', 'adelay=300', aLate]);
    ff(['-i', b, '-af', 'atrim=start=0.2,asetpts=PTS-STARTPTS', bEarly]);
    const out = path.join(dir, 'voice.wav');
    const lags = await speakerMix(rec, [aLate, bEarly], out, 40);
    assert.ok(Math.abs(lags[0] - 300) <= 10 && Math.abs(lags[1] + 200) <= 10, String(lags));
    assert.ok(Math.abs(seconds(out) - 40) < 0.01);
    // The mix is in step with the recording.
    assert.ok(Math.abs(lagMs(samples(rec), samples(out), 10)) <= 10, String(lagMs(samples(rec), samples(out), 10)));
    assert.equal(bestLagMs(new Float32Array([0, 1, 0, 0, 2, 0]), new Float32Array([0, 0, 1, 0, 0, 2]), 30), 10);
    fs.rmSync(dir, { recursive: true, force: true });
});
