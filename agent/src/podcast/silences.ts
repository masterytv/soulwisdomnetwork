// Silences in an episode's audio (docs/specs/019-editor-light-v2.md, item 1.1), measured once at
// ingest with ffmpeg's silencedetect and saved beside the audio as analysis/silences.json. The
// editor's "Mark filler words and long pauses" uses them for pauses instead of the gaps between
// words: AssemblyAI's word ends are not exact, and a long word can hide a silence.
// Free and quick (an hour of audio takes well under a minute), so no spending limit applies.

import type { SilencesFile } from '../../../lib/edit';
import { probeDuration } from './media';
import { parseSilences, runFiltered } from './renderQc';

export const SILENCE = {
    noiseDb: -35,   // quieter than this is silence; room tone sits well below it
    minMs: 300,     // shorter silences are the gaps inside speech
} as const;

// Measures the silences in an audio (or video) file.
export async function measureSilences(file: string): Promise<SilencesFile> {
    const durationSeconds = await probeDuration(file);
    const { kept } = await runFiltered('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn',
        '-af', `silencedetect=noise=${SILENCE.noiseDb}dB:d=${SILENCE.minMs / 1000}`, '-f', 'null', '-']);
    const silences = parseSilences(kept, durationSeconds)
        .map(s => ({ startMs: Math.round(s.startSec * 1000), endMs: Math.round(s.endSec * 1000) }))
        .filter(s => s.endMs > s.startMs);
    return { noiseDb: SILENCE.noiseDb, minMs: SILENCE.minMs, silences };
}
