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
import { GRAPHIC_TEMPLATE_IDS, type GraphicSpec } from '../../../lib/graphics';
import { pictureFilter } from '../../../lib/layers';
import { asVideoLayer } from '../../../lib/graphics';
import { motionLowerThird } from '../../../lib/layers';
import { graphicClipName, graphicFrames, openTemplate, renderGraphic } from './graphics/render';

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

test('every template seeks: the same ms draws the same frame, in any order', { timeout: 120_000 }, async () => {
    for (const template of GRAPHIC_TEMPLATE_IDS) {
        const { browser, page } = await openTemplate(spec({ template }));
        try {
            const shot = async (ms: number) => {
                await page.evaluate(m => window.seek(m), ms);
                return createHash('sha256').update(await page.screenshot({ type: 'png', omitBackground: true })).digest('hex');
            };
            const at900 = await shot(900);
            const at1700 = await shot(1700);
            assert.notEqual(at900, at1700, `${template}: 900 ms and 1700 ms should differ`);
            assert.equal(await shot(900), at900, `${template}: seeking back to 900 ms must draw the same frame`);
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
