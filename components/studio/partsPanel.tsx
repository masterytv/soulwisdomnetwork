"use client";

// Why: moving clips (spec 020 item E9). The splits divide the episode into sections; here they can be put in another
// order (also by dragging them on the timeline's V1, item E11, which draws them in play order), and the episode can have its
// own intro or outro from its media instead of the Studio's. Everything that follows the edit's times (the preview,
// captions, chapters, layers anchored to words, the render) follows the new order (lib/sequence.ts).

import { memo } from "react";
import { moveSection, sectionsOf, validOrder, type EpisodeEdit } from "@/lib/edit";
import type { BinItem } from "@/lib/layers";
import type { Clip } from "@/lib/sequence";
import { hint, secondary } from "@/components/studio/ui";
import { mmss } from "@/components/studio/onScreen";

type Patch = Pick<EpisodeEdit, "order" | "intro" | "outro">;

export const PartsPanel = memo(function PartsPanel({ edit, totalMs, clips, words, videos, onChange, onSeek }: {
    edit: EpisodeEdit;
    totalMs: number;
    clips: Clip[];                                  // the play order, for what each section keeps
    words: { text: string; start: number }[];
    videos: BinItem[];                              // the episode's media bin videos
    onChange: (patch: Partial<Patch>) => void;
    onSeek: (srcMs: number) => void;
}) {
    const sections = sectionsOf(edit.splits ?? [], totalMs);
    const order = validOrder(edit.order, sections.length) ? edit.order : sections.map((_, i) => i);
    const kept = (s: { startMs: number; endMs: number }) => clips.reduce((t, c) => t + Math.max(0, Math.min(c.endMs, s.endMs) - Math.max(c.startMs, s.startMs)), 0);
    const opening = (s: { startMs: number; endMs: number }) => words.filter(w => w.start >= s.startMs && w.start < s.endMs).slice(0, 7).map(w => w.text).join(" ");
    const moved = order.some((v, i) => v !== i);
    const pick = (key: "intro" | "outro", path: string) => {
        const v = videos.find(x => x.path === path);
        onChange({ [key]: v ? { path: v.path, name: v.name } : null });
    };
    return (
        <section aria-label="Parts" className="rounded-lg bg-[#130b29] border border-white/5 p-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-gray-200">Parts</span>
                <span className={hint}>
                    The sections between splits, in the order they play. Move one earlier or later; the preview, captions, chapters and render follow.
                    Or drag a section along V1 on the timeline, which shows them in this order. Split with S or the Blade first.
                </span>
            </div>
            {sections.length < 2 ? <p className={hint}>One section: add a split to move parts.</p> : (
                <ol className="flex flex-col gap-1">
                    {order.map((s, i) => {
                        const sec = sections[s];
                        return (
                            <li key={s} data-section={s} className="flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] px-2 py-1 text-xs">
                                <button type="button" onClick={() => onSeek(sec.startMs)} className="grow text-left text-gray-200 hover:text-white">
                                    <span className="tabular-nums text-gray-400">{mmss(sec.startMs)}–{mmss(sec.endMs)}</span>{" "}
                                    <span className="text-gray-400">({mmss(kept(sec))} kept)</span>{" "}
                                    <span className="italic">{opening(sec) || "…"}</span>
                                </button>
                                <button type="button" aria-label={`Move part ${i + 1} earlier`} disabled={i === 0}
                                    onClick={() => onChange({ order: moveSection(order, sections.length, i, i - 1) })} className="px-1 text-gray-300 disabled:opacity-30">↑</button>
                                <button type="button" aria-label={`Move part ${i + 1} later`} disabled={i === order.length - 1}
                                    onClick={() => onChange({ order: moveSection(order, sections.length, i, i + 1) })} className="px-1 text-gray-300 disabled:opacity-30">↓</button>
                            </li>
                        );
                    })}
                </ol>
            )}
            {moved && <button type="button" onClick={() => onChange({ order: null })} className={`${secondary} self-start`}>Back to the recording&apos;s order</button>}
            <div className="flex flex-col gap-2 border-t border-white/10 pt-2">
                <span className={hint}>This episode&apos;s own intro and outro, from its media (upload a video in the Media panel), instead of the Studio&apos;s.</span>
                {(["intro", "outro"] as const).map(key => (
                    <label key={key} className="flex flex-wrap items-center gap-2 text-sm text-gray-200">
                        {key === "intro" ? "Intro" : "Outro"}
                        <select aria-label={key === "intro" ? "This episode's intro" : "This episode's outro"} value={edit[key]?.path ?? ""}
                            onChange={e => pick(key, e.target.value)} className="max-w-full min-w-0 rounded border border-white/10 bg-[#1a1036] px-2 py-1 text-sm text-gray-200">
                            <option value="">The Studio&apos;s {key}</option>
                            {videos.map(v => <option key={v.path} value={v.path}>{v.name}</option>)}
                        </select>
                    </label>
                ))}
            </div>
        </section>
    );
});
