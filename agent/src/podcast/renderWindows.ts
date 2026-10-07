// Why: the faster, resumable render (docs/specs/019-editor-light-v2.md item 4.2). The render used to encode the
// picture twice: each block of cut ranges, then the whole programme again with the teasers, intro, b-roll,
// layers and outro. Now the programme's sound is made once on its own (cheap), and its picture is cut into
// windows of the finished video, each built with everything that shows in it and encoded once; the windows
// are then joined without encoding again. This file plans that, without running anything:
//
// - the programme's pieces (teasers, intro, episode, outro) and the episode's parts (the stretches between
//   transitions at splits), each with its first frame in the finished video;
// - the windows, cut at the start of a kept stretch, never inside a transition;
// - what one window needs: the pieces, parts and kept stretches that show in it. A transition needs both
//   sides whole, so a piece or part next to one in the window is taken to its end (or from its start);
// - the sound, assembled sample by sample (PcmAssembler) with the same fades and crossfades ffmpeg made.

import * as fs from 'node:fs';

// The render's frame rate and the samples in one frame at 48 kHz: 1600, a whole number, so frame-exact.
export const FPS = 30;
export const RATE = 48000;
export const SAMPLES_PER_FRAME = RATE / FPS;
export const frameAt = (ms: number) => Math.round(ms * FPS / 1000);

// A kept stretch of the recording as it plays: its place in the recording (ms), and in frames its first frame
// in its part and its length.
export interface PlannedClip { startMs: number; endMs: number; at: number; frames: number }

// An episode part: its stretches, its first frame in the episode, its length, and the transition into it from
// the part before (frames, 0 for a straight cut).
export interface PlannedPart { clips: PlannedClip[]; start: number; frames: number; join: number; xfade: string | null }

// A piece of the programme: a section file (teaser, intro, outro) or the episode, with its first frame in the
// finished video, its length and the transition into it.
export interface PlannedPiece { kind: 'teaser' | 'intro' | 'episode' | 'outro'; file: string | null; start: number; frames: number; join: number; xfade: string | null }

// Where each piece starts when they are joined in order, each overlapping the one before by its transition,
// never more than the one before has left after its own transition in, nor more than itself (as chainPieces).
export function chainStarts(pieces: { frames: number; join: number }[]): { starts: number[]; joins: number[]; frames: number } {
    const starts: number[] = [], joins: number[] = [];
    let frames = 0, tail = 0;
    pieces.forEach((p, i) => {
        const d = i === 0 ? 0 : Math.min(p.join, tail, p.frames);
        starts.push(frames - d);
        joins.push(d);
        frames += p.frames - d;
        tail = p.frames - d;
    });
    return { starts, joins, frames };
}

// ─── Windows ─────────────────────────────────────────────────────────────────

// `edges`: the frames the fades at the very start and end take.
export interface WindowLimits { maxFrames: number; maxClips: number; edges?: { start: number; end: number } }

// Where the windows start, in frames of the finished video: at the start of a kept stretch (a straight cut), once
// the window so far is long enough or has enough stretches. Never inside a transition (between parts, or between
// the episode and the intro or outro), so each window's transitions have both sides whole; and never in the first
// or last second or fade. The first window starts at 0.
export function windowStarts(pieces: PlannedPiece[], parts: PlannedPart[], total: number, limits: WindowLimits): number[] {
    const out = [0];
    const e = pieces.findIndex(p => p.kind === 'episode');
    if (e < 0) return out;
    const ep = pieces[e], after = pieces[e + 1]?.join ?? 0;
    const lo = Math.max(FPS, limits.edges?.start ?? 0), hi = total - Math.max(FPS, limits.edges?.end ?? 0);
    let clips = 0;
    for (const [k, part] of parts.entries()) {
        const nextJoin = parts[k + 1]?.join ?? 0;
        part.clips.forEach(c => {
            const inEp = part.start + c.at, at = ep.start + inEp;
            const clear = c.at > 0 ? c.at >= part.join : part.join === 0;
            const cut = clear && part.frames - c.at > nextJoin && inEp >= ep.join && ep.frames - inEp > after;
            if (cut && at > out[out.length - 1] && at >= lo && at <= hi
                && (clips >= limits.maxClips || at - out[out.length - 1] >= limits.maxFrames)) {
                out.push(at);
                clips = 0;
            }
            clips++;
        });
    }
    return out;
}

// What one window [from, to) of the finished video needs.
export interface WindowContents {
    pieces: { piece: PlannedPiece; index: number }[];   // in order; the episode's is cut to `episode` below
    // The episode's parts and stretches that show (each part's stretches in order), the episode frame the
    // first one starts at, and how many frames they fill. Null when the episode is not in the window.
    episode: { parts: { part: PlannedPart; index: number; clips: PlannedClip[]; frames: number }[]; from: number; frames: number } | null;
    first: number;                                       // the frame of the finished video the window's pieces start at
}

export function windowContents(pieces: PlannedPiece[], parts: PlannedPart[], from: number, to: number): WindowContents {
    const overlaps = (s: number, n: number, a: number, b: number) => s < b && s + n > a;
    const inPieces = pieces.map((p, i) => ({ piece: p, index: i })).filter(x => overlaps(x.piece.start, x.piece.frames, from, to));
    const has = (i: number) => inPieces.some(x => x.index === i);
    let episode: WindowContents['episode'] = null;
    let first = inPieces[0]?.piece.start ?? from;
    const e = inPieces.find(x => x.piece.kind === 'episode');
    if (e) {
        const ep = e.piece;
        // A transition needs both sides whole: from the episode's start when the piece before is in the window,
        // to its end when the one after is.
        const lo = has(e.index - 1) ? 0 : Math.max(0, from - ep.start);
        const hi = has(e.index + 1) ? ep.frames : Math.min(ep.frames, to - ep.start);
        const inParts = parts.map((p, i) => ({ part: p, index: i })).filter(x => overlaps(x.part.start, x.part.frames, lo, hi));
        const partHas = (i: number) => inParts.some(x => x.index === i);
        const chosen = inParts.map(({ part, index }) => {
            const a = partHas(index - 1) ? 0 : lo - part.start, b = partHas(index + 1) ? part.frames : hi - part.start;
            const clips = part.clips.filter(c => c.at < b && c.at + c.frames > a);
            return { part, index, clips, frames: clips.reduce((t, c) => t + c.frames, 0) };
        }).filter(x => x.clips.length);
        if (chosen.length) {
            const epFrom = chosen[0].part.start + chosen[0].clips[0].at;
            const chained = chainStarts(chosen.map((c, k) => ({ frames: c.frames, join: k === 0 ? 0 : c.part.join })));
            episode = { parts: chosen, from: epFrom, frames: chained.frames };
            if (inPieces[0].index === e.index) first = ep.start + epFrom;
        } else if (!parts.length) {
            // Everything was cut: the episode is a frame of black.
            episode = { parts: [], from: 0, frames: ep.frames };
        }
    }
    return { pieces: inPieces, episode, first };
}

// ─── Sound ───────────────────────────────────────────────────────────────────

// Writes 48 kHz stereo 16-bit PCM to a file, piece after piece: straight on, or crossfaded over the end of what
// came before (both linear, as acrossfade's tri curves). It keeps the last `holdSamples` frames' worth back
// until it knows whether the next piece overlaps them.
export class PcmAssembler {
    private tail = new Int16Array(0);
    private fd: number;
    written = 0;                                         // sample frames (one sample per channel) written or held

    constructor(file: string, private hold: number) { this.fd = fs.openSync(file, 'w'); }

    // Adds `pcm` (interleaved stereo), its first `overlap` sample frames mixed over the last ones held.
    add(pcm: Int16Array, overlap = 0) {
        const o = Math.min(overlap, this.tail.length / 2, pcm.length / 2);
        let joined: Int16Array;
        if (o > 0) {
            const keep = this.tail.length - o * 2;
            joined = new Int16Array(keep + pcm.length);
            joined.set(this.tail.subarray(0, keep));
            for (let i = 0; i < o; i++) {
                const g = (i + 0.5) / o;
                for (let ch = 0; ch < 2; ch++) {
                    const a = this.tail[keep + i * 2 + ch], b = pcm[i * 2 + ch];
                    joined[keep + i * 2 + ch] = Math.max(-32768, Math.min(32767, Math.round(a * (1 - g) + b * g)));
                }
            }
            joined.set(pcm.subarray(o * 2), keep + o * 2);
            this.written -= o;
        } else {
            joined = new Int16Array(this.tail.length + pcm.length);
            joined.set(this.tail);
            joined.set(pcm, this.tail.length);
        }
        this.written += pcm.length / 2;
        const keepBack = Math.min(joined.length, this.hold * 2);
        const flush = joined.subarray(0, joined.length - keepBack);
        if (flush.length) fs.writeSync(this.fd, Buffer.from(flush.buffer, flush.byteOffset, flush.byteLength));
        this.tail = joined.slice(joined.length - keepBack);
    }

    close() {
        if (this.tail.length) fs.writeSync(this.fd, Buffer.from(this.tail.buffer, this.tail.byteOffset, this.tail.byteLength));
        fs.closeSync(this.fd);
    }
}

// Reads `frames` sample frames of stereo PCM from a raw file from sample frame `at`; past its end, silence.
export function readPcm(fd: number, at: number, frames: number): Int16Array {
    const out = new Int16Array(frames * 2);
    if (at < 0) { const skip = Math.min(frames, -at); return readPcmInto(fd, 0, frames - skip, out, skip); }
    return readPcmInto(fd, at, frames, out, 0);
}
function readPcmInto(fd: number, at: number, frames: number, out: Int16Array, offset: number) {
    const buf = Buffer.alloc(frames * 4);
    const got = fs.readSync(fd, buf, 0, buf.length, at * 4);
    const src = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(got / 2));
    out.set(src, offset * 2);
    return out;
}

// A kept stretch's sound: `frames` video frames of it from `startMs`, with a short fade in and out (15 ms) so a
// cut never clicks, unless it is too short for both.
export function clipPcm(fd: number, startMs: number, frames: number, fadeMs = 15): Int16Array {
    const n = frames * SAMPLES_PER_FRAME;
    const pcm = readPcm(fd, Math.round(startMs * RATE / 1000), n);
    const f = Math.round(fadeMs * RATE / 1000);
    if (n > f * 2) {
        for (let i = 0; i < f; i++) {
            const gIn = i / f, gOut = i / f;
            for (let ch = 0; ch < 2; ch++) {
                pcm[i * 2 + ch] = Math.round(pcm[i * 2 + ch] * gIn);
                pcm[(n - 1 - i) * 2 + ch] = Math.round(pcm[(n - 1 - i) * 2 + ch] * gOut);
            }
        }
    }
    return pcm;
}
