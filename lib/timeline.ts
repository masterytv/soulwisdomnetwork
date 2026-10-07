// Why: the Studio editor's timeline (spec 020 item E2) — what part of the recording it shows and
// how far zoomed, the ruler, snapping, and dragging a cut's edges (spec 019 item 2.2). Pure, so the
// rules are tested; components/studio/timeline.tsx draws with them.

import type { Cut, KeptRange } from './edit';
import { mmss } from './showNotes';
import { SPLIT_SLACK_MS } from './sequence';

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

// A stretch of the recording drawn on the timeline, in the order they play: where it starts on the timeline, its section,
// and how far each of its ends can be dragged out (item E13, rippleTrim): to the kept moment of its section before it
// (`reachStart`) and after it (`reachEnd`), or to its section's ends; `mergeStart` and `mergeEnd` say a kept stretch is
// there, so dragging all the way joins the two. Whole sections (Show cuts) reach no further than themselves.
export interface AxisPiece {
    srcStart: number; srcEnd: number; viewStart: number; section: number;
    reachStart: number; reachEnd: number; mergeStart: boolean; mergeEnd: boolean;
}

// A section between splits in play order, and where it is drawn: from viewStart to viewEnd (the same place when what
// plays is closed up and it is cut whole).
export interface AxisSection { section: number; srcStart: number; srcEnd: number; viewStart: number; viewEnd: number }

// Where the timeline draws each moment of the recording. With Show cuts (timelineAxis): the sections between splits laid
// end to end in the order they play (`order`, spec 020 item E9), each whole, its cuts drawn inside it; in the recording's
// order every moment is where it always was. Otherwise (playedAxis, item E13): only what plays, closed up, in play order.
export interface TimelineAxis {
    // Not drawn where it is in the recording: sections moved, or what plays closed up.
    moved: boolean;
    // The sections play in another order.
    reordered: boolean;
    // Only what plays (playedAxis).
    collapsed: boolean;
    // How long the timeline is.
    lengthMs: number;
    pieces: AxisPiece[];
    sections: AxisSection[];
    toView: (srcMs: number) => number;
    toSrc: (viewMs: number) => number;
    // A stretch of the recording as the stretches of the timeline it is drawn on (one, unless it crosses a split, or a
    // cut once what plays is closed up; none when all of it is cut).
    spans: (fromMs: number, toMs: number) => { fromMs: number; toMs: number }[];
}

// The sections the splits make, and the play order when it is a valid one that moves something.
function sectionsAndOrder(splits: number[], order: number[] | null | undefined, totalMs: number) {
    const edges = [0, ...[...splits].sort((a, b) => a - b), totalMs];
    const sections = edges.slice(0, -1).map((s, i) => ({ srcStart: s, srcEnd: edges[i + 1] }));
    const valid = !!order && order.length === sections.length && [...order].sort((a, b) => a - b).every((v, i) => v === i)
        && sections.every(sec => sec.srcEnd > sec.srcStart);
    const reordered = valid && order!.some((v, i) => v !== i);
    return { sections, play: reordered ? order! : sections.map((_, i) => i), reordered };
}

export function timelineAxis(splits: number[], order: number[] | null | undefined, totalMs: number): TimelineAxis {
    const { sections, play, reordered: moved } = sectionsAndOrder(splits, order, totalMs);
    let at = 0;
    const pieces: AxisPiece[] = play.map(section => {
        const sec = sections[section];
        const p = { ...sec, viewStart: at, section, reachStart: sec.srcStart, reachEnd: sec.srcEnd, mergeStart: false, mergeEnd: false };
        at += sec.srcEnd - sec.srcStart;
        return p;
    });
    const axisSections = pieces.map(p => ({ section: p.section, srcStart: p.srcStart, srcEnd: p.srcEnd, viewStart: p.viewStart, viewEnd: p.viewStart + (p.srcEnd - p.srcStart) }));
    const base = { moved, reordered: moved, collapsed: false, lengthMs: Math.max(0, totalMs), pieces, sections: axisSections };
    if (!moved) {
        const clamp = (ms: number) => Math.max(0, Math.min(totalMs, ms));
        return { ...base, toView: clamp, toSrc: clamp, spans: (fromMs, toMs) => (toMs > fromMs ? [{ fromMs, toMs }] : []) };
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
    return { ...base, toView, toSrc, spans };
}

// ---- Only what plays (spec 020 item E13) ----

// The timeline as the episode plays: the kept stretches (`clips`, in play order, as lib/sequence.ts playOrder makes them)
// end to end, divided at the splits, with no gaps where the cuts were. Transitions are not overlapped here: each
// stretch is drawn whole. A moment that is cut is drawn where its cut was closed up: the end of the kept stretch of its
// section before it, or its section's place when nothing of the section before it plays.
export function playedAxis(clips: { startMs: number; endMs: number }[], splits: number[], order: number[] | null | undefined, totalMs: number): TimelineAxis {
    const { sections, play, reordered } = sectionsAndOrder(splits, order, totalMs);
    const place = new Map(play.map((section, i) => [section, i]));
    const sectionOf = (ms: number) => {
        let lo = 0, hi = sections.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (sections[mid].srcStart <= ms) lo = mid; else hi = mid - 1; }
        return lo;
    };
    // The kept stretches, divided at the splits, except one this close to a stretch's end (lib/sequence.ts): that
    // stretch plays with its section, as the render plays it.
    const parts: { srcStart: number; srcEnd: number; section: number }[] = [];
    const cutAt = sections.slice(1).map(s => s.srcStart);
    for (const c of clips) {
        const end = Math.min(totalMs, c.endMs);
        let a = Math.max(0, c.startMs);
        if (end <= a || !sections.length) continue;
        for (const sp of cutAt) {
            if (sp <= a + SPLIT_SLACK_MS || sp >= end - SPLIT_SLACK_MS) continue;
            parts.push({ srcStart: a, srcEnd: sp, section: sectionOf((a + sp) / 2) });
            a = sp;
        }
        parts.push({ srcStart: a, srcEnd: end, section: sectionOf((a + end) / 2) });
    }
    parts.sort((x, y) => place.get(x.section)! - place.get(y.section)! || x.srcStart - y.srcStart);

    const pieces: AxisPiece[] = [];
    const axisSections: AxisSection[] = [];
    let at = 0, j = 0;
    for (const section of play) {
        const sec = sections[section];
        const viewStart = at;
        const first = j;
        while (j < parts.length && parts[j].section === section) {
            const p = parts[j];
            const prev = j > first ? parts[j - 1] : null, next = j + 1 < parts.length && parts[j + 1].section === section ? parts[j + 1] : null;
            pieces.push({
                ...p, viewStart: at,
                reachStart: Math.min(p.srcStart, prev ? prev.srcEnd : sec.srcStart), mergeStart: !!prev,
                reachEnd: Math.max(p.srcEnd, next ? next.srcStart : sec.srcEnd), mergeEnd: !!next,
            });
            at += p.srcEnd - p.srcStart;
            j++;
        }
        axisSections.push({ section, srcStart: sec.srcStart, srcEnd: sec.srcEnd, viewStart, viewEnd: at });
    }
    const lengthMs = at;
    const bySrc = [...pieces].sort((a, b) => a.srcStart - b.srcStart);
    const sectionView = new Map(axisSections.map(s => [s.section, s]));
    // The last piece starting at or before a moment of the recording.
    const lastFrom = (ms: number) => {
        let lo = 0, hi = bySrc.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (bySrc[mid].srcStart <= ms) lo = mid + 1; else hi = mid; }
        return lo - 1;
    };
    const toView = (ms: number) => {
        if (!pieces.length) return 0;
        const c = Math.max(0, Math.min(totalMs, ms));
        const i = lastFrom(c), p = i >= 0 ? bySrc[i] : null;
        if (p && c <= p.srcEnd) return p.viewStart + (c - p.srcStart);
        const sec = sectionOf(c);
        if (p && p.section === sec) return p.viewStart + (p.srcEnd - p.srcStart);
        return sectionView.get(sec)?.viewStart ?? 0;
    };
    const toSrc = (v: number) => {
        if (!pieces.length) return 0;
        const c = Math.max(0, Math.min(lengthMs, v));
        let lo = 0, hi = pieces.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; const p = pieces[mid]; if (c < p.viewStart + (p.srcEnd - p.srcStart)) hi = mid; else lo = mid + 1; }
        const p = pieces[lo];
        return p.srcStart + Math.max(0, Math.min(p.srcEnd - p.srcStart, c - p.viewStart));
    };
    const spans = (fromMs: number, toMs: number) => {
        const out: { fromMs: number; toMs: number }[] = [];
        for (let i = Math.max(0, lastFrom(fromMs)); i < bySrc.length && bySrc[i].srcStart < toMs; i++) {
            const p = bySrc[i];
            const a = Math.max(fromMs, p.srcStart), b = Math.min(toMs, p.srcEnd);
            if (b > a) out.push({ fromMs: p.viewStart + (a - p.srcStart), toMs: p.viewStart + (b - p.srcStart) });
        }
        return out;
    };
    return { moved: true, reordered, collapsed: true, lengthMs, pieces, sections: axisSections, toView, toSrc, spans };
}

// The end of a kept stretch near `viewMs` on a closed-up timeline, within `withinMs`: the one on the pointer's side at a
// join (the end of the stretch before it, or the start of the one after). Its piece's index, and which end.
export function pieceEdgeAt(axis: TimelineAxis, viewMs: number, withinMs: number): { index: number; edge: 'start' | 'end' } | null {
    const ps = axis.pieces;
    if (!ps.length) return null;
    let lo = 0, hi = ps.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; const p = ps[mid]; if (viewMs < p.viewStart + (p.srcEnd - p.srcStart)) hi = mid; else lo = mid + 1; }
    const p = ps[lo], end = p.viewStart + (p.srcEnd - p.srcStart);
    const ds = Math.abs(viewMs - p.viewStart), de = Math.abs(end - viewMs);
    if (Math.min(ds, de) > withinMs) return null;
    return { index: lo, edge: ds <= de && viewMs >= p.viewStart ? 'start' : 'end' };
}

// What is hidden at an end of a kept stretch, in the recording: from the stretch's end to how far it reaches (or from
// how far its start reaches to its start); null when nothing is.
export function hiddenAt(p: AxisPiece, edge: 'start' | 'end'): { startMs: number; endMs: number } | null {
    if (edge === 'end') return p.reachEnd > p.srcEnd ? { startMs: p.srcEnd, endMs: p.reachEnd } : null;
    return p.reachStart < p.srcStart ? { startMs: p.reachStart, endMs: p.srcStart } : null;
}

// A kept stretch keeps at least this much when its end is dragged in (one shorter than 150 ms is not played; lib/edit.ts).
export const MIN_PIECE_MS = 200;

// How far an end of a kept stretch can be dragged: in, to MIN_PIECE_MS short of its other end; out, as far as it reaches.
export function rippleLimits(p: AxisPiece, edge: 'start' | 'end'): [number, number] {
    const len = p.srcEnd - p.srcStart;
    if (edge === 'end') return [p.srcStart + Math.min(MIN_PIECE_MS, len), p.reachEnd];
    return [p.reachStart, p.srcEnd - Math.min(MIN_PIECE_MS, len)];
}

// The cuts with [fromMs, toMs] of the recording brought back: cuts inside it go, cuts across its ends are shortened
// and become the producer's own ('manual'), as a dragged cut edge does.
export function uncut(cuts: Cut[], fromMs: number, toMs: number): Cut[] {
    if (toMs <= fromMs) return cuts;
    const out: Cut[] = [];
    for (const c of cuts) {
        if (c.endMs <= fromMs || c.startMs >= toMs) { out.push(c); continue; }
        if (c.startMs < fromMs) out.push({ startMs: c.startMs, endMs: fromMs, reason: 'manual' });
        if (c.endMs > toMs) out.push({ startMs: toMs, endMs: c.endMs, reason: 'manual' });
    }
    return out;
}

// Ripple trim (item E13): an end of a kept stretch (`p`, a piece of playedAxis) moved to `toMs` of the recording, as
// heard. Out, it brings back what was cut there, up to how far it reaches (all of it at the reach, joining the kept
// stretch there); in, it cuts, words and all, as the producer's own cut. Everything after it on the timeline moves
// with it. A kept stretch is heard `padMs` into the cuts either side of it (lib/edit.ts keepRanges), so the cuts are
// made and shortened that far beyond the place it is moved to, and it ends where it was dropped.
export function rippleTrim(cuts: Cut[], p: AxisPiece, edge: 'start' | 'end', toMs: number, totalMs: number, padMs = 40): Cut[] {
    const [lo, hi] = rippleLimits(p, edge);
    const t = Math.round(Math.max(lo, Math.min(hi, toMs)));
    if (edge === 'end') {
        const e = p.srcEnd;
        if (t < e) return [...cuts, { startMs: Math.max(0, t - padMs), endMs: Math.min(totalMs, e + padMs), reason: 'manual' }];
        if (t > e) return uncut(cuts, e - padMs, t >= p.reachEnd && p.mergeEnd ? p.reachEnd + padMs : t - padMs);
        return cuts;
    }
    const s = p.srcStart;
    if (t > s) return [...cuts, { startMs: Math.max(0, s - padMs), endMs: Math.min(totalMs, t + padMs), reason: 'manual' }];
    if (t < s) return uncut(cuts, t <= p.reachStart && p.mergeStart ? p.reachStart - padMs : t + padMs, s + padMs);
    return cuts;
}

// The places on a closed-up timeline where something is cut: each end of a kept stretch with something hidden there
// (two kept stretches of a section side by side share one), with whether every cut there is a suggestion (filler,
// stammer, pause...), for its colour. `cuts` in any order.
export interface JoinMark { viewMs: number; startMs: number; endMs: number; suggested: boolean }

export function joinMarks(axis: TimelineAxis, cuts: Cut[]): JoinMark[] {
    const sorted = [...cuts].sort((a, b) => a.startMs - b.startMs);
    // The furthest any cut so far reaches, for finding the cuts over a stretch.
    const reach: number[] = [];
    sorted.forEach((c, i) => { reach[i] = Math.max(c.endMs, i ? reach[i - 1] : -Infinity); });
    const suggestedIn = (a: number, b: number) => {
        let lo = 0, hi = sorted.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid].startMs < b) lo = mid + 1; else hi = mid; }
        let any = false;
        for (let i = lo - 1; i >= 0 && reach[i] > a; i--) {
            const c = sorted[i];
            if (c.endMs <= a) continue;
            if (c.reason === 'manual') return false;
            any = true;
        }
        return any;
    };
    const out: JoinMark[] = [];
    axis.pieces.forEach((p, i) => {
        const before = hiddenAt(p, 'start');
        // Shared with the end of the stretch before, when that is the kept stretch of this section before it.
        if (before && !(p.mergeStart && i > 0 && axis.pieces[i - 1].srcEnd === p.reachStart)) {
            out.push({ viewMs: p.viewStart, ...before, suggested: suggestedIn(before.startMs, before.endMs) });
        }
        const after = hiddenAt(p, 'end');
        if (after) out.push({ viewMs: p.viewStart + (p.srcEnd - p.srcStart), ...after, suggested: suggestedIn(after.startMs, after.endMs) });
    });
    return out;
}

// Where a section dragged from play position `from` lands, dropped at `viewMs` of the timeline: before the section
// under the pointer when it is in that section's first half, after it otherwise. Returns the new play position.
export function dropPosition(axis: TimelineAxis, from: number, viewMs: number): number {
    const count = axis.sections.length;
    let slot = count;
    for (let i = 0; i < count; i++) {
        const s = axis.sections[i];
        if (s.viewEnd <= s.viewStart) continue;
        if (viewMs < s.viewEnd) { slot = viewMs < (s.viewStart + s.viewEnd) / 2 ? i : i + 1; break; }
    }
    return slot > from ? slot - 1 : slot;
}
