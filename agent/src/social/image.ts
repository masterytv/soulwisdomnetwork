// The image post (docs/specs/026-social-publishing.md, stage 3): a quote card with the speaker's own words from the
// Short over a frame of them, taken from the episode's final cut within the Short's startMs–endMs (the rendered Short
// has captions burned in). Claude picks the quote, its gold phrase and the frame; lib/social/quote.ts checks them.

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { Firestore } from 'firebase-admin/firestore';
import type { Bucket } from '@google-cloud/storage';
import { cropAround, quoteCardHtml } from '../../../lib/social/cards';
import { imageCaptions } from '../../../lib/social/captions';
import { checkQuote, frameTimes, QUOTE_ESTIMATE_USD, quotePrompt, QuotePickSchema, quoteSystem } from '../../../lib/social/quote';
import type { ImageContent } from '../../../lib/social/plan';
import type { ShortItem } from '../../../types/episode';
import { claudeUsd, priceOf } from '../podcast/claudeCost';
import { grabClipFrame } from '../podcast/clipsRender';
import { NOTES_EFFORT, NOTES_MODEL } from '../podcast/notesDraft';
import { ASSETS, drawCard, pictureUrl } from './cards';
import { record, reserve } from './spending';

const FRAME_WIDTH = 1920, FRAME_HEIGHT = 1080;

export interface ImageContext {
    db: Firestore;
    bucket: Bucket;
    episodeId: string;
    finalUrl: string;               // the final cut, a signed link
    spoken: string;                 // the Short's words
    show: string;
    episode: { url: string; linkText: string };
    hashtags: string[];
    workDir: string;
    apiKey: string;
}

// An image post's content, or why none can be made (kept, so it is never paid for again).
export async function makeImagePost(item: ShortItem, ctx: ImageContext): Promise<{ content: ImageContent } | { notMade: string }> {
    if (ctx.spoken.trim().split(/\s+/).length < 6) return { notMade: 'The Short has too few words for a quote' };
    const dir = path.join(ctx.workDir, item.id);
    fs.mkdirSync(dir, { recursive: true });
    const times = frameTimes(item.startMs, item.endMs);
    const small: string[] = [];
    for (const [i, ms] of times.entries()) {
        const file = path.join(dir, `look-${i}.jpg`);
        await grabClipFrame(ctx.finalUrl, file, ms / 1000, { size: 'small' });
        small.push(file);
    }

    await reserve(ctx.db, `social image post: ${item.title}`, QUOTE_ESTIMATE_USD);
    const client = new Anthropic({ apiKey: ctx.apiKey });
    const response = await client.beta.messages.stream({
        model: NOTES_MODEL,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: NOTES_EFFORT, format: betaZodOutputFormat(QuotePickSchema) },
        system: quoteSystem(),
        messages: [{
            role: 'user',
            content: [
                ...small.flatMap((file, i) => [
                    { type: 'text' as const, text: `Frame ${i + 1}` },
                    { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: fs.readFileSync(file).toString('base64') } },
                ]),
                { type: 'text' as const, text: quotePrompt({ title: item.title, speaker: item.speaker, spoken: ctx.spoken, frames: small.length }) },
            ],
        }],
    }).finalMessage();
    const usd = Math.round(claudeUsd(response.usage, priceOf(response.model, NOTES_MODEL)) * 100) / 100;
    await record(ctx.db, ctx.episodeId, 'social_image', usd);
    if (response.stop_reason === 'refusal' || !response.parsed_output) return { notMade: 'Claude gave no quote' };
    const checked = checkQuote(response.parsed_output, ctx.spoken, small.length);
    if (!checked.ok) return { notMade: checked.why };
    console.log(`  💬 "${checked.quote}" (gold: "${checked.gold}"${checked.goldFallback ? ', its last clause' : ''}; $${usd.toFixed(2)})`);

    // The chosen frame again at full size, cropped to 4:5 around the speaker.
    const crop = cropAround(FRAME_WIDTH, FRAME_HEIGHT, checked.centre);
    const frame = path.join(dir, 'frame.jpg'), card = path.join(dir, 'image-card.jpg');
    await grabClipFrame(ctx.finalUrl, frame, times[checked.frame - 1] / 1000, { size: 'full', crop: { x: crop.x, y: crop.y, w: crop.width, h: crop.height } });
    await drawCard(quoteCardHtml({ pictureUrl: pictureUrl(frame), quote: checked.quote, gold: checked.gold, speaker: item.speaker, show: ctx.show }, ASSETS), card);
    const prefix = `social/${ctx.episodeId}/${item.id}`;
    await ctx.bucket.upload(frame, { destination: `${prefix}/image-frame.jpg`, contentType: 'image/jpeg' });
    await ctx.bucket.upload(card, { destination: `${prefix}/image-card.jpg`, contentType: 'image/jpeg' });
    fs.rmSync(dir, { recursive: true, force: true });
    return {
        content: {
            title: item.title, cardPath: `${prefix}/image-card.jpg`, framePath: `${prefix}/image-frame.jpg`,
            quote: checked.quote, gold: checked.gold,
            ...imageCaptions({ quote: checked.quote, speaker: item.speaker, show: ctx.show, episode: ctx.episode, shortId: item.id, hashtags: ctx.hashtags }),
        },
    };
}
