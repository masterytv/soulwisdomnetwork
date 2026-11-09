// Free To Use music in the show library (lib/freeToUse.ts): searching its API, and bringing a track in. The
// server fetches the MP3 itself (the browser only plays it from Free To Use), saves it under `library/` like an
// upload, and lists it through addEntry with its licence record filled in, not checked. A track already in the
// library is not brought in twice (`freeToUseId` on its entry).

import { randomBytes } from 'node:crypto';
import { LIBRARY_KINDS, type LibraryEntry, type LibraryKind } from '@/lib/audio';
import {
    FTU_API, FTU_MAX_BYTES, FTU_ORDERS, FTU_PAGE_SIZE, ftuLicence, isFtuId, isFtuUrl, parseTrack,
    type FtuOrder, type FtuTrack,
} from '@/lib/freeToUse';
import { adminBucket, adminDb } from './firebaseAdmin';
import { addEntry } from './library';
import { HttpError } from './staff';

const items = () => adminDb().collection('studio').doc('media').collection('items');

async function ftuGet(path: string, params: Record<string, string | number> = {}): Promise<{ data: unknown; count: number }> {
    const url = new URL(`${FTU_API}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    let res: Response;
    try {
        res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    } catch {
        throw new HttpError(502, 'Free To Use did not answer; try again');
    }
    const body = await res.json().catch(() => null) as { ok?: boolean; data?: unknown; error?: string; pagination?: { count?: number } } | null;
    if (res.status === 404) throw new HttpError(404, 'Free To Use has no such track');
    if (!res.ok || !body?.ok) throw new HttpError(502, `Free To Use: ${body?.error ?? `error ${res.status}`}`);
    return { data: body.data, count: Number(body.pagination?.count ?? 0) };
}

export interface FtuSearch { tracks: (FtuTrack & { inLibrary: string | null })[]; count: number; offset: number }

// One page of tracks: those matching the words (titles, tags, categories and artists), or all of them.
export async function searchTracks(params: { q?: unknown; offset?: unknown; order?: unknown }): Promise<FtuSearch> {
    const q = String(params.q ?? '').trim().slice(0, 100);
    const offset = Math.max(0, Math.min(10_000, Math.floor(Number(params.offset) || 0)));
    const order: FtuOrder = FTU_ORDERS.includes(params.order as FtuOrder) ? params.order as FtuOrder : 'release_date';
    const page = { limit: FTU_PAGE_SIZE, offset, order, sort: 'desc' };
    const { data, count } = await ftuGet(q ? '/music/tracks/search' : '/music/tracks/all', q ? { ...page, query: q } : page);
    const tracks = (Array.isArray(data) ? data : []).map(parseTrack).filter((t): t is FtuTrack => t !== null);
    // Which of them the library already has.
    const had = new Map<string, string>();
    if (tracks.length) {
        const snap = await items().where('freeToUseId', 'in', tracks.map(t => t.id).slice(0, 30)).get();
        snap.docs.forEach(d => had.set(String(d.get('freeToUseId')), d.id));
    }
    return { tracks: tracks.map(t => ({ ...t, inLibrary: had.get(t.id) ?? null })), count, offset };
}

// Downloads the track into Storage and lists it in the library, its licence filled in but not checked.
export async function importTrack(body: Record<string, unknown>, uid: string): Promise<LibraryEntry> {
    const id = String(body.id ?? '');
    if (!isFtuId(id)) throw new HttpError(400, 'Not a Free To Use track');
    const kind: LibraryKind = LIBRARY_KINDS.includes(body.kind as LibraryKind) ? body.kind as LibraryKind : 'music';
    const already = await items().where('freeToUseId', '==', id).limit(1).get();
    if (!already.empty) throw new HttpError(409, `This track is already in the library, as "${already.docs[0].get('name')}"`);

    const track = parseTrack((await ftuGet(`/music/tracks/${id}`)).data);
    if (!track) throw new HttpError(502, 'Free To Use sent a track the Studio cannot read');
    if (track.premium) throw new HttpError(400, 'This is a Premium track: Free To Use asks for a paid plan to use it');

    let res: Response;
    try {
        res = await fetch(track.mp3, { signal: AbortSignal.timeout(120_000), cache: 'no-store' });
    } catch {
        throw new HttpError(502, 'The track did not download; try again');
    }
    // A redirect may only stay on Free To Use's servers.
    if (!res.ok || !isFtuUrl(res.url || track.mp3)) throw new HttpError(502, `The track did not download (error ${res.status})`);
    if (Number(res.headers.get('content-length') ?? 0) > FTU_MAX_BYTES) throw new HttpError(400, 'The track is over 200 MB');
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > FTU_MAX_BYTES) throw new HttpError(400, 'The track is empty or over 200 MB');

    // Named like an upload, so addEntry checks it (an MP3 under 200 MB) and lists it the same way.
    const path = `library/s${Date.now().toString(36)}${randomBytes(3).toString('hex')}.mp3`;
    await adminBucket().file(path).save(bytes, { contentType: 'audio/mpeg', resumable: false });
    const name = track.artist ? `${track.title} (${track.artist})` : track.title;
    const entry = await addEntry({
        path, kind, name: name.slice(0, 150), durationMs: track.durationMs,
        licence: ftuLicence(track, new Date().toISOString().slice(0, 10)),
    }, uid);
    await items().doc(entry.id).update({ freeToUseId: id });
    return entry;
}
