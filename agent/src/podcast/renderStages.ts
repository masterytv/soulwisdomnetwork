// Where a render has got to (Tom, 10 November 2026: a 12-minute episode's first render took 34 minutes and the Studio said
// only "Rendering the edit…"). The render job names each stage as it starts ("Motion graphics", "Encoding the video"),
// with a count where it has one; this writes it to the episode as `editRender.stage` for the Studio to show, at most
// every few seconds, and logs each stage with the time it started and, at the end, how long each one took.
// Run: npx tsx --test agent/src/podcast/renderStages.test.ts

import { mmss } from '../../../lib/showNotes';

export interface RenderStage { label: string; done: number | null; total: number | null }

// How often a count is written while a stage runs; a new stage, and a stage's last step, are written straight away.
export const STAGE_WRITE_MS = 5000;

export function stageClock(write: (stage: RenderStage) => Promise<void>, now: () => number = Date.now, log: (line: string) => void = console.log) {
    const begun = now();
    const times: { label: string; ms: number }[] = [];
    let current: { label: string; at: number } | null = null;
    let lastWrite = -Infinity;
    // Writes go one after another, so the Studio never sees an older count after a newer one.
    let chain: Promise<void> = Promise.resolve();
    const send = (s: RenderStage) => { chain = chain.then(() => write(s)).catch(() => {}); };
    const close = (t: number) => {
        if (current) times.push({ label: current.label, ms: t - current.at });
        current = null;
    };
    return {
        stage(label: string, done?: number, total?: number) {
            const t = now();
            if (current?.label !== label) {
                close(t);
                log(`⏱️ ${mmss(t - begun)} ${label}${total ? ` (${total})` : ''}`);
                current = { label, at: t };
                lastWrite = -Infinity;
            }
            const last = done !== undefined && done === total;
            if (!last && t - lastWrite < STAGE_WRITE_MS) return;
            lastWrite = t;
            send({ label, done: done ?? null, total: total ?? null });
        },
        // Each stage and how long it took, in one line for the log; ends the last stage.
        summary(): string {
            close(now());
            return times.map(s => `${s.label} ${mmss(s.ms)}`).join(' · ');
        },
        // Every write sent so far has been made (or has failed quietly).
        flushed: () => chain,
    };
}

export type StageClock = ReturnType<typeof stageClock>;
