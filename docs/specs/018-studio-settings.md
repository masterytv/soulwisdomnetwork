# Spec 018: Studio settings and uploads

**Date:** 4 October 2026, updated 5 October 2026
**Status:** Built; with nothing saved, the Studio works exactly as before.
**Authors:** Jo Ann H (Lucid4224), in a fork; merged with fixes, see "Changes on merge".
**Related:** `docs/specs/005-podcast-production-pipeline.md`, `docs/specs/015-editor-light.md`,
`docs/specs/014-usage.md` (the daily spending limit)

Every choice that was fixed to the Soul Wisdom Collective podcast becomes a setting, and a
recording can be uploaded straight from the Studio instead of through Drive.

## Settings

**Where:** `/admin/podcast/settings`, linked from the Studio home. Producers can read them;
only admins can change them.

**Stored** in Firestore `studio/settings` (Admin SDK only, like the rest of `studio`). The shape
and defaults are in `lib/studioSettings.ts`. Every reader goes through `withDefaults`:
- a missing document gives the defaults, which are what the Studio always did;
- a saved value that no longer fits is ignored, so it can never stop a job.

| Setting | What it changes |
|---|---|
| Show name, about, audience | The show notes, Shorts and thumbnail prompts |
| Hosts | Names offered to AssemblyAI and speaker review |
| Names and terms to spell right (spec 019 item 2.4) | Sent to AssemblyAI with the show name and hosts (`keyterms_prompt`), so new transcripts spell them right |
| Kind of recording, extra instructions | How Claude writes notes, descriptions, Shorts and thumbnails |
| Website, link text, subscribe line | The YouTube description's added lines |
| Colours, logo, image style | Shorts, thumbnails and b-roll images |
| Intro (show's, own, none), teasers | The Editor Light render |
| Transitions at the start and end, between teasers, after the teasers and intro, before the outro (spec 020 item E4) | The Editor Light render, for every episode; straight cuts by default, and each episode can choose its own in the Studio editor |
| Voice clean-up: standard, DeepFilterNet or Auphonic (spec 019 item 3.2) | The Editor Light render's sound, for every episode; standard by default, and each episode can choose its own in the Studio editor's Render panel. Auphonic only on its free plan (2 hours a month, counted in `studio/spending`) |
| Final cut (Descript or Editor Light) | Where thumbnails, Shorts and YouTube take the video from |
| Podcast feed: on or off, artwork, Apple category, explicit, owner email (spec 019 item 5.1) | The site's audio podcast feed (`/podcast/feed.xml`); off by default |
| Drive on or off | Whether recordings also come in through the Drive inbox |

With the defaults, the prompts are word for word what they were (`lib/studioSettings.test.ts`).

## Uploading a recording

**Upload a recording** on the Studio home (`components/studio/upload.tsx`):
1. `POST /api/studio/uploads { action: 'start' }` checks the file's type and size and returns a
   one-time resumable upload link (`lib/server/uploads.ts`). The browser sends the file straight
   to Cloud Storage, so `storage.rules` stays closed.
2. `{ action: 'finish' }` checks what arrived, makes the episode (`source: 'upload'`,
   `episodes/up…`) and starts the ingest job.
3. Ingest handles it like a Drive file, reading the original from Storage and moving nothing in
   Drive.

**Limits:**
- Any Studio member can upload a recording; only admins can upload a logo or intro.
- Recordings up to 20 GB, logos (PNG or JPEG) up to 5 MB, intros (MP4 or MOV) up to 2 GB.
- After the upload, the server checks the stored object's type and size, and the first bytes of
  a logo or intro. A file that fails is deleted. Settings check the logo and intro again on save.
- A recording reserves $0.75 (three hours of transcription) against the daily spending limit
  before its upload starts.

## Drive

Drive stays on by default. With it on, ingest **fails** when `DRIVE_TO_PROCESS_FOLDER_ID` or
`DRIVE_PROCESSED_FOLDER_ID` is missing, rather than skipping Drive. Turned off in the settings,
ingest processes uploads only and the Studio home hides the Drive columns.

## Editor Light as the final cut

With **The Studio editor makes the final cut** (once "Editor Light makes the final cut"; spec 020 item E15 gives it step 3,
Build edit package, and hides Descript; the default since #188, saved as `finalCutBy`, so a `finalSource: 'descript'` saved
before then, at the old default, is ignored), a finished render also writes `episode.final`
(`source: 'editorLight'`):
- It is written in the same update as `episode.editRender`, after every file is saved.
- Its words go in the render's own folder (`final-words.json`).
- Chapters are tidied as `final.ts` does for Descript: the first at 0:00, the rest at least
  10 s apart. Any left out are listed in its warnings.
- The previous render's folder is kept while `final` still points at it.

## Changes on merge

- **Removed:** the settings for the GitHub repository and the Firebase project and bucket. The
  jobs always run in this repository, on `soulwisdomnetwork.firebasestorage.app`.
- **Settings document:** moved from `settings/studio` to `studio/settings`.
- **Drive:** a missing folder variable fails ingest, instead of quietly turning Drive off.
- **Uploads:** what arrives in Storage is checked; the route signs in before reading the body;
  recordings count against the daily limit.
- **Final cut:** tidy chapters, words in the versioned folder, and its folder protected.
