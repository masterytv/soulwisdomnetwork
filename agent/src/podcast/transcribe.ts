import { AssemblyAI, type Transcript } from 'assemblyai';
import type { DetectedSpeaker } from '../../../types/episode';
import { PermanentError, withRetry } from './errors';

export function createAssemblyAI(apiKey: string) {
    return new AssemblyAI({ apiKey });
}

type Client = ReturnType<typeof createAssemblyAI>;

// Uploads the audio and starts a job; returns immediately. The id is saved to Firestore
// before we wait, so a crashed run resumes polling instead of paying for a second job.
export async function submitTranscription(client: Client, audioFile: string, speechModels: string[], candidates: string[]) {
    const uploadUrl = await withRetry('AssemblyAI upload', () => client.files.upload(audioFile));
    const transcript = await withRetry('AssemblyAI submit', () => client.transcripts.submit({
        audio: uploadUrl,
        speech_models: speechModels,
        speaker_labels: true,
        speech_understanding: {
            request: {
                speaker_identification: { speaker_type: 'name', known_values: candidates },
            },
        },
    }));
    return transcript.id;
}

// A job that errored on AssemblyAI's side is resubmitted on retry rather than re-polled.
export async function hasFailed(client: Client, id: string) {
    const transcript = await withRetry('AssemblyAI get', () => client.transcripts.get(id));
    return transcript.status === 'error';
}

export async function waitForTranscript(client: Client, id: string): Promise<Transcript> {
    const transcript = await withRetry('AssemblyAI poll', () =>
        client.transcripts.waitUntilReady(id, { pollingInterval: 15_000, pollingTimeout: 3 * 60 * 60_000 }),
    );
    if (transcript.status === 'error') throw new PermanentError(`AssemblyAI: ${transcript.error}`);
    return transcript;
}

// One entry per diarized voice with a few sample lines, for Checkpoint A.
export function summariseSpeakers(transcript: Transcript): DetectedSpeaker[] {
    // The mapping goes from diarization label to identified name. utterance.speaker may hold
    // either, so accept both; a label is preferred because two voices can map to one name.
    const mapping = transcript.speech_understanding?.response?.speaker_identification?.mapping ?? {};
    const labelFor = new Map(Object.entries(mapping).map(([label, name]) => [name, label]));

    const bySpeaker = new Map<string, DetectedSpeaker>();
    for (const u of transcript.utterances ?? []) {
        const label = u.speaker in mapping ? u.speaker : (labelFor.get(u.speaker) ?? u.speaker);
        let s = bySpeaker.get(label);
        if (!s) {
            s = { label, suggestedName: mapping[label] ?? null, wordCount: 0, talkSeconds: 0, samples: [] };
            bySpeaker.set(label, s);
        }
        const words = u.words?.length ?? u.text.split(/\s+/).length;
        s.wordCount += words;
        s.talkSeconds += (u.end - u.start) / 1000;
        // Mid-length lines identify a voice best; skip "yeah" and monologues.
        if (s.samples.length < 3 && words >= 8 && words <= 40) {
            s.samples.push({ text: u.text, startMs: u.start });
        }
    }
    return [...bySpeaker.values()]
        .map(s => ({ ...s, talkSeconds: Math.round(s.talkSeconds) }))
        .sort((a, b) => b.talkSeconds - a.talkSeconds);
}
