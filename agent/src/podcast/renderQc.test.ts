// The render quality report (spec 019 item 0.2): parsers on canned ffmpeg output, the warning
// rules, the on-screen checks, and one real measurement of a short generated file.
// Run: npx tsx --test agent/src/podcast/renderQc.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { keepRanges } from '../../../lib/edit';
import { assCheck, measureRender, onScreenChecks, parseBlack, parseLoudness, parseSilences, qcWarnings, type Measured } from './renderQc';

// What ffmpeg 6.1 printed for a 6 s file: 2 s black, a 1.5 s tone, then silence to the end.
const CANNED = `[blackdetect @ 0x7f] black_start:0 black_end:2 black_duration:2
[silencedetect @ 0x55] silence_start: 1.5
[Parsed_ebur128_0 @ 0x55] Summary:

  Integrated loudness:
    I:         -22.2 LUFS
    Threshold: -32.5 LUFS

  Loudness range:
    LRA:         8.5 LU
    Threshold: -47.8 LUFS
    LRA low:   -33.5 LUFS
    LRA high:  -25.1 LUFS

  True peak:
    Peak:      -17.7 dBFS
[silencedetect @ 0x55] silence_end: 6.01397 | silence_duration: 4.51397`;

const good: Measured = {
    durationSeconds: 3000, videoSeconds: 3000, audioSeconds: 3000.02,
    integratedLufs: -14.1, truePeakDb: -1.4, silences: [], black: [],
};

test('parses the loudness summary, silences and black stretches', () => {
    assert.deepEqual(parseLoudness(CANNED), { integratedLufs: -22.2, truePeakDb: -17.7 });
    assert.deepEqual(parseSilences(CANNED, 6), [{ startSec: 1.5, endSec: 6.01397 }]);
    assert.deepEqual(parseBlack(CANNED), [{ startSec: 0, endSec: 2 }]);
});

test('a silence still open at the end runs to the end; no summary means no loudness', () => {
    assert.deepEqual(parseSilences('silence_start: 10', 14), [{ startSec: 10, endSec: 14 }]);
    assert.deepEqual(parseLoudness('nothing here'), { integratedLufs: null, truePeakDb: null });
    assert.equal(parseLoudness('Summary:\n  Integrated loudness:\n    I:  -inf LUFS\n  True peak:\n    Peak: -inf dBFS').integratedLufs, null);
});

test('a good render has nothing to look at', () => {
    assert.deepEqual(qcWarnings(good, { lengthSeconds: 3000.5, normalization: 'linear' }), []);
});

test('a broken loudness pass is a warning, never an error', () => {
    const w = qcWarnings({ ...good, integratedLufs: -19.3, truePeakDb: -0.2 }, { normalization: 'dynamic' });
    assert.equal(w.length, 3);
    assert.match(w[0], /-19\.3 LUFS; it should be -14 ± 1/);
    assert.match(w[1], /true peak is -0\.2 dBTP/);
    assert.match(w[2], /"dynamic"/);
});

test('length, dead air, black inside the episode only, and sync', () => {
    const w = qcWarnings({
        ...good,
        durationSeconds: 2990,
        silences: [{ startSec: 100, endSec: 102 }, { startSec: 600, endSec: 604.5 }],
        black: [{ startSec: 0, endSec: 2 }, { startSec: 1200, endSec: 1201 }],
        audioSeconds: 2990.2, videoSeconds: 2990,
    }, { lengthSeconds: 3000, episode: { startSec: 60, endSec: 2950 } });
    assert.equal(w.length, 4, w.join('\n'));
    assert.match(w[0], /2990|49:50/);
    assert.match(w[1], /Dead air: 4\.5 s of silence at 10:00/);
    assert.match(w[2], /Black picture for 1\.0 s at 20:00/);
    assert.match(w[3], /0\.20 s longer than the picture/);
});

test('on screen: a cut start, past the end, and cut short', () => {
    const ranges = keepRanges(60_000, [{ startMs: 10_000, endMs: 20_000, reason: 'manual' }]);   // 50 s kept
    const w = onScreenChecks([
        { anchor: { srcMs: 5_000 }, durationMs: 3000, label: 'Fine' },
        { anchor: { srcMs: 12_000 }, durationMs: 3000, label: 'In a cut' },
        { anchor: { srcMs: 58_000 }, durationMs: 5000, label: 'Too long' },
        // Pinned to the edited timeline, a layer is never "in a cut".
        { anchor: { atMs: 12_000 }, durationMs: 3000, label: 'Pinned' },
    ], ranges, 50_000);
    assert.equal(w.length, 2, w.join('\n'));
    assert.match(w[0], /"In a cut" starts in a cut part/);
    assert.match(w[1], /"Too long" runs past the end/);
    assert.match(onScreenChecks([{ anchor: { srcMs: 59_990 }, durationMs: 1000, label: 'Gone' }], keepRanges(60_000, [{ startMs: 50_000, endMs: 60_000, reason: 'manual' }]), 50_000)[0], /after the end/);
});

test('the subtitle file must hold every caption and text', () => {
    const ass = '[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Captions,,0,0,0,,hi\nDialogue: 1,0:00:03.00,0:00:04.00,Text1,,0,0,0,,name';
    assert.deepEqual(assCheck(ass, 2), []);
    assert.match(assCheck(ass, 3)[0], /1 of 3/);
    assert.match(assCheck(null, 1)[0], /1 of 1/);
});

test('measures a real file: black at the start, a tone, then dead air', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-'));
    const file = path.join(dir, 'qc.mp4');
    const made = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=2,format=yuv420p[a];color=c=red:s=320x180:d=4[b];[a][b]concat=n=2',
        '-f', 'lavfi', '-i', 'sine=f=440:d=1.5,apad=pad_dur=4.5', '-t', '6', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', file]);
    assert.equal(made.status, 0, String(made.stderr));
    const qc = await measureRender(file, { lengthSeconds: 6, normalization: 'linear' });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.ok(qc.integratedLufs !== null && qc.integratedLufs < -16, `loudness ${qc.integratedLufs}`);
    assert.equal(qc.black.length, 1);
    assert.ok(qc.silences.some(s => s.endSec - s.startSec > 4));
    assert.ok(qc.warnings.some(w => w.startsWith('The loudness is')));
    assert.ok(qc.warnings.some(w => w.startsWith('Dead air')));
    assert.ok(qc.warnings.some(w => w.startsWith('Black picture')));
});

test('a file that cannot be read gives a warning, not an error', async () => {
    const qc = await measureRender('/nonexistent/file.mp4', { onScreen: ['On screen: x'] });
    assert.match(qc.warnings[0], /could not run/);
    assert.equal(qc.warnings[1], 'On screen: x');
});
