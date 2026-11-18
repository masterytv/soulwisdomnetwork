// The "Soul Wisdom Clips" thumbnail (docs/specs/025-clips.md, step 4), drawn on a 1280x720 canvas in the browser so a
// title edit or another moment shows at once; what is drawn is exactly what is saved and uploaded. The speaker, cut out
// of the chosen moment, stands on the bottom edge on the side that has them facing the title, with a gold rim light;
// the title fills the other side in Outfit Black, white with *marked* words in gold; the oval logo and "SOUL WISDOM
// CLIPS" sit at the top on the title's side. The background is the brand's violet, or the moment's own frame blurred
// and washed violet. YouTube puts its time stamp in the bottom-right corner, so nothing that matters goes there.

import { applyPalette, cover, fit, logo, palette, type Word } from "@/components/studio/thumbnailCanvas";
import { DEFAULT_SETTINGS, type StudioSettings } from "@/lib/studioSettings";
import { hookWords, THUMB_HEIGHT as H, THUMB_WIDTH as W } from "@/lib/thumbnail";
import type { ThumbBackground } from "@/lib/clips";

export const MARK_TEXT = "SOUL WISDOM CLIPS";
// YouTube's time stamp covers this corner of every thumbnail.
export const STAMP = { x: W - 230, y: H - 80 } as const;
const MARGIN = 64;
const MARK = { top: 44, logo: 72 } as const;

export interface Box { x: number; y: number; w: number; h: number }

// Where everything goes, from the cut-out's size and side; no cut-out means the title alone, centred.
export function clipThumbLayout(cutout: { width: number; height: number } | null, side: "left" | "right") {
    const titleTop = MARK.top + MARK.logo + 36;
    const titleBottom = STAMP.y - 16;            // the title's lowest line stays above the time stamp's corner
    if (!cutout) {
        return { speaker: null, title: { x: 100, y: titleTop, w: W - 200, h: titleBottom - titleTop }, align: "center" as const };
    }
    // As large as fits: up to 95% of the height and 55% of the width.
    const scale = Math.min((H * 0.95) / cutout.height, (W * 0.55) / cutout.width, 2.5);
    const w = Math.round(cutout.width * scale), h = Math.round(cutout.height * scale);
    const speaker: Box = { x: side === "right" ? W - w - 24 : 24, y: H - h, w, h };
    // The title takes the rest of the width, never under 40% of it (a wide cut-out may then sit behind its edge).
    const titleW = Math.max(W * 0.4, side === "right" ? speaker.x - MARGIN - 24 : W - (speaker.x + w) - MARGIN - 24);
    const titleX = side === "right" ? MARGIN : W - MARGIN - titleW;
    return { speaker, title: { x: titleX, y: titleTop, w: titleW, h: titleBottom - titleTop }, align: (side === "right" ? "left" : "right") as "left" | "right" };
}

export interface ClipThumbImages {
    frame: ImageBitmap | null;          // the moment's still (for the "From the clip" background)
    cutout: ImageBitmap | null;         // the speaker over transparency
    logo: ImageBitmap | null;
}

// A few hundred faint stars, the same every time.
function stars(ctx: CanvasRenderingContext2D) {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    ctx.save();
    for (let i = 0; i < 260; i++) {
        ctx.globalAlpha = 0.15 + rand() * 0.45;
        ctx.fillStyle = "#ffffff";
        const r = rand() < 0.9 ? 1 : 2;
        ctx.fillRect(Math.round(rand() * W), Math.round(rand() * H), r, r);
    }
    ctx.restore();
}

function background(ctx: CanvasRenderingContext2D, kind: ThumbBackground, frame: ImageBitmap | null) {
    const p = palette();
    ctx.fillStyle = p.ink;
    ctx.fillRect(0, 0, W, H);
    if (kind === "clip" && frame) {
        ctx.save();
        ctx.filter = "blur(18px) brightness(0.6)";
        cover(ctx, frame, -40, -40, W + 80, H + 80);
        ctx.restore();
        // Washed violet: the brand's colour laid over the frame's own light and dark, then darkened for the title.
        ctx.save();
        ctx.globalCompositeOperation = "color";
        ctx.fillStyle = p.glow[0];
        ctx.globalAlpha = 0.7;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        ctx.fillStyle = `rgba(${p.inkRgb}, 0.45)`;
        ctx.fillRect(0, 0, W, H);
        return;
    }
    const glow = ctx.createRadialGradient(W * 0.3, H * 0.4, 40, W * 0.45, H * 0.5, W * 0.85);
    glow.addColorStop(0, p.glow[0]);
    glow.addColorStop(0.55, p.glow[1]);
    glow.addColorStop(1, p.ink);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    stars(ctx);
    ctx.fillStyle = p.gold;
    ctx.fillRect(0, 0, W, 6);
    ctx.fillRect(0, H - 6, W, 6);
}

// One line of the title at `x` (its left edge), white with gold for marked words, outlined for small screens.
function line(ctx: CanvasRenderingContext2D, words: Word[], size: number, x: number, y: number) {
    const p = palette();
    const space = ctx.measureText(" ").width;
    let cx = x;
    for (const word of words) {
        ctx.save();
        ctx.shadowColor = "rgba(10, 0, 30, 0.85)";
        ctx.shadowBlur = size * 0.3;
        ctx.lineWidth = size * 0.1;
        ctx.lineJoin = "round";
        ctx.strokeStyle = p.ink;
        ctx.strokeText(word.text, cx, y);
        ctx.restore();
        ctx.fillStyle = word.gold ? p.gold : "#ffffff";
        ctx.fillText(word.text, cx, y);
        cx += ctx.measureText(word.text).width + space;
    }
}

const lineWidth = (ctx: CanvasRenderingContext2D, words: Word[]) =>
    words.reduce((t, w, i) => t + ctx.measureText(w.text).width + (i ? ctx.measureText(" ").width : 0), 0);

export function drawClipThumbnail(ctx: CanvasRenderingContext2D, o: {
    text: string; images: ClipThumbImages; family: string; background: ThumbBackground; side: "left" | "right";
    colors?: StudioSettings["colors"];
}) {
    applyPalette(o.colors ?? DEFAULT_SETTINGS.colors);
    const p = palette();
    ctx.clearRect(0, 0, W, H);
    background(ctx, o.background, o.images.frame);
    const layout = clipThumbLayout(o.images.cutout ? { width: o.images.cutout.width, height: o.images.cutout.height } : null, o.side);

    // The speaker: a dark shadow behind, then a gold rim of light, then the cut-out itself.
    if (layout.speaker && o.images.cutout) {
        const s = layout.speaker;
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
        ctx.shadowBlur = 60;
        ctx.drawImage(o.images.cutout, s.x, s.y, s.w, s.h);
        ctx.shadowColor = `rgba(${p.goldRgb}, 0.75)`;
        ctx.shadowBlur = 22;
        ctx.drawImage(o.images.cutout, s.x, s.y, s.w, s.h);
        ctx.restore();
        ctx.drawImage(o.images.cutout, s.x, s.y, s.w, s.h);
    }

    // The mark: the oval logo and the name, in gold capitals, lined up with the title.
    ctx.save();
    ctx.font = `800 26px ${o.family}`;
    ctx.letterSpacing = "4px";
    const markW = (o.images.logo ? MARK.logo + 16 : 0) + ctx.measureText(MARK_TEXT).width;
    const t0 = layout.title;
    const markX = layout.align === "left" ? t0.x : layout.align === "right" ? t0.x + t0.w - markW : (W - markW) / 2;
    logo(ctx, o.images.logo, markX, MARK.top, MARK.logo);
    ctx.fillStyle = p.gold;
    ctx.textBaseline = "middle";
    ctx.fillText(MARK_TEXT, markX + (o.images.logo ? MARK.logo + 16 : 0), MARK.top + MARK.logo / 2);
    ctx.restore();

    // The title, as large as fits its side in up to four lines, centred in its height.
    const words = hookWords(o.text);
    if (!words.length) return;
    const t = layout.title;
    const { size, lines } = fit(ctx, words, o.family, t.w, 4, layout.speaker ? 132 : 150, 44);
    const lineHeight = size * 1.02;
    const top = t.y + Math.max(0, (t.h - lines.length * lineHeight) / 2);
    ctx.font = `900 ${size}px ${o.family}`;
    ctx.textBaseline = "alphabetic";
    lines.forEach((l, i) => {
        const width = lineWidth(ctx, l);
        const x = layout.align === "center" ? t.x + (t.w - width) / 2 : layout.align === "right" ? t.x + t.w - width : t.x;
        line(ctx, l, size, x, top + size * 0.86 + i * lineHeight);
    });
}
