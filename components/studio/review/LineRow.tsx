"use client";

import { memo } from "react";
import { timestamp, type Flag, type Line } from "@/lib/transcript";

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
}

interface Props {
    line: Line;
    active: boolean;
    splitting: boolean;
    flag: Flag | undefined;
    flagTo: string | undefined;     // name of the voice the flag suggests
    voices: Voice[];                // voices that lines can be given to (after merges)
    color: string;
    actions: LineActions;
}

// One line of the transcript. Memoised: the page re-renders as the video plays, and only
// the line that becomes active should.
function LineRow({ line, active, splitting, flag, flagTo, voices, color, actions }: Props) {
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
                <span className="ml-auto flex gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
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
                            onClick={() => actions.split(line, line.wordStart + i)}
                            className="rounded px-0.5 hover:bg-amber-500/30 disabled:hover:bg-transparent"
                        >
                            {w.text}{" "}
                        </button>
                    ))}
                </p>
            ) : (
                <p className={`mt-1 leading-relaxed ${line.clip ? "italic text-gray-400" : "text-gray-100"}`}>{line.text}</p>
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

export default memo(LineRow);
