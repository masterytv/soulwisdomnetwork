"use client";

// Find and replace for a misheard name across the episode (spec 019 item 2.3): one correction per
// place it occurs, ignoring case and the punctuation around each word, and one Undo for the lot.
// Shared by speaker review and the Studio editor.

import { useMemo, useState } from "react";
import { findWords, replaceAllOps, type FixOp } from "@/lib/wordFixes";

const box = "min-w-0 w-36 bg-[#130b29] border border-white/10 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-500";
const button = "text-xs px-2 py-1 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export function FindReplace({ words, onReplace, busy = false }: {
    words: { text: string; ref?: string; count?: number }[];
    // Applies the ops; resolves with the ops that undo them (null when nothing was done).
    onReplace: (ops: FixOp[]) => Promise<FixOp[] | null> | FixOp[] | null;
    busy?: boolean;
}) {
    const [find, setFind] = useState("");
    const [replace, setReplace] = useState("");
    const [done, setDone] = useState<{ count: number; undo: FixOp[] } | null>(null);
    const found = useMemo(() => (find.trim() ? findWords(words, find).length : 0), [words, find]);
    const ops = () => replaceAllOps(words, find, replace);
    return (
        <span className="flex flex-wrap items-center gap-1.5">
            <input aria-label="Find words" placeholder="Find a name…" value={find} maxLength={200}
                onChange={e => { setFind(e.target.value); setDone(null); }} className={box} />
            <input aria-label="Replace with" placeholder="Replace with…" value={replace} maxLength={200}
                onChange={e => { setReplace(e.target.value); setDone(null); }} className={box} />
            <button type="button" disabled={busy || !found || !replace.trim()}
                className={`${button} border-amber-500/40 text-amber-300 hover:bg-amber-500/10`}
                title="Correct every place it occurs; the new words share the old ones' time"
                onClick={async () => {
                    const list = ops();
                    const undo = list.length ? await onReplace(list) : null;
                    if (undo) setDone({ count: list.length, undo });
                }}>
                Replace all{find.trim() ? ` (${found})` : ""}
            </button>
            {done && (
                <span className="text-xs text-green-300">
                    Replaced {done.count}.{" "}
                    <button type="button" disabled={busy} className="underline hover:text-white"
                        onClick={async () => { await onReplace(done.undo); setDone(null); }}>
                        Undo replace
                    </button>
                </span>
            )}
        </span>
    );
}
