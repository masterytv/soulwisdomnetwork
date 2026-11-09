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

Ideas that already have b-roll are left alone by both buttons. Editing still waits until every idea has b-roll or b-roll is
skipped (`lib/brollGate.ts`); a stock file counts the same as an AI image.

## Data

Each `broll.images[i]` (`types/episode.ts`, `BrollImage`) keeps its record, now with `source` (`pexels`, `pixabay`, or `ai`;
absent means AI), `kind` (`video` or `image`), `seconds` (footage's length), `credit` (name and link), `pageUrl` and
`stockId`. A stock record keeps its search words as `prompt`, the site as `model`, its size, and costs $0. `broll.mode`
says what the last run did. Claude's picks are added to the episode's costs as `broll_stock_picks`.

`brollStale` (`lib/broll.ts`) decides whether an idea still needs b-roll: none, other words, or (an AI image only) another style.

## In the edit and the render

- **Footage** is a silent, full-frame **video layer** (`brollLayer` in `lib/layers.ts`), half a second's fade in and out, no
  longer than the footage (a clip is never looped). The media bin lists it as video. A stock photo is a still with the slow
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
