// Why: the Studio editor's layout (spec 020 item E1): the script and panel widths and the timeline
// height, which the producer drags and each browser remembers. Pure, so the limits are tested.

export interface PaneSizes {
    scriptPx: number;
    panelPx: number;
    timelinePx: number;
}

export const DEFAULT_PANES: PaneSizes = { scriptPx: 380, panelPx: 340, timelinePx: 270 };

// Each size's smallest and largest value.
export const PANE_LIMITS: Record<keyof PaneSizes, [number, number]> = {
    scriptPx: [280, 720],
    panelPx: [300, 640],
    timelinePx: [140, 560],
};

// The rail's width, and the least the preview and the row above the timeline keep.
export const RAIL_PX = 96;
export const MIN_PREVIEW_PX = 360;
export const MIN_MAIN_PX = 280;

// Where the sizes are kept in the browser.
export const PANES_KEY = 'studio-editor-panes';

const clamp = (v: number, [lo, hi]: [number, number]) => Math.round(Math.min(hi, Math.max(lo, v)));

// Sizes read back from the browser, which may be missing, old or broken: each one a number within
// its limits, or the default.
export function clampPanes(raw: unknown): PaneSizes {
    const from = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const pick = (key: keyof PaneSizes) => {
        const v = from[key];
        return typeof v === 'number' && Number.isFinite(v) ? clamp(v, PANE_LIMITS[key]) : DEFAULT_PANES[key];
    };
    return { scriptPx: pick('scriptPx'), panelPx: pick('panelPx'), timelinePx: pick('timelinePx') };
}

// The sizes that fit a window: the preview keeps at least MIN_PREVIEW_PX (the script gives way
// first, then the panel), and the row above the timeline at least MIN_MAIN_PX. Never below the limits.
export function fitPanes(p: PaneSizes, widthPx: number, heightPx: number): PaneSizes {
    let { scriptPx, panelPx, timelinePx } = p;
    let over = scriptPx + panelPx + RAIL_PX + MIN_PREVIEW_PX - widthPx;
    if (over > 0) {
        const fromScript = Math.min(over, scriptPx - PANE_LIMITS.scriptPx[0]);
        scriptPx -= fromScript;
        over -= fromScript;
        panelPx -= Math.min(over, panelPx - PANE_LIMITS.panelPx[0]);
    }
    const overH = timelinePx + MIN_MAIN_PX - heightPx;
    if (overH > 0) timelinePx = Math.max(PANE_LIMITS.timelinePx[0], timelinePx - overH);
    return { scriptPx, panelPx, timelinePx };
}
