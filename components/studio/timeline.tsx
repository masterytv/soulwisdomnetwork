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
// Item E4: each split has a ⧓ marker for its transition (click it to choose one), and the stretches a
// transition overlaps are shaded.
// Item E5: the layers (lib/layers.ts) on V3 (text) and V2 (pictures and video): click one to select it,
// drag it to move it, drag an end to trim it (snapping as cuts do; Alt turns it off), one undo step a
// drag; and a file dragged from the Media panel lands where it is dropped.
// Item E8: the CC lane under V1 shows the YouTube caption track (each caption where it is heard, amber when
// too fast to read); a click goes to the caption, and its header turns CC on the preview on and off.
// Item E11: the sections between splits are drawn in the order they play (lib/timeline.ts timelineAxis), and a section on
// V1 can be dragged to a new place (`split.onOrder`); every time here is the recording's, drawn through that axis.
// Item E10: `programme`, the Programme row (components/studio/programme.tsx), sits between the tools and the lanes.
// Item E13: the timeline shows only what plays, closed up in play order (lib/timeline.ts playedAxis), with a marker at
// each join where something is cut; an end of a kept stretch is dragged out to bring back what was cut there, or in to
// cut more (rippleTrim), and everything after it moves with it. Show cuts draws the whole recording, cuts and all, as before.

"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Captions, CaptionsOff, Eye, EyeOff, Lock, LockOpen, Volume2, VolumeX } from 'lucide-react';
import type { SpokenWord } from '@/lib/showNotes';
import { keepRanges, keptBounds, MIN_PART_MS, moveSection, sectionAt, sectionsOf, trimSection, type Cut, type KeptRange, type Section } from '@/lib/edit';
import { LAYER_MIN_MS, layerKind, layerName, layerSpan, TRACK, type Anchor, type Layer } from '@/lib/layers';
import { SOUND_TRACK, SOUND_TRACK_LABELS, type Sound } from '@/lib/audio';
import { cueTooFast, type Cue } from '@/lib/captions';
import { playOrder, sourceTime, timelineTime, type Clip } from '@/lib/sequence';
import { BIN_DRAG_TYPE } from '@/components/studio/mediaBin';
import { columnPeaks, peakLevels } from '@/lib/peaks';
import { thumbAt, type ThumbSheets } from '@/lib/thumbs';
import {
    clampScroll, clampToWords, clampZoom, cutAt, edgeAt, edgeLimits, fitPxPerMs, keptWords, MAX_PX_PER_MS, MIN_CUT_MS, moveCutEdge,
    preciseTime, rangeOf, removedRanges, roundToStep, SNAP_PX, snapMs, speakerBlocks, speakerColors, stepFor, tickLabel,
    ticksBetween, tickText, wordEdges, zoomAround, timelineAxis, dropPosition, type SpeakerBlock, type TimelineAxis,
    playedAxis, pieceEdgeAt, hiddenAt, rippleLimits, rippleTrim, joinMarks, type AxisPiece, type JoinMark,
} from '@/lib/timeline';
import { secondary } from '@/components/studio/ui';
import { useVideoTime } from '@/components/studio/useVideoTime';

// What the timeline draws besides the edit: the waveform's peaks and the thumbnail sheets, made at
// ingest. Null: none yet (the next Podcast Ingest run makes them).
export interface TimelineMedia {
    peaks: Int8Array | null;
    thumbs: ThumbSheets | null;
}

// What is selected on the timeline: a stretch of time (Delete cuts it), a cut (by its times), a
// section between splits (Delete cuts it whole), or what is cut at a join of the closed-up timeline (item E13: the
// stretch of the recording hidden there).
export type TimelineSelection =
    | { kind: 'range'; startMs: number; endMs: number }
    | { kind: 'cut'; startMs: number; endMs: number }
    | { kind: 'section'; startMs: number; endMs: number }
    | { kind: 'join'; startMs: number; endMs: number };

// Splits: set at the playhead (S) or with the Blade tool, they divide the episode into sections, as
// in Descript. A selected section can be cut or brought back whole; click a split's handle to
// remove it.
export interface SplitControls {
    splits: number[];
    onSplit: (ms: number) => void;
    onRemoveSplit: (ms: number) => void;
    onCutSection: (section: Section) => void;
    onRestoreSection: (section: Section) => void;
    // Item E11: the play order of the sections (edit.order), and a section dragged to a new place.
    order?: number[] | null;
    onOrder?: (order: number[] | null) => void;
}

// The lanes, top to bottom, in pixels. The voice lane takes the height that is left.
const RULER_H = 22;
const LANE_H = 20;
const V3_TOP = RULER_H, V2_TOP = V3_TOP + LANE_H;
const V1_TOP = V2_TOP + LANE_H, THUMB_H = 40, BAND_H = 4, V1_H = THUMB_H + BAND_H;
const CC_TOP = V1_TOP + V1_H + 2, CC_H = 16;
const A1_TOP = CC_TOP + CC_H + 2, MIN_A1_H = 24;
export const HEADER_W = 112;
// How close to a cut's edge the pointer grabs it; a cut narrower than GRAB_PX on screen is grabbed
// only once selected, and one narrower than PICK_PX is not picked by a click (zoom in for those).
const EDGE_PX = 6, GRAB_PX = 8, PICK_PX = 3;
// Item E13: an end of a kept stretch is grabbed only when the stretch is this wide on screen (zoom in for shorter ones),
// and markers closer together than MARK_PX show only their notch.
const PIECE_GRAB_PX = 10, MARK_PX = 6;
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
    captions: CaptionMark[];
    // Item E13: where something is cut, on the closed-up timeline.
    marks: JoinMark[];
    // Item E11: where each moment of the recording is drawn; everything above is already in the timeline's time, the
    // pictures and the waveform are read through it.
    axis: TimelineAxis;
}

// A caption of the YouTube track (item E8), where it is heard in the recording; `fast`: too fast to read.
interface CaptionMark { fromMs: number; toMs: number; text: string; fast: boolean }

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
    ctx.fillRect(0, V3_TOP, width, LANE_H * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, V2_TOP, width, 1);
    ctx.fillStyle = '#0b0619';
    ctx.fillRect(0, V1_TOP, width, V1_H);
    ctx.fillRect(0, A1_TOP, width, a1H);
    ctx.fillStyle = '#0f0922';
    ctx.fillRect(0, CC_TOP, width, CC_H);

    // CC: the caption track, a block per caption, with its words once there is room for them.
    ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const c of d.captions) {
        if (c.toMs < startMs || c.fromMs > endMs) continue;
        const X = x(c.fromMs), w = Math.max(1, (c.toMs - c.fromMs) * pxPerMs - 1);
        ctx.fillStyle = c.fast ? 'rgba(245,158,11,0.75)' : 'rgba(226,232,240,0.55)';
        ctx.fillRect(X, CC_TOP + 2, w, CC_H - 4);
        if (w > 30) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(X + 2, CC_TOP, w - 4, CC_H);
            ctx.clip();
            ctx.fillStyle = '#0b0619';
            ctx.fillText(c.text, X + 3, CC_TOP + CC_H / 2 + 0.5);
            ctx.restore();
        }
    }

    // V1: a thumbnail every tile's width, each the frame nearest the tile's middle. Tiles sit at fixed
    // places on the recording, so they stay put as the view scrolls.
    const end = x(totalMs);
    if (d.thumbs) {
        const tw = THUMB_H * 16 / 9;
        const t = d.thumbs;
        for (let k = Math.floor(startMs * pxPerMs / tw); k * tw / pxPerMs < Math.min(endMs, totalMs); k++) {
            const at = thumbAt(t, d.axis.toSrc((k + 0.5) * tw / pxPerMs));
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
        let peaks: Int8Array;
        if (!d.axis.moved) peaks = columnPeaks(d.levels, startMs, 1 / pxPerMs, cols);
        else {
            // Each section's columns from its own stretch of the recording.
            peaks = new Int8Array(cols * 2);
            for (const p of d.axis.pieces) {
                const a = p.viewStart, b = p.viewStart + (p.srcEnd - p.srcStart);
                const c0 = Math.max(0, Math.floor((a - startMs) * pxPerMs)), c1 = Math.min(cols, Math.ceil((b - startMs) * pxPerMs));
                if (c1 <= c0) continue;
                peaks.set(columnPeaks(d.levels, p.srcStart + (startMs + c0 / pxPerMs - a), 1 / pxPerMs, c1 - c0), c0 * 2);
            }
        }
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

    // Item E13: where something is cut, on the closed-up timeline: a line over the picture and the voice, and a notch
    // on top (only the notch where they crowd). Amber when all of it is suggestions, grey when any of it is the producer's own.
    let lastX = -Infinity;
    for (const m of d.marks) {
        if (m.viewMs < startMs - 1 / pxPerMs || m.viewMs > endMs) continue;
        const X = Math.round(x(m.viewMs));
        ctx.fillStyle = m.suggested ? SUGGESTED : YOURS;
        if (X - lastX >= MARK_PX) {
            ctx.globalAlpha = 0.85;
            ctx.fillRect(X - 1, V1_TOP, 2, V1_H);
            ctx.fillRect(X - 1, A1_TOP, 2, a1H);
            ctx.globalAlpha = 1;
        }
        lastX = X;
        ctx.beginPath();
        ctx.moveTo(X - 4, V1_TOP); ctx.lineTo(X + 4, V1_TOP); ctx.lineTo(X, V1_TOP + 5);
        ctx.fill();
    }

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
function Playhead({ video, startMs, pxPerMs, width, onFollow, toView }: {
    video: React.RefObject<HTMLVideoElement | null>; startMs: number; pxPerMs: number; width: number; onFollow: (ms: number) => void;
    toView: (ms: number) => number;
}) {
    const ms = toView(usePlayhead(video));
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
    // Item E11: a section on V1 being dragged: its play position, how far into it it was grabbed, and where the pointer is.
    | { kind: 'move'; from: number; x0: number; grabMs: number; viewMs: number; moved: boolean; srcMs: number }
    | {
        kind: 'trim'; section: Section; edge: 'start' | 'end'; base: Cut[]; from: number;
        limits: [number, number]; targets: number[][]; ms: number; guide: number | null; draft: Cut[];
    }
    // Item E13: an end of a kept stretch on the closed-up timeline, dragged out or in from `from` of the recording.
    | {
        kind: 'ripple'; piece: AxisPiece; edge: 'start' | 'end'; base: Cut[]; from: number; x0: number; moved: boolean;
        lane: string; srcMs: number; limits: [number, number]; targets: number[][]; ms: number; guide: number | null; draft: Cut[];
    };

const iconButton = 'p-0.5 rounded text-gray-400 hover:text-white hover:bg-white/10 aria-pressed:text-amber-300';

// A layer being dragged on V2 or V3, or a sound on A2 or A3 (item E7): its whole body moves it, an end trims it.
type Placed = Layer | Sound;
interface LayerDrag { id: string; mode: 'move' | 'start' | 'end'; x0: number; base: Placed; draft: Placed; moved: boolean; guide: number | null }
const NO_CUES: Cue[] = [];

// The caption track on the CC lane: each caption where it is heard in the recording.
function captionMarks(cues: Cue[], clips: Clip[]): CaptionMark[] {
    return cues.map(c => {
        const fromMs = sourceTime(clips, c.startMs) ?? 0;
        const toMs = sourceTime(clips, Math.max(c.startMs, c.endMs - 1)) ?? fromMs;
        return { fromMs, toMs: Math.max(fromMs, toMs), text: c.lines.join(' '), fast: cueTooFast(c) };
    });
}
// The sound lanes along the bottom, under A1.
const SOUND_LANES = [SOUND_TRACK.music, SOUND_TRACK.effects];
const soundsH = SOUND_LANES.length * LANE_H;

// Where a layer is on the timeline, which is drawn in the recording's time: from where it starts in the
// edited episode to where it ends, mapped back to the recording (null when it starts after the end).
function layerBounds(l: { anchor: Anchor; durationMs: number }, clips: Clip[], editedMs: number) {
    const span = layerSpan(l, clips, editedMs);
    if (!span) return null;
    const from = sourceTime(clips, span.startMs) ?? ('srcMs' in l.anchor ? l.anchor.srcMs : 0);
    const to = sourceTime(clips, Math.max(span.startMs, span.endMs - 1)) ?? from + (span.endMs - span.startMs);
    return { span, fromMs: from, toMs: Math.max(from, to) };
}

// Why each cut was made, as the timeline says it.
const REASON_LABEL: Record<Cut['reason'], string> = {
    filler: 'filler', pause: 'pause', repeat: 'repeat', manual: 'your cut', retake: 'tighter edit', gap: 'hesitation',
};

// What is cut in a stretch of the recording (item E13): where, how long, and why.
function cutLabel(cuts: Cut[], startMs: number, endMs: number): string {
    const why = [...new Set(cuts.filter(c => c.startMs < endMs && c.endMs > startMs).map(c => REASON_LABEL[c.reason]))];
    return `Cut ${preciseTime(startMs)}–${preciseTime(endMs)} (${((endMs - startMs) / 1000).toFixed(2)} s${why.length ? `, ${why.join(', ')}` : ''})`;
}

// Where the video is, in ms.
const timeOf = (video: React.RefObject<HTMLVideoElement | null>) => (video.current?.currentTime ?? 0) * 1000;

// The A1 track's mute: the preview's sound only.
function toggleMuted(video: HTMLVideoElement | null) {
    if (video) video.muted = !video.muted;
}

// A split's transition on the timeline: its name and length, or null for a straight cut; `playing`
// is false when it has no room and plays as a cut.
export interface SplitTransition { splitMs: number; label: string | null; playing: boolean }

export function Timeline({
    words, cuts, ranges, layers = [], clips = [], editedMs = 0, selectedLayer = null, onSelectLayer, onLayers, onDropMedia,
    sounds = [], onSounds, mutedTracks = [], onMutedTracks, captions: cues = NO_CUES, captionsShown = false, onCaptionsShown,
    totalMs, video, onSeek, split, media, selection, onSelect, onCuts, onHear, keys,
    overlaysHidden = false, onOverlaysHidden, transitions = [], overlaps = [], onJoin, programme,
}: {
    words: SpokenWord[];
    cuts: Cut[];
    ranges: KeptRange[];                    // what the edit keeps (keepRanges), for the waveform's red
    layers?: Layer[];                       // item E5, with the play order and edited length to place them
    clips?: Clip[];
    editedMs?: number;
    selectedLayer?: string | null;
    onSelectLayer?: (id: string | null) => void;
    onLayers?: (layers: Layer[]) => void;   // a whole drag, as one change; missing: layers cannot be changed
    onDropMedia?: (itemId: string, srcMs: number) => void;
    sounds?: Sound[];                       // item E7: music on A2, effects on A3
    onSounds?: (sounds: Sound[]) => void;
    mutedTracks?: number[];                 // sound tracks muted in the preview
    onMutedTracks?: (tracks: number[]) => void;
    captions?: Cue[];                       // item E8: the YouTube caption track, on the edited timeline
    captionsShown?: boolean;                // CC on the preview
    onCaptionsShown?: (shown: boolean) => void;
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
    transitions?: SplitTransition[];
    overlaps?: { fromMs: number; toMs: number }[];   // what the transitions overlap, in the recording
    onJoin?: (splitMs: number) => void;              // a split's ⧓ marker was clicked
    programme?: React.ReactNode;                     // item E10: the whole video's row, over the lanes
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
    // A layer being moved or trimmed (item E5): kept apart from the cut drags, in a ref and state as they are.
    const layerDragRef = useRef<LayerDrag | null>(null);
    const [layerDrag, setLayerDragState] = useState<LayerDrag | null>(null);
    const setLayerDrag = (d: LayerDrag | null) => { layerDragRef.current = d; setLayerDragState(d); };
    const [snapOn, setSnapOn] = useState(true);
    // Item E13: off, only what plays, closed up; on, the whole recording with its cuts.
    const [showCuts, setShowCuts] = useState(false);
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

    const splits = useMemo(() => split?.splits ?? [], [split?.splits]);
    // While a cut's edge, a section's end or an end of a kept stretch is dragged, the timeline shows the edit as it would be.
    const draft = drag?.kind === 'edge' || drag?.kind === 'trim' || drag?.kind === 'ripple' ? drag.draft : null;
    const shownCuts = draft ?? cuts;
    // Item E11: the sections in play order; every moment of the recording is drawn at axis.toView of it. Item E13: unless
    // Show cuts is on, only what plays, closed up (and as the edit would be, while an end is dragged).
    const sectionsAxis = useMemo(() => timelineAxis(splits, split?.order, totalMs), [splits, split?.order, totalMs]);
    const playClips = useMemo(() => playOrder({ cuts: shownCuts, splits, order: split?.order }, totalMs, words), [shownCuts, splits, split?.order, totalMs, words]);
    const playAxis = useMemo(() => playedAxis(playClips, splits, split?.order, totalMs), [playClips, splits, split?.order, totalMs]);
    const axis = showCuts ? sectionsAxis : playAxis;
    const lengthMs = axis.lengthMs;
    const fit = fitPxPerMs(lengthMs, size.w);
    const pxPerMs = view.zoom === null ? fit : clampZoom(view.zoom, fit);
    const contentW = Math.max(size.w, Math.ceil(lengthMs * pxPerMs));
    const scrollPx = clampScroll(view.scrollPx, lengthMs, pxPerMs, size.w);
    const startMs = scrollPx / pxPerMs;
    const endMs = startMs + size.w / pxPerMs;
    const a1H = Math.max(MIN_A1_H, size.h - A1_TOP - soundsH);
    const soundTop = (track: number) => A1_TOP + a1H + SOUND_LANES.indexOf(track as typeof SOUND_LANES[number]) * LANE_H;
    const x = (ms: number) => (ms - startMs) * pxPerMs;

    // The view's scroll position is kept in state and put on the scroller after each change.
    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (el && Math.abs(el.scrollLeft - scrollPx) > 0.5) el.scrollLeft = scrollPx;
    }, [scrollPx, contentW]);

    const zoomTo = useCallback((next: number, anchorX: number) => {
        const z = clampZoom(next, fit);
        const s = clampScroll(zoomAround(pxPerMs, z, scrollPx, anchorX), lengthMs, z, size.w);
        setView({ zoom: z <= fit * 1.0001 ? null : z, scrollPx: s });
    }, [fit, pxPerMs, scrollPx, lengthMs, size.w]);

    // Zoom buttons, the slider and the keys keep the playhead where it is when it is in view, else
    // the middle.
    const zoomAt = useCallback((next: number) => {
        const px = (axis.toView(timeOf(video)) - startMs) * pxPerMs;
        zoomTo(next, px >= 0 && px <= size.w ? px : size.w / 2);
    }, [video, startMs, pxPerMs, size.w, zoomTo, axis]);
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
        setView(v => ({ ...v, scrollPx: clampScroll(ms * pxPerMs - size.w / 3, lengthMs, pxPerMs, size.w) }));
    }, [pxPerMs, size.w, lengthMs]);

    const blocks = useMemo(() => speakerBlocks(words), [words]);
    const captions = useMemo(() => captionMarks(cues, clips), [cues, clips]);
    const colors = useMemo(() => speakerColors(blocks), [blocks]);
    const peaks = media?.peaks ?? null, thumbs = media?.thumbs ?? null;
    const levels = useMemo(() => peaks ? peakLevels(peaks) : null, [peaks]);
    const edgesOfWords = useMemo(() => wordEdges(words), [words]);
    const edgesOfCuts = useMemo(() => cuts.flatMap(c => [c.startMs, c.endMs]).sort((a, b) => a - b), [cuts]);
    const keptAll = useMemo(() => keptWords(words, cuts), [words, cuts]);
    const sections = useMemo(() => sectionsOf(splits, totalMs), [splits, totalMs]);

    const parts = useMemo(() => sections.map(section => ({ section, kept: keptBounds(shownCuts, section) })), [sections, shownCuts]);
    // In the recording's order (the clips come in play order).
    const removed = useMemo(() => removedRanges(draft ? keepRanges(totalMs, draft, 40, words) : [...ranges].sort((a, b) => a.startMs - b.startMs), totalMs),
        [draft, ranges, totalMs, words]);
    // What the canvas draws, in the timeline's time: as it is in the recording's order, through the axis once sections move.
    const drawn = useMemo(() => {
        const marks: JoinMark[] = [];
        if (!axis.moved) return { cuts: shownCuts, removed, blocks, splits, parts, captions, marks };
        const spread = <T extends { startMs: number; endMs: number }>(list: T[]) =>
            list.flatMap(r => axis.spans(r.startMs, r.endMs).map(sp => ({ ...r, startMs: sp.fromMs, endMs: sp.toMs })));
        const spreadCaptions = captions.flatMap(c => axis.spans(c.fromMs, c.toMs).map(sp => ({ ...c, fromMs: sp.fromMs, toMs: sp.toMs })));
        // Item E13: nothing cut is drawn; each section is a clip from where it starts to where it ends on the timeline.
        if (axis.collapsed) {
            return {
                cuts: [], removed: [], blocks: spread(blocks), captions: spreadCaptions, marks: joinMarks(axis, shownCuts),
                splits: axis.sections.slice(1).map(sec => sec.viewStart),
                parts: axis.sections.map(sec => {
                    const v = { startMs: sec.viewStart, endMs: sec.viewEnd };
                    return { section: v, kept: sec.viewEnd > sec.viewStart ? v : null };
                }),
            };
        }
        const view = (sec: Section) => ({ startMs: axis.toView(sec.startMs), endMs: axis.toView(sec.startMs) + (sec.endMs - sec.startMs) });
        return {
            cuts: spread(shownCuts),
            removed: spread(removed),
            blocks: spread(blocks),
            splits: axis.sections.slice(1).map(sec => sec.viewStart),
            parts: parts.map(p => ({ section: view(p.section), kept: p.kept && view(p.kept) })),
            captions: spreadCaptions,
            marks,
        };
    }, [axis, shownCuts, removed, blocks, splits, parts, captions]);

    // Thumbnail sheets for the part in view and a view either side, loaded as needed.
    useEffect(() => {
        const t = thumbs;
        if (!t || size.w <= 0) return;
        const span = endMs - startMs;
        // The sheets the stretches of the recording in and around the view are on (in play order, from anywhere).
        const sheets = new Set<number>();
        for (const p of axis.pieces) {
            const a = Math.max(p.viewStart, startMs - span), b = Math.min(p.viewStart + (p.srcEnd - p.srcStart), endMs + span);
            if (b < a) continue;
            const first = thumbAt(t, p.srcStart + (a - p.viewStart))?.sheet ?? 0, last = thumbAt(t, p.srcStart + (b - p.viewStart))?.sheet ?? 0;
            for (let k = first; k <= last; k++) sheets.add(k);
        }
        for (const s of sheets) {
            const url = t.urls[s];
            if (!url || images.current.has(url)) continue;
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => setLoadedSheets(n => n + 1);
            img.src = url;
            images.current.set(url, img);
        }
    }, [thumbs, startMs, endMs, size.w, axis]);

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
            width: size.w, a1H, startMs, pxPerMs, totalMs: lengthMs, levels, thumbs, images: images.current,
            ...drawn, colors, axis,
        });
    }, [size.w, a1H, startMs, pxPerMs, totalMs, lengthMs, levels, thumbs, drawn, colors, axis, loadedSheets]);

    if (totalMs <= 0) return null;

    // Cuts wide enough on screen to grab by an edge, or to pick with a click; the selected one always.
    const selectedCut = selection?.kind === 'cut'
        ? cuts.find(c => c.startMs === selection.startMs && c.endMs === selection.endMs) : undefined;
    const inView = axis.collapsed ? [] : axis.moved ? cuts.filter(c => axis.spans(c.startMs, c.endMs).some(sp => sp.toMs >= startMs && sp.fromMs <= endMs))
        : cuts.filter(c => c.endMs >= startMs && c.startMs <= endMs);
    // A moment of the recording, on screen; and whether a stretch of it is in view (a cut one, at its join).
    const xs = (ms: number) => x(axis.toView(ms));
    const shown = (fromMs: number, toMs: number) => {
        const v = axis.toView(fromMs);
        return (v >= startMs && v <= endMs) || axis.spans(fromMs, Math.max(toMs, fromMs + 1)).some(sp => sp.toMs >= startMs && sp.fromMs <= endMs);
    };
    // How wide a stretch of the recording is on screen: its length, or once what plays is closed up, what of it plays.
    const spanPx = (fromMs: number, toMs: number) => (axis.collapsed ? Math.max(0, axis.toView(toMs) - axis.toView(fromMs)) : toMs - fromMs) * pxPerMs;
    // How wide a layer is drawn: from where it starts to where it ends, which in play order can be a different section (a
    // layer over a moved part's end); never less than its own length on screen (unless cuts are closed up).
    const wide = (fromMs: number, toMs: number) => (axis.collapsed ? spanPx(fromMs, toMs)
        : Math.max((toMs - fromMs) * pxPerMs, (axis.toView(toMs) - axis.toView(fromMs)) * pxPerMs));
    const grabbable = inView.filter(c => c === selectedCut || (c.endMs - c.startMs) * pxPerMs >= GRAB_PX);
    const pickable = inView.filter(c => c === selectedCut || (c.endMs - c.startMs) * pxPerMs >= PICK_PX);
    // The selected section, while its splits are still there.
    const selectedSection = selection?.kind === 'section'
        ? sections.find(sec => sec.startMs === selection.startMs && sec.endMs === selection.endMs) : undefined;

    // The end of a section's kept part near a moment, on V1: drag it to trim the section. At a split
    // both sections have an end in the same place: the one on the pointer's side wins.
    const trimAt = (ms: number) => {
        if (axis.collapsed) return null;
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

    // Item E13: the end of a kept stretch under the pointer on the closed-up timeline, when the stretch is wide enough to grab.
    const pieceEnd = (view: number) => {
        if (!axis.collapsed) return null;
        const hit = pieceEdgeAt(axis, view, EDGE_PX / pxPerMs);
        if (!hit) return null;
        const p = axis.pieces[hit.index];
        return (p.srcEnd - p.srcStart) * pxPerMs >= PIECE_GRAB_PX ? hit : null;
    };

    const pointAt = (e: { clientX: number; clientY: number }) => {
        const r = lanesRef.current!.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        const view = Math.max(0, Math.min(lengthMs, startMs + px / pxPerMs));
        return { px, py, view, ms: axis.toSrc(view) };
    };
    const laneAt = (py: number) => py < RULER_H ? 'ruler' : py < V1_TOP ? 'v2' : py < CC_TOP ? 'v1' : py < A1_TOP ? 'cc' : py < A1_TOP + a1H ? 'a1' : 'sounds';
    // The caption heard at `ms` of the recording, on the CC lane.
    const captionAt = (ms: number) => captions.find(c => ms >= c.fromMs && ms <= c.toMs);

    // ── Layers (item E5) ──
    const layerTargets = () => [[timeOf(video)], edgesOfWords, splits];
    // Moves or trims the dragged layer to `ms` of the recording, snapped unless Alt (or Snap is off).
    const dragLayerTo = (d: LayerDrag, rawMs: number, alt: boolean): LayerDrag => {
        const s = !alt && snapOn ? snapMs(rawMs, layerTargets(), SNAP_PX / pxPerMs) : { ms: roundToStep(rawMs), to: null };
        const ms = Math.max(0, Math.min(totalMs, s.ms));
        const b = d.base;
        const bounds = layerBounds(b, clips, editedMs);
        if (!bounds) return d;
        const editedAt = timelineTime(clips, ms, true) ?? editedMs;
        const anchorAt = (srcMs: number, at: number) => ('atMs' in b.anchor ? { atMs: Math.round(at) } : { srcMs: Math.round(srcMs) });
        let draft: Placed;
        if (d.mode === 'move') draft = { ...b, anchor: anchorAt(ms, editedAt) };
        else if (d.mode === 'end') draft = { ...b, durationMs: Math.max(LAYER_MIN_MS, Math.round(editedAt - bounds.span.startMs)) };
        else {
            const start = Math.min(editedAt, bounds.span.endMs - LAYER_MIN_MS);
            draft = { ...b, anchor: anchorAt(sourceTime(clips, start) ?? ms, start), durationMs: Math.max(LAYER_MIN_MS, Math.round(bounds.span.endMs - start)) };
        }
        return { ...d, draft, guide: s.to !== null && ms === s.ms ? s.to : null };
    };
    const isSound = (l: Placed): l is Sound => 'gainDb' in l;
    const placedName = (l: Placed) => (isSound(l) ? l.media.name : layerName(l));
    const onLayerDown = (e: React.PointerEvent<HTMLElement>, l: Placed, mode: LayerDrag['mode']) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onSelectLayer?.(l.id);
        if (!(isSound(l) ? onSounds : onLayers)) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setLayerDrag({ id: l.id, mode, x0: e.clientX, base: l, draft: l, moved: false, guide: null });
    };
    const onLayerMove = (e: React.PointerEvent<HTMLElement>) => {
        const d = layerDragRef.current;
        if (!d) return;
        const moved = d.moved || Math.abs(e.clientX - d.x0) >= CLICK_PX;
        if (!moved) return;
        const bounds = layerBounds(d.base, clips, editedMs);
        if (!bounds) return;
        const delta = (e.clientX - d.x0) / pxPerMs;
        const from = d.mode === 'end' ? bounds.toMs : bounds.fromMs;
        setLayerDrag({ ...dragLayerTo(d, axis.toSrc(axis.toView(from) + delta), e.altKey), moved: true });
    };
    const onLayerUp = () => {
        const d = layerDragRef.current;
        if (!d) return;
        if (d.moved && isSound(d.draft)) onSounds?.(sounds.map(s => (s.id === d.id ? d.draft as Sound : s)));
        else if (d.moved) onLayers?.(layers.map(l => (l.id === d.id ? d.draft as Layer : l)));
        else if (!d.moved) {
            const b = layerBounds(d.base, clips, editedMs);
            if (b) onSeek(b.fromMs);
        }
        setLayerDrag(null);
    };
    const shownLayers = layers.map(l => (layerDrag?.id === l.id ? layerDrag.draft as Layer : l));
    const shownSounds = sounds.map(s => (layerDrag?.id === s.id ? layerDrag.draft as Sound : s));
    const selectedLayerShown: Placed | null = shownLayers.find(l => l.id === selectedLayer) ?? shownSounds.find(s => s.id === selectedLayer) ?? null;
    const selectedBounds = selectedLayerShown ? layerBounds(selectedLayerShown, clips, editedMs) : null;

    // Where a dragged edge lands: snapped (unless Alt, or Snap is off) or on a 10 ms step, then kept
    // within its limits and out of heard words (unless Alt).
    const place = (raw: number, alt: boolean, kept: SpokenWord[], limits: [number, number], free: [number, number], targets: number[][]) => {
        const s = !alt && snapOn ? snapMs(raw, targets, SNAP_PX / pxPerMs) : { ms: roundToStep(raw), to: null };
        const ms = alt ? Math.min(free[1], Math.max(free[0], s.ms)) : clampToWords(s.ms, kept, limits);
        return { ms, guide: s.to !== null && ms === s.ms ? s.to : null };
    };

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        const { px, py, ms, view } = pointAt(e);
        const lane = laneAt(py);
        e.currentTarget.setPointerCapture(e.pointerId);
        if (lane === 'ruler') { onSeek(ms); setDrag({ kind: 'scrub' }); return; }
        if (lane === 'v2' || lane === 'sounds') { onSelectLayer?.(null); onSeek(ms); return; }
        if (lane === 'cc') { onSelectLayer?.(null); onSelect(null); onSeek(captionAt(ms)?.fromMs ?? ms); return; }
        const targets = [[timeOf(video)], edgesOfWords, edgesOfCuts, splits];
        // The Blade splits where it is clicked, between words unless Alt is held.
        if (tool === 'blade') {
            if (!locked && split) {
                const p = place(ms, e.altKey, words, [0, totalMs], [0, totalMs], targets);
                if (p.ms > 0 && p.ms < totalMs) split.onSplit(p.ms);
            }
            return;
        }
        // Item E13: on the closed-up timeline, an end of a kept stretch drags out (bringing back what was cut there) or
        // in (cutting more); a press that does not move is a click, which chooses what is cut there.
        const end = !locked && (lane === 'v1' || lane === 'a1') ? pieceEnd(view) : null;
        if (end) {
            const piece = axis.pieces[end.index];
            const from = end.edge === 'start' ? piece.srcStart : piece.srcEnd;
            setDrag({
                kind: 'ripple', piece, edge: end.edge, base: cuts, from, x0: px, moved: false, lane, srcMs: ms,
                limits: rippleLimits(piece, end.edge), targets: [[timeOf(video)], edgesOfWords], ms: from, guide: null, draft: cuts,
            });
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
        // On V1, once there are splits, a press can drag its section to a new place; a press that does not move is a click.
        if (lane === 'v1' && !locked && split?.onOrder && axis.sections.length > 1) {
            const from = axis.sections.findIndex(sec => sec.viewEnd > sec.viewStart && view < sec.viewEnd);
            const at = from < 0 ? axis.sections.length - 1 : from;
            setDrag({ kind: 'move', from: at, x0: px, grabMs: view - axis.sections[at].viewStart, viewMs: view, moved: false, srcMs: ms });
            return;
        }
        const picked = cutAt(pickable, ms);
        if (picked) { onSelect({ kind: 'cut', startMs: picked.startMs, endMs: picked.endMs }); return; }
        if (lane === 'a1' && !locked) {
            const p = place(ms, e.altKey, keptAll, [0, totalMs], [0, totalMs], targets);
            setDrag({ kind: 'range', anchor: p.ms, ms: p.ms, guide: p.guide, x0: px, moved: false, targets });
            return;
        }
        clickV1(lane, ms);
    };

    // A click on V1 picks a cut there, or selects the section there (once there are splits) and jumps there.
    const clickV1 = (lane: string, ms: number) => {
        const picked = lane === 'v1' ? cutAt(pickable, ms) : undefined;
        if (picked) { onSelect({ kind: 'cut', startMs: picked.startMs, endMs: picked.endMs }); return; }
        const at = sectionAt(splits, ms, totalMs);
        onSelect(lane === 'v1' && splits.length ? { kind: 'section', startMs: at.startMs, endMs: at.endMs } : null);
        onSeek(ms);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const { px, py, ms, view } = pointAt(e);
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
                const end = !locked ? pieceEnd(view) : null;
                if (end) {
                    cursor = 'ew-resize';
                    const hidden = hiddenAt(axis.pieces[end.index], end.edge);
                    e.currentTarget.title = hidden
                        ? `${cutLabel(cuts, hidden.startMs, hidden.endMs)}. Drag the edge to bring it back or cut more (it stops between words unless Alt is held); click to choose it; double-click to bring it all back.`
                        : 'Drag the edge in to cut more (it stops between words unless Alt is held).';
                    e.currentTarget.style.cursor = cursor;
                    return;
                }
                if (!locked && ((lane === 'v1' && trimAt(ms)) || edgeAt(grabbable, ms, EDGE_PX / pxPerMs))) cursor = 'ew-resize';
                else if (lane === 'v1' && !locked && split?.onOrder && axis.sections.length > 1) cursor = 'grab';
                else if (!cutAt(pickable, ms) && lane === 'a1' && !locked) cursor = 'text';
            } else if (tool === 'blade') setBladeAt(null);
            e.currentTarget.style.cursor = cursor;
            e.currentTarget.title = lane === 'cc' ? captionAt(ms)?.text ?? '' : '';
            return;
        }
        if (drag.kind === 'scrub') onSeek(ms);
        else if (drag.kind === 'move') {
            const moved = drag.moved || Math.abs(px - drag.x0) >= CLICK_PX;
            if (moved) { e.currentTarget.style.cursor = 'grabbing'; setDrag({ ...drag, moved, viewMs: view }); }
        } else if (drag.kind === 'ripple') {
            // The edge moves as far as the pointer has (everything before it stays where it is), between words unless Alt.
            const moved = drag.moved || Math.abs(px - drag.x0) >= CLICK_PX;
            if (!moved) return;
            const p = place(drag.from + (px - drag.x0) / pxPerMs, e.altKey, words, drag.limits, drag.limits, drag.targets);
            if (!drag.moved || p.ms !== drag.ms || p.guide !== drag.guide) {
                setDrag({ ...drag, moved, ms: p.ms, guide: p.guide, draft: p.ms === drag.from ? drag.base : rippleTrim(drag.base, drag.piece, drag.edge, p.ms, totalMs) });
            }
        } else if (drag.kind === 'trim') {
            const p = place(ms, e.altKey, words, drag.limits, drag.limits, drag.targets);
            if (p.ms !== drag.ms || p.guide !== drag.guide) setDrag({ ...drag, ms: p.ms, guide: p.guide, draft: trimSection(drag.base, drag.section, drag.edge, p.ms) });
        } else if (drag.kind === 'edge') {
            const p = place(ms, e.altKey, drag.kept, drag.limits, drag.free, drag.targets);
            if (p.ms !== drag.ms || p.guide !== drag.guide) setDrag({ ...drag, ms: p.ms, guide: p.guide, draft: moveCutEdge(drag.base, drag.cut, drag.edge, p.ms) });
        } else {
            // Once sections move, a stretch is chosen within one section (the timeline shows them apart).
            const sec = axis.reordered ? sectionAt(splits, drag.anchor, totalMs) : { startMs: 0, endMs: totalMs };
            const p = place(Math.min(sec.endMs, Math.max(sec.startMs, ms)), e.altKey, keptAll, [sec.startMs, sec.endMs], [sec.startMs, sec.endMs], drag.targets);
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
        } else if (drag.kind === 'ripple') {
            if (drag.moved) {
                if (drag.ms !== drag.from) { onCuts(drag.draft); onSelect(null); }
            } else {
                const hidden = hiddenAt(drag.piece, drag.edge);
                if (hidden) onSelect({ kind: 'join', ...hidden });
                else clickV1(drag.lane, drag.srcMs);
            }
        } else if (drag.kind === 'move') {
            e.currentTarget.style.cursor = 'grab';
            if (!drag.moved) clickV1('v1', drag.srcMs);
            else {
                const to = dropPosition(axis, drag.from, drag.viewMs);
                const piece = axis.sections[drag.from];
                if (to !== drag.from) split?.onOrder?.(moveSection(axis.sections.map(sec => sec.section), axis.sections.length, drag.from, to));
                onSelect({ kind: 'section', startMs: piece.srcStart, endMs: piece.srcEnd });
            }
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
        const { py, ms, view } = pointAt(e);
        if (locked || (laneAt(py) !== 'v1' && laneAt(py) !== 'a1')) return;
        // Item E13: at a join, everything cut there comes back.
        const end = pieceEnd(view);
        if (end) {
            const p = axis.pieces[end.index];
            if (hiddenAt(p, end.edge)) { onCuts(rippleTrim(cuts, p, end.edge, end.edge === 'end' ? p.reachEnd : p.reachStart, totalMs)); onSelect(null); }
            return;
        }
        const picked = cutAt(pickable, ms);
        if (picked) { onCuts(cuts.filter(c => c !== picked)); onSelect(null); }
    };

    // The selection as drawn: the range being dragged, or the one chosen.
    const range = drag?.kind === 'range' && drag.moved ? rangeOf(drag.anchor, drag.ms, totalMs)
        : selection?.kind === 'range' ? selection : null;
    const shownCut = drag?.kind === 'edge' ? drag.draft[drag.base.indexOf(drag.cut)] : selectedCut;
    const guide = drag && drag.kind !== 'scrub' && drag.kind !== 'move' ? drag.guide : layerDrag?.moved ? layerDrag.guide : null;
    // Where a dragged section would land: its play position, and the line on the timeline where it goes in.
    const moving = drag?.kind === 'move' && drag.moved ? (() => {
        const to = dropPosition(axis, drag.from, drag.viewMs);
        const target = axis.sections[to];
        const lineMs = to <= drag.from ? target.viewStart : target.viewEnd;
        const piece = axis.sections[drag.from];
        return { to, lineMs, leftMs: drag.viewMs - drag.grabMs, lengthMs: piece.viewEnd - piece.viewStart, piece };
    })() : null;

    // The zoom slider runs from the whole recording to the closest, evenly in ratio.
    const span = Math.log(MAX_PX_PER_MS / fit);
    const slider = span > 0 ? Math.round(1000 * Math.log(pxPerMs / fit) / span) : 0;
    const reasonLabel = REASON_LABEL;
    // Item E13: what is cut at a join, chosen on the closed-up timeline; and bringing it all back, as dragging its edge
    // all the way out does (the kept stretch it hides beside, found again on the closed-up timeline).
    const joinSel = selection?.kind === 'join' ? selection : null;
    const bringBackJoin = (j: { startMs: number; endMs: number }) => {
        const atEnd = playAxis.pieces.find(p => p.srcEnd === j.startMs && p.reachEnd === j.endMs);
        const atStart = atEnd ? undefined : playAxis.pieces.find(p => p.srcStart === j.endMs && p.reachStart === j.startMs);
        if (atEnd) onCuts(rippleTrim(cuts, atEnd, 'end', atEnd.reachEnd, totalMs));
        else if (atStart) onCuts(rippleTrim(cuts, atStart, 'start', atStart.reachStart, totalMs));
        onSelect(null);
    };
    // Show cuts on or off, keeping the playhead where it is on screen (or a third of the way in).
    const toggleCuts = (on: boolean) => {
        const next = on ? sectionsAxis : playAxis;
        const t = timeOf(video);
        const nowX = (axis.toView(t) - startMs) * pxPerMs;
        const keepX = nowX >= 0 && nowX <= size.w ? nowX : size.w / 3;
        const nextFit = fitPxPerMs(next.lengthMs, size.w);
        setView(v => {
            const z = v.zoom === null ? nextFit : clampZoom(v.zoom, nextFit);
            return { zoom: v.zoom === null ? null : z, scrollPx: clampScroll(next.toView(t) * z - keepX, next.lengthMs, z, size.w) };
        });
        if (selection?.kind === 'cut' && !on) onSelect(null);
        setShowCuts(on);
    };
    // A dragged end of a kept stretch: how much it brings back (+) or cuts (−).
    const rippleBy = drag?.kind === 'ripple' && drag.moved ? (drag.edge === 'end' ? drag.ms - drag.from : drag.from - drag.ms) : null;

    return (
        <section aria-label="Timeline" className="h-full min-h-[210px] flex flex-col gap-1.5 rounded-lg bg-[#130b29] border border-white/5 p-2 select-none">
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
                <button onClick={() => setView({ zoom: null, scrollPx: 0 })} title={showCuts ? 'Show the whole recording' : 'Show the whole episode'} className={`${secondary} px-2 py-0.5 shrink-0`}>Fit</button>
                <span className="text-gray-400 w-10 shrink-0">{Math.round(pxPerMs / fit) >= 2 ? `${Math.round(pxPerMs / fit)}×` : 'whole'}</span>
                <label className="flex items-center gap-1 text-gray-300 shrink-0" title="Snap to the playhead, word edges, cuts and splits. Hold Alt while dragging to turn it off.">
                    <input type="checkbox" checked={snapOn} onChange={e => setSnapOn(e.target.checked)} className="accent-amber-400" /> Snap
                </label>
                <label className="flex items-center gap-1 text-gray-300 shrink-0"
                    title={showCuts ? 'Showing the whole recording, with what is cut hatched. Untick to see only what plays.' : 'Showing only what plays, with a marker where something is cut. Tick to see the whole recording, cuts and all.'}>
                    <input type="checkbox" checked={showCuts} onChange={e => toggleCuts(e.target.checked)} className="accent-amber-400" /> Show cuts
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
                {joinSel && (
                    <span className="flex items-center gap-2 pl-2 border-l border-white/10 min-w-0">
                        <span className="text-amber-200 truncate min-w-0">{cutLabel(cuts, joinSel.startMs, joinSel.endMs)}</span>
                        <button onClick={() => onHear(Math.max(0, joinSel.startMs - 2000), joinSel.endMs + 2000)} title="Play from 2 s before to 2 s after, what is cut included" className={`${secondary} px-2 py-0.5 shrink-0`}>▶ Hear</button>
                        <button onClick={() => bringBackJoin(joinSel)} disabled={locked} title="Bring all of it back (or double-click the marker)" className={`${secondary} px-2 py-0.5 shrink-0`}>Bring back</button>
                        <button onClick={() => onSelect(null)} aria-label="Clear the selection" title="Clear the selection (Esc)" className={`${secondary} px-2 py-0.5 shrink-0`}>×</button>
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
                {selectedLayerShown && selectedBounds && (
                    <span className="flex items-center gap-2 pl-2 border-l border-white/10 min-w-0">
                        <span className="text-amber-200 truncate min-w-0" title={placedName(selectedLayerShown)}>
                            {isSound(selectedLayerShown) ? (selectedLayerShown.track === SOUND_TRACK.music ? 'Music' : 'Effect') : layerKind(selectedLayerShown)} “{placedName(selectedLayerShown)}”
                            {' '}{preciseTime(selectedBounds.span.startMs)}–{preciseTime(selectedBounds.span.endMs)} in the edit ({((selectedBounds.span.endMs - selectedBounds.span.startMs) / 1000).toFixed(1)} s)
                        </span>
                        {(isSound(selectedLayerShown) ? onSounds : onLayers) && !layerDrag && (
                            <button onClick={() => {
                                if (isSound(selectedLayerShown)) onSounds?.(sounds.filter(s => s.id !== selectedLayerShown.id));
                                else onLayers?.(layers.filter(l => l.id !== selectedLayerShown.id));
                                onSelectLayer?.(null);
                            }}
                                title="Remove it (Delete)" className={`${secondary} px-2 py-0.5 shrink-0`}>Remove</button>
                        )}
                        <button onClick={() => onSelectLayer?.(null)} aria-label="Clear the selection" title="Clear the selection (Esc)" className={`${secondary} px-2 py-0.5 shrink-0`}>×</button>
                    </span>
                )}
                <span className="grow" />
                {split && <SplitButton split={split} video={video} totalMs={totalMs} disabled={locked} />}
            </div>

            {programme}

            <div className="flex flex-1 min-h-0">
                {/* Track headers. */}
                <div style={{ width: HEADER_W }} className="shrink-0 text-[11px] text-gray-300">
                    <div style={{ height: RULER_H }} />
                    <div style={{ height: LANE_H }} className="flex items-center gap-1 pr-2">
                        <span className="grow truncate" title="Text over the picture (the On screen panel)">V3 Text</span>
                    </div>
                    <div style={{ height: LANE_H }} className="flex items-center gap-1 pr-2">
                        <span className="grow truncate" title="Pictures and video over the episode (the Media and On screen panels)">V2 Pictures</span>
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
                    <div style={{ height: CC_H, marginTop: CC_TOP - V1_TOP - V1_H }} className="flex items-center gap-1 pr-2">
                        <span className="grow truncate" title="The YouTube caption track (the Captions panel): not burned in">CC Captions</span>
                        <button type="button" aria-pressed={captionsShown} onClick={() => onCaptionsShown?.(!captionsShown)}
                            aria-label={captionsShown ? 'Hide the captions on the preview' : 'Show the captions on the preview'}
                            title={captionsShown ? 'Shown on the preview (CC)' : 'Show on the preview (CC)'} className={iconButton}>
                            {captionsShown ? <Captions size={13} /> : <CaptionsOff size={13} />}
                        </button>
                    </div>
                    <div style={{ height: a1H, marginTop: A1_TOP - CC_TOP - CC_H }} className="flex items-start gap-1 pr-2 pt-1">
                        <span className="grow truncate">A1 Voice</span>
                        <button type="button" aria-pressed={muted}
                            onClick={() => toggleMuted(video.current)}
                            aria-label={muted ? 'Unmute the preview' : 'Mute the preview'} title={muted ? 'Muted in the preview' : 'Mute the preview'} className={iconButton}>
                            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                        </button>
                    </div>
                    {SOUND_LANES.map(track => {
                        const off = mutedTracks.includes(track);
                        const label = SOUND_TRACK_LABELS[track];
                        return (
                            <div key={track} style={{ height: LANE_H }} className="flex items-center gap-1 pr-2">
                                <span className="grow truncate" title={track === SOUND_TRACK.music ? 'Music beds (the Media panel)' : 'Effects and stingers (the Media panel)'}>{label}</span>
                                <button type="button" aria-pressed={off}
                                    onClick={() => onMutedTracks?.(off ? mutedTracks.filter(t => t !== track) : [...mutedTracks, track])}
                                    aria-label={off ? `Unmute ${label} in the preview` : `Mute ${label} in the preview`}
                                    title={off ? 'Muted in the preview (the render still has it)' : 'Mute in the preview'} className={iconButton}>
                                    {off ? <VolumeX size={13} /> : <Volume2 size={13} />}
                                </button>
                            </div>
                        );
                    })}
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
                    <div style={{ width: contentW, height: A1_TOP + a1H + soundsH }} className="relative">
                        <div className="sticky left-0 top-0" style={{ width: size.w, height: A1_TOP + a1H + soundsH }}>
                            <canvas ref={canvasRef} className="absolute inset-0" style={{ width: size.w, height: A1_TOP + a1H }} />
                            <div
                                ref={lanesRef}
                                role="application"
                                aria-label={showCuts
                                    ? "Timeline lanes: click to jump there, drag on the waveform to select a stretch of time, drag a cut's edge to trim it, double-click a cut to bring it back"
                                    : 'Timeline lanes, only what plays: click to jump there, drag on the waveform to select a stretch of time, drag the end of a clip out to bring back what was cut there or in to cut more, double-click a marker to bring back what was cut there'}
                                className="absolute inset-0 touch-none"
                                onPointerDown={onPointerDown}
                                onPointerMove={onPointerMove}
                                onPointerUp={onPointerUp}
                                onPointerCancel={() => setDrag(null)}
                                onDoubleClick={onDoubleClick}
                                onDragOver={e => { if (onDropMedia && e.dataTransfer.types.includes(BIN_DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
                                onDrop={e => {
                                    const id = e.dataTransfer.getData(BIN_DRAG_TYPE);
                                    if (!id || !onDropMedia) return;
                                    e.preventDefault();
                                    onDropMedia(id, pointAt(e).ms);
                                }}
                            >
                                {/* What the transitions overlap: the end of one part and the start of the next. */}
                                {overlaps.filter(o => shown(o.fromMs, o.toMs)).map(o => (
                                    <div key={`${o.fromMs}-${o.toMs}`} aria-hidden className="absolute pointer-events-none bg-amber-300/15 border-x border-amber-300/40"
                                        style={{ left: xs(o.fromMs), width: Math.max(1, spanPx(o.fromMs, o.toMs)), top: V1_TOP, bottom: 0 }} />
                                ))}

                                {/* Each split's transition: click to choose one in the Transitions panel. */}
                                {onJoin && transitions.filter(t => shown(t.splitMs, t.splitMs)).map(t => (
                                    <button
                                        key={t.splitMs}
                                        type="button"
                                        aria-label={`Transition at ${tickLabel(t.splitMs)}: ${t.label ?? 'straight cut'}`}
                                        title={`${t.label ? `${t.label}${t.playing ? '' : ' (no room: plays as a straight cut)'}` : 'Straight cut'}. Click to choose the transition.`}
                                        onPointerDown={e => e.stopPropagation()}
                                        onClick={() => onJoin(t.splitMs)}
                                        className={`absolute w-4 h-4 rounded-full text-[10px] leading-4 text-center ${t.label
                                            ? t.playing ? 'bg-amber-400 text-black' : 'bg-amber-900 text-amber-200 ring-1 ring-amber-400'
                                            : 'bg-[#0b0619] text-gray-300 ring-1 ring-white/40 hover:ring-amber-300'}`}
                                        style={{ left: xs(t.splitMs) - 8, top: V1_TOP + 2 }}
                                    >⧓</button>
                                ))}

                                {/* The selected section. */}
                                {selectedSection && (() => {
                                    const sec = axis.sections.find(v => v.srcStart === selectedSection.startMs && v.srcEnd === selectedSection.endMs);
                                    return sec && (
                                        <div aria-hidden className="absolute pointer-events-none rounded-sm ring-2 ring-amber-300/80 bg-amber-300/5"
                                            style={{ left: x(sec.viewStart) - (sec.viewEnd > sec.viewStart ? 0 : 3), width: Math.max(6, (sec.viewEnd - sec.viewStart) * pxPerMs), top: V1_TOP, bottom: 1 }} />
                                    );
                                })()}

                                {/* Item E13: a section cut whole has nothing on the closed-up timeline: a marker where it would play. */}
                                {axis.collapsed && axis.sections.filter(sec => sec.viewEnd <= sec.viewStart && sec.viewStart >= startMs && sec.viewStart <= endMs).map(sec => (
                                    <button
                                        key={`cut-${sec.section}`}
                                        type="button"
                                        aria-label={`Section ${tickLabel(sec.srcStart)}–${tickLabel(sec.srcEnd)} is cut whole: choose it`}
                                        title={`Section ${preciseTime(sec.srcStart)}–${preciseTime(sec.srcEnd)} is cut whole. Click to choose it, then Bring back.`}
                                        onPointerDown={e => e.stopPropagation()}
                                        onClick={() => onSelect({ kind: 'section', startMs: sec.srcStart, endMs: sec.srcEnd })}
                                        className="absolute h-4 px-1 rounded-sm text-[9px] leading-4 bg-red-500/90 text-white hover:bg-red-400"
                                        style={{ left: x(sec.viewStart) - 8, top: V1_TOP + THUMB_H - 18 }}
                                    >✂</button>
                                ))}

                                {/* V3 and V2: the layers. Click to select; drag to move; drag an end to trim. */}
                                {shownLayers.map(l => {
                                    const b = layerBounds(l, clips, editedMs);
                                    if (!b || !shown(b.fromMs, b.toMs)) return null;
                                    // A picture on a higher track (the logo bug, item E6) is a thin strip along the top of V2, so a
                                    // whole-episode logo never covers the b-roll under it.
                                    const thin = l.kind !== 'text' && l.track >= TRACK.logo;
                                    const [top, height] = l.kind === 'text' ? [V3_TOP + 3, LANE_H - 6] : thin ? [V2_TOP + 1, 4] : [V2_TOP + 6, LANE_H - 8];
                                    const isSel = l.id === selectedLayer;
                                    const color = l.kind === 'text' ? 'bg-violet-400/80' : l.kind === 'video' ? 'bg-emerald-400/80' : 'bg-sky-400/80';
                                    const handles = { onPointerMove: onLayerMove, onPointerUp: onLayerUp, onPointerCancel: () => setLayerDrag(null) };
                                    return (
                                        <div
                                            key={l.id}
                                            role="button"
                                            tabIndex={-1}
                                            aria-label={`${layerKind(l)}: ${layerName(l)} at ${tickLabel(b.fromMs)}`}
                                            title={`${layerName(l)}: drag to move, drag an end to trim`}
                                            onPointerDown={e => onLayerDown(e, l, 'move')}
                                            {...handles}
                                            className={`absolute rounded-sm ${color} ${overlaysHidden ? 'opacity-30' : ''} ${isSel ? 'ring-2 ring-white' : ''} ${onLayers ? 'cursor-grab' : 'cursor-pointer'} overflow-hidden`}
                                            style={{ left: xs(b.fromMs), width: Math.max(4, wide(b.fromMs, b.toMs)), top, height }}
                                        >
                                            {!thin && <span className="pointer-events-none px-1 text-[9px] leading-[12px] text-black/80 whitespace-nowrap">{layerName(l)}</span>}
                                            {onLayers && (b.toMs - b.fromMs) * pxPerMs >= 14 && (['start', 'end'] as const).map(edge => (
                                                <span key={edge} role="presentation" onPointerDown={e => onLayerDown(e, l, edge)} {...handles}
                                                    className={`absolute top-0 bottom-0 w-1.5 cursor-ew-resize ${isSel ? 'bg-white' : 'hover:bg-white/70'}`}
                                                    style={{ [edge === 'start' ? 'left' : 'right']: 0 }} />
                                            ))}
                                        </div>
                                    );
                                })}

                                {/* A2 and A3: music and effects (item E7). Click to select; drag to move; drag an end to trim. */}
                                {SOUND_LANES.map((track, i) => (
                                    <div key={track} aria-hidden className={`absolute left-0 right-0 pointer-events-none ${i % 2 ? 'bg-white/[0.02]' : 'bg-white/[0.04]'} border-t border-white/5`}
                                        style={{ top: soundTop(track), height: LANE_H }} />
                                ))}
                                {shownSounds.map(s => {
                                    const b = layerBounds(s, clips, editedMs);
                                    if (!b || !shown(b.fromMs, b.toMs)) return null;
                                    const isSel = s.id === selectedLayer;
                                    const handles = { onPointerMove: onLayerMove, onPointerUp: onLayerUp, onPointerCancel: () => setLayerDrag(null) };
                                    const muted = mutedTracks.includes(s.track);
                                    return (
                                        <div
                                            key={s.id}
                                            role="button"
                                            tabIndex={-1}
                                            aria-label={`${s.track === SOUND_TRACK.music ? 'Music' : 'Effect'}: ${s.media.name} at ${tickLabel(b.fromMs)}`}
                                            title={`${s.media.name}${s.duck ? ' (ducked under the voice)' : ''}: drag to move, drag an end to trim`}
                                            onPointerDown={e => onLayerDown(e, s, 'move')}
                                            {...handles}
                                            className={`absolute rounded-sm ${s.track === SOUND_TRACK.music ? 'bg-rose-400/80' : 'bg-orange-300/80'} ${muted ? 'opacity-30' : ''} ${isSel ? 'ring-2 ring-white' : ''} ${onSounds ? 'cursor-grab' : 'cursor-pointer'} overflow-hidden`}
                                            style={{ left: xs(b.fromMs), width: Math.max(4, wide(b.fromMs, b.toMs)), top: soundTop(s.track) + 3, height: LANE_H - 6 }}
                                        >
                                            <span className="pointer-events-none px-1 text-[9px] leading-[14px] text-black/80 whitespace-nowrap">{s.duck ? '↓ ' : ''}{s.media.name}</span>
                                            {onSounds && (b.toMs - b.fromMs) * pxPerMs >= 14 && (['start', 'end'] as const).map(edge => (
                                                <span key={edge} role="presentation" onPointerDown={e => onLayerDown(e, s, edge)} {...handles}
                                                    className={`absolute top-0 bottom-0 w-1.5 cursor-ew-resize ${isSel ? 'bg-white' : 'hover:bg-white/70'}`}
                                                    style={{ [edge === 'start' ? 'left' : 'right']: 0 }} />
                                            ))}
                                        </div>
                                    );
                                })}

                                {/* Splits: a handle on the ruler removes one (not while locked). */}
                                {!locked && splits.filter(s => shown(s, s)).map(s => (
                                    <button
                                        key={s}
                                        type="button"
                                        aria-label={`Remove the split at ${tickLabel(s)}`}
                                        title={`Split at ${tickLabel(s)}: click to remove it`}
                                        onPointerDown={e => e.stopPropagation()}
                                        onClick={() => split?.onRemoveSplit(s)}
                                        className="absolute w-3 h-3 rounded-full bg-white text-[8px] leading-3 text-black"
                                        style={{ left: xs(s) - 6, top: RULER_H - 13 }}
                                    >×</button>
                                ))}

                                {/* Where the Blade would split. */}
                                {tool === 'blade' && bladeAt !== null && !drag && (
                                    <div aria-hidden className="absolute pointer-events-none w-px bg-amber-300" style={{ left: xs(bladeAt), top: RULER_H, bottom: 0 }}>
                                        <span className="absolute -top-0 left-1 rounded bg-black/80 px-1 text-[10px] text-amber-200 whitespace-nowrap">✂ {preciseTime(bladeAt)}</span>
                                    </div>
                                )}

                                {/* The chosen stretch of time. */}
                                {range && (
                                    <div aria-hidden className="absolute pointer-events-none bg-white/15 border-x border-white/80"
                                        style={{ left: xs(range.startMs), width: Math.max(1, spanPx(range.startMs, range.endMs)), top: RULER_H, bottom: 0 }} />
                                )}

                                {/* The chosen cut, with its edges marked: drag them to trim it. */}
                                {shownCut && (
                                    <div aria-hidden className="absolute pointer-events-none rounded-sm ring-2 ring-white/85"
                                        style={{ left: xs(shownCut.startMs), width: Math.max(2, spanPx(shownCut.startMs, shownCut.endMs)), top: V1_TOP, bottom: 1 }}>
                                        {!locked && <>
                                            <span className="absolute -left-[3px] top-1/2 -translate-y-1/2 w-1.5 h-6 rounded bg-white" />
                                            <span className="absolute -right-[3px] top-1/2 -translate-y-1/2 w-1.5 h-6 rounded bg-white" />
                                        </>}
                                    </div>
                                )}

                                {/* Item E13: what is cut at the chosen join; on the closed-up timeline, the marker there. */}
                                {joinSel && shown(joinSel.startMs, joinSel.endMs) && (
                                    <div aria-hidden className="absolute pointer-events-none rounded-sm ring-2 ring-white/85"
                                        style={axis.collapsed
                                            ? { left: xs(joinSel.startMs) - 4, width: 8, top: V1_TOP - 2, bottom: 1 }
                                            : { left: xs(joinSel.startMs), width: Math.max(2, spanPx(joinSel.startMs, joinSel.endMs)), top: V1_TOP, bottom: 1 }} />
                                )}

                                {/* Item E13: the end of a kept stretch being dragged, where it is now. */}
                                {drag?.kind === 'ripple' && drag.moved && (
                                    <div aria-hidden className="absolute pointer-events-none w-0.5 bg-white" style={{ left: xs(drag.ms) - 1, top: V1_TOP, bottom: 0 }} />
                                )}

                                {/* Where a drag snapped, and the time it is at. */}
                                {guide !== null && (
                                    <div aria-hidden className="absolute top-0 bottom-0 w-px bg-amber-300 pointer-events-none" style={{ left: xs(guide) }} />
                                )}
                                {drag && drag.kind !== 'scrub' && drag.kind !== 'move' && (drag.kind !== 'ripple' || drag.moved) && (
                                    <span className="absolute pointer-events-none rounded bg-black/80 px-1 text-[10px] text-amber-200 whitespace-nowrap"
                                        style={{ left: Math.min(size.w - (rippleBy === null ? 70 : 100), Math.max(0, xs(drag.ms) + 6)), top: A1_TOP + 2 }}>
                                        {rippleBy === null ? preciseTime(drag.ms)
                                            : rippleBy === 0 ? 'as it was' : `${rippleBy > 0 ? '+' : '−'}${(Math.abs(rippleBy) / 1000).toFixed(2)} s ${rippleBy > 0 ? 'back' : 'cut'}`}
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

                                {/* A section being dragged (item E11): where it would go in, and the section under the pointer. */}
                                {moving && <>
                                    <div aria-hidden className="absolute pointer-events-none w-0.5 bg-amber-300" style={{ left: x(moving.lineMs) - 1, top: RULER_H, bottom: 0 }} />
                                    <div aria-hidden className="absolute pointer-events-none rounded-sm ring-2 ring-amber-300 bg-amber-300/20"
                                        style={{ left: x(moving.leftMs), width: Math.max(6, moving.lengthMs * pxPerMs), top: V1_TOP, height: V1_H }} />
                                    <span aria-hidden className="absolute pointer-events-none rounded bg-black/80 px-1 text-[10px] text-amber-200 whitespace-nowrap"
                                        style={{ left: Math.min(size.w - 230, Math.max(0, x(moving.leftMs))), top: V2_TOP + 2 }}>
                                        Section {preciseTime(moving.piece.srcStart)}–{preciseTime(moving.piece.srcEnd)} → place {moving.to + 1} of {axis.sections.length}
                                    </span>
                                </>}

                                <Playhead video={video} startMs={startMs} pxPerMs={pxPerMs} width={size.w} onFollow={onFollow} toView={axis.toView} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
