// The "Soul Wisdom Clips" thumbnail's moments (docs/specs/025-clips.md, step 4), for one clip:
//   1. who speaks: the reviewed transcript's turns, moved onto the final cut by its time map; the main speaker is
//      whoever speaks most of the clip, unless the producer chose another
//   2. candidates: loud moments in their voice, laughter, exclamations and reactions, key quotes, the title's
//      words, then evenly spread moments in their turns (lib/clipThumbs.ts)
//   3. Claude looks at the small frames and scores each face for expression and fit, and says where the speaker is
//   4. the best are grabbed again at full size, cropped to the speaker and cut out with rembg (cutout.py)
// A moment chosen by hand ("Use this moment") is one grab and one cut-out of the whole frame: no Claude.

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { MAX_MOMENTS } from '../../../lib/clips';
import {
    candidateMoments, cleanLook, cropBox, loudMoments, lookInstructions, MIN_CUTOUT_HEIGHT, MomentLookSchema, rankMoments, speakersIn,
    standOn, turnsOnFinal, wordCues, type ClipMoment, type Turn,
} from '../../../lib/clipThumbs';
import { timeMap, type TimedWord } from '../../../lib/retime';
import { claudeUsd, priceOf } from './claudeCost';
import { grabClipFrame, momentaryLoudness } from './clipsRender';
import { cutOutWithBoxes } from './cutout';
import { NOTES_EFFORT, NOTES_MODEL } from './notesDraft';

// The turns of the whole final cut, worked out once per run.
export function finalTurns(lines: { name: string; start: number; end: number; words: TimedWord[] }[], finalWords: TimedWord[], durationMs: number): Turn[] {
    const map = timeMap(lines.flatMap(l => l.words), finalWords, durationMs);
    return turnsOnFinal(lines, ms => map.at(ms));
}

export interface MomentClip {
    id: string; startMs: number; endMs: number; title: string; thumbText: string; thumbFeeling: string[]; thumbSpeaker: string | null;
}

export interface MomentContext {
    input: string;                     // the final cut (a signed link)
    workDir: string;
    words: TimedWord[];
    turns: Turn[];
    quotes: number[];                  // key quote starts on the final cut
    upload: (local: string, dest: string, contentType: string) => Promise<void>;
    destPrefix: string;                // episodes/<id>/clips/<clip>-moment-<time>
    apiKey: string;
}

async function bounded<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            out[i] = await fn(items[i], i);
        }
    }));
    return out;
}

// The moments for one clip, best first, at most MAX_MOMENTS, with what Claude cost. An empty list when nobody
// could be cut out (the Studio then offers the theme without a person and says why).
export async function findMoments(clip: MomentClip, ctx: MomentContext): Promise<{ found: ClipMoment[]; speakers: string[]; usd: number; note: string | null }> {
    const speakers = speakersIn(ctx.turns, clip.startMs, clip.endMs).map(s => s.speaker);
    const speaker = clip.thumbSpeaker && speakers.includes(clip.thumbSpeaker) ? clip.thumbSpeaker : speakers[0] ?? null;
    if (!speaker) return { found: [], speakers, usd: 0, note: 'Nobody is heard speaking in this clip in the reviewed transcript.' };
    const theirs = ctx.turns.filter(t => t.speaker === speaker);
    const series = await momentaryLoudness(ctx.input, clip.startMs / 1000, (clip.endMs - clip.startMs) / 1000).catch(error => {
        console.warn(`  ⚠️ No loudness for "${clip.title}": ${(error as Error).message}`);
        return [];
    });
    const candidates = candidateMoments({
        startMs: clip.startMs, endMs: clip.endMs, turns: theirs,
        loud: loudMoments(series, theirs, clip.startMs, clip.endMs),
        cues: wordCues(ctx.words, clip.startMs, clip.endMs, clip.thumbText),
        quotes: ctx.quotes.filter(q => q >= clip.startMs && q < clip.endMs),
    });
    if (!candidates.length) return { found: [], speakers, usd: 0, note: `${speaker} does not speak long enough in this clip for a thumbnail moment.` };
    console.log(`  ${candidates.length} candidate frames of ${speaker}`);

    const small = await bounded(candidates, 4, async (c, i) => {
        const file = path.join(ctx.workDir, `${clip.id}-look-${i}.jpg`);
        await grabClipFrame(ctx.input, file, c.ms / 1000, { size: 'small' });
        return file;
    });
    const client = new Anthropic({ apiKey: ctx.apiKey });
    const response = await client.beta.messages.stream({
        model: NOTES_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: NOTES_EFFORT, format: betaZodOutputFormat(MomentLookSchema) },
        system: 'You choose the frame for a YouTube thumbnail: the speaker\'s face must be clear, expressive and fit the title.',
        messages: [{
            role: 'user',
            content: [
                ...small.flatMap((file, i) => [
                    { type: 'text' as const, text: `Frame ${i + 1}` },
                    { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: fs.readFileSync(file).toString('base64') } },
                ]),
                { type: 'text' as const, text: lookInstructions({ title: clip.title, thumbText: clip.thumbText, feeling: clip.thumbFeeling, speaker, count: small.length }) },
            ],
        }],
    }).finalMessage();
    const usd = Math.round(claudeUsd(response.usage, priceOf(response.model, NOTES_MODEL)) * 100) / 100;
    if (response.stop_reason === 'refusal' || !response.parsed_output) throw new Error('Claude did not judge the thumbnail frames');
    const looked = response.parsed_output.frames
        .filter(f => f.frame >= 1 && f.frame <= candidates.length)
        .map(f => ({ ...candidates[f.frame - 1], look: cleanLook(f) }));
    const ranked = rankMoments(looked);
    console.log(`  Claude: ${ranked.length} usable of ${looked.length} ($${usd.toFixed(2)})`);

    // Cut out the best, a few at a time, taking the next when one is too small or finds nobody.
    const found: ClipMoment[] = [];
    for (let at = 0; at < ranked.length && found.length < MAX_MOMENTS; at += MAX_MOMENTS) {
        const batch = ranked.slice(at, at + MAX_MOMENTS);
        const files = await bounded(batch, 4, async (m, i) => {
            const crop = path.join(ctx.workDir, `${clip.id}-crop-${at + i}.jpg`);
            const still = path.join(ctx.workDir, `${clip.id}-still-${at + i}.jpg`);
            await grabClipFrame(ctx.input, crop, m.ms / 1000, { size: 'full', crop: cropBox(m.look, 1920, 1080) });
            await grabClipFrame(ctx.input, still, m.ms / 1000, { size: 'still' });
            return { crop, still, cutout: crop.replace(/\.jpg$/, '.png') };
        });
        const lines = await cutOutWithBoxes(files.map(f => ({ input: f.crop, output: f.cutout })));
        for (const [i, m] of batch.entries()) {
            if (found.length >= MAX_MOMENTS) break;
            const line = lines.get(files[i].crop);
            const tall = line?.box ? line.box[3] - line.box[1] : 0;
            if (!line?.ok || tall < MIN_CUTOUT_HEIGHT) {
                console.warn(`  ⚠️ ${Math.round(m.ms / 1000)} s left out: ${line?.ok ? `cut-out only ${tall} px tall` : line?.reason ?? 'no cut-out'}`);
                continue;
            }
            const n = found.length;
            await ctx.upload(files[i].still, `${ctx.destPrefix}-${n}.jpg`, 'image/jpeg');
            await ctx.upload(files[i].cutout, `${ctx.destPrefix}-${n}.png`, 'image/png');
            found.push({
                atMs: m.ms, framePath: `${ctx.destPrefix}-${n}.jpg`, cutoutPath: `${ctx.destPrefix}-${n}.png`,
                emotion: m.look.emotion, expression: m.look.expression, fit: m.look.fit, side: standOn(m.look.facing), cue: m.cue,
            });
        }
    }
    const note = found.length ? null : ranked.length
        ? `${speaker} could not be cut out of any of the best frames (rembg found nobody, or too small).`
        : `None of the frames of ${speaker} showed a clear face.`;
    return { found, speakers, usd, note };
}

// A moment chosen by hand: the frame at `atMs`, the whole of it cut out (there is no box without Claude's look).
export async function handMoment(clip: { id: string }, atMs: number, ctx: Pick<MomentContext, 'input' | 'workDir' | 'upload' | 'destPrefix'>): Promise<ClipMoment> {
    const full = path.join(ctx.workDir, `${clip.id}-hand.jpg`), still = path.join(ctx.workDir, `${clip.id}-hand-still.jpg`);
    const cutout = full.replace(/\.jpg$/, '.png');
    await grabClipFrame(ctx.input, full, atMs / 1000, { size: 'full' });
    await grabClipFrame(ctx.input, still, atMs / 1000, { size: 'still' });
    const line = (await cutOutWithBoxes([{ input: full, output: cutout }])).get(full);
    await ctx.upload(still, `${ctx.destPrefix}-hand.jpg`, 'image/jpeg');
    if (line?.ok) await ctx.upload(cutout, `${ctx.destPrefix}-hand.png`, 'image/png');
    return {
        atMs, framePath: `${ctx.destPrefix}-hand.jpg`, cutoutPath: line?.ok ? `${ctx.destPrefix}-hand.png` : null,
        emotion: 'chosen', expression: 5, fit: 5, side: 'right', cue: 'hand', chosenByHand: true,
    };
}
