"use client";

// The audio podcast feed on the show notes page (spec 019 item 5.1, lib/server/podcast.ts): makes the final cut's MP3
// at −16 LUFS with its chapters and the show's artwork, lets you listen, and puts it in the site's podcast feed (or
// takes it out). The feed itself is turned on, with its artwork and category, in the Studio settings.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ErrorNote } from "@/components/studio/ErrorNote";
import { mmss } from "@/components/studio/onScreen";
import { studioFetch } from "@/lib/studioClient";
import { primary, secondary } from "@/components/studio/ui";
import type { PodcastView } from "@/lib/server/podcast";

export function PodcastFeed({ episodeId, enabled }: { episodeId: string; enabled: boolean }) {
    const [view, setView] = useState<PodcastView | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const base = `/api/studio/episodes/${episodeId}/podcast`;
    const load = useCallback(async () => {
        try { setView(await studioFetch<PodcastView>(base)); setError(""); } catch (e) { setError((e as Error).message); }
    }, [base]);
    useEffect(() => { if (enabled) void load(); }, [enabled, load]);
    const working = view?.status === "queued" || view?.status === "making";
    useEffect(() => {
        if (!working) return;
        const timer = setInterval(load, 15000);
        return () => clearInterval(timer);
    }, [working, load]);
    const act = async (init: RequestInit) => {
        setBusy(true);
        try { await studioFetch(base, init); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    };
    const ready = view?.status === "ready";
    return (
        <div className="flex flex-col gap-3">
            {view?.status === "failed" && <ErrorNote title="The podcast MP3 was not made" message={view.error} />}
            <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => void act({ method: "POST" })} disabled={!!view?.blocker || working || busy} className={ready ? secondary : primary}>
                    {working ? "Making the MP3…" : ready ? "Make the MP3 again" : "Make the podcast MP3"}
                </button>
                {ready && (
                    <label className="flex items-center gap-2 text-sm text-gray-200">
                        <input type="checkbox" checked={view.published} disabled={busy}
                            onChange={e => void act({ method: "PATCH", body: JSON.stringify({ published: e.target.checked }) })} />
                        In the podcast feed
                    </label>
                )}
            </div>
            <p className="text-xs text-gray-400">
                {working ? "A few minutes; this page updates by itself."
                    : view?.blocker ? view.blocker
                    : ready ? `${view.durationSeconds !== null ? mmss(view.durationSeconds * 1000) : ""}${view.loudness ? `, ${view.loudness.afterLufs.toFixed(1)} LUFS` : ""}. Podcast apps get it with the YouTube title and description, the final cut's chapters and the show's artwork.`
                    : "Makes the final cut's sound into an MP3 at −16 LUFS (podcast apps' level), with its chapters and the show's artwork, for the site's podcast feed."}
            </p>
            {ready && view.outdated && <p className="text-sm text-amber-300">The final cut changed since this MP3 was made; make it again to update the feed.</p>}
            {ready && view.published && !view.feedOn && (
                <p className="text-sm text-amber-300">The feed is off in the <Link href="/admin/podcast/settings" className="underline">Studio settings</Link>, so apps cannot see it yet.</p>
            )}
            {ready && view.audioUrl && <audio controls preload="none" src={view.audioUrl} className="w-full max-w-xl" aria-label="The podcast MP3" />}
            <ErrorNote message={error} />
        </div>
    );
}
