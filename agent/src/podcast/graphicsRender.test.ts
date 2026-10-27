// The graphics renderer (docs/specs/021-motion-graphics.md, item M1): a template clip has alpha, the
// planned frames and the right size; a template draws the same frame for the same ms, in any order
// (the contract every template must keep); and the clip overlays through the render's own pictureFilter
// with the picture showing through around it. Needs Chromium (npx playwright install chromium, or
// CHROMIUM_BIN) and ffmpeg, as the checks workflow installs.
// Run: npx tsx --test agent/src/podcast/graphicsRender.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GRAPHIC_TEMPLATE_IDS, highlightTemplate, type GraphicSpec } from '../../../lib/graphics';
import { pictureFilter } from '../../../lib/layers';
import { asVideoLayer, clampBox, graphicBounds, placedRect } from '../../../lib/graphics';
import { motionKeyIdea, motionLowerThird } from '../../../lib/layers';
import { HIGHLIGHT_KEYFRAMES, HIGHLIGHT_LAYOUTS, LayoutKeyframesSchema } from '../../../lib/reframe';
import { graphicClipName, graphicFrames, openTemplate, renderGraphic, seekTo } from './graphics/render';

const COLORS = { background: '#140a2e', backgroundBottom: '#2a1552', accent: '#f7c65b' };
const spec = (over: Partial<GraphicSpec> = {}): GraphicSpec => ({
    template: 'lowerThird', fields: { name: 'Maria Santos', descriptor: 'Author · Researcher', variant: 'guest' },
    colors: COLORS, durationMs: 2000, width: 1920, height: 1080, ...over,
});

function run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(args[0], args.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { err += d; });
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve(out) : reject(new Error(`${args[0]} exited ${code}: ${err.slice(-500)}`)));
    });
}
const probe = (file: string, entries: string) =>
    run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', `stream=${entries}`, '-of', 'csv=p=0', file]);

test('graphicClipName: the same spec names the same clip; a change renames it', () => {
    const a = graphicClipName(spec()), b = graphicClipName(spec());
    assert.equal(a, b);
    assert.match(a, /^lowerThird-[0-9a-f]{16}\.mov$/);
    assert.notEqual(graphicClipName(spec({ fields: { ...spec().fields, name: 'Someone Else' } })), a);
    assert.notEqual(graphicClipName(spec({ durationMs: 3000 })), a);
    assert.notEqual(graphicClipName(spec({ colors: { ...COLORS, accent: '#ffffff' } })), a);
});

test('a 2 s clip: ProRes 4444 with alpha, 60 frames, 1920 × 1080; too long is refused', { timeout: 120_000 }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphics-render-'));
    const out = path.join(dir, 'lt.mov');
    const made = await renderGraphic(spec(), out);
    assert.equal(made.frames, 60);
    assert.equal(graphicFrames(2000), 60);
    const [codec, w, h, pixFmt, frames] = (await probe(out, 'codec_name,width,height,pix_fmt,nb_frames')).trim().split(',');
    assert.equal(codec, 'prores');
    assert.match(pixFmt, /^yuva444p/);                       // 4444 keeps the alpha
    assert.deepEqual([w, h, frames], ['1920', '1080', '60']);

    // The clip over a red frame through the render's own pictureFilter (format=rgba keeps the alpha):
    // at the hold the band is inky where it sits and the red shows through everywhere else.
    const framePng = path.join(dir, 'over.png');
    const layer = asVideoLayer({ ...motionLowerThird(0, 'Maria Santos', false), id: 'm1', anchor: { atMs: 0 }, durationMs: 2000 }, 'episodes/abcdefghij/graphics/x.mov');
    const filter = `color=c=red:s=1920x1080:r=30:d=2[bg];${pictureFilter(0, 'bg', 'done', layer, { startMs: 0, endMs: 2000 })}`;
    await run(['ffmpeg', '-y', '-v', 'error', '-i', out, '-filter_complex', filter.replace(/;$/, ''), '-map', '[done]',
        '-ss', '1', '-frames:v', '1', framePng]);
    const px = await pixels(framePng);
    const band = px(150, 880), clear = px(1700, 300);
    assert.ok(band[0] < 80 && band[2] > 30, `the band should be night purple, got ${band}`);
    assert.ok(clear[0] > 200 && clear[1] < 60, `beside the band the red should show, got ${clear}`);

    await assert.rejects(renderGraphic(spec({ durationMs: 120_000 }), out), /at most/);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('a moved, smaller key idea: the same clip overlays at the box\'s corner and scale, where the preview shows it', { timeout: 120_000 }, async () => {
    // Tom's case: the card off the guest's face, to the left and at 75 %. Its clip is the one drawn for it
    // in place (the box is not in the spec), laid by the render's own pictureFilter over a red frame.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphics-box-'));
    const fields = { term: 'Soul', definition: 'The part of us that remembers.' };
    const out = path.join(dir, 'key.mov');
    await renderGraphic(spec({ template: 'keyIdea', fields, durationMs: 2000 }), out);
    const bounds = graphicBounds({ template: 'keyIdea', fields })!;
    const box = clampBox({ x: -780, y: 60, scale: 0.75 }, bounds);
    const card = placedRect(bounds, box);
    const layer = asVideoLayer({ ...motionKeyIdea(0, fields.term, fields.definition), id: 'k1', anchor: { atMs: 0 }, durationMs: 2000, box }, 'episodes/abcdefghij/graphics/k.mov');
    const framePng = path.join(dir, 'moved.png');
    const filter = `color=c=red:s=1920x1080:r=30:d=2[bg];${pictureFilter(0, 'bg', 'done', layer, { startMs: 0, endMs: 2000 })}`;
    await run(['ffmpeg', '-y', '-v', 'error', '-i', out, '-filter_complex', filter.replace(/;$/, ''), '-map', '[done]',
        '-ss', '1.5', '-frames:v', '1', framePng]);
    const px = await pixels(framePng);
    const inside = px(Math.round(card.x + card.w / 2), Math.round(card.y + card.h - 20));
    assert.ok(inside[0] < 90, `the card should be ink where the box puts it (${JSON.stringify(card)}), got ${inside}`);
    const designed = px(1800 - 40, 210 + 40), right = px(Math.round(card.x + card.w + 30), Math.round(card.y + card.h / 2));
    assert.ok(designed[0] > 200 && designed[1] < 60, `the design's own place is clear once moved, got ${designed}`);
    assert.ok(right[0] > 200 && right[1] < 60, `beside the smaller card the red shows, got ${right}`);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('every template seeks: the same ms draws the same frame, in any order', { timeout: 180_000 }, async () => {
    // Pixels, not PNG bytes: the GPU rasteriser wobbles mid-transform antialiasing by ±1 between
    // otherwise identical paints, which is noise, not state. The contract is that seeking back gives
    // the same frame within that wobble, while different moments move real pixels.
    const sharp = (await import('sharp')).default;
    const raw = (png: Buffer) => sharp(png).ensureAlpha().raw().toBuffer();
    for (const template of GRAPHIC_TEMPLATE_IDS) {
        const { browser, page } = await openTemplate(spec({ template }));
        try {
            const shot = async (ms: number) => {
                await seekTo(page, ms);
                return raw(await page.screenshot({ type: 'png', omitBackground: true }));
            };
            // Mid-enter against the quiet middle: moments every template draws differently (the logo
            // bug's only motion is its glint, which peaks at 17 % of the clip and rests by 45 %).
            const a = await shot(340);
            const mid = await shot(900);
            let moved = 0;
            for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - mid[i]) > 2) moved++;
            assert.ok(moved > 500, `${template}: 340 ms and 900 ms should differ (${moved} channel values moved)`);
            const b = await shot(340);
            let off = 0;
            for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 2) off++;
            assert.equal(off, 0, `${template}: seeking back to 340 ms must draw the same frame (${off} channel values differ by more than 2)`);
        } finally {
            await browser.close();
        }
    }
});

test('highlight templates (spec 021 M3): each declares the keyframes lib/reframe.ts holds, and its matte masks as planned', { timeout: 240_000 }, async () => {
    const sharp = (await import('sharp')).default;
    const alphaAt = async (png: Buffer, [x, y]: readonly [number, number]) => {
        const raw = await sharp(png).ensureAlpha().raw().toBuffer();
        return raw[(y * 1920 + x) * 4 + 3];
    };
    for (const layout of HIGHLIGHT_LAYOUTS) {
        const fields = { words: 'The soul remembers what the mind forgets', emphasis: 'remembers', speaker: 'Maria Santos' };
        const { browser, page } = await openTemplate(spec({ template: highlightTemplate(layout), fields, durationMs: 4000 }));
        try {
            // The template's declaration must be exactly the table the render's expressions and the
            // editor's preview read — one source for the move, pinned here.
            const declared = await page.evaluate('window.GRAPHIC_LAYOUT');
            assert.deepEqual(LayoutKeyframesSchema.parse(declared), HIGHLIGHT_KEYFRAMES[layout], `${layout}: GRAPHIC_LAYOUT drifted from lib/reframe.ts`);
        } finally {
            await browser.close();
        }
    }
    // The matte plane is the mask: `below` holds its rounded window (opaque inside, clear outside);
    // `iris` is fully closed at the hold and full-frame open at the start.
    for (const [layout, probes] of [
        ['below', { at: 2000, opaque: [960, 450], clear: [30, 30] }],
        ['iris', { at: 2000, clear: [960, 540], openAt0: [960, 540] }],
    ] as const) {
        const { browser, page } = await openTemplate({ ...spec({ template: highlightTemplate(layout), durationMs: 4000 }), mode: 'matte' });
        try {
            await seekTo(page, probes.at);
            const hold = await page.screenshot({ type: 'png', omitBackground: true });
            if ('opaque' in probes) assert.ok(await alphaAt(hold, probes.opaque) > 250, `${layout}: the matte window should be opaque at the hold`);
            assert.ok(await alphaAt(hold, probes.clear) < 5, `${layout}: outside the window the matte must be clear at the hold`);
            if ('openAt0' in probes) {
                await seekTo(page, 0);
                const start = await page.screenshot({ type: 'png', omitBackground: true });
                assert.ok(await alphaAt(start, probes.openAt0) > 250, `${layout}: the matte starts full-frame open`);
            }
        } finally {
            await browser.close();
        }
    }
});

// A PNG's pixels through ffmpeg, so the test needs no image library.
async function pixels(file: string): Promise<(x: number, y: number) => number[]> {
    const raw = await new Promise<Buffer>((resolve, reject) => {
        const child = spawn('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
        const chunks: Buffer[] = [];
        child.stdout.on('data', d => chunks.push(d));
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg exited ${code}`)));
    });
    return (x, y) => [raw[(y * 1920 + x) * 3], raw[(y * 1920 + x) * 3 + 1], raw[(y * 1920 + x) * 3 + 2]];
}
