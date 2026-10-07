// Why: the Studio editor's timeline (spec 020 item E2) — what part of the recording it shows and
// how far zoomed, the ruler, snapping, and dragging a cut's edges (spec 019 item 2.2). Pure, so the
// rules are tested; components/studio/timeline.tsx draws with them.

import type { Cut, KeptRange } from './edit';
import { mmss } from './showNotes';

// ---- Zoom and scroll ----

// The closest the timeline zooms: 500 pixels a second, 2 ms a pixel.
export const MAX_PX_PER_MS = 0.5;

// The zoom that shows the whole recording in `widthPx`.
export function fitPxPerMs(totalMs: number, widthPx: number): number {
    return totalMs > 0 && widthPx > 0 ? widthPx / totalMs : MAX_PX_PER_MS;
}

// A zoom between showing everything and the closest.
export function clampZoom(pxPerMs: number, fit: number): number {
    const lo = Math.min(fit, MAX_PX_PER_MS);
    return Math.min(MAX_PX_PER_MS, Math.max(lo, pxPerMs));
}

// A scroll position within the recording.
export function clampScroll(scrollPx: number, totalMs: number, pxPerMs: number, widthPx: number): number {
    return Math.max(0, Math.min(scrollPx, totalMs * pxPerMs - widthPx));
}

// The scroll position after zooming that keeps the moment under `anchorX` (pixels from the left
// edge of the view) where it is.
export function zoomAround(pxPerMs: number, nextPxPerMs: number, scrollPx: number, anchorX: number): number {
    const anchorMs = (scrollPx + anchorX) / pxPerMs;
    return anchorMs * nextPxPerMs - anchorX;
}

// ---- Ruler ----

const STEPS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 900000, 1800000, 3600000];

// The ms between labelled ticks at a zoom: the first step at least 80 pixels wide, never more than an hour.
export function stepFor(pxPerMs: number): number {
    if (!(pxPerMs > 0)) return 3600000;
    return STEPS.find(step => step * pxPerMs >= 80) ?? 3600000;
}

// The same for a whole recording drawn `widthPx` wide.
export function tickStep(totalMs: number, widthPx: number): number {
    if (totalMs <= 0 || widthPx <= 0) return 3600000;
    return stepFor(widthPx / totalMs);
}

// 0, step, 2*step, ... while each is <= totalMs.
export function ticks(totalMs: number, widthPx: number): number[] {
    if (totalMs <= 0) return [];
    return ticksBetween(0, totalMs, tickStep(totalMs, widthPx));
}

// The multiples of `stepMs` from `fromMs` to `toMs`, both included.
export function ticksBetween(fromMs: number, toMs: number, stepMs: number): number[] {
    const out: number[] = [];
    for (let t = Math.max(0, Math.ceil(fromMs / stepMs)) * stepMs; t <= toMs; t += stepMs) out.push(t);
    return out;
}

// mm:ss for the ruler labels.
export function tickLabel(ms: number): string {
    return mmss(ms);
}

// A ruler label, with tenths or hundredths of a second when the ticks are that close.
export function tickText(ms: number, stepMs: number): string {
    if (stepMs >= 1000) return mmss(ms);
    const digits = stepMs >= 100 ? 1 : 2;
    const frac = Math.floor((ms % 1000) / (digits === 1 ? 100 : 10));
    return `${mmss(ms)}.${String(frac).padStart(digits, '0')}`;
}

// A precise time, as m:ss.cc, for what is selected or dragged.
export function preciseTime(ms: number): string {
    return tickText(Math.round(ms), 10);
}

// ms as a percentage of totalMs, kept to 0..100; 0 when totalMs is non-positive.
export function pct(ms: number, totalMs: number): number {
    if (totalMs <= 0) return 0;
    const v = ms / totalMs * 100;
    return Math.max(0, Math.min(100, v));
}

// The ms at a click x in a widthPx-wide track over totalMs, clamped to 0..totalMs.
export function msAt(x: number, widthPx: number, totalMs: number): number {
    if (widthPx <= 0) return 0;
    const v = Math.round(x / widthPx * totalMs);
    return Math.max(0, Math.min(totalMs, v));
}

// ---- Speakers ----

export interface SpeakerBlock { speaker: string; startMs: number; endMs: number }

// Consecutive words of one speaker make one block, from the first word's start
// to the last word's end.
export function speakerBlocks(words: { speaker: string; start: number; end: number }[]): SpeakerBlock[] {
    const blocks: SpeakerBlock[] = [];
    for (const w of words) {
        const last = blocks[blocks.length - 1];
        if (last && last.speaker === w.speaker) {
            last.endMs = w.end;
        } else {
            blocks.push({ speaker: w.speaker, startMs: w.start, endMs: w.end });
        }
    }
    return blocks;
}

export const SPEAKER_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#fb7185', '#facc15', '#2dd4bf'] as const;

// A colour per speaker, in the order they first appear; the 9th reuses the 1st.
export function speakerColors(blocks: SpeakerBlock[]): Record<string, string> {
    const speakers: string[] = [];
    for (const b of blocks) if (!speakers.includes(b.speaker)) speakers.push(b.speaker);
    const out: Record<string, string> = {};
    for (let i = 0; i < speakers.length; i++) {
        out[speakers[i]] = SPEAKER_COLORS[i % SPEAKER_COLORS.length];
    }
    return out;
}

// ---- Snapping ----

// Drags land on whole 10 ms steps, the peaks' resolution, unless they snap to something.
export const DRAG_STEP_MS = 10;
export const roundToStep = (ms: number) => Math.round(ms / DRAG_STEP_MS) * DRAG_STEP_MS;

// Snaps are this close, in pixels.
export const SNAP_PX = 8;

// The value nearest `ms` in a sorted list, or undefined when the list is empty.
export function nearest(sorted: number[], ms: number): number | undefined {
    if (!sorted.length) return undefined;
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < ms) lo = mid + 1; else hi = mid; }
    const after = sorted[Math.min(lo, sorted.length - 1)];
    const before = sorted[Math.max(0, lo - 1)];
    return Math.abs(after - ms) < Math.abs(ms - before) ? after : before;
}

// `ms` snapped to the nearest target within `withinMs` (the playhead, word edges, cut edges and
// splits, each list sorted), or rounded to the 10 ms step when none is that close. `to` is the
// target it snapped to, for the guide line.
export function snapMs(ms: number, targets: number[][], withinMs: number): { ms: number; to: number | null } {
    let best: number | null = null;
    for (const list of targets) {
        const n = nearest(list, ms);
        if (n !== undefined && Math.abs(n - ms) <= withinMs && (best === null || Math.abs(n - ms) < Math.abs(best - ms))) best = n;
    }
    return best === null ? { ms: roundToStep(ms), to: null } : { ms: best, to: best };
}

// Every word's start and end, sorted: snap targets.
export function wordEdges(words: { start: number; end: number }[]): number[] {
    const out = new Float64Array(words.length * 2);
    words.forEach((w, i) => { out[2 * i] = w.start; out[2 * i + 1] = w.end; });
    return Array.from(out.sort());
}

// ---- Cuts on the timeline (spec 019 item 2.2) ----

// A cut is at least this long.
export const MIN_CUT_MS = 10;

// What the edit takes out, as heard: the stretches between the kept ranges.
export function removedRanges(ranges: KeptRange[], totalMs: number): KeptRange[] {
    const out: KeptRange[] = [];
    let cursor = 0;
    for (const r of ranges) {
        if (r.startMs > cursor) out.push({ startMs: cursor, endMs: r.startMs });
        cursor = Math.max(cursor, r.endMs);
    }
    if (totalMs > cursor) out.push({ startMs: cursor, endMs: totalMs });
    return out;
}

// The shortest cut covering a moment (cuts can overlap: a filler inside a cut sentence).
export function cutAt(cuts: Cut[], ms: number): Cut | undefined {
    let best: Cut | undefined;
    for (const c of cuts) {
        if (ms >= c.startMs && ms <= c.endMs && (!best || c.endMs - c.startMs < best.endMs - best.startMs)) best = c;
    }
    return best;
}

// The cut edge nearest a moment, within `withinMs`. When two edges are as near, the one whose cut
// lies on the moment's side wins, so two touching cuts can each be grabbed.
export function edgeAt(cuts: Cut[], ms: number, withinMs: number): { cut: Cut; edge: 'start' | 'end' } | null {
    let best: { cut: Cut; edge: 'start' | 'end'; d: number; inside: boolean } | null = null;
    for (const cut of cuts) {
        for (const edge of ['start', 'end'] as const) {
            const at = edge === 'start' ? cut.startMs : cut.endMs;
            const d = Math.abs(ms - at);
            if (d > withinMs) continue;
            const inside = edge === 'start' ? ms >= at : ms <= at;
            if (!best || d < best.d || (d === best.d && inside && !best.inside)) best = { cut, edge, d, inside };
        }
    }
    return best && { cut: best.cut, edge: best.edge };
}

// The words still heard if `skip` were not there: those not wholly inside another cut. A cut's
// edges keep clear of these words.
export function keptWords<W extends { start: number; end: number }>(words: W[], cuts: Cut[], skip?: Cut): W[] {
    const others = cuts.filter(c => c !== skip).sort((a, b) => a.startMs - b.startMs);
    // Merged, so a word cut by two touching cuts counts as cut.
    const merged: { startMs: number; endMs: number }[] = [];
    for (const c of others) {
        const last = merged[merged.length - 1];
        if (last && c.startMs <= last.endMs) last.endMs = Math.max(last.endMs, c.endMs);
        else merged.push({ startMs: c.startMs, endMs: c.endMs });
    }
    const out: W[] = [];
    let k = 0;
    for (const w of words) {
        while (k < merged.length && merged[k].endMs < w.start) k++;
        const m = merged[k];
        if (!(m && m.startMs <= w.start && m.endMs >= w.end)) out.push(w);
    }
    return out;
}

// How far a cut's edge may go without entering a word that is heard: the start no earlier than the
// end of the last heard word before the cut, the end no later than the start of the first heard word
// after it, and never closer than MIN_CUT_MS to the other edge. `kept` is from keptWords, sorted.
export function edgeLimits(cut: Cut, edge: 'start' | 'end', kept: { start: number; end: number }[], totalMs: number): [number, number] {
    if (edge === 'start') {
        let lo = 0;
        for (const w of kept) { if (w.end <= cut.startMs) lo = Math.max(lo, w.end); else if (w.start >= cut.startMs) break; }
        return [lo, cut.endMs - MIN_CUT_MS];
    }
    let hi = totalMs;
    for (let i = kept.length - 1; i >= 0; i--) {
        const w = kept[i];
        if (w.start >= cut.endMs) hi = Math.min(hi, w.start); else if (w.end <= cut.endMs) break;
    }
    return [cut.startMs + MIN_CUT_MS, hi];
}

// An edge kept within its limits and out of every heard word: one that lands inside a word moves
// to the word's nearer edge (or the other edge, when the nearer one is out of bounds).
export function clampToWords(ms: number, kept: { start: number; end: number }[], [lo, hi]: [number, number]): number {
    let v = Math.min(hi, Math.max(lo, ms));
    let a = 0, b = kept.length;
    while (a < b) { const mid = (a + b) >> 1; if (kept[mid].end <= v) a = mid + 1; else b = mid; }
    for (let i = Math.max(0, a - 1); i < kept.length && kept[i].start < v; i++) {
        const w = kept[i];
        if (w.start < v && v < w.end) {
            const near = v - w.start <= w.end - v ? w.start : w.end;
            const far = near === w.start ? w.end : w.start;
            v = near >= lo && near <= hi ? near : far >= lo && far <= hi ? far : v;
            break;
        }
    }
    return v;
}

// The cuts with one cut's edge moved. The cut becomes the producer's own ('manual'): marking
// suggestions again, or clearing a kind, then leaves it alone.
export function moveCutEdge(cuts: Cut[], cut: Cut, edge: 'start' | 'end', ms: number): Cut[] {
    const v = Math.round(ms);
    return cuts.map(c => {
        if (c !== cut) return c;
        const startMs = edge === 'start' ? Math.min(v, c.endMs - MIN_CUT_MS) : c.startMs;
        const endMs = edge === 'end' ? Math.max(v, c.startMs + MIN_CUT_MS) : c.endMs;
        return { startMs: Math.max(0, startMs), endMs, reason: 'manual' as const };
    });
}

// A stretch of time chosen on the timeline, from `a` to `b` in either order, as a cut of at least
// MIN_CUT_MS within the recording; null when it is too short.
export function rangeOf(a: number, b: number, totalMs: number): KeptRange | null {
    const startMs = Math.max(0, Math.round(Math.min(a, b)));
    const endMs = Math.min(totalMs, Math.round(Math.max(a, b)));
    return endMs - startMs >= MIN_CUT_MS ? { startMs, endMs } : null;
}

// ---- Sections in play order (spec 020 item E11) ----

// Where the timeline draws each moment of the recording: the sections between splits laid end to end in the order
// they play (`order`, spec 020 item E9), each whole, its cuts drawn inside it. In the recording's order every moment
// is where it always was. `pieces` are the sections in play order, each with where it starts on the timeline.
export interface TimelineAxis {
    moved: boolean;
    pieces: { srcStart: number; srcEnd: number; viewStart: number; section: number }[];
    toView: (srcMs: number) => number;
    toSrc: (viewMs: number) => number;
    // A stretch of the recording as the stretches of the timeline it is drawn on (one, unless it crosses a split).
    spans: (fromMs: number, toMs: number) => { fromMs: number; toMs: number }[];
}

export function timelineAxis(splits: number[], order: number[] | null | undefined, totalMs: number): TimelineAxis {
    const edges = [0, ...[...splits].sort((a, b) => a - b), totalMs];
    const sections = edges.slice(0, -1).map((s, i) => ({ srcStart: s, srcEnd: edges[i + 1] }));
    const valid = !!order && order.length === sections.length && [...order].sort((a, b) => a - b).every((v, i) => v === i)
        && sections.every(sec => sec.srcEnd > sec.srcStart);
    const moved = valid && order!.some((v, i) => v !== i);
    let at = 0;
    const pieces = (moved ? order! : sections.map((_, i) => i)).map(section => {
        const sec = sections[section];
        const p = { ...sec, viewStart: at, section };
        at += sec.srcEnd - sec.srcStart;
        return p;
    });
    if (!moved) {
        const clamp = (ms: number) => Math.max(0, Math.min(totalMs, ms));
        return { moved: false, pieces, toView: clamp, toSrc: clamp, spans: (fromMs, toMs) => (toMs > fromMs ? [{ fromMs, toMs }] : []) };
    }
    const bySrc = [...pieces].sort((a, b) => a.srcStart - b.srcStart);
    const pieceOfSrc = (ms: number) => bySrc.find(p => ms < p.srcEnd) ?? bySrc[bySrc.length - 1];
    const toView = (ms: number) => {
        const c = Math.max(0, Math.min(totalMs, ms));
        const p = pieceOfSrc(c);
        return p.viewStart + (c - p.srcStart);
    };
    const toSrc = (v: number) => {
        const c = Math.max(0, Math.min(totalMs, v));
        const p = pieces.find(x => c < x.viewStart + (x.srcEnd - x.srcStart)) ?? pieces[pieces.length - 1];
        return p.srcStart + (c - p.viewStart);
    };
    const spans = (fromMs: number, toMs: number) => bySrc.flatMap(p => {
        const a = Math.max(fromMs, p.srcStart), b = Math.min(toMs, p.srcEnd);
        return b > a ? [{ fromMs: p.viewStart + (a - p.srcStart), toMs: p.viewStart + (b - p.srcStart) }] : [];
    });
    return { moved: true, pieces, toView, toSrc, spans };
}

// Where a section dragged from play position `from` lands, dropped at `viewMs` of the timeline: before the section
// under the pointer when it is in that section's first half, after it otherwise. Returns the new play position.
export function dropPosition(axis: TimelineAxis, from: number, viewMs: number): number {
    const count = axis.pieces.length;
    let slot = count;
    for (let i = 0; i < count; i++) {
        const p = axis.pieces[i], len = p.srcEnd - p.srcStart;
        if (viewMs < p.viewStart + len) { slot = viewMs < p.viewStart + len / 2 ? i : i + 1; break; }
    }
    return slot > from ? slot - 1 : slot;
}
