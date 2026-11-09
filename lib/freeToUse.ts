// Free To Use (https://freetouse.com/api): a public catalogue of royalty-free music by real artists, with no key
// and no account. The show library (spec 020 item E7, lib/server/library.ts) can search it and import a track:
// the MP3 is copied into Storage like an upload and listed with its licence record filled in from the
// catalogue, still "not checked" until an admin has read the licence and saved a snapshot of it (decision U2).
//
// The Free License (https://freetouse.com/license) lets user-generated content be monetized only with
// attribution: the artist(s), the track's title and a link to freetouse.com/music in the description, which
// the credit below says and the render adds to every episode and Short that plays the track. Premium tracks
// need a paid licence and are not offered. This file is pure (the server part is lib/server/freeToUse.ts).

import { z } from 'zod';
import { EMPTY_LICENCE, type Licence } from './audio';

export const FREE_TO_USE_API = 'https://api.freetouse.com/v3';
export const FREE_TO_USE_MUSIC = 'https://freetouse.com/music';
export const FREE_TO_USE_LICENCE = { name: 'Free To Use License (Free License, with attribution)', url: 'https://freetouse.com/license' };
// Where the MP3s are served from: only these are fetched by the import.
export const FREE_TO_USE_FILE_HOST = /^https:\/\/([a-z0-9-]+\.)*data\.freetouse\.com\//;
export const FREE_TO_USE_PAGE = 20;
export const FREE_TO_USE_ORDERS = ['release_date', 'downloads', 'plays', 'views', 'staff_order', 'random'] as const;
export type FreeToUseOrder = typeof FREE_TO_USE_ORDERS[number];

// The API lists artists, categories and tags as [position, value] pairs.
const Named = z.object({ id: z.string(), name: z.string() });
const pairs = <T extends z.ZodTypeAny>(item: T) => z.array(z.tuple([z.number(), item])).catch([]);

export const ApiTrackSchema = z.object({
    id: z.string().regex(/^[0-9a-f-]{36}$/i),   // not .uuid(): some of the catalogue's ids are not RFC 4122
    title: z.string(),
    duration: z.number().nonnegative().catch(0),
    release_date: z.string().nullish(),
    genre: z.string().nullish(),
    is_premium: z.boolean().catch(true),          // unknown counts as premium: never import what may need a paid licence
    artists: pairs(Named),
    categories: pairs(Named),
    tags: pairs(z.string()),
    thumbnails: z.object({ sm: z.string().optional(), md: z.string().optional() }).partial().nullish(),
    files: z.object({ mp3: z.string().optional() }).nullish(),
});
export type ApiTrack = z.infer<typeof ApiTrackSchema>;

// What the Studio shows and imports.
export interface FreeToUseTrack {
    id: string;
    title: string;
    artists: string[];
    durationMs: number;
    genre: string | null;
    moods: string[];             // its categories and tags, as the catalogue gives them
    premium: boolean;
    cover: string | null;
    previewUrl: string | null;   // the MP3, played straight from Free To Use
    pageUrl: string;
    released: string | null;     // YYYY-MM-DD
}

const ordered = <T>(list: [number, T][]) => [...list].sort((a, b) => a[0] - b[0]).map(([, v]) => v);

// "Luke Bergs" → "luke-bergs", as the site's own addresses spell them.
export function slug(s: string): string {
    return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// A track's page: its first artist and its title (freetouse.com/music/luke-bergs/follow-the-sun).
export function trackPageUrl(artists: string[], title: string): string {
    const a = slug(artists[0] ?? ''), t = slug(title);
    return a && t ? `${FREE_TO_USE_MUSIC}/${a}/${t}` : FREE_TO_USE_MUSIC;
}

export function toTrack(raw: unknown): FreeToUseTrack | null {
    const r = ApiTrackSchema.safeParse(raw);
    if (!r.success) return null;
    const t = r.data;
    const artists = ordered(t.artists).map(a => a.name.trim()).filter(Boolean);
    const mp3 = t.files?.mp3 && FREE_TO_USE_FILE_HOST.test(t.files.mp3) ? t.files.mp3 : null;
    const cover = t.thumbnails?.sm ?? t.thumbnails?.md ?? null;
    return {
        id: t.id,
        title: t.title.trim(),
        artists,
        durationMs: Math.round(t.duration * 1000),
        genre: t.genre?.trim() || null,
        moods: [...new Set([...ordered(t.categories).map(c => c.name), ...ordered(t.tags)].map(s => s.trim()).filter(Boolean))],
        premium: t.is_premium,
        cover: cover && /^https:\/\//.test(cover) ? cover : null,
        previewUrl: mp3,
        pageUrl: trackPageUrl(artists, t.title),
        released: /^\d{4}-\d{2}-\d{2}/.test(t.release_date ?? '') ? t.release_date!.slice(0, 10) : null,
    };
}

// A list answer ({ ok, data: [...], pagination: { count } }): the tracks it could read, and how many match.
export function toTrackList(raw: unknown): { tracks: FreeToUseTrack[]; total: number } {
    const body = (raw && typeof raw === 'object' ? raw : {}) as { data?: unknown; pagination?: { count?: unknown } };
    const tracks = (Array.isArray(body.data) ? body.data : []).map(toTrack).filter((t): t is FreeToUseTrack => !!t);
    const total = typeof body.pagination?.count === 'number' ? body.pagination.count : tracks.length;
    return { tracks, total };
}

// The address of a search (or of the whole catalogue, with no words), one page at a time.
export function searchUrl(query: string, offset = 0, order: FreeToUseOrder = 'downloads'): string {
    const q = query.trim().slice(0, 100);
    const p = new URLSearchParams({ limit: String(FREE_TO_USE_PAGE), offset: String(Math.max(0, Math.floor(offset) || 0)), order, sort: 'desc' });
    if (q) p.set('query', q);
    return `${FREE_TO_USE_API}/music/tracks/${q ? 'search' : 'all'}?${p}`;
}

export const trackUrl = (id: string) => `${FREE_TO_USE_API}/music/tracks/${encodeURIComponent(id)}`;

const joinArtists = (a: string[]) => (a.length <= 1 ? a[0] ?? 'Unknown artist' : `${a.slice(0, -1).join(', ')} & ${a[a.length - 1]}`);

// The attribution the Free License asks for: artists, title and a link to Free To Use.
export function freeToUseCredit(t: Pick<FreeToUseTrack, 'title' | 'artists'>): string {
    return `Music: "${t.title}" by ${joinArtists(t.artists)}, from Free To Use (${FREE_TO_USE_MUSIC})`.slice(0, 300);
}

// The library's licence record for an imported track. The snapshot of the licence page is left for the admin
// who checks it, so the check stays a person's.
export function freeToUseLicence(t: FreeToUseTrack, downloadedOn: string): Licence {
    return {
        ...EMPTY_LICENCE,
        sourceUrl: t.pageUrl,
        author: joinArtists(t.artists).slice(0, 150),
        name: FREE_TO_USE_LICENCE.name,
        url: FREE_TO_USE_LICENCE.url,
        downloadedOn,
        code: `freetouse:${t.id}`,
        credit: freeToUseCredit(t),
    };
}

// The library entry an import already made, found by the track id kept in the licence's code.
export const importedId = (l: Pick<Licence, 'code'>) => (/^freetouse:([0-9a-f-]{36})$/i.exec(l.code)?.[1] ?? null);
