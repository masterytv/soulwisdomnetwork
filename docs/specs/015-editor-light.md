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
**Open the Studio editor** there goes to `/admin/podcast/[episodeId]/studio-editor` (spec 020; the old
`/edit` address redirects there): the full-page editor, laid out like Descript, with the script on the
left, the preview in the middle, the On screen and Render panels on the right, the timeline along the
bottom, and saving, Undo, Redo, the shortcut sheet (**?**) and **Render ▸** in a bar at the top.

**Editing:**
- The transcript is shown by speaker, with the video beside it.
- Click a word to jump the video there.
- Drag, or shift-click, to select words; press Delete or Backspace, or **✂ Cut selected** (for
  phones and tablets), to cut them.
- Double-click a cut to bring it back.
- Ctrl/Cmd+Z undoes, and Shift+Ctrl/Cmd+Z redoes.
- Search finds words.

**Suggestions.** **Mark filler words and long pauses** suggests cuts; **Mark hesitations** adds
the guessed ones (below), and only shows when the transcript has no "um"s written out (episodes
transcribed before `disfluencies` was on) and the audio's silences are not measured yet. Each count shows the time that kind saves. Marking again replaces that kind's earlier suggestions. The counts
(Fillers, Repeats, Pauses, Hesitations, Retakes) filter the review, and **Clear these** removes
one kind. The producer goes through them with Prev and Next, and can **Keep** one or **Hear it**
before deciding.

**Splits** (full-page editor): **✂ Split** on the timeline, or the S key, splits at the playhead,
as in Descript. The section under the playhead is shaded, and **Cut section** or **Bring section
back** acts on all of it. Click a split's handle on the ruler to remove it. Splits are
saved with the edit (`edit.splits`) but the render does not use them; only the cuts matter.

**Playing:**
- **Edited** skips the cuts as the video plays; **Original** plays everything.
- **Speed** plays at 0.75× to 2×.
- It shows the edited length and the time saved. **?** opens the editing help and shortcuts.

**Timeline** (Studio editor only, `components/studio/timeline.tsx`, `lib/timeline.ts`; spec 020 item E2):
- tracks with headers: **V2 On screen** (the on-screen items; the eye hides them in the preview),
  **V1 Episode** (a picture every 5 s, with each speaker's turns in their colour under it; the lock
  stops the timeline changing cuts) and **A1 Voice** (the waveform; the speaker icon mutes the preview);
- the cuts over the pictures and the waveform, hatched: amber for suggestions, grey for the producer's
  own. On the waveform, what the edit takes out is red;
- zoom from the whole recording to 2 ms a pixel (−, +, the slider, **Fit**, the + and − keys, or
  Ctrl/⌘ with the scroll wheel); the scroll wheel moves along it, and while playing the view follows
  the playhead;
- click the ruler or a lane to jump there; drag on the ruler to scrub; ← and → step a frame (Shift: a
  second);
- **drag a cut's edge** to trim it (spec 019 item 2.2). It snaps to the playhead, word edges, cuts and
  splits within 8 px (or to 10 ms steps), and stops at the edge of a word that is heard; Alt turns
  both off. A trimmed suggestion becomes the producer's own cut;
- **drag on the waveform** to select a stretch of time, such as a cough or a door the transcript has no
  words for; Delete (or **✂ Cut**) cuts it as the producer's own. Click a cut to select it: **▶ Hear**
  plays it in context, **Bring back** (or a double-click) removes it;
- the waveform's peaks and the pictures are made at ingest (`agent/src/podcast/timelineMedia.ts`). An
  episode without them yet says so in the lanes; the next Podcast Ingest run fills them in.

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
- Kept pieces under 150 ms are dropped, and so are pieces under 400 ms with no whole word in them
  (a breath between two close cuts; spec 019 item 1.5).

**Other functions:**
- `editedTime` and `editedDuration` map original times onto the edit.
- `applyToChapters`, `applyToQuotes` and `editedWords` move chapters, quotes and the transcript
  onto the edited timeline.
- `CutsSchema` checks what may be saved.

**`suggestCuts` marks:**
- filler words (`lib/fillers.ts`): `um`, `uh`, `er`, `erm`, `uhm`, `hm`, `hmm` and `mhm`, however many
  letters they are written with. Ingest turns on AssemblyAI's `disfluencies` option, so they are in
  the transcript. Quote matching (`locate`) and re-timing onto the final cut (`timeMap`) skip them;
- immediate repeats, keeping the last, when they are a stammer: the same speaker, inside one
  sentence, the second word within 300 ms of the first;
- pauses over 1.2 s, shortened to 0.5 s. Since spec 019 item 1.1 they are the silences measured in
  the audio at ingest (`media.silencesPath`), when the episode has them; otherwise the gaps between words;
- with the audio's silences (spec 019 item 1.2): stretches of 0.3 to 1.5 s between two words of one
  speaker's clause that no word covers and that are not silent, as `filler`: speech the transcript
  missed. Every such stretch, at any length, shows as `…` in the transcript; a click cuts it;
- only with **Mark hesitations** (`gaps: true`), and only without silences: gaps of 0.5 to 1.2 s after a word that ends no
  sentence or clause (no . ? ! , ; : or dash), cut to 150 ms, as `gap`. Episodes transcribed before
  `disfluencies` was on have no fillers in the transcript, and AssemblyAI still misses some, so a
  gap is often where one was, but often only a breath. Until
  5 October 2026 these were every 350 to 1,200 ms gap inside a sentence, marked `filler`; on a
  49-minute conversation that was over 2,000 suggestions. Edits marked then still show them as
  hesitations; **Clear suggestions** and marking again sorts them.

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
5. **Check** the finished file (`renderQc.ts`, spec 019 item 0.2): loudness, true peak, length
   against the plan, dead air, black picture, sound against picture, and on-screen items. The
   numbers and warnings go in `editRender.qc` and show under the render; they never fail it.
6. **Save** everything:
   - The video goes to `episodes/{id}/editRender/v{edit version}-{run id}/episode.mp4`.
   - Beside it go the words, captions (.srt) and chapters/quotes on the new times.
   - The video is also saved as "*title* (Editor Light).mp4" in "04 Final" in Drive.
   - `episode.editRender` points at the new folder only once all of it is saved. The previous
     render's folder is then deleted.
7. **On failure** the job marks the render failed and emails `ALERT_EMAIL`. If the run is
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
- **Captions**: burned in (drawn into the picture, so every viewer sees them and nobody can
  turn them off), in the Studio's look (settings) or this video's own. **Off by default; an
  option to turn on** per Studio or per video (Tom, N1 in `docs/PLANNING.md`). The YouTube
  caption track, which viewers switch on and off themselves, is always uploaded either way.
- The preview shows them over the video, and the timeline has a row for them.
- The render turns them into one ASS subtitle file and ffmpeg overlays, on the edited timeline.
  The fonts are in `agent/assets/fonts` or installed by `podcast_edit_render.yml`.

**Translations** (`lib/translate.ts`, `components/studio/translations.tsx`): Claude translates the
captions, title and description into up to five languages (the settings choose the usual ones).
The YouTube upload adds each as a caption track with the title and description in that language.
Five at most, because each track costs 450 of YouTube's 10,000 daily API units.

**Suggest a tighter edit** (`lib/retakes.ts`, spec 019 item 1.3; until then **Find retakes with
Claude**): Claude reads the accepted transcript for retakes, false starts, restarts, verbal tics
("you know", "I mean"), housekeeping ("can you hear me?") and tangents, and suggests cutting them.
Nothing touching an approved key quote or teaser clip is suggested. Each is a `retake` cut,
counted under **Retakes**; the review row shows its kind and Claude's reason. The producer reviews
them like any other suggestion.

Both run in `podcast_notes.yml` with `mode: translations` or `mode: retakes`, never touching the
notes, and reserve $0.40 per language and $0.50 against the daily spending limit.

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

- **Run a real episode end to end** and compare its sound with Descript's (Tom). Write here: the
  render time, the suggestion counts per kind on the 49-minute episode (019 item 1.6 measures
  against them), how many of Claude's tighter-edit suggestions the producer kept (019 item 1.3),
  and what that run cost (`usage_reports`, against the $0.50 reserved).
- Editing on a phone: touch selection. (**✂ Cut selected** is built, #130.)

Everything else is planned in `docs/specs/019-editor-light-v2.md`, whose status table is the
record: the faster render is its item 4.2, fewer suggestions 1.6, the tighter edit 1.3. Start at
`docs/PLANNING.md`.
