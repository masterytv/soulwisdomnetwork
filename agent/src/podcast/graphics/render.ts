// The graphics renderer (docs/specs/021-motion-graphics.md, item M1): opens a template in headless
// Chromium with Playwright, injects window.GRAPHIC, waits for the local fonts, then for each frame at the
// render's 30 fps calls window.seek(ms) and takes a transparent screenshot, piped into ffmpeg as ProRes
// 4444 with alpha (a .mov the render overlays as a video layer; VP9 alpha would need an input flag, so it
// is never used). The template and its fonts are served from the repository over an intercepted origin —
// nothing touches the network. graphicClipName names a clip by everything that drew it (the template file,
// the runtime, fields, colours, length and size), so a clip kept in Storage is only drawn again when
// something changed. GitHub Actions installs Chromium (npx playwright install --with-deps chromium);
// elsewhere CHROMIUM_BIN can point at one already installed.

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { chromium } from 'playwright';
import { GRAPHIC_MAX_MS, type GraphicSpec } from '../../../../lib/graphics';
import { FPS } from '../renderWindows';
import { fontFile, runtimeJs, templateHtml } from './files';

// A made-up origin the page loads from; every request to it is answered from the repository.
const ORIGIN = 'http://graphics.internal';

// What names a clip in the cache (episodes/<id>/graphics/<name>): the same spec draws the same clip.
export function graphicClipName(spec: GraphicSpec): string {
    const text = [templateHtml(spec.template), runtimeJs(), JSON.stringify([spec.fields, spec.colors, spec.durationMs, spec.width, spec.height])].join('\u0000');
    return `${spec.template}-${createHash('sha256').update(text).digest('hex').slice(0, 16)}.mov`;
}

export const graphicFrames = (durationMs: number) => Math.max(1, Math.round(durationMs * FPS / 1000));

// Seeks the open template and waits for the compositor to commit the frame: transform and opacity
// animations run on Chromium's compositor thread, so a screenshot straight after seek() can capture
// the frame before it. Two animation frames see the commit through; the timeout covers a headless
// scheduler with no frame pending.
export async function seekTo(page: import('playwright').Page, ms: number): Promise<void> {
    // A string, not a function: tsx's transform decorates nested functions with helpers (__name)
    // that do not exist inside the page.
    await page.evaluate(`(function (m) {
        window.seek(m);
        return new Promise(function (resolve) {
            var done = false;
            function finish() { if (!done) { done = true; resolve(); } }
            requestAnimationFrame(function () { requestAnimationFrame(finish); });
            setTimeout(finish, 50);
        });
    })(${JSON.stringify(ms)})`);
}

// The template open in headless Chromium with GRAPHIC injected and the fonts loaded, ready to seek and
// screenshot. The caller must close the browser; the tests use it to check a template's contract.
// `logoFile`: the Studio's logo on disk for templates that draw it (GRAPHIC.logo); the repository's
// public/logo-trimmed.png when none is given.
export async function openTemplate(spec: GraphicSpec, logoFile?: string) {
    const logo = logoFile ?? path.join(process.cwd(), 'public/logo-trimmed.png');
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || undefined });
    try {
        const page = await browser.newPage({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: 1 });
        await page.route(`${ORIGIN}/**`, route => {
            const { pathname } = new URL(route.request().url());
            if (pathname === '/template.html') return route.fulfill({ contentType: 'text/html', body: templateHtml(spec.template) });
            if (pathname === '/runtime.js') return route.fulfill({ contentType: 'text/javascript', body: runtimeJs() });
            if (pathname === '/logo.png') return route.fulfill({ contentType: 'image/png', body: fs.readFileSync(logo) });
            const font = pathname.startsWith('/fonts/') ? fontFile(pathname.slice('/fonts/'.length)) : null;
            if (font) return route.fulfill({ contentType: 'font/woff2', body: font });
            return route.fulfill({ status: 404, body: '' });
        });
        await page.addInitScript(`window.GRAPHIC = ${JSON.stringify({
            fields: spec.fields, colors: spec.colors, durationMs: spec.durationMs, width: spec.width, height: spec.height, logo: 'logo.png',
        }).replace(/</g, '\\u003c')};`);
        await page.goto(`${ORIGIN}/template.html`);
        await page.waitForFunction('typeof window.seek === "function"');
        await page.evaluate(() => document.fonts.ready.then(() => null));
        return { browser, page };
    } catch (error) {
        await browser.close();
        throw error;
    }
}

export async function renderGraphic(spec: GraphicSpec, out: string, logoFile?: string): Promise<{ frames: number }> {
    if (spec.durationMs > GRAPHIC_MAX_MS) throw new Error(`A graphic can be at most ${GRAPHIC_MAX_MS / 1000} s, not ${Math.round(spec.durationMs / 1000)} s`);
    const frames = graphicFrames(spec.durationMs);
    const { browser, page } = await openTemplate(spec, logoFile);
    try {
        const ffmpeg = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
            '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
            '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-r', String(FPS), out,
        ], { stdio: ['pipe', 'ignore', 'pipe'] });
        let stderr = '';
        ffmpeg.stderr.on('data', d => { stderr += d; });
        const done = new Promise<void>((resolve, reject) => {
            ffmpeg.on('error', reject);
            ffmpeg.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`))));
        });
        // An ffmpeg that dies early would otherwise park the write loop on a drain that never comes.
        let failed: Error | null = null;
        ffmpeg.stdin.on('error', (e: Error) => { failed = e; });
        for (let i = 0; i < frames; i++) {
            await seekTo(page, i * 1000 / FPS);
            const png = await page.screenshot({ type: 'png', omitBackground: true });
            if (failed) break;
            if (!ffmpeg.stdin.write(png)) {
                await new Promise<void>(r => {
                    const done = () => { ffmpeg.stdin.off('drain', done); ffmpeg.stdin.off('close', done); r(); };
                    ffmpeg.stdin.once('drain', done);
                    ffmpeg.stdin.once('close', done);
                });
            }
        }
        ffmpeg.stdin.end();
        await done;
        return { frames };
    } finally {
        await browser.close();
    }
}

declare global {
    interface Window { seek: (ms: number) => void }
}
