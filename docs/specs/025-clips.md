# Spec 025: Clips

**Date:** 18 November 2026
**Status:** Approved (option 2: a Clips feature beside Shorts; Tom's choices of 18 November in Decisions). Stage 1 built; stages 2 to 4 to come
**Related:** `docs/specs/013-shorts.md` (Shorts, which this follows step for step), `docs/specs/010-final-cut.md` (the final cut and
its re-timed chapters), `docs/specs/011-thumbnails.md` (the thumbnail drawing), `docs/specs/012-youtube-upload.md` (the YouTube
sign-in, captions and playlist), `docs/BACKLOG.md` ("Post shorts (and episode clips) to other platforms")

## Goal

Between the full episode and the Shorts: **clips of 5 to 15 minutes, each about one topic**, posted on YouTube as ordinary
16:9 videos that lead viewers to the full conversation. A person reviews each one before it is posted, as with Shorts:

1. The Studio offers clips: the episode's chapters, and the topics Claude suggests.
2. The producer adds the ones they want, moves their ends, removes them, or adds their own.
3. Claude writes a title, a description and thumbnail text for each, or the producer does.
4. Our own job cuts them from the final cut, and finds the main speaker's most expressive moments that fit the title.
5. The producer picks the thumbnail ("Soul Wisdom Clips": the title beside the speaker cut out of that moment), watches each
   clip and approves it (Checkpoint F).
6. The approved clips are scheduled on YouTube with captions, thumbnail and playlist.

## Decisions (18 November 2026)

- **A separate feature beside Shorts** (option 2 of the three weighed): its own record (`episode.clips`), route, job and
  Studio section. Shorts keep working exactly as they do. The code both need (word ends, the link to the full episode,
  publish slots) moves into shared helpers, and Shorts' tests must still pass unchanged.
  - Turning Shorts into "Shorts and Clips" was turned down: it would reopen a working feature whose checks assume the
    vertical format throughout.
  - Making each clip its own edit in the Studio editor was turned down for now (see Later): it is the largest change and
    the slowest render.
- **Cut from the final cut**, as Shorts are, so the edit's cuts, sound and b-roll carry over. A clip is exactly what the
  final cut has for that stretch. Available once the final cut is ready (Descript's or the Studio editor's).
- **The chapters are the first offer.** The approved notes' chapters, re-timed onto the final cut (`final.chapters`), are
  already reviewed topics. Each is offered as a clip, and two or three neighbours can be joined into one. Claude's
  suggestions cover topics that cross chapter lines.
- **16:9, as the final cut is.** No crop and no burned-in text; a half-second fade in and out.
- **Captions as a YouTube caption track**, not burned in: made from the final cut's words, as the episode's are (Tom).
- **A thumbnail theme of its own, "Soul Wisdom Clips"** (Tom). It shows the clip's compelling title beside the main
  speaker, cut out of a real frame of the clip (rembg, `podcast/cutout.py`, as for "Host over AI image"). The frame is a
  high-expression moment that fits the title: surprise, excitement, wonder, delight, conviction, anger. See
  **The thumbnail** below.
- **Their own schedule** (Tom). One clip every two days by default, at 11 am, apart from the 5 pm Shorts slot. YouTube's
  upload quota is shared with Shorts, so the page shows both (see Limits).
- **A separate Clips playlist** (Tom), from a new repo variable `YOUTUBE_CLIPS_PLAYLIST_ID`. If it is not set, the job
  warns and adds the clips to no playlist.
- **Length:** the page aims for 5 to 15 minutes and marks anything outside that. A clip must run 2 to 20 minutes or it is
  not made.

## Flow

On the show notes page, under **Clips** (`components/studio/clips.tsx`), below Shorts, once the final cut is ready.

### 1. Offer

- **From the chapters.** Each chapter is listed with its title, start, length and **▶** to preview it. A chapter's end is
  the next chapter's start, or the end of the final cut. **Add** makes it a clip, snapped to whole sentences (a
  chapter's start rarely falls on a word). **Join with next** adds the chapter and the one after it as one clip.
  Chapters under 5 minutes are marked "short; join it with the next".
- **Suggest clips** (`POST .../clips` with `{ mode: 'pick', direction? }`, a paid run, which reserves $0.45 against the
  daily limit). Claude reads the whole final cut, with the chapters as hints, and suggests up to eight self-contained
  topics, best first. Each comes with:
  - a working title
  - a score out of 10
  - the opening words
  - a reason, in one sentence
  - whether it needs anything said earlier to make sense (`standsAlone`)

  The producer's direction is optional (up to 1,000 characters). Code, not Claude, enforces the rules (`lib/clipPicks.ts`):
  - start at a sentence that begins a thought, and end after a sentence ends
  - 2 to 20 minutes long
  - no two suggestions overlap by more than half
  - the opening words must be found where Claude says they are, or the suggestion is dropped (counted as unverified)
- **Add your own.** **+ Clip** opens a picker on the final cut's words: play, then **Start here** and **End here** (or
  click a word). Snapped to whole words.

### 2. Edit

Changes save as they go (`PATCH .../clips`, with a version number, as Shorts do):
- **Ends:** the Studio shows only the words within 30 seconds of each end, never the whole clip. A 15-minute stretch is
  about 2,500 words, and the editor's lesson applies: playback must not re-render a transcript that long. Click a word
  to move that end there.
- **Write titles** (`mode: 'titles'`, a paid run reserving $0.10). Claude reads each clip's words and writes:
  - a title, under 70 characters, specific to the clip rather than the episode
  - a description of two or three sentences
  - the thumbnail title: the compelling title in two to six words, read at a glance, with one or two `*marked*` words
    in gold
  - the feeling the thumbnail should show, as one or two of surprise, excitement, wonder, delight, conviction, concern
    or anger (`thumbFeeling`). It guides the search for the moment (step 4) and can be changed.

  As with Shorts, it fills only empty fields, so clear one to have it rewritten. Or type them.
- **AI imagery:** ticked when an AI b-roll still falls inside the clip, as for Shorts (`showsBroll`), mapped through the
  chapters' and quotes' `originalMs`. When it can't be told, it is ticked.
- **Reorder** (the schedule order) or **remove**.
- **▶ Preview** plays that stretch of the final cut.

### 3. Make clips

`mode: 'render'` makes every clip that changed since it was last made:
- ffmpeg reads only that stretch of the final cut from Storage (signed URL), cutting at the exact time, with a half-second
  fade of picture and sound at each end. The output is H.264 at the final cut's size and frame rate, with AAC at 48 kHz.
  The level is not re-measured: it is a stretch of a final cut already at −14 LUFS.
- Stored as `episodes/{id}/clips/{clip}-{time}.mp4`. The previous render is deleted.
- A render records what it was made from: the ends, the final cut (`finalAt`) and `CLIP_RENDER_VERSION`. A change to any
  of them means it needs making again. A title, description or thumbnail change does not.
- Show library sounds in the final cut are logged against the clip (`uses`, kind `clip`), as for Shorts.
- About a minute per clip (re-encoding, no drawing), then an email.

### 4. The thumbnail: "Soul Wisdom Clips"

**Find thumbnail moments** (`mode: 'moments'`, a paid run reserving $0.15 a clip) works on every clip that has a thumbnail
title and no current moments. It reads the final cut directly, so it does not wait for **Make clips**. Moments are current
while the clip's ends, thumbnail title, feeling and final cut are unchanged.

1. **The main speaker** is whoever speaks most of the clip's words. The producer can choose the other host or a guest
   instead (`thumbSpeaker`).
2. **Candidates.** Up to 24 moments inside the main speaker's own turns, at least 10 seconds apart, never in the first or
   last 5 seconds. The cues that point to an expressive face come first:
   - loud moments in the speaker's voice: the final cut's momentary loudness (ffmpeg `ebur128`), at least 4 LU above the
     speaker's median in the clip
   - laughter, exclamations and short reactions in the words ("wow", "oh my god", "!"), and the end of a question
   - the key quotes and Claude's suggested opening words that fall inside the clip
   - the words of the thumbnail title, where the speaker says them
   - if there are too few, evenly spaced moments in the speaker's turns

   Each is grabbed 300 ms after the cue, as a small 640x360 frame.
3. **Claude looks at them** (the show notes model and effort, with images) with the clip's title, thumbnail title and
   feeling. For each frame it returns:
   - `expression`: 1 to 10, how strong and readable the face is at thumbnail size
   - `fit`: 1 to 10, how well the face matches the title and feeling
   - `emotion`: one word
   - where the main speaker is in the frame (a box), and which way they face
   - `usable: false` for eyes closed, a blurred or mid-word mouth, a hand over the face, the wrong person, a screen
     share, or b-roll covering the picture

   Code then keeps the usable frames, ranks them by `fit` and then `expression`, keeps them 20 seconds apart, and takes
   the best four.
4. **Cut out.** Each of the four is grabbed again at the final cut's full size. It is cropped to the speaker's box with a
   margin, so in Zoom's gallery view only the main speaker is kept. Then rembg (`podcast/cutout.py`, `u2net_human_seg`)
   cuts them out over transparency. A cut-out that covers too little of its crop (`MIN_SHARE`), or is under 600 pixels
   tall, is dropped, and the next ranked frame takes its place.
5. **Saved** as `episodes/{id}/clips/{clip}-moment-N.jpg` (the frame) and `…-moment-N.png` (the cut-out), with the time,
   emotion, scores and side.

**The theme** (`components/studio/clipThumbnail.ts` `drawClipThumbnail`, 1280x720, in the Studio's colours from the
settings, as the other thumbnails are):
- **The speaker**, cut out, stands on the bottom edge, as large as fits (up to about 95% of the height). They stand on
  the side that has them facing the title, and are never mirrored. They have a soft gold rim light and a dark shadow
  behind, so they stand off the background.
- **The thumbnail title** on the other side: Outfit Black, two to four lines, as large as fits its half, white with the
  `*marked*` words in gold, with a dark outline for small screens.
- **The mark** at the top on the title's side: the oval logo and "SOUL WISDOM CLIPS" in gold capitals.
- **The background:** **Brand** (deep violet gradient, gold rules, the starlight texture) by default, or **From the clip**
  (that frame, blurred, darkened and washed violet, so the room behind the speaker shows through).
- YouTube shows its time stamp in the bottom-right corner, so nothing that matters goes there.

**In the Studio**, under each clip:
- The four moments as finished thumbnails, each with its time, emotion and **▶** to hear it.
- Choose one and a background.
- **Use this moment:** scrub the clip's preview to any frame and take it instead (`mode: 'moments'` with `atMs`: one
  grab and one cut-out, no Claude, free).
- The thumbnail title can be edited here too, and the drawing updates as it is typed.
- The chosen thumbnail is saved as a JPEG through `PUT .../clips/{clip}/thumbnail`, as Checkpoint D saves the episode's,
  at `episodes/{id}/clips/{clip}-thumb-{time}.jpg` (under 2 MB).

If no frame of the speaker could be cut out (a speaker off camera, a screen share), the clip offers the theme without a
person: the title larger, centred, on the Brand background. The page says why.

### 5. Checkpoint F

**Approve this clip** needs a title, a description and a saved thumbnail. The approval belongs to that render, so making
the clip again clears it. A new thumbnail or text after approving does not clear it: those are sent as they stand when
the clip is scheduled.

### 6. Schedule on YouTube

`mode: 'upload'`, with the first time and the producer's time zone.
- **Slots:** the server gives each approved clip a slot `clipsEveryDays` after the one before, in page order (default 2;
  a Studio setting, 1 to 7). The page suggests the day after the last clip already scheduled on any episode, at the same
  time of day. Failing that, it suggests 11 am the next day, so clips do not land at the 5 pm Shorts slot. It shows the
  Shorts already scheduled on those days beside each slot.
- **The job uploads each one Private with that `publishAt`** (`youtubeApi.ts`, resumable), with:
  - title: the clip's title
  - description:
    - the clip's description
    - "Watch the full conversation" with the episode link, or "Full episodes" with the podcast playlist (and failing
      that, the site), as Shorts do
    - the chapters inside the clip, re-timed to it, when there are three or more and each is at least 10 seconds long
      (YouTube's rule)
    - the show library credits
    - two of the episode's hashtags
  - tags: the episode's
  - category: Education
  - not made for kids
  - `containsSyntheticMedia`: the AI imagery flag
- **Straight after each upload:**
  - The video ID is saved, so a failure after that never makes a second copy.
  - The caption track is added (`insertCaption`, the episode's `CAPTION_NAME`), built with `lib/captions.ts` `buildCues`
    from the clip's words moved to start at 0.
  - The thumbnail is set (`setThumbnail`).
  - The clip is added to the Clips playlist (`YOUTUBE_CLIPS_PLAYLIST_ID`), not the podcast playlist.

  A failure in one of those three is a warning on that clip, not a failed upload.
- A clip on YouTube can no longer be edited or removed on the page. Change or delete it in YouTube Studio.
- **End screen:** the API cannot set one. The page reminds the producer to add "Full episode" as the end screen in
  YouTube Studio.

## The data

`episode.clips` (`types/episode.ts`), beside `shorts`:

```ts
// One clip as the producer edits it (lib/clips.ts ClipEditSchema).
interface ClipEdit {
    id: string;                                    // /^[\w-]{4,40}$/
    source: { kind: 'chapter'; index: number; count: number } | { kind: 'pick'; id: string } | { kind: 'own' };
    startMs: number; endMs: number;                // on the final cut
    title: string;                                 // ≤ 100
    description: string;                           // ≤ 1,000
    thumbText: string;                             // the thumbnail title, ≤ 60, with asterisks
    thumbFeeling: string[];                        // up to 2, of CLIP_FEELINGS
    thumbSpeaker: string | null;                   // null: whoever speaks most
    thumbMoment: number | null;                    // which of `moments.found`
    thumbBackground: 'brand' | 'clip';
    synthetic: boolean;
}

// A moment found for the thumbnail (lib/clipThumbs.ts).
interface ClipMoment {
    atMs: number;                                  // on the final cut
    framePath: string; cutoutPath: string | null;  // Storage: JPEG at full size, PNG with alpha
    emotion: string; expression: number; fit: number;
    side: 'left' | 'right';                        // where the speaker stands on the thumbnail
    chosenByHand?: boolean;                        // "Use this moment"
}

interface ClipItem extends ClipEdit {
    render?: { version: number; startMs: number; endMs: number; finalAt: number;
               path: string; renderedAt: number; durationMs: number } | null;
    moments?: { inputs: { startMs: number; endMs: number; thumbText: string; feeling: string[];
                          speaker: string; finalAt: number };
                found: ClipMoment[]; madeAt: number } | null;
    thumbnail?: { path: string; savedAt: number } | null;
    approved?: { by: { uid: string; name: string }; at: number; renderedAt: number } | null;
    publishAt?: number | null;
    youtube?: { videoId: string; url: string; publishAt: number; uploadedAt: number;
                captionId?: string | null; playlistId?: string | null; warnings?: string[] } | null;
    error?: string | null;
}

interface EpisodeClips {
    status: 'queued' | 'working' | 'ready' | 'failed';
    job: 'pick' | 'titles' | 'render' | 'moments' | 'upload' | null;
    requestedAt?: unknown; startedAt?: unknown; finishedAt?: unknown;
    error?: string | null;
    items: ClipItem[];                             // at most 20
    version: number;
    suggestions?: ClipSuggestion[];                // lib/clipPicks.ts, best first
    unverified?: number;
    direction?: string | null;
    timeZone?: string;
    warnings?: string[];
}
```

## Files

| File | What |
|---|---|
| `lib/clips.ts` | Limits (`CLIP_MIN_MS` 2 min, `CLIP_TARGET` 5–15 min, `CLIP_MAX_MS` 20 min, `MAX_CLIPS` 20), `ClipEditSchema`, `ClipTextsSchema`, `chapterCandidates` (chapters to snapped clips, joins), `sentenceBounds`, render inputs and `sameClipRender`, `clipChapters` (the description's chapters), `clipMetadata` |
| `lib/clipPicks.ts` | `ClipPicksSchema`, the prompt's rules, snapping, overlap and verification (reusing `pickingTranscript` from `lib/shortPicks.ts`) |
| `lib/publishing.ts` | Moved from Shorts and shared: the link to the full episode (`episodeLink`), `publishSlot` with a gap in days, the next free slot across episodes |
| `lib/clipThumbs.ts` | `CLIP_FEELINGS`, the candidate cues and spacing, `ClipMomentsSchema` (what Claude returns per frame), ranking, the crop box with its margin, and when moments are current |
| `lib/server/clips.ts` | Save (version check), start a job (spending reservation for pick, titles and moments; slots for upload), the thumbnail save |
| `app/api/studio/episodes/[id]/clips/route.ts`, `.../clips/[clip]/thumbnail/route.ts` | `requireRole(request, STUDIO_ROLES)` on each, as every route |
| `agent/src/podcast/clips.ts`, `clipsRender.ts`, `clipMoments.ts` | The job's five modes; the ffmpeg cut and fades; the moments: loudness, candidate frames, Claude's look, the crop and `cutOutPeople` (`podcast/cutout.ts`) |
| `components/studio/clipThumbnail.ts` | `drawClipThumbnail`: the "Soul Wisdom Clips" theme, drawn in the browser like `thumbnailCanvas.ts` and sharing its text fitting |
| `.github/workflows/podcast_clips.yml` | As `podcast_shorts.yml`: ffmpeg through `.github/actions/ffmpeg`, the same secrets, plus `YOUTUBE_CLIPS_PLAYLIST_ID`; for `moments`, the rembg venv from `agent/requirements-cutout.txt`, as `podcast_thumbnails.yml` makes it |
| `lib/server/github.ts` | `startClips(id, mode)` |
| `lib/server/spending.ts` | `ESTIMATE_USD.clipsPick` 0.45, `clipsTitles` 0.10, `clipsMoments` 0.15 a clip |
| `lib/studioSettings.ts` | `clipsEveryDays` (default 2), through `withDefaults` |
| `components/studio/clips.tsx` | The section: a part of the Shorts stage (renamed "Shorts and clips") on the notes page, not a step of its own, since clips are optional and an episode is done without them |
| `lib/episodeReset.ts`, `lib/server/episodeReset.ts` | Start over and Delete clear `clips` and `episodes/{id}/clips/`; both are refused while a clips job is working |
| `types/episode.ts` | `EpisodeClips`, and `clips?` on `Episode` |

Costs go on the episode (`clips_pick`, `clips_titles`, `clips_moments`) and in the usage report, as for Shorts. Claude
looking at 24 small frames is about 8,000 image tokens a clip, so a few cents.

## Limits and failure

- **Quota.** The default is 10,000 units a day. Each clip costs about 2,100: the upload 1,600, the captions 400, the
  thumbnail 50 and the playlist 50. Each short costs 1,600. So one run can schedule about four clips, fewer on a day
  Shorts were scheduled. When it runs out, the rest keep their slots and the job says so; press **Schedule on YouTube**
  again the next day, as with Shorts. Asking Google for a higher quota is worth doing once clips are in use.
- **A slot that has already passed** is not uploaded; the clip shows the error.
- **The final cut changes.** Every clip needs making again (its `finalAt` no longer matches). The chapters are re-timed
  onto the new cut, but a clip's ends are not: check each one. A clip whose words are mostly missing where it should be
  (`quoteMatch` on its first and last sentences, under 0.7) is flagged.
- **The episode is not on YouTube yet.** Clips link to the podcast playlist, as Shorts do. A later "Update links" run
  (`updateVideo`, 50 units each) can point them at the episode.
- **A clip that cannot be made** is reported and the rest are still made. The job fails only when none can be.

## Tests

- `lib/clips.test.ts`:
  - chapter candidates and joins
  - snapping to sentences
  - limits
  - `sameClipRender`
  - the description's chapters (fewer than three, under 10 seconds, the first at 0:00)
  - metadata
  - slots `clipsEveryDays` apart
- `lib/clipPicks.test.ts`: overlap, verification, lengths.
- `lib/clipThumbs.test.ts`:
  - candidates only in the main speaker's turns, spaced, never at the clip's ends
  - loudness cues ranked first
  - unusable frames dropped
  - ranking by fit, then expression
  - the crop box kept inside the frame
  - when moments go stale
- `components/studio/clipThumbnail.test.ts`: the speaker on the side they face, the title fitting its half at the longest
  allowed text, and nothing in YouTube's time-stamp corner.
- `lib/publishing.test.ts`; and Shorts' existing tests, unchanged, after the move.
- `agent/src/podcast/clipsRender.test.ts`: a short synthetic clip cut with ffmpeg has the right length and fades.

## Stages (each a PR into `staging`)

1. **Offer and edit:** the data, the route, the section with chapters and your own clips, saving and preview. No job.
   Built: `lib/clips.ts` (limits, `ClipEditSchema`, `chapterSpans`, `chapterClip`, `sentenceBounds`, `wordSnap`,
   `clipShowsBroll`), `lib/server/clips.ts` and the route (GET and PATCH), `components/studio/clips.tsx`, and Clips in
   `lib/episodeReset.ts`. A new clip's ends are snapped by the server when it is first saved: to whole sentences (a
   thought's start and end, within 20 seconds) from chapters, to whole words when marked by hand. Clicking a word then
   moves an end exactly there. The data has only the edit for now; each later stage adds its own fields.
2. **Claude:** `mode: pick` and `mode: titles`, the workflow, the spending estimates.
3. **Make and approve:** `mode: render`, `mode: moments`, the "Soul Wisdom Clips" theme, and Checkpoint F.
4. **Schedule:** `mode: upload`, captions, thumbnail, playlist, the shared schedule view, the `YOUTUBE_CLIPS_PLAYLIST_ID`
   variable.

The job runs only from `main` (`lib/server/github.ts`, `ref: 'main'`), so stages 2 to 4 can be tested on staging's
pages but not their runs until they reach `main`.

## Later

- **Clips in the Studio editor** (option 3): "Open in editor" makes the clip its own edit for the same stretch, with its
  own title card, lower thirds and tighter cuts, rendered by `editRender`.
- Two speakers on one thumbnail: both hosts cut out of an exchange where both react.
- The same moment search for the episode's own thumbnail (spec 011), in place of frames at the key quotes.
- A short branded sting at the start, and a "Full episode" end card.
- "Update links" once the episode is on YouTube.
- The same files to other platforms (`docs/BACKLOG.md`, Distribution).
- Clips in the audio podcast feed as bonus episodes.
