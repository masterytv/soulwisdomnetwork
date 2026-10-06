"use client";

// Why: Part I in the full-page editor, grown into layers (spec 020 items E5 and E6, lib/layers.ts). The
// "On screen" panel sets the captions and lists every layer (text, titles, lower thirds, pictures, video,
// the logo bug) in time order; choosing one opens it in the Properties panel (components/studio/properties.tsx).
// The preview shows the caption being spoken (components/studio/layers.tsx draws the layers). The caption
// look fields are shared with the Settings page and the Properties panel.

import { useEffect, useMemo, useRef } from "react";
import { buildCues } from "@/lib/captions";
import {
    BACKGROUNDS, BAND_ALPHA, CAPTION_POSITIONS, captionLook, DEFAULT_CAPTION_STYLE, FONTS, POSITION_LABELS, POSITIONS,
    SIZE_NAMES, TEXT_SIZES, type Background, type CaptionChoice, type CaptionStyle, type FontName, type Position, type TextSize,
} from "@/lib/onScreen";
import { anchorCut, isWhole, layerKind, layerName, layerSpan, type Layer } from "@/lib/layers";
import type { EpisodeEdit } from "@/lib/edit";
import { sourceTime, type Clip } from "@/lib/sequence";
import type { SpokenWord } from "@/lib/showNotes";
import { field, hint, secondary } from "@/components/studio/ui";
import { useVideoTime } from "@/components/studio/useVideoTime";

const SIZE_LABELS: Record<TextSize, string> = { small: "Small", medium: "Medium", large: "Large", huge: "Huge" };
const BACKGROUND_LABELS: Record<Background, string> = { outline: "Outline", box: "Dark band", shadow: "Shadow only" };
const CAPTION_POSITION_LABELS: Record<typeof CAPTION_POSITIONS[number], string> = { bottom: "Bottom", middle: "Middle", top: "Top" };

// Format mm:ss from ms.
export function mmss(ms: number): string {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// The font, size, colour and background controls, for captions and for a text overlay.
export function LookFields({ look, onChange, positions = "caption" }: {
    look: Pick<CaptionStyle, "font" | "size" | "color" | "background"> & { position?: string };
    onChange: (change: Partial<{ font: FontName; size: TextSize; color: string; background: Background; position: string }>) => void;
    positions?: "caption" | "all" | "none";
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
                {/* A text layer's band can take a colour of its own (Properties), so it is not always dark. */}
                {BACKGROUNDS.map(b => <option key={b} value={b}>{b === "box" && positions === "none" ? "Band" : BACKGROUND_LABELS[b]}</option>)}
            </select>
            {positions !== "none" && (
                <select aria-label="Position" value={look.position} onChange={e => onChange({ position: e.target.value })} className={small}>
                    {positions === "caption"
                        ? CAPTION_POSITIONS.map(p => <option key={p} value={p}>{CAPTION_POSITION_LABELS[p]}</option>)
                        : POSITIONS.map(p => <option key={p} value={p}>{POSITION_LABELS[p]}</option>)}
                </select>
            )}
        </div>
    );
}

// CSS for text in a look, sized against the video's width (1920 render pixels = 100cqw). A band in a brand
// colour (`band`) is nearly solid, as the render draws it (BAND_ALPHA); otherwise it is a see-through dark one.
export function textStyle(look: { font: FontName; size: TextSize; color: string; background: Background; band?: string }): React.CSSProperties {
    const font = FONTS.find(f => f.name === look.font) ?? FONTS[0];
    const px = (v: number) => `${(v / 19.2).toFixed(3)}cqw`;
    const style: React.CSSProperties = {
        fontFamily: font.css, fontSize: px(TEXT_SIZES[look.size]), color: look.color, lineHeight: 1.15,
        fontWeight: look.font === "Outfit Black" ? 900 : look.font === "Outfit SemiBold" ? 600 : font.bold ? 700 : 400,
    };
    if (look.background === "box") {
        const band = look.band ? `${look.band}${Math.round(255 - BAND_ALPHA).toString(16).padStart(2, "0")}` : "rgba(0,0,0,0.69)";
        return { ...style, backgroundColor: band, padding: `0 ${px(TEXT_SIZES[look.size] * 0.15)}` };
    }
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

const KIND_CLASS: Record<Layer["kind"], string> = {
    text: "bg-violet-500/20 text-violet-200", image: "bg-sky-500/20 text-sky-200", video: "bg-emerald-500/20 text-emerald-200",
};
export const kindClass = (l: Layer) => KIND_CLASS[l.kind];

// The "On screen" panel: captions for this video, then every layer, in time order. Choosing one selects it
// and opens it in the Properties panel; the selected one is marked and kept in view.
export function OnScreenPanel({ edit, layers, clips, editedMs, studio, selected, canEdit, onOpen, onRemove, onCaptions, onSeek }: {
    edit: EpisodeEdit; layers: Layer[]; clips: Clip[]; editedMs: number;
    studio: CaptionChoice; selected: string | null; canEdit: boolean;
    onOpen: (id: string) => void; onRemove: (id: string) => void; onCaptions: (captions: CaptionChoice | null) => void; onSeek: (ms: number) => void;
}) {
    const sorted = useMemo(() => layers.map(l => ({ l, span: layerSpan(l, clips, editedMs) }))
        .sort((a, b) => (a.span?.startMs ?? Infinity) - (b.span?.startMs ?? Infinity)), [layers, clips, editedMs]);
    const studioLook = studio.style ?? DEFAULT_CAPTION_STYLE;
    const mode = edit.captions ? (edit.captions.on ? "own" : "off") : "studio";
    const list = useRef<HTMLUListElement>(null);
    useEffect(() => {
        if (selected) list.current?.querySelector(`[data-layer="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: "nearest" });
    }, [selected]);

    return (
        <section aria-label="On screen" className="rounded-lg bg-[#130b29] border border-white/5 p-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-200">On screen</span>
                <span className={hint}>Burned into the render. Add titles, lower thirds, text and the logo from Elements, pictures and video from Media; choose one to change it in Properties.</span>
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

            {sorted.length === 0 && <p className={hint}>Nothing yet. Elements adds a lower third for each speaker the first time they speak.</p>}
            <ul ref={list} aria-label="Layers" className="flex flex-col gap-1">
                {sorted.map(({ l, span }) => (
                    <li key={l.id} data-layer={l.id} aria-label={`${layerKind(l)}: ${layerName(l)}`} aria-current={selected === l.id || undefined}
                        onClick={() => onOpen(l.id)}
                        className={`rounded-lg border px-2 py-1.5 flex items-center gap-2 text-xs text-gray-300 cursor-pointer ${selected === l.id ? "border-amber-400/70 bg-amber-500/5" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"}`}>
                        <span className={`px-1.5 py-0.5 rounded shrink-0 ${kindClass(l)}`}>{layerKind(l)}</span>
                        <span className="truncate grow" title={layerName(l)}>{layerName(l)}</span>
                        {anchorCut(l, clips) && <span className="text-amber-300 shrink-0" title="Its moment is cut, so it shows at the next kept moment">cut</span>}
                        <button type="button" className={`${secondary} px-2 py-0.5 shrink-0`} title="Jump there"
                            onClick={e => { e.stopPropagation(); if (span) onSeek(sourceTime(clips, span.startMs + Math.min(400, l.in.durationMs) + 50) ?? 0); }}>
                            {span ? mmss(span.startMs) : "after the end"}
                        </button>
                        <span className="shrink-0 tabular-nums w-14 text-right">{isWhole(l) ? "to the end" : `${l.durationMs / 1000} s`}</span>
                        <button type="button" disabled={!canEdit} aria-label={`Remove ${layerName(l)}`} title="Remove" className={`${secondary} px-1.5 py-0.5 shrink-0`}
                            onClick={e => { e.stopPropagation(); onRemove(l.id); }}>×</button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
