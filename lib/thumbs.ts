// Why: the picture strip on the Studio editor's timeline (spec 020 item E2). At ingest
// (agent/src/podcast/timelineMedia.ts) the proxy gives one frame every 5 s, 160×90, a hundred to a
// JPEG sheet (analysis/thumbs_N.jpg, about 7 sheets an hour), listed in analysis/thumbs.json.

import { z } from 'zod';

export const THUMBS = { everyMs: 5000, width: 160, height: 90, cols: 10, rows: 10 } as const;

// analysis/thumbs.json: the layout, how many frames there are, and the sheets' Storage paths in order.
export const ThumbIndexSchema = z.object({
    everyMs: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
    count: z.number().int().min(0),
    sheets: z.array(z.string()).max(2000),
});
export type ThumbIndex = z.infer<typeof ThumbIndexSchema>;

// What the editor gets: the same layout, with short-lived links to the sheets instead of paths.
export type ThumbSheets = Omit<ThumbIndex, 'sheets'> & { urls: string[] };

// How many frames a recording of this length gives: one at 0 s, 5 s, 10 s… up to its end.
export function thumbCount(durationMs: number, everyMs: number = THUMBS.everyMs): number {
    return durationMs > 0 ? Math.ceil(durationMs / everyMs) : 0;
}

// Where the frame nearest a moment is: which sheet, and the frame's top-left corner on it.
export function thumbAt(index: Omit<ThumbIndex, 'sheets'>, ms: number): { sheet: number; x: number; y: number } | null {
    if (index.count <= 0) return null;
    const frame = Math.min(index.count - 1, Math.max(0, Math.round(ms / index.everyMs)));
    const perSheet = index.cols * index.rows;
    const i = frame % perSheet;
    return { sheet: Math.floor(frame / perSheet), x: (i % index.cols) * index.width, y: Math.floor(i / index.cols) * index.height };
}
