// The picture under a quote card (docs/specs/026-social-publishing.md). Tom, 2026-11-23: "the image can be of the person
// who is speaking or an AI image from the video. Since it's just the two of us, we don't want our picture on every quote
// card." Then: "you can use our photos one in every 5 posts." So a guest's quote goes over their own frame from the final
// cut; a host's goes over their own frame when none of the 4 image posts before it showed a host (HOST_FRAME_EVERY), and
// otherwise over a picture from the episode's own b-roll: an AI image first, then a stock photo (credited), nearest the
// Short's moment and not used by another of the episode's cards; with none, the card's plain brand background. Pure: the
// job and the tests share it.

import type { BrollImage } from '../../types/episode';

// At most one image post in this many shows a host's own frame.
export const HOST_FRAME_EVERY = 5;

// Whether a host's frame may go on the next image post: none of the last HOST_FRAME_EVERY − 1 showed one (newest first).
export const hostFrameAllowed = (recent: (string | undefined)[]) => !recent.slice(0, HOST_FRAME_EVERY - 1).includes('host');

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);

// Whether the speaker is one of the hosts (the Studio settings' names): the full name, or the first name alone when
// the transcript gave only that ("Tom" for "Tom Wood").
export function isHost(speaker: string, hosts: string[]): boolean {
    const s = words(speaker);
    if (!s.length) return false;
    return hosts.some(h => {
        const w = words(h);
        if (!w.length) return false;
        return s.join(' ') === w.join(' ') || (s.length === 1 && s[0] === w[0]);
    });
}

export type CardPicture =
    | { kind: 'speaker' }           // a guest's own frame
    | { kind: 'host' }              // a host's own frame, one post in five
    | { kind: 'broll'; path: string; source: 'ai' | 'pexels' | 'pixabay'; credit: { name: string; url: string | null } | null }
    | { kind: 'none' };

// Where in the original recording the Short is, when its key quote says (b-roll times are in the original recording;
// inside one quote the two recordings run at the same pace). Null when it can't be told.
export function originalMsOf(item: { startMs: number; quoteIndex: number | null }, quotes: { originalMs: number; startMs: number }[] | undefined): number | null {
    const q = item.quoteIndex === null ? undefined : quotes?.[item.quoteIndex];
    return q ? q.originalMs + (item.startMs - q.startMs) : null;
}

// The picture for a quote card: the speaker's frame for a guest; for a host, the episode's b-roll still nearest the
// Short (AI images before stock photos, never footage), skipping pictures other cards of the episode already use.
export function chooseCardPicture(o: {
    speaker: string;
    hosts: string[];
    images: BrollImage[];
    at: number | null;              // the Short's place in the original recording
    used: string[];                 // pictures the episode's other cards use
    hostFrameAllowed: boolean;      // none of the last 4 image posts showed a host
}): CardPicture {
    if (!isHost(o.speaker, o.hosts)) return { kind: 'speaker' };
    if (o.hostFrameAllowed) return { kind: 'host' };
    const stills = o.images.filter(i => (i.kind ?? 'image') === 'image' && !!i.path && !o.used.includes(i.path));
    const rank = (i: BrollImage) => [(i.source ?? 'ai') === 'ai' ? 0 : 1, o.at === null ? i.index : Math.abs(i.startMs - o.at)];
    const best = stills.sort((a, b) => {
        const [ra, da] = rank(a), [rb, db] = rank(b);
        return ra - rb || da - db;
    })[0];
    if (!best) return { kind: 'none' };
    return { kind: 'broll', path: best.path, source: best.source ?? 'ai', credit: best.credit ?? null };
}

// The caption's line about the picture (credit everyone).
export function pictureCredit(p: CardPicture): string | null {
    if (p.kind !== 'broll') return null;
    if (p.source === 'ai') return 'Background image created with AI.';
    const site = p.source === 'pexels' ? 'Pexels' : 'Pixabay';
    return p.credit?.name ? `Background photo by ${p.credit.name} on ${site}.` : `Background photo from ${site}.`;
}

// The episode's b-roll stills nearest a moment (AI images before stock photos at the same distance; never footage), for
// the carousel to choose from.
export function nearestBroll(images: BrollImage[], at: number | null, count: number): BrollImage[] {
    return images.filter(i => (i.kind ?? 'image') === 'image' && !!i.path)
        .sort((a, b) => (at === null ? a.index - b.index : Math.abs(a.startMs - at) - Math.abs(b.startMs - at))
            || ((a.source ?? 'ai') === 'ai' ? 0 : 1) - ((b.source ?? 'ai') === 'ai' ? 0 : 1))
        .slice(0, count);
}

// The credit for one b-roll picture.
export const brollCredit = (i: BrollImage) => pictureCredit({ kind: 'broll', path: i.path, source: i.source ?? 'ai', credit: i.credit ?? null });
