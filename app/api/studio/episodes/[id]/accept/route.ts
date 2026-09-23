import { acceptReview } from '@/lib/server/review';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

// Body: { version }. Accepts the saved corrections as the episode's transcript.
export const POST = handle<Context>(async (request, { params }) => {
    const user = await requireRole(request, STUDIO_ROLES);
    const { version } = await request.json().catch(() => ({})) as { version?: unknown };
    return Response.json(await acceptReview((await params).id, version, user));
});
