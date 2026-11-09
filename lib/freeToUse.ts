// Why: Free To Use (https://freetouse.com/api), a free music API with no key, as a source for the show library
// (docs/specs/020-studio-editor.md item E7). An admin searches it on the library page, listens, and brings a
// track in: the server downloads the MP3 into Storage and fills in its licence record (lib/server/freeToUse.ts).
// The licence still has to be read and checked by hand, with a snapshot of the licence page, like any other
// file: the Free To Use License allows free use only in an individual's content on social platforms, with
// credit, and asks for a paid plan for anything else, so whether it covers the show is the checker's call.
//
// What the API returns is parsed here, apart from the server, so the tests can run it without the network.

import type { Licence } from './audio';

export const FTU_API = 'https://api.freetouse.com/v3';
export const FTU_LICENCE_URL = 'https://freetouse.com/license';
export const FTU_PAGE_SIZE = 20;
export const FTU_MAX_BYTES = 200e6;   // the library's own limit (lib/server/uploads.ts)

// The orders the search offers (the API's `order`, always descending).
export const FTU_ORDERS = ['release_date', 'downloads', 'plays', 'staff_order'] as const;
export type FtuOrder = typeof FTU_ORDERS[number];
export const FTU_ORDER_LABELS: Record<FtuOrder, string> = {
    release_date: 'Newest', downloads: 'Most downloaded', plays: 'Most played', staff_order: 'Staff picks',
};

export interface FtuTrack {
    id: string;
    title: string;
    artist: string;          // every artist, in the API's order, joined with " & "
    genre: string | null;
    tags: string[];
    durationMs: number | null;
    premium: boolean;        // needs a paid Free To Use plan
    mp3: string;             // the file, on Free To Use's own server
    cover: string | null;    // 125×125 cover art
    pageUrl: string;         // the track's page on freetouse.com
}

export const isFtuId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// Only Free To Use's own servers, over https, are fetched or played.
export function isFtuUrl(url: string): boolean {
    try {
        const u = new URL(url);
        return u.protocol === 'https:' && (u.hostname === 'freetouse.com' || u.hostname.endsWith('.freetouse.com'));
    } catch {
        return false;
    }
}

// The site's address for a name: freetouse.com/music/zolvi/slight-unease.
export const ftuSlug = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
// The API's lists are [sequence, value] pairs.
const ordered = <T>(v: unknown, pick: (x: unknown) => T | null): T[] => (Array.isArray(v) ? v : [])
    .filter((p): p is [number, unknown] => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number')
    .sort((a, b) => a[0] - b[0])
    .map(p => pick(p[1]))
    .filter((x): x is T => x !== null && x !== '');

// One track from the API, or null when it lacks what the library needs (an id, a title and an MP3 there).
export function parseTrack(raw: unknown): FtuTrack | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const id = str(r.id);
    const title = str(r.title).slice(0, 150);
    const mp3 = str((r.files as Record<string, unknown> | undefined)?.mp3);
    if (!isFtuId(id) || !title || !isFtuUrl(mp3)) return null;
    const artists = ordered(r.artists, a => (a && typeof a === 'object' ? str((a as Record<string, unknown>).name) : null));
    const artist = artists.join(' & ').slice(0, 150);
    const cover = str((r.thumbnails as Record<string, unknown> | undefined)?.sm);
    const duration = typeof r.duration === 'number' && Number.isFinite(r.duration) && r.duration > 0 ? Math.round(r.duration * 1000) : null;
    return {
        id, title, artist,
        genre: str(r.genre) || null,
        tags: ordered(r.tags, t => (typeof t === 'string' ? t.trim() : null)).slice(0, 6),
        durationMs: duration,
        premium: r.is_premium === true,
        mp3,
        cover: isFtuUrl(cover) ? cover : null,
        pageUrl: artists[0] ? `https://freetouse.com/music/${ftuSlug(artists[0])}/${ftuSlug(title)}` : 'https://freetouse.com/music',
    };
}

// The credit Free To Use asks for (its FAQ: the track and artist, and the source), on one line.
export const ftuCredit = (t: Pick<FtuTrack, 'title' | 'artist'>) =>
    `Music track: ${t.title}${t.artist ? ` by ${t.artist}` : ''} · Source: https://freetouse.com/music · Free To Use`.slice(0, 300);

// The licence record a brought-in track starts with. The snapshot of the licence page is left for the admin,
// who must read the licence before checking it.
export function ftuLicence(t: FtuTrack, today: string): Licence {
    return {
        sourceUrl: t.pageUrl,
        author: t.artist,
        name: 'Free To Use License',
        url: FTU_LICENCE_URL,
        downloadedOn: today,
        proofPath: null,
        code: `Free To Use track ${t.id}`,
        credit: ftuCredit(t),
    };
}
