// Why: the audio podcast feed (docs/specs/019-editor-light-v2.md item 5.1, lib/podcastFeed.ts). The final cut's
// sound as the MP3 podcast apps download: −16 LUFS (their level, quieter than YouTube's −14) in two loudnorm
// passes with one linear gain, 128 kb/s at 44.1 kHz, its chapters as ID3 CHAP frames (apps show them as
// chapters) and the show's artwork, square, as the cover.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ART_SIZE, chapterMetadata, PODCAST_BITRATE, PODCAST_LOUDNESS } from '../../../lib/podcastFeed';
import { loudnormReport, runWithLog } from './media';

export interface PodcastMp3 {
    video: string;                        // the final cut
    out: string;
    title: string;
    artist: string;
    chapters: { title: string; startMs: number }[];
    durationMs: number;
    art: string | null;                   // any picture; it is fitted into a square on `background`
    background: string;                   // #rrggbb
}

export async function makePodcastMp3(o: PodcastMp3) {
    const dir = path.dirname(o.out);
    const target = `I=${PODCAST_LOUDNESS.integrated}:TP=${PODCAST_LOUDNESS.truePeak}:LRA=${PODCAST_LOUDNESS.range}`;
    const measured = loudnormReport((await runWithLog('ffmpeg', ['-hide_banner', '-nostats', '-i', o.video, '-vn',
        '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-'])).stderr);
    const meta = path.join(dir, 'chapters.txt');
    fs.writeFileSync(meta, chapterMetadata(o.title, o.chapters, o.durationMs));
    const args = ['-y', '-hide_banner', '-nostats', '-i', o.video, '-i', meta];
    let cover: string[] = [];
    if (o.art) {
        const square = path.join(dir, 'cover.jpg');
        const bg = o.background.replace('#', '0x');
        await runWithLog('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', o.art, '-vf',
            `scale=${ART_SIZE}:${ART_SIZE}:force_original_aspect_ratio=decrease,pad=${ART_SIZE}:${ART_SIZE}:(ow-iw)/2:(oh-ih)/2:color=${bg},format=yuvj420p`,
            '-frames:v', '1', '-q:v', '3', square]);
        args.push('-i', square);
        cover = ['-map', '2:v', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic', '-metadata:s:v', 'title=Cover', '-metadata:s:v', 'comment=Cover (front)'];
    }
    const done = loudnormReport((await runWithLog('ffmpeg', [...args,
        '-map', '0:a', ...cover, '-map_metadata', '1', '-map_chapters', '1',
        '-af', `loudnorm=${target}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}` +
            `:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=json`,
        '-c:a', 'libmp3lame', '-b:a', PODCAST_BITRATE, '-ar', '44100', '-ac', '2',
        '-metadata', `title=${o.title}`, '-metadata', `artist=${o.artist}`, '-metadata', 'genre=Podcast',
        '-id3v2_version', '3', o.out])).stderr);
    return { afterLufs: Number(done.output_i), truePeak: Number(done.output_tp), normalization: done.normalization_type ?? null };
}
