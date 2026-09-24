import { getPackage, requestPackage } from '@/lib/server/package';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json(await getPackage((await params).id));
});

// Builds (or rebuilds) the edit package from the approved show notes.
export const POST = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    await requestPackage((await params).id);
    return Response.json({ started: true });
});
