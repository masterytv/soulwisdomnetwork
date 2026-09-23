// Changes a member's role. Only admins; members cannot change roles themselves
// (firestore.rules), so this goes through the Admin SDK.

import type { UserRole } from '@/types/user';
import { adminDb } from '@/lib/server/firebaseAdmin';
import { handle, HttpError, requireRole } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

const ROLES: UserRole[] = ['user', 'producer', 'admin'];

export const POST = handle(async request => {
    const caller = await requireRole(request, ['admin']);
    const { uid, role } = await request.json() as { uid?: string; role?: UserRole };

    if (!uid || !role || !ROLES.includes(role)) throw new HttpError(400, 'Choose a member and a role');
    if (uid === caller.uid) throw new HttpError(400, 'You cannot change your own role');

    const ref = adminDb().collection('users').doc(uid);
    if (!(await ref.get()).exists) throw new HttpError(404, 'Member not found');
    await ref.update({ role });
    return Response.json({ uid, role });
});
