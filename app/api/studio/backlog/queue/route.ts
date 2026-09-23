import { queueFromBacklog } from '@/lib/server/pipeline';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

// Body: { fileId?: string }. Without one, queues the top of the backlog.
export const POST = handle(async request => {
    await requireRole(request, STUDIO_ROLES);
    const { fileId } = await request.json().catch(() => ({})) as { fileId?: string };
    const video = await queueFromBacklog(typeof fileId === 'string' ? fileId : undefined);
    return Response.json({ queued: video });
});
