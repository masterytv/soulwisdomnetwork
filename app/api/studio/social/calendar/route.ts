// The Social calendar's month (docs/specs/026-social-publishing.md, stage 5): GET ?month=YYYY-MM (Eastern; default
// this month) gives that month's posts, as the calendar shows them; the page lays them out (lib/social/calendar.ts).
import { monthOf, monthRange } from '@/lib/social/calendar';
import { postsBetween } from '@/lib/server/social';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

export const GET = handle(async request => {
    await requireRole(request, STUDIO_ROLES);
    const month = monthOf(new URL(request.url).searchParams.get('month'), Date.now());
    const { from, to } = monthRange(month);
    return Response.json({ month, posts: await postsBetween(from, to) });
});
