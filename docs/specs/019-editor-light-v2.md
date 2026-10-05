# Spec 019: Editor Light v2 — the best of the open-source editors

**Date:** 5 October 2026
**Status:** Planned. Not started. It begins after the current plan is finished (see "Before you
start").
**Author:** Claude, from Tom's request to review Rescript, CutScript and other open-source
Descript alternatives.
**Research:** `docs/research/2026-10-05-open-source-editors.md`. Read it first; this spec does not
repeat it.
**Related:** `docs/specs/005-podcast-production-pipeline.md` (stages),
`docs/specs/010-final-cut.md`, `docs/specs/015-editor-light.md`,
`docs/specs/018-studio-settings.md`, `docs/specs/020-studio-editor.md` (the full editing page,
items E1–E9 below)

We keep our own editor and render, and add the best ideas from the alternatives. The goal is for
Editor Light to replace Descript as the final edit, with:
- fewer minutes of producer time per episode;
- sound at least as good as Descript's Studio Sound;
- a full editing page beside the simple pipeline (split, move, timeline with audio, media,
  overlays, music, titles; spec 020) for episodes that need more than cuts;
- a way out to Resolve, Premiere or Final Cut for the rare episode that needs even more.

## Before you start

This is the pick-up point for a new conversation. **Read `docs/PLANNING.md` first.** It lists the
decisions, and where this plan overlaps work that reached `staging` after it was written (retakes,
splits, on-screen text and images, burned-in captions). Reconcile those before building. Then
pick up here, in order:

1. **Check the prerequisites are done:**
   - The current plan is merged to `main`: Jo Ann H's Parts A–G, and spec 015's
     "Run a real episode end to end and compare its sound with Descript's".
   - masterytv/soulwisdomnetwork#126 is merged: AssemblyAI `disfluencies` is on, and
     `lib/fillers.ts` exists.
   - If any of these is not done, finish it first, or say which item below depends on it.
2. **Read:**
   - `CLAUDE.md`;
   - the research document above;
   - specs 015, 018 and 020;
   - this spec's "Rules for this work".
3. **Take the next item** whose status is "Not started" in the order of the table below. Its
   "Needs" column must be done.
4. **Mark it done.** When an item is merged, set its status in the table to "Done (PR link)".
   Then update spec 015 (what Editor Light does) and `CLAUDE.md` if a new job, secret or setting
   came with it.

### Rules for this work

- **One item, or a few small ones, per PR**, into `staging` (`CLAUDE.md`, Git).
- **Licences:**
  - Copy code only from MIT or public-domain sources: CutScript, Rescript's tree at `a9b378e^`,
    and auto-editor. Copy the source's licence into `docs/licences/` and name it in the file's
    header comment.
  - Items marked **idea only** come from Rescript's noncommercial code. Build them from this
    spec and the research document, **without opening Rescript's current code**.
- **Tests:**
  - Pure logic goes in `lib/` with a `*.test.ts` beside it.
  - Run the tests with `npx tsx --test lib/*.test.ts agent/src/podcast/*.test.ts`, or
    `npm test` once item 0.1 adds it.
- **Paid runs:**
  - Anything that calls Claude, OpenAI or Auphonic goes through `withinDailyLimit` in
    `lib/server/spending.ts`, with a new `ESTIMATE_USD` key.
  - Every API route calls `requireRole()`.
- **Jobs run from `main`.** Like every podcast job, a new or changed workflow only works from the
  Studio once it is on `main`.
- **Never break the Descript path.** `finalSource: 'descript'` (spec 018) must keep working
  until item 5.3 retires it.

## The plan at a glance

Effort: **S** = up to half a day, **M** = 1–2 days, **L** = 3–5 days.

| # | Item | From | Effort | Needs | Status |
|---|---|---|---|---|---|
| **0** | **Safety net** | | | | |
| 0.1 | Checks on every pull request | ours | S | — | Not started |
| 0.2 | Quality report on every render | ffmpeg | M | — | Not started |
| **1** | **Better cut suggestions** | | | | |
| 1.1 | Pauses measured from the audio | auto-editor, ffmpeg | M | — | Not started |
| 1.2 | Speech the transcript missed | Rescript (idea only) | M | 1.1 | Not started |
| 1.3 | Claude "Tighten" suggestions | CutScript (MIT) | M | — | Not started |
| 1.4 | Accept or restore a whole kind of cut | Rescript (idea only) | S | — | Not started |
| 1.5 | Drop kept slivers with no words | Rescript (MIT) | S | — | Not started |
| 1.6 | Fewer, better suggestions (2,970 on a 49-minute episode today) | ours | S | — | Not started |
| **2** | **Editing precision** | | | | |
| 2.1 | Waveform on the timeline | Rescript (MIT) | M | — | Built in E2 |
| 2.2 | Drag cut edges; cut a stretch of time | Rescript (MIT) | M | 2.1 | Built in E2 |
| 2.3 | Correct a misheard word | Rescript (MIT) | M | — | Not started |
| 2.4 | Names spelled right from the start | AssemblyAI | S | — | Not started |
| 2.5 | Highlight words the transcriber was unsure of | ours | S | — | Not started |
| 2.6 | Autosave that survives a closed tab | Rescript (MIT) | S | — | Not started |
| **E** | **Studio editor: the full editing page (spec 020)** | | | | |
| E1 | Workspace shell: script, preview, panels, timeline | Descript's layout | M | — | Not started |
| E2 | Timeline engine, waveform, thumbnails, drag cut edges | Rescript (MIT), ours | L | E1 | Not started |
| E3 | Split and trim parts (no moving yet, U4) | ours | M | E2 | Not started |
| E4 | Transitions: Cut, Dissolve, Fade, and more | ffmpeg `xfade` | M | E3 | Not started |
| E5 | Media bin, uploads, image and video overlays | ours, react-rnd, dnd-kit | L | E3 | Not started |
| E6 | Titles, lower thirds, logo, text; Properties panel | ours (ASS, as Shorts) | M | E5 | Not started |
| E7 | Music and effects tracks, fades, ducking | ours (ffmpeg), free libraries | M | E5 | Not started |
| E8 | YouTube caption track on the timeline; polish | ours | M | E6 | Not started |
| E9 | Later: move clips, drop a new intro or outro | ours | L | E4, Tom's go-ahead | Not started |
| **3** | **Sound** | | | | |
| 3.1 | Voice clean-up bake-off | DeepFilterNet, Auphonic | M | 0.2 | Not started |
| 3.2 | The winner as a Studio setting | DeepFilterNet or Auphonic | M | 3.1 | Not started |
| 3.3 | One track per speaker | Auphonic or ffmpeg | L | Stage 0 Zoom check | Not started |
| **4** | **Render and hand-off** | | | | |
| 4.1 | "Open in Resolve, Premiere or Final Cut" | auto-editor | M | — | Not started |
| 4.2 | Faster, resumable render | ours (spec 015 "Next") | L | 0.2 | Not started |
| 4.3 | Smoother preview | ours | M | — | Not started |
| **5** | **The rest of the pipeline** | | | | |
| 5.1 | Audio podcast feed | ours | L | Decision D2 | Not started |
| 5.2 | Animated captions and graphics, if wanted | Revideo | M | Decision D4 | Not started |
| 5.3 | Retire Descript | — | S | 0.2, 3.2, three real episodes | Not started |

**Why this order:**
- Phase 0 makes every later change safe to ship.
- Phase 1 saves the most producer time per episode. Item 1.6 first: today's 2,970 suggestions
  bury the useful ones.
- Phase 2 makes the edits that remain quick and exact.
- Phase E, the Studio editor, starts after Phase 1. E1–E3 come before the rest of Phase 2,
  because 2.1 and 2.2 are built inside E2. E4 (transitions) is next, because dissolve and fade
  are needed now. E5–E8 can follow Phase 3 if sound matters more. E9 waits for Tom.
- Phase 3 closes the last quality gap with Descript (Studio Sound).
- Phase 4 makes renders fast and gives an escape hatch.
- Phase 5 widens the pipeline.

Items within a phase are independent unless "Needs" says otherwise.

## Phase 0 — Safety net

### 0.1 Checks on every pull request (S)

**Why:** no workflow runs on pull requests today. Every check is run by hand, and a red build
costs a ten-minute App Hosting cycle.

**Build:**
- `.github/workflows/checks.yml`, triggered `on: pull_request` to `staging` and `main`. It runs:
  - `npm ci`
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm test`
  - `npm run build`, with placeholder `NEXT_PUBLIC_FIREBASE_*` values (no secrets)
- `"test": "tsx --test lib/*.test.ts agent/src/podcast/*.test.ts"` in `package.json`.
- Fix the 7 lint errors already on `staging` (`app/login`, `app/members`, `app/messages`) so
  lint can block.
- Remove the dead `"video"` script, which points at a `remotion/` folder that no longer exists.

**Not a deploy workflow.** `CLAUDE.md` forbids one, and this deploys nothing. Say so in
`CLAUDE.md`.

**Done when:** a PR shows one green "checks" run, and a deliberately broken test turns it red.

### 0.2 Quality report on every render (M)

**Why:** the render can succeed and still be wrong. Today nobody checks the finished file before
it goes to YouTube.

**Build:** `agent/src/podcast/renderQc.ts`, run at the end of the edit render (`editRenderJob.ts`)
and the final cut (`final.ts`). It checks:

| Check | How | Warn when |
|---|---|---|
| Loudness | `ebur128=peak=true` | Integrated loudness is outside −14 ± 1 LUFS, or the true peak is above −1 dBTP |
| Normalization | second `loudnorm` pass | `normalization_type` is not `linear` |
| Length | ffprobe | It differs from teasers + intro + `editedDuration` + outro by more than 1 s |
| Dead air | `silencedetect=noise=-50dB:d=3` | Any silence of 3 s or more |
| Black video | `blackdetect=d=0.5:pix_th=0.1` | Any black stretch in the edited episode (the intro, outro and teasers are checked once, not per render) |
| Sound and picture | ffprobe stream durations | Audio and video lengths differ by more than 2 frames |

**Results** go in `editRender.qc` (and `final.qc`) as numbers plus a `warnings[]`. The render
panel and the final-cut page show the warnings. Warnings never fail the job.

**Done when:** a render of the real episode shows its numbers, and a render with a deliberately
broken loudness pass shows a warning. `renderQc.test.ts` parses canned ffmpeg output.

## Phase 1 — Better cut suggestions

The producer reviews suggestions with Prev, Next, Keep and Hear it (spec 015). Every item here
adds suggestions to that same flow. None of them cuts anything on its own.

### 1.1 Pauses measured from the audio (M)

**Why:** `suggestCuts` finds pauses only between words. AssemblyAI's word ends are not exact, and
a long word can hide a silence. The audio shows where the sound really stops.

**Build:**
- **At ingest** (`agent/src/podcast/ingest.ts`), after `audio.m4a` is made:
  `ffmpeg -i audio.m4a -af silencedetect=noise=-35dB:d=0.3,ametadata=mode=print:file=- -vn -f null -`.
  - Save `episodes/{id}/analysis/silences.json` as `{ noiseDb, minMs, silences: [{ startMs, endMs }] }`
    and its path on the episode (`media.silencesPath`).
  - auto-editor (`--edit audio:-35dB --export v1 -tb 1000 -o -`) gives the same thing. Use plain
    ffmpeg first: it is already installed and needs no new binary. Keep auto-editor for 4.1.
- **Backfill** for episodes ingested before this: a `--analyse` mode on the ingest job, or a small
  workflow. It runs once per episode that has no `silencesPath`.
- **`suggestCuts(words, { silences })`** in `lib/edit.ts`:
  - a measured silence over 1.2 s is shortened to 0.5 s, even when it falls inside a word's time
    span;
  - a word-gap pause the audio says is not silent (laughter, breath, music) is no longer
    suggested.
- **Editor:** the `/edit` page and the notes page pass the silences in (signed URL, as for the
  proxy in `lib/server/notes.ts`).

**Tests:** `lib/edit.test.ts` cases for both rules.

**Done when:** on the real episode, the pause suggestions line up with what you hear. Compare the
count before and after.

### 1.2 Speech the transcript missed (M, idea only)

**Why:** even with `disfluencies` on, AssemblyAI drops some "um"s and false starts. Today they
are only guessed from gaps (`suggestCuts`' 350–1,200 ms rule).

**Build:**
- Any stretch of at least 300 ms that is **not** silent by 1.1 and that no word covers becomes a
  marker in the transcript, shown as `…`.
- The producer can cut it like a word, and it is offered as a `filler` suggestion.
- It replaces the gap guess when silences exist; old episodes without silences keep the guess.
- Pure function `unspokenSpans(words, silences, durationMs)` in `lib/edit.ts`, with tests.

**Done when:** on the real episode, most markers are a real hesitation or breath.

### 1.3 Claude "Tighten" suggestions (M, prompt adapted from CutScript, MIT)

**Why:** word lists cannot find "you know", "I mean", false starts ("I went — we drove there"),
restarts ("let me say that again") or housekeeping ("can you hear me?"). Descript's AI and
CutScript both do this, and it is where most editing time goes.

**Build:**
- **Job:** `agent/src/podcast/tighten.ts`, started from the editor's **Suggest tighter edit**
  button. It runs in GitHub Actions like notes (`podcast_tighten.yml`, or a mode of
  `podcast_notes.yml`).
- **Input:** the reviewed transcript as numbered words with speaker turns, plus the episode's
  approved quotes and teaser clips (`notes`), which it must **never** suggest cutting.
- **Output:** structured output (zod, as `notesDraft.ts` does), as a list of
  `{ firstWord, lastWord, kind: 'false-start' | 'restart' | 'verbal-tic' | 'housekeeping' | 'tangent', why }`.
  - Validate the indexes.
  - Drop anything that overlaps a quote or teaser.
- **Saved as** `episodes/{id}.tighten = { suggestions, model, usd, at }`.
- **Edit model:** the edit gets a new cut reason, `'tighten'`. Add it to `Cut` and `CutsSchema`
  in `lib/edit.ts`.
- **Editor:** suggestions show with their `why` in the existing review flow. **Nothing is
  applied without the producer.** This is the fix for CutScript's apply-all.
- **Cost:** `ESTIMATE_USD.tighten` in `lib/server/spending.ts`, about $0.50 for an hour with the
  notes model. Record the real cost in `usage_reports` (spec 014).
- **Prompt:**
  - Start from CutScript's `detect_filler_words` prompt (quoted in the research document) and
    copy its licence to `docs/licences/`.
  - Tell it to be conservative.
  - Respect `extraInstructions` from Studio settings.

**Done when:** on the real episode, the producer keeps most suggestions. Write the share kept in
spec 015.

### 1.4 Accept or restore a whole kind of cut (S, idea only)

**Build:**
- In the suggestions panel: **Accept all** and **Restore all** for each reason (`filler`,
  `pause`, `repeat`, `tighten`), with counts.
- Manual cuts are never touched.
- Each button is one undo step.

### 1.5 Drop kept slivers with no words (S)

**Why:** two cuts close together leave a few hundred milliseconds of breath between them. That
sounds choppy, and adds joins and render time.

**Build:**
- In `keepRanges`, a kept piece shorter than 400 ms that contains **no whole word** is dropped.
- Today only pieces under 150 ms are dropped.
- Rescript merges cuts closer than 0.35 s. Ours is safer because it checks for words.

**Tests:** in `lib/edit.test.ts`.

### 1.6 Fewer, better suggestions (S)

**Why:** on a real 48:53 episode, **Mark filler words and long pauses** offered 2,970
suggestions:
- 2,250 "fillers", 300 repeats and 420 pauses, about one a second;
- most "fillers" are gap guesses (`suggestCuts`' 350–1,200 ms rule). The editor labels them
  "um" (`components/studio/editor.tsx`, the gap chip), so the producer cannot tell a real "um"
  from a guess.

Nobody reviews that many one at a time.

**Build:**
- **Record at ingest** whether the transcript has fillers: `transcript.disfluencies: true`, from
  masterytv/soulwisdomnetwork#126 on.
  - For those episodes, turn the gap guess off. Real "um"s are now words.
  - Item 1.2 later finds the ones AssemblyAI missed, from the audio.
- **Label a guess as a guess:** "gap 0.9s", not "um".
- **For older episodes**, keep the guess, but:
  - only for gaps of at least 600 ms;
  - never straight after a comma;
  - never in a gap that 1.1 measures as silent, once 1.1 exists.
- **Repeats:** only within one sentence, and only when the second word follows within 300 ms,
  so a word said again for emphasis after a pause is left alone. Check on the episode which of
  the 300 repeats were real stammers before settling the numbers.
- **Review by kind:** show each kind's count and the time it saves. Walk one kind at a time,
  with item 1.4's Accept all.
- **Measure** on the same episode, and write the before and after counts in spec 015. Aim for
  under 300 suggestions an hour that the producer mostly keeps.

## Phase 2 — Editing precision

### 2.1 Waveform on the timeline (M, drawing idea from Rescript's MIT tree)

**Built as part of spec 020 item E2.** The detail below is what E2 needs for the waveform.

**Build:**
- **At ingest**, and in the backfill from 1.1, compute peaks from `audio.m4a`:
  - decode to 8 kHz mono s16 with ffmpeg;
  - take the min and max of every 10 ms as two Int8 values;
  - save as `episodes/{id}/analysis/peaks.bin`, about 720 KB an hour, with `media.peaksPath`.
- **The timeline** (`components/studio/timeline.tsx`) draws a canvas lane under the speaker row:
  - only the visible window, at devicePixelRatio;
  - one bar per pixel column, from the buckets under it;
  - cut parts red and hatched.
- **Peaks are loaded** with the same signed-URL pattern as the proxy.

**Done when:** at 32× zoom a breath or click is visible, and the lane redraws without lag on a
2-hour episode.

### 2.2 Drag cut edges, and cut a stretch of time (M, idea from Rescript's MIT tree)

**Built as part of spec 020 item E2.**

**Build:**
- **Cut handles:** each cut on the timeline gets start and end handles.
  - Drag snaps to 10 ms.
  - A cut edge cannot move into a kept word unless Alt is held.
- **Time-range cut:** drag on the waveform lane to select a stretch of time; Delete cuts it as
  `manual`. This handles a cough, a laugh or a door that is not in the transcript.
- **Undo:** a whole drag is one undo step. Start a history entry on pointer-down, and drop it on
  pointer-up if nothing changed.
- **Pure helpers** in `lib/timeline.ts` (`moveCutEdge`, `clampToWords`), with tests.

### 2.3 Correct a misheard word (M, algorithm from Rescript's MIT tree)

**Why:** a misheard name ends up in the YouTube captions and in quotes. Today speaker review can
fix speakers but not words (`TranscriptCorrections` in `types/episode.ts`).

**Build:**
- **Store:** `corrections.words: { [wordIndex]: { count, text } }`. It replaces `count` words
  from `wordIndex` with `text`, so it can split or merge.
- **Timing:** the new words share the old span in proportion to their length, with the last
  word's end pinned to the old end. A word is at least 20 ms long. This is Rescript's
  `correctWords`; credit it in the file header and `docs/licences/`.
- **Applied in** `lib/transcript.ts` `buildLines`, so speaker review, notes, the editor and the
  captions all see it.
- **Where the producer does it:**
  - **in speaker review**, which is the record (`raw.json` is never edited);
  - **in the editor**, by double-clicking a word to retype it. It saves through the same
    corrections route.
- **Find and replace** for a name across the episode: one correction per occurrence, one undo
  step.

**Done when:** a corrected word shows in the editor, in the Editor Light `.srt` and in the
YouTube captions of a test upload.

### 2.4 Names spelled right from the start (S)

**Build:**
- In `submitTranscription` (`agent/src/podcast/transcribe.ts`), send AssemblyAI
  `keyterms_prompt`. The SDK has it; check the speech models we use accept it, and how many terms.
- The terms come from Studio settings: the show name, the hosts, and a new **recurring names**
  list (guests, places, terms such as "near-death experience").
- Keep `speaker_identification` as is.

**Done when:** a test episode spells the show name and the hosts right without corrections.

### 2.5 Highlight words the transcriber was unsure of (S)

**Build:**
- Carry each word's `confidence` (in `raw.json`, dropped by `ReviewWord` in `lib/transcript.ts`)
  through to the editor and speaker review.
- Underline words under 0.6 in a dotted amber line, so the producer checks names and numbers
  first.
- Neither Rescript nor CutScript does this.

### 2.6 Autosave that survives a closed tab (S, idea from Rescript's MIT tree)

**Build:**
- Keep the last unsaved edit in `localStorage`, keyed by episode and version, and flush when the
  tab is hidden.
- On load, offer to restore a local draft that is newer than the saved edit.
- The server's version check (409) still decides; a stale draft is never written over a newer
  save.

## Phase 3 — Sound

### 3.1 Voice clean-up bake-off (M)

**Why:** Descript's Studio Sound is the last thing Descript does that we cannot match yet. We
should choose by ear, on our own recordings.

**Build:**
- `agent/src/podcast/cleanupCompare.ts` and a run-by-hand workflow, like
  `podcast_notes_compare.yml`.
- It takes an episode and a 10-minute stretch, and makes four versions, all at −14 LUFS:
  1. today's chain (`highpass`, `afftdn`, `acompressor`);
  2. DeepFilterNet in the same chain, through its LADSPA plugin (v0.5.6, pinned, checksum checked
     in the workflow), replacing `afftdn`;
  3. Auphonic, with denoise and leveller on (check the field names against
     `https://auphonic.com/api/info.json` first, and use the free 2 hours);
  4. Descript's Studio Sound, from the same stretch of the Descript final cut, if there is one.
- It puts them in a "Clean-up comparison" folder in Drive, with each one's loudness, and the
  time and cost it took.

**Done when:** Tom and the producer have listened and chosen. Write the choice and why in spec 015.

### 3.2 The winner as a Studio setting (M)

**Build:**
- `voiceCleanup: 'standard' | 'deepfilter' | 'auphonic'` in `lib/studioSettings.ts` (spec 018's
  table), used by `editRenderJob.ts`. Today the job never passes a clean option.
- **DeepFilterNet:**
  - It runs on one core: about 25 minutes per hour of audio. Split the audio into four pieces
    with 1 s overlaps, clean them in parallel, and join them with crossfades, or accept the
    time.
  - It stays inside the 350-minute job limit either way.
- **Auphonic:**
  - `AUPHONIC_API_KEY` becomes a repo secret.
  - Each render reserves its cost through `withinDailyLimit`, about $1.20 an hour on the smallest
    plan.
  - Use detect-only cutting as today, so our cut list stays the record.

### 3.3 One track per speaker (L, only if recordings have them)

**Depends on** spec 005 Stage 0's Zoom check ("record a separate audio file for each
participant").

**If the files exist:**
- ingest them beside the mix;
- clean and level each track;
- gate crosstalk;
- mix them for the render.

Auphonic multitrack does all of this in one call. The ffmpeg route (`agate` and `dynaudnorm` per
track, then `amix`) is free but harder to tune. Choose after 3.1.

**Bonus:** speaker detection becomes almost free of errors, because each track is one person.

## Phase 4 — Render and hand-off

### 4.1 "Open in Resolve, Premiere or Final Cut" (M)

**Why:** a way out for the rare episode that needs more than cutting, without keeping Descript in
every run. Descript cannot import these files, so this is the replacement path.

**Build:**
- In the edit render job, write the kept ranges as an auto-editor v3 timeline JSON (milliseconds,
  `-tb 1000`).
- Run the pinned `auto-editor` 31.7.2 binary with `--export premiere`, `--export resolve-fcp7` and
  `--export final-cut-pro:version=10`.
- Rewrite the absolute media paths to the original file's name, so the producer relinks to their
  copy.
- Save the three files beside the render in Storage and in the episode's Drive folder, and link
  them from the render panel.
- **Variable frame rate:** Zoom recordings can be variable. If ffprobe shows it, warn that the
  editor app may drift, and offer a constant-frame-rate proxy.

**Done when:** each file opens in DaVinci Resolve (free) with the right cuts in sync.

### 4.2 Faster, resumable render (L, spec 015 "Next")

**Build:**
- **One encode:** cut, assemble, add b-roll and normalize in a single filter graph per block,
  instead of encoding the blocks and then the whole programme again.
- **Resume:** each finished block is saved under the run's folder in Storage. A retried run skips
  blocks that are already there.
- **Parallel:** encode two blocks at a time on the runner's 4 cores.
- **Measure:** time per hour of episode, before and after. 0.2 must stay clean on both.

### 4.3 Smoother preview (M)

**The Studio editor's preview (spec 020) uses this for its episode track.**

**Why:** both repos and ours preview by seeking past cuts on one `<video>`, which can stutter at
a cut.

**Build:**
- A second hidden `<video>` on the same proxy, seeked ahead to the start of the next kept range.
- At the cut, swap which element is visible and playing.
- A 15 ms volume ramp on each side, through Web Audio, to match the render's join fades.
- Fall back to seeking when the next cut is under 1 s away.

## Phase 5 — The rest of the pipeline

### 5.1 Audio podcast feed (L, needs decision D2)

**Why:** today the pipeline publishes to YouTube only. Spec 010 already notes that podcast apps
prefer −16 LUFS.

**Build:**
- From the final cut, make an MP3 (or M4A) at −16 LUFS with chapter markers (ID3 CHAP from
  `final` chapters) and the episode art.
- Publish an RSS feed that Apple Podcasts and Spotify can read:
  - either a route on the site serving `podcast.xml` from Firestore, with the audio in a public
    bucket path;
  - or a podcast host's API.
- `storage.rules` stays closed whichever way.

### 5.2 Animated captions and graphics (M, needs decision D4)

**Only if wanted.** Animated word-by-word captions, audiograms for audio-only clips, or speaker
lower thirds.

- Use **Revideo** (MIT, renders headless in Actions).
- Use Remotion instead only if the company will stay at 3 employees or fewer, or pays its licence.
- Today's ffmpeg and ASS captions in `shortsRender.ts` stay the default.

### 5.3 Retire Descript (S)

**When:** three real episodes in a row have gone out with `finalSource: 'editorLight'`, with:
- no quality-report warnings left unexplained;
- sound the producer prefers or cannot tell apart from Descript's (3.1);
- producer time per episode at or under spec 005's 45 minutes.

**Then:**
- make `editorLight` the default in `lib/studioSettings.ts`;
- hide "Send to Descript";
- keep the Descript code for three more months before deleting it;
- update spec 005 step 9, spec 009, spec 010 and `CLAUDE.md`.

## Not adopting

| What | Why |
|---|---|
| Rescript's current code (at or after `a9b378e`, and `608c2d4`) | PolyForm Noncommercial. Its ideas are used here as "idea only". |
| Transcription or rendering in the browser (Rescript, ffmpeg.wasm) | Too slow and memory-hungry for hour-long episodes. Its isolation headers would likely break Google pop-up sign-in. |
| CutScript's Python backend, apply-all AI cuts, stream-copy joins | Heavy, unsafe or imprecise. Its caption timing is wrong after cuts. |
| Audapolis, transcribee | AGPL-3.0. |
| OpenCut, Twick, Editly, Motion Canvas, Diffusion Studio | Rewriting, fragile in CI, stale, or watermarked (see the research document). |
| OpenTimelineIO as our edit format | No JavaScript library. Our cut list stays the record; 4.1 converts it. |

## Decisions needed (Tom)

| # | Question | Needed before |
|---|---|---|
| D1 | Is a paid Auphonic plan acceptable (from about $11 a month for 9 hours) if it wins the bake-off? | 3.2 |
| D2 | Do we want an audio podcast feed (Apple, Spotify)? If so, on our own site or through a podcast host? | 5.1 |
| D3 | Are the retirement criteria in 5.3 right, and who signs off each episode? | 5.3 |
| D4 | Do we want animated captions or graphics? If so, will the company stay at 3 people or fewer (Remotion's free tier), or do we use Revideo? | 5.2 |
| D5 | Will recordings have one audio track per speaker (spec 005 Stage 0's Zoom check)? | 3.3 |
| D6 | Is the phase order right, or should something move up? | Phase 1 |

The Studio editor's decisions (U1–U5) are in spec 020, answered on 5 October 2026.

## How this fits spec 005's stages

- **Item 0.1** is foundation work. It can be done with Stage 0 or any time before Phase 1.
- **Item 3.3** waits on Stage 0's Zoom recording checks.
- **Phases 1–4** improve Checkpoint C (the edit) and steps 10–11 (final cut and re-timing).
  They change no other checkpoint.
- **Item 5.1** extends step 13 (publish) beyond YouTube. **Item 5.2** extends step 14 (Shorts).
