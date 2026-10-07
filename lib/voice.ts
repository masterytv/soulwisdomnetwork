// Why: the voice clean-up the Editor Light render uses (docs/specs/019-editor-light-v2.md item 3.2). The
// clean-up comparison (item 3.1) lets Tom and the producer hear three ways side by side; this makes each one
// a choice: today's chain (the default), DeepFilterNet (free, on the runner) or Auphonic (free plan only,
// decision D1: 2 hours of audio a month). The Studio settings choose for every episode, and an episode's
// edit can choose its own. Auphonic's hours are counted here, in `studio/spending`, so a render that
// would go over is refused before it starts; the code never buys credits.

import { sequenceOf, type SequenceEdit } from './sequence';

export const VOICE_CLEANUPS = ['standard', 'deepfilter', 'auphonic'] as const;
export type VoiceCleanup = typeof VOICE_CLEANUPS[number];

export const VOICE_LABELS: Record<VoiceCleanup, string> = {
    standard: 'Standard (ffmpeg: high-pass, noise reduction, compressor)',
    deepfilter: 'DeepFilterNet (free, stronger noise removal; adds about 8 minutes an hour to the render)',
    auphonic: 'Auphonic (free plan: 2 hours of audio a month)',
};

export const VOICE_SHORT: Record<VoiceCleanup, string> = { standard: 'Standard', deepfilter: 'DeepFilterNet', auphonic: 'Auphonic' };

// The episode's own choice when it has one, else the Studio's.
export function voiceFor(edit: { voice?: VoiceCleanup | null } | undefined, studio: VoiceCleanup): VoiceCleanup {
    return edit?.voice ?? studio;
}

// ─── Auphonic's free hours ──────────────────────────────────────────────────

// The free plan: 2 hours of audio a month (decision D1). Auphonic charges what it is sent, so only the
// stretch the edit keeps goes (auphonicSpan), not the whole recording.
export const AUPHONIC_FREE_SECONDS = 2 * 3600;

// Room either side of the kept stretch, so the clean-up has settled by the first word.
export const AUPHONIC_MARGIN_MS = 2000;

// What Auphonic is sent for an edit: from just before the first moment it plays to just after the last,
// transitions' overlaps included, in the recording's times.
export function auphonicSpan(edit: SequenceEdit, durationMs: number, words?: { start: number; end: number }[]): { startMs: number; endMs: number } | null {
    const seq = sequenceOf(edit, durationMs, words);
    if (!seq.clips.length) return null;
    const starts = [...seq.clips.map(c => c.startMs), ...seq.joins.map(j => j.bStartMs)];
    const ends = [...seq.clips.map(c => c.endMs), ...seq.joins.map(j => j.aEndMs)];
    return {
        startMs: Math.max(0, Math.min(...starts) - AUPHONIC_MARGIN_MS),
        endMs: Math.min(durationMs, Math.max(...ends) + AUPHONIC_MARGIN_MS),
    };
}

// One render's hold on the month's hours: made when the render is started, so two renders at once
// cannot both fit, and given back when the render fails before anything was sent.
export interface AuphonicHold { id: string; at: number; seconds: number; episodeId: string }

// The calendar month a time falls in, as Auphonic resets its free hours: "2026-10" (UTC).
export const monthOf = (at: number) => new Date(at).toISOString().slice(0, 7);

// Seconds held this month.
export function auphonicUsed(holds: AuphonicHold[], now: number): number {
    const month = monthOf(now);
    return holds.filter(h => monthOf(h.at) === month).reduce((t, h) => t + h.seconds, 0);
}

// Why a render of `seconds` would not fit this month, or null when it fits.
export function auphonicRefusal(holds: AuphonicHold[], seconds: number, now: number): string | null {
    const used = auphonicUsed(holds, now);
    if (used + seconds <= AUPHONIC_FREE_SECONDS) return null;
    return `Auphonic's free plan has ${hm(Math.max(0, AUPHONIC_FREE_SECONDS - used))} left this month and this render needs ${hm(seconds)}. `
        + 'Choose Standard or DeepFilterNet for it, or wait for next month.';
}

// "1 h 05 min", "12 min".
export function hm(seconds: number): string {
    const m = Math.ceil(seconds / 60);
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}
