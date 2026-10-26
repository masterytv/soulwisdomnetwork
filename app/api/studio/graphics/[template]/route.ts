// The motion graphics templates for the editor's preview (docs/specs/021-motion-graphics.md, item M1):
// the same HTML page the render draws (agent/src/podcast/graphics/templates/), with its runtime script
// and local fonts inlined, so the editor can put it straight into a sandboxed iframe
// (components/studio/graphics.tsx) with nothing left for the iframe to fetch. The page itself holds no
// episode data — the editor writes window.GRAPHIC into the document it mounts (lib/graphics.ts
// graphicSrcDoc) — but like every API route it answers staff only (CLAUDE.md: requireRole on every route).

import { handle, HttpError, requireRole, STUDIO_ROLES } from '@/lib/server/staff';
import { GRAPHIC_TEMPLATE_IDS, type GraphicTemplate } from '@/lib/graphics';
import { browserTemplate } from '@/agent/src/podcast/graphics/files';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ template: string }> };

export const GET = handle<Context>(async (request, { params }) => {
    await requireRole(request, STUDIO_ROLES);
    const { template } = await params;
    if (!GRAPHIC_TEMPLATE_IDS.includes(template as GraphicTemplate)) throw new HttpError(404, 'No such template');
    return Response.json({ html: browserTemplate(template as GraphicTemplate) });
});
