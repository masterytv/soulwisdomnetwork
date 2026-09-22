// Spec 005 steps 1-3: pick up new recordings from Drive, copy them to Cloud Storage, make
// a 720p proxy and an audio-only file, and transcribe with candidate speaker names.
// Runs in GitHub Actions (.github/workflows/podcast_ingest.yml), NOT on App Hosting.
//
// Every step records its output on the episode document before moving on, so a failed or
// interrupted run resumes where it stopped and never pays for the same transcript twice.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as fs from 'fs';
import * as path from 'path';
import type { Episode, EpisodeStage } from '../../../types/episode';
import { ASSEMBLYAI_USD_PER_HOUR, HOSTS, MAX_ATTEMPTS, SETTLE_MINUTES, loadConfig } from './config';
import {
    checkFolderAccess, createDrive, downloadFile, isVideo, listEpisodeFolders, listFolderFiles, moveFolder, readParticipants,
    type DriveFile,
} from './drive';
import { PermanentError, withRetry } from './errors';
import { makeAudio, makeProxy, probeDuration } from './media';
import { sendFailureAlert, type Failure } from './notify';
import { createAssemblyAI, hasFailed, submitTranscription, summariseSpeakers, waitForTranscript } from './transcribe';

const config = loadConfig();
const serviceAccount = JSON.parse(config.serviceAccountJson);

initializeApp({ credential: cert(serviceAccount), storageBucket: config.bucket });
const db = getFirestore();
const bucket = getStorage().bucket();
const drive = createDrive(serviceAccount);
const assembly = createAssemblyAI(config.assemblyAiKey);

const PARTICIPANTS_FILE = /^participants(\.txt)?$/i;

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

async function processEpisode(folder: DriveFile): Promise<Failure | null> {
    const folderId = folder.id!;
    const title = folder.name ?? folderId;
    const files = await listFolderFiles(drive, folderId);

    const settleCutoff = Date.now() - SETTLE_MINUTES * 60_000;
    // createdTime too: an upload can keep the file's original modifiedTime.
    const lastChange = (f: DriveFile) => Math.max(Date.parse(f.createdTime ?? '') || 0, Date.parse(f.modifiedTime ?? '') || 0);
    if (files.some(f => lastChange(f) > settleCutoff)) {
        console.log(`⏳ ${title}: changed in the last ${SETTLE_MINUTES} min, waiting for the next run.`);
        return null;
    }
    const videos = files.filter(isVideo);
    if (videos.length === 0) {
        console.log(`⏳ ${title}: no video yet, skipping.`);
        return null;
    }

    const ref = db.collection('episodes').doc(folderId);
    const existing = (await ref.get()).data() as Episode | undefined;

    if (existing?.error?.permanent) {
        console.log(`⛔ ${title}: failed permanently at "${existing.error.stage}" — skipping until retried.`);
        return null;
    }
    if (existing?.status === 'awaiting_speaker_review') {
        // Finished on an earlier run but the Drive move did not happen.
        await moveFolder(drive, folderId, config.toProcessFolderId, config.processedFolderId);
        console.log(`📁 ${title}: already transcribed, moved to Processed.`);
        return null;
    }

    const video = videos[0];
    const participantsFile = files.find(f => PARTICIPANTS_FILE.test(f.name ?? ''));
    const participants = participantsFile ? await readParticipants(drive, participantsFile) : [];
    const candidates = [...new Set([...HOSTS, ...participants])];

    if (config.dryRun) {
        console.log(`🔎 [dry run] ${title}: would ingest "${video.name}" (${video.mimeType}, ${video.size} bytes) ` +
            `with candidates ${candidates.join(', ')}${existing ? ` — resuming from "${existing.stage}"` : ''}`);
        return null;
    }

    console.log(`🎙️ ${title}: ${existing ? `resuming at "${existing.stage}"` : 'new episode'}`);
    if (!existing) {
        const episode: Episode = {
            title,
            status: 'ingesting',
            stage: 'copy',
            drive: {
                folderId,
                folderName: title,
                videoFileId: video.id!,
                videoName: video.name ?? 'video',
                videoMimeType: video.mimeType ?? 'video/mp4',
                videoSizeBytes: Number(video.size ?? 0),
            },
            candidateSpeakers: candidates,
            costs: { items: [], totalUsd: 0 },
            error: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };
        await ref.set(episode);
    } else if (!existing.transcription?.transcriptId) {
        // participants.txt may have been corrected before a retry.
        await touch(ref, { candidateSpeakers: candidates });
    }

    const workDir = path.join(config.workDir, 'podcast', folderId);
    fs.mkdirSync(workDir, { recursive: true });
    const localSource = path.join(workDir, `source${path.extname(video.name ?? '') || '.mp4'}`);
    const localProxy = path.join(workDir, 'proxy_720p.mp4');
    const localAudio = path.join(workDir, 'audio.m4a');
    const prefix = `episodes/${folderId}`;
    let stage: EpisodeStage = existing?.stage ?? 'copy';

    const ensureLocalSource = async () => {
        if (!fs.existsSync(localSource)) {
            console.log(`  ⬇️ Downloading "${video.name}" from Drive`);
            await downloadFile(drive, video.id!, localSource);
        }
    };

    try {
        if (videos.length > 1) {
            throw new PermanentError(`Expected one video in the folder, found ${videos.length}: ${videos.map(v => v.name).join(', ')}`);
        }

        // 1. Copy the original to Cloud Storage.
        stage = 'copy';
        let media = existing?.media ?? {};
        if (!(await storageHas(media.sourcePath))) {
            await ensureLocalSource();
            console.log('  ☁️ Uploading original to Cloud Storage');
            const sourcePath = await upload(localSource, `${prefix}/source/${video.name}`, video.mimeType ?? 'video/mp4');
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

        // 4. Ready for Checkpoint A; move the folder out of the inbox.
        stage = 'finalize';
        await touch(ref, {
            status: 'awaiting_speaker_review',
            stage,
            error: null,
            'transcription.transcriptPath': transcriptPath,
            'transcription.speakerIdStatus': speakerId?.status ?? null,
            'transcription.speakerMapping': speakerId?.mapping ?? {},
            'transcription.speakers': speakers,
        });
        await moveFolder(drive, folderId, config.toProcessFolderId, config.processedFolderId);
        console.log(`  ✅ ${title}: ${speakers.length} speaker(s) detected, ready for speaker review.`);
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
        return permanent ? { episode: title, stage, message, folderId } : null;
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
}

async function main() {
    console.log(`🤖 Podcast ingest starting${config.dryRun ? ' [dry run]' : ''}`);

    if (config.retryFolderId) {
        const ref = db.collection('episodes').doc(config.retryFolderId);
        if ((await ref.get()).exists) {
            await touch(ref, { error: null });
            console.log(`🔁 Cleared the error on ${config.retryFolderId}; it will be retried now.`);
        } else {
            console.warn(`⚠️ No episode with folder ID ${config.retryFolderId}.`);
        }
    }

    const inboxName = await checkFolderAccess(drive, config.toProcessFolderId, 'To Process');
    const doneName = await checkFolderAccess(drive, config.processedFolderId, 'Processed');
    console.log(`🔑 Drive access OK: "${inboxName}" and "${doneName}"`);

    const folders = await listEpisodeFolders(drive, config.toProcessFolderId);
    console.log(`📂 ${folders.length} folder(s) in "${inboxName}"`);

    const failures: Failure[] = [];
    for (const folder of folders) {
        try {
            const failure = await processEpisode(folder);
            if (failure) failures.push(failure);
        } catch (error) {
            // Failed before an episode document existed (e.g. Drive unreachable).
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ ${folder.name}: ${message}`);
            failures.push({ episode: folder.name ?? folder.id!, stage: 'copy', message, folderId: folder.id! });
        }
    }

    await sendFailureAlert(config, failures);
    if (failures.length > 0) process.exit(1);
    console.log('🏁 Done.');
}

main().catch(async error => {
    console.error('❌ Podcast ingest crashed:', error);
    await sendFailureAlert(config, [{
        episode: '(whole run)', stage: 'startup', message: error instanceof Error ? error.message : String(error), folderId: '',
    }]).catch(() => {});
    process.exit(1);
});
