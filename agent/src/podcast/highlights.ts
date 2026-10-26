// Why: Claude picks the highlight moments (docs/specs/021-motion-graphics.md, item M4), run by the
// notes job as mode "highlights" when the editor's "Suggest highlights" asks for it. Claude only
// nominates; everything checkable is checked in lib/highlights.ts — each moment verified word for word
// against the accepted transcript, the pacing (drops, spacing, density, layouts) decided by rule — and
// the result is merged into the edit by the caller's transaction (suggestions replace earlier
// suggestions, never a highlight the producer touched). GitHub Actions only.

import type Anthropic from '@anthropic-ai/sdk';
import {
    highlightsSystemPrompt, highlightsUserMessage, MomentsPayloadSchema, paceMoments, verifyMoments,
    type HighlightDensity, type MomentsPayload, type PacedDrop,
} from '../../../lib/highlights';
import type { HighlightLayer } from '../../../lib/layers';
import { editedDuration, keepRanges } from '../../../lib/edit';
import type { SpokenWord } from '../../../lib/showNotes';
import { producerInstructions, type StudioSettings } from '../../../lib/studioSettings';
import type { Episode } from '../../../types/episode';
import { ask } from './claudeEdits';

interface Line { name: string; words: { text: string; start: number; end: number }[] }

export interface SuggestedHighlights {
    highlights: HighlightLayer[];
    descriptors: MomentsPayload['descriptors'];
    keyIdeas: MomentsPayload['keyIdeas'];
    unverified: string[];
    dropped: PacedDrop[];
    usd: number;
}

// Asks Claude for the moments, verifies and paces them. The density is the Studio's setting once M5
// adds it; until then Tom's D4 answer, Normal — a ceiling, never a quota.
export async function suggestHighlights(
    client: Anthropic, episode: Episode, settings: StudioSettings,
    download: (storagePath: string) => Promise<Buffer>,
    density: Exclude<HighlightDensity, 'off'> = 'normal',
): Promise<SuggestedHighlights> {
    const reviewedPath = episode.review?.reviewedPath;
    if (!reviewedPath) throw new Error('Accept the transcript first');
    const edit = episode.edit;
    if (!edit) throw new Error('Open the Studio editor first (or Build for Studio editor): it sets up and saves the first edit');
    const lines = (JSON.parse((await download(reviewedPath)).toString('utf8')) as { lines: Line[] }).lines;
    const words: SpokenWord[] = lines.flatMap(l => l.words.map(w => ({ ...w, speaker: l.name, clip: false })));
    if (!words.length) throw new Error('The accepted transcript has no words');
    const durationMs = (episode.media?.durationSeconds ?? 0) * 1000 || words[words.length - 1].end;

    const notes = episode.notes?.approved ?? episode.notes?.draft;
    const keyQuotes = (notes?.quotes ?? []).map(q => ({ startMs: q.startMs, endMs: Math.max(q.startMs, q.endMs), text: q.text }));
    const editedMs = editedDuration(keepRanges(durationMs, edit.cuts));
    const maxMoments = Math.min(40, Math.ceil(editedMs / 90_000) + 5);

    const { parsed, usd } = await ask(client, MomentsPayloadSchema,
        highlightsSystemPrompt(producerInstructions(settings)),
        highlightsUserMessage(lines, keyQuotes.map(q => q.text), maxMoments), 'medium', 16000);

    const { verified, unverified } = verifyMoments(parsed.moments, words);
    const { kept, dropped } = paceMoments(verified, words, {
        cuts: edit.cuts, teasers: edit.teasers ?? [], durationMs, density, keyQuotes,
    });
    return {
        highlights: kept, descriptors: parsed.descriptors, keyIdeas: parsed.keyIdeas,
        unverified, dropped, usd: Math.round(usd * 100) / 100,
    };
}
