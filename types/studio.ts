// Shapes returned by the Podcast Studio API (app/api/studio) to the dashboard.

import type { EpisodeStage, EpisodeStatus } from './episode';

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
    stuck: boolean;                // in progress and unchanged for 24 hours (spec 005 section 5)
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
