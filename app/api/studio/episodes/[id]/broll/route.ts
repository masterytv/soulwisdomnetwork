import { getBroll, requestBroll, skipBroll } from '@/lib/server/broll';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json(await getBroll((await params).id));
});

// Body: { index?: number }. Generates the missing or changed images, or regenerates one.
// Body: { skip: boolean } instead skips b-roll, or takes the skip back (lib/brollGate.ts).
export const POST = handle<Context>(async (request, { params }) => {
    const user = await requireRole(request, STUDIO_ROLES);
    const { index, skip } = await request.json().catch(() => ({})) as { index?: unknown; skip?: unknown };
    if (typeof skip === 'boolean') {
        await skipBroll((await params).id, skip, user);
        return Response.json({ skipped: skip });
    }
    if (index !== undefined && index !== null && !(Number.isInteger(index) && (index as number) >= 0)) {
        return Response.json({ error: 'index must be a whole number' }, { status: 400 });
    }
    await requestBroll((await params).id, typeof index === 'number' ? index : null);
    return Response.json({ started: true });
});
