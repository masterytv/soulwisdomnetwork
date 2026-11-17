"use client";

// Why: the Studio's readability (docs/specs/024-studio-readability.md). StudioFrame wraps every Studio page in
// `.studio`, whose CSS (app/globals.css) sets the Studio's text sizes and colours; the controls in the Studio bar
// switch high contrast and the text size for this person, kept in their browser (lib/readability.ts).

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import {
    contrastOn, parseReadability, READABILITY_KEY, stepText, TEXT_SIZES, type Readability, type TextSize,
} from '@/lib/readability';

const MORE_CONTRAST = '(prefers-contrast: more)';
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
    listeners.add(onChange);
    const media = window.matchMedia(MORE_CONTRAST);
    media.addEventListener('change', onChange);
    // Another tab changed it.
    const onStorage = (e: StorageEvent) => { if (e.key === READABILITY_KEY) onChange(); };
    window.addEventListener('storage', onStorage);
    return () => {
        listeners.delete(onChange);
        media.removeEventListener('change', onChange);
        window.removeEventListener('storage', onStorage);
    };
}

function stored(): string | null {
    try { return window.localStorage.getItem(READABILITY_KEY); } catch { return null; }
}

// A string, so React can compare snapshots: what is stored, and whether the computer asks for more contrast.
const snapshot = () => `${window.matchMedia(MORE_CONTRAST).matches ? 1 : 0}${stored() ?? ''}`;

interface ReadabilityState {
    settings: Readability;
    highContrast: boolean;
    setHighContrast: (on: boolean) => void;
    setText: (text: TextSize) => void;
}

function useReadabilityStore(): ReadabilityState {
    // The server, and the first render in the browser, use the defaults; the stored choice follows straight away.
    const snap = useSyncExternalStore(subscribe, snapshot, () => '0');
    const settings = parseReadability(snap.slice(1) || null);
    const highContrast = contrastOn(settings, snap[0] === '1');
    const save = useCallback((change: Partial<Readability>) => {
        const next = { ...parseReadability(stored()), ...change };
        try { window.localStorage.setItem(READABILITY_KEY, JSON.stringify(next)); } catch { /* not kept */ }
        listeners.forEach(l => l());
    }, []);
    return {
        settings,
        highContrast,
        setHighContrast: on => save({ highContrast: on }),
        setText: text => save({ text }),
    };
}

const ReadabilityContext = createContext<ReadabilityState | null>(null);

// The Studio editor has its own bar, which shows the controls itself (studio-editor/page.tsx).
const ownBar = (path: string | null) => !!path && path.endsWith('/studio-editor');

export function StudioFrame({ children }: { children: React.ReactNode }) {
    const state = useReadabilityStore();
    const path = usePathname();
    return (
        <ReadabilityContext.Provider value={state}>
            <div className="studio" data-contrast={state.highContrast ? 'high' : 'normal'} data-text={state.settings.text}>
                {!ownBar(path) && (
                    <div className="bg-studio-page border-b border-studio-hairline px-4 sm:px-8 py-2 flex justify-end">
                        <ReadabilityControls />
                    </div>
                )}
                {children}
            </div>
        </ReadabilityContext.Provider>
    );
}

// Text size (three steps) and the high contrast switch. Ctrl/⌘ with + and − are left to the browser's own zoom.
export function ReadabilityControls() {
    const state = useContext(ReadabilityContext);
    if (!state) return null;
    const { settings, highContrast, setHighContrast, setText } = state;
    const tab = 'px-2.5 py-1 leading-none rounded-md';
    return (
        <div role="group" aria-label="Readability" className="flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Text size" className="flex items-center gap-1 rounded-lg border border-studio-edge p-0.5"
                onKeyDown={e => {
                    // Arrow keys move through the three sizes, like a slider.
                    const by = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
                    if (!by) return;
                    e.preventDefault();
                    setText(stepText(settings.text, by));
                }}>
                <span className="text-xs text-gray-300 px-1.5" aria-hidden>Text size</span>
                {TEXT_SIZES.map((s, i) => (
                    <button key={s.id} type="button" aria-pressed={settings.text === s.id} aria-label={`${s.label} text`}
                        title={`${s.label} text`} onClick={() => setText(s.id)}
                        className={`${tab} font-semibold ${settings.text === s.id ? 'bg-amber-500 text-black' : 'text-gray-100 hover:bg-white/10'}`}
                        style={{ fontSize: `${14 + i * 3}px` }}>
                        A
                    </button>
                ))}
            </div>
            <button type="button" aria-pressed={highContrast} onClick={() => setHighContrast(!highContrast)}
                title="Black, white and yellow, with stronger edges"
                className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border ${highContrast
                    ? 'bg-amber-500 text-black border-amber-500'
                    : 'border-studio-edge text-gray-100 hover:bg-white/10'}`}>
                <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current"
                    style={{ background: 'linear-gradient(90deg, currentColor 50%, transparent 50%)' }} />
                High contrast{highContrast ? ': on' : ''}
            </button>
        </div>
    );
}
