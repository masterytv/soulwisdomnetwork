import { approveNotes } from '@/lib/server/notes';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

// Body: { version }. Checkpoint B: approves the saved draft.
export const POST = handle<Context>(async (request, { params }) => {
    const user = await requireRole(request, STUDIO_ROLES);
    const { version } = await request.json().catch(() => ({})) as { version?: unknown };
    await approveNotes((await params).id, version, user);
    return Response.json({ approved: true });
});
