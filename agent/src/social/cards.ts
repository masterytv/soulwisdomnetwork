// Draws the social cards (lib/social/cards.ts) in headless Chromium and saves them as JPEG, 1080 × 1350
// (docs/specs/026-social-publishing.md). The fonts, the logo and the pictures are served from local files over an
// intercepted origin, as the motion graphics are (agent/src/podcast/graphics/render.ts), so nothing is fetched from
// the network. GitHub Actions installs Chromium (npx playwright install --with-deps chromium); CHROMIUM_BIN can point
// at another build.

import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Browser } from 'playwright';
import { CARD_HEIGHT, CARD_WIDTH, type CardAssets } from '../../../lib/social/cards';

const ORIGIN = 'https://card.local';
const ROOT = path.resolve(__dirname, '../../..');
const FONTS = path.join(ROOT, 'agent/assets/fonts');

export const ASSETS: CardAssets = {
    logoUrl: `${ORIGIN}/brand/logo-trimmed.png`,
    outfitUrl: `${ORIGIN}/fonts/Outfit-SemiBold.ttf`,
    outfitBlackUrl: `${ORIGIN}/fonts/Outfit-Black.ttf`,
    cinzelUrl: `${ORIGIN}/fonts/Cinzel-latin.woff2`,
};

const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

// A picture on disk as a URL the card can use.
export const pictureUrl = (file: string) => `${ORIGIN}/picture/${encodeURIComponent(path.resolve(file))}`;

function fileFor(pathname: string): string | null {
    if (pathname.startsWith('/fonts/')) return path.join(FONTS, path.basename(pathname));
    if (pathname.startsWith('/brand/')) return path.join(ROOT, 'public', path.basename(pathname));
    if (pathname.startsWith('/picture/')) return decodeURIComponent(pathname.slice('/picture/'.length));
    return null;
}

let browser: Browser | null = null;

// One card's HTML as a JPEG.
export async function drawCard(html: string, output: string): Promise<void> {
    browser ??= await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || undefined });
    const page = await browser.newPage({ viewport: { width: CARD_WIDTH, height: CARD_HEIGHT }, deviceScaleFactor: 1 });
    try {
        await page.route(`${ORIGIN}/**`, route => {
            const file = fileFor(new URL(route.request().url()).pathname);
            if (!file || !fs.existsSync(file)) return route.fulfill({ status: 404 });
            return route.fulfill({ contentType: TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', body: fs.readFileSync(file) });
        });
        await page.route(url => !url.toString().startsWith(ORIGIN), route => route.abort());
        await page.setContent(html, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready.then(() => null));
        await page.screenshot({ path: output, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT } });
    } finally {
        await page.close();
    }
}

export async function closeCards() {
    await browser?.close();
    browser = null;
}
