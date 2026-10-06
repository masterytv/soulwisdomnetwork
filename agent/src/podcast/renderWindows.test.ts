// Spec 019 item 4.2: planning the render's windows and its sound. Each window must have every transition it
// shows whole, and the sound must keep to the frames.
// Run: npx tsx --test agent/src/podcast/renderWindows.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    chainStarts, clipPcm, FPS, PcmAssembler, readPcm, SAMPLES_PER_FRAME, windowContents, windowStarts,
    type PlannedPart, type PlannedPiece,
} from './renderWindows';

// A part of `n` stretches of `len` frames each, the recording read on from `fromMs`.
function part(n: number, len: number, join = 0, fromMs = 0): PlannedPart {
    const clips = Array.from({ length: n }, (_, i) => ({ startMs: fromMs + i * 10_000, endMs: fromMs + i * 10_000 + len * 1000 / FPS, at: i * len, frames: len }));
    return { clips, start: 0, frames: n * len, join, xfade: join ? 'fade' : null };
}
function plan(parts: PlannedPart[], intro = 0, introJoin = 0, outro = 0, outroJoin = 0) {
    const pc = chainStarts(parts);
    parts.forEach((p, k) => { p.start = pc.starts[k]; p.join = pc.joins[k]; });
    const pieces: PlannedPiece[] = [
        ...(intro ? [{ kind: 'intro' as const, file: 'intro.mp4', start: 0, frames: intro, join: 0, xfade: null }] : []),
        { kind: 'episode', file: null, start: 0, frames: pc.frames || 1, join: introJoin, xfade: introJoin ? 'fade' : null },
        ...(outro ? [{ kind: 'outro' as const, file: 'intro.mp4', start: 0, frames: outro, join: outroJoin, xfade: outroJoin ? 'fade' : null }] : []),
    ];
    const pr = chainStarts(pieces);
    pieces.forEach((p, k) => { p.start = pr.starts[k]; p.join = pr.joins[k]; });
    return { pieces, parts, total: pr.frames };
}

test('pieces overlap by their transitions, never more than the one before has left', () => {
    assert.deepEqual(chainStarts([{ frames: 100, join: 0 }, { frames: 50, join: 30 }, { frames: 40, join: 0 }]), { starts: [0, 70, 120], joins: [0, 30, 0], frames: 160 });
    // A transition longer than what is left plays shorter.
    assert.deepEqual(chainStarts([{ frames: 20, join: 0 }, { frames: 50, join: 30 }]).joins, [0, 20]);
});

test('windows start at a cut, after enough stretches or frames, never inside a transition or the edge fades', () => {
    const p = plan([part(30, 90), part(30, 90, 15)], 240, 15, 240, 15);
    const starts = windowStarts(p.pieces, p.parts, p.total, { maxFrames: 100_000, maxClips: 20, edges: { start: 30, end: 30 } });
    const ep = p.pieces[1];
    // After 20 stretches of the first part, then 20 more (10 of the first, 10 of the second).
    assert.deepEqual(starts, [0, ep.start + 20 * 90, ep.start + p.parts[1].start + 10 * 90]);
    // By length: every 10 stretches' worth of frames.
    const byLength = windowStarts(p.pieces, p.parts, p.total, { maxFrames: 900, maxClips: 100 });
    assert.ok(byLength.length >= 6);
    for (const s of byLength.slice(1)) {
        const inEp = s - ep.start;
        // Not inside the dissolve into the second part, nor the intro's or outro's.
        assert.ok(!(inEp > p.parts[1].start && inEp < p.parts[1].start + 15), String(s));
        assert.ok(inEp >= 15 && ep.frames - inEp > 15, String(s));
    }
});

test('a window has what shows in it, and both sides of every transition in it whole', () => {
    const p = plan([part(10, 90), part(10, 90, 30)], 240, 15, 240, 15);
    const ep = p.pieces[1];
    // In the middle of the first part: only its stretches there.
    const mid = windowContents(p.pieces, p.parts, ep.start + 270, ep.start + 540);
    assert.deepEqual(mid.pieces.map(x => x.piece.kind), ['episode']);
    assert.deepEqual(mid.episode!.parts[0].clips.map(c => c.at), [270, 360, 450]);
    assert.equal(mid.first, ep.start + 270);
    // Across the dissolve between the parts: the first part to its end and the second from its start.
    const across = windowContents(p.pieces, p.parts, ep.start + 810, ep.start + p.parts[1].start + 180);
    assert.deepEqual(across.episode!.parts.map(x => [x.index, x.clips[0].at, x.clips.length]), [[0, 810, 1], [1, 0, 2]]);
    assert.equal(across.episode!.frames, 90 + 180 - 30);
    // The first window: the intro, and the episode from its start (the intro dissolves into it).
    const first = windowContents(p.pieces, p.parts, 0, ep.start + 180);
    assert.deepEqual(first.pieces.map(x => x.piece.kind), ['intro', 'episode']);
    assert.deepEqual([first.first, first.episode!.from, first.episode!.parts[0].clips.length], [0, 0, 2]);
    // The last: the episode to its end and the outro.
    const last = windowContents(p.pieces, p.parts, ep.start + p.parts[1].start + 720, p.total);
    assert.deepEqual(last.pieces.map(x => x.piece.kind), ['episode', 'outro']);
    assert.deepEqual(last.episode!.parts.map(x => x.clips.map(c => c.at)), [[720, 810]]);
    // Everything cut: a frame of black.
    const none = plan([]);
    assert.deepEqual(windowContents(none.pieces, none.parts, 0, 1).episode, { parts: [], from: 0, frames: 1 });
});

test('the sound: straight on, crossfaded at a transition, and the hold never loses a sample', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcm-'));
    const file = path.join(dir, 'out.raw');
    const block = (frames: number, v: number) => new Int16Array(frames * 2).fill(v);
    const asm = new PcmAssembler(file, 100);
    asm.add(block(300, 1000));
    asm.add(block(300, 2000));
    asm.add(block(200, -1000), 100);
    asm.close();
    const buf = fs.readFileSync(file);
    const out = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
    assert.equal(out.length / 2, 300 + 300 + 200 - 100);
    assert.equal(asm.written, 700);
    assert.deepEqual([out[0], out[600], out[1000], out[1198], out[1398]], [1000, 2000, Math.round(2000 * 0.995 - 1000 * 0.005), -985, -1000]);
    // From the middle of the crossfade the two are mixed about half and half.
    assert.ok(Math.abs(out[(500 + 50) * 2] - 500) < 20, String(out[(500 + 50) * 2]));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('a kept stretch\'s sound: its frames exactly, faded in and out, silence past the end of the recording', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcm-'));
    const file = path.join(dir, 'voice.raw');
    fs.writeFileSync(file, Buffer.from(new Int16Array(48_000 * 2).fill(1000).buffer));
    const fd = fs.openSync(file, 'r');
    const pcm = clipPcm(fd, 500, 3);
    assert.equal(pcm.length, 3 * SAMPLES_PER_FRAME * 2);
    assert.deepEqual([pcm[0], pcm[720 * 2], pcm[2000], pcm[pcm.length - 1]], [0, 1000, 1000, 0]);
    const tail = readPcm(fd, 47_990, 20);
    assert.deepEqual([tail[0], tail[19], tail[20], tail[39]], [1000, 1000, 0, 0]);
    fs.closeSync(fd);
    fs.rmSync(dir, { recursive: true, force: true });
});
