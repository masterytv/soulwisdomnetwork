// The show notes request itself (docs/specs/007-show-notes.md): the prompt, the call to Claude
// and what it cost. Shared by notes.ts, which saves the draft, and compareNotes.ts, which
// only reports on it, so both send exactly the same prompt.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { anchorToTranscript, mmss, notesSchemaFor, parseShowNotes, timeBroll, type ShowNotes, type SpokenWord } from '../../../lib/showNotes';
import { DEFAULT_SETTINGS, notesSystemPrompt, type StudioSettings } from '../../../lib/studioSettings';
import type { Episode } from '../../../types/episode';
import { cachedText, claudeUsd, priceOf } from './claudeCost';

// Chosen by a side-by-side run (compareNotes.ts; docs/specs/007-show-notes.md). Effort is set
// explicitly because Opus 5.5 defaults to 'medium'.
export const NOTES_MODEL = 'claude-opus-5-5';
export const NOTES_EFFORT: Effort = 'high';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ReviewedLine { name: string; clip: boolean; start: number; text: string; words: { text: string; start: number; end: number }[] }

// Consecutive lines from one voice become one paragraph, each stamped with its start in
// milliseconds so Claude can return exact chapter, quote and b-roll times.
function transcriptForPrompt(lines: ReviewedLine[]) {
    const paragraphs: { start: number; who: string; text: string[] }[] = [];
    for (const l of lines) {
        const who = l.clip ? `${l.name} (clip played during the episode)` : l.name;   // quotable too
        const last = paragraphs[paragraphs.length - 1];
        if (last?.who === who) last.text.push(l.text);
        else paragraphs.push({ start: l.start, who, text: [l.text] });
    }
    return paragraphs.map(p => `[${p.start}ms ${mmss(p.start)}] ${p.who}: ${p.text.join(' ')}`).join('\n\n');
}

function speakerList(lines: ReviewedLine[]) {
    const seen = new Map<string, boolean>();
    for (const l of lines) if (!seen.has(l.name)) seen.set(l.name, l.clip);
    return [...seen].map(([name, clip]) => (clip ? `${name} (guest, heard in a recording played during the episode)` : name)).join(', ');
}

// The instructions come from the Studio settings (lib/studioSettings.ts notesSystemPrompt); with
// the default settings they are word for word the Soul Wisdom Collective prompt this always sent.


export interface Draft {
    notes: ShowNotes;
    unverified: string[];     // quotes and clips not found word for word in the transcript
    model: string;            // the model that answered (a fallback may have stepped in)
    inputTokens: number;
    outputTokens: number;
    usd: number;
    seconds: number;
}

export async function draftNotes(client: Anthropic, episode: Episode, lines: ReviewedLine[],
    model = NOTES_MODEL, effort = NOTES_EFFORT, settings: StudioSettings = DEFAULT_SETTINGS, direction = ''): Promise<Draft> {
    const transcript = transcriptForPrompt(lines);
    const started = Date.now();
    // Streamed: twenty long quotes need more output than a single non-streamed request allows.
    const response = await client.beta.messages.stream({
        model,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort, format: betaZodOutputFormat(notesSchemaFor(settings)) },  // schema follows the format and choices
        // The system prompt and the transcript are cached for an hour: a redraft (or compareNotes) sends
        // them again unchanged and reads them back at a fraction of the price; only the direction differs.
        system: [cachedText(notesSystemPrompt(settings), '1h')],
        messages: [{
            role: 'user',
            content: [
                cachedText(`Episode: "${episode.title}"${episode.recordedAt ? `, recorded ${episode.recordedAt.slice(0, 10)}` : ''}.\n` +
                    `Speakers: ${speakerList(lines)}.\n\n` +
                    `<transcript>\n${transcript}\n</transcript>`, '1h'),
                { type: 'text', text: 'Write the show notes.' + (direction ? `\n\n${direction}` : '') },
            ],
        }],
    }).finalMessage();

    if (response.stop_reason === 'refusal') throw new Error('Claude declined to write notes for this transcript');
    if (response.stop_reason === 'max_tokens') throw new Error('The notes were cut off (max_tokens); try again');
    if (!response.parsed_output) throw new Error('Claude returned notes in an unexpected shape');

    const notes = parseShowNotes(response.parsed_output);
    // Quotes and teaser clips get their exact times and speaker from the transcript words.
    const words: SpokenWord[] = lines.flatMap(l => l.words.map(w => ({ ...w, speaker: l.name, clip: l.clip })));
    // B-roll starts one second after its cue words (docs/specs/023-stock-broll.md, "Timing"); a cue not found is listed with the quotes.
    const unverified = [...anchorToTranscript(notes, words), ...timeBroll(notes, words).map(c => `B-roll cue: ${c}`)];
    const { input_tokens, output_tokens } = response.usage;
    const usd = Math.round(claudeUsd(response.usage, priceOf(response.model, model, NOTES_MODEL)) * 100) / 100;
    return {
        notes, unverified, model: response.model, inputTokens: input_tokens, outputTokens: output_tokens, usd,
        seconds: Math.round((Date.now() - started) / 1000),
    };
}
