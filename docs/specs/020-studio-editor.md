# Spec 020: Studio editor — a full editing page beside the simple pipeline

**Date:** 5 October 2026
**Status:** Planned. Not started. Part of `docs/specs/019-editor-light-v2.md`, whose status table
tracks these items (E1–E7). Read 019's "Before you start" first.
**Author:** Claude, from Tom's request: "split, drag and drop, the timeline with audio,
additional media, overlays … an optional page to the simplified pipeline where edits are done".
**Related:** `docs/specs/015-editor-light.md` (the editor today), `docs/specs/018-studio-settings.md`
(uploads, intro, teasers), `docs/research/2026-10-05-open-source-editors.md`

## The problem

Editing happens in a narrow column inside step 3 of the six-step pipeline. The full-page editor
(`/admin/podcast/[episodeId]/edit`, spec 015) is wider, but it is still the same editor:
- only transcript cuts;
- a timeline you can only click to seek;
- no waveform;
- no way to split, move or add anything.

Descript, used today, offers:
- a script on the left;
- a preview with layout and captions in the middle;
- media, elements, captions, properties and AI tools on the right;
- a timeline with thumbnails, captions and a waveform, with split and zoom.

**Also seen on a real 48-minute episode:** the editor offered **2,970 suggestions** (2,250
"fillers", 300 repeats, 420 pauses). Most "fillers" are gap guesses shown as "um". Nobody
reviews 2,970 items one at a time. 019 item 1.6 deals with this; the new page must not make it
worse.

## What we build

**Two ways into one edit:**

| | **Quick edit** (as today) | **Studio editor** (new, optional) |
|---|---|---|
| Where | Step 3 of the pipeline, in the panel | Its own page, `/admin/podcast/[episodeId]/studio-editor`, desktop only (1280 px and wider) |
| For | Most episodes: cut fillers, pauses and words | Episodes that need more: split and move parts, overlays, music, titles, captions |
| Edits | Transcript cuts | Everything |

- Both read and write the **same** `episodes/{id}.edit`.
- The pipeline stays simple. Step 3 gains **Open the Studio editor**, and step 4 (Final cut)
  gains **Touch up in the Studio editor**.
- When an edit has Studio-only changes, the quick edit shows a one-line summary, for example
  "3 parts moved, 12 overlays, music on 2 tracks", and still allows word cuts.
- The existing `/edit` page becomes the Studio editor. Its old URL redirects to the new one.

## Layout

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Episode · Title · 41:12 (saves 7:41) · ✓ Saved     Undo Redo   ? Shortcuts   Render ▸   │
├───────────────────────┬──────────────────────────────────────────┬───────────┬───────────┤
│ SCRIPT                │ PREVIEW (16:9, scales to fit)            │ PANEL     │ RAIL      │
│ Tom Wood 0:19         │ ┌──────────────────────────────────────┐ │ (one of:) │ Media     │
│ I haven't seen you…   │ │  video + overlays + captions         │ │ Media bin │ Elements  │
│ ‹um› ‹pause 1.4s›     │ │  overlays drag and resize here       │ │ Elements  │ Captions  │
│ Search · Suggestions  │ └──────────────────────────────────────┘ │ Captions  │ Properties│
│ (filler, pause,       │ ◀◀  ▶  ▶▶  0:19.4 / 41:12  Edited|Original│ Properties│ AI        │
│  Tighten: accept all) │ Speed 0.75–2×  Captions on/off           │ AI tools  │           │
├───────────────────────┴──────────────────────────────────────────┴───────────┴───────────┤
│ TOOLS  Select(V) Blade(B) Ripple ✓ Snap ✓   Zoom ─●──── Fit                                │
│ RULER  0:00 ·····0:10 ·····0:20 ·····0:30 ·····                                           │
│ V3 Titles     [Lower third: Daniel Endy]                       [Title card]               │
│ V2 Overlays   [b-roll 1]        [logo ─────────────────────────────────────────]          │
│ V1 Episode    [part 1 ▒▒ thumbnails ▒▒][part 3 ▒▒▒▒▒][part 2 ▒▒▒▒▒▒▒▒]  (cuts hatched)  │
│ CC Captions   [It's been a little bit][We've been doing phone calls]…                     │
│ A1 Voice      ▁▃▅▇▅▃▁▁▃▇▇▅▂ waveform ▁▂▅▇▅▃▁                                                 │
│ A2 Music      [bed ───── ducked under voice ─────]                                         │
│ A3 Effects            [whoosh]                                                            │
│               ▲ playhead                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- The panels are resizable, and their sizes are remembered per browser.
- The timeline height can be dragged.
- Track headers have mute, hide and lock.

## The edit model, version 2 (`lib/sequence.ts`)

Today an edit is `{ cuts, version }`: time removed from one source, played in order. Version 2
keeps that and adds the rest. **An edit saved today is a valid version 2 edit.**

```ts
interface Sequence {
    version: number;               // save version, checked as today (409 when stale)
    cuts: Cut[];                   // source-time cuts from the transcript, as today
    parts?: Part[];                // the episode track in play order; missing = the whole source once
    layers: Layer[];               // pictures and text over the episode
    audio: AudioItem[];            // music, effects, stingers
    captions?: CaptionStyle;       // burned-in captions, off unless set
}
interface Part { id: string; srcStartMs: number; srcEndMs: number }
type Anchor = { srcMs: number } | { atMs: number };   // stick to the words, or pin to the timeline
interface Layer {
    id: string; track: number;     // V2, V3, …
    kind: 'image' | 'video' | 'text' | 'lowerThird' | 'logo';
    mediaId?: string; text?: string; style?: string;
    anchor: Anchor; durationMs: number;
    box: { x: number; y: number; w: number; h: number };   // fractions of the 1920×1080 frame
    opacity: number; fadeInMs: number; fadeOutMs: number;
    motion?: 'none' | 'kenBurnsIn' | 'kenBurnsOut' | 'pan';
    volumeDb?: number;             // video layers with sound
}
interface AudioItem {
    id: string; track: number;     // A2, A3, …
    mediaId: string; anchor: Anchor; inMs: number; outMs: number;
    gainDb: number; fadeInMs: number; fadeOutMs: number;
    duckUnderVoice: boolean;       // lowered while anyone speaks
}
```

**Rules:**
- **Split** (B, or S at the playhead) turns one part into two at that source time.
- **Move:** dragging a part on V1 reorders `parts`.
- **Ripple delete** of a part removes it from `parts`. The transcript treats those words as
  missing, not cut, so double-click does not bring them back. Undo does.
- **Trimming a part's edge** adds or shortens a cut at that edge, so the transcript shows it.
- **Anchors:**
  - A layer or sound anchored to `srcMs` moves with its words when cuts or order change. This is
    the default, and it is how b-roll already behaves.
  - Pinned (`atMs`) items stay at a timeline time. This is the default for music beds.
  - An item whose anchor word is cut is flagged in the timeline, not deleted.
- **Teasers, intro and outro** (Studio settings) show as locked clips before and after the
  episode. They are not part of `parts`.
- **Existing b-roll** from the notes plan (spec 008) appears as V2 layers on first open, so it
  can be moved, trimmed or deleted. Until then the render uses the notes plan as today.
- **Validation:** zod `SequenceSchema`, checked on save as `CutsSchema` is today. At most
  10,000 cuts, 500 parts, 500 layers and 200 sounds, which keeps the document well under
  Firestore's 1 MiB.

**Pure functions, all in `lib/` and tested:**
- `playOrder(seq)`: the kept source ranges in play order (parts ∩ `keepRanges`).
- `timelineTime(seq, srcMs)` and `sourceTime(seq, atMs)`: generalize `editedTime` to parts in any
  order.
- `itemsAt(seq, atMs)`: what is visible and audible at a moment. Both the preview and the render
  plan use it, so they cannot disagree.
- `split`, `movePart`, `trimPart`, `moveLayer`, `snap(…)`.

**Reordering touches everything that maps times.** These all move to `timelineTime`:
- `applyToChapters`, `applyToQuotes` and `editedWords`;
- the Editor Light `.srt`;
- the final-cut words (spec 018's "Editor Light as the final cut").

Chapters must stay in order: a chapter whose part was moved goes where its part now plays, and
`MIN_CHAPTER_MS` tidying runs after.

## The preview

The preview layers HTML over the 720p proxy. It is not a second renderer:
- **The episode** plays in one `<video>`, or two for smooth joins (019 item 4.3). It seeks
  through `playOrder`, so moved parts play in their new order.
- **Layers** are absolutely positioned `<img>`, `<video>` or text inside the 16:9 stage, at the
  same fractional `box` the render uses.
  - Text uses the fonts the render uses: Outfit is already loaded on the site, and the same
    files are in `agent/assets/fonts`.
  - Selected layers get drag and resize handles from **react-rnd** (MIT). Positions are snapped
    to the frame edges, the centre and thirds.
- **Sounds** play in `<audio>` elements kept in step with the playhead. Ducking is approximated
  with Web Audio gain while a word is spoken.
- **Captions preview** comes from the words on the timeline, in the chosen style.
- **The preview can differ slightly from the render** (font hinting, Ken Burns easing), and the
  page says so. The render's quality report (019 item 0.2) is the check.

## The timeline

Build it ourselves, growing `components/studio/timeline.tsx` and `lib/timeline.ts`. No timeline
library gave cross-track drag and split under a clean licence:
- Twick is source-available and sends telemetry.
- designcombo/OpenVideo and Remotion Player have a 3-employee limit.
- `@xzdarcy/react-timeline-editor` (MIT) has no split and limited dragging between rows.

**Drawing:**
- Only the visible window is drawn. An hour at 32× zoom is far wider than the screen.
- The waveform and the thumbnail strip are canvases. Clips are DOM elements.
- Cut gaps on V1 are drawn on the canvas, not as elements: there can be thousands.

**Waveform:**
- Peaks are made in CI from `audio.m4a`: min and max per 10 ms as Int8, `analysis/peaks.bin`
  (019 item 2.1).
- Draw them on our own canvas (about 50 lines). **wavesurfer.js v8** (BSD-3, takes precomputed
  `peaks` + `duration`) is the fallback if that proves fiddly.
- **peaks.js is LGPL. Do not use it.**

**Thumbnails:** at ingest, `ffmpeg -vf fps=1/5,scale=160:-1,tile=10x10` makes sprite sheets of
one frame every 5 s (`analysis/thumbs_N.jpg` and an index). That is about 7 sheets an hour.

**Interaction:** Pointer Events with `setPointerCapture`:
- move, trim handles and blade;
- snap to the playhead, clip edges, word edges and cuts, within 8 px. Hold Alt to turn snapping
  off.
- A whole drag is one undo step.

**From the media bin**, drag with **@dnd-kit/core** (MIT). The drop point's x and the zoom give
the time; the track under the pointer gives the track.

**Shortcuts:**

| Keys | Action |
|---|---|
| Space, J/K/L | Play and pause; shuttle |
| V | Select tool |
| B | Blade tool |
| S | Split at the playhead |
| Delete | Delete |
| Shift+Delete | Ripple delete |
| ⌘/Ctrl+Z, ⇧⌘/Ctrl+Z | Undo, redo |
| ⌘/Ctrl+C, X, V | Copy, cut, paste items |
| ← → | One frame; with Shift, one second |
| + − | Zoom |
| ? | Shortcut sheet |

## Media

**The episode bin** shows everything the episode already has, with nothing to upload:
- b-roll stills and clips (spec 008);
- teasers and the edit package (spec 009);
- the intro and outro and the logo (spec 018);
- uploads.

**Uploads** use spec 018's resumable upload (`lib/server/uploads.ts`) with a new kind `media`:

| Kind | Limit | Formats |
|---|---|---|
| Images | 20 MB | PNG, JPEG, WebP |
| Video | 2 GB | MP4, MOV |
| Audio | 200 MB | MP3, M4A, WAV |

- The server checks each file's type and first bytes, as spec 018 does.
- Files are stored at `episodes/{id}/media/{mediaId}` and listed in `episodes/{id}/media`
  (Admin SDK only).
- **Peaks and thumbnails for uploads are made in the browser** before upload: Web Audio decode
  for audio, `<video>` + canvas for frames. They are short files, so no job is needed.

**The show library** (`studio/media`) holds things used in every episode: music beds, stingers,
lower-third styles and title cards.
- Only admins add to it.
- Every music file records its licence, as `docs/licences/intro-music.md` does for the intro.

## Elements and properties

**Elements:**
- **Title card**, centred.
- **Lower third:** a speaker's name and role. "Add for every speaker" places one the first time
  each speaker talks, from the transcript's speaker names.
- **Logo bug** in a corner, for the whole episode.
- **Text.**
- All use the brand colours and fonts from Studio settings (spec 018), as thumbnails and Shorts
  already do.

**Properties** for the selected item:
- position and size (numbers, or drag on the preview);
- opacity;
- fade in and out;
- motion (Ken Burns, pan);
- volume and ducking for sounds;
- text and style for text.

**Captions:** style, size and position for **burned-in** captions (decision U1). YouTube captions
are still uploaded as a separate track (spec 012) either way.

**AI tools:** the suggestion queues from 019 Phase 1 (fillers, pauses, repeats, Tighten), with
"Accept all" per kind (019 item 1.4). The script's suggestion review moves here.

## The render

`agent/src/podcast/editRender.ts` grows from "cuts plus b-roll" to "sequence". A pure
`planRender(sequence, assets)` in `lib/sequence.ts` gives:
- **the episode ranges in play order.** The block renderer already seeks once per range, so
  order costs nothing extra.
- **every layer**, with its timeline in and out, box, fades and motion:
  - images and video go through `scale` + `overlay=x:y:enable=…`, with alpha `fade`;
  - Ken Burns uses the existing still-to-clip code (`media.ts`);
  - text, lower thirds, titles and burned-in captions go into one ASS file drawn with `ass=`, as
    `shortsRender.ts` does, with the fonts from `agent/assets/fonts`.
- **every sound**, with `atrim`, `adelay`, `volume` and `afade`:
  - ducking is `sidechaincompress` keyed by the voice;
  - everything is mixed with `amix`, before the clean-up of the voice track only and before
    loudness.

The teasers, intro and outro assembly stays as it is. Tests check the graph string for a small
sequence, and a flash-and-beep clip with a moved part stays in sync (spec 015's check).

## Building it (rows E1–E7 in 019's table)

| # | Item | Effort | Needs |
|---|---|---|---|
| E1 | **Workspace shell.** The layout above, with resizable panels and the shortcut sheet. The existing editor moves into it, nothing new yet. `/edit` redirects here. Quick edit stays in step 3. | M | — |
| E2 | **Timeline engine.** Tracks, virtual drawing, zoom and scroll, snapping, selection. Waveform and thumbnail sprites (019 items 2.1 and 2.2 are built here). Drag cut edges; time-range cuts. | L | E1 |
| E3 | **Parts.** `lib/sequence.ts` v2 with `parts`. Split, move, ripple delete and trim on V1. The script in play order. `timelineTime` everywhere times are mapped. The render in play order. | L | E2 |
| E4 | **Media and overlays.** Episode bin and uploads. Image and video layers with box, fades and motion. Preview layers with react-rnd. Existing b-roll becomes layers. Overlays in the render. | L | E3 |
| E5 | **Elements.** Title, lower third, logo bug and text, with the Properties panel and the ASS render. | M | E4 |
| E6 | **Audio tracks.** Show library and audio uploads. Music, effects and stingers with gain, fades and ducking. Preview mixing; `amix` and `sidechaincompress` in the render. | M | E4 |
| E7 | **Captions and polish.** Captions track and burned-in style. Copy and paste items. Reorder by cutting and pasting script text, as Descript does. J/K/L. | M | E5 |

**Each row is one PR.** Each ends with:
- the page usable on the real 48-minute episode;
- a render of it checked by 019 item 0.2;
- `lib/` tests for any new pure function.

## Not in this spec

- **Phones and tablets.** The Studio editor is desktop only; the quick edit stays as the
  phone-friendly path (spec 015 "Next").
- **More than one source video.** For example a second camera, or a guest's recording. The model
  allows it later (a part with a `mediaId`), but the render and transcript would need work. Ask
  first.
- **Speaker layouts.** Cropping to whoever is talking, or side-by-side templates, as Descript's
  "Layout" does. Worth doing for vertical Shorts; a separate spec.
- **Two people editing at once.** Saves stay first-come; a stale save is refused (409) and
  reloads, as today.
- **AI voice (overdub) or generated video.**

## Decisions needed (Tom)

| # | Question | Needed before |
|---|---|---|
| U1 | Burned-in captions on full episodes, or only YouTube's caption track (as today)? | E7 |
| U2 | Music and effects: which library, and who checks licences? | E6 |
| U3 | Is desktop-only (1280 px and wider) fine for the Studio editor? | E1 |
| U4 | Should moving parts be allowed? It is the biggest change, because every time mapping must follow the new order. Without it, E3 shrinks to split and trim. | E3 |
| U5 | Page name: "Studio editor"? | E1 |
