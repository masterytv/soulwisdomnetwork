"use client";

// "Start over" and "Delete episode" on an episode's card in the Studio (lib/server/episodeReset.ts). Each
// asks "Are you sure?" first, saying what goes and what stays; deleting also needs the episode's title typed.

import { useState } from "react";
import { studioFetch } from "@/lib/studioClient";

const button = "text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const quiet = `${button} border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200`;
const danger = `${button} border-red-500/50 text-red-300 hover:bg-red-500/10`;

type Action = "startOver" | "delete";

export function EpisodeActions({ episode, disabled, onDone }: {
    episode: { id: string; title: string; youtubeUrl?: string | null };
    disabled?: boolean;
    onDone: (message: string) => void;          // a message for the page ("⚠️ …" for a problem)
}) {
    const [asking, setAsking] = useState<Action | null>(null);
    const [typed, setTyped] = useState("");
    const [working, setWorking] = useState(false);
    const [error, setError] = useState("");

    const open = (a: Action) => { setAsking(a); setTyped(""); setError(""); };
    const close = () => { if (!working) setAsking(null); };

    async function go() {
        if (!asking) return;
        setWorking(true);
        setError("");
        try {
            const res = asking === "delete"
                ? await studioFetch<{ warnings: string[] }>(`/api/studio/episodes/${episode.id}`, { method: "DELETE" })
                : await studioFetch<{ started: boolean; warnings: string[] }>(`/api/studio/episodes/${episode.id}/start-over`, { method: "POST" });
            const done = asking === "delete"
                ? `"${episode.title}" is deleted.`
                : `"${episode.title}" is starting over. It shows under Processing within a minute or two, then waits for speaker review.`;
            setAsking(null);
            onDone(res.warnings.length ? `⚠️ ${[done, ...res.warnings].join(" ")}` : done);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setWorking(false);
        }
    }

    const titleOk = typed.trim() === episode.title.trim();
    return (
        <>
            <button onClick={() => open("startOver")} disabled={disabled} className={quiet}
                title="Clear everything done on this episode and transcribe its recording again">Start over</button>
            <button onClick={() => open("delete")} disabled={disabled} className={quiet}
                title="Remove this episode from the Studio">Delete</button>
            {asking && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={close}>
                    <div role="alertdialog" aria-modal="true" aria-labelledby="episode-action-title"
                        className="w-full max-w-md rounded-2xl border border-red-500/40 bg-[#1E1035] p-5 flex flex-col gap-3 text-sm text-gray-200"
                        onClick={e => e.stopPropagation()}>
                        <h2 id="episode-action-title" className="text-lg font-semibold text-red-300">Are you sure?</h2>
                        <p className="font-medium break-words">
                            {asking === "delete" ? "Delete" : "Start over"} “{episode.title}”
                        </p>
                        {asking === "delete" ? (
                            <ul className="list-disc pl-5 flex flex-col gap-1 text-gray-300">
                                <li>The episode leaves the Studio, with its transcript, speaker names, show notes, b-roll, edits, renders, thumbnails, shorts and media bin.</li>
                                <li>Its files in the Studio’s storage are deleted, and its transcript Google Doc goes to the Drive bin.</li>
                                <li>The original recording in Google Drive stays where it is.</li>
                                {episode.youtubeUrl && <li>It is on YouTube: the video and any shorts stay there. Delete them in YouTube Studio if you want them gone.</li>}
                                <li className="text-red-300">This cannot be undone.</li>
                            </ul>
                        ) : (
                            <ul className="list-disc pl-5 flex flex-col gap-1 text-gray-300">
                                <li>Everything done since the recording came in is cleared: the transcript, speaker names, corrections, show notes, b-roll, edits, renders, thumbnails, shorts and media bin. Its transcript Google Doc goes to the Drive bin.</li>
                                <li>The recording (and any speaker tracks) is kept and transcribed again, then it waits for speaker review like a new episode. Transcribing costs about the same as the first time.</li>
                                {episode.youtubeUrl && <li>It is on YouTube: the video and any shorts stay there, and the Studio forgets them. Delete them in YouTube Studio first if you will upload it again.</li>}
                                <li className="text-red-300">The work cleared cannot be brought back.</li>
                            </ul>
                        )}
                        {asking === "delete" && (
                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-gray-400">Type the episode’s title to confirm</span>
                                <input value={typed} onChange={e => setTyped(e.target.value)} autoFocus
                                    className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-gray-100" placeholder={episode.title} />
                            </label>
                        )}
                        {error && <p className="text-red-300">⚠️ {error}</p>}
                        <div className="flex justify-end gap-2 mt-1">
                            <button onClick={close} disabled={working} className={quiet} autoFocus={asking !== "delete"}>Cancel</button>
                            <button onClick={() => void go()} disabled={working || (asking === "delete" && !titleOk)} className={danger}>
                                {working ? (asking === "delete" ? "Deleting…" : "Starting over…") : asking === "delete" ? "Yes, delete it" : "Yes, start over"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
