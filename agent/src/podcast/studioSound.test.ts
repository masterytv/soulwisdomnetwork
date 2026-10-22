// Spec 019 item 3.4: Studio sound. The EQ is fitted to the target and stays within its limits, never boosts a band
// the voice does not reach or the noise fills, each speaker is brought to the same level, the sound changes in the
// pause between turns, and the whole clean-up keeps the voice where the picture is (with a stand-in for
// DeepFilterNet, which CI does not download).
// Run: npx tsx --test agent/src/podcast/studioSound.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    BANDS, BandMeter, chainResponse, commandsFor, fft, fitGains, peakResponseDb, quantile, SPEAKER_EQ_LIMITS, speakerSounds,
    studioChain, switchPoints, targetDb, turnsOf, turnsWithin, wantedEq, WavReader,
} from './studioSound';
import { studioSoundTrack } from './voiceCleanup';

const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
const target = BANDS.map(f => targetDb(f));
const fitted = BANDS.map((f, i) => ({ f, i })).filter(b => target[b.i] !== null);

// A voice exactly on the target in the bands it is fitted to, `shift` dB louder, and given levels elsewhere.
const onTarget = (shift = 0, outside = 0) => BANDS.map((_, i) => (target[i] ?? outside) + shift);

test('the target follows the average speech spectrum, with the voicing', () => {
    assert.equal(targetDb(80), null);
    assert.equal(targetDb(10240), null);
    // At 160 Hz, the table's 32.41 dB per Hz over a half-octave band, plus 2 dB of warmth.
    assert.ok(Math.abs(targetDb(160)! - (32.41 + 10 * Math.log10(160 * (2 ** 0.25 - 2 ** -0.25)) + 2)) < 1e-9);
    // Speech is strongest around 300–500 Hz and falls away above.
    assert.ok(targetDb(453)! > targetDb(1810)! && targetDb(1810)! > targetDb(7240)!);
});

test("ffmpeg's peaking filter: its gain at the centre, none far away", () => {
    assert.ok(Math.abs(peakResponseDb(1000, 1000, 6, 0.5) - 6) < 0.01);
    assert.ok(Math.abs(peakResponseDb(1000, 1000, -4, 0.5) + 4) < 0.01);
    assert.ok(Math.abs(peakResponseDb(8000, 1000, 6, 0.5)) < 0.2);
    assert.equal(peakResponseDb(500, 1000, 0, 0.5), 0);
});

test('the filters are fitted so the whole EQ meets what is wanted, despite their overlap', () => {
    const wanted = BANDS.map((_, i) => (i % 3 === 0 ? 3 : i % 3 === 1 ? -2 : 0));
    const got = chainResponse(fitGains(wanted));
    got.forEach((g, i) => assert.ok(Math.abs(g - wanted[i]) < 0.3, `${BANDS[i]}: ${g} for ${wanted[i]}`));
    // A flat 3 dB is not 3 dB in every filter.
    const flat = fitGains(BANDS.map(() => 3));
    assert.ok(flat.every(g => g < 3));
});

test('a voice on the target is left alone; a boomy or thin one is nudged, within the limits', () => {
    // On target (at any level): nothing to do where the target is fitted.
    for (const shift of [0, -20]) {
        const eq = wantedEq(onTarget(shift));
        for (const b of fitted) assert.ok(Math.abs(eq[b.i]) < 0.6, `${b.f}: ${eq[b.i]}`);
    }
    // Boom at 320 Hz, 10 dB: cut there, no deeper than the limit.
    const i320 = BANDS.indexOf(320);
    const boomy = onTarget(); boomy[i320] += 10;
    const cut = wantedEq(boomy);
    assert.ok(cut[i320] <= -3 && cut[i320] >= SPEAKER_EQ_LIMITS.cut, String(cut[i320]));
    // A dip of 6 dB at 2.5 kHz (a dull microphone): boosted, no more than the limit.
    const i2560 = BANDS.indexOf(2560);
    const dull = onTarget(); dull[i2560] -= 6; dull[i2560 + 1] -= 6;
    const lift = wantedEq(dull);
    assert.ok(lift[i2560] >= 2 && lift[i2560] <= SPEAKER_EQ_LIMITS.boost, String(lift[i2560]));
});

test('never a boost where the voice is not, or where the noise is', () => {
    // Nothing above 4 kHz (a phone line, a codec's cut-off): no boost there.
    const cutoff = onTarget(0, -100);
    BANDS.forEach((f, i) => { if (f >= 5120) cutoff[i] = -100; });
    const eq = wantedEq(cutoff);
    BANDS.forEach((f, i) => { if (f >= 5120) assert.ok(eq[i] <= 0.01, `${f}: ${eq[i]}`); });
    // A real dip, but the voice only 10 dB above the noise there: still no boost; at 18 dB, at most 4.
    const dull = onTarget(); const i = BANDS.indexOf(3620); dull[i] -= 8;
    const snr = BANDS.map(() => 40);
    snr[i] = 10;
    assert.ok(wantedEq(dull, snr)[i] <= 0.01);
    snr[i] = 18;
    assert.ok(wantedEq(dull, snr)[i] <= 4.01 && wantedEq(dull, snr)[i] > 2);
});

test('each speaker is brought to the same level, within limits', () => {
    const shape = onTarget(0, 20);
    const [a, b] = speakerSounds([
        { speaker: 'A', seconds: 100, bands: shape.map(x => x + 30) },
        { speaker: 'B', seconds: 100, bands: shape.map(x => x + 20) },
    ]);
    assert.ok(Math.abs(a.volumeDb + 5) < 0.2 && Math.abs(b.volumeDb - 5) < 0.2, `${a.volumeDb} ${b.volumeDb}`);
    // A whisper 40 dB down is raised no more than 12 dB.
    const [, c] = speakerSounds([
        { speaker: 'A', seconds: 1000, bands: shape.map(x => x + 30) },
        { speaker: 'C', seconds: 10, bands: shape.map(x => x - 10) },
    ]);
    assert.equal(c.volumeDb, 12);
});

test('the sound changes in the pause between two speakers, or where the next starts when they overlap', () => {
    const turns = [
        { speaker: 'A', startMs: 1000, endMs: 5000 },
        { speaker: 'A', startMs: 5200, endMs: 8000 },
        { speaker: 'B', startMs: 9000, endMs: 12000 },
        { speaker: 'A', startMs: 11500, endMs: 15000 },
        { speaker: 'X', startMs: 15500, endMs: 16000 },   // not one we have a sound for
    ];
    assert.deepEqual(switchPoints(turns, new Set(['A', 'B'])), [
        { atMs: 0, speaker: 'A' }, { atMs: 8500, speaker: 'B' }, { atMs: 11500, speaker: 'A' },
    ]);
    assert.deepEqual(turnsOf([{ speaker: 'A', start: 0, end: 900 }, { speaker: 'B', clip: true, start: 900, end: 2000 }]),
        [{ speaker: 'A', startMs: 0, endMs: 900 }, { speaker: '', startMs: 900, endMs: 2000 }]);
    // In a stretch from 9 s to 14 s: in its own times, cut at its ends.
    assert.deepEqual(turnsWithin(turns, 9000, 14000), [
        { speaker: 'B', startMs: 0, endMs: 3000 }, { speaker: 'A', startMs: 2500, endMs: 5000 },
    ]);
});

test('the commands and the chain', () => {
    const gains = BANDS.map((_, i) => (i === 2 ? 1.5 : 0));
    const sounds = [{ speaker: 'A', gains, volumeDb: 0 }, { speaker: 'B', gains, volumeDb: -6 }];
    const cmds = commandsFor([{ atMs: 0, speaker: 'A' }, { atMs: 8500, speaker: 'B' }], sounds);
    assert.match(cmds, /^8\.500 equalizer@eq0 g 0, equalizer@eq1 g 0, equalizer@eq2 g 1\.5, .*volume@lvl volume 0\.5012;$/);
    const chain = studioChain(sounds[0], '/tmp/run 1/studio:sound.cmd');
    assert.match(chain, /^asendcmd=f=\/tmp\/run 1\/studio\\:sound\.cmd,equalizer@eq0=f=80:t=o:w=0\.5:g=0,/);
    assert.match(chain, /volume@lvl=volume=1\.0000,deesser=.*,alimiter=.*latency=true,pan=stereo\|c0=c0\|c1=c0$/);
    assert.ok(!studioChain(sounds[0], null).includes('asendcmd'));
});

test('the FFT and the band meter find a tone in its band', () => {
    const n = 16, re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos(2 * Math.PI * 3 * i / n);
    fft(re, im);
    assert.ok(Math.abs(re[3] - 8) < 1e-9 && Math.abs(re[5]) < 1e-9);
    const meter = new BandMeter(48000);
    meter.add(Float32Array.from({ length: 48000 }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 1000 * i / 48000)));
    const bands = meter.bands();
    assert.equal(bands.indexOf(Math.max(...bands)), BANDS.indexOf(905));   // 1 kHz is in the 905 Hz band (761–1076)
    assert.equal(quantile([5, 1, 4, 2, 3], 0.1), 1);
    assert.equal(quantile([5, 1, 4, 2, 3], 0.95), 5);
});

test('Studio sound evens out two speakers and keeps the voice where it was (a stand-in for DeepFilterNet)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
    // Stands in for deep-filter -D [-a N] -o DIR FILE: copies the file, 30 ms short at the end as -D leaves it.
    const bin = path.join(dir, 'deep-filter');
    fs.writeFileSync(bin, '#!/bin/sh\nfor a; do f="$a"; done\nwhile [ "$1" != "-o" ]; do shift; done\nmkdir -p "$2"\n'
        + 'exec ffmpeg -y -hide_banner -loglevel error -i "$f" -af "areverse,atrim=start=0.03,areverse" -c:a pcm_s16le "$2/$(basename "$f")"\n');
    fs.chmodSync(bin, 0o755);
    // Two "speakers" taking 4 s turns over 64 s with 0.5 s pauses: B 14 dB quieter than A. Their voice is pink noise,
    // a sound that never repeats, so the timing can be checked.
    const src = path.join(dir, 'src.wav');
    const turns = Array.from({ length: 16 }, (_, k) => ({ speaker: k % 2 ? 'B' : 'A', startMs: k * 4000 + 250, endMs: k * 4000 + 3750 }));
    const on = (s: string) => turns.filter(t => t.speaker === s).map(t => `between(t\\,${t.startMs / 1000}\\,${t.endMs / 1000})`).join('+');
    ff(['-f', 'lavfi', '-i', 'anoisesrc=c=pink:a=0.25:d=64:r=48000:s=7',
        '-af', `volume='${on('A')}+0.2*(${on('B')})':eval=frame,pan=stereo|c0=c0|c1=c0`, '-c:a', 'pcm_s16le', src]);
    const out = path.join(dir, 'out.wav');
    const note = await studioSoundTrack(src, out, { bin, workDir: dir, durationSec: 64, turns });
    assert.match(note, /^A: [-+][\d.]+ dB, EQ .*; B: \+[\d.]+ dB, EQ /);
    const read = (f: string, mono: string) => {
        ff(['-i', f, '-ac', '1', '-c:a', 'pcm_s16le', mono]);
        const r = new WavReader(mono);
        const x = r.read(0, r.length);
        r.close();
        return x;
    };
    const a = read(src, path.join(dir, 'a.wav')), b = read(out, path.join(dir, 'b.wav'));
    assert.ok(Math.abs(b.length - a.length) <= 1, `${b.length} samples for ${a.length}`);
    const db = (x: Float32Array, s: string) => {
        let e = 0, n = 0;
        for (const t of turns.filter(t => t.speaker === s && t.startMs > 8000)) {
            for (let i = (t.startMs + 300) * 48; i < (t.endMs - 300) * 48; i++) { e += x[i] * x[i]; n++; }
        }
        return 10 * Math.log10(e / n);
    };
    const before = db(a, 'A') - db(a, 'B'), after = db(b, 'A') - db(b, 'B');
    assert.ok(before > 12 && Math.abs(after) < 4, `A over B: ${before.toFixed(1)} dB before, ${after.toFixed(1)} dB after`);
    // Where the sound is, to the sample: the best match of the two within ±5 ms, around a few moments.
    for (const at of [10.25, 30.25, 50.25]) {
        const from = Math.round(at * 48000);
        let best = -Infinity, lag = 0;
        for (let L = -240; L <= 240; L++) {
            let s = 0;
            for (let i = from; i < from + 9600; i++) s += a[i] * b[i + L];
            if (s > best) { best = s; lag = L; }
        }
        assert.ok(Math.abs(lag) <= 1, `${at} s: ${lag} samples late`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
});
