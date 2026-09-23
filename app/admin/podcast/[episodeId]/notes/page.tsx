"use client";

// Checkpoint B (spec 005 step 6; docs/specs/007-show-notes.md): review and edit the show
// notes Claude drafted from the accepted transcript, then approve them. Edits save as you go.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AuthGuard from "@/components/auth/AuthGuard";
import { ago, minutes } from "@/components/studio/format";
import { useAutosave } from "@/components/studio/useAutosave";
import { useAuth } from "@/context/AuthContext";
import { chapterList, mmss, type ShowNotes } from "@/lib/showNotes";
import { studioFetch } from "@/lib/studioClient";
import type { EpisodeNotesView } from "@/types/studio";

const button = "text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const primary = `${button} border-amber-500/40 text-amber-300 hover:bg-amber-500/10`;
const secondary = `${button} border-white/10 text-gray-300 hover:bg-white/10`;
const field = "w-full bg-[#130b29] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500/50";
const small = "text-xs text-gray-500";

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function parseTime(text: string): number | null {
    const parts = text.trim().split(":").map(Number);
    if (!parts.length || parts.some(n => !Number.isFinite(n) || n < 0)) return null;
    return parts.reduce((total, n) => total * 60 + n, 0) * 1000;
}

// Edits a time as m:ss; commits on blur so half-typed times are not saved.
function TimeInput({ ms, onChange }: { ms: number; onChange: (ms: number) => void }) {
    const [text, setText] = useState(mmss(ms));
    return (
        <input
            value={text}
            onChange={e => setText(e.target.value)}
            onBlur={() => {
                const parsed = parseTime(text);
                if (parsed === null) setText(mmss(ms));
                else onChange(parsed);
            }}
            className="w-20 bg-[#130b29] border border-white/10 rounded px-2 py-1 text-xs font-mono"
            aria-label="Time (m:ss)"
        />
    );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section className="bg-[#1E1035]/40 border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
            <header>
                <h2 className="font-semibold">{title}</h2>
                {hint && <p className={small}>{hint}</p>}
            </header>
            {children}
        </section>
    );
}

export default function ShowNotesPage() {
    const { episodeId } = useParams<{ episodeId: string }>();
    const { profile, loading } = useAuth();
    const allowed = profile?.role === "admin" || profile?.role === "producer";

    const [view, setView] = useState<EpisodeNotesView | null>(null);
    const [notes, setNotes] = useState<ShowNotes | null>(null);
    const [loadedAt, setLoadedAt] = useState(0);   // remounts free-text list fields after a reload
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const video = useRef<HTMLVideoElement>(null);

    const save = useCallback(async (value: ShowNotes, version: number) => {
        const res = await studioFetch<{ version: number }>(`/api/studio/episodes/${episodeId}/notes`, {
            method: "PUT",
            body: JSON.stringify({ notes: value, version }),
        });
        return res.version;
    }, [episodeId]);
    const autosave = useAutosave(save);
    const { reset, change, flush } = autosave;

    const load = useCallback(async () => {
        try {
            const data = await studioFetch<EpisodeNotesView>(`/api/studio/episodes/${episodeId}/notes`);
            setView(data);
            setNotes(data.notes?.draft ?? null);
            reset(data.notes?.version ?? 0);
            setLoadedAt(Date.now());
            setError("");
        } catch (e) {
            setError((e as Error).message);
        }
    }, [episodeId, reset]);

    useEffect(() => {
        if (!loading && allowed) load();
    }, [loading, allowed, load]);

    // While Claude is drafting, check back every few seconds.
    const drafting = view?.notes?.status === "queued" || view?.notes?.status === "generating";
    useEffect(() => {
        if (!drafting) return;
        const timer = setInterval(load, 5000);
        return () => clearInterval(timer);
    }, [drafting, load]);

    function edit(fn: (n: ShowNotes) => ShowNotes) {
        if (!notes) return;
        const next = fn(notes);
        setNotes(next);
        setNotice("");
        change(next);
    }

    const seek = (ms: number) => {
        const v = video.current;
        if (!v) return;
        v.currentTime = ms / 1000;
        v.play().catch(() => {});
    };
    const now = () => Math.round((video.current?.currentTime ?? 0) * 1000);

    async function run(fn: () => Promise<string>) {
        setBusy(true);
        setNotice("");
        try {
            setNotice(await fn());
        } catch (e) {
            setNotice(`⚠️ ${(e as Error).message}`);
        } finally {
            setBusy(false);
        }
    }

    const draft = (force: boolean) => run(async () => {
        if (view?.notes?.draft && !confirm("Draft new show notes? Claude's new draft replaces everything on this page, including your edits.")) return "";
        await studioFetch(`/api/studio/episodes/${episodeId}/notes/generate`, { method: "POST", body: JSON.stringify({ force }) });
        await load();
        return "Claude is drafting the show notes. This usually takes a minute or two.";
    });

    const approve = () => run(async () => {
        if (!(await flush())) throw new Error(`Your latest changes could not be saved: ${autosave.lastError.current}`);
        await studioFetch(`/api/studio/episodes/${episodeId}/notes/approve`, {
            method: "POST",
            body: JSON.stringify({ version: autosave.version.current }),
        });
        await load();
        return "Show notes approved.";
    });

    const copyDescription = () => {
        if (!notes) return;
        void navigator.clipboard.writeText(`${notes.description}\n\n${chapterList(notes)}`);
        setNotice("Description and chapters copied.");
    };

    if (loading) return <div className="p-8 text-center text-white">Loading...</div>;

    if (!allowed) {
        return (
            <div className="min-h-screen bg-[#130b29] flex items-center justify-center p-4">
                <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-8 max-w-md text-center">
                    <h1 className="text-2xl font-bold text-red-400 mb-2">Access Denied</h1>
                    <p className="text-gray-300">The Podcast Studio is for admins and producers.</p>
                </div>
            </div>
        );
    }

    const status = view?.notes?.status;
    const approved = view?.notes?.approved;
    const upToDate = status === "approved" && approved?.version === autosave.savedVersion && autosave.saveState === "saved";
    const unverified = new Set(view?.notes?.unverifiedQuotes ?? []);
    const saveLabel = {
        saved: "Draft saved to the database", unsaved: "Unsaved changes…", saving: "Saving draft…", error: "Draft not saved",
    }[autosave.saveState];

    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#130b29] text-gray-100 p-4 pb-28 sm:p-8 sm:pb-28">
                <div className="max-w-7xl mx-auto flex flex-col gap-6">
                    <div>
                        <Link href="/admin/podcast" className="text-sm text-gray-400 hover:text-white">← Podcast Studio</Link>
                        <h1 className="text-2xl font-bold text-amber-400 mt-1 break-words">
                            Show notes{view ? `: ${view.title}` : ""}
                        </h1>
                        {view && (
                            <p className="text-sm text-gray-400 mt-1">
                                {[view.recordedAt?.slice(0, 10), minutes(view.durationSeconds)].filter(Boolean).join(" · ")}
                                {view.notes?.generatedAt && ` · Drafted by Claude ${ago(view.notes.generatedAt)}`}
                                {approved && ` · Approved by ${approved.by} ${ago(approved.at)}`}
                                {" · "}
                                <Link href={`/admin/podcast/${episodeId}`} className="hover:text-white hover:underline">Speaker review</Link>
                            </p>
                        )}
                    </div>

                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    {!view && !error && <p className="text-gray-400">Loading…</p>}

                    {view && !view.transcriptAccepted && (
                        <p className="text-sm text-gray-300">
                            Show notes are drafted from the accepted transcript.{" "}
                            <Link href={`/admin/podcast/${episodeId}`} className="text-amber-300 hover:underline">Review and accept the speakers first.</Link>
                        </p>
                    )}

                    {view?.transcriptAccepted && !notes && (
                        <div className="bg-[#1E1035]/40 border border-white/5 rounded-2xl p-6 flex flex-col gap-3 items-start">
                            {drafting ? (
                                <p className="text-gray-300">Claude is drafting the show notes. This usually takes a minute or two; this page updates by itself.</p>
                            ) : (
                                <>
                                    {status === "failed" && <p className="text-sm text-red-300">Drafting failed: {view.notes?.error}</p>}
                                    <p className="text-gray-300">No show notes yet.</p>
                                    <button onClick={() => draft(false)} disabled={busy} className={primary}>Draft show notes</button>
                                </>
                            )}
                        </div>
                    )}

                    {view && notes && (
                        <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] items-start">
                            <div className="flex flex-col gap-4 lg:sticky lg:top-20">
                                {view.videoUrl && (
                                    <video ref={video} src={view.videoUrl} controls preload="metadata" className="w-full rounded-xl bg-black aspect-video" />
                                )}
                                <p className={small}>
                                    Click ▶ beside a chapter, quote or b-roll idea to check it against the video.
                                    &quot;Add at video time&quot; uses where the video is paused.
                                </p>
                                {drafting && <p className="text-sm text-amber-300">Claude is drafting new notes; they will replace this page when ready.</p>}
                                {status === "failed" && view.notes?.error && <p className="text-sm text-red-300">Last redraft failed: {view.notes.error}</p>}
                                <button onClick={() => draft(true)} disabled={busy || drafting} className={`${secondary} self-start`}>
                                    Draft again with Claude
                                </button>
                            </div>

                            <div className="flex flex-col gap-4 min-w-0">
                                <Section title="Title" hint="Pick one; edit any of them.">
                                    {notes.titles.map((t, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                name="title"
                                                checked={notes.chosenTitle === i}
                                                onChange={() => edit(n => ({ ...n, chosenTitle: i }))}
                                                aria-label={`Use title ${i + 1}`}
                                            />
                                            <input
                                                value={t}
                                                onChange={e => edit(n => ({ ...n, titles: n.titles.map((x, j) => (j === i ? e.target.value : x)) }))}
                                                className={field}
                                            />
                                            <span className={`${small} w-10 text-right ${t.length > 70 ? "text-orange-300" : ""}`}>{t.length}</span>
                                        </div>
                                    ))}
                                    <button onClick={() => edit(n => ({ ...n, titles: [...n.titles, ""] }))} className={`${secondary} self-start`}>+ Add a title</button>
                                </Section>

                                <Section title="“In this episode” teaser" hint="Read over the intro music. Aim for 40–60 words.">
                                    <textarea value={notes.teaser} onChange={e => edit(n => ({ ...n, teaser: e.target.value }))} rows={3} className={field} />
                                    <p className={small}>{words(notes.teaser)} words</p>
                                </Section>

                                <Section title="YouTube description" hint="The chapter list is added underneath automatically.">
                                    <textarea value={notes.description} onChange={e => edit(n => ({ ...n, description: e.target.value }))} rows={8} className={field} />
                                    <div className="flex items-center gap-3">
                                        <p className={small}>{words(notes.description)} words</p>
                                        <button onClick={copyDescription} className={secondary}>Copy description + chapters</button>
                                    </div>
                                </Section>

                                <Section title="Summary" hint="For the episode page on the website.">
                                    <textarea value={notes.summary} onChange={e => edit(n => ({ ...n, summary: e.target.value }))} rows={6} className={field} />
                                </Section>

                                <Section title="Chapters" hint="YouTube needs the first at 0:00, at least three, each 10 seconds or longer.">
                                    {notes.chapters.map((c, i) => (
                                        <div key={`${i}-${c.startMs}`} className="flex items-center gap-2">
                                            <button onClick={() => seek(c.startMs)} className="text-gray-400 hover:text-amber-300" title="Play from here">▶</button>
                                            <TimeInput ms={c.startMs} onChange={ms => edit(n => ({
                                                ...n,
                                                chapters: n.chapters.map((x, j) => (j === i ? { ...x, startMs: ms } : x)).sort((a, b) => a.startMs - b.startMs),
                                            }))} />
                                            <input
                                                value={c.title}
                                                onChange={e => edit(n => ({ ...n, chapters: n.chapters.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }))}
                                                className={field}
                                            />
                                            <button onClick={() => edit(n => ({ ...n, chapters: n.chapters.filter((_, j) => j !== i) }))} className="text-gray-500 hover:text-red-300" title="Remove">✕</button>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => edit(n => ({ ...n, chapters: [...n.chapters, { startMs: now(), title: "" }].sort((a, b) => a.startMs - b.startMs) }))}
                                        className={`${secondary} self-start`}
                                    >
                                        + Add at video time
                                    </button>
                                </Section>

                                <Section title="Key quotes" hint="Word for word. Used later for shorts and social posts.">
                                    {notes.quotes.map((q, i) => (
                                        <div key={i} className="flex flex-col gap-1.5 border-l-2 border-amber-500/30 pl-3">
                                            <textarea
                                                value={q.text}
                                                onChange={e => edit(n => ({ ...n, quotes: n.quotes.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))}
                                                rows={2}
                                                className={field}
                                            />
                                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                                <button onClick={() => seek(q.startMs)} className="text-gray-400 hover:text-amber-300">▶ {mmss(q.startMs)}</button>
                                                <span className="text-gray-300">{q.speaker}</span>
                                                {unverified.has(q.text) && (
                                                    <span className="text-orange-300">Not found word for word in the transcript: check it.</span>
                                                )}
                                                <button onClick={() => edit(n => ({ ...n, quotes: n.quotes.filter((_, j) => j !== i) }))} className="ml-auto text-gray-500 hover:text-red-300">Remove</button>
                                            </div>
                                        </div>
                                    ))}
                                </Section>

                                <Section title="Tags, themes and topics" hint="Separate with commas.">
                                    {(["tags", "themes", "topics"] as const).map(key => (
                                        <label key={key} className="flex flex-col gap-1">
                                            <span className="text-xs text-gray-400 capitalize">{key}</span>
                                            {/* Uncontrolled: commas and spaces stay as typed; the list is saved trimmed. */}
                                            <textarea
                                                key={loadedAt}
                                                defaultValue={notes[key].join(", ")}
                                                onChange={e => {
                                                    const list = e.target.value.split(",").map(t => t.trim()).filter(Boolean);
                                                    edit(n => ({ ...n, [key]: list }));
                                                }}
                                                rows={2}
                                                className={field}
                                            />
                                        </label>
                                    ))}
                                </Section>

                                <Section title="B-roll ideas" hint="Still images with a slow pan and zoom (spec 005, option A). Nothing is generated until a later step.">
                                    {notes.broll.map((b, i) => (
                                        <div key={`${i}-${b.startMs}`} className="flex flex-col gap-1.5 border-l-2 border-sky-500/30 pl-3">
                                            <div className="flex items-center gap-2 text-xs">
                                                <button onClick={() => seek(b.startMs)} className="text-gray-400 hover:text-amber-300" title="Play from here">▶</button>
                                                <TimeInput ms={b.startMs} onChange={ms => edit(n => ({ ...n, broll: n.broll.map((x, j) => (j === i ? { ...x, startMs: ms } : x)) }))} />
                                                <span className="text-gray-400">for</span>
                                                <input
                                                    type="number"
                                                    min={3}
                                                    max={15}
                                                    value={b.durationSeconds}
                                                    onChange={e => edit(n => ({ ...n, broll: n.broll.map((x, j) => (j === i ? { ...x, durationSeconds: Number(e.target.value) || 3 } : x)) }))}
                                                    className="w-16 bg-[#130b29] border border-white/10 rounded px-2 py-1"
                                                />
                                                <span className="text-gray-400">seconds</span>
                                                <button onClick={() => edit(n => ({ ...n, broll: n.broll.filter((_, j) => j !== i) }))} className="ml-auto text-gray-500 hover:text-red-300">Remove</button>
                                            </div>
                                            <textarea
                                                value={b.idea}
                                                onChange={e => edit(n => ({ ...n, broll: n.broll.map((x, j) => (j === i ? { ...x, idea: e.target.value } : x)) }))}
                                                rows={2}
                                                className={field}
                                            />
                                            <p className={small}>{b.why}</p>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => edit(n => ({ ...n, broll: [...n.broll, { startMs: now(), durationSeconds: 6, idea: "", why: "Added by hand" }] }))}
                                        className={`${secondary} self-start`}
                                    >
                                        + Add at video time
                                    </button>
                                </Section>
                            </div>
                        </div>
                    )}
                </div>

                {view && notes && (
                    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-[#130b29]/95 backdrop-blur">
                        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                            <span className={`text-sm ${autosave.saveState === "error" ? "text-red-300" : autosave.saveState === "saved" ? "text-green-300" : "text-gray-400"}`}>
                                {autosave.saveState === "saved" ? "✓ " : ""}{saveLabel}
                            </span>
                            {autosave.saveState === "error" && (
                                <>
                                    <span className="text-sm text-red-300">{autosave.saveError}</span>
                                    <button onClick={() => { void flush(); }} className={secondary}>Try again</button>
                                </>
                            )}
                            {notice ? (
                                <span className={`text-sm ${notice.startsWith("⚠️") ? "text-red-300" : "text-green-300"}`}>{notice}</span>
                            ) : autosave.saveState !== "error" && (
                                <span className="text-xs text-gray-500">
                                    {upToDate
                                        ? `Approved by ${approved!.by}. These are the show notes the next steps will use.`
                                        : approved
                                            ? "Approve the changes to make them the show notes the next steps will use."
                                            : "Approve when the notes are right; they become the show notes the next steps will use."}
                                </span>
                            )}
                            <button
                                onClick={approve}
                                disabled={busy || drafting || upToDate}
                                className={`${primary} ml-auto !text-sm !px-4 !py-2`}
                            >
                                {busy ? "Working…" : upToDate ? "✓ Approved" : approved ? "Approve changes" : "Approve show notes"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}
