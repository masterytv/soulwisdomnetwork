"use client";

// The show library's Free To Use panel (lib/freeToUse.ts, admins only): search the catalogue, listen to a track
// straight from Free To Use, and import it. An imported track lands in the library with its licence record
// filled in and "Licence not checked": the admin still reads the licence, saves a snapshot and checks it.

import { useState } from "react";
import { ErrorNote } from "@/components/studio/ErrorNote";
import { field, hint, primary, secondary } from "@/components/studio/ui";
import { studioFetch } from "@/lib/studioClient";
import type { LibraryEntry, LibraryKind } from "@/lib/audio";
import { FREE_TO_USE_LICENCE, FREE_TO_USE_PAGE, type FreeToUseOrder, type FreeToUseTrack } from "@/lib/freeToUse";

type Found = FreeToUseTrack & { libraryId: string | null };
const clock = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const ORDER_LABELS: Record<FreeToUseOrder, string> = {
    downloads: "Most downloaded", release_date: "Newest", plays: "Most played", views: "Most viewed", staff_order: "Staff picks", random: "Random",
};

export function FreeToUsePanel({ onImported }: { onImported: (e: LibraryEntry) => void }) {
    const [query, setQuery] = useState("");
    const [order, setOrder] = useState<FreeToUseOrder>("downloads");
    const [found, setFound] = useState<{ tracks: Found[]; total: number; offset: number } | null>(null);
    const [busy, setBusy] = useState<string | null>(null);   // "search" or the track being imported
    const [error, setError] = useState("");

    async function search(offset = 0) {
        setBusy("search");
        setError("");
        try {
            setFound(await studioFetch<{ tracks: Found[]; total: number; offset: number }>("/api/studio/library", {
                method: "POST", body: JSON.stringify({ action: "freetouse-search", query, offset, order }),
            }));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }

    async function importTrack(t: Found, kind: LibraryKind) {
        setBusy(t.id);
        setError("");
        try {
            const { entry } = await studioFetch<{ entry: LibraryEntry }>("/api/studio/library", {
                method: "POST", body: JSON.stringify({ action: "freetouse-import", trackId: t.id, kind }),
            });
            onImported(entry);
            setFound(f => f && { ...f, tracks: f.tracks.map(x => (x.id === t.id ? { ...x, libraryId: entry.id } : x)) });
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }

    return (
        <section aria-label="Find music on Free To Use" className="bg-[#1E1035]/40 border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
            <header>
                <h2 className="font-semibold text-gray-100">Find music on Free To Use</h2>
                <p className={`${hint} mt-1`}>
                    Royalty-free music by real artists from <a className="text-amber-300 hover:underline" href="https://freetouse.com/music" target="_blank" rel="noreferrer">freetouse.com</a>.
                    An import comes in with its licence record and credit filled in. Read the <a className="text-amber-300 hover:underline" href={FREE_TO_USE_LICENCE.url} target="_blank" rel="noreferrer">licence</a>,
                    save a snapshot of it on the file, then check it. The free licence needs the credit in every description. The render adds it. Premium tracks need a paid licence and cannot be imported.
                </p>
                <p className={`${hint} mt-1 text-amber-200/80`}>
                    Before checking a track: the free licence covers an individual&apos;s own videos on social platforms, credited.
                    A company or brand channel, sponsored content, or the audio podcast feed may need one of Free To Use&apos;s paid plans.
                    Whoever checks the licence decides that.
                </p>
            </header>
            <form className="flex flex-wrap items-center gap-3" onSubmit={e => { e.preventDefault(); void search(0); }}>
                <input aria-label="Search words" className={`${field} !w-auto grow`} value={query} onChange={e => setQuery(e.target.value)}
                    placeholder="A mood, genre, title or artist: calm piano, ambient, uplifting…" maxLength={100} />
                <select aria-label="Order" value={order} onChange={e => setOrder(e.target.value as FreeToUseOrder)} className={`${field} !w-auto`}>
                    {(Object.keys(ORDER_LABELS) as FreeToUseOrder[]).map(o => <option key={o} value={o}>{ORDER_LABELS[o]}</option>)}
                </select>
                <button type="submit" className={primary} disabled={busy !== null}>{busy === "search" ? "Searching…" : "Search"}</button>
            </form>
            <ErrorNote message={error} />
            {found && (!found.tracks.length ? <p className={hint}>No tracks match.</p> : (
                <>
                    <p className={hint}>{found.offset + 1}–{found.offset + found.tracks.length} of {found.total}</p>
                    <ul className="flex flex-col gap-2">
                        {found.tracks.map(t => (
                            <li key={t.id} aria-label={t.title} className="flex flex-wrap items-center gap-3 rounded-xl bg-black/20 p-3">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {t.cover && <img src={t.cover} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" />}
                                <div className="flex min-w-0 grow flex-col">
                                    <a href={t.pageUrl} target="_blank" rel="noreferrer" className="font-semibold text-gray-100 hover:underline">{t.title}</a>
                                    <span className="text-xs text-gray-400">
                                        {t.artists.join(", ")} · {clock(t.durationMs)}{t.genre ? ` · ${t.genre}` : ""}{t.moods.length ? ` · ${t.moods.slice(0, 3).join(", ")}` : ""}
                                    </span>
                                </div>
                                {t.previewUrl && <audio controls preload="none" src={t.previewUrl} className="h-8" />}
                                {t.premium ? <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200">Premium: paid licence</span>
                                    : t.libraryId ? <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200">In the library</span>
                                    : (
                                        <span className="flex gap-2">
                                            <button className={secondary} disabled={busy !== null} onClick={() => void importTrack(t, "music")}>{busy === t.id ? "Importing…" : "Import as music"}</button>
                                            <button className={secondary} disabled={busy !== null} onClick={() => void importTrack(t, "effect")} title="A short sting or effect">As effect</button>
                                        </span>
                                    )}
                            </li>
                        ))}
                    </ul>
                    <div className="flex gap-2">
                        <button className={secondary} disabled={busy !== null || found.offset === 0} onClick={() => void search(Math.max(0, found.offset - FREE_TO_USE_PAGE))}>Previous</button>
                        <button className={secondary} disabled={busy !== null || found.offset + found.tracks.length >= found.total} onClick={() => void search(found.offset + FREE_TO_USE_PAGE)}>Next</button>
                    </div>
                </>
            ))}
        </section>
    );
}
