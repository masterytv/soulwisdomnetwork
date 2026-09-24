"use client";

// The edit package on the show notes page (docs/specs/009-edit-package.md): everything for the
// Descript edit in one Drive folder, built from the approved notes.

import { useCallback, useEffect, useState } from "react";
import { ago } from "@/components/studio/format";
import { studioFetch } from "@/lib/studioClient";
import type { PackageView } from "@/types/studio";

const button = "text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const primary = `${button} border-amber-500/40 text-amber-300 hover:bg-amber-500/10`;

export function EditPackage({ episodeId, enabled, upToDate }: { episodeId: string; enabled: boolean; upToDate: boolean }) {
    const [view, setView] = useState<PackageView | null>(null);
    const [error, setError] = useState("");
    const [starting, setStarting] = useState(false);

    const load = useCallback(async () => {
        try {
            setView(await studioFetch<PackageView>(`/api/studio/episodes/${episodeId}/package`));
            setError("");
        } catch (e) {
            setError((e as Error).message);
        }
    }, [episodeId]);

    useEffect(() => {
        if (enabled) load();
    }, [enabled, load]);

    const working = view?.status === "queued" || view?.status === "building";
    useEffect(() => {
        if (!working) return;
        const timer = setInterval(load, 10000);
        return () => clearInterval(timer);
    }, [working, load]);

    async function build() {
        setStarting(true);
        try {
            await studioFetch(`/api/studio/episodes/${episodeId}/package`, { method: "POST" });
            await load();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setStarting(false);
        }
    }

    const built = view?.status === "ready";
    const stale = built && view.builtFromVersion !== view.approvedVersion;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
                <button onClick={build} disabled={!upToDate || working || starting} className={primary}>
                    {working ? "Building…" : built ? "Rebuild edit package" : "Build edit package"}
                </button>
                {view?.folderUrl && (
                    <a href={view.folderUrl} target="_blank" rel="noreferrer" className="text-sm text-amber-300 hover:underline">
                        Open the Drive folder ↗
                    </a>
                )}
            </div>
            <p className="text-xs text-gray-500">
                {working
                    ? "Cutting the clips and copying files; usually a few minutes. This page updates by itself."
                    : !upToDate
                        ? "Approve the show notes first; the package is built from the approved notes."
                        : built
                            ? `Built ${view.finishedAt ? ago(view.finishedAt) : ""}. ${stale ? "The notes have been approved again since; rebuild to match." : "Rebuilding replaces the files in place."}`
                            : "The full episode, each “In this episode” clip, the b-roll images and a notes file, in one Drive folder for Descript."}
            </p>
            {built && view.files.length > 0 && (
                <ul className="text-xs text-gray-400 list-disc pl-5">
                    {view.files.map(f => <li key={f}>{f}</li>)}
                </ul>
            )}
            {built && view.warnings.map(w => <p key={w} className="text-xs text-amber-300">{w}</p>)}
            {(error || view?.error) && <p className="text-sm text-red-300">{error || view?.error}</p>}
        </div>
    );
}
