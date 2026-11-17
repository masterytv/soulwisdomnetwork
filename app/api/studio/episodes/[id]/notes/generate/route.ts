import { requestNotes } from '@/lib/server/notes';
import { REDRAFT_SCOPES, type RedraftScope } from '@/lib/showNotes';
import { handle, HttpError, requireRole, STUDIO_ROLES } from '@/lib/server/staff';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

// Body: { force?: boolean, instruction?: string, only?: 'all' | 'description' | 'titles' | 'broll' | 'teasers' }.
// `force` replaces approved notes' draft; `instruction` and `only` ask for a redraft of one part.
export const POST = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const { force, instruction, only } = await request.json().catch(() => ({})) as {
        force?: unknown; instruction?: unknown; only?: unknown;
    };
    let onlyValue: RedraftScope = 'all';
    if (only !== undefined) {
        if (!REDRAFT_SCOPES.includes(only as RedraftScope)) throw new HttpError(400, 'Unknown part to draft');
        onlyValue = only as RedraftScope;
    }
    let instructionText = '';
    if (instruction !== undefined && instruction !== null) {
        if (typeof instruction !== 'string' || instruction.length > 1000) throw new HttpError(400, 'The direction must be text of up to 1000 characters');
        instructionText = instruction.trim();
    }
    const redraft = (instructionText || onlyValue !== 'all') ? { instruction: instructionText, only: onlyValue } : null;
    await requestNotes((await params).id, { force: force === true, redraft });
    return Response.json({ started: true });
});
