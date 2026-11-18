// Clips (docs/specs/025-clips.md): the chapters and Claude's suggestions offered as clips, the producer's clips
// with their ends and texts, saved as they go with a version number as Shorts are; the clips job (podcast_clips.yml:
// Claude's suggestions and texts, making the clips, finding their thumbnail moments); the thumbnail as drawn in the
// Studio; and Checkpoint F, the approval of each made clip. Scheduling is stage 4.

import { isAiBroll } from '@/lib/broll';
import { CLIP_DIRECTION_MAX } from '@/lib/clipPicks';
import {
    canMake, chapterSpans, ClipEditSchema, clipRenderInputs, clipShowsBroll, END_WINDOW_MS, MAX_CLIPS, sameClipRender, sentenceBounds,
    withClipDefaults, wordSnap, type ClipEdit,
} from '@/lib/clips';
import { momentInputs, sameMoments } from '@/lib/clipThumbs';
import { THUMB_MAX_BYTES } from '@/lib/thumbnail';
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
// A request that has not finished by now is treated as lost and can be retried: the workflow's own limits are
// 180 minutes for making clips and 45 for the rest.
const staleMs = (job: string | null | undefined) => (job === 'render' ? 200 : 55) * 60_000;

type Mode = 'pick' | 'titles' | 'render' | 'moments';
const MODES: Mode[] = ['pick', 'titles', 'render', 'moments'];
const LABELS: Record<Mode, string> = {
    pick: 'Suggesting clips', titles: "Writing the clips' titles", render: 'Making the clips', moments: 'Finding thumbnail moments',
};

function millis(t: unknown): number | null {
    return t && typeof (t as { toMillis?: unknown }).toMillis === 'function' ? (t as { toMillis: () => number }).toMillis() : null;
}

function busy(c: Episode['clips']) {
    if (c?.status !== 'queued' && c?.status !== 'working') return false;
    const since = Math.max(millis(c.requestedAt) ?? 0, millis(c.startedAt) ?? 0);
    return Date.now() - since < staleMs(c.job);
}

const finalAt = (episode: Episode) => millis(episode.final?.finishedAt) ?? 0;
const renderCurrent = (i: ClipItem, episode: Episode) => !!i.render && sameClipRender(i.render, clipRenderInputs(i, finalAt(episode)));
const approvedNow = (i: ClipItem, episode: Episode) => renderCurrent(i, episode) && i.approved?.renderedAt === i.render?.renderedAt;
const momentsCurrent = (i: ClipItem, episode: Episode) => sameMoments(i.moments?.inputs, momentInputs(withClipDefaults(i), finalAt(episode)));

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
            // A moment the thumbnail uses must be one that was found.
            const thumbMoment = edit.thumbMoment !== null && edit.thumbMoment < (known?.moments?.found.length ?? 0) ? edit.thumbMoment : null;
            return {
                ...known, ...edit, startMs, endMs, synthetic, thumbMoment,
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

// Starts the clips job: { mode: 'pick', direction? } for Claude's suggestions; { mode: 'titles' } for the texts of
// the clips missing any; { mode: 'render' } to make the clips that changed; { mode: 'moments' } to find the
// thumbnail moments of the clips whose moments are missing or stale, or { mode: 'moments', clip, atMs } for one
// frame chosen by hand. Suggestions, texts and moments found by Claude are paid runs, held to the daily limit.
export async function requestClips(id: string, body: { mode?: unknown; direction?: unknown; clip?: unknown; atMs?: unknown }) {
    const mode = body.mode as Mode;
    if (!MODES.includes(mode)) throw new HttpError(400, 'Not a clips job');
    const direction = body.direction;
    if (direction !== undefined && (typeof direction !== 'string' || direction.length > CLIP_DIRECTION_MAX)) {
        throw new HttpError(400, `Keep the direction under ${CLIP_DIRECTION_MAX} characters`);
    }
    const hand = mode === 'moments' && typeof body.clip === 'string'
        ? { clip: body.clip, atMs: Math.round(Number(body.atMs)) } : null;
    if (hand && (!/^[\w-]{4,40}$/.test(hand.clip) || !Number.isFinite(hand.atMs) || hand.atMs < 0)) throw new HttpError(400, 'Which frame?');
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
        const items = clips?.items ?? [];
        if (mode === 'pick') {
            update['clips.direction'] = typeof direction === 'string' ? direction.trim() : '';
        } else if (!items.length) {
            throw new HttpError(409, 'Add some clips first');
        } else if (mode === 'titles') {
            todo = items.filter(needsTexts).length;
            if (!todo) throw new HttpError(409, 'Every clip already has its texts; clear one to have it rewritten');
        } else if (mode === 'render') {
            todo = items.filter(i => !renderCurrent(i, episode) && canMake(i.endMs - i.startMs)).length;
            if (!todo) throw new HttpError(409, 'Every clip is already made');
        } else if (hand) {
            const item = items.find(i => i.id === hand.clip);
            if (!item) throw new HttpError(404, 'No such clip');
            if (hand.atMs < item.startMs || hand.atMs > item.endMs) throw new HttpError(400, 'That frame is not inside the clip');
        } else {
            todo = items.filter(i => i.thumbText.trim() && !momentsCurrent(i, episode)).length;
            if (!todo) throw new HttpError(409, items.some(i => i.thumbText.trim())
                ? 'Every clip already has its moments; change its thumbnail title or feeling to look again'
                : 'Give the clips a thumbnail title first');
        }
        tx.update(ref, update);
    });
    try {
        const cost = mode === 'pick' ? ESTIMATE_USD.clipsPick : mode === 'titles' ? ESTIMATE_USD.clipsTitlesPerClip * todo
            : mode === 'moments' && !hand ? ESTIMATE_USD.clipsMomentsPerClip * todo : 0;
        await withinDailyLimit(LABELS[mode].toLowerCase(), cost, () => startClips(id, mode, hand ? `${hand.clip}@${hand.atMs}` : ''));
    } catch (error) {
        const message = `Could not start the clips job: ${(error as Error).message}`;
        await ref.update({ 'clips.status': 'failed', 'clips.error': message });
        throw new HttpError(502, message);
    }
}

// The thumbnail exactly as drawn in the Studio: `image` is the JPEG, base64. Kept for the upload in stage 4.
export async function saveClipThumbnail(id: string, clipId: string, body: { image?: unknown }) {
    if (!/^[\w-]{4,40}$/.test(clipId)) throw new HttpError(400, 'Which clip?');
    const bytes = typeof body.image === 'string' ? Buffer.from(body.image, 'base64') : Buffer.alloc(0);
    const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!isJpeg) throw new HttpError(400, 'The thumbnail did not come through as a JPEG');
    if (bytes.length > THUMB_MAX_BYTES) throw new HttpError(400, 'The thumbnail is over YouTube\'s 2 MB limit');
    const ref = episodeRef(id);
    const savedAt = Date.now();
    const path = `episodes/${id}/clips/${clipId}-thumb-${savedAt}.jpg`;
    await adminBucket().file(path).save(bytes, { contentType: 'image/jpeg', resumable: false });
    let previous: string | undefined;
    await adminDb().runTransaction(async tx => {
        const clips = ((await tx.get(ref)).data() as Episode | undefined)?.clips;
        const item = clips?.items.find(i => i.id === clipId);
        if (!clips || !item) throw new HttpError(404, 'No such clip');
        previous = item.thumbnail?.path;
        tx.update(ref, {
            'clips.items': clips.items.map(i => (i.id === clipId ? { ...i, thumbnail: { path, savedAt } } : i)),
            updatedAt: FieldValue.serverTimestamp(),
        });
    }).catch(async error => {
        await adminBucket().file(path).delete().catch(() => {});
        throw error;
    });
    if (previous) await adminBucket().file(previous).delete().catch(() => {});
    return { savedAt };
}

// Checkpoint F, one clip at a time: approves the clip as it is made now. It needs a title, a description and a
// saved thumbnail; making the clip again clears it.
export async function approveClip(id: string, body: { item?: unknown; approved?: unknown }, user: { uid: string }) {
    if (typeof body.item !== 'string') throw new HttpError(400, 'Which clip?');
    const ref = episodeRef(id);
    const profile = (await adminDb().collection('users').doc(user.uid).get()).data() ?? {};
    const by = { uid: user.uid, name: (profile.displayName as string) || (profile.email as string) || 'a producer' };
    await adminDb().runTransaction(async tx => {
        const episode = (await tx.get(ref)).data() as Episode | undefined;
        const clips = episode?.clips;
        const item = clips?.items.find(i => i.id === body.item);
        if (!episode || !clips || !item) throw new HttpError(404, 'No such clip');
        if (body.approved) {
            if (!renderCurrent(item, episode)) throw new HttpError(409, 'Make this clip again first; it changed since it was made');
            if (!item.title.trim() || !item.description.trim()) throw new HttpError(409, 'Give the clip a YouTube title and description first');
            if (!item.thumbnail) throw new HttpError(409, 'Save its thumbnail first');
        }
        const approval = body.approved ? { by, at: Date.now(), renderedAt: item.render!.renderedAt } : null;
        tx.update(ref, {
            'clips.items': clips.items.map(i => (i.id === item.id ? { ...i, approved: approval } : i)),
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}

// One of a clip's images for the Studio to draw with: a moment's frame or cut-out, or the saved thumbnail.
export async function getClipImage(id: string, clipId: string, name: string) {
    const snap = await episodeRef(id).get();
    const item = (snap.data() as Episode | undefined)?.clips?.items.find(i => i.id === clipId);
    if (!item) throw new HttpError(404, 'No such clip');
    const m = /^(frame|cutout)-(\d{1,2})$/.exec(name);
    const moment = m ? item.moments?.found[Number(m[2])] : undefined;
    const path = name === 'thumbnail' ? item.thumbnail?.path : m?.[1] === 'frame' ? moment?.framePath : m?.[1] === 'cutout' ? moment?.cutoutPath : undefined;
    if (!path) throw new HttpError(404, 'No such image');
    const [bytes] = await adminBucket().file(path).download();
    return { bytes, contentType: path.endsWith('.png') ? 'image/png' : 'image/jpeg' };
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
        finalAt: finalAt(episode),
        finalUrl,
        durationMs,
        chapters: blocker ? [] : chapterSpans(episode.final?.chapters ?? [], durationMs),
        items: await Promise.all((clips?.items ?? []).map(async raw => {
            const i = withClipDefaults(raw);
            return {
                id: i.id, source: i.source, startMs: i.startMs, endMs: i.endMs, title: i.title, description: i.description,
                thumbText: i.thumbText, thumbFeeling: i.thumbFeeling, thumbSpeaker: i.thumbSpeaker, thumbMoment: i.thumbMoment,
                thumbBackground: i.thumbBackground, synthetic: i.synthetic,
                startWords: wordsBetween(words, i.startMs - END_WINDOW_MS, i.startMs + END_WINDOW_MS),
                endWords: wordsBetween(words, i.endMs - END_WINDOW_MS, i.endMs + END_WINDOW_MS),
                render: i.render ? {
                    key: String(i.render.renderedAt), url: await signed(i.render.path), durationMs: i.render.durationMs,
                    inputs: { version: i.render.version, startMs: i.render.startMs, endMs: i.render.endMs, finalAt: i.render.finalAt },
                } : null,
                moments: i.moments ? {
                    key: String(i.moments.madeAt), inputs: i.moments.inputs, speakers: i.moments.speakers,
                    found: i.moments.found.map(m => ({
                        atMs: m.atMs, emotion: m.emotion, expression: m.expression, fit: m.fit, side: m.side, cue: m.cue,
                        chosenByHand: !!m.chosenByHand, cutout: !!m.cutoutPath,
                    })),
                } : null,
                thumbnail: i.thumbnail ? { key: String(i.thumbnail.savedAt) } : null,
                approved: approvedNow(raw, episode) && i.approved ? { by: i.approved.by.name, at: i.approved.at } : null,
            };
        })),
    };
}
