// Spec 005 step 7: b-roll for one episode from its approved show notes. Runs in GitHub Actions
// (.github/workflows/podcast_broll.yml), started from the show notes page in the Podcast Studio.
// docs/specs/008-broll-images.md (AI images) and docs/specs/023-stock-broll.md (stock footage and photos).
//
// BROLL_MODE "stock": real footage first, then real photos, from Pexels and Pixabay; Claude picks among the candidates
// and an idea nothing fits is left for an AI image. BROLL_MODE "ai" (or unset, as before stock existed): AI images.
// BROLL_INDEX set: that one idea again (other stock than it has, or a new AI image). Unset: every idea with no b-roll
// or whose idea (or, for an AI image, style) has changed since, and b-roll for ideas that were removed is dropped.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { BROLL_MODEL, BROLL_QUALITY, BROLL_SIZE, BROLL_USD_PER_IMAGE, brollPrompt, brollStale, type BrollStyle } from '../../../lib/broll';
import {
    acceptPicks, mergeCandidates, pexelsPhotos, pexelsUrl, pexelsVideos, PICK_SYSTEM, pickMessage, PicksSchema, pixabayPhotos, pixabayUrl,
    pixabayVideos, stockQuery, type PickMoment, type StockCandidate,
} from '../../../lib/stockBroll';
import type { ShowNotes } from '../../../lib/showNotes';
import type { BrollImage, Episode } from '../../../types/episode';
import { ask } from './claudeEdits';
import { loadAlert } from './config';
import { describeError, failureSubject, sendEmail } from './notify';
import { loadSettings, storageBucket } from './settings';

// AI images at once; each takes up to a minute or two.
const PARALLEL = 3;
// Stock: searches at once, candidates per site and kind, candidates shown to Claude per moment, moments per request.
const SEARCHES_AT_ONCE = 4;
const PER_SEARCH = 8;
const CANDIDATES = 16;
const MOMENTS_PER_ASK = 8;
const MAX_FILE_BYTES = 200e6;

function required(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
}

const episodeId = required('EPISODE_ID');
if (!/^[\w-]{10,}$/.test(episodeId)) throw new Error(`Not a valid episode ID: ${episodeId}`);
const only = process.env.BROLL_INDEX ? Number(process.env.BROLL_INDEX) : null;
if (only !== null && !(Number.isInteger(only) && only >= 0)) throw new Error(`Not a valid b-roll index: ${process.env.BROLL_INDEX}`);
const mode = process.env.BROLL_MODE === 'stock' ? 'stock' : 'ai';
const serviceAccount = JSON.parse(required('PODCAST_SA_JSON'));
initializeApp({ credential: cert(serviceAccount), storageBucket: storageBucket() });
const ref = getFirestore().collection('episodes').doc(episodeId);
const alert = loadAlert();
const runUrl = process.env.GITHUB_RUN_URL || '';

const what = mode === 'stock' ? 'Stock b-roll' : 'B-roll images';
const failureEmail = (message: string, summary: string) => sendEmail({ alert }, failureSubject(`${what} failed: ${episodeId}`, message),
    `${summary}\n\n${describeError(message)}\n\nTry again from the show notes page.${runUrl ? `\n\nRun log: ${runUrl}` : ''}`);

type Idea = ShowNotes['broll'][number];

async function main() {
    const episode = (await ref.get()).data() as Episode | undefined;
    if (!episode) throw new Error(`Episode ${episodeId} not found`);
    const ideas: Idea[] = episode.notes?.status === 'approved' ? episode.notes.approved?.broll ?? [] : [];
    if (!ideas.length) throw new Error('Approve show notes with at least one b-roll idea first');
    if (only !== null && only >= ideas.length) throw new Error(`There is no b-roll idea ${only + 1}`);

    const existing = episode.broll?.images ?? {};
    const todo = only !== null ? [only] : ideas.map((_, i) => i).filter(i => brollStale(existing[i], ideas[i]));
    const removed = only === null ? Object.keys(existing).filter(k => Number(k) >= ideas.length) : [];

    await ref.update({
        'broll.status': 'generating', 'broll.startedAt': FieldValue.serverTimestamp(), 'broll.error': null,
        ...Object.fromEntries(removed.map(k => [`broll.images.${k}`, FieldValue.delete()])),
        updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`🖼️  ${episode.title}: ${todo.length} of ${ideas.length} idea(s) to fill (${mode})`);

    const failures = mode === 'stock' ? await stock(ideas, todo, existing, episode.broll?.rejected ?? []) : await aiImages(ideas, todo);

    await ref.update({
        'broll.status': failures.length === todo.length && todo.length ? 'failed' : 'ready',
        'broll.error': failures.length ? failures.join('; ') : null,
        'broll.finishedAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });
    if (failures.length) {
        console.error(`${failures.length} failed`);
        await failureEmail(failures.join('\n'), `${failures.length} of ${todo.length} b-roll idea(s) could not be filled.`);
        process.exit(1);
    }
}

// Saves one idea's b-roll as soon as it is ready, so the page fills in as the run goes.
async function save(i: number, image: BrollImage, cost: number) {
    await ref.update({
        [`broll.images.${i}`]: image,
        ...(cost ? {
            'costs.items': FieldValue.arrayUnion({ item: `broll_${i + 1}`, usd: cost, at: new Date() }),
            'costs.totalUsd': FieldValue.increment(cost),
        } : {}),
        updatedAt: FieldValue.serverTimestamp(),
    });
}

// ─── AI images (spec 008) ───────────────────────────────────────────────────

async function aiImages(ideas: Idea[], todo: number[]): Promise<string[]> {
    // The Studio settings' image style, in place of the built-in brand style when set.
    const { imageStyle } = await loadSettings(getFirestore());
    const openai = new OpenAI({ apiKey: required('OPENAI_API_KEY') });
    const bucket = getStorage().bucket();
    const failures: string[] = [];
    // Notes approved before styles existed have none; they are photoreal.
    const styleOf = (i: number): BrollStyle => (ideas[i] as { style?: BrollStyle }).style ?? 'photo';

    async function generate(i: number) {
        const idea = ideas[i];
        const style = styleOf(i);
        const prompt = brollPrompt(idea.idea, style, imageStyle);
        try {
            const result = await openai.images.generate({
                model: BROLL_MODEL, prompt, size: BROLL_SIZE, quality: BROLL_QUALITY, output_format: 'png', n: 1,
            });
            const b64 = result.data?.[0]?.b64_json;
            if (!b64) throw new Error('No image came back');
            const path = `episodes/${episodeId}/broll/${String(i + 1).padStart(2, '0')}-${Date.now()}.png`;
            await bucket.file(path).save(Buffer.from(b64, 'base64'), { contentType: 'image/png', resumable: false });
            await save(i, {
                index: i, idea: idea.idea.trim(), style, startMs: idea.startMs, durationSeconds: idea.durationSeconds,
                prompt, model: BROLL_MODEL, quality: BROLL_QUALITY, size: BROLL_SIZE, path,
                usd: BROLL_USD_PER_IMAGE, createdAt: new Date(), source: 'ai', kind: 'image',
            }, BROLL_USD_PER_IMAGE);
            console.log(`  ✅ ${i + 1} (${style}): ${idea.idea.slice(0, 70)}`);
        } catch (error) {
            const message = (error as Error).message;
            console.error(`  ❌ ${i + 1}: ${message}`);
            failures.push(`Image ${i + 1}: ${message}`);
        }
    }

    const queue = [...todo];
    await Promise.all(Array.from({ length: PARALLEL }, async () => {
        for (let i = queue.shift(); i !== undefined; i = queue.shift()) await generate(i);
    }));
    return failures;
}

// ─── stock footage and photos (spec 023) ────────────────────────────────────

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    const host = new URL(url).hostname;
    if (res.status === 429) throw new Error(`${host} says too many searches for now`);
    if (!res.ok) throw new Error(`${host} search failed (${res.status})`);
    return res.json();
}

async function search(idea: Idea, keys: { pexels?: string; pixabay?: string }): Promise<{ candidates: StockCandidate[]; errors: string[] }> {
    const q = stockQuery(idea);
    const calls: Promise<StockCandidate[]>[] = [];
    if (keys.pexels) {
        calls.push(getJson(pexelsUrl('video', q, PER_SEARCH), { Authorization: keys.pexels }).then(pexelsVideos));
        calls.push(getJson(pexelsUrl('image', q, PER_SEARCH), { Authorization: keys.pexels }).then(pexelsPhotos));
    }
    if (keys.pixabay) {
        calls.push(getJson(pixabayUrl('video', q, PER_SEARCH, keys.pixabay)).then(pixabayVideos));
        calls.push(getJson(pixabayUrl('image', q, PER_SEARCH, keys.pixabay)).then(pixabayPhotos));
    }
    const settled = await Promise.allSettled(calls);
    return {
        candidates: mergeCandidates(settled.map(s => (s.status === 'fulfilled' ? s.value : [])), CANDIDATES),
        errors: settled.flatMap(s => (s.status === 'rejected' ? [(s.reason as Error).message] : [])),
    };
}

// Downloads the chosen file into Storage, beside the AI images.
async function copyToStorage(i: number, c: StockCandidate): Promise<string> {
    const res = await fetch(c.url, { signal: AbortSignal.timeout(180_000) });
    if (!res.ok || !res.body) throw new Error(`could not download it from ${c.source} (${res.status})`);
    if (Number(res.headers.get('content-length') ?? 0) > MAX_FILE_BYTES) throw new Error('the file is over 200 MB');
    const video = c.kind === 'video';
    const local = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'broll-')), video ? 'clip.mp4' : 'photo.jpg');
    fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
    if (fs.statSync(local).size > MAX_FILE_BYTES || fs.statSync(local).size === 0) throw new Error('the file is empty or over 200 MB');
    const dest = `episodes/${episodeId}/broll/${String(i + 1).padStart(2, '0')}-${Date.now()}-${c.source}.${video ? 'mp4' : 'jpg'}`;
    await getStorage().bucket().upload(local, { destination: dest, resumable: video, metadata: { contentType: video ? 'video/mp4' : 'image/jpeg' } });
    fs.rmSync(path.dirname(local), { recursive: true, force: true });
    return dest;
}

async function stock(ideas: Idea[], todo: number[], existing: Record<string, BrollImage>, rejected: string[]): Promise<string[]> {
    const keys = { pexels: process.env.PEXELS_API_KEY || undefined, pixabay: process.env.PIXABAY_API_KEY || undefined };
    if (!keys.pexels && !keys.pixabay) throw new Error('Stock b-roll needs the PEXELS_API_KEY or PIXABAY_API_KEY repo secret');
    const client = new Anthropic({ apiKey: required('ANTHROPIC_API_KEY') });
    // Stock already used by other ideas, and the stock an idea has now (so "Find other stock" finds something else).
    const inUse = new Set(Object.entries(existing).filter(([k]) => !todo.includes(Number(k)) || only !== null).flatMap(([, b]) => (b.stockId ? [b.stockId] : [])));
    // Nor stock the producer removed from an idea.
    for (const id of rejected) inUse.add(id);

    // 1. Search, a few ideas at a time.
    const moments: PickMoment[] = [];
    const searchErrors = new Set<string>();
    for (let k = 0; k < todo.length; k += SEARCHES_AT_ONCE) {
        await Promise.all(todo.slice(k, k + SEARCHES_AT_ONCE).map(async i => {
            const { candidates, errors } = await search(ideas[i], keys);
            errors.forEach(e => searchErrors.add(e));
            const fresh = candidates.filter(c => !inUse.has(c.id));
            if (fresh.length) moments.push({ index: i, idea: ideas[i].idea, why: ideas[i].why, seconds: ideas[i].durationSeconds, candidates: fresh });
        }));
    }
    moments.sort((a, b) => a.index - b.index);
    console.log(`  🔎 ${moments.length} of ${todo.length} idea(s) have stock candidates${searchErrors.size ? ` (${[...searchErrors].join('; ')})` : ''}`);
    if (!moments.length && searchErrors.size) throw new Error([...searchErrors].join('; '));

    // 2. Claude picks, a batch of moments at a time (text only, so cheap); never the same file twice.
    const picks = new Map<number, StockCandidate>();
    let usd = 0;
    for (let k = 0; k < moments.length; k += MOMENTS_PER_ASK) {
        const batch = moments.slice(k, k + MOMENTS_PER_ASK);
        const answer = await ask(client, PicksSchema, PICK_SYSTEM, pickMessage(batch), 'low', 8000);
        usd += answer.usd;
        const taken = new Set([...inUse, ...[...picks.values()].map(c => c.id)]);
        for (const [i, c] of acceptPicks(answer.parsed.picks, batch, taken)) picks.set(i, c);
    }
    if (usd) {
        const cost = Math.round(usd * 100) / 100;
        await ref.update({
            'costs.items': FieldValue.arrayUnion({ item: 'broll_stock_picks', usd: cost, at: new Date() }),
            'costs.totalUsd': FieldValue.increment(cost),
        });
    }

    // 3. Copy each pick into Storage and save it.
    const failures: string[] = [];
    for (const i of todo) {
        const c = picks.get(i);
        if (!c) {
            console.log(`  ➖ ${i + 1}: no stock fits; left for an AI image`);
            continue;
        }
        try {
            const dest = await copyToStorage(i, c);
            const idea = ideas[i];
            await save(i, {
                index: i, idea: idea.idea.trim(), style: idea.style ?? 'photo', startMs: idea.startMs, durationSeconds: idea.durationSeconds,
                prompt: stockQuery(idea), model: c.source, quality: '', size: `${c.width}x${c.height}`, path: dest, usd: 0, createdAt: new Date(),
                source: c.source, kind: c.kind, seconds: c.seconds, credit: c.credit, pageUrl: c.pageUrl, stockId: c.id,
            }, 0);
            console.log(`  ✅ ${i + 1}: ${c.source} ${c.kind}${c.seconds ? ` (${Math.round(c.seconds)} s)` : ''}: ${c.alt.slice(0, 70)}`);
        } catch (error) {
            const message = (error as Error).message;
            console.error(`  ❌ ${i + 1}: ${message}`);
            failures.push(`B-roll ${i + 1}: ${message}`);
        }
    }
    console.log(`  ${picks.size - failures.length} found in stock; ${todo.length - picks.size} left for AI images`);
    return failures;
}

main().catch(async error => {
    const message = (error as Error).message;
    console.error(`❌ ${message}`);
    await ref.update({
        'broll.status': 'failed', 'broll.error': message, 'broll.finishedAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    }).catch(() => {});
    await failureEmail(message, `The b-roll could not be ${mode === 'stock' ? 'found' : 'made'}.`);
    process.exit(1);
});
