// Speaker tracks (docs/specs/019-editor-light-v2.md item 3.3): one audio file per person, added to an episode in
// the Studio editor's Render panel (or by ingest, from a Zoom folder in the Drive inbox). They are kept on the
// episode as `media.speakerTracks`; the render makes the voice from them unless the edit turns them off.

import { FieldValue } from 'firebase-admin/firestore';
import type { Episode } from '@/types/episode';
import { MAX_TRACKS, trackName, type SpeakerTrack } from '@/lib/speakerTracks';
import { adminBucket, adminDb } from './firebaseAdmin';
import { HttpError } from './staff';
import { checkUploaded } from './uploads';

function episodeRef(id: string) {
    if (!/^[\w-]{10,}$/.test(id)) throw new HttpError(400, 'Not a valid episode ID');
    return adminDb().collection('episodes').doc(id);
}

const tracksOf = (e: Episode | undefined) => e?.media?.speakerTracks ?? [];

export async function listTracks(id: string): Promise<SpeakerTrack[]> {
    const snap = await episodeRef(id).get();
    if (!snap.exists) throw new HttpError(404, 'Episode not found');
    return tracksOf(snap.data() as Episode);
}

// A track uploaded through the Studio (kind 'track'): checked, then added under its person's name.
export async function addTrack(id: string, body: { path?: unknown; fileName?: unknown }): Promise<SpeakerTrack[]> {
    const path = String(body.path ?? ''), fileName = String(body.fileName ?? '').slice(0, 200);
    if (!path.startsWith(`episodes/${id}/source/tracks/`)) throw new HttpError(400, 'Not a track uploaded for this episode');
    await checkUploaded('track', path);
    const ref = episodeRef(id);
    return adminDb().runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpError(404, 'Episode not found');
        const tracks = tracksOf(snap.data() as Episode);
        if (tracks.some(t => t.path === path)) return tracks;
        if (tracks.length >= MAX_TRACKS) throw new HttpError(400, `At most ${MAX_TRACKS} speaker tracks`);
        const next = [...tracks, { path, fileName: fileName || 'track', name: trackName(fileName || 'track') }];
        tx.update(ref, { 'media.speakerTracks': next, updatedAt: FieldValue.serverTimestamp() });
        return next;
    });
}

// Renames a track's person.
export async function renameTrack(id: string, body: { path?: unknown; name?: unknown }): Promise<SpeakerTrack[]> {
    const path = String(body.path ?? ''), name = String(body.name ?? '').trim().slice(0, 60);
    if (!name) throw new HttpError(400, 'Give the track a name');
    const ref = episodeRef(id);
    return adminDb().runTransaction(async tx => {
        const tracks = tracksOf((await tx.get(ref)).data() as Episode | undefined);
        if (!tracks.some(t => t.path === path)) throw new HttpError(404, 'No such track');
        const next = tracks.map(t => (t.path === path ? { ...t, name } : t));
        tx.update(ref, { 'media.speakerTracks': next, updatedAt: FieldValue.serverTimestamp() });
        return next;
    });
}

// Removes a track from the episode and its file from Storage.
export async function removeTrack(id: string, body: { path?: unknown }): Promise<SpeakerTrack[]> {
    const path = String(body.path ?? '');
    const ref = episodeRef(id);
    const next = await adminDb().runTransaction(async tx => {
        const tracks = tracksOf((await tx.get(ref)).data() as Episode | undefined);
        if (!tracks.some(t => t.path === path)) throw new HttpError(404, 'No such track');
        const rest = tracks.filter(t => t.path !== path);
        tx.update(ref, { 'media.speakerTracks': rest, updatedAt: FieldValue.serverTimestamp() });
        return rest;
    });
    if (path.startsWith(`episodes/${id}/source/tracks/`)) await adminBucket().file(path).delete().catch(() => {});
    return next;
}
