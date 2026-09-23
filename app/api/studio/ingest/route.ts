import { startIngest } from '@/lib/server/github';
import { handle, HttpError, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

// Body: { retryFileId?: string }. Always skips the 15-minute upload wait: whoever presses
// the button has just put the file there on purpose.
export const POST = handle(async request => {
    await requireRole(request, STUDIO_ROLES);
    const { retryFileId } = await request.json().catch(() => ({})) as { retryFileId?: string };
    if (retryFileId !== undefined && (typeof retryFileId !== 'string' || !/^[\w-]{10,}$/.test(retryFileId))) {
        throw new HttpError(400, 'Not a valid file ID');
    }
    await startIngest({ skip_wait: true, ...(retryFileId ? { retry_file_id: retryFileId } : {}) });
    return Response.json({ started: true });
});
