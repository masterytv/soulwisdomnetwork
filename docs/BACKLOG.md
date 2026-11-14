# Feature backlog

Features and fixes agreed but not built yet. Add to it when something is decided for later;
move an item into a numbered spec (`docs/specs/NNN-name.md`) when work on it starts, and delete
it here when it ships. Ideas not yet agreed are in `docs/ENHANCEMENTS.md`.

## Distribution

- **Post shorts (and episode clips) to other platforms.** Today the shorts go to YouTube only
  (spec 013). The same rendered files could go to:
  - **Instagram Reels**: planned in specs 005 and 013 ("Instagram later"). Posting goes through
    the Instagram Graph API, which needs a Business or Creator account linked to a Facebook Page.
  - **TikTok**: their posting API only allows private posts from apps that have not passed
    TikTok's audit, and the audit takes an unpredictable time (spec 005). Start the
    application early, and add TikTok when it clears.
  - **Others** (Facebook, LinkedIn, X) if wanted.

  Each platform needs its own sign-in secrets, a per-platform caption (from the short's title
  and the episode link), and its own schedule beside YouTube's one a day.
- **Weekly performance pull** (spec 005): views, watch time, retention and click-through for
  each episode and short, from YouTube and then the other platforms.

## Second podcast

- **Per-show settings**: YouTube channel, intro and outro, branding, Claude prompts, Drive
  folders and shorts schedule, so the Studio can run more than one show.
- Then **SETUP.md** (run your own copy), **CONTRIBUTING.md** and a **license** (Tom to choose).

## Editor Light (replacing Descript)

- **Editor Light v2** (`docs/specs/019-editor-light-v2.md`): the best ideas from Rescript, CutScript,
  auto-editor, DeepFilterNet and Auphonic, in phases, to start once the current plan is done. The
  research behind it is `docs/research/2026-10-05-open-source-editors.md`. The full editing page
  (split, timeline with audio, transitions, media, overlays, music) is `docs/specs/020-studio-editor.md`.
  Start at `docs/PLANNING.md`.

Two ideas from **Scarlet** (https://github.com/Forward-Future/scarlet, MIT, a desktop AI editor for dialogue
first cuts; reviewed 2026-11-14 at commit `b1c3c696f36db73d0d5374e0c7f95ed52847df36`). Copy the ideas, not
the app: Scarlet is a Tauri desktop app with a local engine and can't run in our jobs. Its file paths below are
at that commit; credit it in code adapted from it.

- **Cut edges in the quiet, and every join checked.** Today the first edit and Claude's retakes cut on
  AssemblyAI's word times, padded 40 ms (`keepRanges` in `lib/edit.ts`, `firstEdit` in `lib/programme.ts`,
  `lib/retakes.ts`), with the silences measured at ingest (`agent/src/podcast/silences.ts`). Nothing checks a
  join once it is cut, so a clipped word or a half-left "uh" is only heard in the render. Scarlet:
  - Places each edge in measured room tone between words, or at the lowest level where two words run
    together, then on the nearest whole frame inside that quiet; refuses an edge inside a sounding word and
    says why (`packages/mcp/src/dialogue-join.ts`: `edgeOnFrame`, `clipEdgeSound`, `DIP_DBFS`).
  - Checks every join after a pass: a kept word heard short at the edge, a sound with no word left playing, or
    the same words now said twice across the join (`timeline_join_audit` and `dialogue_check_repeats` in
    `packages/mcp/src/server.ts`; `packages/mcp/src/dialogue-fragment-repeat.ts`,
    `apps/server/src/services/dialogueRepeatAudit.ts`).
  - Checks a gap in the transcript is really quiet before calling it a pause, so a word the transcript missed
    isn't cut as silence (`packages/mcp/src/gap-sound.ts`).
  - The reasoning is in its `docs/AI-AGENTS.md`, rules 6, 9, 10 and 11. On one pass it took applied edges
    landing on speech from 11 of 105 to 5.

  For us: an edge placer in `lib/edit.ts` used by `firstEdit`, the retakes and the render, and a join check
  in the render's quality report (`agent/src/podcast/renderQc.ts`) or as warnings on the timeline's cut markers.
- **Scoring cut quality (evals).** We have no measure of whether the first edit or Claude's retakes get
  better or worse when a prompt, model or setting changes. Scarlet's `evals/` scores an AI cut against the
  editor's own cut of the same recording: seconds and cuts removed by kind (retake, filler, pause), each edge
  classed silence, low or speech from the recording's own levels, clipped words, gaps of half a second or more,
  dead air, doubled words (`evals/README.md`, `evals/src/metrics.ts`, `score.ts`, `wordEdges.ts`). Its
  recordings and results stay outside the repository.

  For us: score `firstEdit` and the retakes job against Tom's finished edits of past episodes (their saved
  edits, or the Descript final cuts), run by hand like `podcast_notes_compare.yml`, never committing episode
  data. It would also show whether the edge placer above helps.

## Studio

- **Shorts cover-frame slider**: pick the frame YouTube shows for each short.
- **The Shorts motion overlay** (`short`, spec 021 D5 — Tom: "later, but don't forget shorts"):
  the branded 1080×1920 overlay with word-by-word captions from `Short.dc.html`
  (`docs/specs/021-motion-graphics/`), rendered into the Shorts in place of today's ffmpeg
  captions once spec 021's template renderer is in and Shorts work comes around again.

## Community site

- **Community feed, next steps** (spec 016): more than one community; editing posts and
  comments; reporting a post to the admins; reply notifications; link previews; search.
- **Older profiles named after their email**: members who signed up with email and password
  before spec 016 are named after the part of their email before the @. They can rename
  themselves in Edit profile; an admin could rename the rest.
- **People directory.**

## Not code

- **Daniel** to review the privacy policy and terms.
