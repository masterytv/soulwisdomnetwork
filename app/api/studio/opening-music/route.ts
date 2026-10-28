// The music the last opening was built with (spec 022 stage 3b), which Build the opening picks next: POST { music },
// a show library music file with its licence checked, or null for none. Everyone in the Studio may build an opening.
import { rememberOpeningMusic } from '@/lib/server/studioSettings';
import { handle, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

export const POST = handle(async request => {
    await requireRole(request, STUDIO_ROLES);
    const body = await request.json().catch(() => ({})) as { music?: unknown };
    return Response.json({ music: await rememberOpeningMusic(body.music ?? null) });
});
