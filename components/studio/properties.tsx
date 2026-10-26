"use client";

// Why: the Studio editor's Properties panel (spec 020 item E6, "Elements and properties"): everything about
// the one selected layer, chosen on the preview, the timeline or the On screen list. When it starts and for
// how long (or to the end of the episode), whether it moves with its words; where it sits (the nine
// positions, or numbers in render pixels for the point it is pinned by) and its width; opacity; how it comes
// and goes; a still's motion; a video's start and sound; and for text, the words and their look, with the
// band's and the second line's colours (the brand's, for titles and lower thirds).

import {
    ALIGN, FRAME, POSITION_LABELS, POSITIONS, type Position,
} from "@/lib/onScreen";
import {
    anchorCut, isWhole, LAYER_MIN_MS, LAYER_TRANSITION_LABELS, LAYER_TRANSITIONS, layerKind, layerName, layerSpan, marginsOf,
    MOTION_LABELS, MOTIONS, placeOf, positionOf, startAt, WHOLE_EPISODE_MS,
    type Brand, type Edge, type Layer, type LayerTransition, type Motion,
} from "@/lib/layers";
import { GRAPHIC_MAX_MS, GRAPHIC_TEMPLATES } from "@/lib/graphics";
import { HIGHLIGHT_LABELS, HIGHLIGHT_LAYOUTS, HIGHLIGHT_MAX_MS, HIGHLIGHT_MIN_MS, type HighlightLayout } from "@/lib/reframe";
import { sourceTime, timelineTime, type Clip } from "@/lib/sequence";
import { field, hint, secondary } from "@/components/studio/ui";
import { useVideoTime } from "@/components/studio/useVideoTime";
import { kindClass, LookFields, mmss } from "@/components/studio/onScreen";

const EDGE_LENGTHS = [0, 200, 300, 500, 750, 1000, 1500, 2000, 3000];
const small = `${field} !w-auto !py-1 !px-2 text-xs`;
const num = `${field} !w-20 !py-1 !px-2 text-xs tabular-nums`;
// The nine points, top row first, as a grid shows them.
const GRID: Position[] = ["top-left", "top", "top-right", "middle-left", "middle", "middle-right", "bottom-left", "bottom", "bottom-right"];
const POINT_OF: Record<number, Position> = Object.fromEntries(POSITIONS.map(p => [ALIGN[p], p]));

export function EdgeFields({ label, edge, onChange }: { label: string; edge: Edge; onChange: (e: Edge) => void }) {
    return (
        <label className="flex items-center gap-1">
            <span className="w-8">{label}</span>
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

// A number box that keeps what is typed until it is a number in range.
export function NumberField({ label, value, min, max, step = 1, onChange, title }: {
    label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; title?: string;
}) {
    return (
        <input type="number" aria-label={label} title={title ?? label} value={Number(value.toFixed(3))} min={min} max={max} step={step} className={num}
            onChange={e => { const v = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))); }} />
    );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
            <div className="flex flex-col gap-2 text-xs text-gray-300">{children}</div>
        </div>
    );
}

export function PropertiesPanel({ layer, clips, editedMs, video, brand, canEdit, onChange, onRemove, onSeek, problem }: {
    layer: Layer | null;
    clips: Clip[];
    editedMs: number;
    video: React.RefObject<HTMLVideoElement | null>;
    brand: Brand;
    canEdit: boolean;
    onChange: (layer: Layer) => void;
    onRemove: (id: string) => void;
    onSeek: (ms: number) => void;
    problem?: string;                        // spec 021 M3: why this highlight cannot be saved as it is
}) {
    const currentMs = useVideoTime(video);
    if (!layer) {
        return (
            <section aria-label="Properties" className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-gray-200">Properties</h2>
                <p className={hint}>Choose a layer on the preview, on the timeline or in the On screen list to change it here.</p>
            </section>
        );
    }
    const l = layer;
    const span = layerSpan(l, clips, editedMs);
    const nowEdited = timelineTime(clips, currentMs, true) ?? 0;
    const set = (part: Partial<Layer>) => onChange({ ...l, ...part } as Layer);
    const pos = positionOf(l);
    const [mh, mv] = marginsOf(l);
    const pinned = "atMs" in l.anchor;

    // A highlight (spec 021 item M3) reframes the episode's own picture: no position, width, opacity or
    // edges of its own — the layout's keyframes move the picture, and the template draws the words.
    if (l.kind === "highlight") {
        const emphasisOutside = l.emphasis !== "" && !l.words.toLowerCase().includes(l.emphasis.toLowerCase());
        return (
            <section aria-label="Properties" className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-gray-200">Properties</h2>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${kindClass(l)}`}>{layerKind(l)}</span>
                    <span className="text-xs text-gray-300 truncate max-w-[14rem]" title={layerName(l)}>{layerName(l)}</span>
                    <span className="grow" />
                    <button type="button" disabled={!canEdit} className={`${secondary} px-2 py-0.5`} onClick={() => onRemove(l.id)}>Remove</button>
                </div>
                <fieldset disabled={!canEdit} className="contents">
                    {problem && <p className="text-sm text-amber-300">{problem} The edit cannot be saved until this is fixed.</p>}
                    <Section title="Highlight">
                        <select aria-label="Layout" value={l.layout} className={`${small} self-start`}
                            title="How the picture is reframed while the words show"
                            onChange={e => set({ layout: e.target.value as HighlightLayout })}>
                            {HIGHLIGHT_LAYOUTS.map(k => <option key={k} value={k}>{HIGHLIGHT_LABELS[k]}</option>)}
                        </select>
                        <input value={l.words} maxLength={500} aria-label="Words" onChange={e => set({ words: e.target.value })}
                            className={field} placeholder="The words said at this moment, word for word" />
                        <input value={l.emphasis} maxLength={80} aria-label="Stressed word" onChange={e => set({ emphasis: e.target.value })}
                            className={field} placeholder="The stressed word (optional)" />
                        {emphasisOutside && <p className="text-amber-300">The stressed word must be among the words, or this cannot be saved.</p>}
                        <input value={l.speaker} maxLength={200} aria-label="Speaker" onChange={e => set({ speaker: e.target.value })}
                            className={field} placeholder="Who says it" />
                        <p className={hint}>The picture itself is reframed for these seconds (spec 021). A highlight cannot sit on cut words or a teaser, or overlap another highlight.</p>
                    </Section>
                    <Section title="Time">
                        <div className="flex flex-wrap items-center gap-2">
                            <span>Starts at</span>
                            <button type="button" className={`${secondary} px-2 py-0.5`} title="Jump there"
                                onClick={() => { if (span) onSeek(sourceTime(clips, span.startMs + 50) ?? 0); }}>
                                {span ? mmss(span.startMs) : "after the end"}
                            </button>
                            <button type="button" className={`${secondary} px-2 py-0.5`} title="Start it where the playhead is"
                                onClick={() => set({ anchor: { srcMs: Math.round(sourceTime(clips, nowEdited) ?? 0) } })}>
                                Start at {mmss(nowEdited)}
                            </button>
                        </div>
                        <label className="flex items-center gap-1">
                            for
                            <NumberField label="Seconds on screen" value={l.durationMs / 1000} min={HIGHLIGHT_MIN_MS / 1000} max={HIGHLIGHT_MAX_MS / 1000} step={0.5}
                                onChange={v => set({ durationMs: Math.round(v * 1000) })} />
                            s
                        </label>
                        {anchorCut(l, clips) && <p className="text-amber-300">Its words are cut: bring them back, or move the highlight, before saving.</p>}
                    </Section>
                </fieldset>
            </section>
        );
    }

    return (
        <section aria-label="Properties" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-200">Properties</h2>
                <span className={`px-1.5 py-0.5 rounded text-xs ${kindClass(l)}`}>{layerKind(l)}</span>
                <span className="text-xs text-gray-300 truncate max-w-[14rem]" title={layerName(l)}>{layerName(l)}</span>
                <span className="grow" />
                <button type="button" disabled={!canEdit} className={`${secondary} px-2 py-0.5`} onClick={() => onRemove(l.id)}>Remove</button>
            </div>
            <fieldset disabled={!canEdit} className="contents">
                {l.kind === "graphic" && (
                    <Section title={GRAPHIC_TEMPLATES[l.template].label}>
                        {l.template === "lowerThird" && (<>
                            <input value={l.fields.name} maxLength={200} aria-label="Name" onChange={e => set({ fields: { ...l.fields, name: e.target.value } })}
                                className={field} placeholder="Name" />
                            <input value={l.fields.descriptor} maxLength={200} aria-label="Descriptor" onChange={e => set({ fields: { ...l.fields, descriptor: e.target.value } })}
                                className={field} placeholder={l.fields.variant === "host" ? "HOST" : "Descriptor, e.g. author · researcher"} />
                            <select aria-label="Variant" value={l.fields.variant} className={`${small} self-start`}
                                title="Guests get the full lower third with the drawn rule; hosts the compact one"
                                onChange={e => {
                                    const host = e.target.value === "host";
                                    const descriptor = host && !l.fields.descriptor ? "HOST" : !host && l.fields.descriptor === "HOST" ? "" : l.fields.descriptor;
                                    set({ fields: { ...l.fields, variant: host ? "host" : "guest", descriptor } });
                                }}>
                                <option value="guest">Guest</option>
                                <option value="host">Host (compact)</option>
                            </select>
                        </>)}
                        {l.template === "titleCard" && (<>
                            <input value={l.fields.title} maxLength={200} aria-label="Title" onChange={e => set({ fields: { ...l.fields, title: e.target.value } })}
                                className={field} placeholder="The episode's title" />
                            <input value={l.fields.guest} maxLength={200} aria-label="Guest" onChange={e => set({ fields: { ...l.fields, guest: e.target.value } })}
                                className={field} placeholder="Guest — the “with …” line (empty hides it)" />
                            <input value={l.fields.show} maxLength={200} aria-label="Show name" onChange={e => set({ fields: { ...l.fields, show: e.target.value } })}
                                className={field} placeholder="The show's name over the title" />
                        </>)}
                        {l.template === "chapter" && (<>
                            <label className="flex items-center gap-1">
                                Chapter
                                <NumberField label="Chapter number" value={Number(l.fields.number) || 1} min={1} max={99}
                                    onChange={v => set({ fields: { ...l.fields, number: String(Math.round(v)) } })} />
                            </label>
                            <input value={l.fields.title} maxLength={200} aria-label="Chapter title" onChange={e => set({ fields: { ...l.fields, title: e.target.value } })}
                                className={field} placeholder="The chapter's title" />
                        </>)}
                        {l.template === "pullQuote" && (<>
                            <input value={l.fields.quote} maxLength={200} aria-label="Quote" onChange={e => set({ fields: { ...l.fields, quote: e.target.value } })}
                                className={field} placeholder="The quote, word for word" />
                            <input value={l.fields.speaker} maxLength={200} aria-label="Speaker" onChange={e => set({ fields: { ...l.fields, speaker: e.target.value } })}
                                className={field} placeholder="Who said it (the line under the quote)" />
                        </>)}
                        {l.template === "keyIdea" && (<>
                            <input value={l.fields.term} maxLength={200} aria-label="Term" onChange={e => set({ fields: { ...l.fields, term: e.target.value } })}
                                className={field} placeholder="The idea's name" />
                            <input value={l.fields.definition} maxLength={200} aria-label="Definition" onChange={e => set({ fields: { ...l.fields, definition: e.target.value } })}
                                className={field} placeholder="One plain sentence" />
                        </>)}
                        {(l.template === "logoBug" || l.template === "endScreen" || l.template === "logoSting") && (
                            <p className={hint}>No words of its own: it draws the Studio&apos;s logo and colours.</p>
                        )}
                        <p className={hint}>Drawn by the template in the Studio&apos;s colours; it places and fades itself (spec 021).</p>
                    </Section>
                )}
                {l.kind === "text" && (
                    <Section title="Text">
                        <input value={l.text} maxLength={200} aria-label="Text" onChange={e => set({ text: e.target.value })} className={field} placeholder="Text" />
                        <input value={l.subtext} maxLength={200} aria-label="Second line" onChange={e => set({ subtext: e.target.value })} className={field}
                            placeholder={l.element === "lowerThird" ? "Role, such as Host or Author" : "Smaller second line (optional)"} />
                        <LookFields look={l} positions="none" onChange={c => set(c as Partial<Layer>)} />
                        <div className="flex flex-wrap items-center gap-3">
                            {l.background === "box" && (
                                <label className="flex items-center gap-1" title="The band behind the text">
                                    Band
                                    <select aria-label="Band" value={l.band ? (l.band === brand.colors.background ? "brand" : "own") : "dark"} className={small}
                                        onChange={e => set({ band: e.target.value === "dark" ? undefined : e.target.value === "brand" ? brand.colors.background : l.band ?? brand.colors.background })}>
                                        <option value="dark">Dark, see-through</option>
                                        <option value="brand">Brand colour</option>
                                        {l.band && l.band !== brand.colors.background && <option value="own">Its own colour</option>}
                                    </select>
                                    {l.band && <input type="color" aria-label="Band colour" value={l.band} onChange={e => set({ band: e.target.value })}
                                        className="h-7 w-10 rounded border border-white/10 bg-transparent" />}
                                </label>
                            )}
                            {l.subtext && (
                                <label className="flex items-center gap-1">
                                    Second line
                                    <input type="color" aria-label="Second line colour" value={l.subColor ?? l.color} onChange={e => set({ subColor: e.target.value })}
                                        className="h-7 w-10 rounded border border-white/10 bg-transparent" />
                                    <button type="button" className={`${secondary} px-2 py-0.5`} title="The brand's accent colour" onClick={() => set({ subColor: brand.colors.accent })}>Accent</button>
                                </label>
                            )}
                        </div>
                    </Section>
                )}

                {"fromEnd" in l.anchor ? (
                    <Section title="Time">
                        {/* The end screen sits against the programme's end (lib/graphics.ts programmeWindow). */}
                        <p className={hint}>Over the video&apos;s last {Math.round(l.durationMs / 1000)} s — on the outro when there is one, wherever the video ends.</p>
                    </Section>
                ) : (
                <Section title="Time">
                    <div className="flex flex-wrap items-center gap-2">
                        <span>Starts at</span>
                        <button type="button" className={`${secondary} px-2 py-0.5`} title="Jump there"
                            onClick={() => { if (span) onSeek(sourceTime(clips, span.startMs + Math.min(400, l.in.durationMs) + 50) ?? 0); }}>
                            {span ? mmss(span.startMs) : "after the end"}
                        </button>
                        <button type="button" className={`${secondary} px-2 py-0.5`} title="Start it where the playhead is"
                            onClick={() => onChange(startAt(l, nowEdited, a => sourceTime(clips, a)))}>
                            Start at {mmss(nowEdited)}
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {/* A graphic is drawn frame by frame, so its length is capped (lib/graphics.ts). */}
                        {l.kind !== "graphic" && (
                            <label className="flex items-center gap-1">
                                <input type="checkbox" checked={isWhole(l)} aria-label="To the end of the episode"
                                    onChange={e => set({ durationMs: e.target.checked ? WHOLE_EPISODE_MS : Math.max(LAYER_MIN_MS, Math.min(10_000, span ? span.endMs - span.startMs : 5000)) })} />
                                To the end of the episode
                            </label>
                        )}
                        {!isWhole(l) && (
                            <label className="flex items-center gap-1">
                                for
                                <NumberField label="Seconds on screen" value={l.durationMs / 1000} min={LAYER_MIN_MS / 1000}
                                    max={l.kind === "graphic" ? GRAPHIC_MAX_MS / 1000 : 86_399} step={0.5}
                                    onChange={v => set({ durationMs: Math.round(v * 1000) })} />
                                s
                            </label>
                        )}
                    </div>
                    <select aria-label="Anchor" value={pinned ? "pinned" : "words"} className={`${small} self-start`}
                        title="Moves with its words when cuts change, or stays at its time in the edited video"
                        onChange={e => {
                            if (!span) return;
                            set({ anchor: e.target.value === "pinned" ? { atMs: span.startMs } : { srcMs: Math.round(sourceTime(clips, span.startMs) ?? 0) } });
                        }}>
                        <option value="words">Moves with the words</option>
                        <option value="pinned">Stays at this time</option>
                    </select>
                    {anchorCut(l, clips) && <p className="text-amber-300">Its moment is cut, so it shows at the next kept moment.</p>}
                </Section>
                )}

                {l.kind !== "graphic" && (
                <Section title="Position and size">
                    <div className="flex items-start gap-3">
                        <div role="group" aria-label="Position" className="grid grid-cols-3 gap-0.5 rounded border border-white/10 p-0.5 shrink-0" style={{ width: 72, aspectRatio: "16 / 9" }}>
                            {GRID.map(p => (
                                <button key={p} type="button" aria-label={POSITION_LABELS[p]} aria-pressed={pos === p} title={POSITION_LABELS[p]}
                                    onClick={() => set({ place: placeOf(p, mh, mv) })}
                                    className={`rounded-sm ${pos === p ? "bg-amber-300" : "bg-white/10 hover:bg-white/30"}`} />
                            ))}
                        </div>
                        <div className="flex flex-col gap-1">
                            <span>{pos === "custom" ? "Where you dragged or typed it" : POSITION_LABELS[pos]}</span>
                            <label className="flex items-center gap-1" title="Which point of the layer is placed at X and Y">
                                Its
                                <select aria-label="Pinned point" value={l.place.align} className={small}
                                    onChange={e => set({ place: { ...l.place, align: Number(e.target.value) } })}>
                                    {GRID.map(p => <option key={p} value={ALIGN[p]}>{POSITION_LABELS[POINT_OF[ALIGN[p]]].toLowerCase()}</option>)}
                                </select>
                                point at
                            </label>
                            <div className="flex items-center gap-1">
                                X <NumberField label="X, in pixels" title="From the left edge, in pixels of the 1920 × 1080 render" value={Math.round(l.place.x * FRAME.width)}
                                    min={-FRAME.width} max={FRAME.width * 2} onChange={v => set({ place: { ...l.place, x: v / FRAME.width } })} />
                                Y <NumberField label="Y, in pixels" title="From the top edge, in pixels of the 1920 × 1080 render" value={Math.round(l.place.y * FRAME.height)}
                                    min={-FRAME.height} max={FRAME.height * 2} onChange={v => set({ place: { ...l.place, y: v / FRAME.height } })} />
                            </div>
                        </div>
                    </div>
                    {l.kind !== "text" && (
                        <label className="flex items-center gap-2">
                            Width
                            <input type="range" min={2} max={100} value={Math.min(100, Math.round(l.w * 100))} aria-label="Width" onChange={e => set({ w: Number(e.target.value) / 100 })} />
                            <NumberField label="Width, % of the frame" value={Math.round(l.w * 1000) / 10} min={2} max={200} step={0.5} onChange={v => set({ w: v / 100 })} />
                            %
                        </label>
                    )}
                </Section>
                )}

                <Section title="Look">
                    <label className="flex items-center gap-2">
                        Opacity
                        <input type="range" min={5} max={100} value={Math.round(l.opacity * 100)} aria-label="Opacity" onChange={e => set({ opacity: Number(e.target.value) / 100 })} />
                        {Math.round(l.opacity * 100)}%
                    </label>
                    {/* A graphic's in and out are the template's own motion (spec 021), so its edges stay off. */}
                    {l.kind !== "graphic" && <EdgeFields label="In" edge={l.in} onChange={e => set({ in: e })} />}
                    {l.kind !== "graphic" && <EdgeFields label="Out" edge={l.out} onChange={e => set({ out: e })} />}
                    {l.kind === "image" && (
                        <label className="flex items-center gap-2" title="A slow zoom or pan, as the b-roll has; it fills a 16:9 box">
                            Motion
                            <select aria-label="Motion" value={l.motion} className={small} onChange={e => set({ motion: e.target.value as Motion })}>
                                {MOTIONS.map(m => <option key={m} value={m}>{MOTION_LABELS[m]}</option>)}
                            </select>
                        </label>
                    )}
                </Section>

                {l.kind === "video" && (
                    <Section title="Video">
                        <label className="flex items-center gap-1" title="Where in the clip it starts">
                            Starts
                            <NumberField label="Start in the clip, seconds" value={l.trimInMs / 1000} min={0} max={86_399} step={0.5}
                                onChange={v => set({ trimInMs: Math.round(v * 1000) })} />
                            s into the clip
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                            <select aria-label="Sound" value={l.volumeDb === null ? "off" : "on"} className={small}
                                onChange={e => set({ volumeDb: e.target.value === "off" ? null : 0 })}>
                                <option value="off">Its sound off</option>
                                <option value="on">Its sound on</option>
                            </select>
                            {l.volumeDb !== null && (
                                <label className="flex items-center gap-1">
                                    <input type="range" min={-30} max={6} value={l.volumeDb} aria-label="Its volume" onChange={e => set({ volumeDb: Number(e.target.value) })} />
                                    {l.volumeDb} dB
                                </label>
                            )}
                        </div>
                    </Section>
                )}
            </fieldset>
        </section>
    );
}
