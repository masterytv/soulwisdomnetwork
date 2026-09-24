# Spec 009: The edit package and the Descript project

**Date:** 24 September 2026
**Status:** Built, first real run pending
**Related:** `docs/specs/005-podcast-production-pipeline.md` steps 8 and 9; `docs/specs/007-show-notes.md`; `docs/specs/008-broll-images.md`

## Goal

Descript is the final say on the edit (spec 005, decided 23 Sept 2026). This step gathers
everything the producer needs for that edit into one Drive folder, built from the approved
show notes (part 1), then makes the Descript project from the same files through Descript's
API (part 2). The folder also works on its own: download it and drag it into Descript.

## What is in the folder

`03 For Descript/<episode title>/` in the pipeline shared drive, beside `02 Processed`
(or inside the folder named by the optional repo variable `DRIVE_DESCRIPT_FOLDER_ID`):

| File | What |
|---|---|
| `00 Full episode - <title>.mp4` | A Drive copy of the original recording (server-side; nothing is downloaded) |
| `01 In this episode - clip N (m.ss-m.ss) <speaker>.mp4` | Each approved teaser clip, cut from the original at full quality, in order, with 0.3 s before and 0.6 s after so no word is clipped |
| `02 B-roll N at m.ss for Ns.png` | Each b-roll image, named with where it goes and for how long |
| `Notes - <title>.txt` | Chosen title; the clip order with words and files; chapters; b-roll timings, styles and reasons; key quotes |

Times are in the full, unedited episode; they shift once filler words and cuts are made. Spec
005 step 11 (re-transcribing the finished video) fixes chapter times afterwards.

## Flow

1. On `/admin/podcast/[episodeId]/notes`, **Build edit package** (offered once the notes are
   approved and saved) starts the **Podcast Edit Package** workflow
   (`.github/workflows/podcast_package.yml`, input `episode_id`, installs ffmpeg).
2. `agent/src/podcast/package.ts` finds or creates the folders, copies the full episode once,
   downloads the original from Cloud Storage to cut the clips, copies the b-roll images and
   writes the notes file. It emails `ALERT_EMAIL` the folder link.
3. **Rebuild** replaces the files in place (same names, same links) and removes clips or
   images that are no longer in the notes. The page says when the notes have been approved
   again since the last build.

Missing or out-of-date b-roll images do not stop the build; they are listed as warnings on
the page and in the email. A request that has not finished within 70 minutes counts as failed.

## Data

On `episodes/{id}` (`types/episode.ts`, `EpisodePackage`): `package.status` (`queued`,
`building`, `ready`, `failed`), `requestedAt`, `startedAt`, `finishedAt`, `error`,
`folderId`, `folderUrl`, `notesVersion` (the approved notes version it was built from),
`files`, `warnings`.

## Setup

None beyond what exists: `PODCAST_SA_JSON`, `RESEND_API_KEY`, `ALERT_EMAIL` and
`DRIVE_PROCESSED_FOLDER_ID`. The service account needs to create folders in the shared drive
(it already creates the transcript Docs there); removing old files needs Content manager, and
is reported as a warning otherwise. The workflow must be on `main` before the website can start it.

## Part 2: the Descript project

**Send to Descript** (under the edit package, offered once the package matches the approved
notes) starts the **Podcast Descript** workflow (`.github/workflows/podcast_descript.yml`),
which runs `agent/src/podcast/descript.ts` against Descript's API (`https://descriptapi.com/v1`,
reference at https://docs.descriptapi.com, open beta).

1. **Import** (`POST /jobs/import/project_media`): a new project named after the chosen title,
   in the Descript folder **Soul Wisdom Podcast**, editable by everyone on the Descript drive.
   Media come from Cloud Storage as signed links valid 36 hours: the teaser clips (the package
   job also saves them to `episodes/{id}/package/`), the original recording, and the b-roll
   images. Media folders in the project: `In this episode/`, `Full episode/`, `B-roll/`.
2. **Timeline**: one composition, **Episode** (1920x1080): the "In this episode" clips in
   order, then the full episode. The API places clips one after another only, so b-roll is not
   placed; its file names say where each image goes.
3. **Clean-up** (`POST /jobs/agent`): Underlord is asked to remove filler words and apply
   Studio Sound on that composition, and nothing else. If it cannot, the project still counts
   as made and the page says what to do by hand.
4. Both jobs are polled (`GET /jobs/{id}`) until they stop. The page shows the project link,
   Underlord's summary, media minutes and AI credits used, and warnings; an email goes to
   `ALERT_EMAIL`.

Each send makes a **new** project; sending again asks first. Imports and edits use the
Descript plan's media minutes and AI credits. A send that has not finished within about four
hours counts as failed.

On `episodes/{id}` (`EpisodeDescript`): `descript.status` (`queued`, `importing`, `cleaning`,
`ready`, `failed`), `projectId`, `projectUrl`, `compositionId`, `importJobId`, `agentJobId`,
`agentResponse`, `warnings`, `mediaSecondsUsed`, `aiCreditsUsed`, `notesVersion`, times, `error`.

**Setup:** the GitHub secret **`DESCRIPT_API_TOKEN`** (Descript → Settings → API tokens, tied
to the shared Descript drive). The workflow must be on `main` before the website can start it.

## Later

- Step 10: publish the finished composition through the API (`POST /jobs/publish` returns a
  download link) and normalise loudness, instead of downloading by hand.
- Intro and outro files (spec 005 section 9), added before and after the episode on the timeline.
