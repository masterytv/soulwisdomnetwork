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
    pictureUrl: string | null;      // the speaker's frame cropped to 4:5, or a b-roll picture; null: the brand background
    quote: string;                  // the speaker's own words, copied exactly
    gold: string;                   // the key phrase, copied exactly from the quote
    speaker: string;
    show: string;
}

// The image post: the picture (the speaker's frame, or the episode's b-roll) filling the card, darkened below, the words
// over it with one phrase in gold, the speaker's name, the logo top left and the site at the foot. With no picture, the
// brand's night gradient and a soft gold glow, the words higher up.
export function quoteCardHtml(card: QuoteCard, assets: CardAssets): string {
    const size = quoteSize(card.quote.length);
    const css = `
.photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.shade { position: absolute; inset: 0; background:
    linear-gradient(180deg, rgba(20,10,46,.55) 0%, rgba(20,10,46,0) 22%, rgba(20,10,46,0) 34%, rgba(20,10,46,.78) 56%, rgba(20,10,46,.96) 76%, ${NIGHT} 100%); }
.words { position: absolute; left: 84px; right: 84px; bottom: ${card.pictureUrl ? 132 : 260}px; }
.plain { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 45% at 50% 30%, rgba(247,198,91,.16), rgba(247,198,91,0) 70%), linear-gradient(180deg, ${NIGHT_LOW} 0%, ${NIGHT} 70%); }
.mark { font-family: 'Cinzel', serif; font-size: 150px; line-height: 1; color: ${GOLD}; height: 70px; margin-bottom: 6px; }
.quote { font-weight: 600; font-size: ${size}px; line-height: 1.18; letter-spacing: -.3px; text-shadow: 0 2px 18px rgba(0,0,0,.45); }
.who { margin-top: 34px; font-family: 'Cinzel', serif; font-size: 34px; letter-spacing: 2px; color: ${GOLD}; }
.who small { display: block; margin-top: 6px; font-size: 24px; letter-spacing: 3px; color: rgba(255,255,255,.7); }
`;
    const picture = card.pictureUrl ? `<img class="photo" src="${card.pictureUrl}" alt=""><div class="shade"></div>` : '<div class="plain"></div>';
    const body = `${picture}
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

// Large enough for a phone, by the line's length (5 to 15 words).
export function lineSize(chars: number): number {
    if (chars <= 45) return 76;
    if (chars <= 75) return 68;
    return 60;
}

export interface StorySlide {
    pictureUrl: string | null;      // a frame of the Short's moment, or the episode's b-roll; null: the brand background
    line: string;                   // 5 to 15 words, retelling the moment
    gold: string;                   // the key phrase, copied exactly from the line
    index: number;                  // 1-based, of `total` (the end slide included)
    total: number;
    speaker?: string;               // named on the first slide only
    question?: boolean;             // an idea carousel's closing question for the reader: centred on the plain background
}

// A story carousel's slide: the picture filling it, darkened below, the line over it with one phrase in gold, the logo
// top left and where it is in the story top right ("2 / 7").
export function storySlideHtml(slide: StorySlide, assets: CardAssets): string {
    const size = lineSize(slide.line.length);
    const css = `
.photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.shade { position: absolute; inset: 0; background:
    linear-gradient(180deg, rgba(20,10,46,.5) 0%, rgba(20,10,46,0) 20%, rgba(20,10,46,0) 45%, rgba(20,10,46,.85) 68%, ${NIGHT} 100%); }
.plain { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 45% at 50% 30%, rgba(247,198,91,.16), rgba(247,198,91,0) 70%), linear-gradient(180deg, ${NIGHT_LOW} 0%, ${NIGHT} 70%); }
.logo { width: 150px; }
.count { position: absolute; top: 62px; right: 60px; font-family: 'Cinzel', serif; font-size: 28px; letter-spacing: 3px; color: rgba(255,255,255,.85); text-shadow: 0 2px 10px rgba(0,0,0,.6); }
.words { position: absolute; left: 80px; right: 80px; bottom: 140px; }
.who { font-family: 'Cinzel', serif; font-size: 30px; letter-spacing: 3px; color: ${GOLD}; margin-bottom: 22px; }
.line { font-weight: 600; font-size: ${size}px; line-height: 1.16; letter-spacing: -.3px; text-shadow: 0 2px 18px rgba(0,0,0,.45); }
.swipe { position: absolute; bottom: 52px; right: 64px; font-size: 26px; color: rgba(255,255,255,.7); letter-spacing: 1px; }
.ask { position: absolute; left: 100px; right: 100px; top: 50%; transform: translateY(-50%); text-align: center; }
.ask .over { font-family: 'Cinzel', serif; font-size: 30px; letter-spacing: 4px; color: ${GOLD}; margin-bottom: 36px; }
.ask .line { font-size: ${size + 6}px; line-height: 1.2; }
`;
    const picture = slide.pictureUrl ? `<img class="photo" src="${slide.pictureUrl}" alt=""><div class="shade"></div>` : '<div class="plain"></div>';
    const who = slide.index === 1 && slide.speaker ? `<p class="who">${escapeHtml(slide.speaker)}</p>` : '';
    const words = slide.question
        ? `<div class="ask"><p class="over">For you</p><p class="line">${withGold(slide.line, slide.gold)}</p></div>`
        : `<div class="words">${who}<p class="line">${withGold(slide.line, slide.gold)}</p></div>`;
    const body = `${slide.question ? '<div class="plain"></div>' : picture}<p class="count">${slide.index} / ${slide.total}</p>
${words}
${slide.index < slide.total ? '<p class="swipe">Swipe →</p>' : ''}`;
    return base(assets, body, css);
}

// The carousel's last slide, always (Tom, 2026-11-23): where to hear the whole conversation. The logo large on the
// brand's night, the speaker named, the site in gold.
export function endSlideHtml(o: { speaker: string; show: string; index: number }, assets: CardAssets): string {
    const css = `
.plain { position: absolute; inset: 0; background: radial-gradient(ellipse 75% 50% at 50% 34%, rgba(247,198,91,.2), rgba(247,198,91,0) 70%), linear-gradient(180deg, ${NIGHT_LOW} 0%, ${NIGHT} 75%); }
.logo { top: 170px; left: 50%; width: 460px; transform: translateX(-50%); }
.count { position: absolute; top: 62px; right: 60px; font-family: 'Cinzel', serif; font-size: 28px; letter-spacing: 3px; color: rgba(255,255,255,.7); }
.end { position: absolute; left: 90px; right: 90px; top: 720px; text-align: center; }
.end h2 { font-weight: 600; font-size: 62px; line-height: 1.15; }
.end .url { margin-top: 44px; font-family: 'Cinzel', serif; font-size: 46px; letter-spacing: 2px; color: ${GOLD}; }
.end .note { margin-top: 18px; font-size: 28px; color: rgba(255,255,255,.7); }
`;
    const body = `<div class="plain"></div><p class="count">${o.index} / ${o.index}</p>
<div class="end"><h2>Hear the whole conversation with <span class="gold">${escapeHtml(o.speaker)}</span></h2>
<p class="url">${SITE}</p><p class="note">Link in the caption</p></div>`;
    return base(assets, body, css);
}
