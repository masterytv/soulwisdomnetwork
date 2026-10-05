// The Studio editor's waveform (spec 019 item 2.1, spec 020 item E2): the peaks made at ingest
// (analysis/peaks.bin, lib/peaks.ts), passed through as bytes. Served from here rather than a
// Storage link because the browser reads them with fetch, which the bucket's CORS would refuse.
import { handle, requireRole, STUDIO_ROLES, HttpError } from '@/lib/server/staff';
import { adminBucket, adminDb } from '@/lib/server/firebaseAdmin';
import type { Episode } from '@/types/episode';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const id = (await params).id;
    if (!/^[\w-]{10,}$/.test(id)) throw new HttpError(400, 'Not a valid episode ID');
    const doc = await adminDb().collection('episodes').doc(id).get();
    if (!doc.exists) throw new HttpError(404, 'Episode not found');
    const peaksPath = (doc.data() as Episode).media?.peaksPath;
    if (!peaksPath) throw new HttpError(404, 'No waveform yet: the next Podcast Ingest run makes it');
    const [bytes] = await adminBucket().file(peaksPath).download().catch(() => { throw new HttpError(404, 'The waveform file is missing'); });
    return new Response(new Uint8Array(bytes), {
        headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' },
    });
});
