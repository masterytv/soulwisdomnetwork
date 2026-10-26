"use client";

// Why: the motion graphics over the preview (docs/specs/021-motion-graphics.md, item M1). Each graphic
// layer plays as the very HTML template the render draws, in a sandboxed iframe over the video, sized to
// the frame and scaled with it. The template comes from /api/studio/graphics/[template] (fonts and runtime
// inlined), with window.GRAPHIC written into the document before its script runs (lib/graphics.ts), and is
// seeked to the video's time by posting {t:'seek', ms} — driven from the video element itself
// (useFrameTime), never from state the whole editor rerenders on (docs/PLANNING.md). Clicks pass through
// to the video; a graphic is selected on the timeline or in the On screen list.

import { useEffect, useRef, useState } from 'react';
import { timelineTime, type Clip } from '@/lib/sequence';
import { layerSpan, lookAt, type GraphicLayer, type Layer } from '@/lib/layers';
import { graphicSrcDoc, type GraphicColors, type GraphicTemplate } from '@/lib/graphics';
import { FRAME } from '@/lib/onScreen';
import { useFrameTime } from '@/components/studio/layers';
import { studioFetch } from '@/lib/studioClient';

// One template's iframe, seeked to its own time (ms into the graphic) whenever the video moves.
function GraphicFrame({ doc, ms, opacity, scale }: { doc: string; ms: number; opacity: number; scale: number }) {
    const frame = useRef<HTMLIFrameElement>(null);
    const at = useRef(0);
    useEffect(() => {
        at.current = ms;
        frame.current?.contentWindow?.postMessage({ t: 'seek', ms }, '*');
    }, [ms]);
    // A seek posted before the iframe finished loading is lost; the load answers with the latest one.
    const post = () => frame.current?.contentWindow?.postMessage({ t: 'seek', ms: at.current }, '*');
    return (
        <iframe
            ref={frame}
            sandbox="allow-scripts"
            srcDoc={doc}
            onLoad={post}
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none absolute left-0 top-0 border-0"
            style={{ width: FRAME.width, height: FRAME.height, transform: `scale(${scale})`, transformOrigin: 'top left', opacity }}
        />
    );
}

export function GraphicsPreview({ layers, clips, editedMs, video, colors }: {
    layers: Layer[];
    clips: Clip[];                   // the play order (lib/sequence.ts), to find the edited time
    editedMs: number;
    video: React.RefObject<HTMLVideoElement | null>;
    colors: GraphicColors;           // the Studio's colours, as the render reads them
}) {
    const graphics = layers.filter((l): l is GraphicLayer => l.kind === 'graphic');
    const templates = [...new Set(graphics.map(g => g.template))];
    const [html, setHtml] = useState<Partial<Record<GraphicTemplate, string>>>({});
    const stage = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0);
    const { ms: srcMs } = useFrameTime(video);

    // Each template's page, fetched once and kept for the session.
    const wanted = templates.filter(t => !html[t]).join(',');
    useEffect(() => {
        if (!wanted) return;
        let gone = false;
        for (const t of wanted.split(',') as GraphicTemplate[]) {
            studioFetch<{ html: string }>(`/api/studio/graphics/${t}`)
                .then(r => { if (!gone) setHtml(h => ({ ...h, [t]: r.html })); })
                .catch(() => {});
        }
        return () => { gone = true; };
    }, [wanted]);

    // The iframe is the render's 1920 × 1080, scaled to however wide the preview is drawn.
    useEffect(() => {
        const el = stage.current;
        if (!el) return;
        const measure = () => setScale(el.getBoundingClientRect().width / FRAME.width);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    if (!graphics.length) return null;
    const nowMs = timelineTime(clips, srcMs, true) ?? editedMs;

    return (
        <div ref={stage} aria-label="Motion graphics" className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
            {scale > 0 && graphics.map(g => {
                const doc = html[g.template];
                const span = layerSpan(g, clips, editedMs);
                const look = span ? lookAt(g, span, nowMs) : null;
                if (!doc || !span || !look) return null;
                const data = { fields: g.fields, colors, durationMs: span.endMs - span.startMs, width: FRAME.width, height: FRAME.height };
                return <GraphicFrame key={g.id} doc={graphicSrcDoc(doc, data)} ms={nowMs - span.startMs} opacity={look.opacity} scale={scale} />;
            })}
        </div>
    );
}
