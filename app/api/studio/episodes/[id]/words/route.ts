import { fixWords } from '@/lib/server/review';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

// Body: { ops }. Words corrected in the editor (spec 019 item 2.3), saved with the speaker review
// corrections and published to the accepted transcript.
export const POST = handle<Context>(async (request, { params }) => {
    const user = await requireRole(request, STUDIO_ROLES);
    const { ops } = await request.json().catch(() => ({})) as { ops?: unknown };
    return Response.json(await fixWords((await params).id, ops, user));
});
