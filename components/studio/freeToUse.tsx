"use client";

// Free To Use music on the show library page (lib/freeToUse.ts, /api/studio/library/freetouse): search it,
// listen to a track straight from Free To Use, and bring it into the library as music or an effect. Its licence
// record comes filled in; an admin still reads the licence, saves a snapshot of the page and checks it.

import { useCallback, useEffect, useState } from "react";
import { ErrorNote } from "@/components/studio/ErrorNote";
import { field, hint, secondary } from "@/components/studio/ui";
import { studioFetch } from "@/lib/studioClient";
import { FTU_LICENCE_URL, FTU_ORDER_LABELS, FTU_ORDERS, FTU_PAGE_SIZE, type FtuOrder, type FtuTrack } from "@/lib/freeToUse";
import type { LibraryEntry, LibraryKind } from "@/lib/audio";

type Found = FtuTrack & { inLibrary: string | null };
const clock = (ms: number | null) => { if (!ms) return ""; const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

function Track({ track, onAdded }: { track: Found; onAdded: (e: LibraryEntry) => void }) {
    const [busy, setBusy] = useState<LibraryKind | null>(null);
    const [added, setAdded] = useState(!!track.inLibrary);
    const [error, setError] = useState("");

    async function add(kind: LibraryKind) {
        setBusy(kind);
        setError("");
        try {
            const { entry } = await studioFetch<{ entry: LibraryEntry }>("/api/studio/library/freetouse", {
                method: "POST", body: JSON.stringify({ id: track.id, kind }),
            });
            setAdded(true);
            onAdded(entry);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }

    return (
        <li aria-label={track.title} className="flex flex-col gap-2 border-t border-white/5 pt-3 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-3">
                {track.cover && (
                    // eslint-disable-next-line @next/next/no-img-element -- Free To Use's cover art
                    <img src={track.cover} alt="" width={40} height={40} className="rounded" loading="lazy" />
                )}
                <div className="flex flex-col min-w-0 grow">
                    <a href={track.pageUrl} target="_blank" rel="noreferrer" className="font-semibold text-gray-100 hover:underline truncate">{track.title}</a>
                    <span className="text-xs text-gray-400 truncate">
                        {[track.artist, track.genre, clock(track.durationMs), track.tags.join(", ")].filter(Boolean).join(" · ")}
                    </span>
                </div>
                <audio controls preload="none" src={track.mp3} className="h-8" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {track.premium ? (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-gray-300">Premium: needs a paid Free To Use plan</span>
                ) : added ? (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200">In the library</span>
                ) : (
                    <>
                        <button className={secondary} disabled={busy !== null} onClick={() => void add("music")}>{busy === "music" ? "Bringing it in…" : "Add as music"}</button>
                        <button className={secondary} disabled={busy !== null} onClick={() => void add("effect")}>{busy === "effect" ? "Bringing it in…" : "Add as an effect"}</button>
                    </>
                )}
            </div>
            <ErrorNote message={error} />
        </li>
    );
}

export function FreeToUseSearch({ onAdded }: { onAdded: (e: LibraryEntry) => void }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [order, setOrder] = useState<FtuOrder>("release_date");
    const [asked, setAsked] = useState({ q: "", order: "release_date" as FtuOrder, offset: 0 });
    const [result, setResult] = useState<{ tracks: Found[]; count: number; offset: number } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const load = useCallback(async (p: typeof asked) => {
        setBusy(true);
        setError("");
        try {
            const qs = new URLSearchParams({ q: p.q, order: p.order, offset: String(p.offset) });
            setResult(await studioFetch<{ tracks: Found[]; count: number; offset: number }>(`/api/studio/library/freetouse?${qs}`));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }, []);
    useEffect(() => { if (open) void load(asked); }, [open, asked, load]);

    const search = (e: React.FormEvent) => { e.preventDefault(); setAsked({ q: q.trim(), order, offset: 0 }); };
    const last = result ? Math.min(result.offset + FTU_PAGE_SIZE, result.count) : 0;

    return (
        <section aria-label="Free To Use music" className="bg-[#1E1035]/40 border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="font-semibold text-gray-100">Find music on Free To Use</h2>
                    <p className={`${hint} mt-1 max-w-xl`}>
                        Royalty-free tracks by real artists, from freetouse.com. A track you add is downloaded into the library with its licence
                        record and credit filled in; it still needs a snapshot of the licence page and an admin&apos;s check. Free use covers an
                        individual&apos;s content on social platforms, with the credit; read the{" "}
                        <a className="text-amber-300 hover:underline" href={FTU_LICENCE_URL} target="_blank" rel="noreferrer">Free To Use License</a>{" "}
                        before checking it.
                    </p>
                </div>
                <button className={secondary} onClick={() => setOpen(o => !o)}>{open ? "Close" : "Search"}</button>
            </header>
            {open && (
                <>
                    <form onSubmit={search} className="flex flex-wrap items-center gap-3">
                        <input aria-label="Search Free To Use" className={`${field} !w-auto grow`} value={q} onChange={e => setQ(e.target.value)}
                            placeholder="Words, such as calm piano or ambient" maxLength={100} />
                        <select aria-label="Order" value={order} onChange={e => { const o = e.target.value as FtuOrder; setOrder(o); setAsked(a => ({ ...a, order: o, offset: 0 })); }} className={`${field} !w-auto`}>
                            {FTU_ORDERS.map(o => <option key={o} value={o}>{FTU_ORDER_LABELS[o]}</option>)}
                        </select>
                        <button type="submit" className={secondary} disabled={busy}>Search</button>
                    </form>
                    <ErrorNote message={error} />
                    {!result ? (busy ? <p className={hint}>Searching…</p> : null) : !result.tracks.length ? <p className={hint}>No tracks found.</p> : (
                        <>
                            <p className={hint}>{result.offset + 1}–{last} of {result.count}{asked.q ? ` for "${asked.q}"` : ""}{busy ? " · searching…" : ""}</p>
                            <ul className="flex flex-col gap-3">
                                {result.tracks.map(t => <Track key={t.id} track={t} onAdded={onAdded} />)}
                            </ul>
                            <div className="flex items-center gap-2">
                                <button className={secondary} disabled={busy || result.offset === 0} onClick={() => setAsked(a => ({ ...a, offset: Math.max(0, a.offset - FTU_PAGE_SIZE) }))}>← Previous</button>
                                <button className={secondary} disabled={busy || last >= result.count} onClick={() => setAsked(a => ({ ...a, offset: a.offset + FTU_PAGE_SIZE }))}>Next →</button>
                            </div>
                        </>
                    )}
                </>
            )}
        </section>
    );
}
