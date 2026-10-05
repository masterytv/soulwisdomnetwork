# Spec 020: Studio editor — a full editing page beside the simple pipeline

**Date:** 5 October 2026
**Status:** Planned; parts already built (#123 the full-page editor, #130 splits and on-screen
text and images). Reconciled on 5 October 2026: the model below grows the existing
`EpisodeEdit` (see `docs/PLANNING.md`, "Overlaps"). Decisions U1–U5 answered by Tom on
5 October 2026 (see the end); N1 and N2 in `docs/PLANNING.md` are still open.
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
- **`captions`** (Part I's burned-in choice) waits on `docs/PLANNING.md` N1.

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
  check them. They are never burned into the video (decision U1).
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

**Captions:** the YouTube caption track only, uploaded as today (spec 012); nothing is burned in
(decision U1). The panel lists its cues on the edited timeline:
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
    does, with the fonts from `agent/assets/fonts`. No captions are burned in (U1).
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

| # | Item | Effort | Needs |
|---|---|---|---|
| E1 | **Workspace shell.** The layout above, with resizable panels and the shortcut sheet. The existing full-page editor (#123: script, preview with overlays, On screen panel, timeline, help) moves into it, nothing new yet. `/edit` redirects here. Quick edit stays in step 3. | S–M | — |
| E2 | **Timeline engine.** Tracks, virtual drawing, zoom and scroll, snapping, selection. Waveform and thumbnail sprites (019 items 2.1 and 2.2 are built here). Drag cut edges; time-range cuts. | L | E1 |
| E3 | **Split and trim.** Split, cut a section and bring it back are built (#130, `edit.splits`). Left: the blade tool, dragging a section's edge to trim (as cuts), `lib/sequence.ts` with `playOrder` and `timelineTime` everywhere times are mapped, and splits drawn on the new timeline. | S | E2 |
| E4 | **Transitions.** Joins with Cut, Dissolve and Fade first, then the rest of the table. Section defaults in Studio settings. Preview with CSS; `xfade` and `acrossfade` in the render; times shifted by the overlap. | M | E3 |
| E5 | **Media and overlays.** Image overlays are built (#130: upload, nine positions, width, preview, render). Left: `overlays` → `layers` (`toLayer`, a free box), episode bin and video and audio uploads, transitions in and out, motion, dragging and resizing on the preview with react-rnd, dragging and trimming on the timeline. Existing b-roll becomes layers. | L | E3 |
| E6 | **Elements.** Text with a second line and **Name titles** per speaker are built (#130, ASS render). Left: title card, lower-third style from Studio branding, logo bug, and the Properties panel. | M | E5 |
| E7 | **Music and effects.** Show library with the licence record and "not checked" gate, and audio uploads. Credits added to the YouTube description. Music, effects and stingers with gain, fades and ducking. Preview mixing; `amix` and `sidechaincompress` in the render, starting from Part H's `musicMix` (Jo Ann H, `bc5b006`, not merged; credit her). No composed music or AI video (`docs/PLANNING.md` N2). | M | E5 |
| E8 | **Captions track and polish.** The YouTube caption track on the timeline and in the Captions panel (not burned in). Part I's burned-in option is kept or removed here (`docs/PLANNING.md` N1). Copy and paste items. J/K/L. | M | E6 |
| E9 | **Later: move clips.** Drag parts to a new place on V1, and drop a new intro or outro onto the timeline. Every time mapping follows the new order; chapters stay in order. | L | E4, and Tom's go-ahead |

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
- **Burned-in captions on full episodes** (U1). Shorts keep theirs (spec 013).

## Decisions (answered by Tom, 5 October 2026)

| # | Question | Answer | What it changes |
|---|---|---|---|
| U1 | Burned-in captions on full episodes, or only YouTube's caption track? | **YouTube caption track.** | No caption styles, and nothing burned in. The Captions panel and track check the YouTube track (E8). |
| U2 | Music and effects: which library, and who checks licences? | **Search for free or royalty-free music and effects; the team checks licences by hand.** Two transitions are needed now, dissolve and fade; add others that are available. | Sources in "Music and sound effects" below. Transitions section and item E4. |
| U3 | Is desktop-only (1280 px and wider) fine? | **Yes.** | As planned. |
| U4 | Should moving parts be allowed? | **Not now.** Dragging clips to new places on the timeline, such as dropping a new intro or outro, will be needed eventually. | Parts stay in source order. E3 is split and trim only. Moving becomes E9, later. Overlays, titles and music are still placed and dragged on their own tracks (E5–E7), because that is how they are added. |
| U5 | Page name? | **"Studio editor".** | As planned. |
