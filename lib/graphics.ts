// Why: motion graphics (docs/specs/021-motion-graphics.md): branded templates drawn by plain HTML pages
// in agent/src/podcast/graphics/templates/. A template reads its data from `window.GRAPHIC` (set before
// its script runs), builds its motion as an in part, a hold that stretches to fill the length, and an out
// part, and exposes `window.seek(ms)` so any frame can be drawn in any order. The render
// (agent/src/podcast/graphics/render.ts) screenshots it in headless Chromium into a ProRes 4444 clip with
// alpha, which the render overlays as a video layer; the editor's preview plays the same HTML in a
// sandboxed iframe (components/studio/graphics.tsx), so what the editor shows is the file the render draws.
//
// This file is the contract both sides share: which templates exist, what GRAPHIC carries, and how a
// graphic layer becomes the video layer the render overlays. Browser-safe: no node imports.

import { FRAME } from './onScreen';
import type { GraphicAnchor, GraphicLayer, Span, VideoLayer } from './layers';
import type { HighlightLayout } from './reframe';

// The templates (spec 021 Part A). `durationMs` is the hold the design gives each one; the producer can
// change it on the layer. The title card and chapters are banners over the picture's bottom third
// (Tom, after the first episode), 7 s so that, after rising in (~1.3 s) and before fading out (0.5 s), they
// are fully readable for about 5 s while the conversation goes on (Tom: "5–7 seconds"). A whole-episode graphic (the logo bug) is drawn once as a `loopMs` clip and
// looped by the render, since a clip is drawn frame by frame. `fullScreen` templates paint the frame
// (no transparency behind them); `element` ones are offered in the editor's Elements panel (the teaser
// tag goes on teasers, never at the playhead).
interface TemplateInfo { label: string; durationMs: number; fullScreen: boolean; loopMs?: number; element: boolean }
export const GRAPHIC_TEMPLATES = {
    titleCard: { label: 'Title card (motion)', durationMs: 7000, fullScreen: false, element: true },
    lowerThird: { label: 'Lower third (motion)', durationMs: 5000, fullScreen: false, element: true },
    logoBug: { label: 'Logo bug (motion)', durationMs: 24 * 3600_000, fullScreen: false, loopMs: 12_000, element: true },
    teaserTag: { label: '“In this episode” (motion)', durationMs: 5000, fullScreen: false, element: false },
    chapter: { label: 'Chapter (motion)', durationMs: 7000, fullScreen: false, element: true },
    pullQuote: { label: 'Pull quote (motion)', durationMs: 6000, fullScreen: true, element: true },
    keyIdea: { label: 'Key idea (motion)', durationMs: 6000, fullScreen: false, element: true },
    endScreen: { label: 'End screen (motion)', durationMs: 20_000, fullScreen: true, element: true },
    logoSting: { label: 'Logo sting (motion)', durationMs: 4000, fullScreen: true, element: true },
    // The starlight wipe is a transition, not a layer (lib/transitions.ts): drawn by the same machinery
    // and overlaid centred on the join, so it is never in the layer schema or the Elements panel.
    starlight: { label: 'Starlight', durationMs: 1000, fullScreen: true, element: false },
    // Part B's highlight layouts (item M3): drawn per highlight layer by the render job, in three planes
    // (`GraphicSpec.mode`), never offered as elements — the highlight layer (lib/reframe.ts) places them.
    highlightSplitQuote: { label: 'Split: quote beside', durationMs: 6000, fullScreen: false, element: false },
    highlightSplitWord: { label: 'Split: stressed word', durationMs: 3000, fullScreen: false, element: false },
    highlightBelow: { label: 'Line below', durationMs: 6000, fullScreen: false, element: false },
    highlightOver: { label: 'Words over', durationMs: 3000, fullScreen: false, element: false },
    highlightIris: { label: 'Iris close', durationMs: 6000, fullScreen: false, element: false },
    highlightPush: { label: 'Push aside', durationMs: 6000, fullScreen: false, element: false },
} as const satisfies Record<string, TemplateInfo>;
export type GraphicTemplate = keyof typeof GRAPHIC_TEMPLATES;
export const GRAPHIC_TEMPLATE_IDS = Object.keys(GRAPHIC_TEMPLATES) as GraphicTemplate[];

// A graphic is drawn frame by frame, so the drawn clip is capped; a layer longer than its clip (the
// logo bug) plays the clip looped.
export const GRAPHIC_MAX_MS = 60_000;

// How long a template's clip is drawn for a layer of `durationMs`.
export const drawnMs = (template: GraphicTemplate, durationMs: number) => {
    const info: TemplateInfo = GRAPHIC_TEMPLATES[template];
    return info.loopMs ?? Math.min(durationMs, GRAPHIC_MAX_MS);
};

// The Studio settings' colours (lib/studioSettings.ts), which every template reads: another show gets its
// own look. The derived tones follow thumbnailCanvas.ts applyPalette.
export interface GraphicColors { background: string; backgroundBottom: string; accent: string }

// A highlight template draws three planes, told apart by `GRAPHIC.mode` (spec 021 item M3): its words
// and frame art with alpha ('graphics', the default every other template draws), the window's shape as
// solid white where the episode's picture shows ('matte', applied with alphamerge so ffmpeg never draws
// a rounded corner), and the full-frame backdrop behind the moved picture ('background').
export const GRAPHIC_MODES = ['graphics', 'matte', 'background'] as const;
export type GraphicMode = typeof GRAPHIC_MODES[number];

// What a template reads from `window.GRAPHIC`. `logo` is where the Studio's logo can be fetched from
// (the renderer serves it from a local file, the editor passes a link); null for templates without it,
// or when none is set and the site's is used by URL.
export interface GraphicData {
    fields: Record<string, string>;
    colors: GraphicColors;
    durationMs: number;
    width: number;
    height: number;
    logo: string | null;
    mode?: GraphicMode;
}

// What one clip is drawn from — and so what names it in the cache: the same spec draws the same clip.
// `logoKey` stands in for the logo file's bytes (its hash), since the URL alone says nothing.
export interface GraphicSpec extends Omit<GraphicData, 'logo'> { template: GraphicTemplate; logoKey?: string }

// The spec for a graphic layer; `logoKey` comes from whoever holds the logo file (the render job).
export function graphicSpec(layer: GraphicLayer, colors: GraphicColors, logoKey?: string): GraphicSpec {
    return {
        template: layer.template,
        fields: layer.fields,
        colors,
        durationMs: drawnMs(layer.template, layer.durationMs),
        width: FRAME.width,
        height: FRAME.height,
        ...(logoKey ? { logoKey } : {}),
    };
}

// The template that draws a highlight layout's planes (spec 021 item M3): lib/reframe.ts names the
// layouts, this names their files.
export const highlightTemplate = (layout: HighlightLayout): GraphicTemplate =>
    `highlight${layout[0].toUpperCase()}${layout.slice(1)}` as GraphicTemplate;

// Whether a graphic sits on the edited episode's clock (srcMs or atMs, like every layer: lib/layers.ts
// layerSpan) or on the programme's (fromEnd: the end screen over the outro's last seconds).
export const episodeAnchored = (a: GraphicAnchor): a is Exclude<GraphicAnchor, { fromEnd: number }> => !('fromEnd' in a);

// When a programme-anchored graphic is up, on the programme's clock (teasers + intro + episode + outro).
export function programmeWindow(layer: { anchor: GraphicAnchor; durationMs: number }, programmeMs: number): Span | null {
    if (episodeAnchored(layer.anchor)) return null;
    const startMs = Math.max(0, programmeMs - layer.anchor.fromEnd);
    const endMs = Math.min(programmeMs, startMs + layer.durationMs);
    return endMs > startMs ? { startMs, endMs } : null;
}

// Moving and resizing a graphic (Tom: the key idea card covered the guest's face). A graphic's optional
// `box` places its whole drawn frame: the frame's top-left corner in render pixels and a uniform scale, so
// the template, its motion and its cached clip stay as they are, and the render only overlays the clip
// elsewhere (asVideoLayer). No box is the design's own place. Only templates with one element the
// producer would want elsewhere are movable: the full-screen ones, the teaser tag (on the programme's
// clock) and the highlights (which reframe the picture itself) are not.
export interface GraphicBox { x: number; y: number; scale: number }
export interface Rect { x: number; y: number; w: number; h: number }
export const BOX_SCALE = { min: 0.4, max: 1.5 } as const;

// Where each movable template draws its element at the design's place, in render pixels (the CSS in its
// template), so the preview can grab the element rather than the whole frame and keep it on the frame.
// The key idea card grows with its words: its height is estimated from them (Cinzel and Outfit widths
// measured in Chromium), close enough for a handle; the render draws whatever the template draws.
const wrapLines = (text: string, perLine: number) =>
    Math.max(1, text.split(/\s+/).filter(Boolean).reduce((lines, word) => {
        const last = lines[lines.length - 1];
        if (last && (last + ' ' + word).length <= perLine) lines[lines.length - 1] = `${last} ${word}`;
        else lines.push(word);
        return lines;
    }, [] as string[]).length);
const MOVABLE: Partial<Record<GraphicTemplate, (fields: Record<string, string>) => Rect>> = {
    titleCard: () => ({ x: 0, y: 720, w: 1920, h: 360 }),
    chapter: () => ({ x: 0, y: 720, w: 1920, h: 360 }),
    lowerThird: f => (f.variant === 'host' ? { x: 74, y: 810, w: 700, h: 150 } : { x: 66, y: 750, w: 1080, h: 210 }),
    logoBug: () => ({ x: 1710, y: 48, w: 150, h: 110 }),
    keyIdea: f => ({
        x: 1130, y: 210, w: 680,
        h: Math.min(870, 211 + 64 * wrapLines(f.term ?? '', 14) + (f.definition?.trim() ? 45 * wrapLines(f.definition, 38) : -22)),
    }),
};
export const movableGraphic = (template: GraphicTemplate) => template in MOVABLE;

// The element's rectangle as the design draws it, or null for a template that is not movable.
export function graphicBounds(layer: Pick<GraphicLayer, 'template' | 'fields'>): Rect | null {
    return MOVABLE[layer.template]?.(layer.fields) ?? null;
}

// Where the element shows once its frame is placed by `box` (or at the design's place without one).
export function placedRect(bounds: Rect, box?: GraphicBox): Rect {
    const b = box ?? { x: 0, y: 0, scale: 1 };
    return { x: b.x + bounds.x * b.scale, y: b.y + bounds.y * b.scale, w: bounds.w * b.scale, h: bounds.h * b.scale };
}

// A box the element fits on the frame with: its scale within BOX_SCALE (and no wider or taller than the
// frame, so a full-width banner only shrinks), its corner moved so the element stays wholly on the frame,
// in whole pixels.
export function clampBox(box: GraphicBox, bounds: Rect): GraphicBox {
    const fit = Math.min(BOX_SCALE.max, FRAME.width / bounds.w, FRAME.height / bounds.h);
    const scale = Math.round(Math.min(fit, Math.max(BOX_SCALE.min, box.scale)) * 1000) / 1000;
    const axis = (v: number, at: number, size: number, frame: number) => {
        const lo = Math.ceil(-at * scale), hi = Math.floor(frame - (at + size) * scale);
        return Math.min(hi, Math.max(lo, Math.round(v)));
    };
    return { x: axis(box.x, bounds.x, bounds.w, FRAME.width), y: axis(box.y, bounds.y, bounds.h, FRAME.height), scale };
}

// The editor's iframe document: the template with GRAPHIC set before its script runs, as the renderer
// sets it. `</` is escaped so a field's text can never close the script tag.
export function graphicSrcDoc(templateHtml: string, data: GraphicData): string {
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    return templateHtml.replace('<head>', `<head><script>window.GRAPHIC = ${json}</script>`);
}

// The graphic's clip as the render overlays it (spec 021 M1): a silent video layer across the whole
// frame, timed as the graphic layer is; the template draws its own place and fades, so the layer's
// edges stay off. A moved graphic's `box` lays the same clip at its corner and scale instead. `mediaPath` is the clip in Storage (episodes/<id>/graphics/<name>.mov). A layer
// longer than its drawn clip (the logo bug) is looped (`loop` on the render's picture entry).
export function asVideoLayer(layer: GraphicLayer, mediaPath: string): VideoLayer {
    if (!episodeAnchored(layer.anchor)) throw new Error('A programme-anchored graphic is overlaid on the programme, never as an episode layer');
    return {
        id: `${layer.id}-clip`,
        kind: 'video',
        track: layer.track,
        anchor: layer.anchor as Exclude<GraphicAnchor, { fromEnd: number }>,
        durationMs: layer.durationMs,
        place: layer.box ? { x: layer.box.x / FRAME.width, y: layer.box.y / FRAME.height, align: 7 } : { x: 0, y: 0, align: 7 },
        opacity: layer.opacity,
        in: { transition: 'none', durationMs: 0 },
        out: { transition: 'none', durationMs: 0 },
        media: { path: mediaPath, name: GRAPHIC_TEMPLATES[layer.template].label },
        w: layer.box?.scale ?? 1,
        trimInMs: 0,
        volumeDb: null,
    };
}
