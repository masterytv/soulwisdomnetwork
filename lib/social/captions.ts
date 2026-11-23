// Each post's words on each platform (docs/specs/026-social-publishing.md). Every caption credits the speaker and links
// the episode (Tom, 2026-11-23). Written from templates and the Short's own words, not by AI. Pure.

import { scrubDescription } from './limitedWords';

// Instagram's caption limit.
export const INSTAGRAM_CAPTION_MAX = 2200;
// A Facebook video title's limit.
export const FACEBOOK_TITLE_MAX = 255;
// A quote in a caption: long enough to carry the moment, short enough to read.
export const CAPTION_QUOTE_MAX = 600;

export const SHOW_HASHTAG = '#soulwisdom';

// At most `max` characters, cut at a line break near the end where there is one, never mid-word.
export function fit(text: string, max: number): string {
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const line = cut.lastIndexOf('\n');
    if (line > max * 0.6) return cut.slice(0, line).trimEnd();
    const space = cut.lastIndexOf(' ');
    return (space > 0 ? cut.slice(0, space) : cut).trimEnd();
}

const clean = (s: string) => s.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();

// A link to the website, tagged with where it was posted (utm_source the platform, utm_medium the kind of post), so
// the site's analytics show which post a visit came from. YouTube links stay as they are: YouTube drops the tags.
export function tagged(url: string, source: string, medium: string, campaign: string): string {
    let u: URL;
    try {
        u = new URL(url);
    } catch {
        return url;
    }
    if (/(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname)) return url;
    u.searchParams.set('utm_source', source);
    u.searchParams.set('utm_medium', medium);
    u.searchParams.set('utm_campaign', campaign);
    return u.toString();
}

// Up to three hashtags from the approved notes, then the show's own.
export function hashtags(fromNotes: string[]): string {
    const tags = fromNotes.map(h => (h.startsWith('#') ? h : `#${h}`).replace(/\s+/g, '')).filter(h => h.length > 1).slice(0, 3);
    return [...new Set([...tags, SHOW_HASHTAG])].join(' ');
}

// The speaker's credit: who said it, and where.
export const creditLine = (speaker: string, show: string) => `${clean(speaker) || 'Our guest'}, on ${clean(show) || 'Soul Wisdom'}`;

export function captionQuote(spoken: string): string {
    const text = clean(spoken);
    return text.length > CAPTION_QUOTE_MAX ? `${text.slice(0, CAPTION_QUOTE_MAX).replace(/\s+\S*$/, '')}…` : text;
}

export interface ReelWords {
    title: string;
    speaker: string;
    show: string;                   // the show's name, from the Studio settings
    spoken: string;                 // the Short's words
    episode: { url: string; linkText: string };   // lib/publishing.ts episodeLink
    shortId: string;
    hashtags: string[];
    credits: string[];              // the show library's music and sounds in the final cut
}

// The Reel's words: the title, the speaker's credit, the episode's link (first, so it shows without "more"), the quote,
// the music credits, hashtags. Every sentence with a limited word is dropped.
export function reelCaptions(o: ReelWords): { instagramCaption: string; facebookTitle: string; facebookDescription: string } {
    const title = clean(o.title);
    const credit = creditLine(o.speaker, o.show);
    const link = (source: string) => (o.episode.url ? `${o.episode.linkText}: ${tagged(o.episode.url, source, 'reels', o.shortId)}` : '');
    const quote = captionQuote(o.spoken);
    const music = o.credits.length ? `Music and sound\n${o.credits.map(c => c.replace(/[<>]/g, '')).join('\n')}` : '';
    const tags = hashtags(o.hashtags);
    const body = (source: string) => scrubDescription([`— ${credit}`, link(source), quote ? `“${quote}”` : '', music].filter(Boolean).join('\n\n'));
    // Instagram: the hashtags always kept, the rest fitted around them.
    const head = scrubDescription(title);
    const room = INSTAGRAM_CAPTION_MAX - head.length - tags.length - 4;
    const instagramCaption = [head, fit(body('instagram'), Math.max(0, room)), tags].filter(Boolean).join('\n\n');
    return {
        instagramCaption,
        facebookTitle: fit(scrubDescription(title) || credit, FACEBOOK_TITLE_MAX),
        facebookDescription: [body('facebook'), tags].filter(Boolean).join('\n\n'),
    };
}

// The image post's words: the quote, who said it and where, the episode's link, hashtags. Facebook gets the same, its
// link tagged for Facebook. Every sentence with a limited word is dropped (the quote has none: it is checked first).
export function imageCaptions(o: {
    quote: string; speaker: string; show: string; episode: { url: string; linkText: string }; shortId: string; hashtags: string[];
    pictureCredit?: string | null;  // the b-roll picture's credit (lib/social/picture.ts)
}): {
    instagramCaption: string;
    facebookCaption: string;
} {
    const words = (source: string) => [
        `“${clean(o.quote)}”`,
        `— ${creditLine(o.speaker, o.show)}`,
        o.episode.url ? `${o.episode.linkText}: ${tagged(o.episode.url, source, 'image', o.shortId)}` : '',
        o.pictureCredit ?? '',
    ].filter(Boolean).join('\n\n');
    const tags = hashtags(o.hashtags);
    return {
        instagramCaption: fit([scrubDescription(words('instagram')), tags].join('\n\n'), INSTAGRAM_CAPTION_MAX),
        facebookCaption: [scrubDescription(words('facebook')), tags].join('\n\n'),
    };
}

// The carousel's words: its title, the speaker's credit, the episode's link, the pictures' credits, hashtags.
export function carouselCaptions(o: {
    title: string; speaker: string; show: string; episode: { url: string; linkText: string }; shortId: string; hashtags: string[];
    pictureCredits: string[];       // lib/social/picture.ts pictureCredit, once each
    mode?: 'idea' | 'story';        // an idea unpacked (the usual), or a guest's story
}): { instagramCaption: string; facebookCaption: string } {
    const words = (source: string) => [
        clean(o.title),
        o.mode === 'story'
            ? `A moment with ${creditLine(o.speaker, o.show)}. Swipe through, then hear the whole conversation.`
            : `An idea from ${creditLine(o.speaker, o.show)}. Swipe through, sit with the question, then hear the whole conversation.`,
        o.episode.url ? `${o.episode.linkText}: ${tagged(o.episode.url, source, 'carousel', o.shortId)}` : '',
        [...new Set(o.pictureCredits)].join(' '),
    ].filter(Boolean).join('\n\n');
    const tags = hashtags(o.hashtags);
    return {
        instagramCaption: fit([scrubDescription(words('instagram')), tags].join('\n\n'), INSTAGRAM_CAPTION_MAX),
        facebookCaption: [scrubDescription(words('facebook')), tags].join('\n\n'),
    };
}

// The text for posting a carousel's slides on the YouTube channel by hand (the posts API isn't open yet): the title,
// the speaker's credit, the episode's link. Kept on the post, so automatic posting can be added once the API opens.
export function youtubePostText(o: { title: string; speaker: string; show: string; episode: { url: string; linkText: string } }): string {
    return [
        clean(o.title),
        `— ${creditLine(o.speaker, o.show)}`,
        o.episode.url ? `${o.episode.linkText}: ${o.episode.url}` : '',
    ].filter(Boolean).join('\n\n');
}
