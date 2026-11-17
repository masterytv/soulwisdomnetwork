// Why: the Podcast Studio's readability settings (docs/specs/024-studio-readability.md): high contrast and a text
// size, chosen by each person in the Studio bar and kept in their browser. The look itself is CSS in
// app/globals.css (`.studio`, `[data-contrast]`, `[data-text]`); components/studio/readability.tsx applies these.

export const READABILITY_KEY = 'studio-readability';

// Normal, large, larger: how much the Studio's text grows (the CSS multiplies its sizes by these).
export const TEXT_SIZES = [
    { id: 'normal', label: 'Normal', scale: 1 },
    { id: 'large', label: 'Large', scale: 1.15 },
    { id: 'larger', label: 'Larger', scale: 1.3 },
] as const;

export type TextSize = (typeof TEXT_SIZES)[number]['id'];

export interface Readability {
    // null: not chosen, so it follows the computer's "Increase contrast" setting.
    highContrast: boolean | null;
    text: TextSize;
}

export const DEFAULT_READABILITY: Readability = { highContrast: null, text: 'normal' };

// What was stored, made safe: anything missing or broken falls back to the default.
export function parseReadability(raw: string | null): Readability {
    if (!raw) return DEFAULT_READABILITY;
    try {
        const v = JSON.parse(raw) as Partial<Record<keyof Readability, unknown>>;
        const highContrast = typeof v?.highContrast === 'boolean' ? v.highContrast : null;
        const text = TEXT_SIZES.some(s => s.id === v?.text) ? (v.text as TextSize) : 'normal';
        return { highContrast, text };
    } catch {
        return DEFAULT_READABILITY;
    }
}

// High contrast is on when the person turned it on, or when they never chose and the computer asks for more contrast.
export function contrastOn(r: Readability, systemPrefersMore: boolean): boolean {
    return r.highContrast ?? systemPrefersMore;
}

// The next text size up or down, staying within the three.
export function stepText(text: TextSize, by: 1 | -1): TextSize {
    const i = TEXT_SIZES.findIndex(s => s.id === text);
    return TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, i + by))].id;
}
