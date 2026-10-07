// Why: the edit is made with the b-roll in it, so it waits for the b-roll images. Building the edit package
// and editing (the Studio editor, and the edit on the show notes page) are held until every approved b-roll
// idea has its image, or the producer chose to skip b-roll. An episode whose edit or edit package already
// exists is not held, so work in progress never gets stuck. Shared by the edit and package routes, the
// Studio's progress and the pages.

import type { Episode } from '../types/episode';
import { toMs } from './episodeReset';

// A b-roll run that has not finished by now is taken as lost (as lib/server/broll.ts does).
const BROLL_STALE_MS = 40 * 60_000;

// Why editing and the edit package are held, or null when they are not.
export function brollBlock(e: Episode, now = Date.now()): string | null {
    if (e.edit || e.package || e.brollSkipped) return null;
    if (e.notes?.status !== 'approved') return 'Approve the show notes, then make or skip the b-roll images first.';
    const ideas = e.notes.approved?.broll ?? [];
    if (!ideas.length) return null;
    const b = e.broll;
    if ((b?.status === 'queued' || b?.status === 'generating') && now - Math.max(toMs(b.requestedAt), toMs(b.startedAt)) < BROLL_STALE_MS) {
        return 'The b-roll images are still being made. Editing opens when they are done.';
    }
    const missing = ideas.filter((idea, i) => {
        const image = b?.images?.[i];
        return !image || image.idea !== idea.idea.trim() || (image.style ?? 'photo') !== (idea.style ?? 'photo');
    }).length;
    if (!missing) return null;
    const which = ideas.length === 1 ? 'The b-roll idea has' : `${missing} of ${ideas.length} b-roll ideas ${missing === 1 ? 'has' : 'have'}`;
    return `${which} no image yet. Make the images, or skip b-roll, first.`;
}
