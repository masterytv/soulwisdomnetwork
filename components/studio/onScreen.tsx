"use client";

// Why: Part I in the full-page editor, grown into layers (spec 020 item E5, lib/layers.ts). The "On screen"
// panel sets the captions and lists every layer (text, pictures, video) with its time, anchor, place, size,
// opacity, transitions in and out, motion and sound; the preview shows the caption being spoken
// (components/studio/layers.tsx draws the layers). The caption look fields are shared with the Settings page.

import { useEffect, useMemo, useRef } from "react";
import { buildCues } from "@/lib/captions";
import {
    BACKGROUNDS, CAPTION_POSITIONS, captionLook, DEFAULT_CAPTION_STYLE, FONTS, nameTitles, newText, POSITION_LABELS, POSITIONS,
    SIZE_NAMES, TEXT_SIZES, type Background, type CaptionChoice, type CaptionStyle, type FontName, type Position, type TextSize,
} from "@/lib/onScreen";
import {
    anchorCut, LAYER_TRANSITION_LABELS, LAYER_TRANSITIONS, layerSpan, MOTION_LABELS, MOTIONS, placeOf, startAt, toLayer,
    type Edge, type Layer, type LayerTransition, type Motion,
} from "@/lib/layers";
import type { EpisodeEdit } from "@/lib/edit";
import { sourceTime, timelineTime, type Clip } from "@/lib/sequence";
import type { SpokenWord } from "@/lib/showNotes";
import { field, hint, secondary } from "@/components/studio/ui";
import { useVideoTime } from "@/components/studio/useVideoTime";

const SIZE_LABELS: Record<TextSize, string> = { small: "Small", medium: "Medium", large: "Large", huge: "Huge" };
const BACKGROUND_LABELS: Record<Background, string> = { outline: "Outline", box: "Dark band", shadow: "Shadow only" };
const CAPTION_POSITION_LABELS: Record<typeof CAPTION_POSITIONS[number], string> = { bottom: "Bottom", middle: "Middle", top: "Top" };

// Format mm:ss from ms.
function mmss(ms: number): string {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// The font, size, colour and background controls, for captions and for a text overlay.
export function LookFields({ look, onChange, positions = "caption" }: {
    look: Pick<CaptionStyle, "font" | "size" | "color" | "background"> & { position: string };
    onChange: (change: Partial<{ font: FontName; size: TextSize; color: string; background: Background; position: string }>) => void;
    positions?: "caption" | "all";
}) {
    const small = `${field} !w-auto !py-1 !px-2 text-xs`;
    return (
        <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Font" value={look.font} onChange={e => onChange({ font: e.target.value as FontName })} className={small}>
                {FONTS.map(f => <option key={f.name} value={f.name}>{f.label}</option>)}
            </select>
            <select aria-label="Size" value={look.size} onChange={e => onChange({ size: e.target.value as TextSize })} className={small}>
                {SIZE_NAMES.map(s => <option key={s} value={s}>{SIZE_LABELS[s]}</option>)}
            </select>
            <input type="color" aria-label="Colour" value={look.color} onChange={e => onChange({ color: e.target.value })}
                className="h-7 w-10 rounded border border-white/10 bg-transparent" />
            <select aria-label="Background" value={look.background} onChange={e => onChange({ background: e.target.value as Background })} className={small}>
                {BACKGROUNDS.map(b => <option key={b} value={b}>{BACKGROUND_LABELS[b]}</option>)}
            </select>
            <select aria-label="Position" value={look.position} onChange={e => onChange({ position: e.target.value })} className={small}>
                {positions === "caption"
                    ? CAPTION_POSITIONS.map(p => <option key={p} value={p}>{CAPTION_POSITION_LABELS[p]}</option>)
                    : POSITIONS.map(p => <option key={p} value={p}>{POSITION_LABELS[p]}</option>)}
            </select>
        </div>
    );
}

// CSS for text in a look, sized against the video's width (1920 render pixels = 100cqw).
export function textStyle(look: { font: FontName; size: TextSize; color: string; background: Background }): React.CSSProperties {
    const font = FONTS.find(f => f.name === look.font) ?? FONTS[0];
    const px = (v: number) => `${(v / 19.2).toFixed(3)}cqw`;
    const style: React.CSSProperties = {
        fontFamily: font.css, fontSize: px(TEXT_SIZES[look.size]), color: look.color, lineHeight: 1.15,
        fontWeight: look.font === "Outfit Black" ? 900 : look.font === "Outfit SemiBold" ? 600 : font.bold ? 700 : 400,
    };
    if (look.background === "box") return { ...style, backgroundColor: "rgba(0,0,0,0.69)", padding: `0 ${px(TEXT_SIZES[look.size] * 0.15)}` };
    if (look.background === "outline") {
        const o = px(Math.max(2, TEXT_SIZES[look.size] * 0.07));
        return { ...style, textShadow: `-${o} -${o} 0 #000, ${o} -${o} 0 #000, -${o} ${o} 0 #000, ${o} ${o} 0 #000` };
    }
    return { ...style, textShadow: `${px(4)} ${px(4)} ${px(4)} rgba(0,0,0,0.6)` };
}

// Where a box sits on the video for a position, with the render's margins.
function placeStyle(position: Position | typeof CAPTION_POSITIONS[number], marginV: number, marginH = 90): React.CSSProperties {
    const px = (v: number) => `${(v / 19.2).toFixed(3)}cqw`;
    const s: React.CSSProperties = { position: "absolute" };
    const tx = position.endsWith("left") ? (s.left = px(marginH), "0") : position.endsWith("right") ? (s.right = px(marginH), "0") : (s.left = "50%", "-50%");
    const ty = position.startsWith("top") ? (s.top = px(marginV), "0") : position.startsWith("bottom") ? (s.bottom = px(marginV), "0") : (s.top = "50%", "-50%");
    s.transform = `translate(${tx}, ${ty})`;
    s.textAlign = position.endsWith("left") ? "left" : position.endsWith("right") ? "right" : "center";
    return s;
}

// Over the video: the caption being spoken. The preview and the panel follow the video themselves
// (useVideoTime), so playing redraws only them.
export function OnScreenPreview({ words, edit, video, studio }: {
    words: SpokenWord[]; edit: EpisodeEdit; video: React.RefObject<HTMLVideoElement | null>; studio: CaptionChoice;
}) {
    const currentMs = useVideoTime(video);
    const cues = useMemo(() => buildCues(words), [words]);
    const look = captionLook(edit, { burnCaptions: studio.on, captionStyle: studio.style });
    const cue = look ? cues.find(c => currentMs >= c.startMs && currentMs < c.endMs) : undefined;
    if (!cue || !look) return null;
    return (
        <div aria-label="Caption preview" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div style={{ ...placeStyle(look.position, 70), ...textStyle(look), whiteSpace: "nowrap" }}>
                {cue.lines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
        </div>
    );
}

const KIND_LABEL: Record<Layer["kind"], string> = { text: "Text", image: "Picture", video: "Video" };
const KIND_CLASS: Record<Layer["kind"], string> = {
    text: "bg-violet-500/20 text-violet-200", image: "bg-sky-500/20 text-sky-200", video: "bg-emerald-500/20 text-emerald-200",
};
const EDGE_LENGTHS = [0, 200, 300, 500, 750, 1000, 1500, 2000, 3000];
const small = `${field} !w-auto !py-1 !px-2 text-xs`;

// The nine positions, as places with the render's margins; "custom" once dragged somewhere else.
function positionOf(l: Layer): Position | "custom" {
    const [mh, mv] = l.kind === "text" ? [90, 80] : l.w >= 1 ? [0, 0] : [60, 60];
    const hit = POSITIONS.find(p => { const q = placeOf(p, mh, mv); return Math.abs(q.x - l.place.x) < 1e-3 && Math.abs(q.y - l.place.y) < 1e-3 && q.align === l.place.align; });
    return hit ?? "custom";
}

function EdgeFields({ label, edge, onChange }: { label: string; edge: Edge; onChange: (e: Edge) => void }) {
    return (
        <label className="flex items-center gap-1">
            {label}
            <select aria-label={`${label} transition`} value={edge.transition} className={small}
                onChange={e => { const t = e.target.value as LayerTransition; onChange({ transition: t, durationMs: t === "none" ? 0 : edge.durationMs || 500 }); }}>
                {LAYER_TRANSITIONS.map(t => <option key={t} value={t}>{LAYER_TRANSITION_LABELS[t]}</option>)}
            </select>
            {edge.transition !== "none" && (
                <select aria-label={`${label} length`} value={edge.durationMs} className={small} onChange={e => onChange({ ...edge, durationMs: Number(e.target.value) })}>
                    {[...new Set([...EDGE_LENGTHS.filter(v => v > 0), edge.durationMs])].sort((a, b) => a - b).map(v => <option key={v} value={v}>{v / 1000} s</option>)}
                </select>
            )}
        </label>
    );
}

// The "On screen" panel: captions for this video, then every layer, in time order. The selected layer
// (chosen here, on the preview or on the timeline) is marked and kept in view.
export function OnScreenPanel({ words, edit, layers, clips, editedMs, video, studio, selected, canEdit, onSelect, onLayers, onCaptions, onSeek }: {
    words: SpokenWord[]; edit: EpisodeEdit; layers: Layer[]; clips: Clip[]; editedMs: number;
    video: React.RefObject<HTMLVideoElement | null>; studio: CaptionChoice; selected: string | null; canEdit: boolean;
    onSelect: (id: string | null) => void; onLayers: (layers: Layer[]) => void; onCaptions: (captions: CaptionChoice | null) => void; onSeek: (ms: number) => void;
}) {
    const currentMs = useVideoTime(video);
    const sorted = useMemo(() => layers.map(l => ({ l, span: layerSpan(l, clips, editedMs) }))
        .sort((a, b) => (a.span?.startMs ?? Infinity) - (b.span?.startMs ?? Infinity)), [layers, clips, editedMs]);
    const studioLook = studio.style ?? DEFAULT_CAPTION_STYLE;
    const mode = edit.captions ? (edit.captions.on ? "own" : "off") : "studio";
    const newId = () => `o${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
    const list = useRef<HTMLUListElement>(null);
    useEffect(() => {
        if (selected) list.current?.querySelector(`[data-layer="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: "nearest" });
    }, [selected]);

    // Changes one layer by its id.
    const change = (id: string, part: Partial<Layer>) => onLayers(layers.map(l => (l.id === id ? { ...l, ...part } as Layer : l)));
    const nowEdited = timelineTime(clips, currentMs, true) ?? 0;
    const add = (made: Layer[]) => { onLayers([...layers, ...made]); if (made[0]) onSelect(made[0].id); };

    return (
        <section aria-label="On screen" className="rounded-lg bg-[#130b29] border border-white/5 p-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-200">On screen</span>
                <span className={hint}>Burned into the render. A layer moves with its words when cuts change, unless it is set to stay at its time. Drag one on the preview to move it.</span>
            </div>
            {!canEdit && <p className="text-sm text-amber-300">The media bin did not load, so layers cannot be changed now (the b-roll would be lost). Reload the page.</p>}

            {/* Captions on this video: the Studio's choice, a look of its own, or none. */}
            <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-200">
                    <span className="font-medium">Captions</span>
                    {([
                        ["studio", `Studio setting (${studio.on ? "on" : "off"})`],
                        ["own", "On, with this look"],
                        ["off", "Off for this video"],
                    ] as const).map(([value, label]) => (
                        <label key={value} className="flex items-center gap-1">
                            <input type="radio" name="captions" checked={mode === value}
                                onChange={() => onCaptions(value === "studio" ? null : { on: value === "own", style: edit.captions?.style ?? studioLook })} />
                            {label}
                        </label>
                    ))}
                </div>
                {mode === "own" && edit.captions && (
                    <LookFields look={edit.captions.style}
                        onChange={c => onCaptions({ on: true, style: { ...edit.captions!.style, ...c } as CaptionStyle })} />
                )}
            </div>

            {/* Adding text; pictures and video come from the Media panel. */}
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={secondary} disabled={!canEdit} onClick={() => add([toLayer(newText(newId(), currentMs, studioLook))])}>
                    + Text at {mmss(currentMs)}
                </button>
                <button type="button" className={secondary} disabled={!words.length || !canEdit}
                    onClick={() => add(nameTitles(words, layers.flatMap(l => l.kind === "text" ? [{ ...newText(l.id, 0), text: l.text }] : []), studioLook).map(toLayer))}>
                    + Name titles for each speaker
                </button>
                <span className={hint}>Pictures and video: the Media panel.</span>
            </div>

            {sorted.length === 0 && <p className={hint}>Nothing yet. Name titles show each speaker&apos;s name the first time they speak.</p>}
            <ul ref={list} className="flex flex-col gap-2">
                {sorted.map(({ l, span }) => {
                    const pos = positionOf(l);
                    const pinned = "atMs" in l.anchor;
                    return (
                        <li key={l.id} data-layer={l.id} aria-label={l.kind === "text" ? `Text: ${l.text}` : `${KIND_LABEL[l.kind]}: ${l.media.name}`}
                            onClick={() => onSelect(l.id)}
                            className={`rounded-lg border p-2 flex flex-col gap-2 ${selected === l.id ? "border-amber-400/70 bg-amber-500/5" : "border-white/10 bg-white/[0.02]"}`}>
                            <fieldset disabled={!canEdit} className="contents">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                                    <span className={`px-1.5 py-0.5 rounded ${KIND_CLASS[l.kind]}`}>{KIND_LABEL[l.kind]}</span>
                                    {l.kind !== "text" && <span className="truncate max-w-[12rem]" title={l.media.name}>{l.media.name}</span>}
                                    <button type="button" className={`${secondary} px-2 py-0.5`} title="Jump there"
                                        onClick={() => { if (span) onSeek(sourceTime(clips, span.startMs + Math.min(400, l.in.durationMs) + 50) ?? 0); }}>
                                        {span ? mmss(span.startMs) : "after the end"}
                                    </button>
                                    <button type="button" className={`${secondary} px-2 py-0.5`} title="Start it where the playhead is"
                                        onClick={() => onLayers(layers.map(x => (x.id === l.id ? startAt(x, nowEdited, a => sourceTime(clips, a)) : x)))}>
                                        Start at {mmss(nowEdited)}
                                    </button>
                                    <label className="flex items-center gap-1">
                                        for
                                        <input type="number" min={0.5} max={86400} step={0.5} value={l.durationMs / 1000} aria-label="Seconds on screen"
                                            onChange={e => change(l.id, { durationMs: Math.max(500, Math.round((Number(e.target.value) || 0.5) * 1000)) })}
                                            className={`${field} !w-20 !py-1 !px-2 text-xs`} />
                                        s
                                    </label>
                                    <select aria-label="Anchor" value={pinned ? "pinned" : "words"} className={small}
                                        title="Moves with its words when cuts change, or stays at its time in the edited video"
                                        onChange={e => {
                                            if (!span) return;
                                            change(l.id, { anchor: e.target.value === "pinned" ? { atMs: span.startMs } : { srcMs: Math.round(sourceTime(clips, span.startMs) ?? 0) } });
                                        }}>
                                        <option value="words">Moves with the words</option>
                                        <option value="pinned">Stays at this time</option>
                                    </select>
                                    <span className="grow" />
                                    <button type="button" className={`${secondary} px-2 py-0.5`} onClick={e => { e.stopPropagation(); onLayers(layers.filter(x => x.id !== l.id)); onSelect(null); }}>
                                        Remove
                                    </button>
                                </div>
                                {anchorCut(l, clips) && <p className="text-xs text-amber-300">Its moment is cut, so it shows at the next kept moment.</p>}
                                {l.kind === "text" ? (
                                    <>
                                        <div className="flex flex-wrap gap-2">
                                            <input value={l.text} maxLength={200} aria-label="Text" onChange={e => change(l.id, { text: e.target.value })}
                                                className={`${field} !w-auto grow`} placeholder="Text" />
                                            <input value={l.subtext} maxLength={200} aria-label="Second line" onChange={e => change(l.id, { subtext: e.target.value })}
                                                className={`${field} !w-auto grow`} placeholder="Smaller second line (optional), such as a role" />
                                        </div>
                                        <LookFields look={{ ...l, position: pos === "custom" ? "middle" : pos }} positions="all"
                                            onChange={c => {
                                                const { position, ...look } = c;
                                                change(l.id, { ...look, ...(position ? { place: placeOf(position as Position, 90, 80) } : {}) } as Partial<Layer>);
                                            }} />
                                    </>
                                ) : (
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                                        <select aria-label="Position" value={pos} className={small}
                                            onChange={e => { const m = l.w >= 1 ? 0 : 60; change(l.id, { place: placeOf(e.target.value as Position, m, m) }); }}>
                                            {pos === "custom" && <option value="custom">Where you dragged it</option>}
                                            {POSITIONS.map(p => <option key={p} value={p}>{POSITION_LABELS[p]}</option>)}
                                        </select>
                                        <label className="flex items-center gap-1">
                                            Width
                                            <input type="range" min={2} max={100} value={Math.round(l.w * 100)} aria-label="Width"
                                                onChange={e => change(l.id, { w: Number(e.target.value) / 100 })} />
                                            {Math.round(l.w * 100)}%
                                        </label>
                                        {l.kind === "image" && (
                                            <select aria-label="Motion" value={l.motion} className={small} onChange={e => change(l.id, { motion: e.target.value as Motion })}
                                                title="A slow zoom or pan, as the b-roll has; it fills a 16:9 box">
                                                {MOTIONS.map(m => <option key={m} value={m}>{MOTION_LABELS[m]}</option>)}
                                            </select>
                                        )}
                                        {l.kind === "video" && (
                                            <>
                                                <label className="flex items-center gap-1" title="Where in the clip it starts">
                                                    from
                                                    <input type="number" min={0} step={0.5} value={l.trimInMs / 1000} aria-label="Start in the clip, seconds"
                                                        onChange={e => change(l.id, { trimInMs: Math.max(0, Math.round((Number(e.target.value) || 0) * 1000)) })}
                                                        className={`${field} !w-16 !py-1 !px-2 text-xs`} />
                                                    s
                                                </label>
                                                <select aria-label="Sound" value={l.volumeDb === null ? "off" : "on"} className={small}
                                                    onChange={e => change(l.id, { volumeDb: e.target.value === "off" ? null : 0 })}>
                                                    <option value="off">Its sound off</option>
                                                    <option value="on">Its sound on</option>
                                                </select>
                                                {l.volumeDb !== null && (
                                                    <label className="flex items-center gap-1">
                                                        <input type="range" min={-30} max={6} value={l.volumeDb} aria-label="Its volume"
                                                            onChange={e => change(l.id, { volumeDb: Number(e.target.value) })} />
                                                        {l.volumeDb} dB
                                                    </label>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-300">
                                    <label className="flex items-center gap-1">
                                        Opacity
                                        <input type="range" min={5} max={100} value={Math.round(l.opacity * 100)} aria-label="Opacity"
                                            onChange={e => change(l.id, { opacity: Number(e.target.value) / 100 })} />
                                        {Math.round(l.opacity * 100)}%
                                    </label>
                                    <EdgeFields label="In" edge={l.in} onChange={e => change(l.id, { in: e })} />
                                    <EdgeFields label="Out" edge={l.out} onChange={e => change(l.id, { out: e })} />
                                </div>
                            </fieldset>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

