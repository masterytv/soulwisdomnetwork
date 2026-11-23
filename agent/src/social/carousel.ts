// The carousel (docs/specs/026-social-publishing.md, stage 4): Claude looks at frames of the Short's moment in the final
// cut and the episode's nearest b-roll, chooses an idea carousel (the usual) or a guest's story, writes the slides' lines
// and picks a picture for each; lib/social/carousel.ts checks them. Each slide is drawn as a 1080 × 1350 JPEG, then the end slide, all saved to Storage.

import { spawnSync } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { cropAround, endSlideHtml, storySlideHtml } from '../../../lib/social/cards';
import { carouselCaptions, youtubePostText } from '../../../lib/social/captions';
import {
    NO_PICTURE, CAROUSEL_BROLL, CAROUSEL_ESTIMATE_USD, carouselFrameTimes, carouselPrompt, carouselSystem, checkSlides, SlidesSchema,
} from '../../../lib/social/carousel';
import { brollCredit, isHost, nearestBroll } from '../../../lib/social/picture';
import type { CarouselContent, CarouselSlide } from '../../../lib/social/plan';
import type { ShortItem } from '../../../types/episode';
import { claudeUsd, priceOf } from '../podcast/claudeCost';
import { grabClipFrame } from '../podcast/clipsRender';
import { NOTES_EFFORT, NOTES_MODEL } from '../podcast/notesDraft';
import { ASSETS, drawCard, pictureUrl } from './cards';
import type { ImageContext } from './image';
import { record, reserve } from './spending';

const FRAME_WIDTH = 1920, FRAME_HEIGHT = 1080;

export type CarouselContext = Omit<ImageContext, 'used' | 'hostFrameAllowed'>;

// A picture small enough for Claude to look at: 640 wide, JPEG.
function small(input: string, output: string) {
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-vf', 'scale=640:-2', '-q:v', '4', output]);
    if (r.status !== 0) throw new Error(`ffmpeg could not shrink ${path.basename(input)}: ${r.stderr?.toString().slice(0, 200)}`);
}

export async function makeCarousel(item: ShortItem, ctx: CarouselContext): Promise<{ content: CarouselContent } | { notMade: string }> {
    if (ctx.spoken.trim().split(/\s+/).length < 20) return { notMade: 'The Short has too few words to retell' };
    const dir = path.join(ctx.workDir, `${item.id}-carousel`);
    fs.mkdirSync(dir, { recursive: true });
    const host = isHost(item.speaker, ctx.hosts);

    // The pictures Claude chooses from: frames of the moment, then the nearest b-roll.
    const times = carouselFrameTimes(item.startMs, item.endMs);
    const looks: { id: string; file: string }[] = [];
    for (const [i, ms] of times.entries()) {
        const file = path.join(dir, `f${i + 1}.jpg`);
        await grabClipFrame(ctx.finalUrl, file, ms / 1000, { size: 'small' });
        looks.push({ id: `F${i + 1}`, file });
    }
    const broll = nearestBroll(ctx.broll, ctx.at, CAROUSEL_BROLL);
    const brollFiles = new Map<string, string>();
    for (const [i, b] of broll.entries()) {
        const full = path.join(dir, `b${i + 1}-full${path.extname(b.path) || '.png'}`), file = path.join(dir, `b${i + 1}.jpg`);
        await ctx.bucket.file(b.path).download({ destination: full });
        small(full, file);
        brollFiles.set(`B${i + 1}`, full);
        looks.push({ id: `B${i + 1}`, file });
    }
    const frameIds = looks.filter(l => l.id.startsWith('F')).map(l => l.id);
    const brollIds = [...brollFiles.keys()];

    await reserve(ctx.db, `social carousel: ${item.title}`, CAROUSEL_ESTIMATE_USD);
    const client = new Anthropic({ apiKey: ctx.apiKey });
    const response = await client.beta.messages.stream({
        model: NOTES_MODEL,
        max_tokens: 12000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: NOTES_EFFORT, format: betaZodOutputFormat(SlidesSchema) },
        system: carouselSystem(),
        messages: [{
            role: 'user',
            content: [
                ...looks.flatMap(l => [
                    { type: 'text' as const, text: l.id },
                    { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: fs.readFileSync(l.file).toString('base64') } },
                ]),
                { type: 'text' as const, text: carouselPrompt({ title: item.title, speaker: item.speaker, spoken: ctx.spoken, frames: frameIds.length, broll: brollIds.length, host }) },
            ],
        }],
    }).finalMessage();
    const usd = Math.round(claudeUsd(response.usage, priceOf(response.model, NOTES_MODEL)) * 100) / 100;
    await record(ctx.db, ctx.episodeId, 'social_carousel', usd);
    if (response.stop_reason === 'refusal' || !response.parsed_output) return { notMade: 'Claude gave no slides' };
    const checked = checkSlides(response.parsed_output, { frameIds, brollIds, spoken: ctx.spoken, host });
    for (const d of checked.dropped) console.log(`    ✂️ ${d}`);
    if (!checked.ok) return { notMade: checked.why };
    console.log(`  🎠 ${checked.mode} carousel, ${checked.slides.length} slides ($${usd.toFixed(2)})`);

    // Draw each slide on its picture at full size, then the end slide.
    const prefix = `social/${ctx.episodeId}/${item.id}/carousel`;
    const total = checked.slides.length + 1;
    const slides: CarouselSlide[] = [];
    const credits: string[] = [];
    let aiPicture = false;
    for (const [i, s] of checked.slides.entries()) {
        let local: string | null, picturePath: string | null;
        if (s.picture === NO_PICTURE) {
            local = null;
            picturePath = null;
        } else if (s.picture.startsWith('F')) {
            const crop = cropAround(FRAME_WIDTH, FRAME_HEIGHT, s.centre);
            local = path.join(dir, `frame-${i + 1}.jpg`);
            await grabClipFrame(ctx.finalUrl, local, times[Number(s.picture.slice(1)) - 1] / 1000, { size: 'full', crop: { x: crop.x, y: crop.y, w: crop.width, h: crop.height } });
            picturePath = `${prefix}/frame-${i + 1}.jpg`;
            await ctx.bucket.upload(local, { destination: picturePath, contentType: 'image/jpeg' });
        } else {
            const b = broll[Number(s.picture.slice(1)) - 1];
            local = brollFiles.get(s.picture)!;
            picturePath = b.path;
            const credit = brollCredit(b);
            if (credit) credits.push(credit);
            if ((b.source ?? 'ai') === 'ai') aiPicture = true;
        }
        const out = path.join(dir, `slide-${i + 1}.jpg`);
        await drawCard(storySlideHtml({
            pictureUrl: local ? pictureUrl(local) : null, line: s.line, gold: s.gold, index: i + 1, total, speaker: item.speaker,
            question: s.picture === NO_PICTURE,
        }, ASSETS), out);
        await ctx.bucket.upload(out, { destination: `${prefix}/slide-${i + 1}.jpg`, contentType: 'image/jpeg' });
        slides.push({
            path: `${prefix}/slide-${i + 1}.jpg`, line: s.line, gold: s.gold, picturePath,
            picture: s.picture === NO_PICTURE ? 'none' : s.picture.startsWith('F') ? 'frame' : 'broll',
        });
    }
    const end = path.join(dir, `slide-${total}.jpg`);
    await drawCard(endSlideHtml({ speaker: item.speaker, show: ctx.show, index: total }, ASSETS), end);
    await ctx.bucket.upload(end, { destination: `${prefix}/slide-${total}.jpg`, contentType: 'image/jpeg' });
    slides.push({ path: `${prefix}/slide-${total}.jpg`, line: null, gold: null, picture: 'end', picturePath: null });
    fs.rmSync(dir, { recursive: true, force: true });

    return {
        content: {
            title: item.title, mode: checked.mode, slides, aiPicture,
            ...carouselCaptions({
                title: item.title, speaker: item.speaker, show: ctx.show, episode: ctx.episode, shortId: item.id, hashtags: ctx.hashtags,
                pictureCredits: credits, mode: checked.mode,
            }),
            youtube: { text: youtubePostText({ title: item.title, speaker: item.speaker, show: ctx.show, episode: ctx.episode }) },
        },
    };
}
