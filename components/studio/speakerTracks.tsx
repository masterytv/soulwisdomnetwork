"use client";

// Why: one track per speaker, optional (spec 019 item 3.3), in the Studio editor's Render panel. When Zoom recorded a
// separate audio file for each person, adding them here makes the render build the voice from them: each cleaned and
// gated on its own, then mixed, so one person's room or cross-talk does not ride under another. Without them, or
// with "Use them" off, the render uses the recording's own sound, as always. Episodes from a Zoom folder in the Drive
// inbox arrive with them already.

import { useEffect, useState } from "react";
import { studioFetch } from "@/lib/studioClient";
import { MAX_TRACKS, type SpeakerTrack } from "@/lib/speakerTracks";
import { hint, secondary } from "@/components/studio/ui";
import { uploadFile } from "@/components/studio/upload";

export function SpeakerTracks({ episodeId, use, rendered, onUse }: {
    episodeId: string;
    use: boolean;                         // the edit's choice (missing: yes)
    rendered: number | null;              // how many tracks the current render used (null: no render)
    onUse: (use: boolean) => void;
}) {
    const [tracks, setTracks] = useState<SpeakerTrack[] | null>(null);
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    useEffect(() => {
        studioFetch<{ tracks: SpeakerTrack[] }>(`/api/studio/episodes/${episodeId}/tracks`).then(v => setTracks(v.tracks), e => setError((e as Error).message));
    }, [episodeId]);
    const call = async (method: string, body: object) => {
        setError("");
        try {
            setTracks((await studioFetch<{ tracks: SpeakerTrack[] }>(`/api/studio/episodes/${episodeId}/tracks`, { method, body: JSON.stringify(body) })).tracks);
        } catch (e) { setError((e as Error).message); }
    };
    const add = async (files: FileList | null) => {
        for (const file of Array.from(files ?? [])) {
            setBusy(`Uploading ${file.name}…`);
            try {
                const { path } = await uploadFile("track", file, share => setBusy(`Uploading ${file.name}: ${Math.round(share * 100)}%`), episodeId);
                await call("POST", { path, fileName: file.name });
            } catch (e) { setError((e as Error).message); }
        }
        setBusy("");
    };
    if (!tracks) return error ? <p className="text-xs text-red-300">{error}</p> : null;
    return (
        <section aria-label="Speaker tracks" className="flex flex-col gap-1">
            <span className="text-sm text-gray-200">Speaker tracks <span className="text-gray-400">(optional)</span></span>
            <span className={hint}>
                If Zoom recorded a separate audio file for each person, add them: each is cleaned and gated on its own, then mixed, so
                one person&apos;s room or cross-talk does not ride under another. Without them the render uses the recording&apos;s own sound.
            </span>
            {tracks.length > 0 && (
                <>
                    <ul className="flex flex-col gap-1 text-sm">
                        {tracks.map(t => (
                            <li key={t.path} className="flex flex-wrap items-center gap-2">
                                <input aria-label={`Name for ${t.fileName}`} defaultValue={t.name} maxLength={60}
                                    onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== t.name) void call("PATCH", { path: t.path, name: e.target.value }); }}
                                    className="rounded border border-white/10 bg-[#1a1036] px-2 py-0.5 text-sm text-gray-200 w-40" />
                                <span className="text-xs text-gray-400 truncate max-w-[14rem]" title={t.fileName}>{t.fileName}</span>
                                <button type="button" onClick={() => void call("DELETE", { path: t.path })} className="text-xs text-gray-400 hover:text-red-300">Remove</button>
                            </li>
                        ))}
                    </ul>
                    <label className="flex items-center gap-2 text-sm text-gray-200">
                        <input type="checkbox" checked={use} onChange={e => onUse(e.target.checked)} /> Make the voice from these tracks
                    </label>
                </>
            )}
            {tracks.length < MAX_TRACKS && (
                <label className={`${secondary} self-start cursor-pointer`}>
                    {busy || "Add speaker tracks"}
                    <input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,.m4a,.mp3,.wav" multiple className="sr-only" disabled={!!busy}
                        onChange={e => { void add(e.target.files); e.target.value = ""; }} />
                </label>
            )}
            {rendered !== null && (
                <span className={hint}>The current render&apos;s voice came from {rendered ? `${rendered} speaker track${rendered === 1 ? "" : "s"}` : "the recording's own sound"}.</span>
            )}
            {error && <span className="text-xs text-red-300">{error}</span>}
        </section>
    );
}
