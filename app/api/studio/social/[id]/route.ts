// One post on the Social page (docs/specs/026-social-publishing.md): { action: 'post' | 'hold' | 'cancel' } as POST,
// its words as PATCH ({ instagramCaption?, facebookTitle?, facebookDescription? }).
import { act, editPost } from '@/lib/server/social';
import { adminDb } from '@/lib/server/firebaseAdmin';
import { handle, HttpError, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const POST = handle<Context>(async (request, { params }) => {
    const user = await requireRole(request, STUDIO_ROLES);
    const body = (await request.json().catch(() => null)) ?? {};
    if (!['post', 'hold', 'cancel'].includes(body.action)) throw new HttpError(400, 'Post, Hold or Cancel');
    const profile = await adminDb().collection('users').doc(user.uid).get();
    await act((await params).id, body.action, (profile.get('displayName') as string | undefined) || 'a producer');
    return Response.json({ done: true });
});

export const PATCH = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Send the words to change');
    await editPost((await params).id, body as Record<string, unknown>);
    return Response.json({ done: true });
});
