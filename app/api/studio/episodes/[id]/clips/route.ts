import { approveClip, getClips, requestClips, saveClips } from '@/lib/server/clips';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

// The chapters offered as clips and the producer's clips (docs/specs/025-clips.md).
export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json(await getClips((await params).id));
});

// Starts the clips job: { mode: 'pick' | 'titles' | 'render' | 'moments', direction?, clip?, atMs? },
// or approves one made clip at Checkpoint F: { approve: clipId, approved: boolean }.
export const POST = handle<Context>(async (request, { params }) => {
    const user = await requireRole(request, STUDIO_ROLES);
    const id = (await params).id;
    const body = (await request.json().catch(() => null)) ?? {};
    if (typeof body.approve === 'string') {
        await approveClip(id, { item: body.approve, approved: body.approved === true }, user);
        return Response.json({ approved: body.approved === true });
    }
    await requestClips(id, body);
    return Response.json({ started: true });
});

// Saves the producer's clips: { version, items }. Returns the new version.
export const PATCH = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json({ version: await saveClips((await params).id, await request.json().catch(() => null)) });
});
