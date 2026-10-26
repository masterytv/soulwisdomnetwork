// The graphics templates' files on disk (docs/specs/021-motion-graphics.md, item M1), for the renderer
// (render.ts) and for the editor's template route (app/api/studio/graphics/[template]). A template is a
// plain HTML page beside this file; its fonts are the repository's own (agent/assets/fonts, and the site's
// Outfit in app/fonts), never the network. Paths resolve from the repository root, which is where the
// render job, the tests and the Next server all run.

import * as fs from 'fs';
import * as path from 'path';
import type { GraphicTemplate } from '../../../../lib/graphics';

const root = () => process.cwd();
const TEMPLATES_DIR = 'agent/src/podcast/graphics/templates';

// The font files a template may name as url('fonts/<name>'): the variable fonts' Latin files, as the
// site itself loads them (app/fonts/README.md; Cinzel is in agent/assets/fonts with its OFL licence).
export const FONT_FILES: Record<string, string> = {
    'Cinzel-latin.woff2': 'agent/assets/fonts/Cinzel-latin.woff2',
    'Outfit-latin.woff2': 'app/fonts/Outfit-latin.woff2',
};

export function templateHtml(template: GraphicTemplate): string {
    return fs.readFileSync(path.join(root(), TEMPLATES_DIR, `${template}.html`), 'utf8');
}

export function runtimeJs(): string {
    return fs.readFileSync(path.join(root(), TEMPLATES_DIR, 'runtime.js'), 'utf8');
}

export function fontFile(name: string): Buffer | null {
    const file = FONT_FILES[name];
    return file ? fs.readFileSync(path.join(root(), file)) : null;
}

// The template as one self-contained document for the editor's sandboxed iframe: the runtime script and
// the fonts inlined, so the page needs nothing the browser would have to fetch (and no route has to serve
// fonts to an iframe with no sign-in headers).
export function browserTemplate(template: GraphicTemplate): string {
    let html = templateHtml(template).replace(
        '<script src="runtime.js"></script>',
        () => `<script>\n${runtimeJs()}\n</script>`,
    );
    for (const name of Object.keys(FONT_FILES)) {
        html = html.split(`url('fonts/${name}')`).join(`url('data:font/woff2;base64,${fontFile(name)!.toString('base64')}')`);
    }
    return html;
}
