# Spec 023: Stock b-roll first

**Date:** 9 November 2026
**Status:** Built, first real run pending (needs the `PEXELS_API_KEY` and `PIXABAY_API_KEY` repo secrets)
**Related:** `docs/specs/008-broll-images.md` (AI images, which stay as the third choice), Short Maker's
`src/lib/visuals/stock.ts` and `fill.ts` (the same approach for Shorts)

## Goal

B-roll from **real footage first, real photos second, AI images third**, as Short Maker does it. Stock from Pexels and
Pixabay is free for commercial use, so there is far more of it: the show notes now pick every moment where a picture helps
while someone is speaking, not six.

## Decisions (Tom, 9 November 2026)

- **Order:** stock video, then stock photo, then AI image. Stock is found by a button; AI images are made only when the
  producer asks, from the same page, for the ideas stock left.
- **More b-roll:** the show notes ask for b-roll wherever it helps, usually one every 30 to 90 seconds of conversation, up to
  30 (the notes' existing limit), never overlapping. Each idea now has **search words**, a few plain words a camera can
  film ("hospital corridor night"), editable on the page; ideas drafted before have none, and their idea is searched.
- **Sources:** Pexels (videos and photos) and Pixabay (videos and photos), landscape only. Unsplash is left out: its API
  is for people choosing photos, not automated picks. Pixabay's AI-made and low-quality uploads are left out.
- **Who picks:** Claude, from the candidates' descriptions only (cheap, a few cents a run), with Short Maker's rules:
  it must show the moment, footage first, at least as long as its moment, never the same file twice, no stranger's face
  standing in for a real person in the episode, nothing likely to show text, logos or gore. A moment nothing fits is left
  for an AI image.

## Flow

On the show notes page, under B-roll:

1. **Find stock footage for every idea** starts `podcast_broll.yml` with `mode: stock` (`agent/src/podcast/broll.ts`). For each
   idea with no b-roll (or whose words changed), it searches both sites for footage and photos (16 candidates at most),
   asks Claude to pick, and copies each pick into Storage (`episodes/{id}/broll/{nn}-{time}-{site}.mp4|.jpg`). Pixabay
   forbids hotlinking and the render runs in Actions, so every file is copied. The page fills in as files arrive.
2. **Make AI images for the N left** starts the same workflow with `mode: ai`: AI images (spec 008) for every idea still
   without b-roll.
3. Beside each idea: **Find other stock** (never the same file again) and **AI image instead** / **New AI image**.

4. **Remove** beside an idea's b-roll takes it off (the file stays in Storage, since an edit already made may show it). The idea then has no b-roll, so **Find stock footage** fills it with something else; stock taken off is kept in `broll.rejected` and never picked again. Removing several and running once redoes them together.

Ideas that already have b-roll are left alone by both buttons. Editing still waits until every idea has b-roll or b-roll is
skipped (`lib/brollGate.ts`); a stock file counts the same as an AI image.

## Timing (added 10 November 2026)

The first stock run found the right footage for the right part of the conversation, but too early: Claude sees the
transcript as paragraphs stamped with their start, and the prompt told it to start b-roll at a paragraph's time, so a
picture of pets came up several seconds before Mikias said "pets". Tom moved them by hand to one second after the subject
is named.

- Each idea now has **cue words**: the exact words, copied from the transcript, where its subject is first named ("pets in
  the afterlife", "the tunnel of light"). For an abstract moment, which has no named subject, the cue is the words of the
  action or idea the picture illustrates: the laptop with a network map goes on "analyzed each of the experiences".
- After drafting, `timeBroll` (`lib/showNotes.ts`) finds each cue word for word in the accepted transcript (the occurrence
  nearest Claude's time, filler words and punctuation ignored, as quotes are found) and starts the b-roll **one second
  after the cue begins** (`BROLL_CUE_DELAY_MS`). An idea that would run into the next is shortened (3 seconds at least).
  A cue that is not in the transcript keeps Claude's time and is listed with the unverified quotes.
- On the notes page each idea shows **Starts on the words**, editable; when its time is half a second or more from the cue,
  **Time to these words** moves it there, and a cue not in the transcript says so.
- The edit takes each b-roll's time and length from the **approved notes** (`brollTiming` in `lib/broll.ts`), so moving an
  idea on the notes page moves it in the Studio editor's first layers and the render, without finding the b-roll again.
- Episodes drafted before cue words exist keep their times. **Draft again with Claude → Only the b-roll ideas** gives them
  new, timed ideas (and the larger set) without touching the description, titles or anything else.

## Data

Each `broll.images[i]` (`types/episode.ts`, `BrollImage`) keeps its record, now with `source` (`pexels`, `pixabay`, or `ai`;
absent means AI), `kind` (`video` or `image`), `seconds` (footage's length), `credit` (name and link), `pageUrl` and
`stockId`. A stock record keeps its search words as `prompt`, the site as `model`, its size, and costs $0. `broll.mode`
says what the last run did. Claude's picks are added to the episode's costs as `broll_stock_picks`.

`brollStale` (`lib/broll.ts`) decides whether an idea still needs b-roll: none, other words, or (an AI image only) another style.

## In the edit and the render

- **Footage** is a silent, full-frame **video layer** (`brollLayer` in `lib/layers.ts`), half a second's fade in and out, no
  longer than the footage (a clip is never looped). Footage that is not 16:9 **fills the frame**, scaled up and cropped at its
  centre, in the preview and the render (`fillsFrame`, 10 November 2026): it never shows the speaker above and below it. The media bin lists it as video. A stock photo is a still with the slow
  zoom, like an AI image.
- The edit package (Descript) trims footage to its moment and fills it to 1920x1080; its still is the first frame.
- Edits saved before layers existed draw only stills from the notes plan; footage goes in through layers.

## YouTube

- The description gets a **B-roll footage and photos** section crediting each photographer and videographer by site
  (`stockCredits`). Neither site requires it; it helps answer a Content ID claim.
- "Altered or synthetic content" is set only when the episode has **AI** b-roll; stock is real (the same for Shorts).

## Set-up

Add `PEXELS_API_KEY` and `PIXABAY_API_KEY` as **repository secrets** (the same keys Short Maker uses work). The job uses
`ANTHROPIC_API_KEY`, already a repo secret. Like every podcast job, it runs from `main`, so stock b-roll works once this is on
`main`.

## Later

- Stock in the Studio editor's media bin: search and drop a clip by hand.
- Shorts' descriptions could credit the stock in each Short.
