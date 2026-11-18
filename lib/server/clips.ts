// Clips (docs/specs/025-clips.md): the chapters and Claude's suggestions offered as clips, the producer's clips
// with their ends and texts, saved as they go with a version number as Shorts are, and the clips job (Claude's
// suggestions and texts; podcast_clips.yml). Making, the thumbnail and scheduling are later stages.

import { isAiBroll } from '@/lib/broll';
import { CLIP_DIRECTION_MAX } from '@/lib/clipPicks';
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
import { startClips } from './github';
import { finalWords } from './shorts';
import { ESTIMATE_USD, withinDailyLimit } from './spending';
import { HttpError } from './staff';

const LINK_MS = 3 * 60 * 60_000;
// A request that has not finished by now is treated as lost and can be retried.
const STALE_MS = 40 * 60_000;       // the workflow's own limit is 30 minutes

type Mode = 'pick' | 'titles';
const LABELS: Record<Mode, string> = { pick: 'Suggesting clips', titles: "Writing the clips' titles" };

function millis(t: unknown): number | null {
    return t && typeof (t as { toMillis?: unknown }).toMillis === 'function' ? (t as { toMillis: () => number }).toMillis() : null;
}

function busy(c: Episode['clips']) {
    if (c?.status !== 'queued' && c?.status !== 'working') return false;
    const since = Math.max(millis(c.requestedAt) ?? 0, millis(c.startedAt) ?? 0);
    return Date.now() - since < STALE_MS;
}

const needsTexts = (i: ClipItem) => !i.title.trim() || !i.description.trim() || !i.thumbText.trim() || !i.thumbFeeling?.length;

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
        if ((clips?.version ?? 0) !== version) throw new HttpError(409, 'The clips were changed elsewhere (or Claude just wrote their texts). Reload the page.');
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
            ...(clips?.status ? {} : { 'clips.status': 'ready', 'clips.job': null }),
            'clips.items': next, 'clips.version': nextVersion,
            updatedAt: FieldValue.serverTimestamp(),
        });
        return nextVersion;
    });
}

// Starts the clips job: { mode: 'pick', direction? } for Claude's suggestions, or { mode: 'titles' } for the
// texts of the clips missing any. Both are paid runs, held to the daily spending limit.
export async function requestClips(id: string, body: { mode?: unknown; direction?: unknown }) {
    const mode = body.mode as Mode;
    if (mode !== 'pick' && mode !== 'titles') throw new HttpError(400, 'Not a clips job');
    const direction = body.direction;
    if (direction !== undefined && (typeof direction !== 'string' || direction.length > CLIP_DIRECTION_MAX)) {
        throw new HttpError(400, `Keep the direction under ${CLIP_DIRECTION_MAX} characters`);
    }
    const ref = episodeRef(id);
    let todo = 0;
    await adminDb().runTransaction(async tx => {
        const episode = (await tx.get(ref)).data() as Episode | undefined;
        if (!episode) throw new HttpError(404, 'Episode not found');
        const problem = finalProblem(episode);
        if (problem) throw new HttpError(409, problem);
        const clips = episode.clips;
        if (busy(clips)) throw new HttpError(409, 'The clips job is already running');
        const update: Record<string, unknown> = {
            'clips.status': 'queued', 'clips.job': mode, 'clips.requestedAt': FieldValue.serverTimestamp(), 'clips.error': null,
            updatedAt: FieldValue.serverTimestamp(),
        };
        if (!clips) Object.assign(update, { 'clips.items': [], 'clips.version': 0 });
        if (mode === 'pick') {
            update['clips.direction'] = typeof direction === 'string' ? direction.trim() : '';
        } else {
            todo = (clips?.items ?? []).filter(needsTexts).length;
            if (!clips?.items.length) throw new HttpError(409, 'Add some clips first');
            if (!todo) throw new HttpError(409, 'Every clip already has its texts; clear one to have it rewritten');
        }
        tx.update(ref, update);
    });
    try {
        const cost = mode === 'pick' ? ESTIMATE_USD.clipsPick : ESTIMATE_USD.clipsTitlesPerClip * todo;
        await withinDailyLimit(mode === 'pick' ? 'clips suggestions' : 'clips titles', cost, () => startClips(id, mode));
    } catch (error) {
        const message = `Could not start the clips job: ${(error as Error).message}`;
        await ref.update({ 'clips.status': 'failed', 'clips.error': message });
        throw new HttpError(502, message);
    }
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
    const lost = (clips?.status === 'queued' || clips?.status === 'working') && !busy(clips);
    const job = clips?.job ?? null;
    return {
        // A request whose run died reads as failed, so the page offers a retry.
        status: lost ? 'failed' : clips?.status ?? null,
        job,
        error: clips?.error ?? (lost ? `${(job && LABELS[job]) || 'The clips job'} did not finish. Check the Podcast Clips run in GitHub Actions, then try again.` : null),
        finishedAt: millis(clips?.finishedAt),
        warnings: clips?.status === 'ready' ? clips.warnings ?? [] : [],
        suggestions: blocker ? [] : clips?.suggestions ?? [],
        direction: clips?.direction ?? '',
        blocker,
        version: clips?.version ?? 0,
        finalUrl,
        durationMs,
        chapters: blocker ? [] : chapterSpans(episode.final?.chapters ?? [], durationMs),
        items: (clips?.items ?? []).map(i => ({
            id: i.id, source: i.source, startMs: i.startMs, endMs: i.endMs, title: i.title, description: i.description,
            thumbText: i.thumbText, thumbFeeling: i.thumbFeeling ?? [], synthetic: i.synthetic,
            startWords: wordsBetween(words, i.startMs - END_WINDOW_MS, i.startMs + END_WINDOW_MS),
            endWords: wordsBetween(words, i.endMs - END_WINDOW_MS, i.endMs + END_WINDOW_MS),
        })),
    };
}
