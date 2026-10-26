# Spec 021: Motion graphics — branded templates and highlight moments

**Date:** 26 October 2026
**Status:** Planned. Decisions D1–D6 (end of this page) wait for Tom; the defaults written there are what
gets built if he has not answered.
**Author:** Claude, from Tom's request: "design a series of motion graphics templates that we can use in
our videos", then "when a person says something that is quotable (or a word that could be stressed), move
the person in a frame to the side and bring the quote up on the other side … a few versions … so that the
user is not bored watching a person speak the whole time."
**Design reference:** `docs/specs/021-motion-graphics/` (one file per template, from the "Soul Wisdom Motion
Templates" design canvas; its README maps each file to a template id below). **Read it before building any
template.**
**Related:** `docs/specs/020-studio-editor.md` (layers, elements E6, the timeline), `docs/specs/015-editor-light.md`
(the render), `docs/specs/007-show-notes.md` (chapters, quotes), `docs/specs/018-studio-settings.md` (colours,
logo), `docs/PLANNING.md` (gotchas; model effort).

## The problem

An episode is mostly two or three people talking in Zoom frames. The pipeline already cuts fillers, adds
teasers, the intro and outro, b-roll stills and simple text layers (title card, lower third, logo bug, all
drawn as ASS text). What it lacks:

- **A branded look in motion.** Today's title cards and lower thirds are flat text on a band. The channel has a
  strong identity (the oval logo, the star, the wings, night purple and gold) that the video never uses.
- **Moments that change the picture.** Professional interview edits break up talking heads: the speaker's
  frame slides aside and their words appear, a key word lands on screen, the picture closes on a quote.
  Nothing in the pipeline moves the episode's own picture.
- **Someone to find those moments.** The approved notes have up to twenty key quotes (spec 007), used for
  Shorts. A 50-minute episode needs more and shorter moments, and stressed single words, spread through it.

## What we build

Two parts that share one renderer.

### Part A — branded templates (graphics over the picture)

| Template id | What it is | How it is placed |
|---|---|---|
| `titleCard` | Episode title card: star blooms, title in Cinzel, "with [Guest]" | Automatically, at the start of the episode (after the intro) |
| `lowerThird` | Name and descriptor with the gold star and a drawn rule; a compact variant for hosts ("HOST") | Automatically, where each speaker first talks (replaces today's `lowerThirds`) |
| `logoBug` | The logo, top right, with a slow glint | Automatically, for the whole episode (replaces today's still logo bug) |
| `teaserTag` | "In this episode" with the speaker and a progress line | On each teaser (replaces `teaserBanner.ts`'s ASS tag in the render) |
| `chapter` | Chapter divider: numeral, "CHAPTER TWO", title | Automatically, at each approved chapter after the first |
| `pullQuote` | Full-screen quote, line by line | By hand, or as a highlight (Part B, `iris` covers the same need) |
| `keyIdea` | Side card: "KEY IDEA", a term, a one-line definition | Suggested by Claude (Part B's picker), approved in the editor |
| `endScreen` | 20 s end screen with spaces for YouTube's two video elements and subscribe button | Automatically, over the outro's last 20 s |
| `logoSting` | Logo reveal | Optional, at the start of the outro |
| `starlight` | The starlight wipe | **A transition**, added to `lib/transitions.ts` beside the `xfade` ones, not a layer |
| `short` | Shorts overlay with word-by-word captions | **Later** (D5); listed so the template contract fits it |

### Part B — highlight moments (the speaker makes room)

A highlight is a few seconds where the **episode's own picture is reframed** and words from that moment appear.
Six layouts, all with the same rhythm: full frame → move in (≈700 ms) → hold → move back (≈700 ms) → full frame.

| Layout id | The picture | The words |
|---|---|---|
| `splitQuote` | Slides left into a rounded, gold-framed window (left 110, top 140, 860×800) | Quote builds line by line on the right, speaker name under it |
| `splitWord` | Same, mirrored: window on the right | One stressed word, very large in Cinzel gold, with a star flare; the line it came from in italic under it |
| `below` | Lifts and shrinks to 76 %, rounded, gold hairline | The line under it like a caption; the key word turns gold |
| `over` | Stays full frame, dims (brightness ≈0.4), blurs (≈6 px), tinted night purple | Words pop on one at a time; the key word slams in large and gold |
| `iris` | A gold oval (the logo's shape) closes on the speaker to a point; a star flare bursts there; it reopens after | Full-screen quote on the starry sky |
| `push` | Pushed 560 px left, not cropped | A night-sky panel (780 px) sweeps in from the right: "WORTH REPEATING", the quote |

Two kinds of moment feed them: **quotes** (a sentence or two, 3–12 s: `splitQuote`, `below`, `iris`, `push`)
and **stressed words** (a word or short phrase, 1.5–4 s: `splitWord`, `over`).

## The look (from `System.dc.html`)

- **Colours:** Night `#140A2E` (grounds, bands), Aubergine `#2A1552`, Glow `#4A2F9C` (light behind the star),
  Celestial Gold `#F7C65B` (eyebrows, rules, the star), Pale Gold `#FDE68A` (a highlighted second line),
  Lavender `#DDD2FF` (supporting text), white for titles and names. Templates read the Studio settings'
  `colors` (background, backgroundBottom, accent) so another show gets its own; the others derive from them
  the way `thumbnailCanvas.ts` `applyPalette` does.
- **Type:** Cinzel 600/700 (titles, names, chapters; echoes the logo's lettering), Outfit 400–900 (labels,
  captions; already in `agent/assets/fonts` and the site), EB Garamond Italic (quotes; already installed on
  the render runner). **Cinzel is new:** add its OFL files to `agent/assets/fonts` (with the licence) and load
  all three from local files in the templates — never from Google Fonts at render time.
- **Motion:** enter with `cubic-bezier(.22, 1, .36, 1)`, 500–700 ms, rising ≈28 px out of a ≈10 px blur;
  exit by fading in ≈400 ms, no bounce; stagger 150–250 ms. Picture moves use `cubic-bezier(.65, 0, .25, 1)`.
  Holds: title 4 s, lower third 5 s, quote 6 s, end screen 20 s. Safe area: 90 px from the sides, lower
  thirds 120 px up, the teaser tag clear of YouTube's progress bar (bottom ≤ 990).
- **The signature:** the four-point star (`M12 0C12.9 8 16 11.1 24 12C16 12.9 12.9 16 12 24C11.1 16 8 12.9 0
  12C8 11.1 11.1 8 12 0Z`) appears first; everything else follows its light.

## How it works

### M1 — the graphics renderer

**Templates are plain HTML pages** in `agent/src/podcast/graphics/templates/<id>.html` (rebuilt from the
design reference: same markup, styles and keyframes; no `<x-dc>`, no `support.js`). Each one:

- reads its data from `window.GRAPHIC = { fields, colors, durationMs, width, height }`, set before the page's
  script runs (the renderer injects it; the editor's preview sets it too);
- builds its motion with the **Web Animations API** (or CSS animations it then pauses), split into an
  **in** part, a **hold** that stretches to fill `durationMs`, and an **out** part — not the review loop in
  the design files;
- exposes `window.seek(ms)` that sets every animation's `currentTime` for that moment
  (`document.getAnimations()`), so a frame can be drawn for any time, in any order;
- has a transparent background unless the template is full screen (`titleCard`, `chapter`, `pullQuote`,
  `endScreen`, `logoSting`, and the sky behind Part B's layouts);
- loads fonts from local `@font-face` files and the logo from the Studio's logo (settings `logoPath`, else
  `public/logo-trimmed.png`); no network.

**The renderer** (`agent/src/podcast/graphics/render.ts`) opens a template in headless Chromium with
Playwright, at the template's size and `deviceScaleFactor` 1, waits for `document.fonts.ready`, then for each
frame at 30 fps calls `seek` and takes a PNG screenshot with `omitBackground: true`. It pipes the frames to
ffmpeg and writes **ProRes 4444 with alpha** (`-c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le`, `.mov`).
Results are cached in Storage by a hash of (template file, fields, colors, duration, size) under
`episodes/<id>/graphics/<hash>.mov`, so a re-render only draws what changed.

**The render** (`editRender.ts`) already overlays picture and video layers through `pictureFilter`, which
keeps alpha (`format=rgba`) — so a graphic clip goes in as a **video layer with no sound**. Check that ffmpeg
decodes the ProRes alpha (it does natively; VP9 alpha would need `-c:v libvpx-vp9` on input, so don't use it).

**The workflow:** `podcast_edit_render.yml` installs Chromium for Playwright (`npx playwright install
--with-deps chromium`; the agent's `package.json` pins the Playwright version) and draws the graphics before
the render. Note the gotcha in `docs/PLANNING.md`: headless Chromium can't play H.264, which is fine here —
templates never contain the episode's video.

**The editor's preview** shows the same HTML template in a sandboxed `<iframe>` over the video, sized and
scaled like the other layers, and calls `seek` from `useVideoTime` (never from React state on `timeupdate`:
see the gotcha). What the editor shows is the file the render draws.

### M2 — Part A as layers, placed automatically

- **The model:** a new layer kind in `lib/layers.ts`:
  `{ kind: 'graphic', template: GraphicTemplate, fields: Record<string, string> }` with the base fields
  (anchor, `durationMs`, track, opacity); `in`/`out` are the template's own, so `EdgeSchema` is `none` for it.
  `fields` is checked per template (allowed keys, each ≤ 200 characters, trimmed). Tracks: graphics over the
  picture on V3 with text; the logo bug on V4 as today. Add schema, limits and tests, or every save fails
  (gotcha: "The edit route checks every field").
- **Placement** when the edit is first set up (`lib/programme.ts` `firstEdit`, `lib/server/buildEdit.ts`), only
  for episodes with no saved edit, and only when the Studio setting is on (D2):
  - `titleCard` at the episode's start, 4 s: fields from the approved notes' chosen title and the first
    non-host speaker's name;
  - `lowerThird` where each speaker first talks, 5 s (hosts compact, "HOST"; guests: name and a descriptor
    Claude suggests in M4, empty until then);
  - `chapter` at each approved chapter after the first, 3 s, numbered;
  - `logoBug` for the whole episode;
  - `endScreen` over the outro's last 20 s (or the episode's, with no outro);
  - each teaser's tag becomes `teaserTag`.
- **Elements panel** (spec 020 E6): each template can be added at the playhead; Properties edits its fields.
  The old ASS title card and lower third stay available as "Simple" (D1).
- **Starlight** joins the transitions list (`lib/transitions.ts`): the render overlays the `starlight` clip
  centred on the join (the panel covers the frame at its middle, so the cut happens under it); the preview
  shows it the same way.

### M3 — Part B: reframing the episode's picture

A highlight is a new layer kind, `{ kind: 'highlight', layout, words, emphasis, speaker }`, on its own lane
(**V1+**, drawn on the timeline just above V1). Its span is computed like every layer (`layerSpan`), anchored at
`srcMs` on its first word.

**Rules the edit route enforces:** highlights don't overlap each other; one lasts 1.5–15 s; it can't sit on a
teaser, the intro or the outro, and its words must be kept (not in a cut). A highlight on top of a b-roll layer
is allowed but warned in the quality report (the b-roll hides it).

**How the render reframes** (the hard part; Extra effort): for each highlight span, inside the episode's
window encode (spec 019 item 4.2, `renderWindows.ts`):

1. **Background:** a still drawn by the template (the sky), looped for the span.
2. **The picture:** the episode's frames for the span, moved by **keyframes the template declares**:
   `window.GRAPHIC_LAYOUT = { from: Box, to: Box, inMs, outMs, ease }`, where a `Box` is
   `{ x, y, scale, crop: {l,t,r,b}, radius, shape: 'rect' | 'ellipse', brightness, blur }`. The renderer turns
   them into ffmpeg expressions over `t` (`crop`, `scale` with `eval=frame`, `overlay` x/y, `eq` brightness)
   using the same cubic-bezier, approximated by a short lookup table if needed; tests compare the expression
   to the curve at sampled times.
3. **The mask:** the window's shape (rounded rectangle, or the closing oval for `iris`) is drawn by the template
   as a **matte clip** (white shape on black, same timing) and applied with `alphamerge`, so ffmpeg never has to
   draw rounded corners. `over`'s blur is a crossfade between the sharp picture and a `boxblur`red copy, by the
   same curve.
4. **The graphics:** the template's own clip (words, frame line, flare) with alpha, on top.

Outside the span the picture is untouched; the sound is never touched. The quality report (019 item 0.2) adds a
plan check: every highlight inside the programme, not across a join, words kept.

**In the editor:** the preview reframes the `<video>` element itself with the same keyframes (CSS
`transform` and `clip-path`, driven by `useVideoTime`) and plays the template's iframe over it. The
Properties panel switches the layout, edits the words and the emphasised word, and nudges the start and end
to word boundaries (as teaser trims do, `pickTeaserWord`).

### M4 — Claude picks the moments

A new mode, `podcast_notes.yml` `mode: highlights` (`agent/src/podcast/highlights.ts`), started from the editor
("Suggest highlights") and, when the Studio setting says so (D3), by **Build for Studio editor**. It reads the
accepted transcript (words with times), the approved notes (key quotes, chapters, topics) and the edit (what is
cut, the teasers), and asks Claude for:

```
{ moments: [{ kind: 'quote' | 'word', text, emphasis, speaker, startMs, endMs,
              layout, why }],                  // 'word' moments: text is the word or short phrase
  descriptors: [{ speaker, descriptor }],       // for lower thirds, ≤ 40 characters, from what is said
  keyIdeas: [{ term, definition, startMs }] }   // ≤ 3; a definition is one plain sentence
```

- **Verified like quotes** (`lib/showNotes.ts` placement): every `text` must be found word for word in the
  transcript at its time, or it is dropped and listed as unverified. `emphasis` must be inside `text`.
  Definitions are Claude's words, so the editor marks key ideas "check before publishing".
- **Pacing is code, not the model** (`lib/highlights.ts`, tested): drop moments in teasers, the intro, the
  outro, cuts, crosstalk (two speakers inside the span) and the first 30 s of the episode; keep at least 45 s
  between moments; aim for the density setting (D4: Light ≈ one every 3 min, Normal ≈ every 90 s, Rich ≈ every
  60 s); never the same layout twice in a row, and spread `iris` and `over` (the loudest) further apart;
  prefer the approved key quotes when they fit.
- **Snap to words:** start on the first word's start minus 200 ms, end on the last word's end plus 600 ms
  (the out move plays over the next words).
- **Result:** highlight layers added to the edit (replacing earlier suggested ones, never ones a producer
  moved or edited — mark them `suggested: true` until touched), descriptors into the guests' lower thirds,
  key ideas as `keyIdea` graphics. A count shows in the editor ("12 highlights suggested") with **Clear
  suggested highlights**.
- **Cost:** add `highlights` to `ESTIMATE_USD` in `lib/server/spending.ts` (measure on a real episode; the
  transcript is the bulk, as for retakes) and record the real cost on the episode.

### M5 — settings and polish

- **Studio settings** (spec 018): "Motion graphics" on/off (D2); highlight density Off / Light / Normal / Rich
  (D4); "Suggest highlights when the edit is built" (D3); which layouts are allowed (all six by default).
- **Usage page:** graphics drawing time per render.
- **Hand-off export** (019 item 4.1): graphic clips export as files beside the cuts; highlights export as markers
  (the reframe itself can't be expressed in an XML timeline).

## Order and effort

Each item is one PR, promotable on its own (jobs only run from `main`).

| Item | What | Effort |
|---|---|---|
| **M1** | Renderer, Cinzel, the workflow step, one template (`lowerThird`) end to end: editor preview + render | **High** |
| **M2** | The other Part A templates, the `graphic` layer, automatic placement, `starlight` transition | **High** |
| **M3** | Highlight layer, the reframe render for all six layouts, the editor preview and Properties | **Extra** (moves the picture inside the window encode; a mistake costs a long render to find) |
| **M4** | `mode: highlights`, verification, pacing, the editor's Suggest / Clear | **High** |
| **M5** | Settings, usage, export | **Medium** |

## Tests (beside the existing ones; `npm test` must stay green)

- Template contract: every template file declares its fields, sets `seek`, and draws identically at the same
  `ms` twice (hash two screenshots).
- Renderer: a 2 s `lowerThird` clip has alpha (probe `pix_fmt`), 60 frames, the right size; the cache hit skips
  drawing.
- Layer schemas: `graphic` and `highlight` round-trip; bad fields refused; overlap and length rules.
- Reframe: the keyframe → expression conversion matches the curve at sampled times; a 4 s `splitQuote` over a
  test pattern puts the pattern's centre inside the window at the hold (pixel probe at one point).
- Pacing: fixtures for spacing, the layout rotation, teasers and cuts excluded, density targets.
- Verification: a moment whose words aren't in the transcript is dropped.

## Decisions for Tom

- **D1** Keep the simple ASS title card and lower third beside the new templates? **Default: yes**, as
  "Simple"; the automatic placement uses the new ones.
- **D2** Motion graphics on for every new episode? **Default: on.**
- **D3** Highlights placed automatically when the edit is built, or only on "Suggest highlights"? **Default: on
  "Suggest highlights"** until a few episodes have been judged.
- **D4** Default density. **Default: Normal** (about one every 90 s).
- **D5** The Shorts overlay (`short`): in this spec or with Shorts later? **Default: later**; the template exists.
- **D6** Descriptors and key-idea definitions are Claude's words. Show them for approval before they can be
  rendered, or just mark them? **Default: marked "check before publishing"** in the editor, and the render's
  quality report lists them.

## Out of scope

AI-generated video, music, 3D, face tracking (the windows are fixed positions; Zoom frames put the face near the
middle), and graphics in the audio podcast.
