// Why: the edit as a sequence (spec 020, "The edit model, version 2"; items E3 and E4): what plays,
// in order, and where each moment of the recording lands in the edited episode. Every time that
// moves with the edit (chapters, quotes, the captions and the final cut's words, on-screen items,
// b-roll, the render's length) is mapped through a play order. A transition at a split overlaps the
// parts on either side (item E4), so everything after it lands that much earlier.

import { editedDuration, editedTime, isReordered, keepRanges, validOrder, type Cut, type KeptRange } from './edit';
import { joinKey, splitTransitions, type Join, type TransitionKind } from './transitions';

// A kept stretch of the recording, where it starts in the edited episode, and which part it is in
// (the parts are what the transitions at splits divide the episode into).
export interface Clip extends KeptRange { atMs: number; part?: number }

// `order` (spec 020 item E9): the sections between splits in play order; missing, the recording's.
export interface SequenceEdit { cuts: Cut[]; splits?: number[]; joins?: Join[]; order?: number[] | null }

// A transition between two parts, as it plays: the later part (`part`) starts at atMs in the edited
// episode, durationMs before the earlier one ends. In the recording, the earlier part's overlap runs
// from aFromMs to aEndMs and the later one's from bStartMs to bUntilMs.
export interface PartJoin {
    atMs: number; durationMs: number; transition: Exclude<TransitionKind, 'cut'>; splitMs: number; part: number;
    aFromMs: number; aEndMs: number; bStartMs: number; bUntilMs: number;
}

export interface Sequence {
    clips: Clip[];
    joins: PartJoin[];
    // Transitions that play as straight cuts, by joinKey, and why.
    skipped: Record<string, string>;
}

// A split this close to the edge of a kept stretch does not divide it: the stretch goes whole to
// one side, so no part starts or ends with a sliver.
const SPLIT_SLACK_MS = 100;

// The kept stretches in play order (keepRanges: the cuts, kept off the words, slivers dropped),
// each with its place in the edited episode. Parts keep the recording's order unless the edit moved them (`order`,
// spec 020 item E9; decision U4 kept them in order until then). Where a
// split has a transition, the part after it starts that much before the part before it ends; a
// transition longer than either part, or than what the part has left after the transition at its
// other end, plays as a straight cut instead (`skipped`).
export function sequenceOf(edit: SequenceEdit, durationMs: number, words?: { start: number; end: number }[], padMs = 40): Sequence {
    const ranges = keepRanges(durationMs, edit.cuts, padMs, words);
    const trans = splitTransitions(edit.joins, edit.splits);
    const skipped: Record<string, string> = {};
    // Moved sections (spec 020 item E9): the parts are then every section between splits, in the edit's order, and
    // the transition into a part is the one at the split it starts at. Otherwise the parts are what the transitions'
    // splits divide, in the recording's order, as before.
    const splits = [...(edit.splits ?? [])].sort((a, b) => a - b);
    const moved = isReordered(edit.order) && validOrder(edit.order, splits.length + 1);
    const bounds = moved ? splits : trans.map(t => t.atMs);

    // The stretches, divided at the bounds; part = how many of them come before.
    let clips: Clip[] = [];
    let k = 0;
    for (const r of ranges) {
        let start = r.startMs;
        while (k < bounds.length && bounds[k] <= start + SPLIT_SLACK_MS) k++;
        for (; k < bounds.length && bounds[k] < r.endMs - SPLIT_SLACK_MS; k++) {
            clips.push({ startMs: start, endMs: bounds[k], atMs: 0, part: k });
            start = bounds[k];
        }
        clips.push({ startMs: start, endMs: r.endMs, atMs: 0, part: k });
    }
    if (moved) {
        const place = new Map(edit.order!.map((section, i) => [section, i]));
        clips = clips.map((c, i) => ({ c, i })).sort((a, b) => place.get(a.c.part!)! - place.get(b.c.part!)! || a.i - b.i).map(x => x.c);
    }
    // The transition into a part, when the part before it is `prev`.
    const into = (p: { part: number }, prev: { part: number }) => moved
        ? (p.part > 0 ? trans.find(t => t.atMs === splits[p.part - 1]) : undefined)
        : trans[prev.part];

    // The parts that have something in them, in order, with their lengths.
    const parts: { part: number; first: number; last: number; lengthMs: number }[] = [];
    clips.forEach((c, i) => {
        const p = parts[parts.length - 1];
        if (p && p.part === c.part) { p.last = i; p.lengthMs += c.endMs - c.startMs; }
        else parts.push({ part: c.part!, first: i, last: i, lengthMs: c.endMs - c.startMs });
    });

    // Each part's place: after the one before, less the transition between them.
    const joins: PartJoin[] = [];
    let at = 0, usedHead = 0;
    parts.forEach((p, i) => {
        if (i > 0) {
            const prev = parts[i - 1];
            // The transition at the first split after the earlier part (or, moved, the split this part starts at).
            const t = into(p, prev);
            const room = Math.min(prev.lengthMs - usedHead, p.lengthMs);
            if (t && t.durationMs > room) {
                skipped[joinKey({ atSplit: t.atMs })] = 'Longer than the section before or after it, so it plays as a straight cut.';
            }
            const d = t && t.durationMs <= room ? t.durationMs : 0;
            at -= d;
            usedHead = d;
            if (t && d) {
                joins.push({
                    atMs: at, durationMs: d, transition: t.transition, splitMs: t.atMs, part: p.part,
                    aFromMs: walk(clips, prev.last, -d), aEndMs: clips[prev.last].endMs,
                    bStartMs: clips[p.first].startMs, bUntilMs: walk(clips, p.first, d),
                });
            }
        }
        let offset = at;
        for (let i2 = p.first; i2 <= p.last; i2++) {
            clips[i2].atMs = offset;
            offset += clips[i2].endMs - clips[i2].startMs;
        }
        at = offset;
    });
    // Transitions whose splits fall where nothing is kept between them never play.
    for (const t of trans) {
        const key = joinKey({ atSplit: t.atMs });
        if (skipped[key] || joins.some(j => j.splitMs === t.atMs)) continue;
        skipped[key] = moved && parts[0]?.part === splits.indexOf(t.atMs) + 1
            ? 'The section after it now plays first, so nothing comes before it to join.'
            : 'Nothing is kept on one side of it, so it does not play.';
    }
    return { clips, joins, skipped };
}

// The moment of the recording `ms` of kept material from the start (ms > 0) or the end (ms < 0) of
// clip i, within its part.
function walk(clips: Clip[], i: number, ms: number): number {
    const part = clips[i].part;
    if (ms < 0) {
        let left = -ms;
        for (let j = i; j >= 0 && clips[j].part === part; j--) {
            const len = clips[j].endMs - clips[j].startMs;
            if (len >= left) return clips[j].endMs - left;
            left -= len;
        }
        return clips[i].startMs;
    }
    let left = ms;
    for (let j = i; j < clips.length && clips[j].part === part; j++) {
        const len = clips[j].endMs - clips[j].startMs;
        if (len >= left) return clips[j].startMs + left;
        left -= len;
    }
    return clips[i].endMs;
}

// The play order: the clips of sequenceOf.
export function playOrder(edit: SequenceEdit, durationMs: number, words?: { start: number; end: number }[], padMs = 40): Clip[] {
    return sequenceOf(edit, durationMs, words, padMs).clips;
}

// What the editor's preview plays with one video: the clips, with the start of each part after a
// transition left out (a second video plays it over the end of the part before; TransitionPreview).
export function previewRanges(seq: Sequence): KeptRange[] {
    const out: KeptRange[] = [];
    for (const c of seq.clips) {
        const j = seq.joins.find(x => x.part === c.part);
        const from = j ? Math.max(c.startMs, Math.min(c.endMs, j.bUntilMs)) : c.startMs;
        if (c.endMs > from) out.push({ startMs: from, endMs: c.endMs });
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

// How long after a stretch's end the video can be and still have just played past it (rather than been moved).
const PASSED_MS = 500;

// The preview's step through the edit with one video (spec 020 item E9): `ranges` in play order, the video at `t`,
// and the stretch it was playing (`current`, -1 at first). It stays; or, having just played past the end of its
// stretch, goes to the start of the next one in play order, wherever that is in the recording; or, moved by hand,
// takes the stretch it is now in, or the next kept moment of the recording. In the recording's order this is the
// skip over each cut the editor always made.
export function playStep(ranges: KeptRange[], t: number, current: number): { index: number; seekTo: number | null } {
    const r = ranges[current];
    if (r && t >= r.startMs - 1 && t < r.endMs) return { index: current, seekTo: null };
    if (r && t >= r.endMs && t < r.endMs + PASSED_MS) {
        const next = ranges[current + 1];
        if (!next) return { index: current, seekTo: null };
        return { index: current + 1, seekTo: t >= next.startMs && t < next.endMs ? null : next.startMs };
    }
    const inside = ranges.findIndex(x => t >= x.startMs && t < x.endMs);
    if (inside >= 0) return { index: inside, seekTo: null };
    let after = -1;
    ranges.forEach((x, i) => { if (x.startMs > t && (after < 0 || x.startMs < ranges[after].startMs)) after = i; });
    return after < 0 ? { index: current, seekTo: null } : { index: after, seekTo: ranges[after].startMs };
}
