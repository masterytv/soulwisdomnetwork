import { getClips, saveClips } from '@/lib/server/clips';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

// The chapters offered as clips and the producer's clips (docs/specs/025-clips.md).
export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json(await getClips((await params).id));
});

// Saves the producer's clips: { version, items }. Returns the new version.
export const PATCH = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json({ version: await saveClips((await params).id, await request.json().catch(() => null)) });
});
