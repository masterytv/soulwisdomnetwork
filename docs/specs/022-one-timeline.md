# Spec 022: One timeline — the whole video as ordinary clips

**Date:** 28 October 2026
**Status:** Proposed. **Waiting for Tom's approval; no code until he approves it.** The questions for him are at the
end (D1–D7), each with a recommendation.
**Author:** Claude, from Tom's request: make the Studio editor a regular editor, "one timeline for the whole video",
where the "In this episode" opening is ordinary clips he can cut, duplicate, move, trim, dissolve, label and put sound
under, not the locked teaser box it is now.
**Related:** `docs/specs/020-studio-editor.md` (items E9, E10, E12, E14, E16: the teasers, intro and outro today; E7:
sounds), `docs/specs/021-motion-graphics.md` (the motion "In this episode" tag, starlight, the end screen),
`docs/specs/018-studio-settings.md` (the teasers switch, the section joins, the teasers' music and whoosh),
draft PR #231 (the Studio's own wind sounds, held, not merged), `docs/PLANNING.md` (the gotchas).

## The problem

The Studio editor's timeline already draws the whole video on V1: the teasers, the intro, the episode and the outro
(020 item E14). But only the episode is edited like a video. Everything around it is a special case:

- **The teasers are a list, not clips** (`edit.teasers`, `lib/programme.ts`). A teaser can be trimmed, moved among
  the teasers, taken out and added, and that is all. It cannot be cut in two, duplicated, or moved after the intro.
- **One transition for all of them.** Every change between teasers gets the same "Between teaser clips" transition
  (a section join), so one change cannot be a dissolve and the next a cut.
- **The label is a switch on the teaser.** The "In this episode" graphic is the teaser's `tag` (on or off, and its
  name). It always runs the whole teaser and cannot be moved, shortened or put on anything else.
- **No sound can sit under them.** Sounds (`edit.audio`, A2 and A3) are anchored to the episode: to a moment of the
  recording or a time in the edited episode. Nothing can be placed under the teasers, the intro or the outro.
- **The stopgap.** To get music and a whoosh under the teasers, #229 added two Studio settings (`teaserMusic`,
  `teaserWhoosh`), planned by `teaserSoundPlan` and played by `components/studio/teaserSounds.tsx`. They are the same
  for every episode and cannot be moved, turned down or taken out of one change.
- **Built specially twice.** The preview (`components/studio/programme.tsx`) and the render
  (`agent/src/podcast/editRender.ts` pieces, `editRenderJob.ts` cutting teasers with the tag) each assemble the
  teasers, intro, episode and outro by hand, in that fixed order.

## What we build

One model for V1: **the whole video is a list of clips**, in play order. The edited episode is one of them, edited as
today (cuts, splits, sections, its own layers and sounds). Around it are **recording clips** (a stretch of the
recording played as it is: what a teaser was), **the intro** and **the outro**. Every clip can be moved, trimmed,
cut in two, duplicated and deleted; every change between two clips has its own transition; graphics can sit on any
clip; sounds can sit anywhere on the whole video.

The opening is then just the clips before the intro. **Build the opening** (stage 3) places them from the approved
show notes' teaser clips, as ordinary clips with dissolves, an "In this episode" label on each, the Studio's
"Wind: breath" at each change and, if chosen, music under them. Everything it places is edited by hand afterwards
like anything else. No AI step, no MCP: the notes' clips drive it.

The preview and the render read the same model through the same functions, as they do today for the episode. An
edit saved before this converts automatically, and looks and sounds the same (two deliberate exceptions: D1, D2).

## The model (`lib/programme.ts`, grown)

```ts
interface EpisodeEdit {                 // lib/edit.ts, as today, plus:
    programme?: ProgrammeEdit | null;   // missing or null: converted from the old fields (below)
}

interface ProgrammeEdit {
    clips: ProgrammeClip[];             // V1, in play order
    layers: ProgrammeLayer[];           // graphics on clips other than the episode
    audio: ProgrammeSound[];            // sounds on clips other than the episode
}

type ProgrammeClip = { id: string; join?: Transition } & (
    | { kind: 'recording'; inMs: number; outMs: number; name: string }   // a stretch of the recording
    | { kind: 'intro' }                 // the episode's own intro (edit.intro) or the Studio's
    | { kind: 'episode' }               // the edited episode: cuts, splits, order, edit.layers, edit.audio
    | { kind: 'outro' }                 // the episode's own outro (edit.outro) or the Studio's
);

// Where an item on a clip starts: `ms` after that clip starts in the whole video.
type ClipAnchor = { clip: string; ms: number };
type ProgrammeLayer = GraphicLayer & { anchor: ClipAnchor };   // ms ≥ 0
type ProgrammeSound = Sound & { anchor: ClipAnchor };          // ms ≥ −10 000 (a sound can lead into its clip)
```

**Rules of the model:**
- **Exactly one episode clip; at most one intro and one outro.** Recording clips can be anywhere: before the intro
  (the opening), between the intro and the episode, after the episode or after the outro. Any clip but the episode can
  be moved anywhere; the episode stays where the others leave it.
- **A recording clip** plays `inMs`–`outMs` of the recording exactly, at least 500 ms (`TEASER_SHORTEST_MS`), inside
  the recording. It is a copy: cutting words in the script changes the episode, never a recording clip. `name` is
  what V1 shows (its speaker at first; it can be renamed).
- **The intro and outro** keep their files where they are today: `edit.intro` and `edit.outro` (the episode's own,
  from its media bin) or the Studio's (`studioIntro`). The clip says where and whether it plays. An intro with no
  file (the Studio has none) is skipped: it has no length and no transitions.
- **`join` is the transition into the clip** from the one before. Missing, it is the default for that kind of change,
  from the edit's section joins or the Studio's (`sectionJoins`, unchanged), which reproduces today's programme exactly:

  | The clip before → this clip | Default (section join, keys unchanged) |
  |---|---|
  | recording → recording | `betweenTeasers`, shown as "Between opening clips" |
  | recording → intro, recording → episode | `afterTeasers`, shown as "After the opening" |
  | intro → episode | `afterIntro` |
  | episode → outro | `beforeOutro` |
  | any other pair | a straight cut |

  The neighbours are the clips that play (a skipped intro is not one). The start and end of the video keep `start`
  and `end`. A clip's own `join` (a cut included) overrides the default. A transition longer than the clips around it
  plays as a straight cut, with the warning the render gives today. Starlight is a straight cut under its drawn clip,
  as today, now at each change that has it (D2).
- **Items on a clip** belong to it: they move with it, are copied with it and deleted with it (Undo brings them back).
  Items over the episode stay in `edit.layers` and `edit.audio` with their anchors (`srcMs`, `atMs`, `fromEnd`)
  exactly as today; nothing about them changes.
  - **A graphic on a clip** (a `ProgrammeLayer`: any motion graphic template, the "In this episode" label first) is
    drawn on that clip's picture before the clip is joined to its neighbours, so it dissolves with its clip, as the
    teaser tag does today. It ends with its clip at the latest. A label that reaches its clip's end keeps reaching it
    when the clip is trimmed.
  - **A sound on a clip** (a `ProgrammeSound`) plays on the whole video's clock from its place: it can start before
    its clip (the wind leading into a change), cross changes (music under the whole opening) and run on to the end of
    the video, ducked under whatever voice is playing. (A sound over the episode still belongs to the episode and ends
    with it, as today.)
- **Limits:** at most 40 clips, 100 graphics and 100 sounds on clips, ids unique, every anchor naming a clip that is
  there. The edit route checks the whole of `programme` with zod, as it checks every field; sounds from the show
  library need their licence checked, as today, and the Studio's own sounds (#231) need none.

**The whole video's clock** (`programmeOf`, grown from today's): the clips that play, in order, each starting where
the one before ends less the transition between them; the recording clip's length is its stretch, the intro's and
outro's their files' (read from the file's metadata in the preview and with ffprobe in the render, as today), and the
episode's its edited length. Everything on a clip is placed from its clip's start; everything in the episode from the
episode's start, as today. The render keeps every length in whole frames, as it does now.

## Converting an edit saved before this

`programmeEdit(edit, old)` gives the edit's own `programme`, or converts the old fields when it has none. The editor,
the edit route, the render job and Build for Studio editor all call it, so they cannot disagree. Nothing is written
until the edit is next saved; then it is saved in the new form.

| What the edit had | What it becomes |
|---|---|
| `teasers` (a list, item E10) | One recording clip per teaser, in order, named by its speaker; then the intro, the episode, the outro. Each teaser with its tag on gets an "In this episode" graphic on its clip at 0 ms, its name the tag's, `max(1 s, min(the clip's length, 60 s))` long, as the render draws it today. |
| `teasers: []` | No recording clips. |
| `teasers` missing or null (saved before E10) | The teasers the editor shows for it today: the approved notes' clips (`teasersFromNotes`), when the Studio settings play teasers. See D1. |
| `intro: false`, `outro: false` | No intro or outro clip. |
| `joins` at section joins | Kept as they are: they are the defaults for the kinds of change. No clip gets its own `join`. |
| `layers`, `audio` (over the episode) | Unchanged. |
| The Studio's teaser music and whoosh (stage 3) | Sounds on the clips at the places and levels `teaserSoundPlan` gives today: the bed from the first clip's start to the last opening clip's end, ducked, faded in over 0.5 s and out over 1.5 s; the whoosh at each change, at the middle of its transition less 250 ms. |

**The same output, shown by tests.** The render names every window it encodes by a hash of the ffmpeg commands that
make it (`windowKey`). Stage 2 starts by recording, on today's code, the window keys and the sound's ffmpeg commands for a set of
edits covering every row above (teasers with and without tags, none, before E10, no intro, no outro, the episode's
own intro, dissolves and wipes at every section join, starlight at a split, a transition too long to fit). After the
change the same edits must give the same keys and commands: the same commands make the same video. The preview's pieces
(`programmeOf`) are checked against today's for the same edits.

## The timeline

V1 shows every clip in order, as E14 does now, with the same drawing for the episode. What changes:
- **Clips around the episode are ordinary clips.** A recording clip shows its pictures and voice and its name; the
  intro and outro their names. Choose one and the bar has ▶ Play, Duplicate and Delete (and for a recording clip,
  where its stretch plays in the episode).
- **Cut:** the Blade (or S at the playhead) on a recording clip cuts it in two, between words unless Alt is held; the
  new change is a straight cut (its own `join`), whatever the default. Graphics go with the part they start on.
- **Duplicate:** Duplicate, ⌘D or Ctrl+D, or copy and paste (⌘C, ⌘V): a copy after it, with its graphics and sounds.
- **Move:** drag a clip (not the episode) to any place on V1; a line shows where it goes ("→ before the intro").
- **Trim:** drag either end, between words unless Alt is held. Everything after it moves along, its items with it.
- **Delete:** Delete takes the clip out with its items. Deleting the intro or outro sets this episode's to none, as now.
- **Transitions:** each change between clips has a marker on V1; click it to set that change's transition in the
  Transitions panel, which lists every change by name ("Ana Host → Bo Guest", "After the opening") with its own
  transition or the default it gets.
- **Graphics:** the "In this episode" label sits on V3 over its clip. Choose it to rename, move, resize (its `box`,
  as other graphics), trim or delete it; the Elements panel adds one (or any graphic) to the clip the playhead is on.
- **Sounds:** A2 and A3 run under the whole video. Drop a sound from the Media panel anywhere; drag one across a
  change, from the opening into the episode or back (it is then re-anchored: on the clip, or on the episode's words
  or clock, by where it starts). Properties shows what it is anchored to.
- **The true clock outside the episode.** Before and after the episode, the timeline draws each clip where it plays:
  at a dissolve the two clips overlap by its length, drawn as one band across both. So a sound or graphic that lines
  up with a change on screen lines up when heard. Inside the episode nothing changes (020 E13: transitions at splits
  are not overlapped there).
- **Making a clip from the episode:** + Teaser becomes **+ Opening clip** (and copy and paste of a section or
  stretch, as today): a recording clip where the preview is among the opening clips, its name the speaker first heard.

## Building the opening (stage 3)

**Build the opening** (in the Parts panel, and on V1 when there is no opening) places, from the approved notes'
teaser clips (`teasersFromNotes`: the same stretches the edit package cuts, 300 ms before to 600 ms after):
- a recording clip per teaser clip, before the intro, named by its speaker;
- a **dissolve** into each one after the first: the Studio settings' "Between opening clips" transition, or a 0.5 s
  dissolve when that is a straight cut; and into the intro, the Studio's "After the opening";
- an **"In this episode" label** on each clip, for its whole length, with its speaker;
- **Wind: breath** (#231's Studio sound) at −18 dB on A3 at each change, at the middle of its transition less 250 ms,
  anchored to the clip it leads into;
- **music**, when chosen in Build's menu (none by default, or any show library music whose licence is checked): on A2
  from the first clip's start to the last one's end, −16 dB, ducked, fading in over 0.5 s and out over 1.5 s.

Building again replaces the opening (its recording clips before the intro and everything on them), after "Replace the
opening you have?"; Undo puts it back. A new edit (the editor's first open, item E10, and Build for Studio editor,
E15) gets the opening built when the Studio settings play teasers, as it gets teasers today; the switch is renamed
"Build the 'In this episode' opening on a new edit".

## Removing the teasers' sound settings (stage 3)

`teaserMusic`, `teaserWhoosh`, `TeaserSoundSchema`, `teaserSoundPlan`, `teaserMusicSound`, `teaserWhooshSound`,
`components/studio/teaserSounds.tsx`, the Settings page's two pickers and the render's `teaserSounds` option go. An
edit saved before stage 3 converts with the music and whoosh the settings gave it (the conversion row above), so its
render keeps them; to do that the two stored settings are still read, only for converting, and never shown or saved.
New openings get theirs from Build.

**#231** (held): stage 3 carries its Studio sounds (the three wind files, `scripts/windSounds.py`, `STUDIO_SOUNDS`,
the Media panel's "Studio sounds", the edit route and the render job's copy from the repository) and leaves out its
changes to the teaser settings, which stage 3 removes. See D5.

## The preview and the render

**The preview** (`components/studio/programme.tsx`) already plays the pieces on two videos over the editor's, with
their transitions (E16). It takes its pieces from the clips instead of the fixed order, and:
- draws the graphics on the clip it shows (`ProgrammeGraphics`, which draws the tag today);
- plays the sounds on clips on the whole video's clock, from the player's position or the episode's, at their level
  and fades, ducked while someone speaks: the words in a recording clip's stretch, the episode's words, and never in
  the intro or outro (replacing `teaserSounds.tsx`; a sketch of the mix, as the episode's sounds are).

**The render job** resolves the clips into the pieces it renders, in order, each with its resolved transition:
- a recording clip is cut from the recording exactly (`cutClip`), and its graphics are drawn and laid over the cut
  file before the join (`overlayClip`, as the tag is today; without the graphics renderer the label falls back to the
  burned-in banner, as today);
- the intro and outro are their files, with any graphics on them laid over the same way;
- the episode is made as today.

**`renderEdit`** takes that list (`pieces: { file | episode, join }[]`) in place of `teasers`, `intro` and `outro`.
Its piece loop, windows (`renderWindows.ts`, already generic over pieces) and sound assembly are unchanged; the sounds
on clips are mixed over the whole video's sound, ducked under it, as the teasers' sounds are today; starlight clips
are placed at each change that has one (`at: 'clip:<id>'`). The episode's offset for chapters, quotes, words and
captions is still where the episode starts.

**Unchanged:** the episode's own cuts, splits, sections, layers, sounds, captions, highlights and voice; the end
screen (`fromEnd`); the hand-off files for Resolve, Premiere and Final Cut (the episode's cuts only, as today);
highlights still may not sit on a stretch a recording clip plays.

## While a stage is on staging only

The jobs run from `main`, and staging shares the live Firestore (CLAUDE.md). So until a stage reaches `main`, the live
site and every render read edits the old way. To keep that safe:
- **The new form lives only in `edit.programme`.** Code on `main` ignores it, so nothing there breaks on an edit saved
  from staging.
- **Each save also writes the old fields derived from it:** `teasers` (the recording clips before the episode, with
  `tag` from their labels) and `intro`/`outro` false when absent. Through stage 2 these say everything the new form
  says (a clip's name and its label's are kept the same in stage 2, as a teaser's speaker is both today), so a render from `main` is the same. With stage 3's new parts they are the nearest old form (no sounds on
  clips, nothing after the episode), so **render stage 3's work only once stage 3 is on `main`**, as with every new job.
- **A save from the live site drops `programme`** (its edit route writes the fields it knows), and the new code then
  converts from the old fields it saved. Nothing breaks, but anything stage 3 added on staging is lost. So until a
  stage is on `main`, **edit test episodes on staging, not real ones**.
- Once 022 is on `main`, the old fields stop being written (a small follow-up), and `teasers` is read only to convert.

## Stages (each a PR into `staging`; Tom says when to merge)

| Stage | What | Model effort | Checked by |
|---|---|---|---|
| 1 | This spec | — | Tom's approval |
| 2 | **The model and the conversion.** `edit.programme` with its schema and limits in the edit route (kept when a save leaves it out, and the old fields derived on save); `programmeEdit` for every old shape; `programmeOf` and the timeline's whole-video axis (`withProgramme`) built from the clips; the preview, the "In this episode" graphics, the render job and `renderEdit` reading it; today's teaser actions (trim, move, + Teaser, the tag's name, Delete) working on clips. **Nothing new to see or hear**: the teasers' music and whoosh still come from the settings. | Extra: it changes the saved edit's shape and the render's timing path | The window-key and sound-plan tests above; `lib/programme.test.ts`, `lib/timeline.test.ts`, `editRenderJob.test.ts`, `editRender.test.ts`; the route's schema tests; in Chromium, an old edit opening, playing and saving unchanged |
| 3a | **Sounds anywhere.** Sounds on clips (model, route, timeline lanes, Properties' anchor, the preview's player, the render's mix), the true clock outside the episode, #231's Studio sounds, and the teaser settings removed with their conversion | Extra | `lib/audio.test.ts`; the render puts a wind at the planned sample (as `editRender.test.ts` checks the whoosh today); the converted settings' sounds land where `teaserSoundPlan` put them; in Chromium, a sound dragged from the episode onto the opening and heard there |
| 3b | **The opening as ordinary clips.** Build the opening; cut, duplicate, move anywhere, trim, delete; a transition at each change; graphics on any clip from the Elements panel; + Opening clip | High | `lib/programme.test.ts` (Build, Blade, duplicate, move, trim with labels following, delete with items); the render of a built opening (dissolves, labels, winds); in Chromium, building an opening, cutting one clip in two, changing one change to a cut, moving a clip after the intro, and Undo |

Stage 3 is two PRs so each stays one concern; 3a first, since Build places sounds. Each stage updates CLAUDE.md's map,
spec 020's notes and this page's status.

## Not in this spec

- **Text and pictures on clips outside the episode.** Graphics (motion templates) only, which covers the label; text
  and picture layers there need a pass per clip in the render. Later, if wanted.
- **A video from the media bin as a V1 clip** (b-roll as a cut-away, or a guest's clip). The model has room for a
  `file` kind later.
- **Sounds whose end follows a clip** (music that shortens when the opening does). A sound keeps its length; drag its
  end.
- **Moving the episode's sections out of it** onto the opening. Copy them (+ Opening clip), as today.
- **The end screen on the outro clip.** It stays where it is (`fromEnd`, the last 20 s of the video).

## Decisions for Tom

| # | Question | Recommendation |
|---|---|---|
| D1 | An edit saved before item E10 (no `teasers`) renders today from the edit package's clip files with the old burned-in banner, while the editor shows the notes' clips with the motion label. Convert it to what the editor shows? | **Yes.** The same stretches either way; the render then matches the preview, and the render loses a special path. |
| D2 | Starlight at "Between teaser clips" is drawn by the render at the last change only (one clip per section join), while the preview draws it at every change. Draw it at every change? | **Yes**, a fix: each change has its own transition now. |
| D3 | Music in Build the opening: chosen in Build's menu each time, none by default? | **Yes.** The settings go, so nothing is applied to every episode unseen. |
| D4 | May recording clips, the intro and the outro go anywhere on V1 (after the episode, after the outro), or only within the opening? | **Anywhere**, as in other editors; the model costs the same. |
| D5 | #231: carry its Studio sounds into stage 3a and close #231 unmerged when 3a merges? | **Yes**; its teaser-setting changes are what stage 3a removes. |
| D6 | Build the opening again: replace the whole opening (after a question, with Undo), or refuse once it is hand-edited? | **Replace, after the question.** |
| D7 | Until each stage is on `main`: test on test episodes only, and render stage 3's work only from `main` (above)? | **Yes.** |
