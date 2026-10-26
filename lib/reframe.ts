// Why: highlight moments (docs/specs/021-motion-graphics.md, Part B / item M3): a few seconds where the
// episode's own picture is reframed — it slides into a gold-framed window, lifts and shrinks, dims under
// popped words, closes behind an iris or is pushed aside — and words from that moment appear. The picture's
// movement is declared by the highlight template as keyframes (`window.GRAPHIC_LAYOUT`: a `from` box, a
// `to` box, and the in and out lengths), and this file is the one place that movement is computed: the
// render turns `boxAt` into ffmpeg expressions through the same piecewise table (`easeSegments`), the
// editor's preview turns it into CSS on the video element itself, and the tests compare both against the
// true curve. Browser-safe: no node imports.
//
// A highlight's shaping (the rounded window, the iris oval) is done by the template's matte, never by
// cropping: the picture is only ever scaled and moved, so the render's frames keep one size.

import { z } from 'zod';
import { editedTime, keepRanges, type Cut, type KeptRange } from './edit';
import type { Span } from './layers';
import { FRAME } from './onScreen';

// The six layouts (spec 021 Part B). Quotes (3–12 s) suit splitQuote, below, iris and push; stressed
// words (1.5–4 s) suit splitWord and over.
export const HIGHLIGHT_LAYOUTS = ['splitQuote', 'splitWord', 'below', 'over', 'iris', 'push'] as const;
export type HighlightLayout = typeof HIGHLIGHT_LAYOUTS[number];
export const HIGHLIGHT_LABELS: Record<HighlightLayout, string> = {
    splitQuote: 'Split: quote beside', splitWord: 'Split: stressed word', below: 'Line below',
    over: 'Words over', iris: 'Iris close', push: 'Push aside',
};

// How long a highlight may run (the edit route refuses outside this).
export const HIGHLIGHT_MIN_MS = 1500;
export const HIGHLIGHT_MAX_MS = 15_000;

// Where the picture sits at a moment: scaled by `scale` about the frame's origin and placed with its
// top-left at (x, y), in render pixels of the 1920 × 1080 frame. `brightness` and `blur` describe the
// `over` layout's dimmed, blurred copy (the render crossfades to it; the preview filters the video).
// The window's shape — rounded corners, the iris oval — is the template's matte, not geometry here.
export interface Box { x: number; y: number; scale: number; brightness: number; blur: number }
export const FULL_FRAME: Box = { x: 0, y: 0, scale: 1, brightness: 1, blur: 0 };

// What a highlight template declares as `window.GRAPHIC_LAYOUT`: full frame → `inMs` to `to` → hold →
// `outMs` back. The ease is the house picture curve for everyone (System.dc.html), so the render, the
// preview and the template cannot drift apart.
export interface LayoutKeyframes { from: Box; to: Box; inMs: number; outMs: number }
export const LayoutKeyframesSchema = z.object({
    from: z.object({ x: z.number(), y: z.number(), scale: z.number().min(0.05).max(4), brightness: z.number().min(0).max(2), blur: z.number().min(0).max(40) }).strict(),
    to: z.object({ x: z.number(), y: z.number(), scale: z.number().min(0.05).max(4), brightness: z.number().min(0).max(2), blur: z.number().min(0).max(40) }).strict(),
    inMs: z.number().int().min(100).max(3000),
    outMs: z.number().int().min(100).max(3000),
}).strict();

// ─── the curve ───────────────────────────────────────────────────────────────

// The picture curve, cubic-bezier(.65, 0, .25, 1) (System.dc.html "Picture moves").
export const PICTURE_EASE = [0.65, 0, 0.25, 1] as const;

// y for x on a CSS timing curve (P0 = 0,0 and P3 = 1,1): solve the x polynomial for the parameter by
// bisection (x(u) is monotonic for CSS timing functions), then evaluate y.
export function cubicBezierY(x: number, [p1x, p1y, p2x, p2y]: readonly [number, number, number, number] = PICTURE_EASE): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const at = (a: number, b: number, u: number) => 3 * a * (1 - u) * (1 - u) * u + 3 * b * (1 - u) * u * u + u * u * u;
    let lo = 0, hi = 1;
    for (let i = 0; i < 48; i++) {
        const mid = (lo + hi) / 2;
        if (at(p1x, p2x, mid) < x) lo = mid; else hi = mid;
    }
    const u = (lo + hi) / 2;
    return at(p1y, p2y, u);
}

// The curve as `steps` straight segments: y at x = i / steps. The render's ffmpeg expressions and the
// tests read the same table, so what the expressions draw is what the tests check.
export function easeSegments(steps = 16, ease: readonly [number, number, number, number] = PICTURE_EASE): number[] {
    return Array.from({ length: steps + 1 }, (_, i) => cubicBezierY(i / steps, ease));
}

// y for x through the piecewise table — what an ffmpeg expression built from the same table computes.
export function easeAt(x: number, table: number[]): number {
    if (x <= 0) return table[0];
    if (x >= 1) return table[table.length - 1];
    const steps = table.length - 1;
    const i = Math.min(steps - 1, Math.floor(x * steps));
    const f = x * steps - i;
    return table[i] + (table[i + 1] - table[i]) * f;
}

// ─── where the picture is at a moment ───────────────────────────────────────

// How far from `from` towards `to` the picture is, `ms` into a highlight of `durationMs`: eased in over
// `inMs`, held at 1, eased back over `outMs`. A short highlight squeezes the moves to fit.
export function progressAt(k: Pick<LayoutKeyframes, 'inMs' | 'outMs'>, ms: number, durationMs: number, table?: number[]): number {
    const squeeze = Math.min(1, durationMs / (k.inMs + k.outMs));
    const inMs = k.inMs * squeeze, outMs = k.outMs * squeeze;
    const x = ms <= 0 ? 0
        : ms < inMs ? ms / inMs
        : ms <= durationMs - outMs ? 1
        : ms >= durationMs ? 0
        : (durationMs - ms) / outMs;
    return table ? easeAt(x, table) : cubicBezierY(x);
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

// The box `ms` into the highlight: each number eased between `from` and `to` by the same progress.
export function boxAt(k: LayoutKeyframes, ms: number, durationMs: number, table?: number[]): Box {
    const p = progressAt(k, ms, durationMs, table);
    return {
        x: lerp(k.from.x, k.to.x, p),
        y: lerp(k.from.y, k.to.y, p),
        scale: lerp(k.from.scale, k.to.scale, p),
        brightness: lerp(k.from.brightness, k.to.brightness, p),
        blur: lerp(k.from.blur, k.to.blur, p),
    };
}

// The box as CSS on the preview's video element: scaled about the top-left corner and moved, exactly as
// the render's scale + overlay place it, with the `over` dim and blur as filters.
export function boxStyle(b: Box): { transform: string; transformOrigin: string; filter: string } {
    return {
        transform: `translate(${(b.x / FRAME.width * 100).toFixed(3)}%, ${(b.y / FRAME.height * 100).toFixed(3)}%) scale(${b.scale.toFixed(4)})`,
        transformOrigin: 'top left',
        filter: b.brightness === 1 && b.blur === 0 ? 'none'
            : `brightness(${b.brightness.toFixed(3)})${b.blur > 0 ? ` blur(${b.blur.toFixed(1)}px)` : ''}`,
    };
}

// ─── what the edit route enforces (spec 021 M3) ─────────────────────────────

export interface HighlightLike { id: string; anchor: { srcMs: number }; durationMs: number; words: string }

// Why each highlight cannot stay as saved, by id: highlights may not overlap each other; one may not sit
// on a teaser (the same stretch of the recording plays there too); and its words must be kept — the whole
// span inside one uncut stretch, so the reframe never crosses a cut. Empty when all is well. The route
// refuses a save with problems; the editor shows them.
export function highlightProblems(
    highlights: HighlightLike[],
    o: { cuts: Cut[]; teasers: { startMs: number; endMs: number }[]; durationMs: number; padMs?: number },
): Map<string, string> {
    const problems = new Map<string, string>();
    const ranges = keepRanges(o.durationMs, o.cuts, o.padMs ?? 40);
    const spans: { id: string; startMs: number; endMs: number }[] = [];
    for (const h of highlights) {
        const from = h.anchor.srcMs, to = from + h.durationMs;
        const range = ranges.find(r => from >= r.startMs && from < r.endMs);
        if (!range) { problems.set(h.id, 'Its words are cut: nothing is kept where it starts.'); continue; }
        if (to > range.endMs) { problems.set(h.id, 'It crosses a cut: its words must all be kept.'); continue; }
        if (o.teasers.some(t => from < t.endMs && to > t.startMs)) {
            problems.set(h.id, 'It sits on a teaser, which plays that stretch again before the intro.');
            continue;
        }
        const startMs = editedTime(from, ranges, true)!;
        spans.push({ id: h.id, startMs, endMs: startMs + h.durationMs });
    }
    spans.sort((a, b) => a.startMs - b.startMs);
    for (let i = 1; i < spans.length; i++) {
        if (spans[i].startMs < spans[i - 1].endMs && !problems.has(spans[i].id)) {
            problems.set(spans[i].id, 'It overlaps another highlight.');
        }
    }
    return problems;
}

// A highlight's span on the edited episode (it is refused unless its words are kept, so inside one
// stretch this is exact); null while it is cut.
export function highlightSpan(h: HighlightLike, ranges: KeptRange[], editedMs: number): Span | null {
    const startMs = editedTime(h.anchor.srcMs, ranges);
    if (startMs === null || startMs >= editedMs) return null;
    return { startMs, endMs: Math.min(editedMs, startMs + h.durationMs) };
}
