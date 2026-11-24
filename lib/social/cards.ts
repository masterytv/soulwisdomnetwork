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

// The picture's box on a card with a picture (Tom, 2026-11-24, "option 2 for all images with quotes": a face was cut by
// the words laid over it): the top of the card, the words on the brand's night panel below, never over the picture.
export const PICTURE_HEIGHT = 790;
export const PICTURE_ASPECT = CARD_WIDTH / PICTURE_HEIGHT;

// The picture's box and the panel under it, with a short fade where they meet.
const SPLIT_CSS = `
.photo { position: absolute; left: 0; top: 0; width: ${CARD_WIDTH}px; height: ${PICTURE_HEIGHT}px; object-fit: cover; }
.top { position: absolute; left: 0; top: 0; width: ${CARD_WIDTH}px; height: 220px; background: linear-gradient(180deg, rgba(20,10,46,.5), rgba(20,10,46,0)); }
.panel { position: absolute; left: 0; right: 0; top: ${PICTURE_HEIGHT}px; bottom: 0; background: linear-gradient(180deg, ${NIGHT} 0%, ${NIGHT_LOW} 100%); }
.fade { position: absolute; left: 0; top: ${PICTURE_HEIGHT - 150}px; width: ${CARD_WIDTH}px; height: 150px; background: linear-gradient(180deg, rgba(20,10,46,0), ${NIGHT}); }
`;
const splitPicture = (url: string) => `<img class="photo" src="${url}" alt=""><div class="top"></div><div class="panel"></div><div class="fade"></div>`;

// Large enough to read on a phone, small enough to fit: by the quote's length.
export function quoteSize(chars: number): number {
    if (chars <= 70) return 74;
    if (chars <= 110) return 64;
    if (chars <= 160) return 56;
    return 48;
}

// The same for the panel under a picture, which has less room.
export function panelQuoteSize(chars: number): number {
    if (chars <= 70) return 64;
    if (chars <= 110) return 56;
    if (chars <= 160) return 50;
    return 44;
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

// The image post: the picture (the speaker's frame, or the episode's b-roll) in the top of the card, the words on the
// night panel below with one phrase in gold, the speaker's name, the logo top left and the site at the foot; the words
// never cover the picture (Tom, 2026-11-24). With no picture, the brand's night gradient and a soft gold glow.
export function quoteCardHtml(card: QuoteCard, assets: CardAssets): string {
    const size = card.pictureUrl ? panelQuoteSize(card.quote.length) : quoteSize(card.quote.length);
    const css = `${SPLIT_CSS}
.words { position: absolute; left: 84px; right: 84px; ${card.pictureUrl ? `top: ${PICTURE_HEIGHT - 20}px` : 'bottom: 260px'}; }
.plain { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 45% at 50% 30%, rgba(247,198,91,.16), rgba(247,198,91,0) 70%), linear-gradient(180deg, ${NIGHT_LOW} 0%, ${NIGHT} 70%); }
.mark { font-family: 'Cinzel', serif; font-size: 150px; line-height: 1; color: ${GOLD}; height: 70px; margin-bottom: 6px; }
.quote { font-weight: 600; font-size: ${size}px; line-height: 1.18; letter-spacing: -.3px; text-shadow: 0 2px 18px rgba(0,0,0,.45); }
.who { margin-top: ${card.pictureUrl ? 26 : 34}px; font-family: 'Cinzel', serif; font-size: ${card.pictureUrl ? 30 : 34}px; letter-spacing: 2px; color: ${GOLD}; }
.who small { display: block; margin-top: 6px; font-size: 24px; letter-spacing: 3px; color: rgba(255,255,255,.7); }
`;
    const picture = card.pictureUrl ? splitPicture(card.pictureUrl) : '<div class="plain"></div>';
    const body = `${picture}
<div class="words"><div class="mark">“</div><p class="quote">${withGold(card.quote, card.gold)}</p>
<p class="who">${escapeHtml(card.speaker)}<small>${escapeHtml(card.show)}</small></p></div>
<p class="site">${SITE}</p>`;
    return base(assets, body, css);
}

// The crop of a frame around the speaker for the picture's box (PICTURE_ASPECT, wider than tall): as tall as the frame,
// so the whole head and shoulders show, centred on them across (0 to 1 of the frame's width), kept inside the frame.
// Whole pixels, even, for ffmpeg.
export function cropAround(frameWidth: number, frameHeight: number, centre: number, aspect = PICTURE_ASPECT): { x: number; y: number; width: number; height: number } {
    const even = (n: number) => Math.floor(n / 2) * 2;
    const height = even(Math.min(frameHeight, frameWidth / aspect));
    const width = even(height * aspect);
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

// The same for the panel under a picture.
export function panelLineSize(chars: number): number {
    if (chars <= 45) return 70;
    if (chars <= 75) return 62;
    return 56;
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

// A carousel's slide: the picture in the top of the slide, the line on the night panel below with one phrase in gold,
// never over the picture (Tom, 2026-11-24); the logo top left and where it is in the story top right ("2 / 7").
export function storySlideHtml(slide: StorySlide, assets: CardAssets): string {
    const onPanel = !!slide.pictureUrl && !slide.question;
    const size = onPanel ? panelLineSize(slide.line.length) : lineSize(slide.line.length);
    const css = `${SPLIT_CSS}
.plain { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 45% at 50% 30%, rgba(247,198,91,.16), rgba(247,198,91,0) 70%), linear-gradient(180deg, ${NIGHT_LOW} 0%, ${NIGHT} 70%); }
.logo { width: 150px; }
.count { position: absolute; top: 62px; right: 60px; font-family: 'Cinzel', serif; font-size: 28px; letter-spacing: 3px; color: rgba(255,255,255,.85); text-shadow: 0 2px 10px rgba(0,0,0,.6); }
.words { position: absolute; left: 80px; right: 80px; ${onPanel ? `top: ${PICTURE_HEIGHT + 50}px` : 'bottom: 140px'}; }
.who { font-family: 'Cinzel', serif; font-size: 30px; letter-spacing: 3px; color: ${GOLD}; margin-bottom: 22px; }
.line { font-weight: 600; font-size: ${size}px; line-height: 1.16; letter-spacing: -.3px; text-shadow: 0 2px 18px rgba(0,0,0,.45); }
.swipe { position: absolute; bottom: 52px; right: 64px; font-size: 26px; color: rgba(255,255,255,.7); letter-spacing: 1px; }
.ask { position: absolute; left: 100px; right: 100px; top: 50%; transform: translateY(-50%); text-align: center; }
.ask .over { font-family: 'Cinzel', serif; font-size: 30px; letter-spacing: 4px; color: ${GOLD}; margin-bottom: 36px; }
.ask .line { font-size: ${size + 6}px; line-height: 1.2; }
`;
    const picture = slide.pictureUrl ? splitPicture(slide.pictureUrl) : '<div class="plain"></div>';
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
