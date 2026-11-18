import { getClipImage } from '@/lib/server/clips';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; clip: string }> };

// One of a clip's images by name (frame-N, cutout-N, thumbnail), for the Studio to draw the thumbnail with.
export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const { id, clip } = await params;
    const name = new URL(request.url).searchParams.get('name') ?? '';
    const { bytes, contentType } = await getClipImage(id, clip, name);
    return new Response(new Uint8Array(bytes), {
        headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600' },
    });
});
