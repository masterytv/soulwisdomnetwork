"use client";

// The show library's page body (spec 020 item E7; app/admin/podcast/library/page.tsx): adding a file with its
// licence record and snapshot, checking it, changing it and removing it (admins), and every file with its
// licence, credit and uses (everyone in the Studio).

import { useEffect, useState } from "react";
import Link from "next/link";
import { ErrorNote } from "@/components/studio/ErrorNote";
import { field, hint, primary, secondary } from "@/components/studio/ui";
import { typeOf, uploadFile } from "@/components/studio/upload";
import { measure } from "@/components/studio/mediaBin";
import { studioFetch } from "@/lib/studioClient";
import {
    EMPTY_LICENCE, LIBRARY_KIND_LABELS, LIBRARY_KINDS, licenceMissing, licenceProblem,
    type LibraryEntry, type LibraryKind, type Licence,
} from "@/lib/audio";

const clock = (ms: number | null) => { if (!ms) return ""; const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const today = () => new Date().toISOString().slice(0, 10);

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1 text-sm text-gray-200">
            <label className="flex flex-col gap-1"><span>{label}</span>{children}</label>
            {help && <span className={hint}>{help}</span>}
        </div>
    );
}

// The licence record's fields, and the snapshot of the licence page (a file chosen here is sent on save).
function LicenceFields({ licence, onChange, proof, onProof, proofUrl, disabled }: {
    licence: Licence; onChange: (l: Licence) => void; proof: File | null; onProof: (f: File | null) => void; proofUrl?: string | null; disabled: boolean;
}) {
    const set = (k: keyof Licence) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...licence, [k]: e.target.value });
    const problem = licenceProblem(licence);
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Where it came from" help="The page you downloaded it from."><input className={field} value={licence.sourceUrl} onChange={set("sourceUrl")} disabled={disabled} placeholder="https://" /></Field>
            <Field label="Author"><input className={field} value={licence.author} onChange={set("author")} disabled={disabled} maxLength={150} /></Field>
            <Field label="Licence" help='Its name, such as "Pixabay Content License" or "CC0 1.0".'><input className={field} value={licence.name} onChange={set("name")} disabled={disabled} maxLength={150} /></Field>
            <Field label="Licence page"><input className={field} value={licence.url} onChange={set("url")} disabled={disabled} placeholder="https://" /></Field>
            <Field label="Downloaded on"><input type="date" className={field} value={licence.downloadedOn} onChange={set("downloadedOn")} disabled={disabled} /></Field>
            <Field label="Certificate or credit code" help="When the site gives one."><input className={field} value={licence.code} onChange={set("code")} disabled={disabled} maxLength={200} /></Field>
            <div className="sm:col-span-2">
                <Field label="Credit" help="Exactly what the licence asks the description to say, if anything. It is added to the YouTube description of every episode and Short that uses the file.">
                    <input className={field} value={licence.credit} onChange={set("credit")} disabled={disabled} maxLength={300} placeholder='e.g. Music: "Calm Waters" by Jane Doe (CC BY 4.0)' />
                </Field>
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2 text-sm text-gray-200">
                <span>Snapshot of the licence page</span>
                {proofUrl && !proof && <a href={proofUrl} target="_blank" rel="noreferrer" className="text-amber-300 hover:underline">Open the saved one</a>}
                <label className={`${secondary} cursor-pointer ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
                    {proof ? `Chosen: ${proof.name}` : licence.proofPath ? "Replace it" : "Choose a PDF, PNG or JPEG"}
                    <input type="file" accept="application/pdf,image/png,image/jpeg,.pdf" className="hidden" disabled={disabled}
                        onChange={e => { onProof(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                </label>
                <span className={hint}>Print the licence page to PDF, or take a screenshot, on the day you download.</span>
            </div>
            {problem && <p className="sm:col-span-2 text-sm text-red-300">This file cannot be used: {problem}.</p>}
        </div>
    );
}

// Sends a chosen snapshot and returns the licence with its path.
async function withProof(licence: Licence, proof: File | null, onShare: (s: number) => void): Promise<Licence> {
    if (!proof) return licence;
    const { path } = await uploadFile("licence", proof, onShare);
    return { ...licence, proofPath: path };
}

function AddFile({ onAdded }: { onAdded: (e: LibraryEntry) => void }) {
    const [file, setFile] = useState<File | null>(null);
    const [kind, setKind] = useState<LibraryKind>("music");
    const [name, setName] = useState("");
    const [licence, setLicence] = useState<Licence>({ ...EMPTY_LICENCE, downloadedOn: today() });
    const [proof, setProof] = useState<File | null>(null);
    const [share, setShare] = useState<number | null>(null);
    const [error, setError] = useState("");
    const problem = licenceProblem(licence);

    async function add() {
        if (!file) return;
        setError("");
        setShare(0);
        try {
            const size = await measure(file);
            const { path } = await uploadFile("library", file, setShare);
            const lic = await withProof(licence, proof, setShare);
            const { entry } = await studioFetch<{ entry: LibraryEntry }>("/api/studio/library", {
                method: "POST", body: JSON.stringify({ action: "add", path, kind, name: name || file.name.replace(/\.\w+$/, ""), durationMs: size.durationMs, licence: lic }),
            });
            onAdded(entry);
            setFile(null); setName(""); setProof(null); setLicence({ ...EMPTY_LICENCE, downloadedOn: today() });
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setShare(null);
        }
    }

    return (
        <section aria-label="Add a file" className="bg-[#1E1035]/40 border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
            <header>
                <h2 className="font-semibold text-gray-100">Add a file</h2>
                <p className={`${hint} mt-1`}>An MP3, M4A or WAV up to 200 MB. Fill in what the licence says now, while the page is open; you can check it afterwards.</p>
            </header>
            <div className="flex flex-wrap items-center gap-3">
                <label className={`${secondary} cursor-pointer`}>
                    {file ? file.name : "Choose a sound"}
                    <input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,.mp3,.m4a,.wav" className="hidden"
                        onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f && typeOf(f).startsWith("audio/") ? f : null); e.target.value = ""; }} />
                </label>
                <select aria-label="Kind" value={kind} onChange={e => setKind(e.target.value as LibraryKind)} className={`${field} !w-auto`}>
                    {LIBRARY_KINDS.map(k => <option key={k} value={k}>{k === "music" ? "Music (a bed under speech)" : "Effect or stinger"}</option>)}
                </select>
                <input aria-label="Name" className={`${field} !w-auto grow`} value={name} onChange={e => setName(e.target.value)} placeholder="Name (the file's, if empty)" maxLength={150} />
            </div>
            <LicenceFields licence={licence} onChange={setLicence} proof={proof} onProof={setProof} disabled={share !== null} />
            <ErrorNote message={error} />
            <div className="flex items-center gap-3">
                <button className={primary} disabled={!file || share !== null || !!problem} onClick={() => void add()}>
                    {share !== null ? `Sending… ${Math.round(share * 100)}%` : "Add to the library"}
                </button>
                <span className={hint}>It shows &quot;Licence not checked&quot; until an admin marks it checked.</span>
            </div>
        </section>
    );
}

function Entry({ entry, isAdmin, onChange, onRemoved }: { entry: LibraryEntry; isAdmin: boolean; onChange: (e: LibraryEntry) => void; onRemoved: () => void }) {
    const [editing, setEditing] = useState(false);
    const [licence, setLicence] = useState<Licence>(entry.licence);
    const [name, setName] = useState(entry.name);
    const [kind, setKind] = useState<LibraryKind>(entry.kind);
    const [proof, setProof] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const missing = licenceMissing(entry.licence);

    async function call(body: Record<string, unknown>) {
        setBusy(true);
        setError("");
        try {
            const r = await studioFetch<{ entry?: LibraryEntry }>("/api/studio/library", { method: "POST", body: JSON.stringify({ id: entry.id, ...body }) });
            if (r.entry) onChange(r.entry);
            return true;
        } catch (e) {
            setError((e as Error).message);
            return false;
        } finally {
            setBusy(false);
        }
    }
    async function save() {
        setBusy(true);
        try {
            const lic = await withProof(licence, proof, () => {});
            if (await call({ action: "update", name, kind, licence: lic })) { setEditing(false); setProof(null); }
        } catch (e) {
            setError((e as Error).message);
            setBusy(false);
        }
    }

    return (
        <li aria-label={entry.name} className="bg-[#1E1035]/40 border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-100">{entry.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-gray-300">{LIBRARY_KIND_LABELS[entry.kind]}{entry.durationMs ? `, ${clock(entry.durationMs)}` : ""}</span>
                {entry.checked
                    ? <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200">Licence checked by {entry.checked.name} on {entry.checked.on}</span>
                    : <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200">Licence not checked</span>}
                <span className="grow" />
                {entry.url && <audio controls preload="none" src={entry.url} className="h-8" />}
            </div>
            {!editing ? (
                <dl className="grid gap-x-4 gap-y-1 text-xs text-gray-300 sm:grid-cols-[auto_1fr]">
                    <dt className="text-gray-500">From</dt><dd className="break-all">{entry.licence.sourceUrl ? <a className="text-amber-300 hover:underline" href={entry.licence.sourceUrl} target="_blank" rel="noreferrer">{entry.licence.sourceUrl}</a> : "—"}{entry.licence.author && `, by ${entry.licence.author}`}</dd>
                    <dt className="text-gray-500">Licence</dt><dd>{entry.licence.url ? <a className="text-amber-300 hover:underline" href={entry.licence.url} target="_blank" rel="noreferrer">{entry.licence.name || entry.licence.url}</a> : entry.licence.name || "—"}{entry.licence.code && ` (code ${entry.licence.code})`}</dd>
                    <dt className="text-gray-500">Downloaded</dt><dd>{entry.licence.downloadedOn || "—"}{entry.proofUrl && <> · <a className="text-amber-300 hover:underline" href={entry.proofUrl} target="_blank" rel="noreferrer">licence snapshot</a></>}</dd>
                    <dt className="text-gray-500">Credit</dt><dd>{entry.licence.credit || "None needed"}</dd>
                    <dt className="text-gray-500">Used</dt>
                    <dd>{entry.uses.length ? (
                        <details><summary className="cursor-pointer">{entry.uses.length} time{entry.uses.length === 1 ? "" : "s"}</summary>
                            <ul className="mt-1">{entry.uses.map((u, i) => <li key={i}>{u.at.slice(0, 10)}: {u.kind === "short" ? "a Short of" : "the render of"} <Link className="text-amber-300 hover:underline" href={`/admin/podcast/${u.episodeId}/notes`}>{u.episodeId}</Link></li>)}</ul>
                        </details>
                    ) : "Not yet"}</dd>
                </dl>
            ) : (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-3">
                        <input aria-label="Name" className={`${field} !w-auto grow`} value={name} onChange={e => setName(e.target.value)} maxLength={150} />
                        <select aria-label="Kind" value={kind} onChange={e => setKind(e.target.value as LibraryKind)} className={`${field} !w-auto`}>
                            {LIBRARY_KINDS.map(k => <option key={k} value={k}>{LIBRARY_KIND_LABELS[k]}</option>)}
                        </select>
                    </div>
                    <LicenceFields licence={licence} onChange={setLicence} proof={proof} onProof={setProof} proofUrl={entry.proofUrl} disabled={busy} />
                    {entry.checked && <p className={hint}>Saving a changed licence takes the check away: it has to be checked again.</p>}
                </div>
            )}
            <ErrorNote message={error} />
            {isAdmin && (
                <div className="flex flex-wrap items-center gap-2">
                    {editing ? (
                        <>
                            <button className={secondary} disabled={busy || !!licenceProblem(licence)} onClick={() => void save()}>Save</button>
                            <button className={secondary} disabled={busy} onClick={() => { setEditing(false); setLicence(entry.licence); setName(entry.name); setKind(entry.kind); setProof(null); }}>Cancel</button>
                        </>
                    ) : (
                        <>
                            <button className={secondary} disabled={busy} onClick={() => { setLicence(entry.licence); setEditing(true); }}>Edit</button>
                            {entry.checked
                                ? <button className={secondary} disabled={busy} onClick={() => void call({ action: "check", checked: false })}>Take the check back</button>
                                : <button className={secondary} disabled={busy || missing.length > 0} title={missing.length ? `Fill in ${missing.join(", ")} first` : "You read the licence, and it allows this use"}
                                    onClick={() => void call({ action: "check", checked: true })}>I checked the licence</button>}
                            {!entry.checked && missing.length > 0 && <span className={hint}>Missing: {missing.join(", ")}.</span>}
                            <span className="grow" />
                            <button className={secondary} disabled={busy || entry.uses.length > 0} title={entry.uses.length ? "A render used it, so its licence record stays" : "Remove the file and its record"}
                                onClick={() => { if (confirm(`Remove "${entry.name}" from the library? The file and its licence snapshot are deleted.`)) void call({ action: "remove" }).then(ok => ok && onRemoved()); }}>Remove</button>
                        </>
                    )}
                </div>
            )}
        </li>
    );
}

export function LibraryView({ isAdmin }: { isAdmin: boolean }) {
    const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
    const [error, setError] = useState("");
    const [shown, setShown] = useState<"all" | LibraryKind>("all");

    useEffect(() => {
        studioFetch<{ entries: LibraryEntry[] }>("/api/studio/library").then(v => setEntries(v.entries)).catch(e => setError((e as Error).message));
    }, []);

    const list = (entries ?? []).filter(e => shown === "all" || e.kind === shown);
    return (
        <>
            <ErrorNote message={error} />
            {isAdmin && <AddFile onAdded={e => setEntries(prev => [e, ...(prev ?? [])])} />}
            <div className="flex items-center gap-2 text-sm">
                {(["all", ...LIBRARY_KINDS] as const).map(k => (
                    <button key={k} className={`${secondary} ${shown === k ? "!border-amber-400/60 !text-amber-200" : ""}`} onClick={() => setShown(k)}>
                        {k === "all" ? "Everything" : k === "music" ? "Music" : "Effects"}
                    </button>
                ))}
            </div>
            {!entries ? (error ? null : <p className={hint}>Loading…</p>) : !list.length ? <p className={hint}>Nothing here yet.</p> : (
                <ul className="flex flex-col gap-3">
                    {list.map(e => (
                        <Entry key={e.id} entry={e} isAdmin={isAdmin}
                            onChange={next => setEntries(prev => (prev ?? []).map(x => (x.id === next.id ? next : x)))}
                            onRemoved={() => setEntries(prev => (prev ?? []).filter(x => x.id !== e.id))} />
                    ))}
                </ul>
            )}
        </>
    );
}
