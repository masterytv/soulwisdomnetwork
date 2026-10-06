// The Studio editor's timeline media (spec 020 item E2): hour-long links to the thumbnail sheets
// made at ingest, and whether the waveform's peaks exist (they come from ../peaks as bytes). Both
// are null or false for an episode the ingest catch-up has not reached yet.
import { handle, requireRole, STUDIO_ROLES, HttpError } from '@/lib/server/staff';
import { adminBucket, adminDb } from '@/lib/server/firebaseAdmin';
import { ThumbIndexSchema, type ThumbSheets } from '@/lib/thumbs';
import type { Episode } from '@/types/episode';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

// As long as the editor's video link, so a long session keeps its pictures.
const LINK_MS = 6 * 60 * 60_000;

export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const id = (await params).id;
    if (!/^[\w-]{10,}$/.test(id)) throw new HttpError(400, 'Not a valid episode ID');
    const doc = await adminDb().collection('episodes').doc(id).get();
    if (!doc.exists) throw new HttpError(404, 'Episode not found');
    const media = (doc.data() as Episode).media;

    let thumbs: ThumbSheets | null = null;
    if (media?.thumbsPath) {
        const raw = await adminBucket().file(media.thumbsPath).download().then(([b]) => JSON.parse(b.toString('utf8'))).catch(() => null);
        const parsed = ThumbIndexSchema.safeParse(raw);
        if (parsed.success) {
            const { sheets, ...layout } = parsed.data;
            const urls = await Promise.all(sheets.map(path => adminBucket().file(path)
                .getSignedUrl({ action: 'read', expires: Date.now() + LINK_MS }).then(([u]) => u).catch(() => '')));
            if (urls.every(Boolean)) thumbs = { ...layout, urls };
        }
    }
    return Response.json({ thumbs, peaks: !!media?.peaksPath });
});
