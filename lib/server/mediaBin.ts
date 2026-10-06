// The episode's media bin (docs/specs/020-studio-editor.md item E5, "Media"): everything the episode
// already has, with nothing to upload (the notes plan's b-roll stills, the edit package's teaser clips,
// the intro and the Studio's logo), and the pictures, video and sounds uploaded for it. Uploads are kept
// at episodes/{id}/media/ and listed in the episode's `media` subcollection (Admin SDK only). The edit
// route takes a layer's file only from here (or an overlay upload of Part I), so a saved edit can never
// point the render at a file the Studio did not give it.

import { FieldValue } from 'firebase-admin/firestore';
import type { BinItem, BinKind } from '@/lib/layers';
import type { StudioSettings } from '@/lib/studioSettings';
import type { Episode } from '@/types/episode';
import { adminBucket, adminDb } from './firebaseAdmin';
import { HttpError } from './staff';
import { getSettings } from './studioSettings';
import { checkUploaded, mediaKindOf } from './uploads';

const LINK_MS = 6 * 3600_000;
export const BIN_MAX = 300;

function episodeRef(id: string) {
    if (!/^[\w-]{10,}$/.test(id)) throw new HttpError(400, 'Not a valid episode ID');
    return adminDb().collection('episodes').doc(id);
}

interface UploadDoc { kind: BinKind; path: string; name: string; durationMs?: number | null; width?: number | null; height?: number | null; addedAt?: unknown }

// Everything in the bin, without links: the episode's own files first, then its uploads, newest first.
export async function binItems(id: string, episode: Episode, settings: StudioSettings): Promise<BinItem[]> {
    const items: BinItem[] = [];
    for (const b of Object.values(episode.broll?.images ?? {}).sort((a, c) => a.index - c.index)) {
        items.push({ id: `broll-${b.index}`, kind: 'image', source: 'broll', path: b.path, name: b.idea || `B-roll ${b.index + 1}`, startMs: b.startMs, seconds: b.durationSeconds, index: b.index });
    }
    const pkg = episode.package?.status === 'ready' ? episode.package : undefined;
    (pkg?.clipPaths ?? []).forEach((p, i) => items.push({ id: `teaser-${i}`, kind: 'video', source: 'teaser', path: p, name: `Teaser clip ${i + 1}` }));
    const intro = settings.intro === 'custom' ? settings.introPath : pkg?.introPath ?? null;
    if (intro) items.push({ id: 'intro', kind: 'video', source: 'intro', path: intro, name: 'Intro' });
    if (settings.logoPath) items.push({ id: 'logo', kind: 'image', source: 'logo', path: settings.logoPath, name: 'Logo' });
    const uploads = await episodeRef(id).collection('media').orderBy('addedAt', 'desc').limit(BIN_MAX).get();
    for (const d of uploads.docs) {
        const u = d.data() as UploadDoc;
        items.push({ id: d.id, kind: u.kind, source: 'upload', path: u.path, name: u.name, durationMs: u.durationMs ?? null, width: u.width ?? null, height: u.height ?? null });
    }
    return items;
}

// The bin with a link to each file, for the editor (GET /api/studio/episodes/[id]/media).
export async function getBin(id: string): Promise<{ items: BinItem[] }> {
    const snap = await episodeRef(id).get();
    if (!snap.exists) throw new HttpError(404, 'Episode not found');
    const items = await binItems(id, snap.data() as Episode, await getSettings());
    const expires = Date.now() + LINK_MS;
    await Promise.all(items.map(async it => {
        it.url = await adminBucket().file(it.path).getSignedUrl({ action: 'read', expires }).then(([u]) => u).catch(() => null);
    }));
    return { items };
}

// The files a layer may use on this episode: the bin's. Overlay uploads (`overlays/`) are checked apart.
export async function binPaths(id: string, episode: Episode): Promise<Set<string>> {
    return new Set((await binItems(id, episode, await getSettings())).map(i => i.path));
}

// After the browser has sent a file: check it and list it in the bin. The browser measured its length
// and size (a short file, so no job is needed to look at it).
export async function addUpload(id: string, body: { path?: unknown; name?: unknown; durationMs?: unknown; width?: unknown; height?: unknown }, uid: string): Promise<BinItem> {
    const ref = episodeRef(id);
    const path = String(body.path ?? '');
    const m = new RegExp(`^episodes/${id}/media/(m[a-z0-9]{6,})\\.[a-z0-9]{2,4}$`).exec(path);
    if (!m) throw new HttpError(400, 'Not an upload for this episode');
    if ((await ref.collection('media').count().get()).data().count >= BIN_MAX) throw new HttpError(400, `The bin holds at most ${BIN_MAX} uploads`);
    const meta = await checkUploaded('media', path);
    const kind = mediaKindOf(String(meta.contentType ?? ''));
    if (!kind) throw new HttpError(400, 'Not a picture, video or sound');
    const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? Math.round(v) : null);
    const doc: UploadDoc = {
        kind, path, name: String(body.name ?? '').trim().slice(0, 150) || path.slice(path.lastIndexOf('/') + 1),
        durationMs: kind === 'image' ? null : num(body.durationMs, 24 * 3600_000),
        width: num(body.width, 20_000), height: num(body.height, 20_000),
    };
    await ref.collection('media').doc(m[1]).set({ ...doc, addedBy: uid, addedAt: FieldValue.serverTimestamp() });
    const [url] = await adminBucket().file(path).getSignedUrl({ action: 'read', expires: Date.now() + LINK_MS });
    return { id: m[1], source: 'upload', ...doc, url };
}

// Takes an upload out of the bin and deletes its file, unless the saved edit still uses it.
export async function removeUpload(id: string, mediaId: string) {
    if (!/^m[a-z0-9]{6,}$/.test(mediaId)) throw new HttpError(400, 'Not an upload');
    const ref = episodeRef(id);
    const [snap, doc] = await Promise.all([ref.get(), ref.collection('media').doc(mediaId).get()]);
    if (!doc.exists) throw new HttpError(404, 'Not in the bin');
    const path = (doc.data() as UploadDoc).path;
    const used = ((snap.data() as Episode | undefined)?.edit?.layers ?? []).some(l => l.kind !== 'text' && l.media.path === path);
    if (used) throw new HttpError(409, 'The saved edit still uses this file; remove it from the timeline first');
    await doc.ref.delete();
    await adminBucket().file(path).delete().catch(() => {});
}
