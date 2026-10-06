// Spec 005 steps 1-3: pick up new recordings from Drive, copy them to Cloud Storage, make
// a 720p proxy and an audio-only file, measure the audio's silences (spec 019 item 1.1), make the
// Studio editor's waveform peaks and thumbnail sheets (spec 020 item E2), and transcribe with
// candidate speaker names.
// Recordings uploaded in the Studio (lib/server/uploads.ts) are already in Cloud Storage; they
// go through the same steps without Drive, which is optional when only uploads are used.
// Runs in GitHub Actions (.github/workflows/podcast_ingest.yml), NOT on App Hosting.
//
// Every step records its output on the episode document before moving on, so a failed or
// interrupted run resumes where it stopped and never pays for the same transcript twice.

import type { Transcript } from 'assemblyai';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as fs from 'fs';
import * as path from 'path';
import type { DetectedSpeaker, Episode, EpisodeStage } from '../../../types/episode';
import { THUMBS, type ThumbIndex } from '../../../lib/thumbs';
import { ASSEMBLYAI_USD_PER_HOUR, MAX_ATTEMPTS, SETTLE_MINUTES, loadConfig } from './config';
import {
    checkFolderAccess, createDrive, createGoogleDoc, downloadFile, isVideo, listFolderFiles, listSubfolders, moveItem, type DriveFile,
} from './drive';
import { PermanentError, withRetry } from './errors';
import { makeAudio, makeProxy, probeDuration } from './media';
import { episodeTitle, recordedAt } from './naming';
import { sendEmail, sendFailureAlert, type Failure } from './notify';
import { postUsageReport } from './usageReport';
import { readableTranscript, speakerSummary } from './readable';
import { loadSettings } from './settings';
import { measureSilences } from './silences';
import { makeThumbs, measurePeaks } from './timelineMedia';
import { createAssemblyAI, hasFailed, submitTranscription, summariseSpeakers, waitForTranscript } from './transcribe';

const config = loadConfig();
const serviceAccount = JSON.parse(config.serviceAccountJson);

initializeApp({ credential: cert(serviceAccount), storageBucket: config.bucket });
const db = getFirestore();
const bucket = getStorage().bucket();
const drive = createDrive(serviceAccount);
const assembly = createAssemblyAI(config.assemblyAiKey);

async function storageHas(objectPath: string | undefined) {
    if (!objectPath) return false;
    const [exists] = await withRetry('Storage exists', () => bucket.file(objectPath).exists());
    return exists;
}

async function upload(local: string, destination: string, contentType: string) {
    await withRetry('Storage upload', () => bucket.upload(local, { destination, resumable: true, metadata: { contentType } }));
    return destination;
}

function touch(ref: DocumentReference, fields: Record<string, unknown>) {
    return withRetry('Firestore update', () => ref.update({ ...fields, updatedAt: FieldValue.serverTimestamp() }));
}

// The audio's silences (spec 019 item 1.1), for the editor's pause suggestions: measured with
// ffmpeg and saved as analysis/silences.json. Free, and never fails the episode: without them the
// editor uses the gaps between words, and the next run's catch-up tries again.
async function analyseSilences(ref: DocumentReference, fileId: string, audioPath: string, localAudio: string) {
    try {
        if (!fs.existsSync(localAudio)) {
            await withRetry('Storage download', () => bucket.file(audioPath).download({ destination: localAudio }));
        }
        const result = await measureSilences(localAudio);
        const local = `${localAudio}.silences.json`;
        fs.writeFileSync(local, JSON.stringify(result));
        const silencesPath = await upload(local, `episodes/${fileId}/analysis/silences.json`, 'application/json');
        await touch(ref, { 'media.silencesPath': silencesPath });
        console.log(`  🔇 ${result.silences.length} silences measured`);
        return silencesPath;
    } catch (error) {
        console.warn(`  ⚠️ Could not measure the silences, will retry next run: ${(error as Error).message}`);
        return undefined;
    }
}

// The Studio editor's waveform (spec 019 item 2.1): the audio's peaks, saved as analysis/peaks.bin
// (lib/peaks.ts). Like the silences, free, and never fails the episode: the timeline shows no
// waveform until the next run's catch-up makes them.
async function analysePeaks(ref: DocumentReference, fileId: string, audioPath: string, localAudio: string) {
    try {
        if (!fs.existsSync(localAudio)) {
            await withRetry('Storage download', () => bucket.file(audioPath).download({ destination: localAudio }));
        }
        const peaks = await measurePeaks(localAudio);
        const local = `${localAudio}.peaks.bin`;
        fs.writeFileSync(local, peaks);
        const peaksPath = await upload(local, `episodes/${fileId}/analysis/peaks.bin`, 'application/octet-stream');
        await touch(ref, { 'media.peaksPath': peaksPath });
        console.log(`  〰️ Waveform peaks made (${Math.round(peaks.length / 1024)} KB)`);
        return peaksPath;
    } catch (error) {
        console.warn(`  ⚠️ Could not make the waveform peaks, will retry next run: ${(error as Error).message}`);
        return undefined;
    }
}

// The Studio editor's picture strip: a frame every 5 s from the proxy, on sheets of a hundred
// (analysis/thumbs_N.jpg), listed in analysis/thumbs.json (lib/thumbs.ts). Free, and never fails
// the episode.
async function analyseThumbs(ref: DocumentReference, fileId: string, proxyPath: string, localProxy: string, durationSeconds: number) {
    const dir = `${localProxy}.thumbs`;
    try {
        if (!fs.existsSync(localProxy)) {
            await withRetry('Storage download', () => bucket.file(proxyPath).download({ destination: localProxy }));
        }
        const { sheets, count } = await makeThumbs(localProxy, dir, durationSeconds);
        const paths: string[] = [];
        for (const [i, sheet] of sheets.entries()) paths.push(await upload(sheet, `episodes/${fileId}/analysis/thumbs_${i}.jpg`, 'image/jpeg'));
        const index: ThumbIndex = { ...THUMBS, count, sheets: paths };
        const local = path.join(dir, 'thumbs.json');
        fs.writeFileSync(local, JSON.stringify(index));
        const thumbsPath = await upload(local, `episodes/${fileId}/analysis/thumbs.json`, 'application/json');
        await touch(ref, { 'media.thumbsPath': thumbsPath });
        console.log(`  🖼️ ${count} timeline thumbnails on ${sheets.length} sheet(s)`);
        return thumbsPath;
    } catch (error) {
        console.warn(`  ⚠️ Could not make the timeline thumbnails, will retry next run: ${(error as Error).message}`);
        return undefined;
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// Episodes ingested before the silences, peaks or thumbnails were made (or whose making failed)
// get them now, a few per run, so a run with nothing new still fills them in. Thumbnails decode
// the whole proxy, so fewer of those per run.
const AUDIO_ANALYSIS_PER_RUN = 20;
const THUMBS_PER_RUN = 5;
async function catchUpAnalysis() {
    const docs = (await db.collection('episodes').get()).docs;
    const media = (d: (typeof docs)[number]) => (d.data() as Episode).media;
    const audio = docs.filter(d => { const m = media(d); return !!m?.audioPath && (!m.silencesPath || !m.peaksPath); }).slice(0, AUDIO_ANALYSIS_PER_RUN);
    const thumbs = docs.filter(d => { const m = media(d); return !!m?.proxyPath && !!m.durationSeconds && !m.thumbsPath; }).slice(0, THUMBS_PER_RUN);
    if (audio.length) console.log(`🔇 Measuring silences and waveforms for ${audio.length} earlier episode(s)`);
    for (const doc of audio) {
        const dir = path.join(config.workDir, 'podcast', `analysis-${doc.id}`);
        fs.mkdirSync(dir, { recursive: true });
        try {
            const m = media(doc)!;
            const localAudio = path.join(dir, 'audio.m4a');
            if (!m.silencesPath) await analyseSilences(doc.ref, doc.id, m.audioPath!, localAudio);
            if (!m.peaksPath) await analysePeaks(doc.ref, doc.id, m.audioPath!, localAudio);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }
    if (thumbs.length) console.log(`🖼️ Making timeline thumbnails for ${thumbs.length} earlier episode(s)`);
    for (const doc of thumbs) {
        const dir = path.join(config.workDir, 'podcast', `thumbs-${doc.id}`);
        fs.mkdirSync(dir, { recursive: true });
        try {
            const m = media(doc)!;
            await analyseThumbs(doc.ref, doc.id, m.proxyPath!, path.join(dir, 'proxy_720p.mp4'), m.durationSeconds!);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }
}

// Checkpoint A hand-off: a readable transcript in Storage, a Google Doc next to the video
// (shared drives only), and one "ready for review" email. Each part is recorded so a rerun
// never sends a second email or makes a second Doc.
async function publishReview(ref: DocumentReference, episode: Episode, speakers: DetectedSpeaker[], transcript: Transcript) {
    const review = episode.review ?? {};
    const text = readableTranscript(
        { title: episode.title, recordedAt: episode.recordedAt, durationSeconds: episode.media?.durationSeconds },
        speakers, transcript,
    );

    if (!review.transcriptTextPath) {
        const local = path.join(config.workDir, `${ref.id}-transcript.txt`);
        fs.writeFileSync(local, text);
        review.transcriptTextPath = await upload(local, `episodes/${ref.id}/transcripts/raw.txt`, 'text/plain; charset=utf-8');
        fs.rmSync(local, { force: true });
        await touch(ref, { 'review.transcriptTextPath': review.transcriptTextPath });
    }

    if (!review.docUrl && config.processedFolderId) {
        try {
            review.docUrl = await createGoogleDoc(drive, config.processedFolderId, `${episode.title} — transcript`, text);
            await touch(ref, { 'review.docUrl': review.docUrl });
            console.log(`  📄 Transcript Doc: ${review.docUrl}`);
        } catch (error) {
            console.warn(`  ⚠️ Could not create the transcript Doc (needs the folders in a shared drive): ` +
                `${(error as Error).message}`);
        }
    }

    if (!review.notifiedAt) {
        const body = [
            `"${episode.title}" is transcribed and ready for speaker review.`,
            '',
            review.docUrl ? `Transcript (Google Doc): ${review.docUrl}` : 'The full transcript is attached.',
            '',
            'Each speaker below shows when they first speak and two sample lines. Jump to those times in',
            'the video to check the names. "Speaker X (unknown)" means no name was matched, and',
            '"Name - 1" / "Name - 2" means two voices both sounded like that person.',
            '',
            speakerSummary(speakers),
        ].join('\n');
        const sent = await sendEmail(config, `Ready for speaker review: ${episode.title}`, body,
            [{ filename: `${episode.title} - transcript.txt`, content: text }]);
        if (sent) {
            await touch(ref, { 'review.notifiedAt': FieldValue.serverTimestamp() });
            // The episode has started: post what it should take to the Usage page.
            await postUsageReport(db, ref.id, 'started');
        }
    }
}

// Episodes that finished before the review hand-off existed, or whose email or Doc failed.
async function catchUpReviews() {
    const snap = await db.collection('episodes').where('status', '==', 'awaiting_speaker_review').get();
    for (const doc of snap.docs) {
        const episode = doc.data() as Episode;
        if (episode.review?.notifiedAt && episode.review?.docUrl) continue;
        if (!episode.transcription?.transcriptPath) continue;
        try {
            const [raw] = await withRetry('Storage download', () => bucket.file(episode.transcription!.transcriptPath!).download());
            const transcript = JSON.parse(raw.toString('utf-8')) as Transcript;
            let speakers = episode.transcription.speakers ?? [];
            if (!episode.review?.notifiedAt) {
                // Nobody has reviewed yet, so refresh the summary with the current rules.
                speakers = summariseSpeakers(transcript);
                await touch(doc.ref, { 'transcription.speakers': speakers });
            }
            console.log(`📨 ${episode.title}: catching up the review hand-off`);
            await publishReview(doc.ref, episode, speakers, transcript);
        } catch (error) {
            console.error(`❌ ${episode.title}: review hand-off failed: ${(error as Error).message}`);
        }
    }
}

// `uploaded`: the recording was uploaded in the Studio; its original is already in Cloud
// Storage, so it is read from there and there is no Drive file to move.
async function processEpisode(video: DriveFile, candidates: string[], uploaded = false): Promise<Failure | null> {
    const fileId = video.id!;
    const fileName = video.name ?? fileId;
    const title = episodeTitle(fileName);

    // createdTime too: an upload can keep the file's original modifiedTime.
    const lastChange = Math.max(Date.parse(video.createdTime ?? '') || 0, Date.parse(video.modifiedTime ?? '') || 0);
    if (!config.skipWait && lastChange > Date.now() - SETTLE_MINUTES * 60_000) {
        console.log(`⏳ ${title}: added in the last ${SETTLE_MINUTES} min, waiting for the next run.`);
        return null;
    }

    const ref = db.collection('episodes').doc(fileId);
    const existing = (await ref.get()).data() as Episode | undefined;

    if (existing?.error?.permanent) {
        console.log(`⛔ ${title}: failed permanently at "${existing.error.stage}" — skipping until retried.`);
        return null;
    }
    if (existing?.status === 'awaiting_speaker_review' && !uploaded) {
        // Finished on an earlier run but the Drive move did not happen.
        await moveItem(drive, fileId, config.toProcessFolderId, config.processedFolderId);
        console.log(`📁 ${title}: already transcribed, moved to Processed.`);
        return null;
    }

    // Guests are not known up front; they are named at Checkpoint A. `candidates` are the
    // Studio settings' speaker names (the hosts by default).

    if (config.dryRun) {
        console.log(`🔎 [dry run] "${title}": would ingest "${fileName}" (${video.mimeType}, ${video.size} bytes)` +
            `${existing ? ` — resuming from "${existing.stage}"` : ''}`);
        return null;
    }

    console.log(`🎙️ ${title}: ${existing ? `resuming at "${existing.stage}"` : 'new episode'}`);
    if (!existing) {
        const episode: Episode = {
            title,
            recordedAt: recordedAt(fileName),
            status: 'ingesting',
            stage: 'copy',
            drive: {
                fileId,
                fileName,
                mimeType: video.mimeType ?? 'video/mp4',
                sizeBytes: Number(video.size ?? 0),
            },
            candidateSpeakers: candidates,
            costs: { items: [], totalUsd: 0 },
            error: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };
        await ref.set(episode);
    }

    const workDir = path.join(config.workDir, 'podcast', fileId);
    fs.mkdirSync(workDir, { recursive: true });
    const localSource = path.join(workDir, `source${path.extname(fileName) || '.mp4'}`);
    const localProxy = path.join(workDir, 'proxy_720p.mp4');
    const localAudio = path.join(workDir, 'audio.m4a');
    const prefix = `episodes/${fileId}`;
    let stage: EpisodeStage = existing?.stage ?? 'copy';

    const ensureLocalSource = async () => {
        if (fs.existsSync(localSource)) return;
        if (uploaded) {
            console.log(`  ⬇️ Downloading "${fileName}" from Cloud Storage`);
            await withRetry('Storage download', () => bucket.file(existing!.media!.sourcePath!).download({ destination: localSource }));
        } else {
            console.log(`  ⬇️ Downloading "${fileName}" from Drive`);
            await downloadFile(drive, fileId, localSource);
        }
    };

    try {
        // 1. Copy the original to Cloud Storage.
        stage = 'copy';
        let media = existing?.media ?? {};
        if (!(await storageHas(media.sourcePath))) {
            await ensureLocalSource();
            console.log('  ☁️ Uploading original to Cloud Storage');
            const sourcePath = await upload(localSource, `${prefix}/source/${fileName}`, video.mimeType ?? 'video/mp4');
            media = { ...media, sourcePath };
            await touch(ref, { status: 'ingesting', stage, 'media.sourcePath': sourcePath });
        }

        // 2. 720p proxy and audio-only file.
        stage = 'media';
        if (!(await storageHas(media.proxyPath)) || !(await storageHas(media.audioPath))) {
            await touch(ref, { status: 'ingesting', stage });
            await ensureLocalSource();
            const durationSeconds = await probeDuration(localSource);
            console.log(`  🎞️ Making proxy and audio (${Math.round(durationSeconds / 60)} min)`);
            await makeProxy(localSource, localProxy);
            await makeAudio(localSource, localAudio);
            const proxyPath = await upload(localProxy, `${prefix}/proxy_720p.mp4`, 'video/mp4');
            const audioPath = await upload(localAudio, `${prefix}/audio.m4a`, 'audio/mp4');
            media = { ...media, proxyPath, audioPath, durationSeconds };
            await touch(ref, {
                'media.proxyPath': proxyPath, 'media.audioPath': audioPath, 'media.durationSeconds': durationSeconds,
            });
        }
        fs.rmSync(localSource, { force: true });
        if (!media.silencesPath && media.audioPath) media.silencesPath = await analyseSilences(ref, fileId, media.audioPath, localAudio);
        if (!media.peaksPath && media.audioPath) media.peaksPath = await analysePeaks(ref, fileId, media.audioPath, localAudio);
        if (!media.thumbsPath && media.proxyPath && media.durationSeconds) {
            media.thumbsPath = await analyseThumbs(ref, fileId, media.proxyPath, localProxy, media.durationSeconds);
        }

        // 3. Transcribe the raw recording with candidate speaker names.
        stage = 'transcribe';
        let transcriptId = existing?.transcription?.transcriptId;
        if (transcriptId && await hasFailed(assembly, transcriptId)) transcriptId = undefined;
        if (!transcriptId) {
            const estimate = Math.round((media.durationSeconds ?? 0) / 3600 * ASSEMBLYAI_USD_PER_HOUR * 100) / 100;
            const spent = existing?.costs?.totalUsd ?? 0;
            if (spent + estimate > config.costCapUsd) {
                throw new PermanentError(`Cost cap: $${spent} spent + $${estimate} transcription exceeds the $${config.costCapUsd} cap`);
            }
            if (!fs.existsSync(localAudio)) {
                await withRetry('Storage download', () => bucket.file(media.audioPath!).download({ destination: localAudio }));
            }
            console.log(`  📝 Submitting to AssemblyAI with ${candidates.join(', ')}`);
            transcriptId = await submitTranscription(assembly, localAudio, config.speechModels, candidates);
            await touch(ref, {
                status: 'transcribing',
                stage,
                transcription: { provider: 'assemblyai', transcriptId, speechModels: config.speechModels },
                'costs.items': FieldValue.arrayUnion({ item: 'transcription_raw', usd: estimate, at: new Date() }),
                'costs.totalUsd': FieldValue.increment(estimate),
            });
        } else {
            await touch(ref, { status: 'transcribing', stage });
        }

        console.log(`  ⏱️ Waiting for transcript ${transcriptId}`);
        const transcript = await waitForTranscript(assembly, transcriptId);
        const transcriptLocal = path.join(workDir, 'transcript_raw.json');
        fs.writeFileSync(transcriptLocal, JSON.stringify(transcript));
        const transcriptPath = await upload(transcriptLocal, `${prefix}/transcripts/raw.json`, 'application/json');
        const speakers = summariseSpeakers(transcript);
        const speakerId = transcript.speech_understanding?.response?.speaker_identification;

        // 4. Ready for Checkpoint A; move the video out of the inbox.
        stage = 'finalize';
        await touch(ref, {
            status: 'awaiting_speaker_review',
            stage,
            error: null,
            'transcription.transcriptPath': transcriptPath,
            'transcription.speakerIdStatus': speakerId?.status ?? null,
            'transcription.speakerMapping': speakerId?.mapping ?? {},
            'transcription.speakers': speakers,
            // Whether "um" and "uh" are written out (spec 019 item 1.6); AssemblyAI echoes the option.
            'transcription.disfluencies': transcript.disfluencies === true,
        });
        if (!uploaded) await moveItem(drive, fileId, config.toProcessFolderId, config.processedFolderId);
        console.log(`  ✅ ${title}: ${speakers.length} speaker(s) detected, ready for speaker review.`);
        try {
            await publishReview(ref, (await ref.get()).data() as Episode, speakers, transcript);
        } catch (error) {
            // The episode itself is done; the next run's catch-up retries the hand-off.
            console.warn(`  ⚠️ Review hand-off failed, will retry next run: ${(error as Error).message}`);
        }
        return null;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const attempts = (existing?.error?.attempts ?? 0) + 1;
        const permanent = error instanceof PermanentError || attempts >= MAX_ATTEMPTS;
        console.error(`  ❌ ${title} failed at "${stage}" (attempt ${attempts}${permanent ? ', permanent' : ''}): ${message}`);
        await touch(ref, {
            status: 'failed',
            stage,
            error: { stage, message, permanent, attempts, at: FieldValue.serverTimestamp() },
        });
        return permanent ? { episode: title, stage, message, fileId } : null;
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
}

async function main() {
    console.log(`🤖 Podcast ingest starting${config.dryRun ? ' [dry run]' : ''}${config.skipWait ? ' [skipping the upload wait]' : ''}`);

    if (config.retryFileId) {
        const ref = db.collection('episodes').doc(config.retryFileId);
        if ((await ref.get()).exists) {
            await touch(ref, { error: null });
            console.log(`🔁 Cleared the error on ${config.retryFileId}; it will be retried now.`);
        } else {
            console.warn(`⚠️ No episode with file ID ${config.retryFileId}.`);
        }
    }

    console.log(`🔑 Using service account ${serviceAccount.client_email}`);
    const settings = await loadSettings(db);
    const candidates = settings.hosts;
    const failures: Failure[] = [];

    // The Drive inbox is used unless the Studio settings turn it off; then its folders must be
    // set, so a missing repo variable fails the run instead of quietly skipping Drive.
    if (settings.useDrive) {
        if (!config.toProcessFolderId || !config.processedFolderId) {
            throw new Error('DRIVE_TO_PROCESS_FOLDER_ID and DRIVE_PROCESSED_FOLDER_ID must be set (repo variables), ' +
                'or turn off "Recordings also come in through Google Drive" in the Studio settings');
        }
        const inboxName = await checkFolderAccess(drive, config.toProcessFolderId, 'To Process');
        const doneName = await checkFolderAccess(drive, config.processedFolderId, 'Processed');
        console.log(`🔑 Drive access OK: "${inboxName}" and "${doneName}"`);

        // One video file = one episode. Anything else in the inbox is left alone.
        const videos = (await listFolderFiles(drive, config.toProcessFolderId)).filter(isVideo);
        console.log(`📂 ${videos.length} video(s) in "${inboxName}"`);
        for (const sub of await listSubfolders(drive, config.toProcessFolderId)) {
            console.warn(`⚠️ Subfolder "${sub.name}" is ignored — drop video files straight into "${inboxName}".`);
        }

        for (const video of videos) {
            try {
                const failure = await processEpisode(video, candidates);
                if (failure) failures.push(failure);
            } catch (error) {
                // Failed before an episode document existed (e.g. Drive unreachable).
                const message = error instanceof Error ? error.message : String(error);
                console.error(`❌ ${video.name}: ${message}`);
                failures.push({ episode: video.name ?? video.id!, stage: 'copy', message, fileId: video.id! });
            }
        }
    } else {
        console.log('📂 Drive is turned off in the Studio settings; processing Studio uploads only.');
    }

    // Recordings uploaded in the Studio that are not through yet (a failure that is not
    // permanent is tried again, as a Drive file still in the inbox would be).
    const uploads = (await db.collection('episodes').where('source', '==', 'upload').get()).docs
        .filter(d => {
            const e = d.data() as Episode;
            return e.status === 'ingesting' || e.status === 'transcribing' || (e.status === 'failed' && !e.error?.permanent);
        });
    console.log(`⬆️ ${uploads.length} uploaded recording(s) to process`);
    for (const doc of uploads) {
        const e = doc.data() as Episode;
        try {
            const failure = await processEpisode({ id: doc.id, name: e.drive.fileName, mimeType: e.drive.mimeType, size: String(e.drive.sizeBytes) }, candidates, true);
            if (failure) failures.push(failure);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ ${e.title}: ${message}`);
            failures.push({ episode: e.title, stage: 'copy', message, fileId: doc.id });
        }
    }

    if (!config.dryRun) await catchUpReviews();
    if (!config.dryRun) await catchUpAnalysis().catch(error => console.warn(`⚠️ Analysis catch-up stopped: ${(error as Error).message}`));

    await sendFailureAlert(config, failures);
    if (failures.length > 0) process.exit(1);
    console.log('🏁 Done.');
}

main().catch(async error => {
    console.error('❌ Podcast ingest crashed:', error);
    await sendFailureAlert(config, [{
        episode: '(whole run)', stage: 'startup', message: error instanceof Error ? error.message : String(error), fileId: '',
    }]).catch(() => {});
    process.exit(1);
});
