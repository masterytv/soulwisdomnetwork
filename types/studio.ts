// Shapes returned by the Podcast Studio API (app/api/studio) to the dashboard.

import type { ShowNotes } from '@/lib/showNotes';
import type { ReviewUtterance } from '@/lib/transcript';
import type { DetectedSpeaker, EpisodeNotes, EpisodeStage, EpisodeStatus, TranscriptCorrections } from './episode';

export interface DriveVideo {
    id: string;
    name: string;
    sizeBytes: number;
    addedAt: string | null;        // ISO; when it arrived in the folder (Drive createdTime)
}

export interface EpisodeSummary {
    id: string;
    title: string;
    status: EpisodeStatus;
    stage: EpisodeStage;
    recordedAt: string | null;
    durationSeconds: number | null;
    costUsd: number;
    error: { stage: string; message: string; permanent: boolean } | null;
    docUrl: string | null;
    createdAt: number | null;      // epoch ms
    updatedAt: number | null;
    stuck: boolean;
    notesStatus: EpisodeNotes['status'] | null;   // show notes, once the transcript is accepted                // in progress and unchanged for 24 hours (spec 005 section 5)
}

export interface IngestRun {
    id: number;
    status: string;
    conclusion: string | null;
    event: string;
    createdAt: string;
    url: string;
}

export interface Pipeline {
    backlog: DriveVideo[];         // in the saved drag-and-drop order
    toProcess: DriveVideo[];
    episodes: EpisodeSummary[];
    runs: IngestRun[];
    monthCostUsd: number;
}

// GET /api/studio/episodes/[id]: everything the speaker review page needs.
export interface EpisodeReview {
    id: string;
    title: string;
    status: EpisodeStatus;
    recordedAt: string | null;
    durationSeconds: number | null;
    docUrl: string | null;
    videoUrl: string | null;       // signed link to the 720p proxy, valid for a few hours
    voices: DetectedSpeaker[];
    utterances: ReviewUtterance[];
    corrections: TranscriptCorrections;
    version: number;               // send back when saving; a mismatch means someone else saved
    accepted: { by: string; at: number; version: number | null } | null;   // version null: accepted before it was recorded
    knownNames: string[];          // offered when renaming a voice
}

// GET /api/studio/episodes/[id]/notes: the Checkpoint B page.
export interface EpisodeNotesView {
    id: string;
    title: string;
    recordedAt: string | null;
    durationSeconds: number | null;
    videoUrl: string | null;
    transcriptAccepted: boolean;
    notes: {
        status: EpisodeNotes['status'];
        draft: ShowNotes | null;
        version: number;
        model: string | null;
        unverifiedQuotes: string[];
        error: string | null;
        requestedAt: number | null;
        generatedAt: number | null;
        approved: { by: string; at: number; version: number } | null;
    } | null;
}
