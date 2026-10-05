# Planning: Editor Light, the Studio editor, and the rest of the pipeline

**Written:** 5 October 2026, in the planning conversation, for the development conversation
("Podcast pipeline Stage 0 setup").
**Base:** `staging` at `2f50966` (Parts A–D, G and I from Jo Ann H's fork, splits, hesitations),
plus masterytv/soulwisdomnetwork#126, which brought these documents.

This is the entry point. The detail is in the documents below; this page says what was decided,
in what order to build, and **where the plan overlaps work already on `staging`**. Reconcile those
overlaps before building.

## The documents

| Document | What it is |
|---|---|
| `docs/research/2026-10-05-open-source-editors.md` | What Rescript, CutScript, auto-editor, DeepFilterNet, Auphonic, Remotion, Revideo and others offer, their licences, and what was measured on a runner-like machine |
| `docs/research/2026-10-05-free-music-and-effects.md` | Free and royalty-free music and effects sources, with terms to check by hand |
| `docs/specs/019-editor-light-v2.md` | **The plan and its status table**: Phases 0–5 and E. Start at its "Before you start" |
| `docs/specs/020-studio-editor.md` | The Studio editor: an optional full editing page beside the simple pipeline (items E1–E9) |
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

**Made in PR #126:**
- AssemblyAI `disfluencies` is on, so "um"s are in new transcripts.
- Quote matching, re-timing and the Shorts quote check skip fillers (`lib/fillers.ts`).

**Studio editor (spec 020), answered by Tom:**

| # | Question | Answer |
|---|---|---|
| U1 | Captions | The **YouTube caption track** only; not burned into full episodes. |
| U2 | Music and effects | **Free or royalty-free sources; the team checks licences by hand.** Transitions: **Dissolve and Fade now**, others if available (14 more listed, all rendered with the runners' ffmpeg). |
| U3 | Devices | **Desktop only** (1280 px and wider) for the Studio editor. |
| U4 | Moving clips | **Not now.** Dragging clips to new places, such as dropping a new intro or outro, will be needed eventually: item E9. |
| U5 | Name | **"Studio editor".** |

**Still open:** D1–D6 in spec 019:
- D1: Auphonic plan;
- D2: audio podcast feed;
- D3: the criteria for retiring Descript;
- D4: animated graphics;
- D5: one track per speaker;
- D6: the phase order.

## Order of work (recommended)

1. **Finish the current plan** and run one real episode end to end through Editor Light (spec 015
   "Next").
2. **019 Phase 0:**
   - **0.1** checks on every PR, which also fixes the 7 lint errors already on `staging`;
   - **0.2** a quality report on every render.
3. **019 Phase 1:** better suggestions. Mostly reconciling with what exists (see below), then
   1.1 (pauses from the audio) and 1.2.
4. **020 E1–E4:** workspace, timeline with waveform, split and trim, transitions.
5. **019 Phase 2** (the rest), **Phase 3** (sound bake-off), then **020 E5–E8**.
6. **019 Phase 4** (hand-off export, faster render), then **Phase 5**.
7. **020 E9** (move clips) when Tom says.

## Overlaps with work already on `staging` — reconcile first

These were written before Parts D and I and the splits landed. **Evolve what exists; do not build
a second version.**

| Plan item | Already on `staging` | What to do |
|---|---|---|
| 019 **1.3** Claude "Tighten" | **Retakes** (`lib/retakes.ts`, `podcast_notes.yml` `mode: retakes`, cut reason `retake`): Claude suggests cutting earlier tries of a line | Extend retakes, don't add a job. Widen its prompt to false starts, verbal tics ("you know", "I mean"), housekeeping ("can you hear me?") and tangents, each with a kind and `why`. Keep the quote and teaser protection from 1.3. |
| 019 **1.4** accept or restore by kind | Counts per kind filter the review; **Clear these** removes one kind | Add **Accept all** per kind if it is still missing; otherwise mark 1.4 done. |
| 019 **1.6** fewer suggestions | Hesitations are opt-in (**Mark hesitations**, reason `gap`, 0.5–1.2 s, not after a clause) | Mostly done. Left: record at ingest whether a transcript has `disfluencies`, and hide hesitations by default for those episodes; tighten the repeat rule; measure the count on the 49-minute episode and write it in spec 015. |
| 020 **E3** split and trim, `parts` | **Splits** (`edit.splits`, ms in the original): **Cut this section** and **Bring this section back**; the render ignores splits | Build on `splits` instead of a new `parts` array; update spec 020's model. Trimming and transitions (E4) attach to splits. |
| 020 **E5/E6** layers, titles, lower thirds | **On screen** (`lib/onScreen.ts`, `edit.overlays`): text with a second line, **Name titles** per speaker, PNG/JPEG images at nine positions with `widthPct`, anchored at `atMs` in the original recording; rendered with ASS and ffmpeg overlays | Evolve `OverlaySchema` instead of the new `Layer` type. Add a free box (x, y, w, h) beside the nine positions, transitions in and out, video overlays and tracks, with a migration. Spec 020's `Layer` is the target shape; `edit.overlays` is the starting point. |
| 020 **U1** captions | **Burned-in captions** (Part I): `burnCaptions` setting, **off by default**, and a per-video `edit.captions` | **Ask Tom.** U1 says the YouTube caption track only. Part I's option is off by default, so nothing is burned in unless someone turns it on. Either hide it, or keep it as an option. Do not remove it without asking. |
| 020 **E5** uploads | Image uploads to `overlays/` in Storage, checked by the edit route | Reuse them for the media bin; add video and audio kinds. |
| 020 **E7** music and effects | **Part H (AI video b-roll and music)** is in Jo Ann's fork and **was not merged** | Read Part H before building E7. Keep spec 020's licence record and "not checked" gate whatever is reused. |
| 019 **2.3** correct a misheard word | **Translations** (`lib/translate.ts`) translate the captions | Word corrections must reach the translated captions too: translate after corrections, or re-run. |
| 019 **0.2** quality report | The render now draws on-screen text, images and captions | Include those in the checks (for example, text drawn when the overlay says). |

## For the development conversation

1. **Compact** what you have learned while building: what exists, what changed, and any lessons.
2. **Read** this page, then spec 019's "Before you start", spec 020, and the two research
   documents.
3. **Evaluate** the plan against what you have built. For each overlap above, and anything else
   you know that this conversation did not, decide: keep, change, merge with existing work, done,
   or drop.
4. **Update the plans in one PR to `staging`.** Specs 019 and 020 (status table, models,
   order), this page, spec 015 and `CLAUDE.md` where they no longer match. Note anything that
   needs Tom (the U1 overlap, D1–D6).
5. **Then build**, one item per PR, in the agreed order, following 019's "Rules for this work".
