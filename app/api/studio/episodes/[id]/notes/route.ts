import { getNotes, saveNotes } from '@/lib/server/notes';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

// The show notes and their state, for the Checkpoint B page.
export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json(await getNotes((await params).id));
});

// Body: { notes, version }. Replaces the draft; returns the new version.
export const PUT = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const body = await request.json().catch(() => ({})) as { notes?: unknown; version?: unknown };
    const version = await saveNotes((await params).id, body.notes, body.version);
    return Response.json({ version });
});
