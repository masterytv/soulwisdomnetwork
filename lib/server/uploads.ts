// Uploads from the Studio: a recording (a new episode), a logo or an intro video. The browser
// sends the file straight to Cloud Storage through a one-time upload link made here, so nothing
// in the browser needs Storage access (storage.rules stays closed) and no Drive is involved.
// A finished recording becomes an episode and the ingest job is started for it, which then
// makes the preview, transcribes and hands it to speaker review exactly as for a Drive file.

import { randomBytes } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { episodeTitle, recordedAt } from '@/agent/src/podcast/naming';
import type { Episode } from '@/types/episode';
import { adminBucket, adminDb } from './firebaseAdmin';
import { startIngest } from './github';
import { HttpError } from './staff';
import { ESTIMATE_USD, withinDailyLimit } from './spending';
import { getSettings } from './studioSettings';

export type UploadKind = 'episode' | 'logo' | 'intro';

const MAX_BYTES: Record<UploadKind, number> = { episode: 20e9, logo: 5e6, intro: 2e9 };
const TYPES: Record<UploadKind, RegExp> = {
    episode: /^video\//,
    logo: /^image\/(png|jpeg)$/,
    intro: /^video\/(mp4|quicktime)$/,
};
// What the file must start with: the browser names its own content type, so the bytes are checked.
const MAGIC: Partial<Record<UploadKind, (head: Buffer) => boolean>> = {
    logo: h => h.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) || h.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
    intro: h => h.subarray(4, 8).toString('latin1') === 'ftyp',
};
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };

// Keeps a file name safe as part of a Storage path.
const safeName = (s: string) => s.replace(/[^\w.\- ]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 150) || 'recording.mp4';

export interface UploadStart { uploadUrl: string; path: string; episodeId: string | null }

// A one-time resumable upload link for one file. The origin is the Studio page's own, so the
// browser may send the file to it (Cloud Storage answers that origin only).
export async function startUpload(body: { kind?: string; fileName?: string; contentType?: string; size?: number }, origin: string): Promise<UploadStart> {
    const kind = body.kind as UploadKind;
    if (!(kind in MAX_BYTES)) throw new HttpError(400, 'Unknown upload');
    const fileName = String(body.fileName ?? '');
    const contentType = String(body.contentType ?? '');
    const size = Number(body.size ?? 0);
    if (!fileName || !TYPES[kind].test(contentType)) {
        throw new HttpError(400, kind === 'logo' ? 'The logo must be a PNG or JPEG image' : kind === 'intro' ? 'The intro must be an MP4 or MOV video' : 'Choose a video recording (an MP4 from Zoom works)');
    }
    if (!(size > 0) || size > MAX_BYTES[kind]) throw new HttpError(400, `That file is too large (the limit is ${MAX_BYTES[kind] >= 1e9 ? `${MAX_BYTES[kind] / 1e9} GB` : `${MAX_BYTES[kind] / 1e6} MB`})`);
    if (!/^https?:\/\/[^/\s]+$/.test(origin)) throw new HttpError(400, 'Upload from the Studio page');

    let episodeId: string | null = null;
    let path: string;
    if (kind === 'episode') {
        episodeId = `up${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
        path = `episodes/${episodeId}/source/${safeName(fileName)}`;
    } else {
        path = `settings/${kind}-${Date.now()}.${EXT[contentType] ?? 'bin'}`;
    }
    const link = async () => {
        const [uploadUrl] = await adminBucket().file(path).createResumableUpload({ origin, metadata: { contentType } });
        return { uploadUrl, path, episodeId };
    };
    // A recording is transcribed (AssemblyAI) as soon as it arrives, so it counts against the
    // daily spending limit before the upload starts.
    return kind === 'episode' ? withinDailyLimit('transcribing an upload', ESTIMATE_USD.upload, link) : link();
}

// Checks what actually arrived in Storage, since the upload link does not limit it: the type,
// the size and, for logos and intros, the first bytes. A file that fails is deleted.
export async function checkUploaded(kind: UploadKind, path: string) {
    const file = adminBucket().file(path);
    const [exists] = await file.exists();
    if (!exists) throw new HttpError(409, 'The upload did not finish; try again');
    const [meta] = await file.getMetadata();
    const size = Number(meta.size ?? 0);
    let ok = TYPES[kind].test(String(meta.contentType ?? '')) && size > 0 && size <= MAX_BYTES[kind];
    const magic = MAGIC[kind];
    if (ok && magic) {
        const [head] = await file.download({ start: 0, end: 15 });
        ok = magic(head);
    }
    if (!ok) {
        await file.delete().catch(() => {});
        throw new HttpError(400, kind === 'logo' ? 'That file is not a PNG or JPEG image under 5 MB'
            : kind === 'intro' ? 'That file is not an MP4 or MOV video under 2 GB' : 'That file is not a video under 20 GB');
    }
    return meta;
}

// After the browser has sent the recording: make the episode and start processing it.
export async function finishEpisodeUpload(body: { episodeId?: string; path?: string; title?: string }) {
    const episodeId = String(body.episodeId ?? '');
    const path = String(body.path ?? '');
    if (!/^up[a-z0-9]{12,}$/.test(episodeId) || !path.startsWith(`episodes/${episodeId}/source/`)) {
        throw new HttpError(400, 'Not an upload from this Studio');
    }
    const meta = await checkUploaded('episode', path);
    const fileName = path.slice(path.lastIndexOf('/') + 1);
    const title = String(body.title ?? '').trim().slice(0, 150) || episodeTitle(fileName);
    const settings = await getSettings();

    const episode: Episode = {
        title,
        recordedAt: recordedAt(fileName),
        status: 'ingesting',
        stage: 'copy',
        source: 'upload',
        drive: { fileId: episodeId, fileName, mimeType: String(meta.contentType ?? 'video/mp4'), sizeBytes: Number(meta.size ?? 0) },
        media: { sourcePath: path },
        candidateSpeakers: settings.hosts,
        costs: { items: [], totalUsd: 0 },
        error: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    };
    try {
        await adminDb().collection('episodes').doc(episodeId).create(episode);
    } catch {
        throw new HttpError(409, 'This upload already became an episode');
    }
    try {
        await startIngest({ skip_wait: true });
    } catch (error) {
        // The episode is saved; the next processing run (or Retry) picks it up.
        return { episodeId, started: false, message: `Uploaded. Processing could not start yet: ${(error as Error).message}` };
    }
    return { episodeId, started: true, message: 'Uploaded. Processing has started; it shows under Processing within a minute or two.' };
}
