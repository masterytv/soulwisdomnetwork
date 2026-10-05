// Why: the Studio editor's timeline (spec 020 item E2), grown from the full-page editor's (#123).
// Tracks with headers: V2 the on-screen items, V1 the episode's pictures (thumbnails made at
// ingest) with the speakers under them, A1 its voice (the waveform, spec 019 item 2.1). Only the
// part in view is drawn, on one canvas, so a two-hour episode at 2 ms a pixel stays quick, and the
// thousands of cuts are drawn there rather than as elements. Zoom (buttons, slider, + and −, Ctrl
// or ⌘ with the wheel) and scroll; snapping to the playhead, word edges, cuts and splits (Alt turns
// it off). A cut's edges can be dragged, and a stretch of time selected on the waveform and cut
// (spec 019 item 2.2); a whole drag is one undo step. The playhead follows the video itself, so
// playing redraws only the playhead, not the editor and its transcript.
// Item E3: the Blade tool (B) splits where it is clicked; the sections between splits show as clips
// on V1, whose ends can be dragged to trim them (as the producer's own cuts); a click selects one.

"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, LockOpen, Volume2, VolumeX } from 'lucide-react';
import type { SpokenWord } from '@/lib/showNotes';
import { keepRanges, keptBounds, MIN_PART_MS, sectionAt, sectionsOf, trimSection, type Cut, type KeptRange, type Section } from '@/lib/edit';
import type { Overlay } from '@/lib/onScreen';
import { columnPeaks, peakLevels } from '@/lib/peaks';
import { thumbAt, type ThumbSheets } from '@/lib/thumbs';
import {
    clampScroll, clampToWords, clampZoom, cutAt, edgeAt, edgeLimits, fitPxPerMs, keptWords, MAX_PX_PER_MS, MIN_CUT_MS, moveCutEdge,
    preciseTime, rangeOf, removedRanges, roundToStep, SNAP_PX, snapMs, speakerBlocks, speakerColors, stepFor, tickLabel,
    ticksBetween, tickText, wordEdges, zoomAround, type SpeakerBlock,
} from '@/lib/timeline';
import { secondary } from '@/components/studio/ui';
import { useVideoTime } from '@/components/studio/useVideoTime';

// What the timeline draws besides the edit: the waveform's peaks and the thumbnail sheets, made at
// ingest. Null: none yet (the next Podcast Ingest run makes them).
export interface TimelineMedia {
    peaks: Int8Array | null;
    thumbs: ThumbSheets | null;
}

// What is selected on the timeline: a stretch of time (Delete cuts it), a cut (by its times), or a
// section between splits (Delete cuts it whole).
export type TimelineSelection =
    | { kind: 'range'; startMs: number; endMs: number }
    | { kind: 'cut'; startMs: number; endMs: number }
    | { kind: 'section'; startMs: number; endMs: number };

// Splits: set at the playhead (S) or with the Blade tool, they divide the episode into sections, as
// in Descript. A selected section can be cut or brought back whole; click a split's handle to
// remove it.
export interface SplitControls {
    splits: number[];
    onSplit: (ms: number) => void;
    onRemoveSplit: (ms: number) => void;
    onCutSection: (section: Section) => void;
    onRestoreSection: (section: Section) => void;
}

// The lanes, top to bottom, in pixels. The voice lane takes the height that is left.
const RULER_H = 22;
const V2_TOP = RULER_H, V2_H = 20;
const V1_TOP = V2_TOP + V2_H, THUMB_H = 40, BAND_H = 4, V1_H = THUMB_H + BAND_H;
const A1_TOP = V1_TOP + V1_H + 2, MIN_A1_H = 40;
const HEADER_W = 112;
// How close to a cut's edge the pointer grabs it; a cut narrower than GRAB_PX on screen is grabbed
// only once selected, and one narrower than PICK_PX is not picked by a click (zoom in for those).
const EDGE_PX = 6, GRAB_PX = 8, PICK_PX = 3;
// A press that moves less than this is a click.
const CLICK_PX = 3;

const SUGGESTED = '#f59e0b', YOURS = '#9ca3af', VOICE = '#7dd3fc', REMOVED = '#f87171';

// A diagonal hatch, anchored to the recording so it does not swim as the view scrolls. The tiles
// are made once per colour.
const hatchTiles = new Map<string, HTMLCanvasElement>();
function hatch(ctx: CanvasRenderingContext2D, color: string, offsetPx: number): CanvasPattern | null {
    let tile = hatchTiles.get(color);
    if (!tile) {
        tile = document.createElement('canvas');
        tile.width = tile.height = 8;
        const t = tile.getContext('2d');
        if (!t) return null;
        t.strokeStyle = color;
        t.lineWidth = 1.5;
        t.beginPath();
        t.moveTo(-2, 10); t.lineTo(10, -2);
        t.moveTo(6, 10); t.lineTo(10, 6);
        t.moveTo(-2, 2); t.lineTo(2, -2);
        t.stroke();
        hatchTiles.set(color, tile);
    }
    const p = ctx.createPattern(tile, 'repeat');
    p?.setTransform(new DOMMatrix().translate(-(offsetPx % 8), 0));
    return p;
}

// A section between splits, and what of it the cuts keep (null: cut whole).
interface Part { section: Section; kept: Section | null }

interface DrawInput {
    width: number; a1H: number; startMs: number; pxPerMs: number; totalMs: number;
    levels: Int8Array[] | null; thumbs: ThumbSheets | null; images: Map<string, HTMLImageElement>;
    cuts: Cut[]; removed: KeptRange[]; blocks: SpeakerBlock[]; colors: Record<string, string>; splits: number[]; parts: Part[];
}

// Draws the ruler, the episode's pictures and speakers, the waveform, the cuts and the splits for
// the part in view.
function drawTimeline(ctx: CanvasRenderingContext2D, d: DrawInput) {
    const { width, a1H, startMs, pxPerMs, totalMs } = d;
    const endMs = startMs + width / pxPerMs;
    const x = (ms: number) => (ms - startMs) * pxPerMs;
    const height = A1_TOP + a1H;
    ctx.clearRect(0, 0, width, height);

    // Ruler: labelled ticks at least 80 px apart, smaller ones between.
    ctx.fillStyle = '#100825';
    ctx.fillRect(0, 0, width, RULER_H);
    const step = stepFor(pxPerMs);
    const minor = step / (String(step)[0] === '2' ? 4 : 5);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const t of ticksBetween(startMs, Math.min(endMs, totalMs), minor)) {
        const X = Math.round(x(t)) + 0.5;
        ctx.moveTo(X, t % step === 0 ? 3 : 15);
        ctx.lineTo(X, RULER_H);
    }
    ctx.stroke();
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    for (const t of ticksBetween(Math.max(0, startMs - step), Math.min(endMs, totalMs), step)) ctx.fillText(tickText(t, step), x(t) + 3, 4);

    // Lane backgrounds.
    ctx.fillStyle = '#0f0922';
    ctx.fillRect(0, V2_TOP, width, V2_H);
    ctx.fillStyle = '#0b0619';
    ctx.fillRect(0, V1_TOP, width, V1_H);
    ctx.fillRect(0, A1_TOP, width, a1H);

    // V1: a thumbnail every tile's width, each the frame nearest the tile's middle. Tiles sit at fixed
    // places on the recording, so they stay put as the view scrolls.
    const end = x(totalMs);
    if (d.thumbs) {
        const tw = THUMB_H * 16 / 9;
        const t = d.thumbs;
        for (let k = Math.floor(startMs * pxPerMs / tw); k * tw / pxPerMs < Math.min(endMs, totalMs); k++) {
            const at = thumbAt(t, (k + 0.5) * tw / pxPerMs);
            const img = at && d.images.get(t.urls[at.sheet]);
            const X = k * tw - startMs * pxPerMs;
            const w = Math.min(tw, end - X);
            if (at && img?.complete && img.naturalWidth && w > 0) {
                ctx.drawImage(img, at.x, at.y, t.width * (w / tw), t.height, X, V1_TOP, w, THUMB_H);
            }
        }
    }
    // The speakers, in a band under the pictures.
    for (const b of d.blocks) {
        if (b.endMs < startMs || b.startMs > endMs) continue;
        ctx.fillStyle = d.colors[b.speaker] ?? '#888';
        ctx.fillRect(x(b.startMs), V1_TOP + THUMB_H, Math.max(1, (b.endMs - b.startMs) * pxPerMs), BAND_H);
    }

    // A1: the waveform, a column per pixel; what the edit takes out (as heard) in red.
    const mid = A1_TOP + a1H / 2, half = a1H / 2 - 3;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, Math.round(mid), Math.min(width, end), 1);
    if (d.levels) {
        const cols = Math.ceil(Math.min(width, end));
        const peaks = columnPeaks(d.levels, startMs, 1 / pxPerMs, cols);
        const kept = new Path2D(), cut = new Path2D();
        let k = 0;
        for (let c = 0; c < cols; c++) {
            const lo = peaks[2 * c], hi = peaks[2 * c + 1];
            if (lo === 0 && hi === 0) continue;
            const t = startMs + (c + 0.5) / pxPerMs;
            while (k < d.removed.length && d.removed[k].endMs <= t) k++;
            const inCut = k < d.removed.length && d.removed[k].startMs <= t;
            const y0 = mid - hi / 127 * half, y1 = mid - lo / 127 * half;
            (inCut ? cut : kept).rect(c, y0, 1, Math.max(1, y1 - y0));
        }
        ctx.fillStyle = VOICE;
        ctx.fill(kept);
        ctx.fillStyle = REMOVED;
        ctx.globalAlpha = 0.75;
        ctx.fill(cut);
        ctx.globalAlpha = 1;
    }

    // Cuts, over both lanes: a veil, and a hatch once they are wide enough to see one. Amber for
    // suggestions, grey for the producer's own, red on the voice.
    const offset = startMs * pxPerMs;
    const patterns = { [SUGGESTED]: hatch(ctx, 'rgba(245,158,11,0.75)', offset), [YOURS]: hatch(ctx, 'rgba(209,213,219,0.6)', offset) };
    const red = hatch(ctx, 'rgba(248,113,113,0.55)', offset);
    for (const c of d.cuts) {
        if (c.endMs < startMs || c.startMs > endMs) continue;
        const X = x(c.startMs), w = Math.max(0.5, (c.endMs - c.startMs) * pxPerMs);
        const color = c.reason === 'manual' ? YOURS : SUGGESTED;
        ctx.fillStyle = 'rgba(8,4,20,0.62)';
        ctx.fillRect(X, V1_TOP, w, THUMB_H);
        ctx.fillStyle = 'rgba(8,4,20,0.3)';
        ctx.fillRect(X, A1_TOP, w, a1H);
        if (w >= 4) {
            const p = patterns[color];
            if (p) { ctx.fillStyle = p; ctx.fillRect(X, V1_TOP, w, THUMB_H); }
            if (red) { ctx.fillStyle = red; ctx.fillRect(X, A1_TOP, w, a1H); }
            ctx.fillStyle = color;
            ctx.fillRect(X, V1_TOP, 1, THUMB_H);
            ctx.fillRect(X + w - 1, V1_TOP, 1, THUMB_H);
        } else {
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.8;
            ctx.fillRect(X, V1_TOP, w, 3);
            ctx.globalAlpha = 1;
        }
    }

    // Sections as clips on V1: a gap at each split, and a bracket at each end of what is kept of
    // them, where they can be trimmed.
    ctx.fillStyle = '#0b0619';
    for (const sp of d.splits) if (sp >= startMs && sp <= endMs) ctx.fillRect(x(sp) - 1.5, V1_TOP, 3, V1_H);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const p of d.parts) {
        if (!p.kept || p.kept.endMs < startMs || p.kept.startMs > endMs) continue;
        const a = x(p.kept.startMs), b = x(p.kept.endMs);
        if (b - a < 16) continue;
        ctx.fillRect(a, V1_TOP, 2, THUMB_H); ctx.fillRect(a, V1_TOP, 6, 2); ctx.fillRect(a, V1_TOP + THUMB_H - 2, 6, 2);
        ctx.fillRect(b - 2, V1_TOP, 2, THUMB_H); ctx.fillRect(b - 6, V1_TOP, 6, 2); ctx.fillRect(b - 6, V1_TOP + THUMB_H - 2, 6, 2);
    }

    // Splits: a dashed line over the lanes.
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (const s of d.splits) {
        if (s < startMs || s > endMs) continue;
        const X = Math.round(x(s)) + 0.5;
        ctx.moveTo(X, RULER_H);
        ctx.lineTo(X, height);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // After the end of the recording.
    if (end < width) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(Math.max(0, end), 0, width - end, height);
    }
}

// The video's time, every frame while it plays (the playhead is the only thing that moves).
function usePlayhead(video: React.RefObject<HTMLVideoElement | null>): number {
    const [ms, setMs] = useState(0);
    useEffect(() => {
        const el = video.current;
        if (!el) return;
        let raf = 0;
        const read = () => setMs(el.currentTime * 1000);
        const loop = () => { read(); raf = requestAnimationFrame(loop); };
        const onPlay = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); };
        const onPause = () => { cancelAnimationFrame(raf); read(); };
        read();
        if (!el.paused) onPlay();
        el.addEventListener('play', onPlay);
        el.addEventListener('pause', onPause);
        el.addEventListener('seeked', read);
        el.addEventListener('timeupdate', read);
        return () => {
            cancelAnimationFrame(raf);
            el.removeEventListener('play', onPlay);
            el.removeEventListener('pause', onPause);
            el.removeEventListener('seeked', read);
            el.removeEventListener('timeupdate', read);
        };
    }, [video]);
    return ms;
}

// The red playhead. When the video moves it out of view (playing, or a jump from the transcript),
// the view follows, keeping it a third of the way in.
function Playhead({ video, startMs, pxPerMs, width, onFollow }: {
    video: React.RefObject<HTMLVideoElement | null>; startMs: number; pxPerMs: number; width: number; onFollow: (ms: number) => void;
}) {
    const ms = usePlayhead(video);
    const x = (ms - startMs) * pxPerMs;
    const last = useRef(ms);
    useEffect(() => {
        const moved = Math.abs(ms - last.current) > 1;
        last.current = ms;
        if (moved && (x < 0 || x > width)) onFollow(ms);
    }, [ms, x, width, onFollow]);
    if (x < -2 || x > width + 2) return null;
    return (
        <div aria-hidden className="absolute top-0 bottom-0 w-0.5 bg-red-400 pointer-events-none" style={{ transform: `translateX(${x - 1}px)` }}>
            <div className="absolute -top-0.5 -left-[4px] w-0 h-0 border-x-[5px] border-x-transparent border-t-[6px] border-t-red-400" />
        </div>
    );
}

// How much of a section the cuts cover, 0 to 1.
function cutShare(cuts: Cut[], s: Section): number {
    const len = s.endMs - s.startMs;
    if (len <= 0) return 0;
    const inside = cuts
        .map(c => ({ a: Math.max(c.startMs, s.startMs), b: Math.min(c.endMs, s.endMs) }))
        .filter(r => r.b > r.a)
        .sort((x, y) => x.a - y.a);
    let covered = 0, reach = s.startMs;
    for (const r of inside) {
        if (r.b <= reach) continue;
        covered += r.b - Math.max(r.a, reach);
        reach = r.b;
    }
    return covered / len;
}

// Split at the playhead (S). Follows the video on its own, a few times a second.
function SplitButton({ split, video, totalMs, disabled }: {
    split: SplitControls; video: React.RefObject<HTMLVideoElement | null>; totalMs: number; disabled: boolean;
}) {
    const currentMs = useVideoTime(video);
    return (
        <button
            onClick={() => split.onSplit(Math.round(currentMs))}
            disabled={disabled || split.splits.includes(Math.round(currentMs)) || currentMs <= 0 || currentMs >= totalMs}
            title={`Split at the playhead, ${tickLabel(currentMs)} (S)`}
            className={`${secondary} px-2 py-0.5 shrink-0`}
        >✂ Split</button>
    );
}

type Drag =
    | { kind: 'scrub' }
    | {
        kind: 'edge'; cut: Cut; edge: 'start' | 'end'; base: Cut[]; kept: SpokenWord[];
        limits: [number, number]; free: [number, number]; targets: number[][]; ms: number; guide: number | null; draft: Cut[];
    }
    | { kind: 'range'; anchor: number; ms: number; guide: number | null; x0: number; moved: boolean; targets: number[][] }
    | {
        kind: 'trim'; section: Section; edge: 'start' | 'end'; base: Cut[]; from: number;
        limits: [number, number]; targets: number[][]; ms: number; guide: number | null; draft: Cut[];
    };

const iconButton = 'p-0.5 rounded text-gray-400 hover:text-white hover:bg-white/10 aria-pressed:text-amber-300';

// Where the video is, in ms.
const timeOf = (video: React.RefObject<HTMLVideoElement | null>) => (video.current?.currentTime ?? 0) * 1000;

// The A1 track's mute: the preview's sound only.
function toggleMuted(video: HTMLVideoElement | null) {
    if (video) video.muted = !video.muted;
}

export function Timeline({
    words, cuts, ranges, overlays = [], totalMs, video, onSeek, split, media, selection, onSelect, onCuts, onHear, keys,
    overlaysHidden = false, onOverlaysHidden,
}: {
    words: SpokenWord[];
    cuts: Cut[];
    ranges: KeptRange[];                    // what the edit keeps (keepRanges), for the waveform's red
    overlays?: Overlay[];
    totalMs: number;
    video: React.RefObject<HTMLVideoElement | null>;
    onSeek: (ms: number) => void;
    split?: SplitControls;
    media: TimelineMedia | null;            // null while loading
    selection: TimelineSelection | null;
    onSelect: (s: TimelineSelection | null) => void;
    onCuts: (cuts: Cut[]) => void;          // a whole drag, as one change
    onHear: (startMs: number, endMs: number) => void;
    keys?: React.RefObject<HTMLElement | null>;   // where + and − zoom (the editor)
    overlaysHidden?: boolean;
    onOverlaysHidden?: (hidden: boolean) => void;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const lanesRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    // zoom: pixels a millisecond, or null to fit the whole recording (and keep fitting it as the window changes).
    const [view, setView] = useState<{ zoom: number | null; scrollPx: number }>({ zoom: null, scrollPx: 0 });
    // The drag under way: in a ref for the pointer handlers, which can run before React has drawn the
    // last move, and in state for drawing.
    const dragRef = useRef<Drag | null>(null);
    const [drag, setDragState] = useState<Drag | null>(null);
    const setDrag = (d: Drag | null) => { dragRef.current = d; setDragState(d); };
    const [snapOn, setSnapOn] = useState(true);
    const [locked, setLocked] = useState(false);
    const [muted, setMuted] = useState(false);
    // The tool: Select (V) picks, drags and trims; Blade (B) splits where it is clicked.
    const [tool, setTool] = useState<'select' | 'blade'>('select');
    // Where the Blade would split, under the pointer.
    const [bladeAt, setBladeAt] = useState<number | null>(null);
    // Thumbnail sheets loaded so far: each one that arrives redraws the pictures.
    const [loadedSheets, setLoadedSheets] = useState(0);
    const images = useRef(new Map<string, HTMLImageElement>());
    // When the producer last scrolled by hand: the view does not follow the playhead for a moment after.
    const handScrolledAt = useRef(0);

    // The scroller's size, from a ResizeObserver.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // The mute button follows the video's own.
    useEffect(() => {
        const el = video.current;
        if (!el) return;
        const sync = () => setMuted(el.muted);
        el.addEventListener('volumechange', sync);
        return () => el.removeEventListener('volumechange', sync);
    }, [video]);

    const fit = fitPxPerMs(totalMs, size.w);
    const pxPerMs = view.zoom === null ? fit : clampZoom(view.zoom, fit);
    const contentW = Math.max(size.w, Math.ceil(totalMs * pxPerMs));
    const scrollPx = clampScroll(view.scrollPx, totalMs, pxPerMs, size.w);
    const startMs = scrollPx / pxPerMs;
    const endMs = startMs + size.w / pxPerMs;
    const a1H = Math.max(MIN_A1_H, size.h - A1_TOP);
    const x = (ms: number) => (ms - startMs) * pxPerMs;

    // The view's scroll position is kept in state and put on the scroller after each change.
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (el && Math.abs(el.scrollLeft - scrollPx) > 0.5) el.scrollLeft = scrollPx;
    }, [scrollPx, contentW]);

    const zoomTo = useCallback((next: number, anchorX: number) => {
        const z = clampZoom(next, fit);
        const s = clampScroll(zoomAround(pxPerMs, z, scrollPx, anchorX), totalMs, z, size.w);
        setView({ zoom: z <= fit * 1.0001 ? null : z, scrollPx: s });
    }, [fit, pxPerMs, scrollPx, totalMs, size.w]);

    // Zoom buttons, the slider and the keys keep the playhead where it is when it is in view, else
    // the middle.
    const zoomAt = useCallback((next: number) => {
        const px = (timeOf(video) - startMs) * pxPerMs;
        zoomTo(next, px >= 0 && px <= size.w ? px : size.w / 2);
    }, [video, startMs, pxPerMs, size.w, zoomTo]);
    const zoomBy = useCallback((factor: number) => zoomAt(pxPerMs * factor), [zoomAt, pxPerMs]);

    // + and − zoom, V and B pick the tool, from anywhere in the editor, except while typing.
    useEffect(() => {
        const el = keys?.current;
        if (!el) return;
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(2); }
            else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(0.5); }
            else if (e.key === 'v' || e.key === 'V') { setTool('select'); setBladeAt(null); }
            else if (e.key === 'b' || e.key === 'B') setTool('blade');
            else if (e.key === 'Escape') { setTool('select'); setBladeAt(null); }
        };
        el.addEventListener('keydown', onKey);
        return () => el.removeEventListener('keydown', onKey);
    }, [keys, zoomBy]);

    // The wheel scrolls along the timeline; with Ctrl or ⌘ (or a trackpad pinch) it zooms at the pointer.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                zoomTo(pxPerMs * Math.exp(-e.deltaY * 0.002), e.clientX - el.getBoundingClientRect().left);
            } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                handScrolledAt.current = Date.now();
                el.scrollLeft += e.deltaY;
            }
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [pxPerMs, zoomTo]);

    const onFollow = useCallback((ms: number) => {
        if (Date.now() - handScrolledAt.current < 3000) return;
        setView(v => ({ ...v, scrollPx: clampScroll(ms * pxPerMs - size.w / 3, totalMs, pxPerMs, size.w) }));
    }, [pxPerMs, size.w, totalMs]);

    const blocks = useMemo(() => speakerBlocks(words), [words]);
    const colors = useMemo(() => speakerColors(blocks), [blocks]);
    const peaks = media?.peaks ?? null, thumbs = media?.thumbs ?? null;
    const levels = useMemo(() => peaks ? peakLevels(peaks) : null, [peaks]);
    const edgesOfWords = useMemo(() => wordEdges(words), [words]);
    const edgesOfCuts = useMemo(() => cuts.flatMap(c => [c.startMs, c.endMs]).sort((a, b) => a - b), [cuts]);
    const keptAll = useMemo(() => keptWords(words, cuts), [words, cuts]);
    const splits = useMemo(() => split?.splits ?? [], [split?.splits]);
    const sections = useMemo(() => sectionsOf(splits, totalMs), [splits, totalMs]);

    // While a cut's edge or a section's end is dragged, the timeline shows the edit as it would be.
    const draft = drag?.kind === 'edge' || drag?.kind === 'trim' ? drag.draft : null;
    const shownCuts = draft ?? cuts;
    const parts = useMemo(() => sections.map(section => ({ section, kept: keptBounds(shownCuts, section) })), [sections, shownCuts]);
    const removed = useMemo(() => removedRanges(draft ? keepRanges(totalMs, draft, 40, words) : ranges, totalMs),
        [draft, ranges, totalMs, words]);

    // Thumbnail sheets for the part in view and a view either side, loaded as needed.
    useEffect(() => {
        const t = thumbs;
        if (!t || size.w <= 0) return;
        const span = endMs - startMs;
        const first = thumbAt(t, startMs - span)?.sheet ?? 0, last = thumbAt(t, endMs + span)?.sheet ?? 0;
        for (let s = first; s <= last; s++) {
            const url = t.urls[s];
            if (!url || images.current.has(url)) continue;
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => setLoadedSheets(n => n + 1);
            img.src = url;
            images.current.set(url, img);
        }
    }, [thumbs, startMs, endMs, size.w]);

    // Draw whenever the view or what is in it changes. Not as the video plays.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || size.w <= 0 || totalMs <= 0) return;
        const dpr = window.devicePixelRatio || 1;
        const h = A1_TOP + a1H;
        if (canvas.width !== Math.round(size.w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(size.w * dpr);
            canvas.height = Math.round(h * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawTimeline(ctx, {
            width: size.w, a1H, startMs, pxPerMs, totalMs, levels, thumbs, images: images.current,
            cuts: shownCuts, removed, blocks, colors, splits, parts,
        });
    }, [size.w, a1H, startMs, pxPerMs, totalMs, levels, thumbs, shownCuts, removed, blocks, colors, splits, parts, loadedSheets]);

    if (totalMs <= 0) return null;

    // Cuts wide enough on screen to grab by an edge, or to pick with a click; the selected one always.
    const selectedCut = selection?.kind === 'cut'
        ? cuts.find(c => c.startMs === selection.startMs && c.endMs === selection.endMs) : undefined;
    const inView = cuts.filter(c => c.endMs >= startMs && c.startMs <= endMs);
    const grabbable = inView.filter(c => c === selectedCut || (c.endMs - c.startMs) * pxPerMs >= GRAB_PX);
    const pickable = inView.filter(c => c === selectedCut || (c.endMs - c.startMs) * pxPerMs >= PICK_PX);
    // The selected section, while its splits are still there.
    const selectedSection = selection?.kind === 'section'
        ? sections.find(sec => sec.startMs === selection.startMs && sec.endMs === selection.endMs) : undefined;

    // The end of a section's kept part near a moment, on V1: drag it to trim the section. At a split
    // both sections have an end in the same place: the one on the pointer's side wins.
    const trimAt = (ms: number) => {
        let best: { part: Part; edge: 'start' | 'end'; d: number; inside: boolean } | null = null;
        for (const part of parts) {
            const k = part.kept;
            if (!k || (k.endMs - k.startMs) * pxPerMs < 16) continue;
            for (const edge of ['start', 'end'] as const) {
                const at = edge === 'start' ? k.startMs : k.endMs;
                const d = Math.abs(ms - at), inside = edge === 'start' ? ms >= at : ms <= at;
                if (d > EDGE_PX / pxPerMs) continue;
                if (!best || d < best.d - 0.5 / pxPerMs || (Math.abs(d - best.d) <= 0.5 / pxPerMs && inside && !best.inside)) best = { part, edge, d, inside };
            }
        }
        return best;
    };

    const pointAt = (e: { clientX: number; clientY: number }) => {
        const r = lanesRef.current!.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        return { px, py, ms: Math.max(0, Math.min(totalMs, startMs + px / pxPerMs)) };
    };
    const laneAt = (py: number) => py < RULER_H ? 'ruler' : py < V1_TOP ? 'v2' : py < A1_TOP ? 'v1' : 'a1';

    // Where a dragged edge lands: snapped (unless Alt, or Snap is off) or on a 10 ms step, then kept
    // within its limits and out of heard words (unless Alt).
    const place = (raw: number, alt: boolean, kept: SpokenWord[], limits: [number, number], free: [number, number], targets: number[][]) => {
        const s = !alt && snapOn ? snapMs(raw, targets, SNAP_PX / pxPerMs) : { ms: roundToStep(raw), to: null };
        const ms = alt ? Math.min(free[1], Math.max(free[0], s.ms)) : clampToWords(s.ms, kept, limits);
        return { ms, guide: s.to !== null && ms === s.ms ? s.to : null };
    };

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        const { px, py, ms } = pointAt(e);
        const lane = laneAt(py);
        e.currentTarget.setPointerCapture(e.pointerId);
        if (lane === 'ruler') { onSeek(ms); setDrag({ kind: 'scrub' }); return; }
        if (lane === 'v2') { onSeek(ms); return; }
        const targets = [[timeOf(video)], edgesOfWords, edgesOfCuts, splits];
        // The Blade splits where it is clicked, between words unless Alt is held.
        if (tool === 'blade') {
            if (!locked && split) {
                const p = place(ms, e.altKey, words, [0, totalMs], [0, totalMs], targets);
                if (p.ms > 0 && p.ms < totalMs) split.onSplit(p.ms);
            }
            return;
        }
        // On V1, the ends of what a section keeps trim it.
        const trim = !locked && lane === 'v1' ? trimAt(ms) : null;
        if (trim) {
            const { section, kept } = trim.part;
            const from = trim.edge === 'start' ? kept!.startMs : kept!.endMs;
            setDrag({
                kind: 'trim', section, edge: trim.edge, base: cuts, from, targets, ms: from, guide: null, draft: cuts,
                limits: trim.edge === 'start' ? [section.startMs, kept!.endMs - MIN_PART_MS] : [kept!.startMs + MIN_PART_MS, section.endMs],
            });
            if (splits.length) onSelect({ kind: 'section', startMs: section.startMs, endMs: section.endMs });
            return;
        }
        if (!locked) {
            const hit = edgeAt(grabbable, ms, EDGE_PX / pxPerMs);
            if (hit) {
                const kept = keptWords(words, cuts, hit.cut);
                const at = hit.edge === 'start' ? hit.cut.startMs : hit.cut.endMs;
                setDrag({
                    kind: 'edge', cut: hit.cut, edge: hit.edge, base: cuts, kept, targets,
                    limits: edgeLimits(hit.cut, hit.edge, kept, totalMs),
                    free: hit.edge === 'start' ? [0, hit.cut.endMs - MIN_CUT_MS] : [hit.cut.startMs + MIN_CUT_MS, totalMs],
                    ms: at, guide: null, draft: cuts,
                });
                onSelect({ kind: 'cut', startMs: hit.cut.startMs, endMs: hit.cut.endMs });
                return;
            }
        }
        const picked = cutAt(pickable, ms);
        if (picked) { onSelect({ kind: 'cut', startMs: picked.startMs, endMs: picked.endMs }); return; }
        if (lane === 'a1' && !locked) {
            const p = place(ms, e.altKey, keptAll, [0, totalMs], [0, totalMs], targets);
            setDrag({ kind: 'range', anchor: p.ms, ms: p.ms, guide: p.guide, x0: px, moved: false, targets });
            return;
        }
        // A click on V1 selects the section there, once there are splits, and jumps there.
        const at = sectionAt(splits, ms, totalMs);
        onSelect(lane === 'v1' && splits.length ? { kind: 'section', startMs: at.startMs, endMs: at.endMs } : null);
        onSeek(ms);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const { px, py, ms } = pointAt(e);
        const drag = dragRef.current;
        if (!drag) {
            // On hover only the cursor changes (and the Blade's line moves).
            const lane = laneAt(py);
            let cursor = 'pointer';
            if (tool === 'blade' && (lane === 'v1' || lane === 'a1')) {
                cursor = locked ? 'not-allowed' : 'crosshair';
                if (!locked) setBladeAt(place(ms, e.altKey, words, [0, totalMs], [0, totalMs], [[timeOf(video)], edgesOfWords, edgesOfCuts, splits]).ms);
            } else if (lane === 'v1' || lane === 'a1') {
                if (tool === 'blade') setBladeAt(null);
                if (!locked && ((lane === 'v1' && trimAt(ms)) || edgeAt(grabbable, ms, EDGE_PX / pxPerMs))) cursor = 'ew-resize';
                else if (!cutAt(pickable, ms) && lane === 'a1' && !locked) cursor = 'text';
            } else if (tool === 'blade') setBladeAt(null);
            e.currentTarget.style.cursor = cursor;
            return;
        }
        if (drag.kind === 'scrub') onSeek(ms);
        else if (drag.kind === 'trim') {
            const p = place(ms, e.altKey, words, drag.limits, drag.limits, drag.targets);
            if (p.ms !== drag.ms || p.guide !== drag.guide) setDrag({ ...drag, ms: p.ms, guide: p.guide, draft: trimSection(drag.base, drag.section, drag.edge, p.ms) });
        } else if (drag.kind === 'edge') {
            const p = place(ms, e.altKey, drag.kept, drag.limits, drag.free, drag.targets);
            if (p.ms !== drag.ms || p.guide !== drag.guide) setDrag({ ...drag, ms: p.ms, guide: p.guide, draft: moveCutEdge(drag.base, drag.cut, drag.edge, p.ms) });
        } else {
            const p = place(ms, e.altKey, keptAll, [0, totalMs], [0, totalMs], drag.targets);
            setDrag({ ...drag, ms: p.ms, guide: p.guide, moved: drag.moved || Math.abs(px - drag.x0) >= CLICK_PX });
        }
    };

    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag) return;
        if (drag.kind === 'edge') {
            const from = drag.edge === 'start' ? drag.cut.startMs : drag.cut.endMs;
            if (drag.ms !== from) {
                onCuts(drag.draft);
                const moved = drag.draft[drag.base.indexOf(drag.cut)];
                onSelect({ kind: 'cut', startMs: moved.startMs, endMs: moved.endMs });
            }
        } else if (drag.kind === 'trim') {
            if (drag.ms !== drag.from) onCuts(drag.draft);
        } else if (drag.kind === 'range') {
            if (!drag.moved) { onSelect(null); onSeek(pointAt(e).ms); }
            else {
                const r = rangeOf(drag.anchor, drag.ms, totalMs);
                onSelect(r && { kind: 'range', ...r });
            }
        }
        setDrag(null);
    };

    // Double-click a cut to bring it back, as in the transcript.
    const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const { py, ms } = pointAt(e);
        if (locked || (laneAt(py) !== 'v1' && laneAt(py) !== 'a1')) return;
        const picked = cutAt(pickable, ms);
        if (picked) { onCuts(cuts.filter(c => c !== picked)); onSelect(null); }
    };

    // The selection as drawn: the range being dragged, or the one chosen.
    const range = drag?.kind === 'range' && drag.moved ? rangeOf(drag.anchor, drag.ms, totalMs)
        : selection?.kind === 'range' ? selection : null;
    const shownCut = drag?.kind === 'edge' ? drag.draft[drag.base.indexOf(drag.cut)] : selectedCut;
    const guide = drag && drag.kind !== 'scrub' ? drag.guide : null;

    // The zoom slider runs from the whole recording to the closest, evenly in ratio.
    const span = Math.log(MAX_PX_PER_MS / fit);
    const slider = span > 0 ? Math.round(1000 * Math.log(pxPerMs / fit) / span) : 0;
    const reasonLabel: Record<Cut['reason'], string> = {
        filler: 'filler', pause: 'pause', repeat: 'repeat', manual: 'your cut', retake: 'tighter edit', gap: 'hesitation',
    };

    return (
        <section aria-label="Timeline" className="h-full min-h-[190px] flex flex-col gap-1.5 rounded-lg bg-[#130b29] border border-white/5 p-2 select-none">
            {/* Tools: the tool, zoom, snapping, what is selected, and Split, on one line so the lanes
                never move under the pointer. */}
            <div className="flex items-center gap-2 text-xs whitespace-nowrap overflow-hidden">
                {(['select', 'blade'] as const).map(t => (
                    <button key={t} type="button" aria-pressed={tool === t} onClick={() => { setTool(t); setBladeAt(null); }}
                        title={t === 'select' ? 'Select (V): pick, drag and trim' : 'Blade (B): split where you click, between words unless Alt is held'}
                        className={tool === t
                            ? 'text-xs px-2 py-0.5 rounded border border-amber-400/60 text-amber-200 bg-amber-500/10 shrink-0'
                            : `${secondary} px-2 py-0.5 shrink-0`}>
                        {t === 'select' ? '▸ Select' : '✂ Blade'}
                    </button>
                ))}
                <button aria-label="Zoom out" title="Zoom out (−)" disabled={view.zoom === null} onClick={() => zoomBy(0.5)} className={`${secondary} px-2 py-0.5 shrink-0`}>−</button>
                <input type="range" aria-label="Zoom" min={0} max={1000} value={slider} disabled={span <= 0}
                    onChange={e => zoomAt(fit * Math.exp(Number(e.target.value) / 1000 * span))}
                    className="w-28 shrink-0 accent-amber-400" />
                <button aria-label="Zoom in" title="Zoom in (+)" disabled={pxPerMs >= MAX_PX_PER_MS} onClick={() => zoomBy(2)} className={`${secondary} px-2 py-0.5 shrink-0`}>+</button>
                <button onClick={() => setView({ zoom: null, scrollPx: 0 })} title="Show the whole recording" className={`${secondary} px-2 py-0.5 shrink-0`}>Fit</button>
                <span className="text-gray-400 w-10 shrink-0">{Math.round(pxPerMs / fit) >= 2 ? `${Math.round(pxPerMs / fit)}×` : 'whole'}</span>
                <label className="flex items-center gap-1 text-gray-300 shrink-0" title="Snap to the playhead, word edges, cuts and splits. Hold Alt while dragging to turn it off.">
                    <input type="checkbox" checked={snapOn} onChange={e => setSnapOn(e.target.checked)} className="accent-amber-400" /> Snap
                </label>
                {range && (
                    <span className="flex items-center gap-2 pl-2 border-l border-white/10 min-w-0">
                        <span className="text-amber-200 truncate min-w-0">{preciseTime(range.startMs)}–{preciseTime(range.endMs)} ({((range.endMs - range.startMs) / 1000).toFixed(2)} s)</span>
                        <button onClick={() => { onCuts([...cuts, { startMs: range.startMs, endMs: range.endMs, reason: 'manual' }]); onSelect(null); }} className={`${secondary} px-2 py-0.5 shrink-0`} title="Cut this stretch (Delete)">✂ Cut</button>
                        <button onClick={() => onHear(range.startMs, range.endMs)} title="Play this stretch" className={`${secondary} px-2 py-0.5 shrink-0`}>▶ Play</button>
                        <button onClick={() => onSelect(null)} aria-label="Clear the selection" title="Clear the selection (Esc)" className={`${secondary} px-2 py-0.5 shrink-0`}>×</button>
                    </span>
                )}
                {shownCut && (
                    <span className="flex items-center gap-2 pl-2 border-l border-white/10 min-w-0">
                        <span className="text-amber-200 truncate min-w-0">Cut {preciseTime(shownCut.startMs)}–{preciseTime(shownCut.endMs)} ({((shownCut.endMs - shownCut.startMs) / 1000).toFixed(2)} s, {reasonLabel[shownCut.reason]})</span>
                        {selectedCut && !drag && <>
                            <button onClick={() => onHear(Math.max(0, selectedCut.startMs - 2000), selectedCut.endMs + 2000)} title="Play from 2 s before the cut to 2 s after it, the cut included" className={`${secondary} px-2 py-0.5 shrink-0`}>▶ Hear</button>
                            <button onClick={() => { onCuts(cuts.filter(c => c !== selectedCut)); onSelect(null); }} disabled={locked} title="Bring this cut back (or double-click it)" className={`${secondary} px-2 py-0.5 shrink-0`}>Bring back</button>
                            <button onClick={() => onSelect(null)} aria-label="Clear the selection" title="Clear the selection (Esc)" className={`${secondary} px-2 py-0.5 shrink-0`}>×</button>
                        </>}
                    </span>
                )}
                {selectedSection && split && (() => {
                    const share = cutShare(cuts, selectedSection);
                    return (
                        <span className="flex items-center gap-2 pl-2 border-l border-white/10 min-w-0">
                            <span className="text-amber-200 truncate min-w-0">
                                Section {preciseTime(selectedSection.startMs)}–{preciseTime(selectedSection.endMs)} ({((selectedSection.endMs - selectedSection.startMs) / 1000).toFixed(2)} s{share >= 0.999 ? ', cut' : share > 0 ? `, ${Math.round(share * 100)}% cut` : ''})
                            </span>
                            {share < 0.999 && (
                                <button onClick={() => split.onCutSection(selectedSection)} disabled={locked} title="Cut this section (Delete)" className={`${secondary} px-2 py-0.5 shrink-0`}>Cut section</button>
                            )}
                            {share > 0 && (
                                <button onClick={() => split.onRestoreSection(selectedSection)} disabled={locked} title="Bring this section back" className={`${secondary} px-2 py-0.5 shrink-0`}>Bring back</button>
                            )}
                            <button onClick={() => onSelect(null)} aria-label="Clear the selection" title="Clear the selection (Esc)" className={`${secondary} px-2 py-0.5 shrink-0`}>×</button>
                        </span>
                    );
                })()}
                <span className="grow" />
                {split && <SplitButton split={split} video={video} totalMs={totalMs} disabled={locked} />}
            </div>

            <div className="flex flex-1 min-h-0">
                {/* Track headers. */}
                <div style={{ width: HEADER_W }} className="shrink-0 text-[11px] text-gray-300">
                    <div style={{ height: RULER_H }} />
                    <div style={{ height: V2_H }} className="flex items-center gap-1 pr-2">
                        <span className="grow truncate" title="Text and images over the picture (the On screen panel)">V2 On screen</span>
                        <button type="button" aria-pressed={overlaysHidden} onClick={() => onOverlaysHidden?.(!overlaysHidden)}
                            aria-label={overlaysHidden ? 'Show the on-screen items in the preview' : 'Hide the on-screen items in the preview'}
                            title={overlaysHidden ? 'Hidden in the preview (the render still has them)' : 'Hide in the preview'} className={iconButton}>
                            {overlaysHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                    </div>
                    <div style={{ height: V1_H }} className="flex flex-col justify-center gap-0.5 pr-2">
                        <div className="flex items-center gap-1">
                            <span className="grow truncate">V1 Episode</span>
                            <button type="button" aria-pressed={locked} onClick={() => setLocked(l => !l)}
                                aria-label={locked ? 'Unlock the episode' : 'Lock the episode'}
                                title={locked ? 'Locked: cuts cannot be dragged or made on the timeline' : 'Lock, so the timeline cannot change the cuts'} className={iconButton}>
                                {locked ? <Lock size={13} /> : <LockOpen size={13} />}
                            </button>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                            {Object.entries(colors).map(([speaker, color]) => (
                                <span key={speaker} title={speaker} className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                            ))}
                        </div>
                    </div>
                    <div style={{ height: a1H, marginTop: A1_TOP - V1_TOP - V1_H }} className="flex items-start gap-1 pr-2 pt-1">
                        <span className="grow truncate">A1 Voice</span>
                        <button type="button" aria-pressed={muted}
                            onClick={() => toggleMuted(video.current)}
                            aria-label={muted ? 'Unmute the preview' : 'Mute the preview'} title={muted ? 'Muted in the preview' : 'Mute the preview'} className={iconButton}>
                            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                        </button>
                    </div>
                </div>

                {/* The lanes: a scroller as wide as the recording, with what is in view drawn at its left edge. */}
                <div
                    ref={scrollRef}
                    className="relative flex-1 min-w-0 overflow-x-auto overflow-y-hidden rounded"
                    onScroll={e => {
                        // Scrolled by hand (the scrollbar, a trackpad): the view follows. Scrolls this
                        // component makes itself already match.
                        const left = e.currentTarget.scrollLeft;
                        if (Math.abs(scrollPx - left) < 0.5) return;
                        handScrolledAt.current = Date.now();
                        setView(v => ({ ...v, scrollPx: left }));
                    }}
                >
                    <div style={{ width: contentW, height: A1_TOP + a1H }} className="relative">
                        <div className="sticky left-0 top-0" style={{ width: size.w, height: A1_TOP + a1H }}>
                            <canvas ref={canvasRef} className="absolute inset-0" style={{ width: size.w, height: A1_TOP + a1H }} />
                            <div
                                ref={lanesRef}
                                role="application"
                                aria-label="Timeline lanes: click to jump there, drag on the waveform to select a stretch of time, drag a cut's edge to trim it, double-click a cut to bring it back"
                                className="absolute inset-0 touch-none"
                                onPointerDown={onPointerDown}
                                onPointerMove={onPointerMove}
                                onPointerUp={onPointerUp}
                                onPointerCancel={() => setDrag(null)}
                                onDoubleClick={onDoubleClick}
                            >
                                {/* The selected section. */}
                                {selectedSection && (
                                    <div aria-hidden className="absolute pointer-events-none rounded-sm ring-2 ring-amber-300/80 bg-amber-300/5"
                                        style={{ left: x(selectedSection.startMs), width: (selectedSection.endMs - selectedSection.startMs) * pxPerMs, top: V1_TOP, bottom: 1 }} />
                                )}

                                {/* V2: the on-screen items; click one to jump to it. */}
                                {overlays.filter(o => o.atMs + o.seconds * 1000 >= startMs && o.atMs <= endMs).map(o => (
                                    <button
                                        key={o.id}
                                        type="button"
                                        onPointerDown={e => e.stopPropagation()}
                                        onClick={() => onSeek(o.atMs)}
                                        aria-label={`${o.type === 'text' ? o.text : o.name} at ${tickLabel(o.atMs)}`}
                                        title={`${o.type === 'text' ? o.text : o.name} ${tickLabel(o.atMs)}`}
                                        className={`absolute rounded-sm ${o.type === 'text' ? 'bg-violet-400' : 'bg-sky-400'} ${overlaysHidden ? 'opacity-30' : 'opacity-90'}`}
                                        style={{ left: x(o.atMs), width: Math.max(3, o.seconds * 1000 * pxPerMs), top: V2_TOP + 4, height: V2_H - 8 }}
                                    />
                                ))}

                                {/* Splits: a handle on the ruler removes one (not while locked). */}
                                {!locked && splits.filter(s => s >= startMs && s <= endMs).map(s => (
                                    <button
                                        key={s}
                                        type="button"
                                        aria-label={`Remove the split at ${tickLabel(s)}`}
                                        title={`Split at ${tickLabel(s)}: click to remove it`}
                                        onPointerDown={e => e.stopPropagation()}
                                        onClick={() => split?.onRemoveSplit(s)}
                                        className="absolute w-3 h-3 rounded-full bg-white text-[8px] leading-3 text-black"
                                        style={{ left: x(s) - 6, top: RULER_H - 13 }}
                                    >×</button>
                                ))}

                                {/* Where the Blade would split. */}
                                {tool === 'blade' && bladeAt !== null && !drag && (
                                    <div aria-hidden className="absolute pointer-events-none w-px bg-amber-300" style={{ left: x(bladeAt), top: RULER_H, bottom: 0 }}>
                                        <span className="absolute -top-0 left-1 rounded bg-black/80 px-1 text-[10px] text-amber-200 whitespace-nowrap">✂ {preciseTime(bladeAt)}</span>
                                    </div>
                                )}

                                {/* The chosen stretch of time. */}
                                {range && (
                                    <div aria-hidden className="absolute pointer-events-none bg-white/15 border-x border-white/80"
                                        style={{ left: x(range.startMs), width: Math.max(1, (range.endMs - range.startMs) * pxPerMs), top: RULER_H, bottom: 0 }} />
                                )}

                                {/* The chosen cut, with its edges marked: drag them to trim it. */}
                                {shownCut && (
                                    <div aria-hidden className="absolute pointer-events-none rounded-sm ring-2 ring-white/85"
                                        style={{ left: x(shownCut.startMs), width: Math.max(2, (shownCut.endMs - shownCut.startMs) * pxPerMs), top: V1_TOP, bottom: 1 }}>
                                        {!locked && <>
                                            <span className="absolute -left-[3px] top-1/2 -translate-y-1/2 w-1.5 h-6 rounded bg-white" />
                                            <span className="absolute -right-[3px] top-1/2 -translate-y-1/2 w-1.5 h-6 rounded bg-white" />
                                        </>}
                                    </div>
                                )}

                                {/* Where a drag snapped, and the time it is at. */}
                                {guide !== null && (
                                    <div aria-hidden className="absolute top-0 bottom-0 w-px bg-amber-300 pointer-events-none" style={{ left: x(guide) }} />
                                )}
                                {drag && drag.kind !== 'scrub' && (
                                    <span className="absolute pointer-events-none rounded bg-black/80 px-1 text-[10px] text-amber-200"
                                        style={{ left: Math.min(size.w - 70, Math.max(0, x(drag.ms) + 6)), top: A1_TOP + 2 }}>
                                        {preciseTime(drag.ms)}
                                    </span>
                                )}

                                {/* What is not there yet. */}
                                {!thumbs && (
                                    <span className="absolute pointer-events-none text-[10px] text-gray-500" style={{ left: 8, top: V1_TOP + 14 }}>
                                        {media ? 'Pictures appear here after the next Podcast Ingest run' : 'Loading the pictures…'}
                                    </span>
                                )}
                                {!levels && (
                                    <span className="absolute pointer-events-none text-[10px] text-gray-500" style={{ left: 8, top: A1_TOP + a1H / 2 - 6 }}>
                                        {media ? 'The waveform appears here after the next Podcast Ingest run' : 'Loading the waveform…'}
                                    </span>
                                )}

                                <Playhead video={video} startMs={startMs} pxPerMs={pxPerMs} width={size.w} onFollow={onFollow} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
