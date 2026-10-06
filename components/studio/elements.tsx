"use client";

// Why: the Studio editor's Elements panel (spec 020 item E6): a title card, a lower third (or one for every
// speaker, the first time each talks, from the transcript's names), the logo bug for the whole episode, and
// plain text. Each is a layer (lib/layers.ts) in the Studio's brand colours and font (Studio settings,
// spec 018), added at the playhead and then changed in the Properties panel.

import { newText } from "@/lib/onScreen";
import { lowerThird, lowerThirds, logoBug, titleCard, toLayer, type Brand, type Layer } from "@/lib/layers";
import type { BinItem } from "@/lib/layers";
import type { SpokenWord } from "@/lib/showNotes";
import { hint, secondary } from "@/components/studio/ui";
import { useVideoTime } from "@/components/studio/useVideoTime";
import { mmss, textStyle } from "@/components/studio/onScreen";

// A small picture of an element, in the brand's colours over a dark frame.
function Sample({ children, align }: { children: React.ReactNode; align: string }) {
    return (
        <div aria-hidden className={`relative w-24 shrink-0 rounded bg-gradient-to-b from-gray-700 to-gray-900 overflow-hidden flex ${align}`}
            style={{ aspectRatio: "16 / 9", containerType: "inline-size" }}>
            {children}
        </div>
    );
}

export function ElementsPanel({ words, layers, brand, logo, video, canEdit, onAdd, onOpen }: {
    words: SpokenWord[];
    layers: Layer[];
    brand: Brand;
    logo: BinItem | null;                  // the media bin's logo: the Studio's, or the site's
    video: React.RefObject<HTMLVideoElement | null>;
    canEdit: boolean;
    onAdd: (made: Layer[]) => void;        // added, and the first one chosen
    onOpen: (id: string) => void;          // an element already there, chosen
}) {
    const currentMs = useVideoTime(video);
    const speakers = [...new Set(words.map(w => w.speaker).filter(Boolean))];
    const bug = layers.find(l => l.kind === "image" && l.element === "logo");
    const forEverySpeaker = lowerThirds(words, layers, brand);
    const card = titleCard(0, brand), third = lowerThird(0, speakers[0] ?? "Name", "Role", brand);
    const at = mmss(currentMs);
    const row = "flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-2";

    return (
        <section aria-label="Elements" className="flex flex-col gap-3">
            <div>
                <h2 className="text-sm font-semibold text-gray-200">Elements</h2>
                <p className={hint}>In the Studio&apos;s colours and font (Studio settings). Each is added at the playhead; change it in Properties.</p>
            </div>
            {!canEdit && <p className="text-sm text-amber-300">The media bin did not load, so layers cannot be added now. Reload the page.</p>}

            <div className={row}>
                <Sample align="items-center justify-center">
                    <span style={{ ...textStyle({ ...card, size: "huge" }), fontSize: "18cqw" }}>Title</span>
                </Sample>
                <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm text-gray-200">Title card</span>
                    <span className={hint}>Centred, in the accent colour, for 4 s.</span>
                    <button type="button" disabled={!canEdit} className={`${secondary} self-start px-2 py-0.5`}
                        onClick={() => onAdd([titleCard(currentMs, brand)])}>+ Title card at {at}</button>
                </div>
            </div>

            <div className={row}>
                <Sample align="items-end justify-start p-1.5">
                    <span style={{ ...textStyle(third), fontSize: "13cqw", lineHeight: 1.1 }}>
                        {third.text}
                        <span style={{ display: "block", fontSize: "0.6em", color: third.subColor }}>Role</span>
                    </span>
                </Sample>
                <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm text-gray-200">Lower third</span>
                    <span className={hint}>A name and role in the lower left, for 5 s. Hosts in Studio settings are marked Host.</span>
                    <div className="flex flex-wrap gap-1">
                        <button type="button" disabled={!canEdit} className={`${secondary} px-2 py-0.5`}
                            onClick={() => onAdd([lowerThird(currentMs, "Name", "", brand)])}>+ Lower third at {at}</button>
                        <button type="button" disabled={!canEdit || !forEverySpeaker.length} className={`${secondary} px-2 py-0.5`}
                            title={speakers.length && !forEverySpeaker.length ? "Every speaker already has one" : "Where each speaker first talks"}
                            onClick={() => onAdd(forEverySpeaker)}>
                            + For every speaker{forEverySpeaker.length ? ` (${forEverySpeaker.length})` : ""}
                        </button>
                    </div>
                </div>
            </div>

            <div className={row}>
                <Sample align="items-start justify-end p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL or the site's logo */}
                    {logo?.url ? <img src={logo.url} alt="" className="w-[18%] opacity-80" /> : <span className="w-3 h-3 rounded-sm bg-white/60" />}
                </Sample>
                <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm text-gray-200">Logo bug</span>
                    <span className={hint}>The Studio&apos;s logo (Studio settings; the site&apos;s if none), small in the top right for the whole episode.</span>
                    {bug ? (
                        <button type="button" className={`${secondary} self-start px-2 py-0.5`} onClick={() => onOpen(bug.id)}>The logo bug is on: change it</button>
                    ) : (
                        <button type="button" disabled={!canEdit || !logo} className={`${secondary} self-start px-2 py-0.5`}
                            onClick={() => logo && onAdd([logoBug(logo)])}>+ Logo bug</button>
                    )}
                </div>
            </div>

            <div className={row}>
                <Sample align="items-center justify-center">
                    <span style={{ ...textStyle({ font: brand.font, size: "large", color: "#ffffff", background: "box" }), fontSize: "10cqw" }}>Text</span>
                </Sample>
                <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm text-gray-200">Text</span>
                    <span className={hint}>Anything else, in the middle, for 5 s.</span>
                    <button type="button" disabled={!canEdit} className={`${secondary} self-start px-2 py-0.5`}
                        onClick={() => onAdd([toLayer(newText(`o${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, currentMs, { font: brand.font, size: "large", color: "#ffffff", background: "box", position: "middle" }))])}>
                        + Text at {at}
                    </button>
                </div>
            </div>
        </section>
    );
}
