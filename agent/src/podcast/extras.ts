// Why: the social posts and follow-up email Claude writes from the approved show notes, called by
// the notes job when the producer asks for them. Runs in GitHub Actions, never on the web server.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ExtrasSchema, extrasSystemPrompt, extrasUserMessage, cleanExtras, type Extras } from '../../../lib/extras';
import type { StudioSettings } from '../../../lib/studioSettings';
import type { Episode } from '../../../types/episode';
import { claudeUsd, priceOf } from './claudeCost';
import { NOTES_EFFORT, NOTES_MODEL } from './notesDraft';

// Writes the social posts and follow-up email from the approved show notes.
export async function writeExtras(client: Anthropic, episode: Episode, settings: StudioSettings): Promise<{ extras: Extras; usd: number }> {
    const notes = episode.notes?.approved;
    if (!notes) throw new Error('Approve the show notes first');
    const link = episode.youtube?.url || settings.siteUrl;
    const response = await client.beta.messages.stream({
        model: NOTES_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: NOTES_EFFORT, format: betaZodOutputFormat(ExtrasSchema) },
        system: extrasSystemPrompt(settings),
        messages: [{ role: 'user', content: extrasUserMessage(notes, link, episode.extras?.direction ?? '') }],
    }).finalMessage();

    if (response.stop_reason === 'refusal') throw new Error('Claude declined to write the posts');
    if (!response.parsed_output) throw new Error('Claude returned the posts in an unexpected shape');

    const parsed = response.parsed_output as Extras;
    const usd = Math.round(claudeUsd(response.usage, priceOf(response.model, NOTES_MODEL)) * 100) / 100;
    return { extras: cleanExtras(parsed), usd };
}
