import { requestNotes } from '@/lib/server/notes';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

// Body: { force?: boolean }. Drafts show notes again; `force` replaces approved notes' draft.
export const POST = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const { force } = await request.json().catch(() => ({})) as { force?: unknown };
    await requestNotes((await params).id, { force: force === true });
    return Response.json({ started: true });
});
