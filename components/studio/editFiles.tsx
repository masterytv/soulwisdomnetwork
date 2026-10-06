"use client";

// Why: the render's way out to a full editor (spec 019 item 4.1): files that open its cuts in DaVinci Resolve,
// Premiere Pro or Final Cut Pro, made by the render job (agent/src/podcast/editExport.ts), in the Render panel.

import { hint } from "@/components/studio/ui";
import type { EditRenderView } from "@/lib/server/editRender";

const LABELS: Record<EditRenderView["exports"][number]["kind"], string> = {
    resolve: "DaVinci Resolve (.xml)",
    premiere: "Premiere Pro (.xml)",
    finalcut: "Final Cut Pro (.fcpxml)",
    captions: "Captions for them (.srt)",
    constantRate: "Constant-frame-rate copy of the recording (.mp4)",
};

export function EditFiles({ files }: { files: EditRenderView["exports"] }) {
    if (!files.length) return null;
    const copy = files.find(f => f.kind === "constantRate");
    return (
        <section aria-label="Open in another editor" className="mt-3 flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-200">Open in Resolve, Premiere or Final Cut</span>
            <span className={hint}>
                This edit&apos;s cuts, as a timeline for another editor: straight cuts only (no transitions, teasers, intro, b-roll,
                titles, music or burned-in captions). Open the file in the editor; when it asks for the media, point it at
                {copy ? <> the constant-frame-rate copy below (this recording&apos;s frame rate varies, so the original would drift).</>
                    : <> your copy of the original recording.</>} DaVinci Resolve is free.
            </span>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {files.map(f => (
                    <li key={f.kind}>
                        <a href={f.url ?? f.driveUrl ?? undefined} className="text-amber-300 underline" download={f.name}>{LABELS[f.kind]}</a>
                        {f.driveUrl && f.url && <> · <a href={f.driveUrl} target="_blank" rel="noreferrer" className="text-gray-400 underline">Drive</a></>}
                    </li>
                ))}
            </ul>
        </section>
    );
}
