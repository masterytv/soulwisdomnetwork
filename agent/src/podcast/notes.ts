// Spec 005 step 5: draft the show notes for one episode from its accepted transcript.
// The same run also writes the social posts and follow-up email when those were asked for, and
// (Part I) translates the captions and finds retakes when those were asked for.
// Runs in GitHub Actions (.github/workflows/podcast_notes.yml), started by the Podcast
// Studio when a transcript is accepted or a producer asks for new notes.
// docs/specs/007-show-notes.md

import Anthropic from '@anthropic-ai/sdk';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { mmss, mergeRedraft, parseShowNotes, redraftDirection } from '../../../lib/showNotes';
import type { Episode } from '../../../types/episode';
import { loadAlert } from './config';
import { findRetakes, translateCaptions } from './claudeEdits';
import { writeExtras } from './extras';
import { draftNotes, NOTES_EFFORT, NOTES_MODEL, type ReviewedLine } from './notesDraft';
import { describeError, failureSubject, sendEmail } from './notify';
import { loadSettings, storageBucket } from './settings';

function required(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable ${name}`);
    return value;
}

const episodeId = required('EPISODE_ID');
if (!/^[\w-]{10,}$/.test(episodeId)) throw new Error(`Not a valid episode ID: ${episodeId}`);
const alert = loadAlert();
const runUrl = process.env.GITHUB_RUN_URL || '';
const serviceAccount = JSON.parse(required('PODCAST_SA_JSON'));
initializeApp({ credential: cert(serviceAccount), storageBucket: storageBucket() });
const ref = getFirestore().collection('episodes').doc(episodeId);
let approved = false;   // never overwrite approved notes, even to record a failure
// What this run was started for (podcast_notes.yml's mode input): never guessed from the episode.
const MODES = ['notes', 'extras', 'translations', 'retakes'] as const;
const mode = (process.env.NOTES_MODE || 'notes') as typeof MODES[number];
if (!MODES.includes(mode)) throw new Error(`Not a notes job: ${mode}`);
const extrasRun = mode === 'extras';   // so the catch handler knows which failure to record
// Translations and retakes (Part I) record their own failure on their own record.
const sideRun = mode === 'translations' || mode === 'retakes';

async function main() {
    const episode = (await ref.get()).data() as Episode | undefined;
    if (!episode) throw new Error(`Episode ${episodeId} not found`);
    if (extrasRun) return runExtras(episode);
    if (sideRun) return runSideJob(episode, mode as 'translations' | 'retakes');
    const reviewedPath = episode.review?.reviewedPath;
    if (episode.status !== 'speakers_confirmed' || !reviewedPath) {
        throw new Error('The transcript has not been accepted yet');
    }
    if (episode.notes?.status === 'approved') {
        approved = true;
        throw new Error('Show notes are already approved; nothing to do');
    }

    await ref.update({
        'notes.status': 'generating', 'notes.startedAt': FieldValue.serverTimestamp(), 'notes.error': null,
        updatedAt: FieldValue.serverTimestamp(),
    });

    const [raw] = await getStorage().bucket().file(reviewedPath).download();
    const lines = (JSON.parse(raw.toString('utf8')) as { lines: ReviewedLine[] }).lines;
    console.log(`📝 ${episode.title}: ${lines.length} lines`);

    const client = new Anthropic({ apiKey: required('ANTHROPIC_API_KEY') });
    // The Studio settings choose the kind of recording and the writing (lib/studioSettings.ts).
    const settings = await loadSettings(getFirestore());
    const SITE = settings.studioUrl;
    // A redraft request from the producer: the direction goes into the prompt, and only the
    // chosen part is replaced.
    const redraft = episode.notes?.redraft ?? null;
    const direction = redraftDirection(redraft);
    const { notes, unverified, model, inputTokens, outputTokens, usd } = await draftNotes(client, episode, lines, NOTES_MODEL, NOTES_EFFORT, settings, direction);
    // When only one part is redrafted, the saved draft keeps the rest as the producer left it.
    const merged = redraft && redraft.only !== 'all' && episode.notes?.draft
        ? mergeRedraft(parseShowNotes(episode.notes.draft), notes, redraft.only) : notes;
    console.log(`✅ ${model}: ${inputTokens} in, ${outputTokens} out, ~$${usd}; ${unverified.length} quote(s) not found verbatim`);

    await ref.update({
        'notes.status': 'ready',
        'notes.generated': notes,
        'notes.draft': merged,
        'notes.version': FieldValue.increment(1),
        'notes.model': model,
        'notes.unverifiedQuotes': unverified,
        'notes.generatedAt': FieldValue.serverTimestamp(),
        'notes.error': null,
        'notes.redraft': null,
        'costs.items': FieldValue.arrayUnion({ item: 'show_notes', usd, at: new Date() }),
        'costs.totalUsd': FieldValue.increment(usd),
        updatedAt: FieldValue.serverTimestamp(),
    });

    await sendEmail({ alert }, `Show notes ready: ${episode.title}`, [
        `Claude has drafted the show notes for "${episode.title}".`,
        '',
        `Review and approve them: ${SITE}/admin/podcast/${episodeId}/notes#notes`,
        '',
        `Suggested title: ${notes.titles[0]}`,
        '',
        'In this episode:',
        ...notes.teaserClips.map(c => `  [${mmss(c.startMs)}] ${c.speaker}: "${c.text}"`),
        '',
        notes.summary,
    ].join('\n'));
}

// Writes the social posts and follow-up email when the producer asked for them; the notes are already approved.
async function runExtras(episode: Episode) {
    if (episode.notes?.status !== 'approved' || !episode.notes.approved) throw new Error('Approve the show notes first');
    await ref.update({
        'extras.status': 'working',
        'extras.startedAt': FieldValue.serverTimestamp(),
        'extras.error': null,
        updatedAt: FieldValue.serverTimestamp(),
    });
    const client = new Anthropic({ apiKey: required('ANTHROPIC_API_KEY') });
    const settings = await loadSettings(getFirestore());
    const { extras, usd } = await writeExtras(client, episode, settings);
    await ref.update({
        'extras.status': 'ready',
        'extras.result': extras,
        'extras.generatedAt': FieldValue.serverTimestamp(),
        'extras.error': null,
        'costs.items': FieldValue.arrayUnion({ item: 'writing_extras', usd, at: new Date() }),
        'costs.totalUsd': FieldValue.increment(usd),
        updatedAt: FieldValue.serverTimestamp(),
    });
}

// One of Part I's jobs, the one this run was started for: caption translations or finding retakes.
// A failure is recorded on its own record and emailed; the run then ends as failed so it shows in
// GitHub Actions. The notes are never touched.
async function runSideJob(episode: Episode, only: 'translations' | 'retakes') {
    const client = new Anthropic({ apiKey: required('ANTHROPIC_API_KEY') });
    const settings = await loadSettings(getFirestore());
    const bucket = getStorage().bucket();
    const download = async (path: string) => (await bucket.file(path).download())[0];
    const jobs: { key: 'translations' | 'retakes'; label: string; run: () => Promise<Record<string, unknown>> }[] = [];
    if (only === 'translations') jobs.push({ key: 'translations', label: 'Caption translations', run: async () => {
        const { tracks, finalAt, usd } = await translateCaptions(client, episodeId, episode, settings, {
            download,
            upload: async (path, text, contentType) => { await bucket.file(path).save(text, { contentType: `${contentType}; charset=utf-8` }); },
        });
        return { 'translations.tracks': tracks, 'translations.finalAt': finalAt, cost: { item: 'translations', usd } };
    } });
    if (only === 'retakes') jobs.push({ key: 'retakes', label: 'Finding retakes', run: async () => {
        const { found, notFound, usd } = await findRetakes(client, episode, download);
        console.log(`✂️ ${found.length} retakes (${notFound} not found word for word)`);
        return { 'retakes.found': found, 'retakes.notFound': notFound, cost: { item: 'retakes', usd } };
    } });
    let failed = false;
    for (const job of jobs) {
        try {
            await ref.update({ [`${job.key}.status`]: 'working', [`${job.key}.startedAt`]: FieldValue.serverTimestamp(), [`${job.key}.error`]: null });
            const { cost, ...fields } = await job.run();
            const { item, usd } = cost as { item: string; usd: number };
            await ref.update({
                ...fields,
                [`${job.key}.status`]: 'ready', [`${job.key}.generatedAt`]: FieldValue.serverTimestamp(), [`${job.key}.error`]: null,
                'costs.items': FieldValue.arrayUnion({ item, usd, at: new Date() }),
                'costs.totalUsd': FieldValue.increment(usd),
                updatedAt: FieldValue.serverTimestamp(),
            });
            console.log(`✅ ${job.label}: ~$${usd}`);
        } catch (error) {
            failed = true;
            const message = (error as Error).message;
            console.error(`❌ ${job.label}: ${message}`);
            await ref.update({ [`${job.key}.status`]: 'failed', [`${job.key}.error`]: message, updatedAt: FieldValue.serverTimestamp() }).catch(() => {});
            await sendEmail({ alert }, failureSubject(`${job.label} failed: ${episodeId}`, message),
                `${job.label} did not finish.\n\n${describeError(message)}\n\nTry again from the Studio.${runUrl ? `\n\nRun log: ${runUrl}` : ''}`);
        }
    }
    if (failed) process.exit(1);
}

main().catch(async error => {
    const message = (error as Error).message;
    console.error(`❌ ${message}`);
    if (extrasRun) {
        await ref.update({ 'extras.status': 'failed', 'extras.error': message, updatedAt: FieldValue.serverTimestamp() })
            .catch(() => {});
        await sendEmail({ alert }, failureSubject(`Social posts failed: ${episodeId}`, message),
            `The social posts and follow-up email could not be written.\n\n${describeError(message)}\n\nTry again from the show notes page.${runUrl ? `\n\nRun log: ${runUrl}` : ''}`);
        process.exit(1);
    }
    if (sideRun) {
        // Failed before the job itself could record it (it records its own failures).
        await ref.update({ [`${mode}.status`]: 'failed', [`${mode}.error`]: message, updatedAt: FieldValue.serverTimestamp() })
            .catch(() => {});
        process.exit(1);
    }
    if (!approved) {
        await ref.update({ 'notes.status': 'failed', 'notes.error': message, updatedAt: FieldValue.serverTimestamp() })
            .catch(() => {});
    }
    await sendEmail({ alert }, failureSubject(`Show notes failed: ${episodeId}`, message),
        `Show notes could not be drafted.\n\n${describeError(message)}\n\nTry again from the Podcast Studio.${runUrl ? `\n\nRun log: ${runUrl}` : ''}`);
    process.exit(1);
});
