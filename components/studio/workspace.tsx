// Why: the Studio editor's layout (spec 020 item E1), as Descript lays out its editor: a bar on top,
// the script on the left, the preview in the middle, a panel and its rail on the right, and the
// timeline along the bottom. The script, the panel and the timeline can be dragged to a new size,
// and each browser remembers the sizes (lib/workspace.ts). The editor fills the slots.

"use client";

import { useEffect, useRef, useState } from 'react';
import {
    clampPanes, DEFAULT_PANES, fitPanes, PANES_KEY, RAIL_PX, type PaneSizes,
} from '@/lib/workspace';

export interface WorkspacePanel {
    id: string;
    label: string;
    node: React.ReactNode;
}

// The sizes this browser saved. The layout mounts only in the browser, once the episode has loaded,
// so it can read them straight away.
function savedPanes(): PaneSizes {
    try {
        const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(PANES_KEY);
        return saved ? clampPanes(JSON.parse(saved)) : DEFAULT_PANES;
    } catch {
        return DEFAULT_PANES; // no storage, or a broken value
    }
}

function usePaneSizes() {
    const [sizes, setSizes] = useState<PaneSizes>(savedPanes);
    // Kept on every change: a small write, also while dragging.
    useEffect(() => {
        try { window.localStorage.setItem(PANES_KEY, JSON.stringify(sizes)); } catch { /* not kept */ }
    }, [sizes]);
    return { sizes, setSizes };
}

// A bar between two areas: drag it, or focus it and use the arrow keys, to resize; double-click
// puts the default size back. `sign` is +1 when moving right or down makes the area bigger.
function Handle({ axis, label, value, sign, onSize, onReset }: {
    axis: 'x' | 'y'; label: string; value: number; sign: 1 | -1;
    onSize: (px: number) => void; onReset: () => void;
}) {
    const start = useRef<{ at: number; value: number } | null>(null);
    return (
        <div
            role="separator"
            aria-label={label}
            aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
            aria-valuenow={value}
            tabIndex={0}
            title={`Drag to resize · double-click for the default size`}
            className={`shrink-0 bg-white/5 hover:bg-amber-400/40 focus:bg-amber-400/40 outline-none touch-none ${
                axis === 'x' ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'}`}
            onPointerDown={e => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                start.current = { at: axis === 'x' ? e.clientX : e.clientY, value };
            }}
            onPointerMove={e => {
                if (!start.current) return;
                const at = axis === 'x' ? e.clientX : e.clientY;
                onSize(start.current.value + sign * (at - start.current.at));
            }}
            onPointerUp={() => { start.current = null; }}
            onPointerCancel={() => { start.current = null; }}
            onDoubleClick={onReset}
            onKeyDown={e => {
                const step = e.shiftKey ? 64 : 16;
                const keys = axis === 'x' ? { ArrowRight: 1, ArrowLeft: -1 } : { ArrowDown: 1, ArrowUp: -1 };
                const dir = keys[e.key as keyof typeof keys];
                if (!dir) return;
                e.preventDefault();
                e.stopPropagation();
                onSize(value + sign * dir * step);
            }}
        />
    );
}

export function Workspace({ header, script, preview, panels, panelId, onPanel, timeline }: {
    header: React.ReactNode;
    script: React.ReactNode;
    preview: React.ReactNode;
    panels: WorkspacePanel[];
    panelId: string;
    onPanel: (id: string) => void;
    timeline: React.ReactNode;
}) {
    const { sizes, setSizes } = usePaneSizes();
    // The space the layout has, so the panes give way to the preview in a small window.
    const rootRef = useRef<HTMLDivElement>(null);
    // top: where the layout starts (under the site's header), so it fills the rest of the window.
    const [room, setRoom] = useState({ w: 1920, h: 1080, top: 65 });
    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setRoom({
            w: el.clientWidth, h: el.clientHeight, top: Math.round(el.getBoundingClientRect().top + window.scrollY),
        }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const fitted = fitPanes(sizes, room.w, room.h);

    const resize = (key: keyof PaneSizes) => (px: number) => setSizes(s => clampPanes({ ...s, [key]: px }));
    const reset = (key: keyof PaneSizes) => () => setSizes(s => ({ ...s, [key]: DEFAULT_PANES[key] }));
    const active = panels.some(p => p.id === panelId) ? panelId : panels[0]?.id;

    return (
        <div ref={rootRef} style={{ height: `calc(100dvh - ${room.top}px)` }} className="flex flex-col min-h-[560px] overflow-hidden bg-[#0d0720]">
            <header aria-label="Editor bar" className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2 border-b border-white/10">
                {header}
            </header>
            <div className="flex flex-1 min-h-0">
                <section aria-label="Script" style={{ width: fitted.scriptPx }} className="shrink-0 min-w-0 min-h-0 flex flex-col gap-2 p-3 overflow-hidden">
                    {script}
                </section>
                <Handle axis="x" label="Resize the script" value={fitted.scriptPx} sign={1}
                    onSize={resize('scriptPx')} onReset={reset('scriptPx')} />
                <section aria-label="Preview" className="flex-1 min-w-0 min-h-0 flex flex-col gap-2 p-3 overflow-hidden">
                    {preview}
                </section>
                <Handle axis="x" label="Resize the panel" value={fitted.panelPx} sign={-1}
                    onSize={resize('panelPx')} onReset={reset('panelPx')} />
                {/* Every panel stays mounted, so a half-filled form survives switching panels. */}
                <section aria-label="Panel" style={{ width: fitted.panelPx }} className="shrink-0 min-w-0 overflow-y-auto p-3">
                    {panels.map(p => (
                        <div key={p.id} hidden={p.id !== active}>{p.node}</div>
                    ))}
                </section>
                <nav aria-label="Panels" style={{ width: RAIL_PX }} className="shrink-0 flex flex-col gap-1 p-2 border-l border-white/10">
                    {panels.map(p => (
                        <button key={p.id} type="button" aria-pressed={p.id === active} onClick={() => onPanel(p.id)}
                            className={`text-xs text-left px-2 py-1.5 rounded ${p.id === active
                                ? 'text-amber-200 bg-amber-500/10 border border-amber-400/60'
                                : 'text-gray-300 border border-transparent hover:bg-white/5'}`}>
                            {p.label}
                        </button>
                    ))}
                </nav>
            </div>
            <Handle axis="y" label="Resize the timeline" value={fitted.timelinePx} sign={-1}
                onSize={resize('timelinePx')} onReset={reset('timelinePx')} />
            <div aria-label="Timeline area" style={{ height: fitted.timelinePx }} className="shrink-0 overflow-y-auto px-3 pb-3 pt-1">
                {timeline}
            </div>
        </div>
    );
}

// The keys and clicks of the Studio editor, opened with "?" (the button or the key).
const SHORTCUTS: [string, string][] = [
    ['Space', 'Play or pause'],
    ['Click a word, or drag across words', 'Select'],
    ['Shift + click', 'Extend the selection'],
    ['Delete or Backspace', 'Cut the selection'],
    ['Double-click a cut word or pause', 'Bring it back'],
    ['Click a pause or …', 'Shorten the pause, or cut the sound the transcript missed'],
    ['S', 'Split at the playhead'],
    ['Ctrl or ⌘ + Z', 'Undo'],
    ['Shift + Ctrl or ⌘ + Z, or Ctrl + Y', 'Redo'],
    ['Enter in search', 'Next match'],
    ['← →', 'Back or forward one frame (Shift: one second)'],
    ['+ or −, Ctrl or ⌘ + scroll', 'Zoom the timeline in or out (the scroll wheel moves along it)'],
    ['Drag on the waveform', 'Select a stretch of time: Delete cuts it (a cough, a laugh, a door)'],
    ['Drag the edge of a cut on the timeline', 'Trim the cut (double-click a cut to bring it back)'],
    ['Alt while dragging', 'No snapping, and an edge may go into a word'],
    ['Esc', 'Clear the timeline selection, or close this sheet'],
    ['Arrow keys on a divider', 'Resize the script, panel or timeline (Shift: faster)'],
    ['?', 'Open or close this sheet'],
];

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-label="Shortcuts"
                className="w-full max-w-xl rounded-xl border border-white/10 bg-[#130b29] p-5 text-sm text-gray-200 shadow-2xl"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center mb-3">
                    <h2 className="text-lg font-bold text-amber-400">Shortcuts</h2>
                    <span className="grow" />
                    <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white px-2">×</button>
                </div>
                <table className="w-full">
                    <tbody>
                        {SHORTCUTS.map(([keys, does]) => (
                            <tr key={keys} className="border-t border-white/5">
                                <td className="py-1.5 pr-4 text-amber-200 whitespace-nowrap align-top">{keys}</td>
                                <td className="py-1.5 text-gray-300">{does}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p className="mt-3 text-xs text-gray-400">
                    Amber = suggested · Grey = your cuts · … = sound the transcript has no words for. On the
                    timeline, red waveform is what the edit takes out. Every change saves by itself.
                </p>
            </div>
        </div>
    );
}
