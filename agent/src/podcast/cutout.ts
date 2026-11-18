// The hosts cut out of the thumbnail frames (docs/specs/011-thumbnails.md), for the "Host over AI
// image" option: runs cutout.py (rembg) once over all the frames, so its model loads once.
// Cut-outs are a bonus: anything that goes wrong here costs only that option, never the run.

import * as path from 'path';
import { runWithLog } from './media';

// The venv's python, made by podcast_thumbnails.yml from agent/requirements-cutout.txt.
const python = () => process.env.CUTOUT_PYTHON || 'python3';
const SCRIPT = path.join(__dirname, 'cutout.py');
// The model loads in seconds and each frame takes under one; this only stops a stuck run.
const TIMEOUT_MS = 5 * 60_000;

export interface CutoutLine {
    in: string;
    ok: boolean;
    box?: [number, number, number, number];
    share?: number;
    reason?: string;
}

// cutout.py's JSON lines, by input path; anything else it printed is ignored.
export function parseCutoutLines(stdout: string): Map<string, CutoutLine> {
    const out = new Map<string, CutoutLine>();
    for (const line of stdout.split('\n')) {
        try {
            const parsed = JSON.parse(line) as CutoutLine;
            if (parsed && typeof parsed.in === 'string' && typeof parsed.ok === 'boolean') out.set(parsed.in, parsed);
        } catch {
            // not one of its lines
        }
    }
    return out;
}

// What cutout.py said about each input (with the cut-out's box, for its size), by input path. Never throws:
// an empty map when rembg could not run at all.
export async function cutOutWithBoxes(pairs: { input: string; output: string }[]): Promise<Map<string, CutoutLine>> {
    if (!pairs.length) return new Map();
    try {
        const { stdout } = await runWithLog(python(), ['-I', SCRIPT, ...pairs.flatMap(p => [p.input, p.output])], TIMEOUT_MS);
        return parseCutoutLines(stdout);
    } catch (error) {
        console.warn(`  ⚠️ No cut-outs: ${(error as Error).message}`);
        return new Map();
    }
}

// Returns the outputs that were made, by input path. Never throws.
export async function cutOutPeople(pairs: { input: string; output: string }[]): Promise<Set<string>> {
    if (!pairs.length) return new Set();
    try {
        const { stdout } = await runWithLog(python(), ['-I', SCRIPT, ...pairs.flatMap(p => [p.input, p.output])], TIMEOUT_MS);
        const lines = parseCutoutLines(stdout);
        const made = new Set<string>();
        for (const p of pairs) {
            const line = lines.get(p.input);
            if (line?.ok) made.add(p.input);
            else console.warn(`  ⚠️ No cut-out for ${path.basename(p.input)}: ${line?.reason ?? 'not reported'}`);
        }
        return made;
    } catch (error) {
        console.warn(`  ⚠️ No cut-outs (the "Host over AI image" option is left out): ${(error as Error).message}`);
        return new Set();
    }
}
