"use client";

// Step 3 on the show notes page when the Studio editor makes the final cut, "Build edit package" (spec 020 item E15):
// "Build for Studio editor" sets up the whole edit (lib/server/buildEdit.ts: fillers, stammers and long pauses cut,
// the teasers with their "In this episode" graphic, the intro and outro, the b-roll) and opens it in the Studio
// editor to finish by hand; "Build and export" sets up the same edit and renders it straight away, and the render is
// the final cut that the thumbnails, YouTube and Shorts use. An episode with a saved edit keeps it: exporting renders
// it as it is. The finished video, its chapters and quality report show below (FinalCut).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ago } from "@/components/studio/format";
import { mmss } from "@/lib/showNotes";
import { ErrorNote } from "@/components/studio/ErrorNote";
import { studioFetch } from "@/lib/studioClient";
import { failure, useStep, type ReportStep } from "@/components/studio/steps";
import { hint, primary, secondary } from "@/components/studio/ui";
import type { FinalView } from "@/types/studio";
import type { BuildResult, BuildView } from "@/lib/server/buildEdit";
import type { EditRenderView } from "@/lib/server/editRender";

const RENDERING: Record<string, string> = {
    queued: "Starting the render…",
    downloading: "Getting the recording…",
    rendering: "Rendering the edit…",
    saving: "Saving the final cut…",
};

// What the build set up, in a line: "Set up: 214 filler words, 87 long pauses cut; 3 teasers and 9 b-roll images placed."
function builtNote(r: BuildResult): string {
    if (!r.built) return "The saved edit was kept as it is, with your changes.";
    const n = (count: number | undefined, one: string, many: string) => (count ? [`${count} ${count === 1 ? one : many}`] : []);
    const cut = [...n(r.counts.filler, "filler word", "filler words"), ...n(r.counts.repeat, "stammer", "stammers"), ...n(r.counts.pause, "long pause", "long pauses")];
    const placed = [...n(r.teasers, "teaser", "teasers"), ...n(r.broll, "b-roll image", "b-roll images")];
    return `Set up: ${cut.length ? `${cut.join(", ")} cut` : "nothing needed cutting"}${placed.length ? `; ${placed.join(" and ")} placed` : ""}, with the intro and outro.`;
}

export function BuildPackage({ episodeId, enabled, upToDate, report, revision }: {
    episodeId: string; enabled: boolean; upToDate: boolean; report?: ReportStep; revision?: number;
}) {
    const router = useRouter();
    const [build, setBuild] = useState<BuildView | null>(null);
    const [render, setRender] = useState<EditRenderView | null>(null);
    const [final, setFinal] = useState<FinalView | null>(null);
    const [done, setDone] = useState<BuildResult | null>(null);
    const [error, setError] = useState("");
    const [starting, setStarting] = useState<"editor" | "export" | null>(null);

    const load = useCallback(async () => {
        try {
            const [b, r, f] = await Promise.all([
                studioFetch<BuildView>(`/api/studio/episodes/${episodeId}/build`),
                studioFetch<EditRenderView>(`/api/studio/episodes/${episodeId}/edit-render`),
                studioFetch<FinalView>(`/api/studio/episodes/${episodeId}/final`),
            ]);
            setBuild(b);
            setRender(r);
            setFinal(f);
            setError("");
        } catch (e) {
            setError((e as Error).message);
        }
    }, [episodeId]);

    useEffect(() => {
        if (enabled) load();
    }, [enabled, load]);

    const rendering = !!render?.status && render.status in RENDERING;
    useEffect(() => {
        if (!rendering) return;
        const timer = setInterval(load, 15000);
        return () => clearInterval(timer);
    }, [rendering, load]);

    async function start(mode: "editor" | "export") {
        setStarting(mode);
        setError("");
        try {
            const r = await studioFetch<BuildResult>(`/api/studio/episodes/${episodeId}/build`, {
                method: "POST", body: JSON.stringify({ export: mode === "export" }),
            });
            if (mode === "editor") {
                router.push(`/admin/podcast/${episodeId}/studio-editor`);
                return;
            }
            setDone(r);
            await load();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setStarting(null);
        }
    }

    const ready = final?.status === "ready";
    const current = ready && !final.stale;
    const fromDescript = ready && final.source === "descript" && !render?.status;
    const blocked = !upToDate || !build?.notesApproved || !!build?.brollBlock;
    const renderFailed = render?.status === "failed";
    useStep({
        step: "final", done: current, failed: renderFailed && !rendering, working: rendering,
        summary: rendering ? RENDERING[render!.status!]
            : renderFailed ? failure("The export", render.error)
                : ready ? [final.stale ? "Out of date: export again" : `Exported ${ago(final.finishedAt)}`, final.durationSeconds ? mmss(final.durationSeconds * 1000) : ""].filter(Boolean).join(" · ")
                    : build?.brollBlock ? "Waiting for the b-roll images"
                        : build?.edited ? "Built: finish it in the Studio editor, or export it" : "Ready to build",
        link: final?.videoUrl ? { label: "Final cut", href: final.videoUrl } : final?.driveUrl ? { label: "Final cut", href: final.driveUrl } : null,
        key: build && render && final ? `${build.editVersion}:${render.status}:${final.status}:${final.finishedAt}:${final.stale}` : null,
        report, revision, enabled, load,
    });

    const editorHref = `/admin/podcast/${episodeId}/studio-editor`;
    return (
        <div className="flex flex-col gap-4">
            {build?.brollBlock && <p className="text-sm text-amber-300">{build.brollBlock}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-4">
                    <h4 className="text-sm font-semibold text-white">1. Build for Studio editor</h4>
                    <p className={hint}>
                        Sets up the whole episode in the Studio editor: filler words, stammers and long pauses cut, the
                        “In this episode” teasers with their graphic, the intro and outro, and the b-roll with its slow zoom
                        or pan. Everything stays editable there; render it from the editor when it is finished.
                    </p>
                    <div className="mt-auto pt-1">
                        {build?.edited ? (
                            <Link href={editorHref} className={`${current ? secondary : primary} inline-block`}>Open in Studio editor →</Link>
                        ) : (
                            <button onClick={() => void start("editor")} disabled={!build || blocked || !!starting} className={primary}>
                                {starting === "editor" ? "Building…" : "Build for Studio editor"}
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-4">
                    <h4 className="text-sm font-semibold text-white">2. Build and export</h4>
                    <p className={hint}>
                        {build?.edited
                            ? "Renders the edit as it is saved now, with your changes, into a finished video ready for YouTube."
                            : "Sets up the same edit and renders it straight away, skipping the hand edit: a finished video ready for YouTube."}
                        {" "}Allow about as long as the episode; this page updates by itself.
                    </p>
                    <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                        <button onClick={() => void start("export")} disabled={!build || blocked || !!starting || rendering || (render?.canStart === false && build.edited)}
                            className={current || build?.edited ? secondary : primary}>
                            {rendering ? RENDERING[render!.status!]
                                : starting === "export" ? "Starting…"
                                    : ready ? "Export again" : build?.edited ? "Export the edit" : "Build and export"}
                        </button>
                        {render?.voice?.next === "auphonic" && render.auphonic.needSeconds !== null && (
                            <span className={hint}>Auphonic cleans the voice: {Math.ceil(render.auphonic.needSeconds / 60)} of this month&apos;s free minutes.</span>
                        )}
                    </div>
                </div>
            </div>
            {done && <p className={hint}>{builtNote(done)}</p>}
            {fromDescript && <p className={hint}>This episode&apos;s final cut came from Descript. Exporting replaces it with the Studio editor&apos;s render.</p>}
            {renderFailed && !rendering && <ErrorNote title="The export failed" message={render.error} />}
            {ready && final.stale && !rendering && (
                <p className="text-sm text-amber-300">The edit or the notes changed since this export. Export again to match.</p>
            )}
            <ErrorNote message={error} />
        </div>
    );
}
