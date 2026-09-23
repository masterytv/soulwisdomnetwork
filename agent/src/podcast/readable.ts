// Human-readable transcript for checking speaker names against the video.

import type { Transcript } from 'assemblyai';
import type { DetectedSpeaker } from '../../../types/episode';
import { labelResolver } from './transcribe';

export function timestamp(ms: number) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function displayName(label: string, suggestedName: string | null) {
    return suggestedName ?? `Speaker ${label} (unknown)`;
}

export function speakerSummary(speakers: DetectedSpeaker[]) {
    return speakers.map(s => [
        `${s.label}  ${displayName(s.label, s.suggestedName)}`,
        `   Talk time ${timestamp(s.talkSeconds * 1000)} · first line at ${timestamp(s.firstMs)}`,
        ...s.samples.slice(0, 2).map(x => `   [${timestamp(x.startMs)}] "${x.text}"`),
    ].join('\n')).join('\n\n');
}

export function readableTranscript(
    episode: { title: string; recordedAt: string | null; durationSeconds?: number },
    speakers: DetectedSpeaker[],
    transcript: Transcript,
) {
    const { labelOf } = labelResolver(transcript);
    const names = new Map(speakers.map(s => [s.label, displayName(s.label, s.suggestedName)]));
    const header = [
        episode.title,
        [
            episode.recordedAt ? `Recorded ${episode.recordedAt.slice(0, 10)}` : null,
            episode.durationSeconds ? `${Math.round(episode.durationSeconds / 60)} min` : null,
        ].filter(Boolean).join(' · '),
        '',
        'SPEAKERS (as detected — check each against the video)',
        '',
        speakerSummary(speakers),
        '',
        'TRANSCRIPT',
        '',
    ];
    const lines = (transcript.utterances ?? []).map(u => {
        const label = labelOf(u.speaker);
        return `[${timestamp(u.start)}] ${names.get(label) ?? `Speaker ${label}`}: ${u.text}`;
    });
    return [...header, ...lines].join('\n') + '\n';
}
