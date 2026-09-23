import { saveCorrections } from '@/lib/server/review';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

// Body: { corrections, version }. Replaces the saved corrections; returns the new version.
export const PUT = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const body = await request.json().catch(() => ({})) as { corrections?: unknown; version?: unknown };
    const version = await saveCorrections((await params).id, body.corrections, body.version);
    return Response.json({ version });
});
