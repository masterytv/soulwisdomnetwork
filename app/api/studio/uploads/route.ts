// Uploads from the Studio (lib/server/uploads.ts). POST { action: 'start', kind, fileName,
// contentType, size } returns a one-time upload link; POST { action: 'finish', episodeId, path,
// title } turns an uploaded recording into an episode. Logos, intros and the show library's sounds and
// licence snapshots (`library`, `licence`; spec 020 item E7): admins only; recordings,
// images for the editor's overlays (Part I) and files for an episode's media bin (`media`, with its
// episodeId; spec 020 item E5): anyone in the Studio.
import { finishEpisodeUpload, startUpload } from '@/lib/server/uploads';
import { handle, HttpError, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

export const POST = handle(async request => {
    const { role } = await requireRole(request, STUDIO_ROLES);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === 'start') {
        if (body.kind !== 'episode' && body.kind !== 'overlay' && body.kind !== 'media' && role !== 'admin') throw new HttpError(403, 'Only an admin can change the logo, the intro or the show library');
        return Response.json(await startUpload(body, request.headers.get('origin') ?? ''));
    }
    if (body.action === 'finish') return Response.json(await finishEpisodeUpload(body));
    throw new HttpError(400, 'Unknown action');
});
