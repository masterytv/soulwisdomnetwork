// Clips (docs/specs/025-clips.md), stage 1: the chapters offered as clips, and the producer's clips with
// their ends, title, description and thumbnail title, saved as they go with a version number, as Shorts
// are. No job yet: Claude's picks and titles, making, the thumbnail and scheduling are later stages.

import { isAiBroll } from '@/lib/broll';
import {
    canMake, chapterSpans, ClipEditSchema, clipShowsBroll, END_WINDOW_MS, MAX_CLIPS, sentenceBounds, wordSnap, type ClipEdit,
} from '@/lib/clips';
import { finalIsCurrent } from '@/lib/finalCut';
import { wordsBetween } from '@/lib/shorts';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { Episode, ClipItem } from '@/types/episode';
import type { ClipsView } from '@/types/studio';
import { adminBucket, adminDb } from './firebaseAdmin';
import { finalWords } from './shorts';
import { HttpError } from './staff';

const LINK_MS = 3 * 60 * 60_000;

function episodeRef(id: string) {
    if (!/^[\w-]{10,}$/.test(id)) throw new HttpError(400, 'Not a valid episode ID');
    return adminDb().collection('episodes').doc(id);
}

// Clips come from a final cut that matches the approved notes, whose chapters they start from.
function finalProblem(episode: Episode) {
    const f = episode.final;
    if (episode.notes?.status !== 'approved') return 'Approve the show notes first';
    if (f?.status !== 'ready' || !f.wordsPath) return 'Get the final cut first';
    if (!finalIsCurrent(episode)) return 'The final cut is out of date; get it again first';
    return null;
}

const durationOf = (episode: Episode) => Math.round((episode.final?.durationSeconds ?? 0) * 1000);

const SaveSchema = z.object({
    version: z.number().int().min(0),
    items: z.array(ClipEditSchema).max(MAX_CLIPS),
});

// The producer's clips. A clip new to this save has its ends snapped: to whole sentences when it came from
// chapters (their times rarely fall on a word), to whole words when it was marked by hand. After that, ends
// are where the producer clicked them.
export async function saveClips(id: string, body: unknown) {
    const parsed = SaveSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'The clips did not come through in the expected shape');
    const { version, items } = parsed.data;
    if (new Set(items.map(i => i.id)).size !== items.length) throw new HttpError(400, 'Two clips have the same ID');
    const ref = episodeRef(id);
    // The words are read outside the transaction (Storage), from the final cut the episode has now.
    const before = (await ref.get()).data() as Episode | undefined;
    if (!before) throw new HttpError(404, 'Episode not found');
    const problem = finalProblem(before);
    if (problem) throw new HttpError(409, problem);
    const words = await finalWords(before);
    return adminDb().runTransaction(async tx => {
        const episode = (await tx.get(ref)).data() as Episode | undefined;
        if (!episode) throw new HttpError(404, 'Episode not found');
        const now = finalProblem(episode);
        if (now) throw new HttpError(409, now);
        if (!sameTime(episode.final?.finishedAt, before.final?.finishedAt)) {
            throw new HttpError(409, 'The final cut changed while saving. Reload the page.');
        }
        const clips = episode.clips;
        if ((clips?.version ?? 0) !== version) throw new HttpError(409, 'The clips were changed elsewhere. Reload the page.');
        const durationMs = durationOf(episode);
        const chapters = episode.final?.chapters ?? [];
        const spans = chapterSpans(chapters, durationMs);
        const old = new Map((clips?.items ?? []).map(i => [i.id, i]));
        const broll = Object.values(episode.broll?.images ?? {}).filter(isAiBroll);
        const next: ClipItem[] = items.map(edit => {
            const known = old.get(edit.id);
            let { startMs, endMs } = edit;
            if (!known) {
                if (edit.source.kind === 'chapter' && !spans[edit.source.index + edit.source.count - 1]) throw new HttpError(400, 'There is no such chapter');
                const snapped = edit.source.kind === 'chapter' ? sentenceBounds(words, startMs, endMs) : wordSnap(words, startMs, endMs);
                if (snapped) ({ startMs, endMs } = snapped);
            }
            const name = edit.title || `the clip at ${Math.floor(startMs / 60_000)}:${String(Math.floor(startMs / 1000) % 60).padStart(2, '0')}`;
            if (endMs > durationMs + 1000) throw new HttpError(400, `"${name}" runs past the end of the episode`);
            if (!canMake(endMs - startMs)) throw new HttpError(400, `"${name}" must be 2 to 20 minutes long`);
            if (/[<>]/.test(edit.title) || /[<>]/.test(edit.description)) throw new HttpError(400, 'YouTube does not allow < or > in titles and descriptions');
            // A new clip is flagged when AI b-roll may show in it; the producer can untick it.
            const synthetic = edit.synthetic || (!known && clipShowsBroll(broll, chapters, startMs, endMs));
            return {
                ...known, ...edit, startMs, endMs, synthetic,
                title: edit.title.replace(/\s+/g, ' '), thumbText: edit.thumbText.replace(/\s+/g, ' '),
            } satisfies ClipEdit;
        });
        const nextVersion = version + 1;
        tx.update(ref, {
            ...(clips ? {} : { 'clips.status': 'ready', 'clips.job': null }),
            'clips.items': next, 'clips.version': nextVersion,
            updatedAt: FieldValue.serverTimestamp(),
        });
        return nextVersion;
    });
}

function sameTime(a: unknown, b: unknown) {
    const ms = (t: unknown) => (t && typeof (t as { toMillis?: unknown }).toMillis === 'function' ? (t as { toMillis: () => number }).toMillis() : t);
    return ms(a) === ms(b);
}

const signed = (path: string) => adminBucket().file(path).getSignedUrl({ action: 'read', expires: Date.now() + LINK_MS }).then(([url]) => url);

export async function getClips(id: string): Promise<ClipsView> {
    const snap = await episodeRef(id).get();
    if (!snap.exists) throw new HttpError(404, 'Episode not found');
    const episode = snap.data() as Episode;
    const blocker = finalProblem(episode);
    const durationMs = durationOf(episode);
    const [words, finalUrl] = await Promise.all([
        blocker ? Promise.resolve([]) : finalWords(episode),
        !blocker && episode.final?.videoPath ? signed(episode.final.videoPath) : Promise.resolve(null),
    ]);
    const clips = episode.clips;
    return {
        blocker,
        version: clips?.version ?? 0,
        finalUrl,
        durationMs,
        chapters: blocker ? [] : chapterSpans(episode.final?.chapters ?? [], durationMs),
        items: (clips?.items ?? []).map(i => ({
            id: i.id, source: i.source, startMs: i.startMs, endMs: i.endMs, title: i.title, description: i.description,
            thumbText: i.thumbText, synthetic: i.synthetic,
            startWords: wordsBetween(words, i.startMs - END_WINDOW_MS, i.startMs + END_WINDOW_MS),
            endWords: wordsBetween(words, i.endMs - END_WINDOW_MS, i.endMs + END_WINDOW_MS),
        })),
    };
}
