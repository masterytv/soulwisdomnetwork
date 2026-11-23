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
// The rules are lib/social/plan.ts; Upload-Post's API is lib/social/uploadPost.ts. Stage 2 makes Reels; the image posts
// and carousels come in stages 3 and 4.

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
    autopostOn, etLabel, LIVE_STATUSES, PLATFORMS, postId, reelPostAt, scheduleFor, socialStart, statusFromResults, tooLate,
    whyNot, youtubeVerdict, type PlatformResult, type SocialPost, type YoutubeState,
} from '../../../lib/social/plan';
import { cancelScheduled, configFrom, missingSettings, patchScheduled, postState, sendReel, type UploadPostConfig } from '../../../lib/social/uploadPost';
import type { Episode, ShortItem } from '../../../types/episode';
import { withRetry } from '../podcast/errors';
import { loadSettings, storageBucket } from '../podcast/settings';
import { createYoutube } from '../podcast/youtubeApi';

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

// Makes the Reels of one episode's Shorts that qualify and have none yet; hands each over unless autopost is off.
async function planEpisode(episodeId: string, config: UploadPostConfig | null): Promise<number> {
    const snap = await db.collection('episodes').doc(episodeId).get();
    const episode = snap.data() as Episode | undefined;
    const shorts = episode?.shorts;
    if (!episode || !shorts?.items.length) return 0;
    const finalAt = finalAtOf(episode);
    const candidates = shorts.items.filter(i => !whyNot(i, { aspect: shorts.aspect, finalAt, start }));
    if (!candidates.length) return 0;
    const fresh: ShortItem[] = [];
    for (const item of candidates) if (!(await posts.doc(postId(episodeId, item.id, 'reel')).get()).exists) fresh.push(item);
    if (!fresh.length) return 0;

    const states = await youtubeStates(fresh.map(i => i.youtube!.videoId));
    const settings = await loadSettings(db);
    const words = await loadWords(episode);
    const link = episodeLink({ episodeUrl: episode.youtube?.url, playlistId: process.env.YOUTUBE_PLAYLIST_ID, siteUrl: settings.siteUrl });
    const notes = episode.notes?.approved;
    let made = 0;
    for (const item of fresh) {
        const yt = item.youtube!;
        const verdict = youtubeVerdict(states.get(yt.videoId), yt.publishAt);
        if (verdict.verdict === 'cancel') {
            console.log(`  ⏭️ "${item.title}": ${verdict.reason}; no posts`);
            continue;
        }
        const publishAt = verdict.verdict === 'move' ? verdict.publishAt : yt.publishAt;
        const postAt = reelPostAt(publishAt);
        if (tooLate(postAt, Date.now())) {
            console.log(`  ⏭️ "${item.title}": its Reel's time (${etLabel(postAt)}) passed too long ago`);
            continue;
        }
        const spoken = wordsBetween(words, item.startMs, item.endMs).map(w => w.text).join(' ');
        const captions = reelCaptions({
            title: item.title, speaker: item.speaker, show: settings.showName, spoken, episode: link, shortId: item.id,
            hashtags: notes?.hashtags ?? [], credits: episode.final?.credits ?? [],
        });
        const coverPath = await makeCover(episodeId, item);
        const now = Date.now();
        const post: SocialPost = {
            kind: 'reel', episodeId, shortId: item.id, shortTitle: item.title, speaker: item.speaker,
            youtube: { videoId: yt.videoId, url: yt.url, publishAt },
            postAt, platforms: [...PLATFORMS],
            status: 'waiting', reason: autopost ? null : 'Posting by itself is off (SOCIAL_AUTOPOST): press Post',
            content: {
                title: item.title, videoPath: item.render!.path, coverPath, seconds: Math.round(item.render!.durationMs / 1000),
                synthetic: item.synthetic, ...captions,
            },
            uploadPost: null, results: {}, createdAt: now, updatedAt: now,
        };
        const ref = posts.doc(postId(episodeId, item.id, 'reel'));
        try {
            await ref.create(post);          // fails if another run made it first
        } catch {
            continue;
        }
        made++;
        console.log(`  ➕ Reel "${item.title}" for ${etLabel(postAt)}`);
        if (autopost && config) await send(ref, config);
    }
    return made;
}

async function planAll(config: UploadPostConfig | null): Promise<number> {
    const ids = onlyEpisode ? [onlyEpisode] : (await db.collection('episodes').select('shorts.items').get())
        .docs.filter(d => ((d.get('shorts.items') as ShortItem[] | undefined) ?? []).some(i => i.youtube?.videoId)).map(d => d.id);
    let made = 0;
    for (const id of ids) {
        try {
            made += await planEpisode(id, config);
        } catch (error) {
            // One episode's trouble never stops the others.
            console.warn(`⚠️ Episode ${id}: ${(error as Error).message}`);
        }
    }
    return made;
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
        if (post.kind !== 'reel') throw new Error(`${post.kind} posts come in a later stage`);
        const c = post.content;
        const out = await sendReel(config, {
            requestId, platforms, videoUrl: await signed(c.videoPath), coverUrl: c.coverPath ? await signed(c.coverPath) : null,
            seconds: c.seconds, synthetic: c.synthetic, title: c.title, instagramCaption: c.instagramCaption,
            facebookTitle: c.facebookTitle, facebookDescription: c.facebookDescription, at,
        });
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
    console.log(`✅ Planned ${made}, cancelled ${cancelled}, moved ${moved}, read back ${read}, handed over ${sent}`);
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

main().catch(error => {
    console.error(`❌ ${(error as Error).message}`);
    process.exit(1);
});
