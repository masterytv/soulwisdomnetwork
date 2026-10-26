// Why: motion graphics (docs/specs/021-motion-graphics.md, item M1): branded templates drawn by plain HTML
// pages in agent/src/podcast/graphics/templates/. A template reads its data from `window.GRAPHIC` (set
// before its script runs), builds its motion as an in part, a hold that stretches to fill the length, and
// an out part, and exposes `window.seek(ms)` so any frame can be drawn in any order. The render
// (agent/src/podcast/graphics/render.ts) screenshots it in headless Chromium into a ProRes 4444 clip with
// alpha, which the render overlays as a video layer; the editor's preview plays the same HTML in a
// sandboxed iframe (components/studio/graphics.tsx), so what the editor shows is the file the render draws.
//
// This file is the contract both sides share: which templates exist, what GRAPHIC carries, and how a
// graphic layer becomes the video layer the render overlays. Browser-safe: no node imports.

import { FRAME } from './onScreen';
import type { GraphicLayer, VideoLayer } from './layers';

// The templates (spec 021 Part A; M1 builds lowerThird, the rest come with M2). `durationMs` is the hold
// the design gives it; the producer can change it on the layer.
export const GRAPHIC_TEMPLATES = {
    lowerThird: { label: 'Lower third (motion)', durationMs: 5000 },
} as const;
export type GraphicTemplate = keyof typeof GRAPHIC_TEMPLATES;
export const GRAPHIC_TEMPLATE_IDS = Object.keys(GRAPHIC_TEMPLATES) as GraphicTemplate[];

// A graphic is drawn frame by frame, so its length is capped: a lower third left "to the end of the
// episode" would draw hours of frames. (The whole-episode logo bug, M2, loops a short clip instead.)
export const GRAPHIC_MAX_MS = 60_000;

// The Studio settings' colours (lib/studioSettings.ts), which every template reads: another show gets its
// own look. The derived tones follow thumbnailCanvas.ts applyPalette.
export interface GraphicColors { background: string; backgroundBottom: string; accent: string }

// What a template reads from `window.GRAPHIC`.
export interface GraphicData {
    fields: Record<string, string>;
    colors: GraphicColors;
    durationMs: number;
    width: number;
    height: number;
}

// What one clip is drawn from — and so what names it in the cache: the same spec draws the same clip.
export interface GraphicSpec extends GraphicData { template: GraphicTemplate }

// The spec for a graphic layer. The clip is drawn for the layer's whole length; the render trims it
// where the episode ends.
export function graphicSpec(layer: GraphicLayer, colors: GraphicColors): GraphicSpec {
    return {
        template: layer.template,
        fields: layer.fields,
        colors,
        durationMs: Math.min(layer.durationMs, GRAPHIC_MAX_MS),
        width: FRAME.width,
        height: FRAME.height,
    };
}

// The editor's iframe document: the template with GRAPHIC set before its script runs, as the renderer
// sets it. `</` is escaped so a field's text can never close the script tag.
export function graphicSrcDoc(templateHtml: string, data: GraphicData): string {
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    return templateHtml.replace('<head>', `<head><script>window.GRAPHIC = ${json}</script>`);
}

// The graphic's clip as the render overlays it (spec 021 M1): a silent video layer across the whole
// frame, timed as the graphic layer is; the template draws its own place and fades, so the layer's
// edges stay off. `mediaPath` is the clip in Storage (episodes/<id>/graphics/<name>.mov).
export function asVideoLayer(layer: GraphicLayer, mediaPath: string): VideoLayer {
    return {
        id: `${layer.id}-clip`,
        kind: 'video',
        track: layer.track,
        anchor: layer.anchor,
        durationMs: layer.durationMs,
        place: { x: 0, y: 0, align: 7 },
        opacity: layer.opacity,
        in: { transition: 'none', durationMs: 0 },
        out: { transition: 'none', durationMs: 0 },
        media: { path: mediaPath, name: GRAPHIC_TEMPLATES[layer.template].label },
        w: 1,
        trimInMs: 0,
        volumeDb: null,
    };
}
