// Step 3 on the show notes page, "Build edit package" (spec 020 item E15): whether the episode has an edit yet (GET), and
// set one up, with `export` also starting its render (POST). lib/server/buildEdit.ts.
import { buildEdit, getBuild } from '@/lib/server/buildEdit';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json(await getBuild((await params).id));
});

export const POST = handle<Context>(async (request, { params }) => {
    const { uid } = await requireRole(request, STUDIO_ROLES);
    const body = await request.json().catch(() => ({})) as { export?: unknown };
    return Response.json(await buildEdit((await params).id, uid, { render: body.export === true }));
});
