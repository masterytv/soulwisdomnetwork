"use client";

import { timestamp } from "@/lib/transcript";

export interface VoiceRow {
    label: string;
    name: string;              // current name, as shown on the lines
    typed: string;             // what is in the rename box
    placeholder: string;
    named: boolean;
    clip: boolean;
    color: string;
    talkSeconds: number;
    lineCount: number;
    sampleMs: number | null;
    merged: { label: string; name: string }[];   // voices merged into this one
    sameAs: { label: string; name: string; base: string } | null;   // "Tom Wood - 2" beside "Tom Wood - 1"
}

interface Props {
    rows: VoiceRow[];
    knownNames: string[];
    onRename: (label: string, name: string) => void;
    onClip: (label: string, clip: boolean) => void;
    onMerge: (label: string, into: string, name?: string) => void;
    onUnmerge: (label: string) => void;
    onAdd: () => void;
    onSeek: (ms: number) => void;
}

export default function SpeakersPanel({ rows, knownNames, onRename, onClip, onMerge, onUnmerge, onAdd, onSeek }: Props) {
    return (
        <section className="bg-[#1E1035]/40 border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
            <header>
                <h2 className="font-semibold">Voices</h2>
                <p className="text-xs text-gray-500">
                    A name here changes every line from that voice. If two voices are the same person, merge them.
                </p>
            </header>
            <datalist id="known-names">
                {knownNames.map(n => <option key={n} value={n} />)}
            </datalist>
            {rows.map(row => (
                <div key={row.label} className="rounded-xl border border-white/5 bg-[#130b29]/60 p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: row.color }} />
                        <input
                            value={row.typed}
                            onChange={e => onRename(row.label, e.target.value)}
                            placeholder={row.placeholder}
                            list="known-names"
                            className={`flex-1 min-w-0 bg-transparent border rounded px-2 py-1 text-sm font-semibold ${row.named ? "border-white/10" : "border-orange-400/60"}`}
                            aria-label={`Name for voice ${row.label}`}
                        />
                        {row.sampleMs !== null && (
                            <button onClick={() => onSeek(row.sampleMs!)} className="text-xs text-gray-400 hover:text-amber-300 shrink-0" title="Play a sample of this voice">
                                ▶ Sample
                            </button>
                        )}
                    </div>
                    {row.sameAs && (
                        <p className="text-xs text-sky-200">
                            Looks like the same person as {row.sameAs.name}.{" "}
                            <button onClick={() => onMerge(row.label, row.sameAs!.label, row.sameAs!.base)} className="underline hover:text-white">
                                Merge as {row.sameAs.base}
                            </button>
                        </p>
                    )}
                    {!row.named && <p className="text-xs text-orange-300">Needs a name before you can accept.</p>}
                    <p className="text-xs text-gray-400">
                        {row.lineCount} line{row.lineCount === 1 ? "" : "s"} · talk time {timestamp(row.talkSeconds * 1000)}
                        {row.sampleMs !== null && ` · first heard ${timestamp(row.sampleMs)}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                        <label className="flex items-center gap-1.5 text-gray-300" title="A recording played during the episode, e.g. a video clip">
                            <input type="checkbox" checked={row.clip} onChange={e => onClip(row.label, e.target.checked)} />
                            Clip
                        </label>
                        {rows.length > 1 && (
                            <select
                                value=""
                                onChange={e => e.target.value && onMerge(row.label, e.target.value)}
                                className="bg-[#130b29] border border-white/10 rounded px-1.5 py-0.5 text-gray-300"
                            >
                                <option value="">Same person as…</option>
                                {rows.filter(r => r.label !== row.label).map(r => (
                                    <option key={r.label} value={r.label}>{r.name}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    {row.merged.map(m => (
                        <p key={m.label} className="text-xs text-gray-500">
                            Merged in: voice {m.label} ({m.name}){" "}
                            <button onClick={() => onUnmerge(m.label)} className="underline hover:text-white">Undo</button>
                        </p>
                    ))}
                </div>
            ))}
            <button onClick={onAdd} className="text-xs text-gray-400 hover:text-white self-start">
                + Add a voice that wasn&apos;t detected
            </button>
        </section>
    );
}
