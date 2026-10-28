// Why: the Studio editor's layers (docs/specs/020-studio-editor.md item E5): pictures, video and text over
// the episode, grown from Part I's overlays (lib/onScreen.ts) as docs/PLANNING.md decided ("add box beside
// the nine positions"). A layer starts at a moment of the recording (`anchor.srcMs`, so it moves with its
// words when cuts change) or at a time in the edited episode (`anchor.atMs`, pinned), lasts `durationMs`
// on the edited timeline, and sits where its `place` says: the point of the frame (fractions) that one
// of its nine points (`align`, numbered like a phone's keypad upside down, as ASS and the nine positions
// do: 1 bottom left … 9 top right) is pinned to. A picture's height follows its own shape, so only its
// width is kept. Today's overlays and the notes plan's b-roll convert to layers exactly (`toLayer`,
// `brollLayer`), so an episode looks the same until the producer changes something.
//
// The preview (components/studio/layers.tsx) and the render (agent/src/podcast/editRender.ts) both read
// the times and looks from here, so they cannot disagree.

import { z } from 'zod';
import { editedTime, type KeptRange } from './edit';
import { BOX_SCALE, GRAPHIC_MAX_MS, GRAPHIC_TEMPLATES, type GraphicTemplate } from './graphics';
import { HIGHLIGHT_LABELS, HIGHLIGHT_LAYOUTS, HIGHLIGHT_MAX_MS, HIGHLIGHT_MIN_MS } from './reframe';
import {
    ALIGN, assRgba, assText, assTime, BACKGROUNDS, FONT_NAMES, FRAME, POSITIONS, SIZE_NAMES, styleLine, TEXT_SIZES,
    type CaptionStyle, type FontName, type Overlay, type Position,
} from './onScreen';
import type { Cue } from './captions';

// ─── the model ───────────────────────────────────────────────────────────────

// How a layer comes and goes: a fade (the default), straight on and off, or a slide in the direction named.
export const LAYER_TRANSITIONS = ['fade', 'none', 'slideLeft', 'slideRight', 'slideUp', 'slideDown'] as const;
export type LayerTransition = typeof LAYER_TRANSITIONS[number];
export const LAYER_TRANSITION_LABELS: Record<LayerTransition, string> = {
    fade: 'Fade', none: 'None', slideLeft: 'Slide left', slideRight: 'Slide right', slideUp: 'Slide up', slideDown: 'Slide down',
};

// A still's slow movement, made with the render's Ken Burns (media.ts kenBurns), which fills the frame's shape.
export const MOTIONS = ['none', 'kenBurnsIn', 'kenBurnsOut', 'pan'] as const;
export type Motion = typeof MOTIONS[number];
export const MOTION_LABELS: Record<Motion, string> = { none: 'Still', kenBurnsIn: 'Slow zoom in', kenBurnsOut: 'Slow zoom out', pan: 'Slow pan' };

// The tracks: V2 pictures and video, V3 text (the timeline draws them in that order, V3 on top). The logo bug
// (item E6) is a picture on track 4, so it stays over full-frame b-roll; text is always drawn over pictures.
export const TRACK = { pictures: 2, text: 3, logo: 4 } as const;

export const LAYERS_MAX = 500;
export const LAYER_MIN_MS = 500;
const ms = z.number().min(0).max(24 * 3600_000).transform(Math.round);
const id = z.string().regex(/^[\w-]{1,40}$/);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #ffffff');

export const AnchorSchema = z.union([z.object({ srcMs: ms }).strict(), z.object({ atMs: ms }).strict()]);
export type Anchor = z.infer<typeof AnchorSchema>;

const EdgeSchema = z.object({ transition: z.enum(LAYER_TRANSITIONS), durationMs: z.number().int().min(0).max(3000) });
export type Edge = z.infer<typeof EdgeSchema>;

// The point of the frame, as fractions (a little outside the frame is allowed, for a picture hanging off
// an edge), and which of the layer's nine points is pinned to it.
export const PlaceSchema = z.object({ x: z.number().min(-1).max(2), y: z.number().min(-1).max(2), align: z.number().int().min(1).max(9) });
export type Place = z.infer<typeof PlaceSchema>;

// Where a picture's file is in Cloud Storage: an upload of this Studio (`overlays/`, Part I), the
// episode's own files (its media bin, b-roll, edit package) or the Studio's (`settings/`, the logo and
// intro). The edit route checks that each new one belongs to the episode's bin (lib/server/mediaBin.ts).
// `SITE_LOGO` is the site's own logo (public/logo.png), used when the Studio settings have none: the
// render takes it from the repository and the editor from the site.
export const SITE_LOGO = 'site/logo.png';
export const SITE_LOGO_URL = '/logo.png';
export const MediaPathSchema = z.string().max(300)
    .regex(/^(overlays\/[\w.\- ]+|settings\/[\w.\-]+|episodes\/[\w-]{10,}\/[\w.\-/ ]+|site\/logo\.png)$/, 'Not a Studio file')
    .refine(p => !p.includes('..'), 'Not a Studio file');

const base = {
    id,
    track: z.number().int().min(2).max(9),
    anchor: AnchorSchema,
    durationMs: z.number().int().min(LAYER_MIN_MS).max(24 * 3600_000),
    place: PlaceSchema,
    opacity: z.number().min(0).max(1),
    in: EdgeSchema,
    out: EdgeSchema,
};
const media = z.object({ path: MediaPathSchema, name: z.string().trim().max(150) });

// What a layer was added as (item E6), for its name in the panels and on the timeline: a logo bug, a title
// card or a lower third. Absent: a plain picture, video or text.
export const ELEMENTS = ['logo', 'title', 'lowerThird'] as const;
export type Element = typeof ELEMENTS[number];
export const ELEMENT_LABELS: Record<Element, string> = { logo: 'Logo bug', title: 'Title card', lowerThird: 'Lower third' };

export const ImageLayerSchema = z.object({
    ...base, kind: z.literal('image'), media,
    w: z.number().min(0.02).max(2),              // width, as a share of the frame's
    motion: z.enum(MOTIONS),
    element: z.literal('logo').optional(),
});
export const VideoLayerSchema = z.object({
    ...base, kind: z.literal('video'), media,
    w: z.number().min(0.02).max(2),
    trimInMs: ms,                                 // where in the clip it starts
    volumeDb: z.number().min(-60).max(12).nullable(),   // its own sound, mixed under the voice; null: silent
});
export const TextLayerSchema = z.object({
    ...base, kind: z.literal('text'),
    text: z.string().trim().min(1, 'Type the text').max(200),
    subtext: z.string().trim().max(200),
    font: z.enum(FONT_NAMES),
    size: z.enum(SIZE_NAMES),
    color: hex,
    background: z.enum(BACKGROUNDS),
    band: hex.optional(),                         // the band's colour when the background is a band; absent: dark
    subColor: hex.optional(),                     // the second line's colour; absent: as the first
    element: z.enum(['title', 'lowerThird']).optional(),
});
// A motion graphic (docs/specs/021-motion-graphics.md): a branded template drawn over the picture, with
// its fields checked per template (each ≤ 200 characters, trimmed). Its in and out are the template's own
// motion, so the edges stay 'none'; it covers the whole frame, so it has no place or width, only an
// optional `box` that moves and scales the whole drawn frame. Most sit on
// the edited episode's clock like every layer; the end screen sits `fromEnd` ms before the programme's
// end, over the outro (lib/graphics.ts programmeWindow). Only the logo bug may run the whole episode
// (its clip is drawn short and looped); everything else is drawn frame by frame, so its length is capped.
const noEdge = z.object({ transition: z.literal('none'), durationMs: z.literal(0) }).strict();
const field200 = z.string().trim().max(200);
export const GraphicAnchorSchema = z.union([...AnchorSchema.options, z.object({ fromEnd: ms }).strict()]);
export type GraphicAnchor = z.infer<typeof GraphicAnchorSchema>;
// Where a moved graphic's whole frame sits (lib/graphics.ts GraphicBox): its corner in render pixels and its
// scale. The editor keeps the element itself on the frame (clampBox); these are only the outer limits.
const GraphicBoxSchema = z.object({
    x: z.number().int().min(-FRAME.width * BOX_SCALE.max).max(FRAME.width),
    y: z.number().int().min(-FRAME.height * BOX_SCALE.max).max(FRAME.height),
    scale: z.number().min(BOX_SCALE.min).max(BOX_SCALE.max),
}).strict();
const graphicOf = <T extends GraphicTemplate, F extends z.ZodRawShape>(template: T, fields: F) => z.object({
    id,
    track: z.number().int().min(2).max(9),
    anchor: GraphicAnchorSchema,
    durationMs: z.number().int().min(LAYER_MIN_MS).max('loopMs' in GRAPHIC_TEMPLATES[template] ? 24 * 3600_000 : GRAPHIC_MAX_MS),
    opacity: z.number().min(0).max(1),
    in: noEdge,
    out: noEdge,
    kind: z.literal('graphic'),
    template: z.literal(template),
    fields: z.object(fields).strict(),
    box: GraphicBoxSchema.optional(),
});
export const GraphicLayerSchema = z.discriminatedUnion('template', [
    graphicOf('titleCard', { title: field200, guest: field200, show: field200 }),
    graphicOf('lowerThird', { name: field200, descriptor: field200, variant: z.enum(['guest', 'host']) }),
    graphicOf('logoBug', {}),
    graphicOf('teaserTag', { speaker: field200 }),
    graphicOf('chapter', { number: field200, title: field200 }),
    graphicOf('pullQuote', { quote: field200, speaker: field200 }),
    graphicOf('keyIdea', { term: field200, definition: field200 }),
    graphicOf('endScreen', {}),
    graphicOf('logoSting', {}),
]);
// A highlight (spec 021 Part B, lib/reframe.ts): a few seconds where the episode's own picture is
// reframed by its layout's template and the words from that moment appear. Always anchored on its first
// word (srcMs), so it moves with its words when cuts change; drawn on its own lane above V1. The edit
// route also refuses overlaps, teaser stretches and cut words (lib/reframe.ts highlightProblems).
export const HighlightLayerSchema = z.object({
    id,
    kind: z.literal('highlight'),
    layout: z.enum(HIGHLIGHT_LAYOUTS),
    anchor: z.object({ srcMs: ms }).strict(),
    durationMs: z.number().int().min(HIGHLIGHT_MIN_MS).max(HIGHLIGHT_MAX_MS),
    words: z.string().trim().min(1, 'A highlight needs its words').max(500),
    emphasis: z.string().trim().max(80),
    speaker: z.string().trim().max(200),
    suggested: z.boolean().optional(),      // Claude's suggestion (M4), cleared once a producer touches it
}).strict().refine(h => !h.emphasis || h.words.toLowerCase().includes(h.emphasis.toLowerCase()), 'The stressed word must be inside the words');

export const LayerSchema = z.discriminatedUnion('kind', [ImageLayerSchema, VideoLayerSchema, TextLayerSchema, GraphicLayerSchema, HighlightLayerSchema]);
export type ImageLayer = z.infer<typeof ImageLayerSchema>;
export type VideoLayer = z.infer<typeof VideoLayerSchema>;
export type TextLayer = z.infer<typeof TextLayerSchema>;
export type GraphicLayer = z.infer<typeof GraphicLayerSchema>;
export type HighlightLayer = z.infer<typeof HighlightLayerSchema>;
export type PictureLayer = ImageLayer | VideoLayer;
export type Layer = z.infer<typeof LayerSchema>;
export const LayersSchema = z.array(LayerSchema).max(LAYERS_MAX)
    .refine(ls => new Set(ls.map(l => l.id)).size === ls.length, 'Two layers have the same id');

export const isPicture = (l: Layer): l is PictureLayer => l.kind === 'image' || l.kind === 'video';

// What a layer is, in words: its element, its template, or its kind.
export function layerKind(l: Layer): string {
    if (l.kind === 'highlight') return `Highlight · ${HIGHLIGHT_LABELS[l.layout]}`;
    if (l.kind === 'graphic') return GRAPHIC_TEMPLATES[l.template].label;
    if (l.kind !== 'video' && l.element) return ELEMENT_LABELS[l.element];
    return l.kind === 'text' ? 'Text' : l.kind === 'video' ? 'Video' : 'Picture';
}

// A layer's name in the panels and on the timeline: what it says, or its file's name.
export function layerName(l: Layer): string {
    if (l.kind === 'highlight') return l.emphasis || l.words;
    if (l.kind === 'graphic') {
        const name = l.template === 'lowerThird' ? l.fields.name
            : l.template === 'titleCard' || l.template === 'chapter' ? l.fields.title
            : l.template === 'pullQuote' ? l.fields.quote
            : l.template === 'keyIdea' ? l.fields.term
            : l.template === 'teaserTag' ? l.fields.speaker : '';
        return name || GRAPHIC_TEMPLATES[l.template].label;
    }
    if (l.kind === 'text') return l.subtext ? `${l.text} · ${l.subtext}` : l.text;
    return l.media.name;
}

// ─── from today's edit ──────────────────────────────────────────────────────

// Where a nine-point position sits, `mh` and `mv` pixels in from the edges, as a place.
export function placeOf(position: Position, mh: number, mv: number): Place {
    const x = position.endsWith('left') ? mh / FRAME.width : position.endsWith('right') ? 1 - mh / FRAME.width : 0.5;
    const y = position.startsWith('top') ? mv / FRAME.height : position.startsWith('bottom') ? 1 - mv / FRAME.height : 0.5;
    return { x, y, align: ALIGN[position] };
}

// How far in from the frame's edges a layer sits at each of the nine positions, in render pixels: text 90
// from the sides and 80 from the top or bottom (a lower third 120, clear of the captions), pictures 60,
// and none for a picture as wide as the frame.
export function marginsOf(l: Layer): [number, number] {
    if (l.kind === 'graphic' || l.kind === 'highlight') return [0, 0];   // the whole frame: the template places itself
    if (l.kind === 'text') return [90, l.element === 'lowerThird' ? 120 : 80];
    return l.w >= 1 ? [0, 0] : [60, 60];
}

// Which of the nine positions a layer is at, or "custom" once dragged or typed somewhere else.
export function positionOf(l: Layer): Position | 'custom' {
    if (l.kind === 'graphic' || l.kind === 'highlight') return 'custom';   // no place of its own: it covers the frame
    const [mh, mv] = marginsOf(l);
    const hit = POSITIONS.find(p => {
        const q = placeOf(p, mh, mv);
        return Math.abs(q.x - l.place.x) < 1e-3 && Math.abs(q.y - l.place.y) < 1e-3 && q.align === l.place.align;
    });
    return hit ?? 'custom';
}

const NO_EDGE: Edge = { transition: 'none', durationMs: 0 };
export const FADE = (durationMs: number): Edge => ({ transition: 'fade', durationMs });

// An overlay of Part I as a layer, placed and timed exactly as the render drew it: text 90 px in from
// the sides and 80 from the top or bottom, fading in and out over 250 ms; images 60 px in (none when
// they fill the width), popping on and off.
export function toLayer(o: Overlay): Layer {
    const common = { id: o.id, anchor: { srcMs: o.atMs }, durationMs: Math.max(LAYER_MIN_MS, Math.round(o.seconds * 1000)), opacity: 1 };
    if (o.type === 'text') {
        return {
            ...common, kind: 'text', track: TRACK.text, place: placeOf(o.position, 90, 80), in: FADE(250), out: FADE(250),
            text: o.text, subtext: o.subtext, font: o.font, size: o.size, color: o.color, background: o.background,
        };
    }
    const m = o.widthPct >= 100 ? 0 : 60;
    return {
        ...common, kind: 'image', track: TRACK.pictures, place: placeOf(o.position, m, m), in: NO_EDGE, out: NO_EDGE,
        media: { path: o.path, name: o.name }, w: o.widthPct / 100, motion: 'none',
    };
}

// A b-roll still from the notes plan (spec 008) as a layer, as the render drew it: the whole frame,
// a slow zoom in, half a second's fade in and out.
export function brollLayer(b: { index: number; startMs: number; durationSeconds: number; path: string; idea?: string }): ImageLayer {
    return {
        id: `broll-${b.index}`, kind: 'image', track: TRACK.pictures, anchor: { srcMs: Math.max(0, Math.round(b.startMs)) },
        durationMs: Math.max(LAYER_MIN_MS, Math.round(b.durationSeconds * 1000)), place: { x: 0, y: 0, align: 7 },
        opacity: 1, in: FADE(500), out: FADE(500), media: { path: b.path, name: (b.idea ?? `B-roll ${b.index + 1}`).slice(0, 150) },
        w: 1, motion: 'kenBurnsIn',
    };
}

// The edit's layers: its own once it has them; before that, its overlays converted. The notes plan's
// b-roll joins them when the Studio editor first opens the edit (see the editor), not here: until the
// producer saves, the render keeps drawing the b-roll from the notes plan as it always has.
export function layersOf(edit: { layers?: Layer[]; overlays?: Overlay[] }): Layer[] {
    return edit.layers ?? (edit.overlays ?? []).map(toLayer);
}

// ─── time ───────────────────────────────────────────────────────────────────

export interface Span { startMs: number; endMs: number }

// When a layer is up in the edited episode: from where its moment of the recording lands (the next kept
// moment when that was cut) or its pinned time, for its length, ending with the episode at the latest.
// Null when it would start after the end.
export function layerSpan(layer: { anchor: Anchor | GraphicAnchor; durationMs: number }, ranges: KeptRange[], editedMs: number): Span | null {
    // A programme-anchored graphic (fromEnd, spec 021) is not on the episode's clock: lib/graphics.ts programmeWindow.
    if ('fromEnd' in layer.anchor) return null;
    const startMs = 'srcMs' in layer.anchor ? editedTime(layer.anchor.srcMs, ranges, true) : layer.anchor.atMs;
    if (startMs === null || startMs >= editedMs) return null;
    return { startMs, endMs: Math.min(editedMs, startMs + layer.durationMs) };
}

// Whether a layer's own moment was cut (it then shows at the next kept moment): flagged, never deleted.
export const anchorCut = (layer: { anchor: Anchor | GraphicAnchor }, ranges: KeptRange[]) =>
    'srcMs' in layer.anchor && editedTime(layer.anchor.srcMs, ranges) === null;

// Moving a layer (or a sound): to a new start in the edited episode, keeping how it is anchored (`sourceAt`
// maps an edited time back to the recording, sourceTime in lib/sequence.ts). A programme-anchored graphic
// (fromEnd) keeps its place at the end.
export function startAt<L extends { anchor: Anchor | GraphicAnchor }>(layer: L, editedMs: number, sourceAt: (atMs: number) => number | null): L {
    if ('fromEnd' in layer.anchor) return layer;
    if ('atMs' in layer.anchor) return { ...layer, anchor: { atMs: Math.max(0, Math.round(editedMs)) } };
    const src = sourceAt(Math.max(0, editedMs));
    return src === null ? layer : { ...layer, anchor: { srcMs: Math.round(src) } };
}

// ─── how it looks at a moment (the preview) ──────────────────────────────────

// Which column and row of the layer its pinned point is: 0, 0.5 or 1 of its width and height.
export function alignFractions(align: number): { fx: number; fy: number } {
    const col = (align - 1) % 3, row = Math.floor((align - 1) / 3);
    return { fx: col / 2, fy: row === 0 ? 1 : row === 1 ? 0.5 : 0 };
}

// A layer's look `nowMs` into the edited episode: opacity (with its fades), and how far a slide has
// moved it, as shares of the frame (dx, dy). Null when it is not up.
export function lookAt(layer: { opacity: number; in: Edge; out: Edge }, span: Span, nowMs: number): { opacity: number; dx: number; dy: number } | null {
    if (nowMs < span.startMs || nowMs >= span.endMs) return null;
    let opacity = layer.opacity, dx = 0, dy = 0;
    const into = nowMs - span.startMs, left = span.endMs - nowMs;
    const edge = (e: Edge, p: number, entering: boolean) => {
        if (e.transition === 'fade') opacity *= p;
        else if (e.transition !== 'none') {
            const away = 1 - p;   // 1 off the frame, 0 in place
            const dir = { slideLeft: [-1, 0], slideRight: [1, 0], slideUp: [0, -1], slideDown: [0, 1] }[e.transition];
            // Entering, it comes from the side it moves away from; leaving, it goes the way it moves.
            const sign = entering ? -1 : 1;
            dx += sign * dir[0] * away;
            dy += sign * dir[1] * away;
        }
    };
    if (layer.in.durationMs > 0 && into < layer.in.durationMs) edge(layer.in, into / layer.in.durationMs, true);
    if (layer.out.durationMs > 0 && left < layer.out.durationMs) edge(layer.out, left / layer.out.durationMs, false);
    return { opacity, dx, dy };
}

// ─── the render: pictures (ffmpeg) ──────────────────────────────────────────

const sec = (msVal: number) => (msVal / 1000).toFixed(3);

// A picture's width in pixels on the 1080p frame, even for the encoder.
export const pictureWidth = (w: number) => Math.max(2, Math.round(FRAME.width * w / 2) * 2);

// The overlay filter's x and y for a picture: its pinned point at the place, with a slide in and out.
// W, H are the frame and w, h the picture; t is the episode's time.
export function overlayXY(layer: PictureLayer, span: Span): { x: string; y: string } {
    const { fx, fy } = alignFractions(layer.place.align);
    const X = `(${layer.place.x.toFixed(5)}*W-${fx}*w)`;
    const Y = `(${layer.place.y.toFixed(5)}*H-${fy}*h)`;
    const S = span.startMs / 1000, E = span.endMs / 1000;
    const slide = (axis: 'x' | 'y', at: string) => {
        let expr = at;
        const parts: { e: Edge; entering: boolean }[] = [{ e: layer.in, entering: true }, { e: layer.out, entering: false }];
        for (const { e, entering } of parts.reverse()) {
            if (!e.transition.startsWith('slide') || e.durationMs <= 0) continue;
            const horizontal = e.transition === 'slideLeft' || e.transition === 'slideRight';
            if ((axis === 'x') !== horizontal) continue;
            const d = e.durationMs / 1000;
            // Off the frame on each side: before the left or top edge, or past the right or bottom one.
            const before = axis === 'x' ? '-w' : '-h', after = axis === 'x' ? 'W' : 'H';
            const forward = e.transition === 'slideRight' || e.transition === 'slideDown';
            const from = entering ? (forward ? before : after) : at;
            const to = entering ? at : (forward ? after : before);
            const p = entering ? `(t-${S.toFixed(3)})/${d.toFixed(3)}` : `(t-${(E - d).toFixed(3)})/${d.toFixed(3)}`;
            const moving = `(${from})+((${to})-(${from}))*${p}`;
            expr = entering ? `if(lt(t,${(S + d).toFixed(3)}),${moving},${expr})` : `if(gt(t,${(E - d).toFixed(3)}),${moving},${expr})`;
        }
        return expr;
    };
    return { x: slide('x', X), y: slide('y', Y) };
}

// The filter text that lays one picture (ffmpeg input `inputIdx`) over `inLabel` while it is up, giving
// `outLabel`. A still's input is looped for the layer's length (`-loop 1 -t`), and a moving still is
// already a clip (Ken Burns), so both are streams with their own time; a video is trimmed from `trimInMs`.
export function pictureFilter(inputIdx: number, inLabel: string, outLabel: string, layer: PictureLayer, span: Span): string {
    const S = span.startMs / 1000, dur = (span.endMs - span.startMs) / 1000;
    const trimIn = layer.kind === 'video' ? layer.trimInMs / 1000 : 0;
    const steps = [
        `trim=start=${trimIn.toFixed(3)}:duration=${dur.toFixed(3)}`,
        'setpts=PTS-STARTPTS', 'fps=30', `scale=${pictureWidth(layer.w)}:-2`, 'format=rgba',
    ];
    if (layer.in.transition === 'fade' && layer.in.durationMs > 0) steps.push(`fade=t=in:st=0:d=${sec(layer.in.durationMs)}:alpha=1`);
    if (layer.out.transition === 'fade' && layer.out.durationMs > 0) {
        steps.push(`fade=t=out:st=${Math.max(0, dur - layer.out.durationMs / 1000).toFixed(3)}:d=${sec(layer.out.durationMs)}:alpha=1`);
    }
    if (layer.opacity < 1) steps.push(`colorchannelmixer=aa=${layer.opacity.toFixed(3)}`);
    steps.push(`setpts=PTS+${S.toFixed(3)}/TB`);
    const { x, y } = overlayXY(layer, span);
    return `[${inputIdx}:v]${steps.join(',')}[${outLabel}_p];` +
        `[${inLabel}][${outLabel}_p]overlay=x='${x}':y='${y}':enable='between(t,${S.toFixed(3)},${(span.endMs / 1000).toFixed(3)})':eof_action=pass,format=yuv420p[${outLabel}];`;
}

// A video layer's own sound, turned up or down and placed at its start, for mixing under the episode's.
export function layerAudioFilter(inputIdx: number, outLabel: string, layer: VideoLayer, span: Span): string | null {
    if (layer.volumeDb === null) return null;
    const dur = (span.endMs - span.startMs) / 1000;
    const delay = Math.round(span.startMs);
    return `[${inputIdx}:a]atrim=start=${(layer.trimInMs / 1000).toFixed(3)}:duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS,` +
        `aformat=sample_rates=48000:channel_layouts=stereo,volume=${layer.volumeDb}dB,` +
        `afade=t=in:d=0.05,afade=t=out:st=${Math.max(0, dur - 0.05).toFixed(3)}:d=0.05,adelay=${delay}|${delay}[${outLabel}];`;
}

// ─── the render: text (ASS) ─────────────────────────────────────────────────

const px = (f: number, size: number) => Math.round(f * size);

// The second line's height, as a share of the first's.
export const SUBTEXT_SCALE = 0.6;

// The ASS events for one text layer: pinned with \an and \pos (the same spot the nine positions gave),
// faded with \fad, see-through with \alpha, and a slide as a \move before and after the still part.
export function textEvents(layer: TextLayer, span: Span, style: string): string[] {
    const x = px(layer.place.x, FRAME.width), y = px(layer.place.y, FRAME.height);
    const subColor = layer.subColor && layer.subColor.toLowerCase() !== layer.color.toLowerCase() ? `\\c${assRgba(layer.subColor)}&` : '';
    const second = layer.subtext ? `\\N{\\fs${Math.round(TEXT_SIZES[layer.size] * SUBTEXT_SCALE)}${subColor}}${assText(layer.subtext)}` : '';
    const body = `${assText(layer.text)}${second}`;
    const alpha = layer.opacity < 1 ? `\\alpha&H${Math.round((1 - layer.opacity) * 255).toString(16).padStart(2, '0').toUpperCase()}&` : '';
    const fadeIn = layer.in.transition === 'fade' ? layer.in.durationMs : 0;
    const fadeOut = layer.out.transition === 'fade' ? layer.out.durationMs : 0;
    const off = (t: LayerTransition, entering: boolean): [number, number] => {
        const forward = t === 'slideRight' || t === 'slideDown';
        const out = entering ? !forward : forward;   // which side: past the end (right/bottom) or before the start
        if (t === 'slideLeft' || t === 'slideRight') return [out ? FRAME.width + 400 : -400, y];
        return [x, out ? FRAME.height + 200 : -200];
    };
    const slideIn = layer.in.transition.startsWith('slide') ? Math.min(layer.in.durationMs, span.endMs - span.startMs) : 0;
    const slideOut = layer.out.transition.startsWith('slide') ? Math.min(layer.out.durationMs, span.endMs - span.startMs - slideIn) : 0;
    const events: string[] = [];
    const line = (from: number, to: number, pos: string, fad: string) =>
        events.push(`Dialogue: 1,${assTime(from)},${assTime(to)},${style},,0,0,0,,{\\an${layer.place.align}${pos}${fad}${alpha}}${body}`);
    const midFrom = span.startMs + slideIn, midTo = span.endMs - slideOut;
    if (slideIn > 0) {
        const [fx, fy] = off(layer.in.transition, true);
        line(span.startMs, midFrom, `\\move(${fx},${fy},${x},${y})`, '');
    }
    if (midTo > midFrom) {
        const fad = fadeIn || fadeOut ? `\\fad(${slideIn ? 0 : fadeIn},${slideOut ? 0 : fadeOut})` : '';
        line(midFrom, midTo, `\\pos(${x},${y})`, fad);
    }
    if (slideOut > 0) {
        const [tx, ty] = off(layer.out.transition, false);
        line(midTo, span.endMs, `\\move(${x},${y},${tx},${ty})`, '');
    }
    return events;
}

// The whole ASS file: captions (when a look is given) and every text layer, timed on the edited video.
// Null when there is nothing to show. Each text layer has its own style for its font and look; where it
// sits comes from its own \an and \pos.
export function layersAss(cues: Cue[], captions: CaptionStyle | null, texts: { layer: TextLayer; span: Span }[]): string | null {
    const showCaptions = !!captions && cues.length > 0;
    if (!showCaptions && texts.length === 0) return null;
    const styles: string[] = [];
    const events: string[] = [];
    if (showCaptions) {
        styles.push(styleLine('Captions', captions, captions.position, 70));
        for (const c of cues) events.push(`Dialogue: 0,${assTime(c.startMs)},${assTime(c.endMs)},Captions,,0,0,0,,${c.lines.map(assText).join('\\N')}`);
    }
    texts.forEach((t, i) => {
        styles.push(styleLine(`Text${i + 1}`, t.layer, 'bottom', 80));
        events.push(...textEvents(t.layer, t.span, `Text${i + 1}`));
    });
    return [
        '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${FRAME.width}`, `PlayResY: ${FRAME.height}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
        '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
        ...styles, '',
        '[Events]',
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
        ...events, '',
    ].join('\n');
}

// ─── the media bin ───────────────────────────────────────────────────────────

// What the episode's media bin lists (lib/server/mediaBin.ts): its uploads and the files it already has.
export const BIN_KINDS = ['image', 'video', 'audio'] as const;
export type BinKind = typeof BIN_KINDS[number];
export type BinSource = 'upload' | 'broll' | 'teaser' | 'intro' | 'logo' | 'library' | 'studio';
export interface BinItem {
    id: string;
    kind: BinKind;
    source: BinSource;
    path: string;                 // Cloud Storage (the Studio's own sounds: public/, lib/audio.ts STUDIO_SOUNDS)
    name: string;
    url?: string | null;          // a short-lived link for the browser
    durationMs?: number | null;   // video and audio
    width?: number | null;
    height?: number | null;
    // A b-roll still's place in the notes plan, so adding it puts it where the plan did.
    startMs?: number;
    seconds?: number;
    index?: number;
    // Sounds (item E7): a show library file's kind and licence state (only a checked one can be placed),
    // or, for an episode's own upload, who said it is theirs to use and when.
    sound?: { kind: 'music' | 'effect'; checked: boolean; credit: string; licence: string };
    rights?: { name: string; on: string } | null;
}

const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

// A copy of a layer or a sound, pasted at the playhead (item E8): a new id, and the original's kind of anchor,
// on the moment of the recording at the playhead (`srcMs`) or at its time in the edited video (`atMs`).
export function pasteAt<T extends { id: string; anchor: Anchor | GraphicAnchor }>(item: T, srcMs: number, atMs: number): T {
    return {
        ...structuredClone(item),
        id: newId(item.id.charAt(0) || 'p'),
        // A programme-anchored graphic (fromEnd) pastes where it lives: at the end.
        anchor: 'fromEnd' in item.anchor ? item.anchor
            : 'atMs' in item.anchor ? { atMs: Math.max(0, Math.round(atMs)) } : { srcMs: Math.max(0, Math.round(srcMs)) },
    };
}

// A layer for a bin item, starting at `srcMs` of the recording: b-roll as the notes plan has it; the logo
// small in the top right for the whole episode's first minute; an uploaded picture a fifth of the width
// in the top right; video across the whole frame for its own length (at most a minute), silent.
export function layerFromBin(item: BinItem, srcMs: number): PictureLayer | null {
    if (item.kind === 'audio') return null;   // music and effects come with E7
    const anchor = { srcMs: Math.max(0, Math.round(srcMs)) };
    if (item.source === 'broll') {
        return { ...brollLayer({ index: item.index ?? 0, startMs: srcMs, durationSeconds: item.seconds ?? 6, path: item.path, idea: item.name }), id: newId('b') };
    }
    if (item.kind === 'video') {
        const durationMs = Math.max(LAYER_MIN_MS, Math.min(item.durationMs ?? 10_000, 60_000));
        return {
            id: newId('v'), kind: 'video', track: TRACK.pictures, anchor, durationMs, place: { x: 0, y: 0, align: 7 }, opacity: 1,
            in: FADE(300), out: FADE(300), media: { path: item.path, name: item.name }, w: 1, trimInMs: 0, volumeDb: null,
        };
    }
    const logo = item.source === 'logo';
    return {
        id: newId('i'), kind: 'image', track: TRACK.pictures, anchor, durationMs: logo ? 60_000 : 5_000,
        place: placeOf('top-right', 60, 60), opacity: logo ? 0.9 : 1, in: FADE(300), out: FADE(300),
        media: { path: item.path, name: item.name }, w: logo ? 0.12 : 0.2, motion: 'none',
    };
}

// ─── elements (item E6) ─────────────────────────────────────────────────────

// The Studio's look for elements (Studio settings, spec 018): the captions' font, the brand's background
// colour for bands and its accent for what stands out, and the hosts, whose lower thirds say "Host".
export interface Brand {
    font: FontName;
    colors: { background: string; backgroundBottom: string; accent: string };
    hosts: string[];
}

// A logo bug lasts the whole episode, however long the edit becomes: the longest a layer can be, which
// layerSpan cuts at the episode's end.
export const WHOLE_EPISODE_MS = 24 * 3600_000;
export const isWhole = (l: { durationMs: number }) => l.durationMs >= WHOLE_EPISODE_MS;

// A title card: centred, in the accent colour on a band of the brand's background, with a white second line.
export function titleCard(srcMs: number, brand: Brand): TextLayer {
    return {
        id: newId('t'), kind: 'text', element: 'title', track: TRACK.text, anchor: { srcMs: Math.max(0, Math.round(srcMs)) },
        durationMs: 4000, place: { x: 0.5, y: 0.5, align: 5 }, opacity: 1, in: FADE(500), out: FADE(500),
        text: 'Your title', subtext: '', font: brand.font, size: 'huge', color: brand.colors.accent, background: 'box',
        band: brand.colors.background, subColor: '#ffffff',
    };
}

// A lower third: a name in white and a role in the accent colour, on a band of the brand's background in
// the lower left, sliding in and fading out.
export function lowerThird(srcMs: number, name: string, role: string, brand: Brand): TextLayer {
    return {
        id: newId('l'), kind: 'text', element: 'lowerThird', track: TRACK.text, anchor: { srcMs: Math.max(0, Math.round(srcMs)) },
        durationMs: 5000, place: placeOf('bottom-left', 90, 120), opacity: 1,
        in: { transition: 'slideRight', durationMs: 500 }, out: FADE(400),
        text: name.slice(0, 200) || 'Name', subtext: role.slice(0, 200), font: brand.font, size: 'medium', color: '#ffffff', background: 'box',
        band: brand.colors.background, subColor: brand.colors.accent,
    };
}

// "Add for every speaker": a lower third the first time each speaker talks, from the transcript's names.
// Speakers that already have a text layer with their name are left out, so pressing it twice adds nothing.
export function lowerThirds(words: { speaker: string; start: number }[], layers: Layer[], brand: Brand): TextLayer[] {
    const have = new Set(layers.flatMap(l => (l.kind === 'text' ? [l.text.trim().toLowerCase()] : [])));
    const hosts = new Set(brand.hosts.map(h => h.trim().toLowerCase()));
    const first = new Map<string, number>();
    for (const w of words) if (w.speaker && !first.has(w.speaker)) first.set(w.speaker, w.start);
    return [...first].filter(([speaker]) => !have.has(speaker.trim().toLowerCase()))
        .map(([speaker, start], i) => ({ ...lowerThird(start, speaker, hosts.has(speaker.trim().toLowerCase()) ? 'Host' : '', brand), id: newId(`l${i}`) }));
}

// The motion graphics as elements (spec 021, lib/graphics.ts): each branded template, drawn by the render
// and played by the preview, added at the playhead in the Elements panel or placed automatically when the
// edit is first set up (M2). What is common to all of them:
const graphicBase = (template: GraphicTemplate, anchor: GraphicAnchor) => ({
    id: newId('m'), kind: 'graphic' as const, template, track: TRACK.text, anchor,
    durationMs: GRAPHIC_TEMPLATES[template].durationMs, opacity: 1,
    in: { transition: 'none', durationMs: 0 } as const, out: { transition: 'none', durationMs: 0 } as const,
});
const at = (srcMs: number) => ({ srcMs: Math.max(0, Math.round(srcMs)) });
const f = (s: string) => s.trim().slice(0, 200);

// A lower third: hosts get the compact variant, labelled HOST, as the design has them.
export function motionLowerThird(srcMs: number, name: string, host: boolean): GraphicLayer {
    return {
        ...graphicBase('lowerThird', at(srcMs)), template: 'lowerThird',
        fields: { name: f(name) || 'Name', descriptor: host ? 'HOST' : '', variant: host ? 'host' : 'guest' },
    };
}

// The title card: the star blooms, the title in Cinzel, "with [Guest]"; at the episode's start. `show`
// is the eyebrow line (the Studio settings' show name).
export function motionTitleCard(title: string, guest: string, show = ''): GraphicLayer {
    return { ...graphicBase('titleCard', { atMs: 0 }), template: 'titleCard', fields: { title: f(title) || 'The episode', guest: f(guest), show: f(show) } };
}

// A chapter divider: the numeral, "CHAPTER TWO", the title.
export function motionChapter(srcMs: number, number: number, title: string): GraphicLayer {
    return { ...graphicBase('chapter', at(srcMs)), template: 'chapter', fields: { number: String(Math.max(1, Math.round(number))), title: f(title) } };
}

// The logo bug: pinned at the episode's start for the whole episode, on the logo's own track; its short
// clip is drawn once and looped (lib/graphics.ts drawnMs).
export function motionLogoBug(): GraphicLayer {
    return { ...graphicBase('logoBug', { atMs: 0 }), template: 'logoBug', track: TRACK.logo, durationMs: WHOLE_EPISODE_MS, fields: {} };
}

// The end screen: the programme's last 20 s (over the outro, or the episode when there is none), with
// spaces for YouTube's video elements and subscribe button.
export function motionEndScreen(): GraphicLayer {
    const durationMs = GRAPHIC_TEMPLATES.endScreen.durationMs;
    return { ...graphicBase('endScreen', { fromEnd: durationMs }), template: 'endScreen', fields: {} };
}

// A full-screen pull quote, line by line.
export function motionPullQuote(srcMs: number, quote: string, speaker: string): GraphicLayer {
    return { ...graphicBase('pullQuote', at(srcMs)), template: 'pullQuote', fields: { quote: f(quote) || 'The quote', speaker: f(speaker) } };
}

// A key idea side card: the term and its one-line definition.
export function motionKeyIdea(srcMs: number, term: string, definition: string): GraphicLayer {
    return { ...graphicBase('keyIdea', at(srcMs)), template: 'keyIdea', fields: { term: f(term) || 'The idea', definition: f(definition) } };
}

// The logo sting: a short logo reveal, wherever it is placed (the spec offers the outro's start).
export function motionLogoSting(srcMs: number): GraphicLayer {
    return { ...graphicBase('logoSting', at(srcMs)), template: 'logoSting', fields: {} };
}

// A highlight at a moment of the recording (spec 021 Part B): 4 s by default, trimmed and nudged to word
// boundaries in Properties; M4's picker makes these with `suggested: true`.
export function highlight(srcMs: number, layout: HighlightLayer['layout'], words: string, emphasis: string, speaker: string, durationMs = 4000): HighlightLayer {
    return {
        id: newId('h'), kind: 'highlight', layout, anchor: at(srcMs),
        durationMs: Math.max(HIGHLIGHT_MIN_MS, Math.min(HIGHLIGHT_MAX_MS, Math.round(durationMs))),
        words: words.trim().slice(0, 500) || 'The words', emphasis: emphasis.trim().slice(0, 80), speaker: speaker.trim().slice(0, 200),
    };
}

// The motion graphics an edit is first set up with (spec 021 M2; Tom's D2: on for every new episode):
// the title banner from the approved notes' chosen title and the first speaker who is not a host, a motion
// lower third where each speaker first talks (hosts compact), a chapter banner at each approved chapter
// after the first, the logo bug only when the Studio settings ask for it (`logoBug`, off by default), and
// the end screen over the programme's last 20 s. The title banner and the lower thirds share the bottom
// third, so a lower third due while the banner is up waits until just after it. Only for an episode with
// no saved edit, like the teasers and b-roll (lib/programme.ts firstEdit, lib/layers.ts withLayers).
export function motionGraphics(o: {
    title: string;
    show: string;
    words: { speaker: string; start: number }[];
    chapters: { title: string; startMs: number }[];
    hosts: string[];
    logoBug?: boolean;
}): GraphicLayer[] {
    const hosts = new Set(o.hosts.map(h => h.trim().toLowerCase()));
    const first = new Map<string, number>();
    for (const w of o.words) if (w.speaker && !first.has(w.speaker)) first.set(w.speaker, w.start);
    const guest = [...first.keys()].find(s => !hosts.has(s.trim().toLowerCase())) ?? '';
    const card = motionTitleCard(o.title, guest, o.show);
    // Lower thirds anchor on the recording's clock and the banner on the edit's, so the gap is kept on
    // the recording's: cuts in the first seconds can only bring a third earlier by what they remove.
    // Lower thirds sit in one place too, so one that would cover the one before waits for it to go.
    let free = card.durationMs + TITLE_GAP_MS;
    const thirds = [...first].map(([speaker, start]) => {
        const third = motionLowerThird(Math.max(start, free), speaker, hosts.has(speaker.trim().toLowerCase()));
        free = (third.anchor as { srcMs: number }).srcMs + third.durationMs + THIRD_GAP_MS;
        return third;
    });
    return [
        card,
        ...thirds,
        ...o.chapters.slice(1).map((c, i) => motionChapter(c.startMs, i + 2, c.title)),
        ...(o.logoBug ? [motionLogoBug()] : []),
        motionEndScreen(),
    ];
}
const TITLE_GAP_MS = 1500, THIRD_GAP_MS = 500;

// The logo bug: the Studio's logo small in the top right, a little see-through, for the whole episode
// (pinned at its start, so it never moves with cuts).
export function logoBug(logo: { path: string; name: string }): ImageLayer {
    return {
        id: newId('g'), kind: 'image', element: 'logo', track: TRACK.logo, anchor: { atMs: 0 }, durationMs: WHOLE_EPISODE_MS,
        place: placeOf('top-right', 60, 60), opacity: 0.8, in: FADE(500), out: FADE(500),
        media: { path: logo.path, name: logo.name || 'Logo' }, w: 0.08, motion: 'none',
    };
}

// An edit as the Studio editor works on it: with layers, the notes plan's b-roll among them (spec 020 item E5). Used by
// the editor when it opens and by "Build for Studio editor" (lib/server/buildEdit.ts), so both set up the same layers.
export function withLayers<E extends { layers?: Layer[]; overlays?: Overlay[] }>(edit: E, bin: BinItem[]): E {
    if (edit.layers) return edit;
    const layers = layersOf(edit);
    const have = new Set(layers.flatMap(l => (isPicture(l) ? [l.media.path] : [])));
    for (const b of bin) {
        if (b.source !== 'broll' || have.has(b.path) || b.startMs === undefined) continue;
        layers.push(brollLayer({ index: b.index ?? 0, startMs: b.startMs, durationSeconds: b.seconds ?? 6, path: b.path, idea: b.name }));
    }
    return { ...edit, layers, overlays: [] };
}
