// The show library's Free To Use search and import (lib/freeToUse.ts says why and what the licence asks).
// Searching only reads the public catalogue. Importing copies the track's MP3 into Storage under library/,
// the same as an admin's upload, and lists it through addEntry with the licence record filled in and not
// checked: an admin still reads the licence, saves a snapshot of it and marks it checked before use.

import { randomBytes } from 'node:crypto';
import type { LibraryEntry, LibraryKind } from '@/lib/audio';
import {
    freeToUseLicence, importedId, searchUrl, toTrack, toTrackList, trackUrl,
    FREE_TO_USE_FILE_HOST, FREE_TO_USE_ORDERS, type FreeToUseOrder, type FreeToUseTrack,
} from '@/lib/freeToUse';
import { adminBucket } from './firebaseAdmin';
import { addEntry, libraryAll } from './library';
import { HttpError } from './staff';

const API_MS = 10_000;
const FILE_MS = 60_000;
const MAX_BYTES = 2e8;   // the library's limit for a file (lib/server/uploads.ts)

async function getJson(url: string): Promise<unknown> {
    let res: Response;
    try {
        res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(API_MS), cache: 'no-store' });
    } catch {
        throw new HttpError(502, 'Free To Use did not answer; try again in a minute');
    }
    if (res.status === 404) throw new HttpError(404, 'Free To Use has no such track');
    if (!res.ok) throw new HttpError(502, `Free To Use answered ${res.status}; try again in a minute`);
    return res.json().catch(() => { throw new HttpError(502, 'Free To Use sent an answer the Studio cannot read'); });
}

// One page of the catalogue, by search words (or everything, with none), with the tracks already in the
// library marked, so they are not imported twice.
export async function searchFreeToUse(body: Record<string, unknown>) {
    const order = FREE_TO_USE_ORDERS.includes(body.order as FreeToUseOrder) ? body.order as FreeToUseOrder : 'downloads';
    const offset = Number(body.offset) || 0;
    const [list, entries] = await Promise.all([getJson(searchUrl(String(body.query ?? ''), offset, order)), libraryAll()]);
    const { tracks, total } = toTrackList(list);
    const inLibrary = new Map(entries.flatMap(e => { const id = importedId(e.licence); return id ? [[id, e.id] as const] : []; }));
    return { tracks: tracks.map(t => ({ ...t, libraryId: inLibrary.get(t.id) ?? null })), total, offset };
}

async function trackOf(id: string): Promise<FreeToUseTrack> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Not a Free To Use track');
    const raw = await getJson(trackUrl(id)) as { data?: unknown };
    const track = toTrack(raw?.data);
    if (!track) throw new HttpError(502, 'Free To Use sent a track the Studio cannot read');
    return track;
}

// Copies a track into the library: refused for premium tracks (a paid licence) and for one already there.
export async function importFreeToUse(body: Record<string, unknown>, uid: string): Promise<LibraryEntry> {
    const track = await trackOf(String(body.trackId ?? ''));
    if (track.premium) throw new HttpError(400, 'This is a premium track: the free licence does not cover it');
    if (!track.previewUrl || !FREE_TO_USE_FILE_HOST.test(track.previewUrl)) throw new HttpError(502, 'Free To Use gave no MP3 for this track');
    const already = (await libraryAll()).find(e => importedId(e.licence) === track.id);
    if (already) throw new HttpError(409, `"${already.name}" is already in the library`);

    let res: Response;
    try {
        res = await fetch(track.previewUrl, { signal: AbortSignal.timeout(FILE_MS), cache: 'no-store' });
    } catch {
        throw new HttpError(502, 'The track did not download; try again');
    }
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/^audio\/mpeg\b/.test(type)) throw new HttpError(502, 'Free To Use did not send an MP3 for this track');
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new HttpError(400, 'That track is over 200 MB');
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) throw new HttpError(400, 'That track is empty or over 200 MB');

    // Named as an admin's upload is (lib/server/uploads.ts), so addEntry checks and lists it the same way.
    const path = `library/s${Date.now().toString(36)}${randomBytes(3).toString('hex')}.mp3`;
    await adminBucket().file(path).save(bytes, { contentType: 'audio/mpeg', resumable: false });
    const kind: LibraryKind = body.kind === 'effect' ? 'effect' : 'music';
    return addEntry({
        path, kind, name: `${track.title} (${track.artists.join(', ') || 'Free To Use'})`,
        durationMs: track.durationMs || null,
        licence: freeToUseLicence(track, new Date().toISOString().slice(0, 10)),
    }, uid);
}
