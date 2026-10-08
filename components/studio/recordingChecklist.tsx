"use client";

// The recording checklist's body (lib/recordingChecklist.ts): sections to tick, each with its count, and a
// clear for the next recording that keeps the one-time setup. Ticks live in this browser only, so each host
// keeps their own.

import { useState } from "react";
import { RECORDING_CHECKLIST, clearForNextRecording, itemKey } from "@/lib/recordingChecklist";
import { hint, secondary } from "@/components/studio/ui";

const STORAGE_KEY = "studio-recording-checklist";

export function RecordingChecklist() {
    // The page renders only in the browser (it waits for sign-in), so the saved ticks can be read at once.
    const [ticks, setTicks] = useState<Record<string, boolean>>(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
            return saved && typeof saved === "object" ? saved : {};
        } catch { return {}; }
    });
    const [confirming, setConfirming] = useState(false);

    const save = (next: Record<string, boolean>) => {
        setTicks(next);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage blocked: ticks last this visit */ }
    };

    const total = RECORDING_CHECKLIST.reduce((n, s) => n + s.items.length, 0);
    const done = RECORDING_CHECKLIST.reduce((n, s) => n + s.items.filter(i => ticks[itemKey(s, i)]).length, 0);

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[160px] h-1.5 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / total) * 100}%` }} />
                </div>
                <span className="text-sm text-gray-400 tabular-nums">{done} of {total} done</span>
                {confirming ? (
                    <span className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                        Clears the every-recording sections; the one-time setup stays ticked.
                        <button className={`${secondary} border-red-500/50 text-red-200`} onClick={() => { save(clearForNextRecording(ticks)); setConfirming(false); }}>Clear</button>
                        <button className={secondary} onClick={() => setConfirming(false)}>Cancel</button>
                    </span>
                ) : (
                    <button className={secondary} onClick={() => setConfirming(true)}>Clear for next recording</button>
                )}
            </div>

            {RECORDING_CHECKLIST.map(section => {
                const count = section.items.filter(i => ticks[itemKey(section, i)]).length;
                const complete = count === section.items.length;
                return (
                    <section key={section.id} className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
                        <div className="flex items-start gap-3 px-4 py-3 border-b border-white/10">
                            <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${complete ? "bg-emerald-500" : "bg-white/15"}`} aria-hidden="true" />
                            <div className="flex-1 min-w-0">
                                <h2 className="text-lg font-semibold text-white">{section.title}</h2>
                                <p className={hint}>{section.who}</p>
                            </div>
                            <span className="text-sm text-gray-400 tabular-nums mt-1">{count}/{section.items.length}</span>
                        </div>
                        <ul className="divide-y divide-white/5">
                            {section.items.map(item => {
                                const key = itemKey(section, item);
                                const id = `rc-${section.id}-${item.id}`;
                                return (
                                    <li key={key}>
                                        <label htmlFor={id} className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/[0.03]">
                                            <input id={id} type="checkbox" checked={!!ticks[key]} onChange={e => save({ ...ticks, [key]: e.target.checked })}
                                                className="mt-1 h-4 w-4 shrink-0 accent-emerald-500" />
                                            <span className="min-w-0">
                                                <span className={`text-sm ${ticks[key] ? "text-gray-500 line-through" : "text-gray-100"}`}>{item.text}</span>
                                                {item.why && <span className={`block ${hint}`}>{item.why}</span>}
                                            </span>
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}
