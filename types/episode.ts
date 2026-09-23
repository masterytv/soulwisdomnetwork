// Firestore `episodes/{driveFileId}` — written by agent/src/podcast/ingest.ts via the
// Admin SDK. See docs/specs/005-podcast-production-pipeline.md, steps 1-3.

export type EpisodeStatus =
    | 'ingesting'                // copying from Drive and making the proxy + audio files
    | 'transcribing'             // submitted to AssemblyAI, waiting for the result
    | 'awaiting_speaker_review'  // Checkpoint A: a person confirms the speaker names
    | 'speakers_confirmed'       // transcript accepted in the Podcast Studio
    | 'failed';

export type EpisodeStage = 'copy' | 'media' | 'transcribe' | 'finalize';

export interface EpisodeError {
    stage: EpisodeStage;
    message: string;
    permanent: boolean;   // permanent failures are not retried until someone asks
    attempts: number;     // failed runs so far; transient failures become permanent at 3
    at: unknown;            // Firestore Timestamp
}

export interface CostItem {
    item: string;         // e.g. 'transcription_raw'
    usd: number;
    at: unknown;            // Firestore Timestamp
}

export interface DetectedSpeaker {
    label: string;        // diarization label from AssemblyAI, e.g. 'A'
    suggestedName: string | null;
    firstMs: number;      // start of this voice's first line
    wordCount: number;
    talkSeconds: number;
    samples: { text: string; startMs: number }[];
}

export interface Episode {
    title: string;                        // from the file name, Zoom prefix stripped
    recordedAt: string | null;            // ISO date from a Zoom file name, if present
    status: EpisodeStatus;
    stage: EpisodeStage;                  // the stage in progress, or the last one reached
    drive: {
        fileId: string;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
    };
    candidateSpeakers: string[];          // names offered to AssemblyAI (the hosts)
    media?: {
        sourcePath?: string;              // Cloud Storage object paths
        proxyPath?: string;               // 720p H.264
        audioPath?: string;               // mono AAC
        durationSeconds?: number;
    };
    transcription?: {
        provider: 'assemblyai';
        transcriptId: string;
        speechModels: string[];
        transcriptPath?: string;          // full word-level JSON in Cloud Storage
        speakerIdStatus?: string | null;
        speakerMapping?: Record<string, string>;
        speakers?: DetectedSpeaker[];
    };
    review?: {
        transcriptTextPath?: string;      // readable transcript in Cloud Storage
        docUrl?: string;                  // same transcript as a Google Doc next to the video
        notifiedAt?: unknown;             // "ready for review" email sent
    };
    costs: { items: CostItem[]; totalUsd: number };
    error: EpisodeError | null;
    createdAt: unknown;
    updatedAt: unknown;
}
