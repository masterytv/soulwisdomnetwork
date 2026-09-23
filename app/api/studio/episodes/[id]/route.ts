import { getReview } from '@/lib/server/review';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

// The transcript, detected voices, saved corrections and a video link for the review page.
export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json(await getReview((await params).id));
});
