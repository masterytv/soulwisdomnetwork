"use client";

// Why: the Studio editor's Elements panel (spec 020 item E6, grown by spec 021 M2): the motion graphics
// templates first (Tom's D1: they are the show's look — the title card, lower third, chapter, pull quote,
// key idea, logo bug, end screen and logo sting, drawn by agent/src/podcast/graphics/templates/ in the
// Studio's colours), then the simple ASS title card, lower third and still logo bug, and plain text. Each
// is a layer (lib/layers.ts), added at the playhead and then changed in the Properties panel; the title
// card, logo bug and end screen exist once each.

import { newText } from "@/lib/onScreen";
import {
    highlight, lowerThird, lowerThirds, logoBug, motionChapter, motionEndScreen, motionKeyIdea, motionLogoBug, motionLogoSting,
    motionLowerThird, motionPullQuote, motionTitleCard, titleCard, toLayer, type Brand, type GraphicLayer, type Layer,
} from "@/lib/layers";
import type { BinItem } from "@/lib/layers";
import { GRAPHIC_TEMPLATES, type GraphicTemplate } from "@/lib/graphics";
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

// The four-point star, the motion templates' signature.
function Star({ accent, size = "0.8em" }: { accent: string; size?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path d="M12 0C12.9 8 16 11.1 24 12C16 12.9 12.9 16 12 24C11.1 16 8 12.9 0 12C8 11.1 11.1 8 12 0Z" fill={accent} />
        </svg>
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
    const hosts = new Set(brand.hosts.map(h => h.trim().toLowerCase()));
    const guest = speakers.find(s => !hosts.has(s.trim().toLowerCase())) ?? "";
    const bug = layers.find(l => l.kind === "image" && l.element === "logo");
    const graphic = (t: GraphicTemplate) => layers.filter((l): l is GraphicLayer => l.kind === "graphic" && l.template === t);
    // The next chapter's number: one past the highest placed, and II with none (the first chapter has no card).
    const nextChapter = Math.max(1, ...graphic("chapter").map(g => (g.template === "chapter" ? Number(g.fields.number) || 1 : 1))) + 1;
    const forEverySpeaker = lowerThirds(words, layers, brand);
    const card = titleCard(0, brand), third = lowerThird(0, speakers[0] ?? "Name", "Role", brand);
    const at = mmss(currentMs);
    const row = "flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-2";
    const accent = brand.colors.accent;

    // One motion template's row: its star sample, what it is, and the add (or change) button.
    const motionRow = (o: { template: GraphicTemplate; sampleText?: string; align?: string; what: string; make: () => Layer[]; atPlayhead?: boolean }) => {
        const info = GRAPHIC_TEMPLATES[o.template];
        const single = o.template === "titleCard" || o.template === "logoBug" || o.template === "endScreen";
        const there = single ? graphic(o.template)[0] : undefined;
        return (
            <div key={o.template} className={row}>
                <Sample align={o.align ?? "items-center justify-center"}>
                    <span aria-hidden className="flex items-center gap-[2cqw]" style={{ color: "#fff", fontSize: "11cqw", lineHeight: 1.1 }}>
                        <Star accent={accent} />
                        {o.sampleText && <span style={{ fontFamily: "serif", letterSpacing: "0.03em" }}>{o.sampleText}</span>}
                    </span>
                </Sample>
                <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm text-gray-200">{info.label}</span>
                    <span className={hint}>{o.what}</span>
                    {there ? (
                        <button type="button" className={`${secondary} self-start px-2 py-0.5`} onClick={() => onOpen(there.id)}>It is on: change it</button>
                    ) : (
                        <button type="button" disabled={!canEdit} className={`${secondary} self-start px-2 py-0.5`}
                            onClick={() => onAdd(o.make())}>+ {info.label}{o.atPlayhead ? ` at ${at}` : ""}</button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <section aria-label="Elements" className="flex flex-col gap-3">
            <div>
                <h2 className="text-sm font-semibold text-gray-200">Elements</h2>
                <p className={hint}>In the Studio&apos;s colours (Studio settings). The motion templates are the show&apos;s look (spec 021); each is added at the playhead and changed in Properties.</p>
            </div>
            {!canEdit && <p className="text-sm text-amber-300">The media bin did not load, so layers cannot be added now. Reload the page.</p>}

            {motionRow({ template: "titleCard", sampleText: "Title", what: "A banner over the bottom third: the star blooms and the title lands in Cinzel at the episode's start; the words in Properties.", make: () => [motionTitleCard("", guest)] })}
            {motionRow({ template: "lowerThird", sampleText: "Name", align: "items-end justify-start p-1.5", what: "The star spins in, the name slides in Cinzel, a rule draws; hosts get the compact variant.", make: () => [motionLowerThird(currentMs, speakers[0] ?? "", false)], atPlayhead: true })}
            {motionRow({ template: "chapter", sampleText: "II", what: `The numeral and the chapter title, a banner over the bottom third; the next would be chapter ${nextChapter}.`, make: () => [motionChapter(currentMs, nextChapter, "")], atPlayhead: true })}
            {motionRow({ template: "pullQuote", sampleText: "“ ”", what: "A full-screen quote, line by line on the starry sky; the words in Properties.", make: () => [motionPullQuote(currentMs, "", "")], atPlayhead: true })}
            {motionRow({ template: "keyIdea", sampleText: "Key", align: "items-center justify-end p-1.5", what: "The side card: KEY IDEA, a term and its one-line definition.", make: () => [motionKeyIdea(currentMs, "", "")], atPlayhead: true })}
            {motionRow({ template: "logoBug", align: "items-start justify-end p-1.5", what: "The logo top right with a slow glint, for the whole episode.", make: () => [motionLogoBug()] })}
            {motionRow({ template: "endScreen", sampleText: "End", what: "The 20 s end screen over the programme's last seconds, with the spaces YouTube's own elements fill.", make: () => [motionEndScreen()] })}
            {motionRow({ template: "logoSting", align: "items-center justify-center", what: "A short logo reveal; the spec offers the outro's start.", make: () => [motionLogoSting(currentMs)], atPlayhead: true })}

            {(() => {
                // A highlight (spec 021 M3): the picture itself reframed for a few seconds while the words
                // said there show. It starts on the next word; the layout and words change in Properties.
                const next = words.filter(w => w.start >= currentMs).slice(0, 8);
                const said = next.map(w => w.text).join(" ");
                return (
                    <div className={row}>
                        <Sample align="items-center justify-start p-1">
                            <span aria-hidden className="h-[70%] w-1/2 rounded-[2px] border" style={{ borderColor: accent }} />
                            <Star accent={accent} size="0.6em" />
                        </Sample>
                        <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-sm text-gray-200">Highlight</span>
                            <span className={hint}>The picture slides into a gold window (or dims, closes, is pushed aside) while the words said at the playhead show; it cannot sit on a cut, a teaser or another highlight.</span>
                            <button type="button" disabled={!canEdit} className={`${secondary} self-start px-2 py-0.5`}
                                onClick={() => onAdd([highlight(Math.round(next[0]?.start ?? currentMs), "splitQuote", said || "The words said here", "", next[0]?.speaker ?? "")])}>
                                + Highlight at {at}
                            </button>
                        </div>
                    </div>
                );
            })()}

            <div className={row}>
                <Sample align="items-center justify-center">
                    <span style={{ ...textStyle({ ...card, size: "huge" }), fontSize: "18cqw" }}>Title</span>
                </Sample>
                <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm text-gray-200">Title card (simple)</span>
                    <span className={hint}>Flat text, centred, in the accent colour, for 4 s.</span>
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
                    <span className="text-sm text-gray-200">Lower third (simple)</span>
                    <span className={hint}>Flat text in the lower left, for 5 s. Hosts in Studio settings are marked Host.</span>
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
                    <span className="text-sm text-gray-200">Logo bug (simple)</span>
                    <span className={hint}>The still logo (Studio settings; the site&apos;s if none), small in the top right for the whole episode.</span>
                    {bug ? (
                        <button type="button" className={`${secondary} self-start px-2 py-0.5`} onClick={() => onOpen(bug.id)}>It is on: change it</button>
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
