// Uploads from the Studio: a recording (a new episode), a logo, an intro video, an image to lay
// over a video (Part I), or a picture, video or sound for an episode's media bin (spec 020 item E5). The browser
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

// 'library' and 'licence' are the show library's sounds and the snapshots of their licence pages (spec 020 item E7, admins only).
// 'track': one speaker's audio file for an episode (spec 019 item 3.3).
export type UploadKind = 'episode' | 'logo' | 'intro' | 'overlay' | 'media' | 'library' | 'licence' | 'track';

const MAX_BYTES: Record<UploadKind, number> = { episode: 20e9, logo: 5e6, intro: 2e9, overlay: 2e7, media: 2e9, library: 2e8, licence: 1e7, track: 2e9 };
const TYPES: Record<UploadKind, RegExp> = {
    episode: /^video\//,
    logo: /^image\/(png|jpeg)$/,
    intro: /^video\/(mp4|quicktime)$/,
    overlay: /^image\/(png|jpeg)$/,
    media: /^(image\/(png|jpeg|webp)|video\/(mp4|quicktime)|audio\/(mpeg|mp4|x-m4a|wav|x-wav|wave))$/,
    library: /^audio\/(mpeg|mp4|x-m4a|wav|x-wav|wave)$/,
    licence: /^(application\/pdf|image\/(png|jpeg))$/,
    track: /^audio\/(mpeg|mp4|x-m4a|wav|x-wav|wave)$/,
};
// The media bin's limits by what the file is (spec 020, "Uploads").
export function mediaKindOf(contentType: string): 'image' | 'video' | 'audio' | null {
    if (!TYPES.media.test(contentType)) return null;
    return contentType.startsWith('image/') ? 'image' : contentType.startsWith('video/') ? 'video' : 'audio';
}
const MEDIA_MAX: Record<'image' | 'video' | 'audio', number> = { image: 2e7, video: 2e9, audio: 2e8 };
const limitOf = (kind: UploadKind, contentType: string) => {
    const media = kind === 'media' ? mediaKindOf(contentType) : null;
    return media ? MEDIA_MAX[media] : MAX_BYTES[kind];
};
const isPng = (h: Buffer) => h.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
const isJpeg = (h: Buffer) => h.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
const isWebp = (h: Buffer) => h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP';
const isIsoMedia = (h: Buffer) => h.subarray(4, 8).toString('latin1') === 'ftyp';     // MP4, MOV, M4A
const isMp3 = (h: Buffer) => h.subarray(0, 3).toString('latin1') === 'ID3' || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0);
const isPdf = (h: Buffer) => h.subarray(0, 4).toString('latin1') === '%PDF';
const isAudio = (h: Buffer, type: string) => (type === 'audio/mpeg' ? isMp3(h) : /wav|wave/.test(type) ? isWav(h) : isIsoMedia(h));
const isWav = (h: Buffer) => h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WAVE';
// What the file must start with: the browser names its own content type, so the bytes are checked.
const MAGIC: Partial<Record<UploadKind, (head: Buffer, contentType: string) => boolean>> = {
    logo: h => isPng(h) || isJpeg(h),
    intro: h => isIsoMedia(h),
    overlay: h => isPng(h) || isJpeg(h),
    media: (h, type) => type === 'image/png' ? isPng(h) : type === 'image/jpeg' ? isJpeg(h) : type === 'image/webp' ? isWebp(h)
        : type.startsWith('audio/') ? isAudio(h, type) : isIsoMedia(h),
    library: (h, type) => isAudio(h, type),
    track: (h, type) => isAudio(h, type),
    licence: (h, type) => (type === 'application/pdf' ? isPdf(h) : type === 'image/png' ? isPng(h) : isJpeg(h)),
};
const EXT: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov',
    'application/pdf': 'pdf', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
};

// Keeps a file name safe as part of a Storage path.
const safeName = (s: string) => s.replace(/[^\w.\- ]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 150) || 'recording.mp4';

export interface UploadStart { uploadUrl: string; path: string; episodeId: string | null }

// A one-time resumable upload link for one file. The origin is the Studio page's own, so the
// browser may send the file to it (Cloud Storage answers that origin only).
export async function startUpload(body: { kind?: string; fileName?: string; contentType?: string; size?: number; episodeId?: string }, origin: string): Promise<UploadStart> {
    const kind = body.kind as UploadKind;
    if (!(kind in MAX_BYTES)) throw new HttpError(400, 'Unknown upload');
    const fileName = String(body.fileName ?? '');
    const contentType = String(body.contentType ?? '');
    const size = Number(body.size ?? 0);
    if (!fileName || !TYPES[kind].test(contentType)) {
        throw new HttpError(400, kind === 'logo' || kind === 'overlay' ? 'The image must be a PNG or JPEG' : kind === 'intro' ? 'The intro must be an MP4 or MOV video'
            : kind === 'library' || kind === 'track' ? 'Choose an MP3, M4A or WAV sound' : kind === 'licence' ? 'Save the licence page as a PDF, PNG or JPEG'
            : kind === 'media' ? 'Choose a PNG, JPEG or WebP picture, an MP4 or MOV video, or an MP3, M4A or WAV sound' : 'Choose a video recording (an MP4 from Zoom works)');
    }
    const limit = limitOf(kind, contentType);
    if (!(size > 0) || size > limit) throw new HttpError(400, `That file is too large (the limit is ${limit >= 1e9 ? `${limit / 1e9} GB` : `${limit / 1e6} MB`})`);
    if (!/^https?:\/\/[^/\s]+$/.test(origin)) throw new HttpError(400, 'Upload from the Studio page');

    let episodeId: string | null = null;
    let path: string;
    if (kind === 'episode') {
        episodeId = `up${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
        path = `episodes/${episodeId}/source/${safeName(fileName)}`;
    } else if (kind === 'media') {
        // An episode's media bin (spec 020 item E5): kept with the episode, one name per upload.
        const owner = String(body.episodeId ?? '');
        if (!/^[\w-]{10,}$/.test(owner) || !(await adminDb().collection('episodes').doc(owner).get()).exists) throw new HttpError(404, 'Episode not found');
        path = `episodes/${owner}/media/m${Date.now().toString(36)}${randomBytes(3).toString('hex')}.${EXT[contentType] ?? 'bin'}`;
    } else if (kind === 'track') {
        // A speaker's track (spec 019 item 3.3), beside the episode's original.
        const owner = String(body.episodeId ?? '');
        if (!/^[\w-]{10,}$/.test(owner) || !(await adminDb().collection('episodes').doc(owner).get()).exists) throw new HttpError(404, 'Episode not found');
        path = `episodes/${owner}/source/tracks/t${Date.now().toString(36)}${randomBytes(3).toString('hex')}.${EXT[contentType] ?? 'bin'}`;
    } else if (kind === 'library' || kind === 'licence') {
        // The show library (spec 020 item E7): one name per file; the route that starts it checks for an admin.
        path = `library/${kind === 'licence' ? 'proof-' : 's'}${Date.now().toString(36)}${randomBytes(3).toString('hex')}.${EXT[contentType] ?? 'bin'}`;
    } else if (kind === 'overlay') {
        // Images laid over videos live apart from the settings, one name per upload.
        path = `overlays/${Date.now().toString(36)}${randomBytes(3).toString('hex')}.${EXT[contentType] ?? 'bin'}`;
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
    const type = String(meta.contentType ?? '');
    let ok = TYPES[kind].test(type) && size > 0 && size <= limitOf(kind, type);
    const magic = MAGIC[kind];
    if (ok && magic) {
        const [head] = await file.download({ start: 0, end: 15 });
        ok = magic(head, type);
    }
    if (!ok) {
        await file.delete().catch(() => {});
        throw new HttpError(400, kind === 'logo' ? 'That file is not a PNG or JPEG image under 5 MB'
            : kind === 'intro' ? 'That file is not an MP4 or MOV video under 2 GB'
            : kind === 'overlay' ? 'That file is not a PNG or JPEG image under 20 MB'
            : kind === 'media' ? 'That file is not a picture under 20 MB, a video under 2 GB or a sound under 200 MB of the kinds the Studio takes'
            : kind === 'library' ? 'That file is not an MP3, M4A or WAV sound under 200 MB'
            : kind === 'track' ? 'That file is not an MP3, M4A or WAV sound under 2 GB'
            : kind === 'licence' ? 'That file is not a PDF, PNG or JPEG under 10 MB'
            : 'That file is not a video under 20 GB');
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
