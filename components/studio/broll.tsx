"use client";

// B-roll on the show notes page: loads what has been found or made, starts the Podcast B-roll run (stock footage and
// photos first, docs/specs/023-stock-broll.md; AI images for the rest, docs/specs/008-broll-images.md), and checks back
// while it works. B-roll can be skipped instead, which lets editing and the edit package go ahead without it
// (lib/brollGate.ts).

import { useCallback, useEffect, useState } from "react";
import { ago } from "@/components/studio/format";
import { BROLL_STYLES, BROLL_USD_PER_IMAGE, type BrollStyle } from "@/lib/broll";
import { STOCK_LABELS } from "@/lib/stockBroll";
import { studioFetch } from "@/lib/studioClient";
import type { BrollView } from "@/types/studio";

export function useBroll(episodeId: string, enabled: boolean) {
    const [view, setView] = useState<BrollView | null>(null);
    const [error, setError] = useState("");
    const [starting, setStarting] = useState(false);

    const load = useCallback(async () => {
        try {
            setView(await studioFetch<BrollView>(`/api/studio/episodes/${episodeId}/broll`));
            setError("");
        } catch (e) {
            setError((e as Error).message);
        }
    }, [episodeId]);

    useEffect(() => {
        if (enabled) load();
    }, [enabled, load]);

    const working = view?.status === "queued" || view?.status === "generating";
    useEffect(() => {
        if (!working) return;
        const timer = setInterval(load, 8000);
        return () => clearInterval(timer);
    }, [working, load]);

    // "stock": real footage and photos (free); "ai": AI images. `index` does one idea.
    const generate = useCallback(async (index: number | null, mode: "stock" | "ai") => {
        setStarting(true);
        try {
            await studioFetch(`/api/studio/episodes/${episodeId}/broll`, { method: "POST", body: JSON.stringify({ index, mode }) });
            await load();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setStarting(false);
        }
    }, [episodeId, load]);

    // Skips b-roll, or takes the skip back: editing and the edit package wait for b-roll unless it is skipped.
    const setSkipped = useCallback(async (skip: boolean) => {
        setStarting(true);
        try {
            await studioFetch(`/api/studio/episodes/${episodeId}/broll`, { method: "POST", body: JSON.stringify({ skip }) });
            await load();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setStarting(false);
        }
    }, [episodeId, load]);

    const image = (index: number) => view?.images.find(i => i.index === index);
    return { view, error, working, starting, generate, setSkipped, image };
}

export type Broll = ReturnType<typeof useBroll>;

const BUTTON = "text-xs px-2 py-1 rounded border border-white/10 text-gray-300 hover:border-amber-400/50 hover:text-amber-200 " +
    "disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:text-gray-300";

// The b-roll for one idea (stock footage, a stock photo or an AI image), or where it stands, with two buttons:
// other stock, or an AI image instead.
export function BrollImageView({ broll, index, idea, style, disabled, disabledWhy }: {
    broll: Broll; index: number; idea: string; style: BrollStyle; disabled: boolean; disabledWhy: string;
}) {
    const image = broll.image(index);
    const pending = broll.working && (broll.view?.only === null || broll.view?.only === index);
    const doing = broll.view?.mode === "stock" ? "Searching stock…" : "Generating…";
    const stock = !!image && image.source !== "ai";
    const buttons = (
        <div className="flex flex-wrap gap-2">
            <button onClick={() => void broll.generate(index, "stock")} disabled={disabled} className={BUTTON}
                title={disabled ? disabledWhy : "Look for stock footage, or a photo, for this idea (free)"}>
                {stock ? "Find other stock" : "Find stock"}
            </button>
            <button onClick={() => void broll.generate(index, "ai")} disabled={disabled} className={BUTTON}
                title={disabled ? disabledWhy : `About $${BROLL_USD_PER_IMAGE.toFixed(2)} with OpenAI's image model`}>
                {image?.source === "ai" ? "New AI image" : "AI image instead"}
            </button>
        </div>
    );
    if (!image) {
        if (pending) return <p className="text-xs text-sky-300">{doing}</p>;
        return <div className="flex flex-col gap-1"><p className="text-xs text-gray-500">No b-roll yet.</p>{buttons}</div>;
    }
    const video = image.kind === "video";
    const preview = `w-48 aspect-video object-cover rounded-lg bg-black ${pending ? "opacity-40" : ""}`;
    return (
        <div className="flex gap-3 items-start">
            {video ? (
                <video src={image.url} muted loop playsInline controls preload="metadata" className={`${preview} shrink-0`} />
            ) : (
                <a href={image.url} target="_blank" rel="noreferrer" title="Open full size" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
                    <img src={image.url} alt={image.idea} className={preview} />
                </a>
            )}
            <div className="flex flex-col gap-1 text-xs text-gray-400 min-w-0">
                {pending && <span className="text-sky-300">{doing}</span>}
                {image.idea !== idea.trim() && (
                    <span className="text-amber-300">The idea has changed since this b-roll was {stock ? "found" : "made"}.</span>
                )}
                {!stock && image.style !== style && (
                    <span className="text-amber-300">Made in the {BROLL_STYLES[image.style].label} style; this idea is now {BROLL_STYLES[style].label}.</span>
                )}
                {image.source !== "ai" ? (
                    <>
                        <span>
                            {video ? "Footage" : "Photo"}{image.seconds ? ` (${Math.round(image.seconds)} s)` : ""} by{" "}
                            {image.credit?.url
                                ? <a href={image.credit.url} target="_blank" rel="noreferrer" className="text-amber-300 hover:underline">{image.credit.name}</a>
                                : image.credit?.name ?? "unknown"}
                            {" "}on{" "}
                            {image.pageUrl
                                ? <a href={image.pageUrl} target="_blank" rel="noreferrer" className="text-amber-300 hover:underline">{STOCK_LABELS[image.source]}</a>
                                : STOCK_LABELS[image.source]}
                            {" "}· free{image.createdAt ? ` · ${ago(image.createdAt)}` : ""}
                        </span>
                        <span>Searched for: {image.prompt}</span>
                    </>
                ) : (
                    <>
                        <span>AI · {BROLL_STYLES[image.style].label} · {image.model} · ${image.usd.toFixed(2)}{image.createdAt ? ` · ${ago(image.createdAt)}` : ""}</span>
                        <details>
                            <summary className="cursor-pointer hover:text-gray-300">Prompt</summary>
                            <p className="whitespace-pre-wrap mt-1">{image.prompt}</p>
                        </details>
                    </>
                )}
                {buttons}
            </div>
        </div>
    );
}
