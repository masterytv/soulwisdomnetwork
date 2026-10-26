"use client";

// Why: the highlight preview (docs/specs/021-motion-graphics.md, item M3). While the playhead is inside a
// highlight's span, the preview reframes the actual <video> element with the very keyframes the render's
// expressions read (lib/reframe.ts: boxAt → boxStyle through the shared easing table), shows the template's
// 'background' plane behind it and plays its 'graphics' plane (the words) over it — the same HTML the
// render draws, in the sandboxed iframes GraphicsPreview uses. The window's shape is approximated here as
// a CSS clip-path on the video, computed in the picture's own coordinates so the window stays put on
// screen while the picture moves; the template's matte clip is the render's truth, so a corner radius or
// an edge can differ by a hair in the preview. The highlight runs on the edited episode's clock: during
// teasers, the intro or the outro nothing shows.
//
// Mounted twice in the editor's preview stack: plane 'background' just before the <video> (the video is
// given position relative while a highlight is up, so it paints above this backdrop), plane 'graphics'
// after it (and before the b-roll layers, which hide a highlight in the render too).

import { useEffect, useMemo, useRef } from 'react';
import { timelineTime, type Clip } from '@/lib/sequence';
import { layerSpan, type HighlightLayer, type Layer } from '@/lib/layers';
import { graphicSrcDoc, highlightTemplate, type GraphicColors } from '@/lib/graphics';
import { boxAt, boxStyle, easeSegments, HIGHLIGHT_KEYFRAMES, progressAt, type Box, type HighlightLayout } from '@/lib/reframe';
import { FRAME } from '@/lib/onScreen';
import { useFrameTime } from '@/components/studio/layers';
import { GraphicFrame, useGraphicTemplates, useStageScale } from '@/components/studio/graphics';

// Each layout's window at the hold, in render pixels: the preview's stand-in for the template's matte.
// 'over' and 'push' never clip the picture ('push' slides off the frame's own edge); 'iris' is the oval
// closing to a point. The window eases from the full frame by the same progress as the picture.
const WINDOWS: Record<HighlightLayout, { x: number; y: number; w: number; h: number; r: number } | 'iris' | null> = {
    splitQuote: { x: 110, y: 140, w: 860, h: 800, r: 20 },
    splitWord: { x: 950, y: 140, w: 860, h: 800, r: 20 },
    below: { x: 230.4, y: 40, w: 1459.2, h: 820.8, r: 21 },
    over: null,
    iris: 'iris',
    push: null,
};
// The open iris just covers the frame's corners; it closes to a point over the in part.
const IRIS_RX = 1360, IRIS_RY = 765;
// Which layouts have a backdrop behind the picture (HIGHLIGHT_PLANES, kept browser-safe here: 'over'
// never uncovers the frame).
const HAS_BACKGROUND: Record<HighlightLayout, boolean> = {
    splitQuote: true, splitWord: true, below: true, over: false, iris: true, push: true,
};

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

// The video element's clip for this moment, in its own (pre-transform) coordinates: the screen-space
// window, eased from the full frame by `p`, mapped back through the picture's translate and scale.
function videoClip(layout: HighlightLayout, b: Box, p: number): string {
    const w = WINDOWS[layout];
    if (!w) return '';
    if (w === 'iris') {
        // The iris never moves the picture, so screen space is the picture's own.
        const rx = IRIS_RX * (1 - p), ry = IRIS_RY * (1 - p);
        return `ellipse(${(rx / FRAME.width * 100).toFixed(3)}% ${(ry / FRAME.height * 100).toFixed(3)}% at 50% 50%)`;
    }
    const left = lerp(0, w.x, p), top = lerp(0, w.y, p);
    const right = lerp(FRAME.width, w.x + w.w, p), bottom = lerp(FRAME.height, w.y + w.h, p);
    const pct = (v: number, of: number) => `${Math.max(0, v / of * 100).toFixed(3)}%`;
    return `inset(${pct((top - b.y) / b.scale, FRAME.height)} ${pct(FRAME.width - (right - b.x) / b.scale, FRAME.width)} `
        + `${pct(FRAME.height - (bottom - b.y) / b.scale, FRAME.height)} ${pct((left - b.x) / b.scale, FRAME.width)} round ${(w.r * p).toFixed(1)}px)`;
}

// The highlight the playhead is inside, and how far into it, on the edited episode's clock.
function activeHighlight(layers: Layer[], clips: Clip[], editedMs: number, srcMs: number): { h: HighlightLayer; ms: number } | null {
    const now = timelineTime(clips, srcMs, true) ?? editedMs;
    for (const l of layers) {
        if (l.kind !== 'highlight') continue;
        const span = layerSpan(l, clips, editedMs);
        if (span && now >= span.startMs && now < span.endMs) return { h: l, ms: now - span.startMs };
    }
    return null;
}

export function HighlightReframe({ plane, layers, clips, editedMs, video, colors }: {
    plane: 'background' | 'graphics';
    layers: Layer[];
    clips: Clip[];
    editedMs: number;
    video: React.RefObject<HTMLVideoElement | null>;
    colors: GraphicColors;
}) {
    const highlights = layers.filter((l): l is HighlightLayer => l.kind === 'highlight');
    const html = useGraphicTemplates(highlights.map(h => highlightTemplate(h.layout)));
    const stage = useRef<HTMLDivElement>(null);
    const scale = useStageScale(stage);
    const { ms: srcMs } = useFrameTime(video);
    const table = useMemo(() => easeSegments(), []);
    const active = activeHighlight(highlights, clips, editedMs, srcMs);

    // One writer styles the video: the 'graphics' instance, which is mounted whenever the other is.
    const activeId = active?.h.id ?? null, activeMs = active?.ms ?? 0;
    useEffect(() => {
        if (plane !== 'graphics') return;
        const el = video.current;
        if (!el) return;
        const clear = () => { el.style.transform = ''; el.style.transformOrigin = ''; el.style.filter = ''; el.style.clipPath = ''; el.style.position = ''; };
        const h = highlights.find(x => x.id === activeId);
        if (!h) { clear(); return; }
        const k = HIGHLIGHT_KEYFRAMES[h.layout];
        const b = boxAt(k, activeMs, h.durationMs, table);
        const p = progressAt(k, activeMs, h.durationMs, table);
        const css = boxStyle(b);
        el.style.transform = css.transform;
        el.style.transformOrigin = css.transformOrigin;
        el.style.filter = css.filter;
        el.style.clipPath = videoClip(h.layout, b, p);
        el.style.position = 'relative';          // paints above the backdrop mounted before it
        // eslint-disable-next-line react-hooks/exhaustive-deps -- highlights is derived from layers each render
    }, [plane, video, activeId, activeMs, table, layers]);
    // Leaving the editor (or hiding overlays) must not leave the video reframed.
    useEffect(() => {
        if (plane !== 'graphics') return;
        const el = video.current;
        return () => {
            if (!el) return;
            el.style.transform = ''; el.style.transformOrigin = ''; el.style.filter = ''; el.style.clipPath = ''; el.style.position = '';
        };
    }, [plane, video]);

    if (!active) return null;
    if (plane === 'background' && !HAS_BACKGROUND[active.h.layout]) return null;
    const doc = html[highlightTemplate(active.h.layout)];
    if (!doc) return null;
    const data = {
        fields: { words: active.h.words, emphasis: active.h.emphasis, speaker: active.h.speaker },
        colors, durationMs: active.h.durationMs, width: FRAME.width, height: FRAME.height, logo: null, mode: plane,
    };
    return (
        <div ref={stage} aria-label={plane === 'background' ? 'Highlight backdrop' : 'Highlight'}
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
            {scale > 0 && <GraphicFrame key={`${active.h.id}-${plane}`} doc={graphicSrcDoc(doc, data)} ms={active.ms} opacity={1} scale={scale} />}
        </div>
    );
}
