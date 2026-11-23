// The social cards' layouts (docs/specs/026-social-publishing.md): plain HTML pages, 1080 × 1350, drawn in headless
// Chromium by the social job (agent/src/social/cards.ts) and saved as JPEG (Instagram's API takes no other picture
// format). Every card carries the Soul Wisdom logo and one key phrase in the gold accent (Tom, 2026-11-23). Pure: the
// job and the tests share it; the fonts and pictures come in as URLs the renderer serves.

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
export const GOLD = '#f7c65b';
export const NIGHT = '#140a2e';
export const NIGHT_LOW = '#2a1552';
export const SITE = 'soulwisdomcollective.com';

export interface CardAssets {
    logoUrl: string;                // the Soul Wisdom logo (public/logo-trimmed.png)
    outfitUrl: string;              // Outfit SemiBold (agent/assets/fonts)
    outfitBlackUrl: string;         // Outfit Black
    cinzelUrl: string;              // Cinzel
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The text with its gold phrase marked: the first place it appears, matched exactly. A phrase not in the text is
// never drawn (the checks refuse it before this).
export function withGold(text: string, phrase: string): string {
    const at = phrase ? text.indexOf(phrase) : -1;
    if (at < 0) return escapeHtml(text);
    return `${escapeHtml(text.slice(0, at))}<span class="gold">${escapeHtml(phrase)}</span>${escapeHtml(text.slice(at + phrase.length))}`;
}

// Large enough to read on a phone, small enough to fit: by the quote's length.
export function quoteSize(chars: number): number {
    if (chars <= 70) return 74;
    if (chars <= 110) return 64;
    if (chars <= 160) return 56;
    return 48;
}

function base(assets: CardAssets, body: string, css: string): string {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Outfit'; font-weight: 600; src: url('${assets.outfitUrl}'); }
@font-face { font-family: 'Outfit'; font-weight: 900; src: url('${assets.outfitBlackUrl}'); }
@font-face { font-family: 'Cinzel'; src: url('${assets.cinzelUrl}'); }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${CARD_WIDTH}px; height: ${CARD_HEIGHT}px; overflow: hidden; background: ${NIGHT}; }
body { position: relative; font-family: 'Outfit', sans-serif; color: #fff; -webkit-font-smoothing: antialiased; }
.gold { color: ${GOLD}; }
.logo { position: absolute; top: 48px; left: 52px; width: 190px; filter: drop-shadow(0 4px 14px rgba(0,0,0,.55)); }
.site { position: absolute; bottom: 44px; left: 0; right: 0; text-align: center; font-family: 'Cinzel', serif; font-size: 26px; letter-spacing: 4px; color: rgba(255,255,255,.72); }
${css}
</style></head><body>${body}<img class="logo" src="${assets.logoUrl}" alt=""></body></html>`;
}

export interface QuoteCard {
    pictureUrl: string;             // the speaker's frame, already cropped to 4:5
    quote: string;                  // the speaker's own words, copied exactly
    gold: string;                   // the key phrase, copied exactly from the quote
    speaker: string;
    show: string;
}

// The image post: the speaker's frame filling the card, darkened below, their words over it with one phrase in gold,
// their name, the logo top left and the site at the foot.
export function quoteCardHtml(card: QuoteCard, assets: CardAssets): string {
    const size = quoteSize(card.quote.length);
    const css = `
.photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.shade { position: absolute; inset: 0; background:
    linear-gradient(180deg, rgba(20,10,46,.55) 0%, rgba(20,10,46,0) 22%, rgba(20,10,46,0) 34%, rgba(20,10,46,.78) 56%, rgba(20,10,46,.96) 76%, ${NIGHT} 100%); }
.words { position: absolute; left: 84px; right: 84px; bottom: 132px; }
.mark { font-family: 'Cinzel', serif; font-size: 150px; line-height: 1; color: ${GOLD}; height: 70px; margin-bottom: 6px; }
.quote { font-weight: 600; font-size: ${size}px; line-height: 1.18; letter-spacing: -.3px; text-shadow: 0 2px 18px rgba(0,0,0,.45); }
.who { margin-top: 34px; font-family: 'Cinzel', serif; font-size: 34px; letter-spacing: 2px; color: ${GOLD}; }
.who small { display: block; margin-top: 6px; font-size: 24px; letter-spacing: 3px; color: rgba(255,255,255,.7); }
`;
    const body = `<img class="photo" src="${card.pictureUrl}" alt=""><div class="shade"></div>
<div class="words"><div class="mark">“</div><p class="quote">${withGold(card.quote, card.gold)}</p>
<p class="who">${escapeHtml(card.speaker)}<small>${escapeHtml(card.show)}</small></p></div>
<p class="site">${SITE}</p>`;
    return base(assets, body, css);
}

// The 4:5 crop of a frame around the speaker: as tall as the frame, centred on them (0 to 1 of the frame's width),
// kept inside the frame. Whole pixels, even, for ffmpeg.
export function cropAround(frameWidth: number, frameHeight: number, centre: number): { x: number; y: number; width: number; height: number } {
    const even = (n: number) => Math.floor(n / 2) * 2;
    const height = even(Math.min(frameHeight, frameWidth * 5 / 4));
    const width = even(height * 4 / 5);
    const c = Number.isFinite(centre) ? Math.min(1, Math.max(0, centre)) : 0.5;
    const x = even(Math.min(frameWidth - width, Math.max(0, c * frameWidth - width / 2)));
    return { x, y: even((frameHeight - height) / 2), width, height };
}
