import { requestDescript } from '@/lib/server/package';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

// Body: { again?: boolean }. Makes a Descript project from the edit package; `again` makes
// another when one exists. Progress is read with GET .../package.
export const POST = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const { again } = await request.json().catch(() => ({})) as { again?: unknown };
    await requestDescript((await params).id, { again: again === true });
    return Response.json({ started: true });
});
