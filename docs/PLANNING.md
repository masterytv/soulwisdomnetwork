# Planning: Editor Light, the Studio editor, and the rest of the pipeline

**Written:** 5 October 2026, in the planning conversation (masterytv/soulwisdomnetwork#126).
**Reconciled:** 5 October 2026, by the development conversation, against the code on `main`
(everything from Jo Ann H's fork except Part H, plus splits and hesitations; promoted in
masterytv/soulwisdomnetwork#132). See "What the development conversation learned" and the
decisions in "Overlaps" below.

This is the entry point. The detail is in the documents below; this page says what was decided,
in what order to build, and how the plan fits the work already built.

## The documents

| Document | What it is |
|---|---|
| `docs/research/2026-10-05-open-source-editors.md` | What Rescript, CutScript, auto-editor, DeepFilterNet, Auphonic, Remotion, Revideo and others offer, their licences, and what was measured on a runner-like machine |
| `docs/research/2026-10-05-free-music-and-effects.md` | Free and royalty-free music and effects sources, with terms to check by hand |
| `docs/specs/019-editor-light-v2.md` | **The plan and its status table**: Phases 0–5 and E. Start at its "Before you start" |
| `docs/specs/020-studio-editor.md` | The Studio editor: an optional full editing page beside the simple pipeline (items E1–E14) |
| `docs/specs/015-editor-light.md` | What Editor Light does today |
| `docs/BACKLOG.md` | Points to 019 and 020 |

## Decisions so far

**Direction:**
- **Keep our own editor and ffmpeg render.** Adopt ideas, not projects.
  - Rescript is PolyForm Noncommercial since `a9b378e`. Only its earlier tree is MIT; anything
    later is "idea only".
  - CutScript (MIT) is an abandoned prototype.
- **Code may be copied only from MIT or public-domain sources**, with the licence kept in
  `docs/licences/`: CutScript, Rescript at `a9b378e^`, and auto-editor.
- **Evolve what exists; never build a second version.** Spec 020's `Sequence` is the target
  shape; `episodes/{id}.edit` (`EpisodeEdit` in `lib/edit.ts`) is what grows into it.

**Made in PR #126:**
- AssemblyAI `disfluencies` is on, so "um"s are in new transcripts.
- Quote matching, re-timing and the Shorts quote check skip fillers (`lib/fillers.ts`).

**Studio editor (spec 020), answered by Tom:**

| # | Question | Answer |
|---|---|---|
| U1 | Captions | The **YouTube caption track**; nothing new burned in. Part I's burned-in option stays, off by default (N1). |
| U2 | Music and effects | **Free or royalty-free sources; the team checks licences by hand.** Transitions: **Dissolve and Fade now**, others if available (14 more listed, all rendered with the runners' ffmpeg). |
| U3 | Devices | **Desktop only** (1280 px and wider) for the Studio editor. |
| U4 | Moving clips | **Not now.** Dragging clips to new places, such as dropping a new intro or outro, will be needed eventually: item E9. |
| U5 | Name | **"Studio editor".** |

## Decisions answered by Tom (5 October 2026)

| # | Question | Answer | What it changes |
|---|---|---|---|
| **N1** | Part I's **burned-in captions** (drawn into the picture, so every viewer sees them) against U1 "YouTube caption track only" | **Keep, as long as they can be turned on or off.** | Nothing to build: they are already an option, off by default, per Studio (`burnCaptions`) and per video (`edit.captions`). The YouTube caption track is always uploaded. E8 keeps the switch in the Captions panel. |
| **N2** | Part H's Sora video b-roll and ElevenLabs composed music | **Drop.** | E7 reuses only Part H's ducking mix and music upload. |
| **N3** | `.firebase/` (24 files of Firebase Hosting build output, committed in `91670bd`) | **Delete.** | Removed in item 0.1, since it is what lint trips on. |
| D1 | A paid Auphonic plan? | **No: the free plan, 2 hours a month.** We are leaving Descript to reduce costs. | 3.2 counts the month's Auphonic hours and refuses a render that would go over; DeepFilterNet or standard stays the everyday default. |
| D2 | An audio podcast feed? | **Yes, later.** | 5.1, on our own site. |
| D3 | Descript's retirement criteria | **Keep.** | 5.3 as written; Tom signs off. |
| D4 | Animated captions or graphics? | **Not for full episodes now.** Shorts already have animated captions. | 5.2 dropped. |
| D5 | One audio track per speaker? | **An option**, so a recording without separate files still works. | 3.3 uses speaker tracks when they exist and the mix when they don't. |
| D6 | The phase order | **Keep.** | — |

## Model effort, and how we build

Tom builds in this conversation and **compacts after each major build** (each phase, or each E
item). So:
- **Before starting an item, Claude says which model effort to switch to**, from the table below
  (also the "Model effort" column in spec 019 and spec 020), and waits until Tom has switched.
- Anything the next item needs goes into the specs and this page, not only into chat, so it
  survives compacting.

| Effort | Items | Why |
|---|---|---|
| **Medium** | 0.1, 1.5, 1.6 (the rest), 2.4, 2.5, 2.6, 5.3; doc updates; CI fixes | Small, and the PR checks catch the usual mistakes |
| **High** (the default) | 0.2, 1.1, 1.2, 1.3, 2.3, E1, E6, E7, E8, 3.1, 3.2, 3.3, 4.1, 4.3, 5.1 | Needs reading around the change: the gotchas below don't break the build, and some bugs only show on a real episode after promotion |
| **Extra** | E2, E3, E4, E5, 4.2, E9 | A mistake moves an episode's timing (transitions shorten the programme, so chapters, quotes, captions and the intro offset must follow), changes the saved edit's shape, or costs a long render to find |

## Order of work

1. **Prerequisite, Tom:** run one real episode end to end through Editor Light (spec 015 "Next"):
   render, translations, retakes, and the re-marked suggestions on the 49-minute episode. It is
   on `main`. It does not block 0.1, but 0.2, 1.6 and 4.2 need its numbers.
2. **019 Phase 0:** **0.1** checks on every PR (also fixes the lint errors), then **0.2** a
   quality report on every render.
3. **019 Phase 1:** 1.6's leftovers (done, #136), 1.3 as wider retakes (built, #138), 1.5 (done, #139), 1.1 (built, #141), 1.2 (built, #142).
4. **020 E1–E4:** workspace (moving the existing full-page editor into it; built, #143), timeline engine with
   waveform (built, #144), splits that transitions can attach to (built, #145), transitions (built, #147,
   after #146 made the render's timing frame-accurate). E5, layers and the media bin, built (#157).
5. **019 Phase 2** (built: 2.3, #149; 2.4, #151; 2.5, #152; 2.6, #153), **Phase 3** (3.1 the sound bake-off, built, #155; 3.2, all three clean-ups as choices, built, #164; 3.3, speaker tracks, built, #168), then **020 E6–E8** (E6, elements and the Properties panel, built, #159; E7, music and effects, built, #160; E8, the captions track and polish, built, #162).
6. **019 Phase 4** (4.1 the hand-off export, built, #165; 4.2 the faster render, built, #166; 4.3 the smoother preview, built, #167), then **Phase 5** (5.1 the audio podcast feed, built, #169; 5.3 waits on three real episodes).
7. **020 E9** (move clips): built, #170, after Tom's go-ahead.
8. **020 E10** (open with everything in place: fillers and pauses cut, the teasers, intro and outro on the timeline and
   in the preview, the render making exactly that): built, #174, at Tom's request.
9. **020 E11** (drag sections on the timeline, which shows them in play order): built, #176, at Tom's request.
10. **020 E12** (trim and reorder teasers on the Programme row): built, #178, at Tom's request.
11. **020 E13** (the timeline shows only what plays; a clip's end dragged out brings back what was cut, in cuts more): built, #180, at Tom's request.
12. **020 E14** (the whole video on the timeline: teasers, intro and outro as clips, the "In this episode" graphic on V3, teasers made from the episode; the Programme row gone): built, #182, at Tom's request. Next: picking a teaser's words on the notes page instead of ±1 s (Medium).

## Overlaps with work already built — decided

The plan was written before Parts D and I and the splits landed. Each overlap was checked
against the code on 5 October 2026.

| Plan item | Already built | Decision |
|---|---|---|
| 019 **1.3** Claude "Tighten" | **Retakes** (`lib/retakes.ts`, `podcast_notes.yml` `mode: retakes`, cut reason `retake`, $0.30 reserved): numbered lines, words to remove copied from one line, a `why` | **Merge into retakes.** No new job and no `tighten` reason. Widen the prompt to false starts, restarts, verbal tics ("you know", "I mean"), housekeeping ("can you hear me?") and tangents; add a `kind` to each item; **add the quote and teaser protection** (retakes have none today). Re-check the $0.30 estimate. Effort **S**. |
| 019 **1.4** accept or restore by kind | Suggestions are cuts already applied. The counts per kind filter the review; **Clear these** puts back every suggestion of one kind; **Clear suggestions** all of them; marking again replaces a kind, never stacks (`replaceSuggestions`) | **Done (#130).** "Restore all" is **Clear these**. "Accept all" has nothing to do, because a suggestion is already a cut. The time each kind saves moves to 1.6. |
| 019 **1.6** fewer suggestions | The gap guess is opt-in (**Mark hesitations**, reason `gap`, 0.5–1.2 s, not after `. ? ! , ; : —`, not before a filler) and labelled "hesitation 0.9s", never "um". The **2,970** count was measured before this; the default **Mark** now gives fillers, repeats and pauses only | **Partly done (#130).** Left: record `disfluencies` at ingest and hide **Mark hesitations** for those episodes; repeats only within a sentence and within 300 ms; the time saved per kind; measure the 49-minute episode and write the counts in spec 015. Effort **S**. |
| 020 **E1** workspace | The full-page editor (`/admin/podcast/[id]/edit`, #123) with the timeline, the preview with overlays, the On screen panel and the help sheet | **Change:** E1 moves this page into spec 020's layout and renames the route. Nothing is rebuilt. Effort **M → S–M**. |
| 020 **E3** split and trim, `parts` | **Splits** (`edit.splits`, ms in the original, up to 500, sorted and unique): **Split at the playhead** (S), **Cut this section**, **Bring this section back**; the render ignores them | **Change the model:** keep `splits: number[]` instead of a new `parts` array. While parts stay in source order (U4) they say the same thing, and splits are already saved. Joins (E4) are keyed by the split's ms. E9 adds `order` when moving is approved. Trim already works as cuts at a section's edge. Effort **M → S**. |
| 020 **E5/E6** layers, titles, lower thirds | **On screen** (`lib/onScreen.ts`, `edit.overlays`, up to 100): text with a second line, **Name titles** per speaker, PNG/JPEG images at nine positions with `widthPct`; anchored at `atMs` in the original, `seconds` long in the edited video; rendered with one ASS file and ffmpeg overlays; drawn in the preview | **Evolve `OverlaySchema`** into spec 020's `Layer`: add `box` beside the nine positions, transitions in and out, opacity, video, tracks. The anchor is already `{ srcMs }` in effect. A migration reads old overlays. E6's lower thirds start from Name titles. |
| 020 **U1** captions | **Burned-in captions** (Part I): `burnCaptions` setting, off by default, and `edit.captions` | **Keep as an on/off option** (Tom, N1). |
| 020 **E5** uploads | Image uploads to `overlays/` in Storage, checked by the edit route (`checkUploaded('overlay')`) | **Reuse** for the media bin; add video and audio kinds with the same checks. |
| 020 **E7** music and effects | **Part H** (`bc5b006` in Jo Ann's fork, not merged): `musicMix` (a looped bed, `sidechaincompress` keyed by the voice, `amix`), a music upload, and ElevenLabs composed music; Sora video b-roll | **Merge the useful part into E7:** `musicMix` and the upload path, credited to Jo Ann. **Sora and ElevenLabs are dropped** (Tom, N2). Keep spec 020's licence record and "not checked" gate. E7 effort stays **M**. |
| 019 **2.3** correct a misheard word | **Translations** translate the render's English captions (`episode.srt`) cue by cue | **Keep, with one rule:** translations made before a correction are stale. Record which captions file each translation came from, and show "Translate again" when it no longer matches. **Built (#149):** `translations.finalAt` already records the final cut; a correction reaches the captions only through a new render, which marks them stale. |
| 019 **0.2** quality report | The render draws on-screen text, images and (if turned on) captions | **Keep, and add a plan check:** every overlay starts and ends inside the programme and is not anchored in a cut; the ASS file has as many text events as the plan. No pixel checks. |
| 019 **0.1** checks | — | **Keep, corrected:** 9 lint errors in tracked files (also `scripts/make_admin.ts` and `types/user.ts`), not 7, plus `.firebase/`, deleted (N3). `npm test` must include `components/studio/*.test.ts`. The render tests call ffmpeg, so CI installs it. |

## What the development conversation learned

Written by the conversation that merged Jo Ann's fork (PRs #119–#130), before reading the plan, so
the plan could be checked against it.

### What exists now (all on `main` since #132)

- **Editor Light** (spec 015): full page at `/admin/podcast/[id]/edit` (`components/studio/editor.tsx`,
  `timeline.tsx`, `lib/timeline.ts`). Transcript first: click or drag words to cut, shift-click
  to extend, "✂ Cut selected", undo, speed buttons, help. The edit is `episodes/{id}.edit`
  (`lib/edit.ts`), checked by Zod schemas in the edit route:
  - `cuts` with a reason: `filler | pause | repeat | manual | retake | gap`;
  - `splits` (up to 500): split at the playhead (or S), and cut or bring back a whole section
    (`sectionAt`, `cutSection`, `restoreSection`);
  - `overlays` (on-screen text and images, `lib/onScreen.ts`) and `captions`;
  - suggestions: **Mark** replaces earlier suggestions of its kinds (`replaceSuggestions`);
    **Clear these** removes one kind; **Mark hesitations** is separate from pauses.
- **Render** (`agent/src/podcast/editRender.ts`, `podcast_edit_render.yml`): cuts, teasers, intro,
  outro, b-roll, voice cleanup, on-screen text and images, optional burned-in captions. Each
  render has its own folder; the folder the final cut points at is never deleted.
- **Around it:** Studio settings and uploads (spec 018), the guided flow (`Journey.tsx`,
  `steps.ts`), the home list (`lib/studioUi.ts`), redraft with direction, Shorts pick mode, social
  posts and follow-up email, transcript downloads (`lib/transcriptExport.ts`), translations
  (≤ 5 languages) and retakes.
- `podcast_notes.yml` takes an explicit `mode` (`notes | extras | translations | retakes`), with
  one concurrency group per mode.
- **Not merged:** Part H of the fork (Sora video b-roll and ElevenLabs music, `bc5b006`).

### Decisions and why

- **Explicit job modes**, never "guess from the episode's state": translations and retakes once
  ran the wrong job because the state looked like notes.
- **Every paid run reserves against the $10/day limit before it starts**, uploads ($0.75) and
  Shorts pick ($0.40, raised to cover long episodes) included. Part H was held back because
  Sora (up to ~$7.20 a run) and ElevenLabs reserved nothing.
- **Translations are capped at 5 languages:** each is a YouTube caption track (450 of the
  10,000 daily API units).
- **Redraft saves pending edits first** and stops if that fails, so it never works from a stale
  draft; the button shows its cost (~$0.50).
- **Settings live in `studio/settings`**. The fork's repo, project and bucket settings were
  removed: the jobs run in one repo and one bucket.
- **Uploads are checked after they land** (type, size, first bytes); a bad file is deleted.
- **Hesitations are opt-in**, because marking every 0.5 s gap cut natural speech. With
  `disfluencies` on (#126), new transcripts carry real "um"s, so hesitations matter mostly for
  older episodes.
- **Each render is versioned**, so a failed render never damages the last good one, and "Editor
  Light makes the final cut" can point at a folder safely.

### Gotchas a plan should respect

- **Jobs only run from `main`** (`lib/server/github.ts`, `ref: 'main'`). A new job or mode can't
  be tried from staging until it is promoted, so each job change should be promotable alone.
- **Playback must not re-render the transcript.** A 49-minute episode has ~8,000 word spans;
  driving them from React state on `timeupdate` made the page unusable. Anything that follows the
  playhead (preview overlays, timeline, captions, and every new track) subscribes through
  `components/studio/useVideoTime.ts` and redraws only itself.
- **The edit route checks every field.** A new field on `edit` needs its schema, a limit and a
  test, or every save fails with 400. New images go through `checkUploaded('overlay')`.
- **The render encodes the video twice:** each block, then the whole programme (teasers, intro,
  b-roll, overlays, captions, outro). Loudness copies the video. One encode and resuming (4.2)
  are the main speed gains, and E4's `xfade` joins must fit the block design.
- **Overlay times are mixed:** `atMs` is in the original recording, `seconds` in the edited
  video. Spec 020's anchors keep that split; don't "fix" it into one clock.
- **Shift-click** on a word must not start a drag (`onWordMouseDown` returns early with Shift).
- **Testing:** headless Chromium can't play H.264, so browser checks use WebM; `next dev` adds a
  block to `CLAUDE.md` that must not be committed; the whole test run takes about 5 minutes
  because the render tests run ffmpeg.
- **On the timeline, overlays are markers only:** they can't yet be dragged or trimmed there, only
  edited in the On screen panel (E5).
