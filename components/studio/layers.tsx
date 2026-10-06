"use client";

// Why: the Studio editor's layers over the preview (spec 020 item E5): pictures, video and text drawn at
// the place, time and look the render gives them (lib/layers.ts: layerSpan, lookAt, alignFractions), with
// their fades, slides and slow zooms. Click one to select it; drag the selected one to move it (it snaps to
// the frame's edges, the 60-pixel margins, the thirds and the centre; Alt turns that off) and drag its
// corner to resize a picture. A whole drag is one undo step. Full-frame pictures (b-roll) let clicks
// through to the video's own controls unless selected: select them on the timeline or in the panel.
// A sketch of the render, not a second renderer: easing and fonts can differ slightly.

import { useEffect, useRef, useState } from 'react';
import { timelineTime, type Clip } from '@/lib/sequence';
import { alignFractions, layerSpan, lookAt, SUBTEXT_SCALE, type Layer, type PictureLayer, type Span, type TextLayer } from '@/lib/layers';
import { textStyle } from '@/components/studio/onScreen';

// The video's time, every frame while it plays and at each seek otherwise, and whether it is playing;
// only the caller redraws.
export function useFrameTime(video: React.RefObject<HTMLVideoElement | null>): { ms: number; playing: boolean } {
    const [ms, setMs] = useState(0);
    const [playing, setPlaying] = useState(false);
    useEffect(() => {
        const el = video.current;
        if (!el) return;
        let raf = 0;
        const update = () => setMs(el.currentTime * 1000);
        const tick = () => { update(); raf = requestAnimationFrame(tick); };
        const play = () => { cancelAnimationFrame(raf); setPlaying(true); raf = requestAnimationFrame(tick); };
        const stop = () => { cancelAnimationFrame(raf); setPlaying(false); update(); };
        update();
        el.addEventListener('play', play);
        el.addEventListener('pause', stop);
        el.addEventListener('seeked', update);
        el.addEventListener('timeupdate', update);
        if (!el.paused) play();
        return () => {
            cancelAnimationFrame(raf);
            el.removeEventListener('play', play);
            el.removeEventListener('pause', stop);
            el.removeEventListener('seeked', update);
            el.removeEventListener('timeupdate', update);
        };
    }, [video]);
    return { ms, playing };
}

// Where the pinned point may snap, as shares of the frame: the edges, the render's 60-pixel margins, the
// thirds and the centre.
const GUIDES_X = [0, 60 / 1920, 1 / 3, 0.5, 2 / 3, 1 - 60 / 1920, 1];
const GUIDES_Y = [0, 60 / 1080, 1 / 3, 0.5, 2 / 3, 1 - 60 / 1080, 1];
const SNAP = 0.012;
const snapTo = (v: number, guides: number[]) => guides.reduce((best, g) => (Math.abs(g - v) < Math.abs(best - v) ? g : best), Infinity);
function snap(v: number, guides: number[], on: boolean) {
    const g = snapTo(v, guides);
    return on && Math.abs(g - v) <= SNAP ? g : v;
}

// A slow zoom or pan, as the render's Ken Burns does it (eased over the layer's length).
function motionTransform(motion: string, p: number): string {
    const e = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, p)));
    if (motion === 'kenBurnsIn') return `scale(${1 + 0.25 * e})`;
    if (motion === 'kenBurnsOut') return `scale(${1.25 - 0.25 * e})`;
    if (motion === 'pan') return `scale(1.2) translateX(${(8.33 - 16.67 * e).toFixed(2)}%)`;
    return '';
}

// A video layer: its own <video>, kept to the edited episode's time and to the main video's play and pause.
function LayerVideo({ layer, url, span, nowMs, playing }: { layer: Extract<Layer, { kind: 'video' }>; url: string; span: Span; nowMs: number; playing: boolean }) {
    const ref = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const want = (layer.trimInMs + nowMs - span.startMs) / 1000;
        if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = Math.max(0, want);
        el.muted = layer.volumeDb === null;
        el.volume = layer.volumeDb === null ? 0 : Math.min(1, 10 ** (layer.volumeDb / 20));
        if (playing && el.paused) void el.play().catch(() => {});
        if (!playing && !el.paused) el.pause();
    }, [layer, span.startMs, nowMs, playing]);
    return <video ref={ref} src={url} playsInline preload="auto" className="block w-full h-auto" />;
}

interface Drag { id: string; kind: 'move' | 'resize'; x0: number; y0: number; base: Layer; draft: Layer; moved: boolean }

export function LayersPreview({ layers, clips, editedMs, video, urls, selected, onSelect, onChange }: {
    layers: Layer[];
    clips: Clip[];                       // the play order (lib/sequence.ts), to find the edited time
    editedMs: number;
    video: React.RefObject<HTMLVideoElement | null>;
    urls: Record<string, string>;        // Storage path → a link the browser can show
    selected: string | null;
    onSelect: (id: string | null) => void;
    onChange: (layer: Layer) => void;    // a finished drag, as one change
}) {
    const { ms: srcMs, playing } = useFrameTime(video);
    const stage = useRef<HTMLDivElement>(null);
    const dragRef = useRef<Drag | null>(null);
    const [drag, setDragState] = useState<Drag | null>(null);
    const setDrag = (d: Drag | null) => { dragRef.current = d; setDragState(d); };
    const nowMs = timelineTime(clips, srcMs, true) ?? editedMs;

    const shown = layers.map(l => (drag?.id === l.id ? drag.draft : l))
        .map(l => ({ l, span: layerSpan(l, clips, editedMs) }))
        .flatMap(({ l, span }) => {
            const look = span ? lookAt(l, span, nowMs) : null;
            return span && look ? [{ l, span, look }] : [];
        })
        .sort((a, b) => a.l.track - b.l.track || a.span.startMs - b.span.startMs);
    if (!shown.length) return null;

    const begin = (e: React.PointerEvent, l: Layer, kind: Drag['kind']) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        onSelect(l.id);
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ id: l.id, kind, x0: e.clientX, y0: e.clientY, base: l, draft: l, moved: false });
    };
    const move = (e: React.PointerEvent) => {
        const d = dragRef.current, r = stage.current?.getBoundingClientRect();
        if (!d || !r || r.width <= 0) return;
        const dx = (e.clientX - d.x0) / r.width, dy = (e.clientY - d.y0) / r.height;
        const moved = d.moved || Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) >= 3;
        if (!moved) return;
        const b = d.base;
        let draft: Layer;
        if (d.kind === 'move') {
            draft = { ...b, place: { ...b.place, x: snap(b.place.x + dx, GUIDES_X, !e.altKey), y: snap(b.place.y + dy, GUIDES_Y, !e.altKey) } };
        } else {
            const p = b as PictureLayer;
            const { fx } = alignFractions(p.place.align);
            const w = p.w + dx * (fx === 1 ? -1 : fx === 0.5 ? 2 : 1);
            const snapped = !e.altKey && Math.abs(w - 1) < 0.015 ? 1 : w;
            draft = { ...p, w: Math.round(Math.min(2, Math.max(0.02, snapped)) * 1000) / 1000 };
        }
        setDrag({ ...d, draft, moved });
    };
    const end = () => {
        const d = dragRef.current;
        if (d?.moved) onChange(d.draft);
        setDrag(null);
    };

    return (
        <div ref={stage} aria-label="Layers" className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
            {shown.map(({ l, span, look }) => {
                const { fx, fy } = alignFractions(l.place.align);
                const isSelected = selected === l.id;
                const style: React.CSSProperties = {
                    position: 'absolute', left: `${((l.place.x + look.dx) * 100).toFixed(3)}%`, top: `${((l.place.y + look.dy) * 100).toFixed(3)}%`,
                    transform: `translate(${-fx * 100}%, ${-fy * 100}%)`, opacity: look.opacity,
                };
                const clickable = isSelected || l.kind === 'text' || l.w < 0.9;
                const ring = isSelected ? 'outline outline-2 outline-amber-300 outline-offset-2' : 'hover:outline hover:outline-1 hover:outline-white/50';
                const handlers = {
                    onPointerDown: (e: React.PointerEvent) => begin(e, l, 'move'),
                    onPointerMove: move, onPointerUp: end, onPointerCancel: () => setDrag(null),
                };
                if (l.kind === 'text') {
                    return (
                        <div key={l.id} {...handlers} aria-label={`Text: ${l.text}`}
                            className={`${clickable ? 'pointer-events-auto cursor-move' : ''} ${ring}`}
                            style={{ ...style, ...textStyle(l as TextLayer), textAlign: fx === 0 ? 'left' : fx === 1 ? 'right' : 'center', width: 'max-content', maxWidth: '90%' }}>
                            {l.text}
                            {l.subtext && <div style={{ fontSize: `${SUBTEXT_SCALE}em`, ...(l.subColor ? { color: l.subColor } : {}) }}>{l.subtext}</div>}
                        </div>
                    );
                }
                const url = urls[l.media.path];
                const progress = (nowMs - span.startMs) / Math.max(1, span.endMs - span.startMs);
                return (
                    <div key={l.id} {...handlers} aria-label={`${l.kind === 'video' ? 'Video' : 'Picture'}: ${l.media.name}`}
                        className={`${clickable ? 'pointer-events-auto cursor-move' : ''} ${ring}`}
                        style={{ ...style, width: `${(l.w * 100).toFixed(3)}%` }}>
                        {!url ? (
                            <div className="w-full aspect-video bg-white/10 text-[10px] text-gray-300 flex items-center justify-center">{l.media.name}</div>
                        ) : l.kind === 'video' ? (
                            <LayerVideo layer={l} url={url} span={span} nowMs={nowMs} playing={playing} />
                        ) : l.motion !== 'none' ? (
                            <div className="w-full aspect-video overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
                                <img src={url} alt="" draggable={false} className="w-full h-full object-cover" style={{ transform: motionTransform(l.motion, progress) }} />
                            </div>
                        ) : (
                            // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                            <img src={url} alt="" draggable={false} className="block w-full h-auto" />
                        )}
                        {isSelected && (
                            <span role="presentation" title="Drag to resize (Alt: no snapping)"
                                onPointerDown={e => begin(e, l, 'resize')} onPointerMove={move} onPointerUp={end}
                                className="pointer-events-auto absolute w-3 h-3 rounded-sm bg-amber-300 border border-black cursor-nwse-resize"
                                style={{ [fx === 1 ? 'left' : 'right']: -6, [fy === 0 ? 'bottom' : 'top']: -6 }} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
