# Spec 019: Editor Light v2 — the best of the open-source editors

**Date:** 5 October 2026
**Status:** Planned; reconciled on 5 October 2026 with the work already built (see
`docs/PLANNING.md`, "Overlaps"). Items 1.4 and parts of 1.6, E1, E3, E5 and E6 were built
before this plan, in Jo Ann H's Part I and the splits (#130).
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
   - The current plan is merged to `main`: Jo Ann H's Parts A–G and I. **Done** (#132; Part H
     is not merged, see `docs/PLANNING.md` N2).
   - masterytv/soulwisdomnetwork#126 is merged: AssemblyAI `disfluencies` is on, and
     `lib/fillers.ts` exists. **Done.**
   - Spec 015's "Run a real episode end to end and compare its sound with Descript's".
     **Tom's, not done yet.** It does not block 0.1; items 0.2, 1.6 and 4.2 need its numbers.
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
- **Model effort:** the table's "Model effort" column is the reasoning effort to build each item
  with (Tom's choice, 5 October 2026). **Before starting an item, tell Tom which effort to switch
  to**, and wait until he has. Medium is for small items with clear tests; High is the default;
  Extra is for work where a mistake moves an episode's timing or the saved edit's shape (the
  timeline, splits and transitions, layers, the faster render, moving clips).
- **Compact after each major build:** Tom builds in one conversation and compacts it after each
  phase or E item, so write what the next item needs into the specs, not only into chat.
- **Licences:**
  - Copy code only from MIT or public-domain sources: CutScript, Rescript's tree at `a9b378e^`,
    and auto-editor. Copy the source's licence into `docs/licences/` and name it in the file's
    header comment.
  - Items marked **idea only** come from Rescript's noncommercial code. Build them from this
    spec and the research document, **without opening Rescript's current code**.
- **Tests:**
  - Pure logic goes in `lib/` with a `*.test.ts` beside it.
  - Run the tests with `npm test` (item 0.1). It runs every `*.test.ts` in `lib/`,
    `agent/src/podcast/` and `components/studio/`. The render tests need ffmpeg.
- **Paid runs:**
  - Anything that calls Claude, OpenAI or Auphonic goes through `withinDailyLimit` in
    `lib/server/spending.ts`, with a new `ESTIMATE_USD` key.
  - Every API route calls `requireRole()`.
- **Jobs run from `main`.** Like every podcast job, a new or changed workflow only works from the
  Studio once it is on `main`.
- **Never break the Descript path.** `finalSource: 'descript'` (spec 018) must keep working
  until item 5.3 retires it.

## The plan at a glance

Effort: **S** = up to half a day, **M** = 1–2 days, **L** = 3–5 days. Model effort: see "Rules
for this work".

| # | Item | From | Effort | Model effort | Needs | Status |
|---|---|---|---|---|---|---|
| **0** | **Safety net** | | | | | |
| 0.1 | Checks on every pull request | ours | S | Medium | — | Done (#134) |
| 0.2 | Quality report on every render | ffmpeg | M | High | — | Built (#135); real numbers wait on a render from `main` |
| **1** | **Better cut suggestions** | | | | | |
| 1.1 | Pauses measured from the audio | auto-editor, ffmpeg | M | High | — | Built (#141); the count on the real episode waits on promotion |
| 1.2 | Speech the transcript missed | Rescript (idea only) | M | High | 1.1 | Built (#142); "most markers are real" waits on a real episode |
| 1.3 | Claude "Tighten": widen retakes | CutScript (MIT) | S | High | — | Built (#138); the share kept waits on a real episode |
| 1.4 | Accept or restore a whole kind of cut | Rescript (idea only) | S | — | — | Done (#130: Clear these) |
| 1.5 | Drop kept slivers with no words | Rescript (MIT) | S | Medium | — | Done (#139) |
| 1.6 | Fewer, better suggestions (2,970 on a 49-minute episode before #130) | ours | S | Medium | — | Done (#130, #136); the count on the real episode waits on Tom |
| **2** | **Editing precision** | | | | | |
| 2.1 | Waveform on the timeline | Rescript (MIT) | M | (E2) | — | Built in E2 (#144) |
| 2.2 | Drag cut edges; cut a stretch of time | Rescript (MIT) | M | (E2) | 2.1 | Built in E2 (#144) |
| 2.3 | Correct a misheard word | Rescript (MIT) | M | High | — | Built (#149); a corrected word in YouTube's captions waits on a render and upload from `main` |
| 2.4 | Names spelled right from the start | AssemblyAI | S | Medium | — | Built (#151); a test episode's spelling waits on an ingest run from `main` |
| 2.5 | Highlight words the transcriber was unsure of | ours | S | Medium | — | Built (#152); in the editor once a transcript is accepted again |
| 2.6 | Autosave that survives a closed tab | Rescript (MIT) | S | Medium | — | Built (#153) |
| **E** | **Studio editor: the full editing page (spec 020)** | | | | | |
| E1 | Workspace shell: script, preview, panels, timeline | Descript's layout | S–M | High | — | Built (#143; spec 020, "E1 — Built") |
| E2 | Timeline engine, waveform, thumbnails, drag cut edges | Rescript (MIT), ours | L | Extra | E1 | Built (#144; spec 020, "E2 — Built"); the waveform on a real episode waits on an ingest run from `main` |
| E3 | Split and trim (no moving yet, U4), on `edit.splits` | ours | S | Extra | E2 | Built (#145; spec 020, "E3 — Built") |
| E4 | Transitions: Cut, Dissolve, Fade, and more | ffmpeg `xfade` | M | Extra | E3 | Built (#147; spec 020, "E4 — Built"); a render with transitions waits on `main` |
| E5 | Media bin, uploads, image and video overlays | ours (no react-rnd or dnd-kit; see 020 "E5 — Built") | L | Extra | E3 | Built (#157; spec 020, "E5 — Built"); a render with layers waits on `main` |
| E6 | Titles, lower thirds, logo, text; Properties panel | ours (ASS, as Shorts) | M | High | E5 | Built (#159; spec 020, "E6 — Built"); a render with elements waits on `main` |
| E7 | Music and effects tracks, fades, ducking | ours (ffmpeg, Part H's mix), free libraries | M | High | E5 | Built (#160; spec 020, "E7 — Built"); a render with sounds waits on `main` |
| E8 | YouTube caption track on the timeline; polish | ours | M | High | E6 | Built (#162; spec 020, "E8 — Built"); the fix for a word at a transition reaches renders from `main` |
| E9 | Later: move clips, drop a new intro or outro | ours | L | Extra | E4, Tom's go-ahead | Built (#170; spec 020, "E9 — Built"): in a Parts panel; dragging on the timeline itself is not built |
| **3** | **Sound** | | | | | |
| 3.1 | Voice clean-up bake-off | DeepFilterNet, Auphonic | M | High | 0.2 | Built (#155); the choice waits on Tom and the producer listening (run it from `main`) |
| 3.2 | The winner as a Studio setting (Auphonic free tier only, D1) | DeepFilterNet or Auphonic | M | High | 3.1 | Built (#164): all three are choices, standard the default; 3.1's listening sets the default later |
| 3.3 | One track per speaker, optional (D5) | Auphonic or ffmpeg | L | High | 3.1 | Built (#168), the ffmpeg route; a Zoom recording with separate files waits on Tom |
| **4** | **Render and hand-off** | | | | | |
| 4.1 | "Open in Resolve, Premiere or Final Cut" | auto-editor | M | High | — | Built (#165); opening the files in Resolve waits on Tom (no editor app here) |
| 4.2 | Faster, resumable render | ours (spec 015 "Next") | L | Extra | 0.2 | Built (#166): 47% less time on a 12-minute test; the real episode's time waits on `main` |
| 4.3 | Smoother preview | ours | M | High | — | Built (#167) |
| **5** | **The rest of the pipeline** | | | | | |
| 5.1 | Audio podcast feed (yes, later, D2) | ours | L | High | — | Built (#169); submitting the feed to Apple and Spotify waits on Tom |
| 5.2 | Animated captions and graphics, if wanted | Revideo | M | — | — | Dropped for full episodes (D4); Shorts keep theirs |
| 5.3 | Retire Descript | — | S | Medium | 0.2, 3.2, three real episodes | Not started |

**Why this order:**
- Phase 0 makes every later change safe to ship.
- Phase 1 saves the most producer time per episode. 1.6's leftovers first, then 1.3 (wider
  retakes): both are small now that #130 built most of them.
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
- `"test": "tsx --test lib/*.test.ts agent/src/podcast/*.test.ts components/studio/*.test.ts"` in
  `package.json`. The render tests run ffmpeg, so the workflow installs it (as
  `podcast_edit_render.yml` does).
- Fix the 9 lint errors in tracked files (`app/login`, `app/members`, `app/messages`,
  `scripts/make_admin.ts`, `types/user.ts`) so lint can block. Lint also skips `.firebase/`, a
  Firebase Hosting build folder committed by mistake (its removal is `docs/PLANNING.md` N3).
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
| On screen | the render plan (`placeOverlays`) and the ASS file | An overlay starts or ends outside the programme, or is anchored in a cut; the ASS file has fewer text events than the plan |

**Results** go in `editRender.qc` (and `final.qc`) as numbers plus a `warnings[]`. The render
panel and the final-cut page show the warnings. Warnings never fail the job.

**Done when:** a render of the real episode shows its numbers, and a render with a deliberately
broken loudness pass shows a warning. `renderQc.test.ts` parses canned ffmpeg output.

**Built (#135):**
- `renderQc.ts`: one ffmpeg pass over the finished file (`ebur128`, `silencedetect` and
  `blackdetect` together, per-frame logging off) and one ffprobe for the stream lengths. Only the
  lines the parsers read are kept, so a long episode's log never fills memory.
- **Edit render:** `renderEdit` measures its own output (it knows the teasers, intro, outro and
  edited length, and the on-screen plan), returns `qc` in its report, and the job saves it as
  `editRender.qc`, and as `final.qc` when Editor Light makes the final cut.
- **Final cut from Descript:** `final.ts` measures the normalized file (no length to check
  against) and saves `final.qc`; its warnings are added to the "Final cut ready" email.
- `normalizeLoudness` (`media.ts`) also returns loudnorm's `normalization_type`.
- **Studio:** `components/studio/qualityReport.tsx` shows the numbers and the warnings under the
  render panel and the final cut.
- **On screen:** `onScreenChecks` (starts in a cut, after the end, runs past the end) and
  `assCheck` (texts missing from the subtitle file).
- **Tests:** `renderQc.test.ts` (canned output, the rules, a real 6 s file, an unreadable file)
  and a check in `editRender.test.ts` that a real render's length matches the plan.
- The jobs only run from `main`, so the real-episode numbers come after promotion.

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

**Built (#141):**
- `agent/src/podcast/silences.ts` (`measureSilences`): ffmpeg `silencedetect` at −35 dB for
  300 ms, read with renderQc's parser. The `ametadata` print in the command above is not needed:
  silencedetect's own log lines carry the times. `SilencesFile` and its schema are in `lib/edit.ts`.
  Measured here: 30 minutes of AAC in 6 s, every one of its 180 two-second silences found.
- **Ingest** measures them right after the audio is made, saves
  `episodes/{id}/analysis/silences.json` and sets `media.silencesPath`. It never fails the episode:
  without them the editor uses word gaps.
- **Backfill:** every ingest run (except a dry run) measures up to 20 episodes that have audio but
  no `silencesPath`. Running **Podcast Ingest** by hand once from the Actions tab, after promotion
  to `main`, fills in the older episodes. There is no separate workflow.
- **`suggestCuts(words, { silences })`:** a silence over 1.2 s becomes a pause cut that keeps
  0.25 s on each side (0.5 s in all). With silences, word gaps are not used for pauses at all, so
  a gap that is not silent is never suggested. With none (not measured, or none found on a noisy
  recording) the word gaps are used, as before. Hesitations (`gaps: true`) are unchanged.
- **Editor:** the edit route's GET returns `silences` (read on the server, so no signed URL or
  Storage CORS is needed), and both the notes page and `/edit` use it. The button's tooltip says
  whether pauses come from the audio.
- Tests: `lib/edit.test.ts` (both rules and the fallback), `agent/src/podcast/silences.test.ts`
  (ffmpeg on a tone, 2 s of silence, a tone).

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

**Built (#142):**
- `unspokenSpans(words, silences)` in `lib/edit.ts` (no `durationMs`: only stretches **between**
  words count, since before the first word and after the last there is nothing to compare with).
  A word still running from an overlapping speaker covers the gap.
- **Transcript:** each stretch shows as a small grey `…` chip in its gap; a click cuts it as a
  `filler`. A cut one shows as the existing "hesitation 0.4s" chip (now its cut length, not the
  whole gap), and double-click brings it back.
- **Suggestions:** with silences, **Mark filler words and long pauses** also offers a stretch as a
  `filler` when it is at most 1.5 s (`UNSPOKEN_SUGGEST_MAX_MS`; longer is more likely laughter,
  music or crosstalk), between two words of one speaker, after a word that ends no sentence or
  clause, and not beside a written-out filler. Every stretch still shows as `…`. These limits
  keep the count down, as 1.6 asked; check them against the real episode.
- With silences, the gap guess (`gaps: true`) is not used, and **Mark hesitations** is hidden.
  Episodes without silences keep both.
- Tests in `lib/edit.test.ts`.

### 1.3 Claude "Tighten": widen retakes (S, prompt ideas from CutScript, MIT)

**Why:** word lists cannot find "you know", "I mean", false starts ("I went — we drove there"),
restarts ("let me say that again") or housekeeping ("can you hear me?"). Descript's AI and
CutScript both do this, and it is where most editing time goes.

**Already built (#130): retakes.** `lib/retakes.ts`, run by `podcast_notes.yml` with
`mode: retakes` from the editor's **Find retakes with Claude** button, reserving
`ESTIMATE_USD.retakes` ($0.30). Claude gets the accepted transcript as numbered speaker lines and
returns `{ line, text, why }`; `timeRetakes` finds the words on that line. The producer adds what
was found as suggested cuts (reason `retake`) and reviews them like any other suggestion.
Nothing is applied without the producer.

**Build on it, not beside it** (no new job, no `tighten` reason):
- **Prompt:** widen `retakesSystemPrompt` from abandoned attempts to false starts, restarts,
  verbal tics, housekeeping and tangents. Start from CutScript's `detect_filler_words` prompt
  (quoted in the research document) and copy its licence to `docs/licences/`. Keep it
  conservative, and respect `extraInstructions` from Studio settings.
- **Schema:** add `kind: 'retake' | 'false-start' | 'restart' | 'verbal-tic' | 'housekeeping' |
  'tangent'` to each item. The editor shows the kind with the `why`. The cut reason stays
  `retake`, so saved edits and `CutsSchema` don't change.
- **Protect quotes and teasers** (missing today): drop any item that overlaps an approved quote
  or teaser clip (`notes`), and tell Claude which lines hold them.
- **Name:** the button becomes **Suggest a tighter edit**; the cut kind stays **Retakes** in the
  counts.
- **Cost:** re-check `ESTIMATE_USD.retakes` against the real cost in `usage_reports` on the
  49-minute episode; the longer answer may need $0.50.

**Done when:** on the real episode, the producer keeps most suggestions. Write the share kept in
spec 015.

**Built (#138):**
- `lib/retakes.ts`: the prompt names six kinds, each with what to remove, and keeps the
  conservative rule and CutScript's list of tics (`docs/licences/cutscript.md`). The Studio
  settings' extra instructions are appended (`producerInstructions`, also used by the notes).
- `kind` is required in Claude's answer and saved on each suggestion. Retakes found before this
  have none and read as **Retake**.
- **Protection:** `protectedSpans` takes the approved notes' key quotes and teaser clips (the
  draft's before approval); `protectedLines` lists the lines they touch for Claude, and
  `timeRetakes` drops anything still touching one, counted as `retakes.protectedCount`.
- **Editor:** **Suggest a tighter edit**, then **Add N suggestions to review**, with the count by
  kind ("3 retakes, 1 false start"). In the review row, a suggestion from Claude shows its kind and
  why ("False start: changed tack"). The cut reason stays `retake`, and the count stays **Retakes**.
- **Cost:** `ESTIMATE_USD.retakes` is now $0.50. A 49-minute transcript is about 12,000 tokens in
  ($0.05); the wider answer, with its thinking, can reach 15,000 to 20,000 tokens out ($0.30 to
  $0.40). The reservation is a ceiling; the job records the real cost. Lower it once the real
  episode shows it in `usage_reports`.
- Tests: `lib/retakes.test.ts`.

### 1.4 Accept or restore a whole kind of cut — Done (#130)

A suggestion is already a cut, so there is nothing to accept. **Clear these** (with a kind chosen
in the counts) puts back every suggestion of that kind, as one undo step; **Clear suggestions**
puts back all of them. Manual cuts are never touched. The time each kind saves moves to 1.6.

### 1.5 Drop kept slivers with no words (S)

**Why:** two cuts close together leave a few hundred milliseconds of breath between them. That
sounds choppy, and adds joins and render time.

**Build:**
- In `keepRanges`, a kept piece shorter than 400 ms that contains **no whole word** is dropped.
- Today only pieces under 150 ms are dropped.
- Rescript merges cuts closer than 0.35 s. Ours is safer because it checks for words.

**Tests:** in `lib/edit.test.ts`.

**Done (#139):** `keepRanges(durationMs, cuts, padMs, words)` drops a kept piece under `SLIVER_MS`
(400 ms) unless a whole word lies inside it; a word only partly inside does not count. The editor
and the render both pass the transcript's words, so the preview plays what the render makes. A
render without words (the command line) keeps the old 150 ms rule only.

### 1.6 Fewer, better suggestions (S) — partly done (#130)

**Why:** on a real 48:53 episode, **Mark filler words and long pauses** once offered 2,970
suggestions: 2,250 "fillers", 300 repeats and 420 pauses. Most "fillers" were gap guesses
labelled "um". Nobody reviews that many one at a time.

**Done in #130:**
- The gap guess is no longer part of **Mark**. It is **Mark hesitations**, reason `gap`, labelled
  "hesitation 0.9s": gaps of 0.5–1.2 s, not after `. ? ! , ; : —`, and not before a filler.
- Marking again replaces that kind's suggestions instead of adding them twice.
- Each kind's count filters the review, and **Clear these** removes one kind (1.4).

**Done in #136:**
- **Ingest records** `transcription.disfluencies` (AssemblyAI echoes the option). The editor
  decides from the words themselves (`hasFillers` in `lib/fillers.ts`: any "um" or "uh" written
  out), so older episodes need no backfill: **Mark hesitations** shows only when the transcript
  has none. 1.2 later finds the ones AssemblyAI missed, from the audio.
- **Repeats:** only a stammer: the same speaker, inside one sentence (the first word ends no
  `. ? !`), and the second word within 300 ms of the first (`REPEAT_GAP_MS`).
- **Time saved per kind** beside each count (`savedByReason`: a kind's cuts with overlaps counted
  once).

**Left:**
- **Hesitations on older episodes:** never in a gap that 1.1 measures as silent; part of 1.1.
- **Measure (Tom):** on the 49-minute episode, **Clear suggestions** then **Mark**, and write the
  counts per kind in spec 015. Check which repeats were real stammers before settling 300 ms.
  Aim for under 300 suggestions an hour that the producer mostly keeps.

## Phase 2 — Editing precision

### 2.1 Waveform on the timeline (M, drawing idea from Rescript's MIT tree)

**Built as part of spec 020 item E2 (#144)**; what was built, and how it differs from the plan below
(µ-law bytes, peaks served through the server), is in spec 020's "E2 — Built".

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

**Built as part of spec 020 item E2 (#144)**; see spec 020's "E2 — Built".

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

**Translations** (#130) translate the render's English captions. A translation made before a
correction is stale: record which captions file each translation came from, and show
**Translate again** when it no longer matches.

**Done when:** a corrected word shows in the editor, in the Editor Light `.srt` and in the
YouTube captions of a test upload.

**Built (#149):**
- **Store:** `corrections.words` (`types/episode.ts`), as planned, keyed `"utterance:word"` like the
  line ids, because speaker review's splits are per utterance. A fix never spans two utterances.
- **`lib/wordFixes.ts`** holds the pure parts, with tests: the timing (`timeWords`, Rescript's
  `correctWords`, credited in its header and `docs/licences/rescript.md`), applying fixes to an
  utterance, ops that set or put back a fix (`applyOps`, which also returns the ops that undo it),
  find and replace, and the server's checks (a fix replaces 1–20 words heard with 1–20 words, up to
  200 characters; at most 5,000 on an episode).
- **`buildLines`** applies them. Each word now carries `ref`, the word heard it stands for; a
  corrected one also has `heard` and `count`. Speaker review's splits still fall on words heard; a
  split inside a correction falls after it. `reviewed.json` keeps `ref`, `heard` and `count`, so the
  editor knows what each word was.
- **Speaker review:** **Correct words** on each line. Click a word to retype it; shift-click another
  to take in the words between, to merge them. A corrected word is underlined in dotted blue, with
  what was heard in its tooltip and **Put it back**. **Find and replace** sits above the lines: one
  correction per place, ignoring case and the punctuation around each word, keeping the punctuation
  around the match ("Kenzie," → "McKenzie,"), with one **Undo replace**. They are saved like every
  other fix, and reach the official transcript on **Accept**.
- **The editor (Editor Light and the Studio editor):** double-click a kept word to retype it (Enter
  saves, Esc cancels, **Put back** when corrected); **Replace** beside the search box opens find and
  replace. They save through `POST /api/studio/episodes/[id]/words` (`fixWords` in
  `lib/server/review.ts`). It adds the fix to the corrections and publishes the accepted transcript
  straight away (`reviewed.json`, `.txt` and the Google Doc), so the notes, the editor and the next
  render see it. It refuses while speaker review has saved changes not accepted yet, which it would
  publish too. A transcript accepted before this has no refs: the editor says to accept it again in
  speaker review.
- **The render:** the Editor Light `.srt` and the YouTube captions come from `reviewed.json`, so they
  take the correction at the next render. The render records which accepted transcript it used
  (`editRender.transcriptVersion`), and shows as out of date once a word is corrected after it.
- **Translations** (the rule in PLANNING): they already record the final cut they came from
  (`translations.finalAt`), and a new render is a new final cut, so a correction reaches them as
  **"The final cut changed since these were made; translate again"**. Nothing new was needed.
- **Fixed on the way:** selecting a word in the editor showed **✂ Cut selected**, which moved the
  transcript down, so the second click of a double-click landed elsewhere. The button is now always
  there, greyed out until words are selected.

**Limits:**
- **The Descript path:** its captions come from transcribing Descript's cut (`final.ts`), so a
  correction made here must also be made in Descript.
- **No re-alignment** against the audio: the new words share the old span by their length.

### 2.4 Names spelled right from the start (S)

**Build:**
- In `submitTranscription` (`agent/src/podcast/transcribe.ts`), send AssemblyAI
  `keyterms_prompt`. The SDK has it; check the speech models we use accept it, and how many terms.
- The terms come from Studio settings: the show name, the hosts, and a new **recurring names**
  list (guests, places, terms such as "near-death experience").
- Keep `speaker_identification` as is.

**Done when:** a test episode spells the show name and the hosts right without corrections.

**Built (#151):**
- **What AssemblyAI takes** (its docs, 6 October 2026): `keyterms_prompt` works with the Universal
  models we use. Universal-3 takes up to 1,000 words or phrases; **universal-2, our fallback, takes
  200**, and ignores terms under 5 or over 50 characters. A term is at most 6 words. It costs **$0.05
  an hour more** on pre-recorded audio. AssemblyAI warns that long lists of common words cause
  overcorrection, so the list is for words it gets wrong.
- **Studio settings:** a **Names and terms to spell right** list (`recurringNames`, up to 150, each up
  to 50 characters) under Speakers. Empty by default.
- **`transcriptionKeyterms`** (`lib/studioSettings.ts`, with tests): the show's name, the hosts and the
  list, once each (ignoring case), dropping terms over 6 words or 50 characters, at most 200.
- **Ingest** sends them as `keyterms_prompt` (`submitTranscription`), records them on the episode
  (`transcription.keyterms`), and adds $0.05 an hour to its cost estimate when there are any. The
  uploaded-recording reserve in `lib/server/spending.ts` is now $0.90 (3 hours at $0.30).
  `speaker_identification` is unchanged.
- **Not sent** to the final cut's transcript (`transcribeWords` in `final.ts`): that one only lines
  the cut up with the original.

### 2.5 Highlight words the transcriber was unsure of (S)

**Build:**
- Carry each word's `confidence` (in `raw.json`, dropped by `ReviewWord` in `lib/transcript.ts`)
  through to the editor and speaker review.
- Underline words under 0.6 in a dotted amber line, so the producer checks names and numbers
  first.
- Neither Rescript nor CutScript does this.

**Built (#152):**
- **Carried through:** speaker review reads each word's `confidence` from `raw.json` (rounded to two
  places), `buildLines` keeps it, and the accepted transcript (`reviewed.json`) and the editor's words
  have it. A corrected word (item 2.3) has none: a person typed it.
- **`isUnsure`** (`lib/wordFixes.ts`): under `UNSURE_BELOW` (0.6), with tests.
- **Speaker review:** unsure words are underlined in dotted amber (corrected ones stay dotted blue),
  with "The transcriber was unsure of this word (41% sure)" as the tooltip. The bar above the lines
  counts them (**N unsure words**) and **Next unsure** jumps line by line.
- **The editor:** the same underline on kept words, except the one playing; the tooltip says to
  double-click to correct it.
- **Older episodes:** speaker review shows them straight away (it reads `raw.json`); the editor once the
  transcript is accepted again, since `reviewed.json` written before this has no confidence.

### 2.6 Autosave that survives a closed tab (S, idea from Rescript's MIT tree)

**Build:**
- Keep the last unsaved edit in `localStorage`, keyed by episode and version, and flush when the
  tab is hidden.
- On load, offer to restore a local draft that is newer than the saved edit.
- The server's version check (409) still decides; a stale draft is never written over a newer
  save.

**Built (#153):**
- **`useAutosave`** takes an optional browser key. With it:
  - each change is also kept in `localStorage` with the saved version it was made on
    (`lib/localDraft.ts`, every call wrapped, so a full or blocked store changes nothing);
  - the copy goes once the server has the change;
  - hiding the tab (switching away, closing it, a phone locking) or leaving the page saves at once,
    instead of after 800 ms.
- **The editor** (Editor Light and the Studio editor) uses it, keyed `swc-studio-edit:<episode>`.
  On load, `draftToOffer` (with tests) decides:
  - a copy made on the version still saved: **"This browser has changes to this edit that were not
    saved (time). Restore them / Discard"**. Restoring saves it against that version as usual;
  - a copy a newer save overtook (another tab or person): dropped, with a note saying so. It is
    never written over the newer save.
- Show notes and Shorts keep their autosave as it was; they can pass a key the same way.
- The copy is per browser, so it comes back only where it was made.

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

**Built (#155):** the **Podcast Clean-up Comparison** workflow (`podcast_cleanup_compare.yml`, run by hand
from the Actions tab once it is on `main`) runs `agent/src/podcast/cleanupCompare.ts`, with its parts in
`cleanupVersions.ts` (tests in `cleanupVersions.test.ts`).
- **Inputs:** the episode ID; where the stretch starts (empty: a third of the way in, past the
  introductions); 1–15 minutes (10 by default); which versions (empty: all).
- **The stretch** is cut from the original recording in Cloud Storage (`media.sourcePath`), read over a
  signed link without downloading it all, as 48 kHz stereo. Ingest's `audio.m4a` is mono at 96 kb/s, too
  poor to judge by.
- **Five versions**, each brought to −14 LUFS with the render's two-pass `normalizeLoudness`:
  1. **as recorded**, loudness only, for reference (not in the plan; it shows what each clean-up adds);
  2. **today's chain**, exactly the render's (`cleanupFilter('light')`, now exported from `editRender.ts`);
  3. **DeepFilterNet** in that chain instead of `afftdn`. Its LADSPA plugin v0.5.6 is downloaded by the
     workflow and checked against its SHA-256. The voice is mixed to mono first and spread back after,
     which halves the time; here a minute took 33 s on one core, so 10 minutes take about 5–6;
  4. **Auphonic**, with `denoise`, `leveler`, `normloudness` and `loudnesstarget: -14` (and `hipfilter`
     when listed). The names are checked against `GET /api/info/algorithms.json` at the start of each
     run, since auphonic.com was blocked from the sandbox; a missing one fails that version with what
     Auphonic offers instead. It needs a new **`AUPHONIC_API_KEY` repo secret**; without it the version
     is skipped and the rest are made. 10 minutes use 10 of the free 2 hours a month (D1);
  5. **Descript's Studio Sound:** the same stretch of the Descript final cut, found through the words
     (`timeMap`, as `final.ts` re-times chapters), so it is shorter wherever the edit cut something.
     Skipped when the final cut is the Studio's own render or the words match under 50%.
- **Heard blind:** the files are named A–E in an order shuffled per run; the key is in its own file
  ("Which is which.txt", attached to the email and beside the files), with each version's clean-up
  time and cost, since those would give it away. The email and the run summary list letters with
  loudness and true peak only; the run log names versions but never their letters.
- **Where:** Cloud Storage (`episodes/{id}/cleanup-compare/{run}/`) with 7-day links in the email, and,
  when the Studio uses Drive, a **"Clean-up comparison"** folder beside "04 Final". Nothing on the episode
  changes.
- **For 3.2:** DeepFilterNet's delay against the picture was not measured here (the comparison is audio
  only); measure it before putting it in the render.

### 3.2 The winner as a Studio setting (M)

**Build:**
- `voiceCleanup: 'standard' | 'deepfilter' | 'auphonic'` in `lib/studioSettings.ts` (spec 018's
  table), used by `editRenderJob.ts`. Today the job never passes a clean option.
- **DeepFilterNet:**
  - It runs on one core: about 25 minutes per hour of audio. Split the audio into four pieces
    with 1 s overlaps, clean them in parallel, and join them with crossfades, or accept the
    time.
  - It stays inside the 350-minute job limit either way.
- **Auphonic, free plan only** (decision D1: we are leaving Descript to cut costs):
  - `AUPHONIC_API_KEY` becomes a repo secret.
  - The free plan gives 2 hours of audio a month, about two episodes. Count the hours used this
    calendar month (in `studio/spending`), show what is left beside the choice, and refuse an
    Auphonic render that would go over; the producer then picks DeepFilterNet or standard.
    Never buy credits or a plan from the code.
  - So DeepFilterNet or standard stays the everyday default; Auphonic is a per-episode choice
    while hours remain.
  - Use detect-only cutting as today, so our cut list stays the record.

**Built (#164):** Tom chose to build all three before the comparison is heard, with today's chain as the default;
the comparison's answer only decides which one the Studio settings choose.
- **The choice** (`lib/voice.ts`): `voiceCleanup: 'standard' | 'deepfilter' | 'auphonic'` in the Studio settings
  (default `standard`; "Voice clean-up in the render" on the settings page), and `edit.voice` for one episode
  (null: the Studio's), chosen in the Studio editor's Render panel (`components/studio/voice.tsx`). The job
  (`editRenderJob.ts`) passes it to the renderer and keeps it on the render (`editRender.voice`); the panel says
  when the current render used another one.
- **Standard** is today's chain, with one fix found while measuring: `afftdn` hands its sound on 25 ms late (at
  44.1 and 48 kHz, whatever its settings), so every render so far had the voice 25 ms behind the picture. The
  chain now drops afftdn's first 25 ms and pads the end (`AFFTDN_DELAY_SEC`); measured within 0.3 ms.
- **DeepFilterNet** (`agent/src/podcast/voiceCleanup.ts`) runs as its **command-line program**
  (`deep-filter` v0.5.6, downloaded and checked against its SHA-256 by `podcast_edit_render.yml` and now also
  `podcast_cleanup_compare.yml`), not the LADSPA plugin 3.1 used. Measured before building it in:
  - the **plugin** works as if live, and slips silence in whenever it falls behind ("Underrun detected"), so the
    voice drifted later than the picture: 20–30 ms at the start, 80–100 ms after 48 s, different on each run.
    Unusable for a render. (The comparison's DeepFilterNet version could also have had those gaps; it now uses
    the program too, so what is heard is what renders.)
  - the **program with `-D`** keeps the voice where it was (0 samples at 48 kHz) and gives the same file every
    run; it leaves the last 30 ms off, which is padded back.
  - Before it: `highpass=f=80`, as one channel at 48 kHz. After it: today's compressor, and both channels again.
  - **Speed:** 0.4× the audio's length on one core, so the recording is cut into up to four pieces (one per
    core, none under a minute) that overlap by 1 s and are joined with crossfades. 4 minutes took 30 s here, so
    an hour should take about 8 minutes on the runner. No shift at the joins, and no change in level (tests,
    with a stand-in program, since CI does not download it).
- **Auphonic** (free plan only, D1):
  - It is sent **only the stretch the edit keeps** (`auphonicSpan`: the first to the last moment played,
    transitions included, with 2 s either side), as 48 kHz stereo FLAC, with the same algorithms as the
    comparison (denoise, leveller, −14 LUFS, high-pass), and put back at its place in a track of the
    recording's length. No cutting algorithms, so our cut list stays the record. The upload is read from disk
    as it goes (`fs.openAsBlob`).
  - **The month's hours** are counted in `studio/spending` (`auphonic`: one hold per render, plus what each
    comparison sent). Starting a render with Auphonic holds its stretch's length first and is refused (429)
    when this calendar month's holds and it would pass 2 hours; the Render panel shows what is left and what
    the edit needs before Render is pressed. A render that fails before sending anything gives its hold back
    (`editRenderRun.ts`); one stopped by cancelling keeps it, to be safe.
  - **The account's own count:** before sending, the job reads `credits` from `GET /api/user.json` and stops
    with a clear message when the account has less than the stretch. That field name is from Auphonic's docs
    and was not checked live (auphonic.com is blocked from the sandbox); if it is missing, the job only logs it
    and relies on the Studio's count.
  - Never buys credits or a plan. Needs the `AUPHONIC_API_KEY` repo secret (added by Tom).
  - The older `auphonic.ts` stays only for `--detect auphonic` on the command line; `--clean auphonic` now uses
    the above.
- **First real render with each:** check the quality report's sync and listen at a few cuts; for Auphonic,
  also that its file came back the same length as the stretch (a shift there would move the voice).

### 3.3 One track per speaker (L, optional)

**An option, never a requirement** (decision D5). Zoom's "record a separate audio file for each
participant" may or may not be ticked on a given recording, so:
- an episode **without** separate files works exactly as today, from the mixed track;
- an episode **with** them uses them. The upload (spec 018) gets an optional "speaker tracks"
  field, and the Drive inbox picks up the files Zoom puts beside the video;
- the editor and render say which one the episode used.

**If the files exist:**
- ingest them beside the mix;
- clean and level each track;
- gate crosstalk;
- mix them for the render.

Auphonic multitrack does all of this in one call. The ffmpeg route (`agate` and `dynaudnorm` per
track, then `amix`) is free but harder to tune. Choose after 3.1.

**Bonus:** speaker detection becomes almost free of errors, because each track is one person.

**Built (#168), the ffmpeg route** (free; Auphonic's multitrack would spend the free plan's 2 hours on every
episode, D1). Tom said to go with my suggestion rather than wait for 3.1's listening.
- **Where tracks come from** (`lib/speakerTracks.ts`, kept as `media.speakerTracks`, at most 8):
  - **The Studio editor's Render panel** (`components/studio/speakerTracks.tsx`): "Add speaker tracks" uploads the
    files (kind `track`, MP3, M4A or WAV under 2 GB, checked like other uploads) to
    `episodes/{id}/source/tracks/`, through `/api/studio/episodes/[id]/tracks` (add, rename, remove; `requireRole`).
    This works for any episode, Drive or upload, so the upload page needs no extra field.
  - **The Drive inbox:** a folder in "01 To Process" with exactly one video is one episode (Zoom's local recording
    folder). Its tracks are the audio files in its subfolders (Zoom's "Audio Record"), or two or more audio files
    beside the video when there are none (one alone is the mix). Ingest copies them beside the original, names them
    from the file name ("audioTomWood1…" → "Tom Wood"), and moves the whole folder to "02 Processed". Loose video
    files work as before; a folder with no video or several is left with a warning.
- **The render** (`voiceCleanup.ts` `speakerMix`): each track is lined up with the recording (the shift at which
  their loudness every 10 ms over the first 10 minutes matches best, within ±10 s, preferring the smallest shift),
  then high-passed, gated (`agate`, so the room and others' voices leaking in drop away between the person's words)
  and levelled (`dynaudnorm`), and the tracks are summed. That mix then goes through the chosen voice clean-up
  (standard, DeepFilterNet or Auphonic, 3.2) in place of the recording's own sound.
- **Optional, per episode:** "Make the voice from these tracks" (`edit.speakerTracks`, on when there are tracks);
  the render records how many it used (`editRender.tracks`) and the panel says which the current render used.
- **Checked:** two synthetic speakers taking turns, one track 300 ms late and one 200 ms early, are lined up within
  10 ms and the mix keeps step with the recording; a real render with two tracks keeps in step (0.4 ms) with a clean
  quality report. Not checked: a real Zoom recording with separate files, and the speaker detection bonus (the
  transcript still comes from the mix).

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

**Built (#165):** every Editor Light render now also saves files that open its cuts in another editor
(`agent/src/podcast/editExport.ts`, tests in `editExport.test.ts`), linked from the Render panel
(`components/studio/editFiles.tsx`) and put in Drive in a "<title> (for other editors)" folder inside "04 Final".
- **The timeline:** the saved edit's play order (`lib/sequence.ts`), back to back, written as auto-editor's v3
  JSON and exported by the pinned 31.7.2 binary (`podcast_edit_render.yml` downloads it and checks its SHA-256;
  Unlicense, `docs/licences/auto-editor.md`) as **FCP7 XML for DaVinci Resolve** (`resolve-fcp7`), **FCP7 XML
  for Premiere Pro** (`premiere`) and **FCPXML 1.10 for Final Cut Pro** (`final-cut-pro:version=10`).
- **Frames, not milliseconds** (a change from the plan above): with `-tb 1000` auto-editor writes a 1000 fps
  timeline (`frameDuration="1/1000s"`), which no editor app opens. So the timeline is in whole frames of the
  recording's own rate (the nearest standard one to ffprobe's `r_frame_rate`, e.g. `30000/1001`): each stretch
  from the frame nearest its start to the frame nearest its end, as the render rounds.
- **What is in it:** straight cuts only. Transitions become cuts, and the teasers, intro, outro, b-roll, layers,
  sounds and burned-in captions are left out; the panel says so. A **captions .srt on the exported timeline**
  goes with it (the render's own .srt is on the render's times, teasers and intro included).
- **Paths:** each file names only the recording, by its original file name (`drive.fileName`); the producer
  points the editor at their copy when it asks.
- **Variable frame rate:** when ffprobe's average rate is more than 0.5% from the nominal one, a
  **constant-frame-rate copy** of the recording is made (`-fps_mode cfr`, x264 veryfast, CRF 20) and saved beside
  the files, which name it instead; the render's warnings say to relink to it. On a long episode that copy
  adds an encode of the whole recording to the render.
- **Never fails the render:** if the files cannot be made, the render is kept with a warning.
- **Checked:** the real binary on a 29.97 fps and a variable-rate test file (in and out points in frames, paths,
  the copy's rate); the tests use a stand-in for it, since CI does not download it. **Not checked: opening
  them in Resolve, Premiere or Final Cut**, which needs Tom: render an episode on `main`, open the Resolve file
  in DaVinci Resolve, relink, and check a few cuts against the render.

### 4.2 Faster, resumable render (L, spec 015 "Next")

**Build:**
- **One encode:** cut, assemble, add b-roll and normalize in a single filter graph per block,
  instead of encoding the blocks and then the whole programme again.
- **Resume:** each finished block is saved under the run's folder in Storage. A retried run skips
  blocks that are already there.
- **Parallel:** encode two blocks at a time on the runner's 4 cores.
- **Measure:** time per hour of episode, before and after. 0.2 must stay clean on both.

**Built (#166):** `agent/src/podcast/renderWindows.ts` (plan, tests in `renderWindows.test.ts`) and
`editRender.ts`.
- **One encode, in windows of the finished video** rather than blocks of the episode. Each window is cut at a
  straight cut (never inside a transition between parts, or between the episode and the intro or outro, and
  never in the first or last second or fade), up to 15 minutes or 20 kept ranges, since each range is a seeked
  input of its own. It is built with everything that shows in it: a piece or part on either side of a
  transition in the window is taken whole on that side, so the transition is drawn as in the whole programme,
  then the window is cut to its frames. The b-roll, layers, captions and text go over the episode in its own
  time, as before.
- **The sound is made once**, without the picture: the kept ranges read straight from the cleaned voice as
  PCM (1,600 samples a frame), the 15 ms fades and the transitions' crossfades done in code
  (`PcmAssembler`), then one ffmpeg pass for music, effects and ducking, the sections, the edge fades and
  the two-pass loudness. The plan's "normalize in each block's graph" would have measured loudness per block;
  measuring the whole programme's sound once keeps one gain for the episode, as before.
- **Exact:** every window's frames are counted after encoding and must match the plan. That check found an
  old bug: after an overlay (b-roll, captions), the `fps` before a transition dropped the stream's last frame,
  so the old render came out a frame short. The episode is now held a frame and cut to its length.
- **Resume:** each finished window goes to `episodes/{id}/editRender/work/{GitHub run}/`, named by a hash of
  what made it; GitHub's "Re-run" keeps the run's ID, so a re-run downloads the windows it finds and makes the
  rest. A DeepFilterNet or Auphonic clean-up is kept there too (FLAC), so a retry does not spend the minutes or
  the Auphonic hours again. The work folder is removed when a render is saved.
- **Parallel:** two windows at a time.
- **Measured** on a 12-minute 1080p episode with 50 cuts, a dissolve at a split, two teasers, intro and outro
  with transitions and edge fades, two b-roll stills, captions, a lower third and a ducked music bed, on a
  4-core machine like the runner: **1,417 s before, 756 s after (47% less; 2.2× and 1.2× the video's
  length)**. The quality report was clean on both (−13.9 LUFS, linear, no warnings); the new one is the
  planned 644.500 s exactly, the old one 644.47 s (the lost frame). The two videos match frame for frame
  (same frame numbers at 3 s to 640 s) and their sound is in step (0 ms). A real hour-long episode's time
  waits on a render from `main`.

### 4.3 Smoother preview (M)

**The Studio editor's preview (spec 020) uses this for its episode track.**

**Why:** both repos and ours preview by seeking past cuts on one `<video>`, which can stutter at
a cut.

**Build:**
- A second hidden `<video>` on the same proxy, seeked ahead to the start of the next kept range.
- At the cut, swap which element is visible and playing.
- A 15 ms volume ramp on each side, through Web Audio, to match the render's join fades.
- Fall back to seeking when the next cut is under 1 s away.

**Built (#167):** `components/studio/cutBridge.tsx` (tests in `cutBridge.test.ts`), in the Studio editor.
- **A second video** on the same proxy waits, seeked to the start of the next kept stretch, from three seconds
  before each cut. At the cut (40 ms before it) it plays on top while the main video jumps 300 ms ahead and
  waits there at the slowest rate browsers allow (1/16). When the second video reaches it, the main video plays
  on at its own speed and the second one hides.
- **The main video stays the one everything follows** (the timeline, the script, layers, captions, J/K/L), so
  nothing else changed; the plan's "swap which element is visible and playing" would have moved all of those
  to whichever video was playing.
- **Not pausing:** the main video waits at 1/16 speed rather than pausing, which would flash the Play button.
- **The sound:** a 15 ms ramp on each video's volume at each hand-over. Not Web Audio, as planned: the Storage
  bucket's CORS refuses the browser, and a video Web Audio cannot read plays silent (the same reason the
  waveform's peaks come through the server).
- **Left as before:** a next stretch under a second (the second video could not be ready again), a cut where a
  transition plays (TransitionPreview), Original, Hear it and reverse play.
- **Measured** in Chromium on the editor with a 3-minute test video, playing through a cut and sampling every
  frame: with the video served slowly (each request held 400 ms, as a far Storage link can be), the picture
  froze for 82–92 ms at the cut without it and for 17 ms (one frame) with it. Served locally, both were
  50–72 ms (the seek was fast already).

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

**Built (#169)**, on our own site (the first way above):
- **The MP3** (`agent/src/podcast/podcastAudio.ts`, run by **Podcast Audio**, `podcast_audio.yml`, from the show notes
  page's new "Podcast feed" part once there is a final cut): the final cut's sound at **−16 LUFS** (two loudnorm
  passes, one linear gain), MP3 128 kb/s 44.1 kHz stereo, the final cut's chapters as **ID3 CHAP** frames, and the
  feed's artwork (else the Studio's logo, else the site's) fitted into a **1400×1400** cover on the brand's
  background. Saved to `episodes/{id}/podcast/episode.mp3`; `episode.podcast` records it (`types/episode.ts`).
  Making it again replaces it and keeps it in the feed; the panel says when the final cut changed since.
- **In the feed or not:** a checkbox on the same part (`/api/studio/episodes/[id]/podcast`, `requireRole`); its date
  in the feed is when it first went in.
- **The feed** (`lib/podcastFeed.ts`): RSS 2.0 with Apple's `itunes:` tags at **`/podcast/feed.xml`**, newest first,
  each episode with the approved YouTube title and description (chapters, links and credits included), the MP3 as
  its enclosure (size and duration) and the episode ID as its GUID. The show is the Studio settings' name, about,
  hosts and the new **Podcast feed** section: on or off (off by default; the feed is then a 404), artwork (square,
  1400–3000 px), Apple category (Religion & Spirituality by default), explicit, and an optional owner email.
- **Public routes, by design:** podcast apps read without signing in, so `/podcast/feed.xml`,
  `/podcast/audio/{id}.mp3` and `/podcast/art.jpg` are site routes (not under `/api`) with no `requireRole`. They show
  only episodes put in the feed, and nothing while it is off. The MP3s and artwork stay in the private bucket
  (`storage.rules` closed): the audio and art routes send the app on to a signed link (6 hours) each time, which
  podcast apps follow. Links in the feed use the address the request came in on, so staging's feed points at staging.
- **Checked:** the MP3 at −16 LUFS (±1) with both chapters and a 1400×1400 attached cover; the feed's escaping,
  order, enclosure, duration, dates and owner. Not checked: Apple's and Spotify's validators, which need the feed on
  the live site (Tom: turn it on in the settings, put an episode in, then submit the feed's address in Apple Podcasts
  Connect and Spotify for Creators).

### 5.2 Animated captions and graphics — dropped for full episodes (D4)

**Not for full episodes now** (decision D4). Shorts already have animated captions
(`shortsRender.ts`) and keep them. If this comes back: Animated word-by-word captions, audiograms for audio-only clips, or speaker
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

## Decisions (answered by Tom, 5 October 2026)

| # | Question | Answer |
|---|---|---|
| D1 | Is a paid Auphonic plan acceptable if it wins the bake-off? | **No. Free plan only, 2 hours a month**: we are leaving Descript to reduce costs. See 3.2. |
| D2 | Do we want an audio podcast feed (Apple, Spotify)? | **Yes, later** (5.1), on our own site. |
| D3 | Are the retirement criteria in 5.3 right, and who signs off each episode? | **Keep them**; Tom signs off. |
| D4 | Do we want animated captions or graphics? | **Not for full episodes now.** Shorts already have animated captions. 5.2 is dropped. |
| D5 | Will recordings have one audio track per speaker? | **Make it an option**, so episodes without separate files still work. See 3.3. |
| D6 | Is the phase order right? | **Keep it.** |

The Studio editor's decisions (U1–U5) are in spec 020, answered on 5 October 2026.

## How this fits spec 005's stages

- **Item 0.1** is foundation work. It can be done with Stage 0 or any time before Phase 1.
- **Item 3.3** waits on Stage 0's Zoom recording checks.
- **Phases 1–4** improve Checkpoint C (the edit) and steps 10–11 (final cut and re-timing).
  They change no other checkpoint.
- **Item 5.1** extends step 13 (publish) beyond YouTube. **Item 5.2** extends step 14 (Shorts).
