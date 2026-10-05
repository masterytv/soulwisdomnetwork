# Spec 015: Editor Light

**Date:** 1 October 2026, updated 5 October 2026 (full-page editor)
**Status:** Built, tested locally and in this repo's checks; not yet run on a real episode.
Descript stays the final edit unless the Studio settings choose Editor Light
(`docs/specs/018-studio-settings.md`); otherwise a render is saved beside it.
**Authors:** Jo Ann H (Lucid4224), in a fork; merged with fixes, see "Changes on merge".
**Related:** `docs/specs/005-podcast-production-pipeline.md`, `docs/specs/009-edit-package.md`,
`docs/specs/010-final-cut.md`

A light editor for the parts of Descript the pipeline uses:
- removing fillers and pauses;
- editing by text, with an instant preview;
- a render with teasers, intro, outro, b-roll, voice cleanup and −14 LUFS.

## What the producer does

**Where it is.** On an episode's show notes page, the **Edit package** stage has
**Edit here instead (preview)**. It is shown only when `NEXT_PUBLIC_EDITOR_LIGHT=1` is set at
build time (`apphosting.yaml`), or when the Studio settings make Editor Light the final cut.
**Open the full-page editor** there goes to `/admin/podcast/[episodeId]/edit`: a larger video, the
transcript beside it, a timeline underneath, and saving and rendering pinned in a bar at the top.

**Editing:**
- The transcript is shown by speaker, with the video beside it.
- Click a word to jump the video there.
- Drag, or shift-click, to select words; press Delete or Backspace to cut them.
- Double-click a cut to bring it back.
- Ctrl/Cmd+Z undoes, and Shift+Ctrl/Cmd+Z redoes.
- Search finds words.

**Suggestions.** **Mark filler words and long pauses** suggests cuts. The producer goes through
them with Prev and Next, and can **Keep** one or **Hear it** before deciding.

**Playing:**
- **Edited** skips the cuts as the video plays; **Original** plays everything.
- **Speed** plays at 0.75× to 2×.
- It shows the edited length and the time saved. **?** opens the editing help and shortcuts.

**Timeline** (full-page editor only, `components/studio/timeline.tsx`, `lib/timeline.ts`):
- a ruler, each speaker's turns in their own colour, and the cuts;
- a playhead that follows the video, and click anywhere to jump there;
- zoom from 1× to 32×; zoomed in, it scrolls to keep the playhead in view.

**Saving.** The edit saves itself as the producer works (`useAutosave`). If someone else saved
in between, the save is refused and has to be reloaded.

**Rendering.** **Render this edit** starts the render in GitHub Actions. The panel shows its
progress. Once ready, it links to the video in "04 Final" in Drive, and says when the edit has
changed since that render. A failed render shows its reason, and can be tried again.

## How it works

### Edit model

`lib/edit.ts` holds the edit model: `Cut`, `EpisodeEdit` and `keepRanges`.

**`keepRanges`** works out what plays:
- It merges cuts less than 80 ms apart.
- It stops each cut 40 ms short of the words on either side, so no kept word is clipped.
- At the very start or end of the episode there is no word to protect.
- Kept pieces under 150 ms are dropped.

**Other functions:**
- `editedTime` and `editedDuration` map original times onto the edit.
- `applyToChapters`, `applyToQuotes` and `editedWords` move chapters, quotes and the transcript
  onto the edited timeline.
- `CutsSchema` checks what may be saved.

**`suggestCuts` marks:**
- `um`, `uh`, `erm`, `uhm` and `hmm`;
- immediate repeats, keeping the last;
- pauses over 1.2 s, shortened to 0.5 s;
- gaps of 350 to 1,200 ms inside a sentence, cut to 150 ms, marked as `filler`. AssemblyAI leaves
  fillers out of its transcript by default, so a gap is often where one was.

### Editor

`components/studio/editor.tsx`. Its panel, `EditorLightStage` (`components/studio/editorLight.tsx`), loads, saves
and renders the edit, on the notes page and on the full-page editor.

### Routes

Both use `requireRole(STUDIO_ROLES)`:
- **`/api/studio/episodes/[id]/edit`** (GET, PUT):
  - The PUT takes `{ edit: { cuts }, version }`.
  - It checks the cuts: whole milliseconds, start before end, a known reason, at most 10,000.
  - It answers 409 when the version is not the saved one.
  - The check and the write are one transaction.
- **`/api/studio/episodes/[id]/edit-render`**: GET reports where the render stands, and POST
  starts it (`lib/server/editRender.ts`). A request that is still marked busy after 6 hours
  counts as lost.

### Render job

The workflow is `.github/workflows/podcast_edit_render.yml`. `agent/src/podcast/editRenderRun.ts`
connects Firestore, Storage and Drive. `editRenderJob.ts` plans and runs the job, and
`editRender.ts` renders.

1. **Download.** It downloads:
   - the episode: the edit package's copy, or the original;
   - the edit package's teasers and intro (the intro is also used as the outro);
   - the b-roll stills;
   - the reviewed transcript.
2. **Clean the voice**, once, over the whole sound track: highpass at 80 Hz, `afftdn`, and a gentle
   `acompressor`.
3. **Cut, in blocks.** The kept ranges go into blocks of up to 15 minutes or 20 ranges. Each
   block seeks into the source once per range, with a 15 ms fade at every join, and is encoded
   on its own. The blocks are then joined.
4. **Assemble** the programme: teasers → intro → the edited episode with b-roll (Ken Burns,
   placed at its edited time, with 0.5 s fades) → outro. It is 1920x1080, 30 fps, AAC 48 kHz,
   normalized to −14 LUFS.
5. **Save** everything:
   - The video goes to `episodes/{id}/editRender/v{edit version}-{run id}/episode.mp4`.
   - Beside it go the words, captions (.srt) and chapters/quotes on the new times.
   - The video is also saved as "*title* (Editor Light).mp4" in "04 Final" in Drive.
   - `episode.editRender` points at the new folder only once all of it is saved. The previous
     render's folder is then deleted.
6. **On failure** the job marks the render failed and emails `ALERT_EMAIL`. If the run is
   cancelled or killed before it can, the workflow's last step (`editRenderStopped.ts`) marks it
   failed instead.

It uses the existing secrets `PODCAST_SA_JSON` and `RESEND_API_KEY`, and the repo variables
`ALERT_EMAIL` and `DRIVE_PROCESSED_FOLDER_ID` (`DRIVE_FINAL_FOLDER_ID` optionally). The Studio
starts it on `main`, like every podcast job, so the workflow must be on `main` before the button
works.

### On screen, translations and retakes

Added from Jo Ann H's fork (Part I), 5 October 2026, without Part H (AI video b-roll and music).

**On screen** (full-page editor, `components/studio/onScreen.tsx`, `lib/onScreen.ts`):
- **Text**: a line and an optional smaller second line, in a chosen font, size, colour, background
  and one of nine positions, from a set time for a set number of seconds. **Name titles** adds
  each speaker's name, lower left, where they first speak.
- **Images**: a PNG or JPEG (up to 20 MB), placed and sized on the frame. Uploaded to
  `overlays/` in Storage; the edit route checks each new one is a real PNG or JPEG.
- **Captions**: burned in, in the Studio's look (settings) or this video's own.
- The preview shows them over the video, and the timeline has a row for them.
- The render turns them into one ASS subtitle file and ffmpeg overlays, on the edited timeline.
  The fonts are in `agent/assets/fonts` or installed by `podcast_edit_render.yml`.

**Translations** (`lib/translate.ts`, `components/studio/translations.tsx`): Claude translates the
captions, title and description into up to five languages (the settings choose the usual ones).
The YouTube upload adds each as a caption track with the title and description in that language.
Five at most, because each track costs 450 of YouTube's 10,000 daily API units.

**Retakes** (`lib/retakes.ts`): Claude reads the accepted transcript for lines said again, and
suggests cutting the earlier tries; the producer accepts them like any other suggestion.

Both run in `podcast_notes.yml` with `mode: translations` or `mode: retakes`, never touching the
notes, and reserve $0.40 per language and $0.30 against the daily spending limit.

### Auphonic

`agent/src/podcast/auphonic.ts` works from the command line only (`editRender.ts --clean auphonic`
or `--detect auphonic`, with `AUPHONIC_API_KEY`). It has never made a live call, and the Studio
never uses it.

### Data

On `episodes/{id}`, written only by the server routes and the job:
- `edit`: `{ cuts, version, updatedAt, updatedBy }`;
- `editRender`: status, paths, the Drive link, the length, the number of cuts and any warnings.

No rules or index changes.

## Changes on merge

Fixed when this came into the main repo:
- **Padding.** Cuts are padded inward. Before, every cut also took 40 ms of each neighbouring word.
- **Voice cleanup.** It runs once over the whole track instead of restarting at every cut, where
  it could pump.
- **Temporary files.** They are removed when a render fails, too.
- **Render folders.** Each render has its own folder. Before, a failed save could leave a new
  video with old chapters.
- **Stopped runs.** They show as failed at once, instead of after 6 hours.
- **Saved edits.** They are validated, and the version check is a transaction.
- **Editor speed.** The editor works out each word's cut once per edit. Before, it re-checked
  every cut on every render, which lagged on long episodes.
- **Demo page.** The public `/editor-demo` page and its sample video were removed.
- **Dead code.** The unreachable single-pass render branch was removed.

Checked with a one-minute flash-and-beep clip and 40 cuts. Every beep that survives the cuts is
within two frames of its flash, with and without the voice cleanup.

## Next

- Run a real episode end to end and compare its sound with Descript's.
- Editing on a phone: a Cut button and touch selection.
- A faster render for long episodes: one encode instead of two, and resuming a failed run from
  its last block.
