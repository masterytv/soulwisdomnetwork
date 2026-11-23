// The image post (docs/specs/026-social-publishing.md, stage 3): a quote card with the speaker's own words from the
// Short. A guest's goes over a frame of them, taken from the episode's final cut within the Short's startMs–endMs (the
// rendered Short has captions burned in); a host's over their frame one post in five, else over the episode's own b-roll
// (lib/social/picture.ts, Tom 2026-11-23). Claude picks the quote, its gold phrase and the frame; lib/social/quote.ts
// checks them.

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
import { chooseCardPicture, pictureCredit } from '../../../lib/social/picture';
import type { BrollImage, ShortItem } from '../../../types/episode';
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
    hosts: string[];                // the Studio settings' hosts
    broll: BrollImage[];            // the episode's b-roll
    at: number | null;              // the Short's place in the original recording, for the nearest b-roll
    used: string[];                 // b-roll pictures the episode's other cards already use
    hostFrameAllowed: boolean;      // none of the last 4 image posts showed a host
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

    // The picture: the chosen frame again at full size, cropped to 4:5 around the speaker, or the episode's b-roll.
    const picture = chooseCardPicture({ speaker: item.speaker, hosts: ctx.hosts, images: ctx.broll, at: ctx.at, used: ctx.used, hostFrameAllowed: ctx.hostFrameAllowed });
    const prefix = `social/${ctx.episodeId}/${item.id}`;
    const card = path.join(dir, 'image-card.jpg');
    let local: string | null = null, picturePath: string | null = null;
    if (picture.kind === 'speaker' || picture.kind === 'host') {
        const crop = cropAround(FRAME_WIDTH, FRAME_HEIGHT, checked.centre);
        local = path.join(dir, 'frame.jpg');
        await grabClipFrame(ctx.finalUrl, local, times[checked.frame - 1] / 1000, { size: 'full', crop: { x: crop.x, y: crop.y, w: crop.width, h: crop.height } });
        picturePath = `${prefix}/image-frame.jpg`;
        await ctx.bucket.upload(local, { destination: picturePath, contentType: 'image/jpeg' });
    } else if (picture.kind === 'broll') {
        local = path.join(dir, `broll${path.extname(picture.path) || '.png'}`);
        await ctx.bucket.file(picture.path).download({ destination: local });
        picturePath = picture.path;
    }
    console.log(`  🖼️ Picture: ${picture.kind}${picture.kind === 'broll' ? ` (${picture.source}, ${picture.path})` : ''}`);
    await drawCard(quoteCardHtml({ pictureUrl: local ? pictureUrl(local) : null, quote: checked.quote, gold: checked.gold, speaker: item.speaker, show: ctx.show }, ASSETS), card);
    await ctx.bucket.upload(card, { destination: `${prefix}/image-card.jpg`, contentType: 'image/jpeg' });
    fs.rmSync(dir, { recursive: true, force: true });
    return {
        content: {
            title: item.title, cardPath: `${prefix}/image-card.jpg`, picture: picture.kind, picturePath,
            aiPicture: picture.kind === 'broll' && picture.source === 'ai',
            quote: checked.quote, gold: checked.gold,
            ...imageCaptions({
                quote: checked.quote, speaker: item.speaker, show: ctx.show, episode: ctx.episode, shortId: item.id, hashtags: ctx.hashtags,
                pictureCredit: pictureCredit(picture),
            }),
        },
    };
}
