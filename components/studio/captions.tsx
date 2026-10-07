"use client";

// Why: the Studio editor's captions (spec 020 item E8, decision U1). The YouTube caption track is what most
// viewers who want captions see, and nothing is burned in unless Part I's option is on (N1). So the editor
// shows that track before rendering: the cues the render's .srt will have (lib/captions.ts editCues), on the
// CC lane of the timeline, over the preview when CC is on, and listed in the Captions panel, where a caption
// too fast to read is marked in amber. A wrong word is fixed in the script (019 item 2.3), which fixes its
// caption too. The burned-in option and its look moved here from the On screen panel.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cueAt, cueCps, cueTooFast, MAX_CPS, type Cue } from "@/lib/captions";
import { DEFAULT_CAPTION_STYLE, type CaptionChoice, type CaptionStyle } from "@/lib/onScreen";
import type { EpisodeEdit } from "@/lib/edit";
import { sourceTime, timelineTime, type Clip } from "@/lib/sequence";
import { hint } from "@/components/studio/ui";
import { useFrameTime } from "@/components/studio/layers";
import { LookFields, mmss } from "@/components/studio/onScreen";

// Over the video, when CC is on: the caption being spoken, drawn roughly as YouTube's player draws its
// captions (white on a dark box, low in the middle). Not burned in; the render does not have it.
export function CaptionTrackPreview({ cues, clips, video }: {
    cues: Cue[]; clips: Clip[]; video: React.RefObject<HTMLVideoElement | null>;
}) {
    const { ms } = useFrameTime(video);
    const at = timelineTime(clips, ms);
    const cue = at === null ? undefined : cues[cueAt(cues, at)];
    if (!cue) return null;
    return (
        <div aria-label="Caption track preview" className="pointer-events-none absolute inset-x-0 bottom-[7%] flex flex-col items-center gap-0"
            style={{ fontFamily: "Roboto, Arial, sans-serif", fontSize: "2.6cqw", lineHeight: 1.25 }}>
            {cue.lines.map((l, i) => (
                <span key={i} className="px-[0.3em] text-white" style={{ backgroundColor: "rgba(8,8,8,0.75)" }}>{l}</span>
            ))}
        </div>
    );
}

const CueRow = memo(function CueRow({ cue, index, current, onPick }: {
    cue: Cue; index: number; current: boolean; onPick: (index: number) => void;
}) {
    const fast = cueTooFast(cue);
    return (
        <li data-cue={index} aria-current={current || undefined}
            className={`rounded border px-2 py-1 flex gap-2 text-xs cursor-pointer ${current ? "border-amber-400/70 bg-amber-500/5" : fast ? "border-amber-500/40 bg-amber-500/[0.04] hover:bg-amber-500/10" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"}`}
            onClick={() => onPick(index)}>
            <span className="tabular-nums text-gray-400 shrink-0 w-10">{mmss(cue.startMs)}</span>
            <span className={`grow ${fast ? "text-amber-200" : "text-gray-200"}`}>{cue.lines.map((l, i) => <span key={i} className="block">{l}</span>)}</span>
            {fast && <span className="text-amber-300 shrink-0 tabular-nums" title={`${Math.round(cueCps(cue))} characters a second: over ${MAX_CPS} is hard to read before it goes`}>{Math.round(cueCps(cue))}/s</span>}
        </li>
    );
});

// The Captions panel: the burned-in option, CC over the preview, and the YouTube track's captions on the
// edited timeline. Click one to go there (the script follows, so a wrong word can be retyped).
export function CaptionsPanel({ cues, clips, edit, studio, shown, onShown, onCaptions, video, onSeek }: {
    cues: Cue[];
    clips: Clip[];
    edit: EpisodeEdit;
    studio: CaptionChoice;
    shown: boolean;
    onShown: (shown: boolean) => void;
    onCaptions: (captions: CaptionChoice | null) => void;
    video: React.RefObject<HTMLVideoElement | null>;
    onSeek: (ms: number) => void;
}) {
    const { ms, playing } = useFrameTime(video);
    const at = timelineTime(clips, ms);
    const current = at === null ? -1 : cueAt(cues, at);
    const [onlyFast, setOnlyFast] = useState(false);
    const fastCount = useMemo(() => cues.filter(cueTooFast).length, [cues]);
    const rows = useMemo(() => cues.map((cue, index) => ({ cue, index })).filter(r => !onlyFast || cueTooFast(r.cue)), [cues, onlyFast]);
    const list = useRef<HTMLUListElement>(null);
    // While playing, the caption being spoken stays in view.
    useEffect(() => {
        if (playing && current >= 0) list.current?.querySelector(`[data-cue="${current}"]`)?.scrollIntoView({ block: "nearest" });
    }, [current, playing]);
    const pick = useCallback((index: number) => {
        const c = cues[index];
        if (c) onSeek(sourceTime(clips, c.startMs) ?? 0);
    }, [cues, clips, onSeek]);
    const nextFast = () => {
        const from = current >= 0 ? current + 1 : cues.findIndex(c => at !== null && c.startMs > at);
        const i = cues.findIndex((c, k) => k >= Math.max(0, from) && cueTooFast(c));
        pick(i >= 0 ? i : cues.findIndex(cueTooFast));
    };

    const studioLook: CaptionStyle = studio.style ?? DEFAULT_CAPTION_STYLE;
    const mode = edit.captions ? (edit.captions.on ? "own" : "off") : "studio";

    return (
        <section aria-label="Captions" className="rounded-lg bg-[#130b29] border border-white/5 p-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-gray-200">Captions</span>
                <span className={hint}>
                    The YouTube caption track: made from this edit&apos;s words when it is rendered, and uploaded with the video, not burned in.
                    A wrong word is fixed in the script (click a caption to go there, then double-click the word), which fixes its caption too.
                    Times are in the edited episode, before any teasers and intro. When Descript makes the final cut, the track comes from its transcript instead.
                </span>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-200">
                <input type="checkbox" checked={shown} onChange={e => onShown(e.target.checked)} aria-label="Show the caption track over the preview" />
                Show them over the preview (CC)
            </label>

            {/* Part I's burned-in captions: the Studio's choice, a look of its own, or none (N1). */}
            <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-2">
                <span className="text-sm font-medium text-gray-200">Burned in</span>
                <span className={hint}>Drawn into the picture, so every viewer sees them, on top of the YouTube track. Off unless the Studio settings or this video turn them on.</span>
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-200">
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

            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                <span>{cues.length} caption{cues.length === 1 ? "" : "s"}</span>
                {fastCount > 0 ? (
                    <>
                        <span className="text-amber-300">· {fastCount} too fast to read (over {MAX_CPS} characters a second)</span>
                        <button type="button" onClick={nextFast} className="text-amber-200 underline underline-offset-2">Next one</button>
                        <label className="flex items-center gap-1">
                            <input type="checkbox" checked={onlyFast} onChange={e => setOnlyFast(e.target.checked)} /> Only those
                        </label>
                    </>
                ) : cues.length > 0 && <span className="text-gray-400">· all readable</span>}
            </div>
            {cues.length === 0 && <p className={hint}>No captions: the transcript has no words kept in this edit.</p>}
            <ul ref={list} aria-label="Caption track" className="flex flex-col gap-1">
                {rows.map(r => <CueRow key={r.index} cue={r.cue} index={r.index} current={r.index === current} onPick={pick} />)}
            </ul>
        </section>
    );
}
