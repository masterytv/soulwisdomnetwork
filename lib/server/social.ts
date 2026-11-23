// The Studio's Social page (docs/specs/026-social-publishing.md): the posts, ahead and the last 14 days, and the
// producers' buttons. Posts are made and handed over by the social job (agent/src/social/run.ts); here they are read,
// their words changed, held, cancelled, or sent with Post. Hold, Cancel and Edit act on Upload-Post at once
// (UPLOAD_POST_API_KEY in Secret Manager); Post starts the job (social.yml, mode send), which hands the post over.

import {
    actionsFor, canEdit, editableFields, KIND_LABELS, type CarouselContent, type EditableField, type ImageContent, type ReelContent, type SocialAction,
    type SocialPost,
} from '@/lib/social/plan';
import { INSTAGRAM_CAPTION_MAX, FACEBOOK_TITLE_MAX } from '@/lib/social/captions';
import type { CalendarPost } from '@/lib/social/calendar';
import { cancelScheduled, CHANGING_SETTINGS, configFrom, FIELD_NAMES, missingSettings, patchScheduled, UploadPostError } from '@/lib/social/uploadPost';
import { hasLimitedWords } from '@/lib/social/limitedWords';
import { adminBucket, adminDb } from './firebaseAdmin';
import { startSocial } from './github';
import { HttpError } from './staff';

const posts = () => adminDb().collection('social_posts');
const DAY_MS = 24 * 60 * 60_000;
const LINK_MS = 60 * 60_000;
const PAST_DAYS = 14;

export interface PostView extends SocialPost {
    id: string;
    actions: SocialAction[];
    editable: { key: EditableField; label: string }[];
    pictures: string[];             // signed links to show the cover or cards
}

const signed = (file: string) => adminBucket().file(file).getSignedUrl({ action: 'read', expires: Date.now() + LINK_MS }).then(([u]) => u).catch(() => '');

async function view(id: string, post: SocialPost, now: number): Promise<PostView> {
    const c = (post.content ?? {}) as Partial<ReelContent & ImageContent & CarouselContent>;
    const files = (post.kind === 'carousel' ? (c.slides ?? []).map(sl => sl.path) : [post.kind === 'reel' ? c.coverPath : c.cardPath])
        .filter((f): f is string => !!f);
    return {
        ...post, id,
        actions: actionsFor(post, now),
        editable: canEdit(post, now) ? editableFields(post.kind) : [],
        pictures: (await Promise.all(files.map(signed))).filter(Boolean),
    };
}

// Everything ahead, soonest first, and the last 14 days, newest first. Two reads, so a long plan ahead never pushes the
// near posts out of a limit. One field, so no composite index.
export async function listPosts(now = Date.now()) {
    const [ahead, past] = await Promise.all([
        posts().where('postAt', '>=', now).orderBy('postAt').limit(500).get(),
        posts().where('postAt', '>=', now - PAST_DAYS * DAY_MS).where('postAt', '<', now).orderBy('postAt', 'desc').limit(300).get(),
    ]);
    const all = await Promise.all([...ahead.docs, ...past.docs].map(d => view(d.id, d.data() as SocialPost, now)));
    // Waiting or held posts whose time passed still need the producer, so they stay with what's ahead.
    const isAhead = (p: PostView) => p.postAt >= now || p.status === 'waiting' || p.status === 'held';
    return {
        ahead: all.filter(isAhead).sort((a, b) => a.postAt - b.postAt),
        past: all.filter(p => !isAhead(p)),
        setup: missingSettings(process.env, CHANGING_SETTINGS),
    };
}

async function load(id: string) {
    if (!/^[\w-]{10,}_[\w-]{4,40}_(reel|image|carousel)$/.test(id)) throw new HttpError(400, 'Not a post');
    const ref = posts().doc(id);
    const post = (await ref.get()).data() as SocialPost | undefined;
    if (!post) throw new HttpError(404, 'No such post');
    return { ref, post };
}

// The Studio only cancels and changes posts at Upload-Post (the job hands them over), so it needs the key alone.
function settingsOrRefuse() {
    const missing = missingSettings(process.env, CHANGING_SETTINGS);
    if (missing.length) throw new HttpError(409, `Posting is not set up yet: add ${missing.join(', ')} in Secret Manager (docs/specs/026-social-publishing.md)`);
    return configFrom(process.env, CHANGING_SETTINGS);
}

function uploadPostRefusal(error: unknown): never {
    if (error instanceof UploadPostError) {
        if (error.status === 409) throw new HttpError(409, 'Upload-Post is already posting it: too late to change');
        throw new HttpError(502, error.message);
    }
    throw error;
}

// Post (hand it over now, or at its time), Hold (take it back, keep it) and Cancel.
export async function act(id: string, action: SocialAction, who: string): Promise<void> {
    const { ref, post } = await load(id);
    const now = Date.now();
    if (!actionsFor(post, now).includes(action)) throw new HttpError(409, `This ${KIND_LABELS[post.kind].toLowerCase()} can't be changed that way now (${post.status})`);
    if (action === 'post') {
        settingsOrRefuse();
        // The job hands it over; approvedAt tells the hourly check it may, should this start fail.
        await ref.update({ status: post.status === 'partial' ? 'partial' : 'waiting', approvedAt: now, reason: `Post pressed by ${who}`, updatedAt: now });
        await startSocial({ mode: 'send', postId: id });
        return;
    }
    if (post.status === 'sent' && post.uploadPost?.jobId) {
        try {
            await cancelScheduled(settingsOrRefuse(), post.uploadPost.jobId);
        } catch (error) {
            uploadPostRefusal(error);
        }
    }
    await ref.update({
        status: action === 'hold' ? 'held' : 'cancelled',
        reason: `${action === 'hold' ? 'Held' : 'Cancelled'} by ${who}`,
        uploadPost: post.uploadPost ? { ...post.uploadPost, jobId: null, scheduled: false } : null,
        approvedAt: null,
        updatedAt: now,
    });
}

// Saves a producer's changes to a post's words; a post already handed over is changed at Upload-Post too.
export async function editPost(id: string, words: Record<string, unknown>): Promise<void> {
    const { ref, post } = await load(id);
    const now = Date.now();
    if (!post.content || !canEdit(post, now)) throw new HttpError(409, `This post can't be changed now (${post.status})`);
    const changes: Partial<Record<EditableField, string>> = {};
    for (const { key, label } of editableFields(post.kind)) {
        const v = words[key];
        if (typeof v !== 'string') continue;
        const text = v.trim();
        if (!text) throw new HttpError(400, `${label} can't be empty`);
        if (key === 'instagramCaption' && text.length > INSTAGRAM_CAPTION_MAX) throw new HttpError(400, `Instagram allows ${INSTAGRAM_CAPTION_MAX} characters; this has ${text.length}`);
        if (key === 'facebookTitle' && text.length > FACEBOOK_TITLE_MAX) throw new HttpError(400, `Facebook allows ${FACEBOOK_TITLE_MAX} characters in a title`);
        if (hasLimitedWords(text)) throw new HttpError(400, `${label} has a word the platforms limit; say it another way`);
        changes[key] = text;
    }
    if (!Object.keys(changes).length) throw new HttpError(400, 'Nothing to change');
    if (post.status === 'sent' && post.uploadPost?.jobId) {
        try {
            await patchScheduled(settingsOrRefuse(), post.uploadPost.jobId, {
                fields: Object.fromEntries(Object.entries(changes).map(([k, v]) => [FIELD_NAMES[k as EditableField], v])),
            });
        } catch (error) {
            uploadPostRefusal(error);
        }
    }
    await ref.update({ content: { ...post.content, ...changes }, updatedAt: now });
}

// "YouTube post" on a carousel: its slides (JPEG, 4:5) and the ready-to-paste text, for posting on the YouTube channel by
// hand until the posts API opens (docs/specs/026-social-publishing.md). With `slide`, that slide's bytes.
export async function youtubePost(id: string): Promise<{ text: string; slides: number; title: string }> {
    const { post } = await load(id);
    const c = post.content as CarouselContent | null;
    if (post.kind !== 'carousel' || !c) throw new HttpError(404, 'Only a carousel has a YouTube post');
    return { text: c.youtube.text, slides: c.slides.length, title: c.title };
}

export async function youtubeSlide(id: string, slide: number): Promise<Buffer> {
    const { post } = await load(id);
    const c = post.content as CarouselContent | null;
    if (post.kind !== 'carousel' || !c) throw new HttpError(404, 'Only a carousel has a YouTube post');
    const s = c.slides[slide - 1];
    if (!s) throw new HttpError(404, 'No such slide');
    const [bytes] = await adminBucket().file(s.path).download();
    return bytes;
}

// The posts in a month, for the calendar (one field, so no composite index): what the calendar shows of each.
export async function postsBetween(from: number, to: number): Promise<CalendarPost[]> {
    const snap = await posts().where('postAt', '>=', from).where('postAt', '<', to).orderBy('postAt').limit(3000).get();
    return snap.docs.map(d => {
        const p = d.data() as SocialPost;
        return {
            id: d.id, kind: p.kind, status: p.status, postAt: p.postAt, platforms: p.platforms, results: p.results ?? {},
            shortTitle: p.shortTitle, speaker: p.speaker, notMade: p.notMade,
        };
    });
}
