// Speaker tracks (spec 019 item 3.3, lib/server/speakerTracks.ts): GET lists them; POST adds one uploaded with kind
// 'track'; PATCH renames one; DELETE removes one. Anyone in the Studio.
import { addTrack, listTracks, removeTrack, renameTrack } from '@/lib/server/speakerTracks';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json({ tracks: await listTracks((await params).id) });
});

export const POST = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    return Response.json({ tracks: await addTrack((await params).id, body) });
});

export const PATCH = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    return Response.json({ tracks: await renameTrack((await params).id, body) });
});

export const DELETE = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    return Response.json({ tracks: await removeTrack((await params).id, body) });
});
