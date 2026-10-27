// Why: the API route for highlight suggestions (spec 021 item M4): GET reads the run's state (the
// suggestions themselves land on the edit), POST starts a new run.

import { getHighlights, requestHighlights } from '@/lib/server/claudeEdits';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json(await getHighlights((await params).id));
});

export const POST = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    await requestHighlights((await params).id);
    return Response.json({ started: true });
});
