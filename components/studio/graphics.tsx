"use client";

// Why: the motion graphics over the preview (docs/specs/021-motion-graphics.md). Each graphic plays as
// the very HTML template the render draws, in a sandboxed iframe sized to the frame and scaled with it.
// The template comes from /api/studio/graphics/[template] (fonts and runtime inlined), with
// window.GRAPHIC written into the document before its script runs (lib/graphics.ts), and is seeked by
// posting {t:'seek', ms} — driven from the video element itself (useFrameTime), never from state the
// whole editor rerenders on (docs/PLANNING.md). Clicks pass through; a graphic is selected on the
// timeline or in the On screen list. GraphicsPreview draws the episode-anchored graphics over the main
// video; ProgrammeGraphics follows the programme's own clock (components/studio/programme.tsx) for the
// end screen over the outro, the motion "In this episode" tag over each teaser, and the starlight
// transition's clip centred on its join — the same clips the render lays over the finished video.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { timelineTime, type Clip } from '@/lib/sequence';
import { layerSpan, lookAt, type GraphicLayer, type Layer } from '@/lib/layers';
import { episodeAnchored, graphicSrcDoc, programmeWindow, type GraphicColors, type GraphicTemplate } from '@/lib/graphics';
import { FRAME } from '@/lib/onScreen';
import { useFrameTime } from '@/components/studio/layers';
import type { ProgrammeView } from '@/components/studio/programme';
import { studioFetch } from '@/lib/studioClient';

// Each template's page, fetched once and kept for the session.
export function useGraphicTemplates(wanted: GraphicTemplate[]): Partial<Record<GraphicTemplate, string>> {
    const [html, setHtml] = useState<Partial<Record<GraphicTemplate, string>>>({});
    const missing = [...new Set(wanted)].filter(t => !html[t]).sort().join(',');
    useEffect(() => {
        if (!missing) return;
        let gone = false;
        for (const t of missing.split(',') as GraphicTemplate[]) {
            studioFetch<{ html: string }>(`/api/studio/graphics/${t}`)
                .then(r => { if (!gone) setHtml(h => (h[t] ? h : { ...h, [t]: r.html })); })
                .catch(() => {});
        }
        return () => { gone = true; };
    }, [missing]);
    return html;
}

// The iframe is the render's 1920 × 1080, scaled to however wide the stage is drawn.
function useStageScale(stage: React.RefObject<HTMLDivElement | null>): number {
    const [scale, setScale] = useState(0);
    useEffect(() => {
        const el = stage.current;
        if (!el) return;
        const measure = () => setScale(el.getBoundingClientRect().width / FRAME.width);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [stage]);
    return scale;
}

// One template's iframe, seeked to its own time (ms into the graphic) whenever the clock moves.
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

// The episode-anchored graphics, over the main video on the edited episode's clock.
export function GraphicsPreview({ layers, clips, editedMs, video, colors, logo }: {
    layers: Layer[];
    clips: Clip[];                   // the play order (lib/sequence.ts), to find the edited time
    editedMs: number;
    video: React.RefObject<HTMLVideoElement | null>;
    colors: GraphicColors;           // the Studio's colours, as the render reads them
    logo: string | null;             // the Studio's logo (or the site's), for templates that draw it
}) {
    const graphics = layers.filter((l): l is GraphicLayer => l.kind === 'graphic' && episodeAnchored(l.anchor));
    const html = useGraphicTemplates(graphics.map(g => g.template));
    const stage = useRef<HTMLDivElement>(null);
    const scale = useStageScale(stage);
    const { ms: srcMs } = useFrameTime(video);

    if (!graphics.length) return null;
    const nowMs = timelineTime(clips, srcMs, true) ?? editedMs;

    return (
        <div ref={stage} aria-label="Motion graphics" className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
            {scale > 0 && graphics.map(g => {
                const doc = html[g.template];
                const span = layerSpan(g, clips, editedMs);
                const look = span ? lookAt(g, span, nowMs) : null;
                if (!doc || !span || !look) return null;
                const data = { fields: g.fields, colors, durationMs: span.endMs - span.startMs, width: FRAME.width, height: FRAME.height, logo };
                return <GraphicFrame key={g.id} doc={graphicSrcDoc(doc, data)} ms={nowMs - span.startMs} opacity={look.opacity} scale={scale} />;
            })}
        </div>
    );
}

// The piece the programme player shows and how far into it it is, followed frame by frame while one plays.
function usePieceTime(prog: ProgrammeView): { piece: number | null; pieceMs: number } {
    const piece = useSyncExternalStore(prog.control.subscribe, prog.control.get, () => null);
    const [pieceMs, setPieceMs] = useState(0);
    useEffect(() => {
        if (piece === null) return;
        let raf = 0;
        const tick = () => {
            const pos = prog.control.position();
            if (pos) setPieceMs(pos.ms);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [piece, prog.control]);
    return { piece, pieceMs };
}

// The graphics on the programme's own clock, over the whole preview (the programme player included):
// the end screen `fromEnd` ms before the programme's end (over the outro, or the episode's tail with
// none), the motion teaser tag while a tagged teaser plays, and each starlight clip centred on its join
// (`starlights`: the edit's splits, on the edited episode's clock; section joins come from the
// programme's pieces). Pointer events pass through to the player's controls beneath.
export function ProgrammeGraphics({ layers, prog, video, clips, editedMs, colors, logo, starlights }: {
    layers: Layer[];
    prog: ProgrammeView;
    video: React.RefObject<HTMLVideoElement | null>;
    clips: Clip[];
    editedMs: number;
    colors: GraphicColors;
    logo: string | null;
    starlights: { atMs: number; durationMs: number }[];   // at splits, on the edited episode's clock
}) {
    const ending = layers.filter((l): l is GraphicLayer => l.kind === 'graphic' && !episodeAnchored(l.anchor));
    const shownPiece = usePieceTime(prog);
    const stage = useRef<HTMLDivElement>(null);
    const scale = useStageScale(stage);
    const { ms: srcMs } = useFrameTime(video);

    const piece = shownPiece.piece !== null ? prog.pieces[shownPiece.piece] : null;
    const teaser = piece && piece.kind === 'teaser' && piece.tag !== false ? piece : null;
    // Section joins whose transition is starlight: centred on that piece's first programme frame.
    const sectionStars = prog.pieces.filter(p => p.transition === 'starlight' && p.joinMs === 0 && p.atMs > 0);
    const html = useGraphicTemplates([
        ...ending.map(g => g.template),
        ...(prog.teasers.length ? ['teaserTag' as const] : []),
        ...(starlights.length || sectionStars.length ? ['starlight' as const] : []),
    ]);
    if (!ending.length && !teaser && !starlights.length && !sectionStars.length) return null;

    // The programme's clock: the piece the player shows, or the episode under the main video.
    const episodeNow = timelineTime(clips, srcMs, true) ?? editedMs;
    const programmeMs = piece ? piece.atMs + shownPiece.pieceMs : prog.programme.episodeAtMs + episodeNow;
    const data = (fields: Record<string, string>, durationMs: number) =>
        ({ fields, colors, durationMs, width: FRAME.width, height: FRAME.height, logo });

    return (
        <div ref={stage} aria-label="Programme graphics" className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-lg">
            {scale > 0 && ending.map(g => {
                const doc = html[g.template];
                const span = programmeWindow(g, prog.programme.lengthMs);
                if (!doc || !span || programmeMs < span.startMs || programmeMs >= span.endMs) return null;
                return <GraphicFrame key={g.id} doc={graphicSrcDoc(doc, data(g.fields, span.endMs - span.startMs))}
                    ms={programmeMs - span.startMs} opacity={g.opacity} scale={scale} />;
            })}
            {scale > 0 && teaser && html.teaserTag && (
                <GraphicFrame key={`tag-${shownPiece.piece}`} doc={graphicSrcDoc(html.teaserTag, data({ speaker: teaser.speaker ?? '' }, teaser.lengthMs))}
                    ms={shownPiece.pieceMs} opacity={1} scale={scale} />
            )}
            {scale > 0 && html.starlight && starlights.map((s, i) => {
                // Over the edited episode (the main video), centred on the cut at the split.
                const from = s.atMs - s.durationMs / 2;
                if (piece || episodeNow < from || episodeNow >= from + s.durationMs) return null;
                return <GraphicFrame key={`star-${i}`} doc={graphicSrcDoc(html.starlight!, data({}, s.durationMs))}
                    ms={episodeNow - from} opacity={1} scale={scale} />;
            })}
            {scale > 0 && html.starlight && sectionStars.map((p, i) => {
                // The join's own length once lib/programme.ts carries it on the piece; the default until then.
                const durationMs = (p as { starlightMs?: number }).starlightMs ?? 1000;
                const from = p.atMs - durationMs / 2;
                if (programmeMs < from || programmeMs >= from + durationMs) return null;
                return <GraphicFrame key={`starj-${i}`} doc={graphicSrcDoc(html.starlight!, data({}, durationMs))}
                    ms={programmeMs - from} opacity={1} scale={scale} />;
            })}
        </div>
    );
}
