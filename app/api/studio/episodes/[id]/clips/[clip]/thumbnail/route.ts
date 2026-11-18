import { saveClipThumbnail } from '@/lib/server/clips';
import { handle, HttpError, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; clip: string }> };

// A clip's "Soul Wisdom Clips" thumbnail exactly as drawn in the Studio: { image } with the JPEG as base64.
export const PUT = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const { id, clip } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Expected a JSON body');
    return Response.json(await saveClipThumbnail(id, clip, body));
});
