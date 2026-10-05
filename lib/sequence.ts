// Why: the edit as a sequence (spec 020, "The edit model, version 2"; item E3): what plays, in
// order, and where each moment of the recording lands in the edited episode. Every time that moves
// with the edit (chapters, quotes, the captions and the final cut's words, on-screen items, b-roll,
// the render's length) is mapped through a play order, so when transitions overlap two stretches
// (item E4) everything after them follows.

import { editedDuration, editedTime, keepRanges, type Cut, type KeptRange } from './edit';

// A kept stretch of the recording, and where it starts in the edited episode.
export interface Clip extends KeptRange { atMs: number }

export interface SequenceEdit { cuts: Cut[]; splits?: number[] }

// The kept stretches in play order (keepRanges: the cuts, kept off the words, slivers dropped),
// each with its place in the edited episode. Parts stay in source order (decision U4), and with no
// transitions yet each stretch starts where the one before it ends.
export function playOrder(edit: SequenceEdit, durationMs: number, words?: { start: number; end: number }[], padMs = 40): Clip[] {
    const out: Clip[] = [];
    let at = 0;
    for (const r of keepRanges(durationMs, edit.cuts, padMs, words)) {
        out.push({ startMs: r.startMs, endMs: r.endMs, atMs: at });
        at += r.endMs - r.startMs;
    }
    return out;
}

// Where a moment of the recording lands in the edited episode; null when it is cut, or with
// `roundToNextKept`, where the next kept stretch starts.
export function timelineTime(clips: Clip[], srcMs: number, roundToNextKept = false): number | null {
    return editedTime(srcMs, clips, roundToNextKept);
}

// The moment of the recording playing at a time in the edited episode; null outside it. Where two
// stretches overlap (a transition), the earlier one.
export function sourceTime(clips: Clip[], atMs: number): number | null {
    for (const c of clips) {
        if (atMs < c.atMs) return null;
        if (atMs <= c.atMs + (c.endMs - c.startMs)) return c.startMs + (atMs - c.atMs);
    }
    return null;
}

// How long the edited episode is.
export function sequenceLength(clips: Clip[]): number {
    return editedDuration(clips);
}
