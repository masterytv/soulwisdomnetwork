"use client";

import { memo, useState } from "react";
import { heardIndex, timestamp, type Flag, type Line } from "@/lib/transcript";
import { fixGroup } from "@/lib/wordFixes";

export interface Voice {
    label: string;
    name: string;
    color: string;
}

export interface LineActions {
    seek: (ms: number) => void;
    reassign: (line: Line, label: string) => void;
    split: (line: Line, word: number) => void;
    join: (line: Line) => void;
    dismiss: (line: Line) => void;
    toggleSplit: (id: string | null) => void;
    // Misheard words (spec 019 item 2.3): retype line.words[from..to], or put back what was heard.
    correct: (line: Line, from: number, to: number, text: string) => void;
    putBack: (line: Line, index: number) => void;
    toggleCorrect: (id: string | null) => void;
}

interface Props {
    line: Line;
    active: boolean;
    splitting: boolean;
    correcting: boolean;
    flag: Flag | undefined;
    flagTo: string | undefined;     // name of the voice the flag suggests
    voices: Voice[];                // voices that lines can be given to (after merges)
    color: string;
    actions: LineActions;
}

// One line of the transcript. Memoised: the page re-renders as the video plays, and only
// the line that becomes active should.
function LineRow({ line, active, splitting, correcting, flag, flagTo, voices, color, actions }: Props) {
    const fixed = line.words.some(w => w.heard !== undefined);
    return (
        <div
            id={`line-${line.id}`}
            className={`group rounded-lg px-3 py-2 border-l-4 transition-colors ${active ? "bg-amber-500/10" : flag ? "bg-orange-500/10" : "hover:bg-white/5"}`}
            style={{ borderLeftColor: color }}
        >
            <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                    onClick={() => actions.seek(line.start)}
                    className="font-mono text-gray-400 hover:text-amber-300"
                    title="Play from here"
                >
                    ▶ {timestamp(line.start)}
                </button>
                <select
                    value={line.label}
                    onChange={e => actions.reassign(line, e.target.value)}
                    className="bg-[#130b29] border border-white/10 rounded px-1.5 py-0.5 font-semibold max-w-48"
                    style={{ color }}
                    title="Who said this line"
                >
                    {voices.map(v => <option key={v.label} value={v.label}>{v.name}</option>)}
                </select>
                {line.clip && <span className="text-gray-500 italic">clip</span>}
                {line.changed && <span className="text-sky-300" title="Speaker changed by hand">edited</span>}
                {fixed && <span className="text-sky-300" title="Words retyped by hand">words corrected</span>}
                <span className="ml-auto flex gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <button onClick={() => actions.toggleCorrect(correcting ? null : line.id)} className="text-gray-400 hover:text-white"
                        title="Retype a word the transcriber misheard">
                        {correcting ? "Done correcting" : "Correct words"}
                    </button>
                    {line.words.length > 1 && (
                        <button onClick={() => actions.toggleSplit(splitting ? null : line.id)} className="text-gray-400 hover:text-white">
                            {splitting ? "Cancel split" : "Split"}
                        </button>
                    )}
                    {line.wordStart > 0 && (
                        <button onClick={() => actions.join(line)} className="text-gray-400 hover:text-white" title="Undo the split above this line">
                            Join with line above
                        </button>
                    )}
                </span>
            </div>

            {splitting ? (
                <p className="mt-1 leading-relaxed">
                    <span className="block text-xs text-amber-300 mb-1">Click the first word of the new line.</span>
                    {line.words.map((w, i) => (
                        <button
                            key={i}
                            disabled={i === 0}
                            onClick={() => actions.split(line, heardIndex(w))}
                            className="rounded px-0.5 hover:bg-amber-500/30 disabled:hover:bg-transparent"
                        >
                            {w.text}{" "}
                        </button>
                    ))}
                </p>
            ) : correcting ? (
                <WordFixer line={line} actions={actions} />
            ) : (
                <p className={`mt-1 leading-relaxed ${line.clip ? "italic text-gray-400" : "text-gray-100"}`}>
                    {fixed ? line.words.map((w, i) => (
                        <span key={i}>
                            {w.heard !== undefined
                                ? <span className="underline decoration-dotted decoration-sky-400 underline-offset-2" title={`Corrected; heard as "${w.heard}"`}>{w.text}</span>
                                : w.text}
                            {" "}
                        </span>
                    )) : line.text}
                </p>
            )}

            {flag && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-orange-200">
                    <span>⚑ {flag.reason}.</span>
                    <button onClick={() => actions.reassign(line, flag.toLabel)} className="px-2 py-0.5 rounded border border-orange-400/40 hover:bg-orange-500/20">
                        Give to {flagTo}
                    </button>
                    <button onClick={() => actions.dismiss(line)} className="px-2 py-0.5 rounded border border-white/10 hover:bg-white/10">
                        It&apos;s right
                    </button>
                </div>
            )}
        </div>
    );
}

// Correct words mode: click a word to retype it (a corrected one shows its whole correction), shift-click
// to take in the words up to another one (to merge them). The typed words share the old ones' time.
function WordFixer({ line, actions }: { line: Line; actions: LineActions }) {
    const [sel, setSel] = useState<{ from: number; to: number; text: string } | null>(null);
    const pick = (i: number, extend: boolean) => {
        const [a, b] = fixGroup(line.words, i);
        const from = extend && sel ? Math.min(sel.from, a) : a;
        const to = extend && sel ? Math.max(sel.to, b) : b;
        setSel({ from, to, text: line.words.slice(from, to + 1).map(w => w.text).join(" ") });
    };
    const heard = sel && sel.from === fixGroup(line.words, sel.from)[0] && sel.to === fixGroup(line.words, sel.from)[1]
        ? line.words[sel.from].heard : undefined;
    return (
        <div className="mt-1">
            <span className="block text-xs text-amber-300 mb-1">Click a word to retype it; shift-click another to take in the words between (to merge them).</span>
            <p className="leading-relaxed">
                {line.words.map((w, i) => (
                    <button key={i} onClick={e => pick(i, e.shiftKey)}
                        className={`rounded px-0.5 hover:bg-amber-500/30 ${sel && i >= sel.from && i <= sel.to ? "bg-amber-500/30" : ""} ${w.heard !== undefined ? "underline decoration-dotted decoration-sky-400 underline-offset-2" : ""}`}
                        title={w.heard !== undefined ? `Corrected; heard as "${w.heard}"` : undefined}>
                        {w.text}{" "}
                    </button>
                ))}
            </p>
            {sel && (
                <form className="mt-2 flex flex-wrap items-center gap-2 text-xs"
                    onSubmit={e => { e.preventDefault(); actions.correct(line, sel.from, sel.to, sel.text); setSel(null); }}>
                    <input aria-label="Corrected words" autoFocus value={sel.text} maxLength={200}
                        onChange={e => setSel({ ...sel, text: e.target.value })}
                        onKeyDown={e => { if (e.key === "Escape") setSel(null); }}
                        className="min-w-0 grow max-w-md bg-[#130b29] border border-white/10 rounded px-2 py-1 text-sm text-gray-100" />
                    <button type="submit" disabled={!sel.text.trim()} className="px-2 py-1 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-40">Save</button>
                    <button type="button" onClick={() => setSel(null)} className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/10">Cancel</button>
                    {heard !== undefined && (
                        <span className="text-gray-400">
                            Heard as &ldquo;{heard}&rdquo;{" "}
                            <button type="button" onClick={() => { actions.putBack(line, sel.from); setSel(null); }} className="underline hover:text-white">Put it back</button>
                        </span>
                    )}
                </form>
            )}
        </div>
    );
}

export default memo(LineRow);
