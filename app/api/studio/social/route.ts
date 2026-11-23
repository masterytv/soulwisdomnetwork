// The Social page's posts (docs/specs/026-social-publishing.md): ahead, and the last 14 days.
import { listPosts } from '@/lib/server/social';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

export const GET = handle(async request => {
    await requireRole(request, STUDIO_ROLES);
    return Response.json(await listPosts());
});
