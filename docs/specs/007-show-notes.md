# Spec 007: Show notes and Checkpoint B

**Date:** 23 September 2026
**Status:** Built, first real run pending
**Related:** `docs/specs/005-podcast-production-pipeline.md` steps 5 and 6; `docs/specs/006-podcast-studio.md`

## Goal

When a transcript is accepted (Checkpoint A), Claude drafts the episode's show notes
from it. A producer reviews and edits them on one page, then approves them (Checkpoint B).
The approved notes are what later steps use: the YouTube upload, the teaser, b-roll, shorts.

Checkpoint B in spec 005 also covers approving the b-roll plan. Here that means approving the
b-roll *ideas*; generating the images is a later step.

## What Claude drafts

One structured response (`lib/showNotes.ts`, a Zod schema used for the request, for
checking edits on the server, and by the page):

| Field | What |
|---|---|
| `titles`, `chosenTitle` | Five title options; the producer picks one |
| `teaserClips` | The "In this episode" cold open: 3-4 clips from the episode (20-40 s) played under an "In this episode" title; at least one cuts off before the answer |
| `description`, `hashtags` | YouTube description, 150-300 words, hook and keywords in the first two lines; three hashtags |
| `summary` | Two or three paragraphs for the website episode page |
| `chapters` | Start time and title; first at 0:00 |
| `quotes` | Up to 20, word for word, a sentence to a two-minute passage; every guest gets one or two, including guests heard in recordings played during the episode. Producers can add their own and send any quote to the teaser |
| `tags`, `themes`, `topics` | YouTube tags; broad themes; specific people, books and ideas |
| `broll` | Six still-image ideas with start time and duration (spec 005 section 3, option A) |

The transcript is sent with each paragraph stamped in milliseconds. Quotes and teaser clips
are then matched word for word against the accepted transcript's words (`locate` in
`lib/showNotes.ts`), which sets their exact start and end times and the speaker name from
the transcript rather than from Claude. Anything not found word for word is flagged on the
page. A long passage that differs in the middle is still found by its first and last six words and takes
the transcript's wording. Voices marked as clips at Checkpoint A are labelled as recordings played during
the episode; they are guests, so they are quoted too (decided 23 Sept 2026, changing spec 006).

The full YouTube description is assembled in code (`youtubeDescription`): the text, then the
link to soulwisdomcollective.com, the chapters, a subscribe line and the hashtags. The link
is always there, whatever the text says.

**Model:** Claude Opus 5 (`claude-opus-5`), adaptive thinking, effort `high`, structured
outputs, streamed (up to 64k output tokens for twenty long quotes), with server-side refusal fallback on. About $0.30–0.60 per episode, recorded in the
episode's costs as `show_notes`.

## Flow

1. Accept on the speaker review page sets `notes.status: 'queued'` and starts the
   **Podcast Show Notes** workflow (`.github/workflows/podcast_notes.yml`, input
   `episode_id`). Only the first accept does this (or one after a failure); re-accepting a
   transcript does not replace notes someone may have edited.
2. The workflow runs `agent/src/podcast/notes.ts`: reads `transcripts/reviewed.json`, calls
   Claude, writes `notes.generated` (kept as Claude wrote it) and `notes.draft`, sets
   `status: 'ready'`, and emails `ALERT_EMAIL` a link. Failures set `status: 'failed'` with
   the error and email too.
3. `/admin/podcast/[episodeId]/notes` shows the draft beside the video. Every field is
   editable; ▶ plays the video from a chapter, quote or b-roll time, and "Play the teaser"
   plays the clips in order, stopping at each end. "Add the line at video time" adds the
   sentence being spoken as a new quote or teaser clip. Edits autosave to
   `notes.draft` with the same version check as speaker review.
4. **Approve** copies the draft to `notes.approved` and records who and when. Later edits
   show "Approve changes" until approved again. **Draft again with Claude** replaces the draft
   (after a confirm), and works on approved notes too.

A request that has not produced notes within 20 minutes counts as failed, so a lost run
never blocks a retry.

## Data

On `episodes/{id}` (`types/episode.ts`, `EpisodeNotes`): `notes.status` (`queued`,
`generating`, `ready`, `failed`, `approved`), `generated`, `draft`, `approved`, `version`,
`model`, `unverifiedQuotes`, `requestedAt`, `startedAt`, `generatedAt`, `error`,
`approvedBy`, `approvedAt`, `approvedVersion`.

## Setup

- GitHub secret **`ANTHROPIC_API_KEY`** (repository → Settings → Secrets and variables →
  Actions). The workflow also uses the existing `PODCAST_SA_JSON`, `RESEND_API_KEY` and
  `ALERT_EMAIL`.
- The workflow must be on `main` before the website can start it.

## Later

- Feed approved notes into the YouTube upload (step 13) and teaser card (step 10).
- Generate the approved b-roll images (step 7).
- A house style for descriptions (standard sign-off, links) once we know what we want.
