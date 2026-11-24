// Social publishing (docs/specs/026-social-publishing.md; D-2026-11-23-swc-autopost in DECISIONS.md): every Short
// approved at Checkpoint E and scheduled on YouTube goes to Soul Wisdom's Instagram and Facebook through Upload-Post.
// Runs in GitHub Actions (.github/workflows/social.yml, and the last step of podcast_shorts.yml in upload mode), in
// one of three modes (SOCIAL_MODE):
//   plan   makes the posts of one episode's Shorts (EPISODE_ID) or of every episode, and hands each to Upload-Post
//          with its own time set, so a late GitHub run never makes a post late
//   check  the hourly pass: plans what is missing, cancels the posts of a Short no longer scheduled or public on
//          YouTube (and moves a Reel whose Short moved), reads back the results of posts whose time has passed, and
//          hands over what is waiting for it (a Post pressed on the Studio's Social page, a failure to try again)
//   send   hands over one post (POST_ID), after Post on the Social page
// The rules are lib/social/plan.ts; Upload-Post's API is lib/social/uploadPost.ts. Reels (stage 2), image posts (stage 3,
// agent/src/social/image.ts), story carousels (stage 4, agent/src/social/carousel.ts).

import { spawnSync } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentReference, type Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { TimedWord } from '../../../lib/retime';
import { wordsBetween } from '../../../lib/shorts';
import { episodeLink } from '../../../lib/publishing';
import { reelCaptions } from '../../../lib/social/captions';
import {
    autopostOn, etLabel, FEED_KINDS, feedPostAt, REQUEUE_FREEZE_MS, requeueFeed, KIND_LABELS, LIVE_STATUSES, PLANNED_KINDS, PLATFORMS, postId, reelPostAt, scheduleFor,
    socialStart, statusFromResults, tooLate, whyNot, youtubeVerdict, type CarouselContent, type ImageContent, type PostContent, type PlatformResult, type PostKind,
    type ReelContent, type SocialPost, type YoutubeState,
} from '../../../lib/social/plan';
import { cancelScheduled, configFrom, missingSettings, patchScheduled, postState, sendPhotos, sendReel, type UploadPostConfig } from '../../../lib/social/uploadPost';
import type { Episode, ShortItem } from '../../../types/episode';
import { withRetry } from '../podcast/errors';
import { loadSettings, storageBucket } from '../podcast/settings';
import { createYoutube } from '../podcast/youtubeApi';
import { closeCards } from './cards';
import { makeCarousel } from './carousel';
import { makeImagePost } from './image';
import { HOST_FRAME_EVERY, hostFrameAllowed, originalMsOf } from '../../../lib/social/picture';
import { OverLimit } from './spending';

type Mode = 'plan' | 'check' | 'send';

function required(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
}

const mode = (process.env.SOCIAL_MODE || 'check') as Mode;
if (!['plan', 'check', 'send'].includes(mode)) throw new Error(`Not a social job: ${mode}`);
const onlyEpisode = process.env.EPISODE_ID?.trim() || '';
if (onlyEpisode && !/^[\w-]{10,}$/.test(onlyEpisode)) throw new Error(`Not a valid episode ID: ${onlyEpisode}`);
const onlyPost = process.env.POST_ID?.trim() || '';

initializeApp({ credential: cert(JSON.parse(required('PODCAST_SA_JSON'))), storageBucket: storageBucket() });
const db = getFirestore();
const bucket = getStorage().bucket();
const posts = db.collection('social_posts');
const workDir = path.join(process.env.RUNNER_TEMP || '/tmp', 'social');
const autopost = autopostOn(process.env.SOCIAL_AUTOPOST);
const start = socialStart(process.env.SOCIAL_START);
const LINK_MS = 60 * 60_000;
const AUTOPOST_OFF = 'Posting by itself is off (SOCIAL_AUTOPOST): press Post';

const finalAtOf = (episode: Episode) => (episode.final?.finishedAt as Timestamp | undefined)?.toMillis?.() ?? 0;
const signed = (file: string) => bucket.file(file).getSignedUrl({ action: 'read', expires: Date.now() + LINK_MS }).then(([u]) => u);

function youtube() {
    return createYoutube({
        clientId: required('YOUTUBE_CLIENT_ID'),
        clientSecret: required('YOUTUBE_CLIENT_SECRET'),
        refreshToken: required('YOUTUBE_REFRESH_TOKEN'),
    });
}

// What YouTube says about each video now; a video it no longer returns is missing.
async function youtubeStates(ids: string[]): Promise<Map<string, YoutubeState>> {
    const out = new Map<string, YoutubeState>();
    if (!ids.length) return out;
    const found = await youtube().videoStates([...new Set(ids)]);
    for (const [id, v] of found) {
        const publishAt = v.status?.publishAt ? Date.parse(v.status.publishAt) : NaN;
        out.set(id, { privacyStatus: v.status?.privacyStatus ?? '', publishAt: Number.isNaN(publishAt) ? null : publishAt });
    }
    return out;
}

async function update(ref: DocumentReference, change: Partial<SocialPost>) {
    await ref.update({ ...change, updatedAt: Date.now() });
}

// ─── Planning ───────────────────────────────────────────────────────────────────

async function loadWords(episode: Episode): Promise<TimedWord[]> {
    if (!episode.final?.wordsPath) return [];
    const [raw] = await withRetry('Storage download', () => bucket.file(episode.final!.wordsPath!).download());
    return (JSON.parse(raw.toString('utf8')) as { words: TimedWord[] }).words;
}

// A still of the Short a second and a half in (its headline, the speaker and the first captions), as the Reel's cover.
async function makeCover(episodeId: string, item: ShortItem): Promise<string | null> {
    const dest = `social/${episodeId}/${item.id}/reel-cover.jpg`;
    const [exists] = await bucket.file(dest).exists();
    if (exists) return dest;
    fs.mkdirSync(workDir, { recursive: true });
    const video = path.join(workDir, `${item.id}.mp4`), still = path.join(workDir, `${item.id}.jpg`);
    try {
        await withRetry('Storage download', () => bucket.file(item.render!.path).download({ destination: video }));
        const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1.5', '-i', video, '-frames:v', '1', '-q:v', '3', still]);
        if (r.status !== 0 || !fs.existsSync(still)) {
            console.warn(`  ⚠️ No cover for "${item.title}": ${r.stderr?.toString().slice(0, 200) || 'ffmpeg failed'}`);
            return null;
        }
        await bucket.upload(still, { destination: dest, contentType: 'image/jpeg' });
        return dest;
    } finally {
        fs.rmSync(video, { force: true });
        fs.rmSync(still, { force: true });
    }
}

// The latest posts of a kind that took a day in its queue (posts not made don't take one), newest first.
async function latestOf(kind: PostKind, count = 10): Promise<SocialPost[]> {
    const recent = await posts.where('kind', '==', kind).orderBy('postAt', 'desc').limit(count + 10).get();
    return recent.docs.map(d => d.data() as SocialPost).filter(p => !p.notMade).slice(0, count);
}

// The day a feed post of this kind last took, for the 1-a-day queue.
const lastTaken = async (kind: PostKind) => (await latestOf(kind, 1))[0]?.postAt ?? null;

// What planning needs of one episode, read once a run.
interface EpisodeCtx {
    episode: Episode;
    settings: Awaited<ReturnType<typeof loadSettings>>;
    words: TimedWord[];
    link: { url: string; linkText: string };
    hashtags: string[];
    finalUrl: string | null;
    states: Map<string, YoutubeState>;
}
const contexts = new Map<string, EpisodeCtx>();

async function episodeCtx(episodeId: string, episode: Episode): Promise<EpisodeCtx> {
    const known = contexts.get(episodeId);
    if (known) return known;
    const settings = await loadSettings(db);
    const items = episode.shorts?.items ?? [];
    const ctx: EpisodeCtx = {
        episode, settings,
        words: await loadWords(episode),
        link: episodeLink({ episodeUrl: episode.youtube?.url, playlistId: process.env.YOUTUBE_PLAYLIST_ID, siteUrl: settings.siteUrl }),
        hashtags: episode.notes?.approved?.hashtags ?? [],
        finalUrl: episode.final?.videoPath
            ? (await bucket.file(episode.final.videoPath).getSignedUrl({ action: 'read', expires: Date.now() + 3 * LINK_MS }))[0] : null,
        states: await youtubeStates(items.filter(i => i.youtube?.videoId).map(i => i.youtube!.videoId)),
    };
    contexts.set(episodeId, ctx);
    return ctx;
}

// Every qualifying Short, across episodes, in YouTube order, with the kinds of post it still lacks.
async function missingPosts(): Promise<{ episodeId: string; episode: Episode; item: ShortItem; kinds: PostKind[] }[]> {
    const snaps = onlyEpisode ? [await db.collection('episodes').doc(onlyEpisode).get()]
        : (await db.collection('episodes').get()).docs.filter(d => ((d.get('shorts.items') as ShortItem[] | undefined) ?? []).some(i => i.youtube?.videoId));
    const out: { episodeId: string; episode: Episode; item: ShortItem; kinds: PostKind[] }[] = [];
    for (const snap of snaps) {
        const episode = snap.data() as Episode | undefined;
        const shorts = episode?.shorts;
        if (!episode || !shorts?.items.length) continue;
        const finalAt = finalAtOf(episode);
        for (const item of shorts.items.filter(i => !whyNot(i, { aspect: shorts.aspect, finalAt, start }))) {
            const kinds: PostKind[] = [];
            for (const kind of PLANNED_KINDS) if (!(await posts.doc(postId(snap.id, item.id, kind)).get()).exists) kinds.push(kind);
            if (kinds.length) out.push({ episodeId: snap.id, episode, item, kinds });
        }
    }
    return out.sort((a, b) => a.item.youtube!.publishAt - b.item.youtube!.publishAt);
}

// A run stops starting paid feed posts after this, so it always ends within the workflow's 30 minutes; the next run
// carries on (2026-11-24: the first catch-up ran out of time).
const FEED_BUDGET_MS = 20 * 60_000;
const runStarted = Date.now();

// Makes the posts each qualifying Short still lacks, and hands each over unless autopost is off: every Reel first
// (cheap), then the carousels and image posts in the Shorts' YouTube order across episodes, within the run's time and the
// social posts' share of the daily spending limit. A post that can't be made is kept as cancelled with the reason
// (notMade), so it is never tried, or paid for, again.
async function planAll(config: UploadPostConfig | null): Promise<number> {
    const todo = await missingPosts();
    let made = 0, stopped: string | null = null;
    for (const pass of ['reel', 'feed'] as const) {
        for (const { episodeId, episode, item, kinds } of todo) {
            const mine = kinds.filter(k => (pass === 'reel' ? k === 'reel' : k !== 'reel'));
            if (!mine.length) continue;
            if (pass === 'feed' && !stopped && Date.now() - runStarted > FEED_BUDGET_MS) stopped = 'out of time for this run';
            if (pass === 'feed' && stopped) break;
            try {
                const r = await planShort(episodeId, episode, item, mine, config);
                made += r.made;
                if (r.overLimit) stopped = r.overLimit;
            } catch (error) {
                // One Short's trouble never stops the others.
                console.warn(`⚠️ "${item.title}" (${episodeId}): ${(error as Error).message}`);
            }
        }
    }
    if (stopped) console.log(`⏸️ Feed posts paused (${stopped}); the next run carries on`);
    return made;
}

async function planShort(episodeId: string, episode: Episode, item: ShortItem, kinds: PostKind[], config: UploadPostConfig | null): Promise<{ made: number; overLimit: string | null }> {
    const ctx = await episodeCtx(episodeId, episode);
    const { settings, words, link, hashtags, finalUrl } = ctx;
    const yt = item.youtube!;
    const verdict = youtubeVerdict(ctx.states.get(yt.videoId), yt.publishAt);
    if (verdict.verdict === 'cancel') {
        console.log(`  ⏭️ "${item.title}": ${verdict.reason}; no posts`);
        return { made: 0, overLimit: null };
    }
    const publishAt = verdict.verdict === 'move' ? verdict.publishAt : yt.publishAt;
    const reelAt = reelPostAt(publishAt);
    const spoken = wordsBetween(words, item.startMs, item.endMs).map(w => w.text).join(' ');
    const base = {
        episodeId, shortId: item.id, shortTitle: item.title, speaker: item.speaker,
        youtube: { videoId: yt.videoId, url: yt.url, publishAt }, platforms: [...PLATFORMS],
        uploadPost: null, results: {},
    };
    let made = 0;
    for (const kind of kinds) {
        const now = Date.now();
        let post: SocialPost;
        if (kind === 'reel') {
            if (tooLate(reelAt, now)) {
                console.log(`  ⏭️ "${item.title}": its Reel's time (${etLabel(reelAt)}) passed too long ago`);
                continue;
            }
            const captions = reelCaptions({
                title: item.title, speaker: item.speaker, show: settings.showName, spoken, episode: link, shortId: item.id,
                hashtags, credits: episode.final?.credits ?? [],
            });
            const coverPath = await makeCover(episodeId, item);
            post = {
                ...base, kind, postAt: reelAt, status: 'waiting', reason: autopost ? null : AUTOPOST_OFF,
                content: {
                    title: item.title, videoPath: item.render!.path, coverPath, seconds: Math.round(item.render!.durationMs / 1000),
                    synthetic: item.synthetic, ...captions,
                },
                createdAt: now, updatedAt: now,
            };
        } else {
            if (!finalUrl) {
                console.log(`  ⏭️ "${item.title}": no final cut to take frames from`);
                continue;
            }
            const postAt = feedPostAt(kind, { lastTaken: await lastTaken(kind), reelAt, now });
            const shared = {
                db, bucket, episodeId, finalUrl, spoken, show: settings.showName, episode: link, hashtags, workDir,
                apiKey: required('ANTHROPIC_API_KEY'),
                hosts: settings.hosts, broll: Object.values(episode.broll?.images ?? {}),
                at: originalMsOf(item, episode.final?.quotes),
            };
            let result: { content: PostContent } | { notMade: string };
            try {
                if (kind === 'carousel') {
                    result = await makeCarousel(item, shared);
                } else {
                    // A host's own frame one image post in five (Tom, 2026-11-23); b-roll the others use is not used again.
                    const recent = await latestOf('image', HOST_FRAME_EVERY - 1);
                    const episodeCards = (await posts.where('episodeId', '==', episodeId).orderBy('postAt').get()).docs
                        .map(d => d.data() as SocialPost).filter(p => p.kind === 'image' && p.content);
                    result = await makeImagePost(item, {
                        ...shared,
                        used: episodeCards.map(p => (p.content as ImageContent).picturePath).filter((x): x is string => !!x),
                        hostFrameAllowed: hostFrameAllowed(recent.map(p => (p.content as ImageContent | null)?.picture)),
                    });
                }
            } catch (error) {
                console.warn(`  ⚠️ ${KIND_LABELS[kind]} "${item.title}": ${(error as Error).message}`);
                if (error instanceof OverLimit) return { made, overLimit: (error as Error).message };
                continue;
            }
            post = 'notMade' in result
                ? { ...base, kind, postAt: now, status: 'cancelled', reason: `Not made: ${result.notMade}`, notMade: true, content: null, createdAt: now, updatedAt: now }
                : { ...base, kind, postAt, status: 'waiting', reason: autopost ? null : AUTOPOST_OFF, content: result.content, createdAt: now, updatedAt: now };
        }
        const ref = posts.doc(postId(episodeId, item.id, kind));
        try {
            await ref.create(post);          // fails if another run made it first
        } catch {
            continue;
        }
        made++;
        console.log(`  ➕ ${KIND_LABELS[kind]} "${item.title}" ${post.notMade ? `not made (${post.reason})` : `for ${etLabel(post.postAt)}`}`);
        if (autopost && config && post.status === 'waiting') await send(ref, config);
    }
    return { made, overLimit: null };
}

// Puts each feed queue in the Shorts' YouTube order (lib/social/plan.ts requeueFeed): a post whose day changes gets its
// new time, at Upload-Post too when it was handed over. Posts already out or within two hours of their time stay put.
async function requeue(config: UploadPostConfig | null): Promise<number> {
    const now = Date.now();
    let moved = 0;
    for (const kind of FEED_KINDS) {
        const docs = (await posts.where('kind', '==', kind).where('postAt', '>=', now - 7 * 24 * 3_600_000).orderBy('postAt', 'desc').get()).docs
            .filter(d => !(d.data() as SocialPost).notMade);
        const all = docs.map(d => ({ ref: d.ref, post: d.data() as SocialPost }));
        const movable = (p: SocialPost) => ['waiting', 'sent', 'held', 'failed'].includes(p.status) && p.postAt - now > REQUEUE_FREEZE_MS
            && (p.status !== 'sent' || !!p.uploadPost?.scheduled);
        const next = requeueFeed(kind, all.map(({ ref, post }) => ({
            id: ref.id, postAt: post.postAt, reelAt: reelPostAt(post.youtube.publishAt), publishAt: post.youtube.publishAt,
            movable: movable(post),
        })), now);
        for (const { ref, post } of all) {
            const at = next.get(ref.id);
            if (at === undefined || at === post.postAt) continue;
            try {
                if (post.status === 'sent' && post.uploadPost?.jobId && config) await patchScheduled(config, post.uploadPost.jobId, { at });
                await update(ref, { postAt: at });
                moved++;
                console.log(`  ↔️ ${KIND_LABELS[kind]} "${post.shortTitle}": ${etLabel(post.postAt)} → ${etLabel(at)}`);
            } catch (error) {
                console.warn(`  ⚠️ Moving ${KIND_LABELS[kind]} "${post.shortTitle}": ${(error as Error).message}`);
            }
        }
    }
    return moved;
}

// ─── Handing over ───────────────────────────────────────────────────────────────

// Hands one post to Upload-Post: at its time if that is still ahead, else now. A failed or partial post goes again
// only to the platforms that didn't get it, with a new request ID (Upload-Post keeps an Idempotency-Key for a day).
async function send(ref: DocumentReference, config: UploadPostConfig): Promise<void> {
    const post = (await ref.get()).data() as SocialPost;
    const now = Date.now();
    if (tooLate(post.postAt, now)) {
        await update(ref, { status: 'missed', reason: `Its time (${etLabel(post.postAt)}) passed more than 6 hours ago` });
        return;
    }
    const sends = (post.uploadPost?.sends ?? 0) + 1;
    const requestId = sends === 1 ? ref.id : `${ref.id}-${sends}`;
    const platforms = post.status === 'partial' ? post.platforms.filter(p => !post.results[p]?.ok) : post.platforms;
    const at = scheduleFor(post.postAt, now);
    try {
        let out;
        if (post.kind === 'reel') {
            const c = post.content as ReelContent;
            out = await sendReel(config, {
                requestId, platforms, videoUrl: await signed(c.videoPath), coverUrl: c.coverPath ? await signed(c.coverPath) : null,
                seconds: c.seconds, synthetic: c.synthetic, title: c.title, instagramCaption: c.instagramCaption,
                facebookTitle: c.facebookTitle, facebookDescription: c.facebookDescription, at,
            });
        } else if (post.kind === 'image') {
            const c = post.content as ImageContent;
            out = await sendPhotos(config, {
                requestId, platforms, imageUrls: [await signed(c.cardPath)], title: c.title,
                instagramCaption: c.instagramCaption, facebookCaption: c.facebookCaption, aiPicture: c.aiPicture, at,
            });
        } else {
            const c = post.content as CarouselContent;
            out = await sendPhotos(config, {
                requestId, platforms, imageUrls: await Promise.all(c.slides.map(sl => signed(sl.path))), title: c.title,
                instagramCaption: c.instagramCaption, facebookCaption: c.facebookCaption, aiPicture: c.aiPicture, at,
            });
        }
        await update(ref, {
            status: 'sent', reason: null,
            uploadPost: { jobId: out.jobId, requestId: out.requestId, scheduled: out.scheduled, sentAt: now, sends },
        });
        console.log(`  📤 ${post.kind} "${post.shortTitle}" ${out.scheduled ? `set for ${etLabel(post.postAt)}` : 'posting now'}`);
    } catch (error) {
        const message = (error as Error).message;
        await update(ref, { status: 'failed', reason: message, uploadPost: { ...(post.uploadPost ?? { jobId: null, requestId, scheduled: false, sentAt: now }), sends } });
        console.warn(`  ⚠️ ${post.kind} "${post.shortTitle}": ${message}`);
    }
}

// ─── The hourly check ───────────────────────────────────────────────────────────

const MAX_SENDS = 3;

async function check(config: UploadPostConfig): Promise<void> {
    const made = await planAll(config);
    const requeued = await requeue(config);
    const now = Date.now();
    const live = (await posts.where('status', 'in', LIVE_STATUSES).orderBy('postAt').get()).docs;

    // YouTube's word on every Short with live posts: cancel what was unscheduled, move a Reel whose Short moved.
    const states = await youtubeStates(live.map(d => (d.data() as SocialPost).youtube.videoId));
    let cancelled = 0, moved = 0;
    for (const d of live) {
        const post = d.data() as SocialPost;
        const verdict = youtubeVerdict(states.get(post.youtube.videoId), post.youtube.publishAt);
        if (verdict.verdict === 'keep') continue;
        if (post.postAt - now < 90_000 && post.status === 'sent') continue;     // too close to change
        try {
            if (verdict.verdict === 'cancel') {
                if (post.status === 'sent' && post.uploadPost?.jobId) await cancelScheduled(config, post.uploadPost.jobId);
                await update(d.ref, { status: 'cancelled', reason: verdict.reason });
                cancelled++;
                console.log(`  🚫 ${post.kind} "${post.shortTitle}": ${verdict.reason}`);
            } else if (post.kind === 'reel') {
                const postAt = reelPostAt(verdict.publishAt);
                if (post.status === 'sent' && post.uploadPost?.jobId && post.uploadPost.scheduled) await patchScheduled(config, post.uploadPost.jobId, { at: postAt });
                await update(d.ref, { postAt, youtube: { ...post.youtube, publishAt: verdict.publishAt } });
                moved++;
                console.log(`  ↔️ Reel "${post.shortTitle}" moved to ${etLabel(postAt)}`);
            }
        } catch (error) {
            console.warn(`  ⚠️ ${post.kind} "${post.shortTitle}": ${(error as Error).message}`);
        }
    }

    // The results of posts whose time has passed.
    let read = 0;
    for (const d of live) {
        const post = (await d.ref.get()).data() as SocialPost;
        if (post.status !== 'sent' || !post.uploadPost || post.postAt > now - 60_000) continue;
        try {
            const state = await postState(config, post.uploadPost);
            if (!state.done) continue;
            const results: Record<string, PlatformResult> = { ...post.results, ...state.results };
            const status = statusFromResults(post.platforms, results);
            const failed = post.platforms.filter(p => !results[p]?.ok);
            await update(d.ref, {
                status, results,
                reason: status === 'posted' ? null : failed.map(p => `${p}: ${results[p]?.error ?? state.message ?? 'no answer'}`).join('; '),
            });
            read++;
        } catch (error) {
            console.warn(`  ⚠️ Reading back "${post.shortTitle}": ${(error as Error).message}`);
        }
    }

    // What waits to be handed over: posts made while autopost was off once it is on, Post pressed (approved), and
    // failures to try again, while their time is under 6 hours past.
    let sent = 0;
    for (const d of live) {
        const post = (await d.ref.get()).data() as SocialPost & { approvedAt?: number };
        const due = (post.status === 'waiting' && (autopost || post.approvedAt)) ||
            (post.status === 'failed' && (post.uploadPost?.sends ?? 0) < MAX_SENDS && (autopost || post.approvedAt));
        if (!due) continue;
        await send(d.ref, config);
        sent++;
    }
    console.log(`✅ Planned ${made}, put in YouTube order ${requeued}, cancelled ${cancelled}, moved ${moved}, read back ${read}, retried ${sent}`);
}

async function main() {
    const missing = missingSettings();
    const config = missing.length ? null : configFrom();
    if (!config) console.warn(`⚠️ Posting is not set up yet (${missing.join(', ')} missing): posts are planned, not handed over`);
    if (mode === 'plan') {
        console.log(`✅ Planned ${await planAll(config)} posts`);
        return;
    }
    if (!config) return;
    if (mode === 'send') {
        if (!onlyPost) throw new Error('POST_ID is required in send mode');
        const ref = posts.doc(onlyPost);
        const post = (await ref.get()).data() as SocialPost | undefined;
        if (!post) throw new Error(`No such post: ${onlyPost}`);
        if (!['waiting', 'held', 'failed', 'partial'].includes(post.status)) {
            console.log(`Nothing to do: the post is ${post.status}`);
            return;
        }
        await send(ref, config);
        return;
    }
    await check(config);
}

main().then(() => closeCards()).catch(error => {
    console.error(`❌ ${(error as Error).message}`);
    process.exit(1);
});
