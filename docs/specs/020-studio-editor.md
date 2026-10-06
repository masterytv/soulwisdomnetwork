# Spec 020: Studio editor — a full editing page beside the simple pipeline

**Date:** 5 October 2026
**Status:** Being built: E1 built (#143), E2 built (#144), E3 built (#145), E4 built (#147), E5 built (#157); parts already built before the plan (#123 the full-page editor,
#130 splits and on-screen text and images). Reconciled on 5 October 2026: the model below grows the existing
`EpisodeEdit` (see `docs/PLANNING.md`, "Overlaps"). Decisions U1–U5 answered by Tom on
5 October 2026 (see the end), with N1–N3 in `docs/PLANNING.md`.
Part of `docs/specs/019-editor-light-v2.md`, whose status table tracks these items (E1–E9). Read
019's "Before you start" first.
**Author:** Claude, from Tom's request: "split, drag and drop, the timeline with audio,
additional media, overlays … an optional page to the simplified pipeline where edits are done".
**Related:** `docs/specs/015-editor-light.md` (the editor today), `docs/specs/018-studio-settings.md`
(uploads, intro, teasers), `docs/research/2026-10-05-open-source-editors.md`,
`docs/research/2026-10-05-free-music-and-effects.md`

## The problem

Editing happens in a narrow column inside step 3 of the six-step pipeline. The full-page editor
(`/admin/podcast/[episodeId]/edit`, spec 015) is wider, but it is still the same editor:
- only transcript cuts;
- a timeline you can click to seek, split at the playhead, and cut or bring back a whole section
  (#130), but not drag;
- no waveform;
- on-screen text and images (#130), placed from a panel with nine positions, not dragged;
- no way to move clips, or to add video, music or transitions.

Descript, used today, offers:
- a script on the left;
- a preview with layout and captions in the middle;
- media, elements, captions, properties and AI tools on the right;
- a timeline with thumbnails, captions and a waveform, with split and zoom.

**Also seen on a real 48-minute episode:** the editor offered **2,970 suggestions** (2,250
"fillers", 300 repeats, 420 pauses). Most "fillers" were gap guesses shown as "um". #130 made
those opt-in (**Mark hesitations**); 019 item 1.6 does the rest. The new page must not make it
worse.

## What we build

**Two ways into one edit:**

| | **Quick edit** (as today) | **Studio editor** (new, optional) |
|---|---|---|
| Where | Step 3 of the pipeline, in the panel | Its own page, `/admin/podcast/[episodeId]/studio-editor`, desktop only (1280 px and wider, U3) |
| For | Most episodes: cut fillers, pauses and words | Episodes that need more: split, transitions, overlays, music and effects, titles |
| Edits | Transcript cuts | Everything |

- Both read and write the **same** `episodes/{id}.edit`.
- The pipeline stays simple. Step 3 gains **Open the Studio editor**, and step 4 (Final cut)
  gains **Touch up in the Studio editor**.
- When an edit has Studio-only changes, the quick edit shows a one-line summary, for example
  "4 splits, 3 transitions, 12 overlays, music on 2 tracks", and still allows word cuts.
- The existing `/edit` page becomes the Studio editor. Its old URL redirects to the new one.

## Layout

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Episode · Title · 41:12 (saves 7:41) · ✓ Saved    Undo Redo   ? Shortcuts   Render ▸       │
├───────────────────────┬──────────────────────────────────────────┬─────────────┬─────────────┤
│ SCRIPT                │ PREVIEW (16:9, scales to fit)            │ PANEL       │ RAIL        │
│ Tom Wood 0:19         │ ┌──────────────────────────────────────┐ │ (one of:)   │ Media       │
│ I haven't seen you…   │ │ video + overlays + captions          │ │ Media bin   │ Elements    │
│ ‹um› ‹pause 1.4s›     │ │ overlays drag and resize here        │ │ Elements    │ Transitions │
│ Search · Suggestions  │ └──────────────────────────────────────┘ │ Transitions │ Captions    │
│ (filler, pause,       │ ◀◀ ▶ ▶▶ 0:19.4 / 41:12 Edited|Orig.      │ Captions    │ Properties  │
│  Tighten: accept all) │ Speed 0.75–2×  Captions on/off           │ Properties  │ AI          │
│                       │                                          │ AI tools    │             │
├───────────────────────┴──────────────────────────────────────────┴─────────────┴─────────────┤
│ TOOLS  Select(V) Blade(B) Ripple ✓ Snap ✓   Zoom ─●──── Fit                                  │
│ RULER  0:00 ·····0:10 ·····0:20 ·····0:30 ·····                                              │
│ V3 Titles    [Lower third: Daniel Endy]                 [Title card]                         │
│ V2 Overlays  [b-roll 1]      [logo ────────────────────────────────]                         │
│ V1 Episode   [intro]⧓[part 1 ▒▒ thumbnails ▒▒]⧓[part 2 ▒▒▒▒▒▒]⧓[outro]                       │
│              ⧓ = transition (dissolve, fade, …); cuts inside parts hatched                   │
│ CC Captions  [It's been a little bit][We've been doing phone calls]…                         │
│              (the YouTube caption track, shown to check it; not burned in)                   │
│ A1 Voice     ▁▃▅▇▅▃▁▁▃▇▇▅▂ waveform ▁▂▅▇▅▃▁                                                  │
│ A2 Music     [bed ───── ducked under voice ─────]                                            │
│ A3 Effects           [whoosh]                                                                │
│              ▲ playhead                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- The panels are resizable, and their sizes are remembered per browser.
- The timeline height can be dragged.
- Track headers have mute, hide and lock.

## The edit model, version 2 (`lib/sequence.ts`)

Today an edit is `EpisodeEdit` in `lib/edit.ts`:
`{ cuts, version, splits?, overlays?, captions? }`, saved as `episodes/{id}.edit` and checked
field by field in the edit route. Version 2 **grows that type**; it is not a second document.
**An edit saved today is a valid version 2 edit.**

```ts
interface Sequence {               // = EpisodeEdit, grown
    version: number;               // save version, checked as today (409 when stale)
    cuts: Cut[];                   // source-time cuts from the transcript, as today
    splits?: number[];             // as today (#130): split points, ms in the original, sorted; the
                                   // parts are the stretches between them, in source order (U4)
    joins?: Join[];                // transitions where sections and parts meet; missing = straight cuts
    layers?: Layer[];              // pictures and text over the episode; grown from today's `overlays`
    audio?: AudioItem[];           // music, effects, stingers
}
// E9 (moving clips) adds `order?: number[]`, the parts in play order, when Tom approves it.
type JoinAt = 'start' | 'afterTeasers' | 'afterIntro' | 'beforeOutro' | 'end' | { atSplit: number };
interface Join { at: JoinAt; transition: TransitionKind; durationMs: number }   // see Transitions
type Anchor = { srcMs: number } | { atMs: number };   // stick to the words, or pin to the timeline
interface Layer {
    id: string; track: number;     // V2, V3, …
    kind: 'image' | 'video' | 'text' | 'lowerThird' | 'logo';
    mediaId?: string; text?: string; style?: string;
    anchor: Anchor; durationMs: number;
    box: { x: number; y: number; w: number; h: number };   // fractions of the 1920×1080 frame
    opacity: number;
    in: { transition: LayerTransition; durationMs: number };    // 'fade' (default), 'none', or a slide/wipe
    out: { transition: LayerTransition; durationMs: number };
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

**From today's edit:**
- **`splits` stay as they are.** While parts keep their source order (U4), a sorted list of split
  points says exactly what a `parts` array would, and edits already have them. A join at a split
  is keyed by the split's ms (`{ atSplit }`); removing a split removes its join.
- **`overlays` become `layers`.** Today's `TextOverlay` and `ImageOverlay` (`lib/onScreen.ts`)
  already have an anchor in the original (`atMs`) and a length on the edited timeline
  (`seconds`). A pure `toLayer(overlay)` turns each into a `Layer`: the nine positions become a
  `box`, `widthPct` its width, and fades default to today's look. The edit route keeps accepting
  `overlays` until every saved edit has been read and saved once as `layers`.
- **`captions`** (Part I's burned-in choice) stays as it is: off by default, an option per Studio
  or per video (`docs/PLANNING.md` N1).

**Rules:**
- **Split** (B, or S at the playhead) adds a split point. A split on its own changes nothing you
  hear. It is where a transition, a trim or (later) a move can go. **Built (#130)**, as **Split
  at the playhead** on the timeline.
- **Parts stay in source order for now** (decision U4). Dragging a part to a new place, and
  dropping a new intro or outro onto the timeline, come later as item E9, which adds `order`.
- **Ripple delete** of a part cuts its whole range, as a `manual` cut, so the transcript shows it
  struck through and double-click restores it, as today. **Built (#130)** as **Cut this section**
  and **Bring this section back** (`cutSection`, `restoreSection` in `lib/edit.ts`).
- **Trimming a part's edge** adds or shortens a cut at that edge, so the transcript shows it.
- **Anchors:**
  - A layer or sound anchored to `srcMs` moves with its words when cuts change. This is the
    default, and it is how b-roll already behaves.
  - Pinned (`atMs`) items stay at a timeline time. This is the default for music beds.
  - An item whose anchor word is cut is flagged in the timeline, not deleted.
- **Teasers, intro and outro** (Studio settings) show as locked clips before and after the
  episode, with a join between each. They are outside the episode, so splits never fall in them.
- **Existing b-roll** from the notes plan (spec 008) appears as V2 layers on first open, so it
  can be moved, trimmed or deleted. Until then the render uses the notes plan as today.
- **Validation:** zod schemas, checked on save field by field as today (`CutsSchema`,
  `SplitsSchema`, `OverlaysSchema`). At most 10,000 cuts, 500 splits, 500 joins, 500 layers
  (today 100 overlays) and 200 sounds, which keeps the document well under Firestore's 1 MiB.

**Pure functions, all in `lib/` and tested:**
- `playOrder(seq)`: the kept source ranges in play order (`keepRanges`, split at `splits`).
- `timelineTime(seq, srcMs)` and `sourceTime(seq, atMs)`: generalize `editedTime`. They take
  account of the time each transition overlaps (see Transitions), and of moved parts once E9
  exists.
- `itemsAt(seq, atMs)`: what is visible and audible at a moment. Both the preview and the render
  plan use it, so they cannot disagree.
- `sectionAt`, `cutSection`, `restoreSection` (built, `lib/edit.ts`), and `trimSection`,
  `setJoin`, `moveLayer`, `snap(…)`.

**Transitions shift times.** A transition overlaps the two clips it joins, so the programme is
shorter by its length (measured: two 4 s clips with a 1 s dissolve make 7 s). These all move to
`timelineTime` so chapters, quotes and captions stay on their words:
- `applyToChapters`, `applyToQuotes` and `editedWords`;
- the Editor Light `.srt` and the YouTube caption track made from it;
- the final-cut words (spec 018's "Editor Light as the final cut");
- the offset `editRender.ts` adds for teasers and the intro.

## The preview

The preview layers HTML over the 720p proxy. It is not a second renderer:
- **The episode** plays in one `<video>`, or two for smooth joins (019 item 4.3). It seeks
  through `playOrder`.
- **Transitions** are drawn with the second `<video>` (or the intro, outro or teaser file) and CSS:
  - **dissolve:** opacity of one over the other;
  - **fade:** a black layer whose opacity rises and falls;
  - **wipes and slides:** `clip-path` and `transform`.

  The render's ffmpeg version can look slightly different; the shapes and timing are the same.
- **Layers** are absolutely positioned `<img>`, `<video>` or text inside the 16:9 stage, at the
  same fractional `box` the render uses.
  - Text uses the fonts the render uses: Outfit is already loaded on the site, and the same
    files are in `agent/assets/fonts`.
  - Selected layers get drag and resize handles from **react-rnd** (MIT). Positions are snapped
    to the frame edges, the centre and thirds.
- **Sounds** play in `<audio>` elements kept in step with the playhead. Ducking is approximated
  with Web Audio gain while a word is spoken.
- **Captions on/off** shows the YouTube caption track's cues over the preview, so the producer can
  check them. They are not burned into the video unless the burned-in option is on (U1, N1).
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
transition effects, lower-third styles and title cards.
- Only admins add to it.
- Files come from free and royalty-free sources, downloaded by hand. None of them has a usable
  API for a commercial Studio. The shortlist and terms are in
  `docs/research/2026-10-05-free-music-and-effects.md`:
  - music: Pixabay, Mixkit, Incompetech, Freesound CC0;
  - effects: Sonniss GDC bundles, Mixkit, Freesound, Pixabay, Zapsplat.

## Music and sound effects: licences

The team checks every licence by hand (decision U2). The library makes that check stick:

- **Each music or effects file records:**
  - source URL and author;
  - licence name and URL;
  - download date, and a snapshot of the licence page (PDF or image, stored beside the file);
  - any certificate or credit code;
  - the credit text, if needed;
  - **checked by** and **checked on**.
- **A file nobody has checked shows "Licence not checked"** and cannot be placed on the timeline
  or rendered.
- **Refused at upload, by licence field:** anything marked NC (non-commercial) or ND
  (no derivatives), and YouTube Audio Library tracks (YouTube only).
- **Credits are automatic.** When a rendered episode uses a file with credit text, the credit is
  added to the end of the YouTube description (`youtubeDescription` in `lib/showNotes.ts`), and to
  the podcast feed's notes once 019 item 5.1 exists.
- **Every use is logged** (episode and Short) on the library entry, so a Content ID claim can be
  traced to its licence proof.

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
- the transition in and out (fade by default) and its length;
- motion (Ken Burns, pan);
- volume and ducking for sounds;
- text and style for text.

**Captions:** the YouTube caption track, uploaded as today (spec 012); nothing is burned in
unless Part I's option is turned on (decision U1, and N1 in `docs/PLANNING.md`). The panel lists its cues on the edited timeline:
- click a cue to jump there;
- a wrong word is fixed in the script (019 item 2.3), which fixes the caption too;
- a cue too long to read flags in amber.

## Transitions

**Where they go:**
- at each **join**: start of programme, between teasers, teasers → intro, intro → episode, at a
  split between two parts, episode → outro, end of programme;
- on each **layer's** way in and out (overlays, titles, logo).

The tiny cuts inside a part (fillers, pauses) stay straight cuts with the 15 ms sound fades the
render already uses. A transition at every "um" would look odd and slow the render.

**What the producer sees:**
- a ⧓ marker on V1 at each join; click it, or drop a transition from the **Transitions** panel
  onto it;
- choose the kind and length (0.2–3 s, 0.5 s by default);
- a default for section joins (teasers, intro, outro) in Studio settings, so most episodes need no
  clicks. **The default is "Cut"**, as the render does today, until the producer chooses
  otherwise.

**Kinds.** Every one below was rendered with the runners' ffmpeg 6.1.1 (`xfade` for video,
`acrossfade` for sound) on 5 October 2026. Names are what editors call them; ffmpeg's own names
differ.

| Studio name | ffmpeg | Notes |
|---|---|---|
| **Cut** | (none) | The default. |
| **Dissolve** | `xfade=transition=fade` + `acrossfade` | Required. A smooth cross-dissolve. ffmpeg's `dissolve` is a grainy pixel effect; use it only as "Grain dissolve". |
| **Fade** (through black) | `xfade=transition=fadeblack` + `acrossfade` | Required. At the start and end of the programme it is a fade from or to black: `fade` + `afade`. |
| Fade through white | `fadewhite` | |
| Grain dissolve | `dissolve` | |
| Wipe left, right, up, down | `wipeleft` … `wipedown` | |
| Slide left, right, up, down | `slideleft` … `slidedown` | |
| Soft wipe left, right, up, down | `smoothleft` … `smoothdown` | Feathered edge. |
| Circle open, close | `circleopen`, `circleclose` | |
| Zoom in | `zoomin` | |
| Blur | `hblur` | |

ffmpeg 6.1.1 has 58 kinds in all (`ffmpeg -h filter=xfade`). The list above is the set worth
showing; more can be added by name later.

**Layers** use opacity for **fade** (the default) and the overlay's x/y for **slide**; `none`
pops on and off. That keeps layers cheap to render.

**Length and time.** A transition overlaps the clips on both sides, so it shortens the programme
by its length. The trailing clip starts that much earlier, and so do its words. `timelineTime`
handles this (see the edit model), and a join whose transition is longer than either neighbouring
clip is refused.

**Sound.** Each video transition has an `acrossfade` of the same length (triangular curves) so
the voices blend instead of clicking. Music and effects tracks are not affected.

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
  - text, lower thirds and titles go into one ASS file drawn with `ass=`, as `shortsRender.ts`
    does, with the fonts from `agent/assets/fonts`. Captions are burned in only when the option
    is on (U1, N1).
- **every join's transition:** `xfade` and `acrossfade` instead of `concat` where a join has one,
  with `offset` = the leading clip's length minus the transition. Straight cuts stay `concat`.
  A split with a transition becomes a block boundary, so each block still encodes on its own.
- **every sound**, with `atrim`, `adelay`, `volume` and `afade`:
  - ducking is `sidechaincompress` keyed by the voice;
  - everything is mixed with `amix`, before the clean-up of the voice track only and before
    loudness.

The teasers, intro and outro assembly keeps its order, with joins between them. Tests check the
graph string for a small sequence. A flash-and-beep clip with a split and a dissolve must stay in
sync (spec 015's check), and its length must equal the parts minus the transition.

## Building it (rows E1–E9 in 019's table)

| # | Item | Effort | Model effort | Needs |
|---|---|---|---|---|
| E1 | **Workspace shell.** The layout above, with resizable panels and the shortcut sheet. The existing full-page editor (#123: script, preview with overlays, On screen panel, timeline, help) moves into it, nothing new yet. `/edit` redirects here. Quick edit stays in step 3. | S–M | High | — |
| E2 | **Timeline engine.** Tracks, virtual drawing, zoom and scroll, snapping, selection. Waveform and thumbnail sprites (019 items 2.1 and 2.2 are built here). Drag cut edges; time-range cuts. | L | Extra | E1 |
| E3 | **Split and trim.** Split, cut a section and bring it back are built (#130, `edit.splits`). Left: the blade tool, dragging a section's edge to trim (as cuts), `lib/sequence.ts` with `playOrder` and `timelineTime` everywhere times are mapped, and splits drawn on the new timeline. | S | Extra | E2 |
| E4 | **Transitions.** Joins with Cut, Dissolve and Fade first, then the rest of the table. Section defaults in Studio settings. Preview with CSS; `xfade` and `acrossfade` in the render; times shifted by the overlap. | M | Extra | E3 |
| E5 | **Media and overlays.** Image overlays are built (#130: upload, nine positions, width, preview, render). Left: `overlays` → `layers` (`toLayer`, a free box), episode bin and video and audio uploads, transitions in and out, motion, dragging and resizing on the preview with react-rnd, dragging and trimming on the timeline. Existing b-roll becomes layers. | L | Extra | E3 |
| E6 | **Elements.** Text with a second line and **Name titles** per speaker are built (#130, ASS render). Left: title card, lower-third style from Studio branding, logo bug, and the Properties panel. Built (#159). | M | High | E5 |
| E7 | **Music and effects.** Show library with the licence record and "not checked" gate, and audio uploads. Credits added to the YouTube description. Music, effects and stingers with gain, fades and ducking. Preview mixing; `amix` and `sidechaincompress` in the render, starting from Part H's `musicMix` (Jo Ann H, `bc5b006`, not merged; credit her). No composed music or AI video (`docs/PLANNING.md` N2). Built (#160). | M | High | E5 |
| E8 | **Captions track and polish.** The YouTube caption track on the timeline and in the Captions panel (not burned in). Part I's burned-in option stays as an on/off choice in the Captions panel (`docs/PLANNING.md` N1). Copy and paste items. J/K/L. | M | High | E6 |
| E9 | **Later: move clips.** Drag parts to a new place on V1, and drop a new intro or outro onto the timeline. Every time mapping follows the new order; chapters stay in order. | L | Extra | E4, and Tom's go-ahead |

### E1 — Built (#143)

- **Route:** `/admin/podcast/[episodeId]/studio-editor`. `/edit` is now a server redirect to it, so old
  links and bookmarks still work. The notes page's link reads **Open the Studio editor →** (in the Edit
  package preview and in the Editor Light Edit step).
- **Layout:** `components/studio/workspace.tsx` (`Workspace`), filled by `Editor` when `workspace` is
  set. Nothing in the editor was rebuilt: its JSX was split into named pieces (suggestion tools, search,
  review row, video, play controls, transcript), and the quick edit puts the same pieces back in its old
  order.
  - **Bar:** ← Episode · title · length · edited length and time saved · save state · Undo · Redo ·
    **? Shortcuts** · **Render ▸** (with a few words on where the render stands).
  - **Script** (left): Mark, Clear, Claude's tighter edit, the counts per kind, search, the review row
    and the transcript.
  - **Preview** (middle): the video with the on-screen text and images, scaled to fit at 16:9, and
    the Edited / Original and speed buttons.
  - **Panel and rail** (right): **On screen** and **Render** (the render's links, player, warnings
    and quality report). Panels stay mounted, so a half-filled form survives switching. Media,
    Elements, Transitions, Captions, Properties and AI join the rail as E5–E8 build them.
  - **Timeline** along the bottom (`timeline.tsx`, unchanged).
- **Resizing:** the script, panel and timeline have dividers: drag, arrow keys (Shift: faster), or
  double-click for the default. Sizes are kept per browser (`localStorage`, `studio-editor-panes`).
  `lib/workspace.ts` (`clampPanes`, `fitPanes`, tested in `lib/workspace.test.ts`) keeps them within
  limits and lets the script, then the panel, give way so the preview keeps at least 360 px.
- **Shortcut sheet:** **?** (the key or the button) opens it, Esc closes it.
- **Desktop only (U3):** under 1280 px a note at the top points to the quick edit.
- **Not yet:** step 4's **Touch up in the Studio editor**, and the one-line summary of Studio-only
  changes in the quick edit, come with the first Studio-only changes (E4). Built in E4.
- **Checked:** in Chromium at 1440×900 and 1280×720 with a test video: the layout fills the window
  with no page scroll, a dragged size survives a reload, the sheet opens and closes, the rail switches
  panels, and the quick edit is laid out as before. Not yet on the real 48-minute episode (Tom, on
  staging).

### E2 — Built (#144)

- **Ingest makes the timeline's media** (`agent/src/podcast/timelineMedia.ts`, beside the silences):
  - **Peaks** (019 item 2.1): `audio.m4a` decoded to 8 kHz mono; the lowest and highest sample of every
    10 ms as two bytes (`lib/peaks.ts`), saved as `analysis/peaks.bin` (`media.peaksPath`), about 720 KB
    an hour and a few seconds to make. The bytes are **µ-law**, not linear, so quiet sounds keep their
    detail: a breath fills about a quarter of the lane instead of one pixel.
  - **Thumbnails:** one frame every 5 s from the proxy, 160×90, a hundred to a 1600×900 JPEG
    (`analysis/thumbs_N.jpg`), listed in `analysis/thumbs.json` (`lib/thumbs.ts`, `media.thumbsPath`).
    Decoding the proxy takes about a minute and a half for a 49-minute episode.
  - Neither fails an episode. Each ingest run fills in older episodes: peaks with the silences (20 a
    run), thumbnails 5 a run. **After promoting, run Podcast Ingest once by hand**, as for the silences.
- **The editor reads them** through `GET /api/studio/episodes/[id]/timeline` (6-hour links to the sheets,
  and whether peaks exist) and `GET /api/studio/episodes/[id]/peaks` (the bytes, passed through the
  server because the bucket's CORS would refuse the browser's fetch). Both call `requireRole`.
- **The timeline** (`components/studio/timeline.tsx`; the pure parts in `lib/timeline.ts`):
  - **Tracks**, with headers: **V2 On screen** (markers; the eye hides them in the preview only),
    **V1 Episode** (thumbnails, with the speakers' colours in a band under them; the lock stops the
    timeline changing cuts) and **A1 Voice** (the waveform; the speaker icon mutes the preview).
  - **Virtual drawing:** one canvas the width of the view, drawn only for what is in view, cuts
    included: no element per cut. A scroller as wide as the recording gives the native scrollbar and
    trackpad scrolling.
  - **Zoom** from the whole recording to 2 ms a pixel (500 px a second): −, +, a slider, **Fit**, the
    + and − keys, and Ctrl or ⌘ with the scroll wheel (at the pointer). The buttons, slider and keys
    zoom around the playhead when it is in view. The plain wheel scrolls along.
  - **The playhead** redraws by itself every frame while playing. When the video moves it out of view,
    the view follows (a third of the way in), except for 3 s after the producer scrolls by hand.
  - **Snapping** within 8 px to the playhead, word edges, cut edges and splits, otherwise to 10 ms
    steps. The **Snap** box turns it off; Alt turns it off for one drag.
  - **Cut edges** (019 item 2.2): drag either edge of a cut that is at least 8 px wide on screen (or
    the selected one). The edge stops at the nearest word that is heard and never lands inside one
    (`edgeLimits`, `clampToWords`); Alt frees it. The cut becomes the producer's own (`manual`), so
    marking again or **Clear these** leaves it alone. A whole drag is one undo step: the timeline keeps
    a draft while dragging and saves once.
  - **Time-range cut:** drag on the waveform to select a stretch; Delete, or **✂ Cut**, cuts it as
    `manual`; **▶ Play** plays it. Its edges snap and keep out of words as above.
  - **A cut:** click it to select it; the tool row shows its times, length and kind, **▶ Hear** (2 s
    either side) and **Bring back** (or double-click the cut).
  - **Keys** (also in the shortcut sheet): ← → a frame (Shift: a second), + and −, Esc clears the
    selection. The tool row stays on one line, so the lanes never move under the pointer.
  - The section controls of #130 (Split, the section under the playhead, Cut section, Bring section
    back) stay in the tool row until E3 grows them.
- **Checked:** unit tests (`lib/peaks.test.ts`, `lib/thumbs.test.ts`, `lib/timeline.test.ts`,
  `agent/src/podcast/timelineMedia.test.ts`). In Chromium with a 3-minute test video and the peaks and
  thumbnails ingest made from it, at 1440×900 and 1280×720: dragging an edge (one undo step), selecting
  a stretch and pressing Delete, double-clicking a cut back, scrubbing the ruler, the wheel, zooming to
  2 ms a pixel, the view following playback, the arrows, lock, mute and hide, with no page errors and
  no page scroll. With an edit the size of the 49-minute episode (5,265 words, 1,317 cuts, full-length
  peaks), each scroll or zoom step drew within two frames in the development build. **Not yet on the
  real episode:** its peaks and thumbnails need an ingest run from `main`.
- **Not in E2:** the Blade tool and trimming a section's edge (E3); dragging on-screen items (E5).

### E3 — Built (#145)

- **`lib/sequence.ts`:** `playOrder(edit, durationMs, words)` gives the kept stretches in play order
  (`keepRanges`), each with `atMs`, its place in the edited episode. `timelineTime`, `sourceTime` and
  `sequenceLength` map through it. A kept range may now carry `atMs` (`KeptRange` in `lib/edit.ts`), and
  `editedTime` and `editedDuration` follow it, so `applyToChapters`, `applyToQuotes`, `editedWords`,
  `placeOverlays` and the render's on-screen checks all follow a stretch that starts early. Without
  transitions nothing changes: each stretch starts where the one before ends. Tested against
  `keepRanges` and `editedTime`, and with an overlapped pair such as E4's transitions will make.
- **The render** (`editRender.ts`) maps every time through `playOrder`: b-roll, on-screen items,
  captions, the final cut's words, chapters, quotes and its length. E4 only has to make `playOrder`
  overlap the stretches at a transition, and join them in the render.
- **Splits on the timeline:** the sections between splits show as clips on V1, with a gap at each split
  and a bracket at each end of what is kept of them.
  - **Blade** (B, or the tool button): click V1 or A1 to split there. It snaps as drags do and lands
    between words unless Alt is held. **Select** (V) goes back. **✂ Split** (S) still splits at the
    playhead.
  - **Trim:** drag a bracket on V1. Moving a section's end in cuts from where its kept part ended, as
    the producer's own cut; moving it out brings that stretch back (`trimSection` and `keptBounds` in
    `lib/edit.ts`). It snaps, stops between words unless Alt is held, and keeps at least 100 ms. At a
    split, the section on the pointer's side is trimmed. A whole drag is one undo step.
  - **Select a section:** click it on V1, once there are splits. The tool row shows its times, length
    and how much of it is cut, with **Cut section**, **Bring back**, and Delete to cut it whole. This
    replaces #130's "section under the playhead".
  - With the episode locked (V1's lock), the Blade, trims and the split handles are off.
- **Checked:** unit tests (`lib/sequence.test.ts`; trimming, kept bounds and sections in
  `lib/edit.test.ts`); the render tests pass unchanged. In Chromium with a test video: a Blade click at
  10 s split at 10.05 s (a word's start); dragging that section's bracket cut from the split to 10.60 s
  (the next word's start); selecting a section and pressing Delete cut it whole, and undo brought it
  back; locked, the Blade did nothing.

### E4 — Built (#147)

- **Model** (`lib/transitions.ts`): `edit.joins`, one transition a place. `at` is a section join
  (`start`, `betweenTeasers`, `afterTeasers`, `afterIntro`, `beforeOutro`, `end`) or `{ atSplit }`;
  `transition` is one of 21 kinds (Cut, Dissolve, Fade, Fade through white, Grain dissolve, wipes,
  slides, soft wipes, circles, Zoom in, Blur), with ffmpeg's `xfade` names in `XFADE`; `durationMs`
  is 0.2–3 s. The edit route checks them (`JoinsSchema`, up to 500) and drops one whose split is gone;
  removing a split in the editor removes its transition. `JoinAt` gained `betweenTeasers`, which "Where
  they go" lists but the sketched type left out.
- **Studio settings** (`joins`, spec 018): a transition for each section join, for every episode, all
  straight cuts by default. The episode's own wins (`sectionJoins`).
- **Time** (`sequenceOf` in `lib/sequence.ts`): at a split with a transition, the part after it starts
  that much before the part before it ends, so the episode is shorter by its length and every time
  after it moves earlier (chapters, quotes, captions, the final cut's words, on-screen items, b-roll).
  A transition longer than either part, or than what a part has left after the transition at its
  other end, plays as a straight cut, and the panel and the render's warnings say why. A split within
  100 ms of a kept stretch's edge leaves no sliver. Before the episode, the teasers' and intro's
  transitions move its start (the words', chapters' and quotes' offset) earlier; the outro's
  shortens the end.
- **Render** (`editRender.ts`): blocks never cross a transition's split, and each part's blocks become
  one file. The parts are joined with `xfade` and `acrossfade` (triangular), or a concat for a
  straight cut (`chainPieces`); so are the teasers, intro, episode and outro, each first cut to whole
  frames, so every offset is exact. At the very start and end any transition is a fade from or to
  black (`fade` and `afade`; white for Fade through white). It builds on #146, which made every kept
  stretch whole frames from the edit's own times.
- **Studio editor:**
  - **Transitions** panel on the rail: each split's transition (click its time to jump there), and the
    section joins, showing the Studio's choice until the episode picks its own. Dissolve and Fade come
    first. One with no room says why.
  - **Timeline:** a ⧓ marker on each split, amber with a transition (dim when it has no room); click it
    to open the panel at that split. The stretches a transition overlaps are shaded.
  - **Preview** (`TransitionPreview`): a second video plays the start of the next part over the end of
    the one before, drawn for the kind with CSS (opacity, a black or white veil, `clip-path`, a mask or
    a slide), with the sound crossfading; the main video then carries on from the end of the
    transition (`previewRanges`). Only transitions at splits are previewed: the preview has no teasers,
    intro or outro.
  - The bar's edited length counts transitions.
- **Pipeline** (deferred from E1): the quick edit shows a line when the edit has Studio-only changes
  ("Also in this edit, from the Studio editor: 2 splits, 1 transition, 3 on-screen items";
  `studioOnlySummary`), and the final cut step has **Touch up in the Studio editor →** when Editor
  Light makes the final cut.
- **Checked:**
  - Unit tests (`lib/transitions`, `lib/sequence`, `lib/studioSettings`, the render job's plan).
  - ffmpeg render tests: a 1 s dissolve at a split between red and blue turns 10 s into 9 s, is an
    even blend at its middle, keeps the flash and beep after it together, and moves the words 1 s
    earlier; an intro → episode dissolve, an episode → outro fade and fades at both ends turn
    2 + 3 + 2 s into 6 s with black at the start, and move the words to 2.5 s; a transition longer
    than the clip it joins plays as a cut, with a warning.
  - Chromium, with a test video: the split's marker opened the panel; a 1 s Dissolve shortened the
    edited length from 2:56 to 2:55 and lit the marker; After the intro showed "Studio setting:
    Dissolve, 0.5 s" until Fade was chosen; playing across the split faded the second video in and
    carried on 1 s later; removing the split removed its transition; the quick edit showed its line.
  - **Not yet on a real episode, or in a render from `main`.**
- **Not built:** previewing the teasers', intro's and outro's transitions. The quality report's black
  picture check may flag a long Fade (through black) at a split, since its middle is black.

### E5 — Built (#157)

- **Model** (`lib/layers.ts`, tested in `lib/layers.test.ts`): `edit.layers`, grown from `overlays` as PLANNING decided
  ("add box beside the nine positions"), in the sketched type's spirit with two changes:
  - **Place, not a full box:** `place: { x, y, align }`, the point of the frame (fractions) that one of the layer's nine
    points is pinned to (`align`, 1 bottom left … 9 top right, as ASS and the nine positions number them), and for
    pictures `w`, the width as a share of the frame. A picture's height follows its own shape, and text has no box, so
    neither needs an `h`. Today's nine positions are exactly such places (`placeOf`), so nothing moves.
  - **Kinds:** `image`, `video` and `text`. Lower thirds, logos and title cards came with E6, as text and images
    with a style (see "E6 — Built").
  - Each has an `anchor` (`{ srcMs }` moves with its words, the default; `{ atMs }` stays at a time in the edited
    video), `durationMs` (at least 0.5 s), `opacity`, `in` and `out` (`fade`, `none`, or a slide left, right, up or
    down, 0–3 s), a still's `motion` (none, slow zoom in or out, slow pan: the b-roll's Ken Burns, which fills a 16:9
    box), and a video's `trimInMs` and `volumeDb` (its own sound under the voice; null: silent, the default).
  - `track`: V2 pictures and video, V3 text. At most 500 layers (`LayersSchema`), ids unique.
- **From today's edit:** `toLayer` converts each overlay to the same place, time and look (text 90 px and 80 px in,
  fading over 250 ms; pictures 60 px in, popping on); `layersOf` reads `layers`, or the overlays converted until there
  are layers. The Studio editor, on opening an edit without layers, adds the notes plan's b-roll as layers too
  (`brollLayer`: the whole frame, slow zoom in, half-second fades, as the render drew it). That is saved with the
  producer's next change; until then the render draws the b-roll from the notes plan as before. If the media bin does
  not load, layers cannot be changed, so a save can never drop the b-roll. Once saved as layers, `overlays` is empty.
- **The media bin** (`lib/server/mediaBin.ts`, `GET/POST/DELETE /api/studio/episodes/[id]/media`, all with
  `requireRole`): the notes plan's b-roll stills, the edit package's teaser clips, the intro, the Studio's logo, and
  uploads. Uploads are a new kind, `media` (`lib/server/uploads.ts`): pictures up to 20 MB (PNG, JPEG, WebP), video up
  to 2 GB (MP4, MOV), sounds up to 200 MB (MP3, M4A, WAV), each checked by type, size and first bytes; kept at
  `episodes/{id}/media/` and listed in the episode's `media` subcollection (Admin SDK only; at most 300). The browser
  measures each one first (a picture's size, a video's or sound's length). An upload the saved edit uses cannot be
  removed. **The edit route takes a layer's file only from the bin** (or an overlay upload of Part I, checked as
  before), and GET links every file the layers use.
- **Studio editor:**
  - **Media** panel (first on the rail): the bin by group, **+ At playhead** (b-roll also **+ As planned**), drag an
    item onto the timeline, upload, remove an upload. Sounds are listed but placed with E7.
  - **Preview** (`components/studio/layers.tsx`): every layer at its place and time, with its fades, slides, slow zoom
    and opacity, every frame while playing; a video layer plays in step with the episode. Click one to select it; drag
    the selected one to move it (its pinned point snaps to the edges, the 60-pixel margins, the thirds and the centre;
    Alt turns that off); drag its corner to resize a picture. Full-frame pictures let clicks through to the video's
    controls unless selected.
  - **On screen** panel: the captions choice as before, **+ Text** and **+ Name titles**, and every layer with its
    time (**Start at** the playhead, its length), anchor, position (the nine, or "where you dragged it"), width, motion,
    a video's start and sound, opacity, and In and Out. A layer whose moment is cut says so.
  - **Timeline:** **V3 Text** and **V2 Pictures** lanes. Click a layer to select it (the tool row shows its times,
    **Remove**); drag it to move it; drag an end to trim it; snapping to the playhead, word edges and splits (Alt or
    **Snap** off). Delete removes the selected layer. Each drag is one undo step.
- **Render** (`editRender.ts`): pictures in track order, then by start: a still is looped for its length, a moving still
  is made a clip with the b-roll's `kenBurns`, a video is trimmed from `trimInMs`; each is scaled, faded
  (`fade`, alpha), made see-through (`colorchannelmixer`), and laid over with `overlay` at its place, a slide being a
  time expression in the overlay's `x` or `y` (`pictureFilter`, `overlayXY`). A video's sound, when on and present
  (`hasAudio`), is trimmed, set to its level, placed (`adelay`) and mixed under the voice with `amix` (normalize off),
  before loudness. Text goes in the ASS file with `\an` and `\pos` (the same spot the nine positions gave), `\fad`,
  `\alpha`, and `\move` for slides (`textEvents`, `layersAss`). The quality report's on-screen checks read anchors
  (a pinned layer is never "in a cut"). The old overlay-only helpers (`buildAss`, `imagePlacement`,
  `imageOverlayFilter`, `placeOverlays`) were removed.
- **Not as sketched:** **react-rnd** and **@dnd-kit/core** were not added. react-rnd's dragging relies on
  `findDOMNode`, which React 19 removed; the preview's drag and resize are Pointer Events with pointer capture, as the
  timeline's are, and the bin uses the browser's own drag and drop. No new dependencies.
- **Checked:**
  - Unit tests: `lib/layers.test.ts` (conversion, schema, times, preview looks, filters, ASS, the bin's defaults),
    `renderQc`, `sequence`, `transitions`.
  - ffmpeg: the existing on-screen render test now runs through layers and keeps its pixel checks (caption, text,
    image where and when they were); `agent/src/podcast/layersRender.test.ts` renders a video layer sliding in from the
    right with its 1 kHz tone mixed in only while it is up, a still with a slow zoom filling the frame, and a
    half see-through picture, all after a cut.
  - Chromium, with a test video and bin: an old edit's text title showed as a layer; **+ At playhead** put a picture
    60 render pixels in from the top right at 20% width; dragging it snapped to the centre line; its corner resized it
    (20% → 34%); on the timeline it moved and trimmed; a b-roll still dropped onto the timeline became a full-frame layer
    with a slow zoom; **Slide left** was set in the panel; Delete removed a layer and Ctrl+Z brought it back.
  - **Not yet on a real episode, or in a render from `main`.**

### E6 — Built (#159)

- **Elements** (`lib/layers.ts`, tested in `lib/layers.test.ts`) are layers with a style, not a new kind, so the render,
  preview, timeline and quality report needed nothing new to place and time them. A layer records what it was added as
  (`element`: `title`, `lowerThird` or `logo`), for its name in the panels and on the timeline. In the Studio's look
  (`Brand`, `brandOf` in `lib/studioSettings.ts`): the captions' font, the brand's background and accent colours, and
  the hosts.
  - **Title card** (`titleCard`): centred, huge, in the accent colour on a band of the brand's background, a white
    second line, 4 s, half-second fades.
  - **Lower third** (`lowerThird`): a name in white and a role in the accent colour on a band of the brand's background,
    in the lower left 120 px up (clear of the captions), sliding in and fading out, 5 s. **For every speaker**
    (`lowerThirds`) adds one where each speaker first talks, from the transcript's names; hosts in Studio settings get
    the role "Host", others none; a speaker with a text layer of their name already is left out, so pressing it twice
    adds nothing. Part I's **Name titles** button became this.
  - **Logo bug** (`logoBug`): the Studio's logo, or the site's (`public/logo.png`, as Shorts and thumbnails use) when
    none is uploaded; 8% wide in the top right, 80% solid, pinned at the start for the whole episode (`WHOLE_EPISODE_MS`,
    which `layerSpan` cuts at the episode's end, however long the edit becomes). It is on track 4 (`TRACK.logo`), so it
    is drawn over full-frame b-roll; on the timeline it is a thin strip along the top of V2, so it never covers the
    b-roll under it. The site's logo is `SITE_LOGO` (`site/logo.png`): the media bin lists it when Studio settings have
    no logo, the editor shows `/logo.png`, and the render job takes the repository's file (`siteLogo`), never Storage.
  - **Text**, as before, in the Studio's font.
  - Two optional fields on text layers carry the brand: `band` (the band's colour, nearly solid, `BAND_ALPHA`; absent:
    the dark see-through band as before) and `subColor` (the second line's colour). The ASS file gives each text layer a
    style with its band as the box colour, and the second line a `\c` colour of its own. Old layers read unchanged.
- **Studio editor:**
  - **Elements** panel (`components/studio/elements.tsx`): a small sample and a button for each, added at the playhead
    (the logo at the start); once the logo bug is on, its button opens it instead. What is added opens in Properties.
  - **Properties** panel (`components/studio/properties.tsx`): the selected layer's text, font, size, colour, band and
    second-line colours (with an **Accent** button); its start (jump there, **Start at** the playhead), length or **To
    the end of the episode**, and anchor; its place as the nine positions (a 3 × 3 grid) or numbers, X and Y in render
    pixels for the point it is pinned by (`positionOf`, `marginsOf`); width (pictures); opacity; In and Out; a still's
    motion; a video's start and sound. Choosing a layer on the preview, the timeline or the On screen list opens it here.
  - **On screen** panel: the captions choice as before, and a compact list of every layer in time order (its kind,
    name, start, length, ×). The fields moved to Properties; the add buttons to Elements and Media.
  - Removing a layer from a panel keeps the keys with the editor, so Ctrl+Z brings it back.
- **Checked:**
  - Unit tests: titles, lower thirds and the logo bug against the schema, their places and colours; one lower third per
    speaker, hosts marked, never twice; the logo bug's span through cuts; the ASS band and second-line colours; old
    layers without the new fields.
  - ffmpeg (`layersRender.test.ts`): a lower third's band comes out in the brand's dark purple; the logo bug is red over
    the grey episode and stays on top of a full-frame blue b-roll still, listed first or not.
  - Render job: a logo bug of the site's logo uses the repository's file and downloads nothing for it. The quality
    report does not call a layer that lasts to the end "cut short" (`renderQc.onScreenChecks`).
  - Chromium, with a test video and bin: **For every speaker** added "Daniel Endy, Host" and "Ben Guest" where each
    first spoke, then greyed out; the lower third showed on the preview in the brand's band; Properties changed its role,
    moved it to the top right on the grid and to X 1500 by number ("Where you dragged or typed it"); a title card took
    "Chapter one" in gold on the band; the logo bug was the site's logo, on track 4, to the end, checked "To the end of
    the episode"; clicking the b-roll under the logo strip on the timeline opened the b-roll; a row in On screen opened
    Properties; Remove, then Ctrl+Z, brought the logo bug back.
  - **Not yet on a real episode, or in a render from `main`.**

### E7 — Built (#160)

- **Model** (`lib/audio.ts`, tested in `lib/audio.test.ts`): `edit.audio`, at most 200 sounds, ids unique. A sound is a file
  on **A2 Music** or **A3 Effects** with the layers' `anchor` and `durationMs` (so `layerSpan`, `startAt` and the timeline's
  drag code serve both), and `inMs` (where in the file it starts), `loop`, `gainDb`, `fadeInMs`, `fadeOutMs` and `duck`.
  `library` names its show library entry. As sketched, except `inMs` and `durationMs` in place of `inMs` and `outMs`.
  - **Music** (`newSound`): a bed pinned (`atMs`) at the playhead to the end of the episode, looped, 18 dB down, fading
    in over 2 s and out over 3 s, ducked.
  - **An effect or stinger:** anchored to its moment of the recording (`srcMs`), its own length, at full level, with
    10 ms fades against clicks, not ducked.
  - An episode upload of 30 s or more counts as music.
- **The show library** (`lib/server/library.ts`, `GET/POST /api/studio/library`, the page `/admin/podcast/library`,
  linked from the Studio as **Music and effects**). Entries are in `studio/media/items` (Admin SDK only), files under
  `library/` in Storage (upload kinds `library`, sounds up to 200 MB, and `licence`, the licence page as a PDF, PNG or
  JPEG up to 10 MB, both checked by first bytes; admins only).
  - **Each entry records** the licence (`LicenceSchema`): where it came from, author, licence name and page, download
    date, the snapshot, any code, the credit text. It also records `checked` (by whom, and on what day) and `uses`.
  - **Refused when added or changed** (`licenceProblem`): NC and ND licences, by name ("CC BY-NC", "NonCommercial",
    "NoDerivatives") or Creative Commons address, and YouTube Audio Library tracks.
  - **"I checked the licence"** needs the source, licence name and page, date and snapshot (`licenceMissing`). Any change
    to the licence takes the check away, and an admin can take it back too.
  - **A file a render used cannot be removed:** its record is that episode's proof.
- **"Licence not checked" gate:**
  - **Media panel:** library files are listed under **Show library: music** and **Show library: effects**. One that is
    not checked says so and cannot be added or dragged.
  - **Edit route:** refuses a newly placed library sound that is not checked.
  - **Render job:** leaves out a library sound whose check was taken back after it was placed, with a warning.
- **An episode's own sounds** (the E5 media bin's audio uploads): the uploader confirms the sound is theirs to use (they
  made it or own its rights). It is recorded as `rights` (who, when), and the edit route refuses one without it. Music
  from other sites goes through the library. An upload that a saved sound uses cannot be removed.
- **Studio editor:**
  - **Timeline:** **A2 Music** and **A3 Effects** lanes under A1. Click, drag to move, drag an end to trim (one undo
    step), as on V2 and V3. Each lane has a speaker to mute it in the preview; a ducked sound is marked ↓.
  - **Media panel:** **+ At playhead** or drag a sound onto the timeline.
  - **Properties panel** for a sound:
    - where it comes from (the licence and its credit, or who declared the rights);
    - track, start, length or "To the end of the episode", and anchor;
    - where in the file it starts, and loop;
    - level (dB), fades, and ducking.
  - **Delete** removes the selected sound; Ctrl+Z brings it back.
  - **Preview** (`components/studio/sounds.tsx`): an `<audio>` per sound kept in step with the video. It plays from its
    place in the file (round again when it loops), at its level with its fades, 12 dB lower while a word is spoken when it
    ducks, and silent when its track is muted. HTML volume stops at 0 dB, so a boost is heard only in the render.
  - The quick edit's line of Studio-only changes counts sounds.
- **Render** (`editRender.ts`):
  - Each sound is an input (`-stream_loop -1` when it loops), filtered by `soundFilter`: `atrim` from `inMs`, `volume`,
    `afade` in and out, then `adelay` to its start on the edited episode.
  - `soundsMix`, from Part H's `musicMix` by Jo Ann H (`bc5b006`, credited in `lib/audio.ts`), mixes the ducked sounds
    into one bed. `sidechaincompress` (threshold 0.02, ratio 6, attack 20 ms, release 500 ms), keyed by the voice, lowers
    the bed while anyone speaks: 15 dB under a voice at about −15 dBFS. `amix` (normalize off, as long as the voice) then
    adds the voice, the ducked bed, the other sounds and video layers' own sound.
  - All before the loudness pass. Sounds play under the episode only, not the teasers, intro or outro.
- **Credits and the log:**
  - The render job writes the credit lines of the library files it played, in the order they start, as
    `editRender.credits`. When the render is the final cut, they also go to `final.credits`, and the entries to
    `final.library`.
  - `youtubeMetadata` adds **Music and sound** with those lines to the YouTube description, before the hashtags.
    `shortMetadata` adds the same to every Short made from that final cut.
  - Each use is logged on its library entry: the render (`kind: 'episode'`), and each Short rendered from a final cut
    with library sounds (`kind: 'short'`).
  - The show notes page's description preview does not show the credits; they are added at upload.
- **Checked:**
  - Unit tests:
    - `lib/audio.test.ts`: the licence rules (NC, ND and YouTube refused; Pixabay, CC0, CC BY and an "Inc" author not),
      what a check needs, the defaults, the preview's level and file time, the filter and mix strings, credits;
    - the description and Short credits;
    - `studioOnlySummary`.
  - ffmpeg (`soundsRender.test.ts`): a 3 s bed loops to the end of a 10 s episode, is 15 dB lower under a −15 dBFS
    voice than in the quiet after it, and leaves the voice's level alone. An effect at 7 s of the recording plays at 6 s
    after a 1 s cut, and not before.
  - Render job: an unchecked library sound is left out with a warning and never downloaded. The checked one's credit is
    on the render and on the final cut, and its use is logged.
  - Chromium, with a test video, bin and stand-in API:
    - **Editor:** "Not checked yet" showed "Licence not checked" with no button and could not be dragged. **+ At
      playhead** put the bed on A2, pinned at 0:05, looped, −18 dB, ducked. Properties showed its licence and credit,
      and set −12 dB and no ducking. A whoosh dropped on A3 took its moment and moved when dragged. Playing from 0:06,
      the bed played at volume 0.251 (−12 dB) 2 s into its file, and stopped when A2 was muted. An uploaded jingle with
      rights went on A3; Delete and Ctrl+Z.
    - **Library page:** an NC licence was refused before adding. A file and its snapshot were sent and added with their
      licence. "I checked the licence" waited for the snapshot. Remove was off for a file a render had used, which listed
      the use.
  - **Not yet on a real episode, or in a render from `main`.** The library starts empty: an admin adds the first files.

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
- **New burned-in caption styles for full episodes** (U1). Part I's on/off option stays as built (N1); Shorts keep theirs (spec 013).

## Decisions (answered by Tom, 5 October 2026)

| # | Question | Answer | What it changes |
|---|---|---|---|
| U1 | Burned-in captions on full episodes, or only YouTube's caption track? | **YouTube caption track.** | The Captions panel and track check the YouTube track (E8). Part I's burned-in captions stay as an option, off by default (N1, 5 October 2026). |
| U2 | Music and effects: which library, and who checks licences? | **Search for free or royalty-free music and effects; the team checks licences by hand.** Two transitions are needed now, dissolve and fade; add others that are available. | Sources in "Music and sound effects" below. Transitions section and item E4. |
| U3 | Is desktop-only (1280 px and wider) fine? | **Yes.** | As planned. |
| U4 | Should moving parts be allowed? | **Not now.** Dragging clips to new places on the timeline, such as dropping a new intro or outro, will be needed eventually. | Parts stay in source order. E3 is split and trim only. Moving becomes E9, later. Overlays, titles and music are still placed and dragged on their own tracks (E5–E7), because that is how they are added. |
| U5 | Page name? | **"Studio editor".** | As planned. |
