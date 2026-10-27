# Spec 021: Motion graphics — branded templates and highlight moments

**Date:** 26 October 2026
**Status:** Built. **M1–M4 are merged** (PRs #211, #213, #216 and #217) and **M5 is built** (the
branch `claude/spec-021-m5`): the Studio settings, the Usage page's drawing time and the hand-off
export — particulars in the M5 section below. Tom answered D1–D6 on 26 October 2026; his answers are
recorded at the end of this page. The Shorts overlay (D5, "later") is in `docs/BACKLOG.md`.
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
  captions; already in `agent/assets/fonts` and the site), EB Garamond Italic (quotes; also in
  `agent/assets/fonts`). **Cinzel is new:** add its OFL files to `agent/assets/fonts` (with the licence) and load
  all three from local files in the templates — never from Google Fonts at render time.
- **Motion:** enter with `cubic-bezier(.22, 1, .36, 1)`, 500–700 ms, rising ≈28 px out of a ≈10 px blur;
  exit by fading in ≈400 ms, no bounce; stagger 150–250 ms. Picture moves use `cubic-bezier(.65, 0, .25, 1)`.
  Holds: title 4 s, lower third 5 s, quote 6 s, end screen 20 s. Safe area: 90 px from the sides, lower
  thirds 120 px up, the teaser tag clear of YouTube's progress bar (bottom ≤ 990).
- **The signature:** the four-point star (`M12 0C12.9 8 16 11.1 24 12C16 12.9 12.9 16 12 24C11.1 16 8 12.9 0
  12C8 11.1 11.1 8 12 0Z`) appears first; everything else follows its light.

## How it works

### M1 — the graphics renderer

**Built** (PR #211). As specced, with these particulars the next items build on: the graphic layer kind of
M2 came in early, restricted to `lowerThird` (`lib/layers.ts` GraphicLayerSchema; fields `name`,
`descriptor`, `variant: guest|host`; its length capped at 60 s, `GRAPHIC_MAX_MS`, because a clip is drawn
frame by frame — M2's whole-episode logo bug loops a short clip instead). The shared contract is
`lib/graphics.ts`; the templates' in/hold/out and `window.seek` live in
`agent/src/podcast/graphics/templates/runtime.js`; the renderer (`graphics/render.ts`) serves the template
and fonts over an intercepted origin, and `graphicClipName` names the Storage cache
(`episodes/<id>/graphics/<template>-<hash>.mov`, checked by the job before drawing). The editor fetches each
template once from `/api/studio/graphics/[template]` (runtime and fonts inlined; the route reads the files
from the repo at request time — if that ever fails on App Hosting, inline the template as a TS string) and
mounts it in a sandboxed iframe (`components/studio/graphics.tsx`), seeking by postMessage. Cinzel is
`agent/assets/fonts/Cinzel-latin.woff2` (OFL beside it); templates also use the site's
`app/fonts/Outfit-latin.woff2`. `checks.yml` installs Chromium too, because the tests draw.

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

**Built.** As specced, with these particulars M3+ builds on: all templates live beside lowerThird
(`titleCard` grew a `show` field for the eyebrow line; `chapter` derives CHAPTER TWO and the numeral from
its `number` field; the end screen's and sting's copy is the design's own, since their `fields` are empty —
make them fields if another show ever needs its own words). Anchors: most graphics sit on the episode's
clock; the **end screen anchors `{ fromEnd: ms }`** on the programme's clock (`lib/graphics.ts
programmeWindow`; `layerSpan` returns null for it, and `asVideoLayer` refuses it). The **logo bug is drawn
as a 12 s clip and looped** (`drawnMs`, the render's `loop` flag on picture entries); templates that draw
the logo get it as `GRAPHIC.logo` (the Studio's `logoPath`, else `public/logo-trimmed.png`; its bytes'
hash, `logoKey`, is in the cache name). The render gained **programme-time overlays** (`renderEdit`'s
`overlays`: `fromEnd` against the end, `at` centred on a join by `joinKey`), which carry the end screen
and the **starlight clips**; starlight is a `TransitionKind` with **no xfade and no overlap** —
`sequenceOf` and `programmeOf` keep the timeline's length and the render lays the clip centred on the
join (`XFADE.starlight` is undefined: guard any `XFADE[t]` use). The **teaser tag** is drawn per teaser
(progress line spanning the clip) and laid over the cut teaser by the job (`overlayClip` in media.ts),
with the ASS banner as the fallback when no Chromium is on the runner. Automatic placement is
`lib/layers.ts motionGraphics(...)`, applied on fresh edits in both `buildEdit` (server) and the editor
(the GET edit route's `graphics` payload carries title, show, chapters and hosts). The programme preview
plays the real templates (`components/studio/graphics.tsx` `ProgrammeGraphics`): end screen, teaser tags
and starlight on the programme clock.

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
   `window.GRAPHIC_LAYOUT = { from: Box, to: Box, inMs, outMs }`, where a `Box` is
   `{ x, y, scale, brightness, blur }` — no crop, radius or shape: the picture is only ever scaled and
   moved, and every shape is the matte's, so the render's frames keep one size. The renderer turns the
   keyframes into ffmpeg expressions over `t` (`scale` with `eval=frame` — probed to work under `overlay`
   on ffmpeg 6.1 — and `overlay` x/y) through the house curve as a 16-segment piecewise table
   (`lib/reframe.ts easeSegments`); tests compare the expression to the curve at sampled times.
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

**Built.** As specced, with these particulars M4+ builds on. The one source for the movement is
`lib/reframe.ts`: `HIGHLIGHT_KEYFRAMES` holds each template's declared `GRAPHIC_LAYOUT` (pinned by
`agent/src/podcast/graphicsRender.test.ts`, so a template cannot drift from what the render and the
preview compute), and `easeSegments()` is the 16-segment table of cubic-bezier(.65, 0, .25, 1) that the
render's expressions (`agent/src/podcast/graphics/reframe.ts progressExpr`), the preview's CSS
(`boxAt`/`boxStyle`) and the tests all read. The splits are pure 410 px pans and `push` a 560 px pan
(the design files never scale them); `below` is the one scaling layout (0.76); `iris` never moves the
picture (its matte carries the whole close); `over` is drawn as a linear alpha crossfade to a dimmed,
blurred copy over the same squeezed in/out — the one visible-motion approximation, invisible in a blur
fade. `HIGHLIGHT_PLANES` (graphics/reframe.ts) says which plane clips each layout draws: `over` only its
words, `push` words and backdrop, the rest all three; visible = picture alpha × matte alpha, so a
one-pixel ease drift can never leave a fringe. The clip cache name now carries `mode` and the logo's
hash. A highlight straddling a render-window join is trimmed in absolute episode seconds, so both windows
draw their own frames of the move seamlessly (tested at 3 s windows). The edit route refuses a save whose
highlight sits on cut words or a teaser or overlaps another (`highlightProblems`); the render warns (QC)
when words are cut on a stale edit, a transition blends under one, or b-roll hides one. In the editor the
preview reframes the `<video>` element itself and approximates the matte as an animated `clip-path`
(`components/studio/highlightPreview.tsx` — the matte clip stays the render's truth); highlights live on
a thin rose lane just above V1 (amber, with the reason, while the route would refuse them), drag edges
nudge to word boundaries, and Elements' "+ Highlight" starts on the next word with the eight words said
there.

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

**Built.** As specced, with these particulars M5 builds on. The rules live in `lib/highlights.ts` with
tests, the job in `agent/src/podcast/highlights.ts` (mode `highlights` of `podcast_notes.yml`, run like
retakes), the prompts beside the rules that check the answers. Claude's picks are verified with the
same `locate` that anchors quotes; a verified moment is snapped (first word −200 ms, last +600 ms,
clamped to its kind's 3–12 s / 1.5–4 s); pacing drops cut words, teasers, the first 30 s and crosstalk,
keeps 45 s between moments (a key-quote moment wins a tie), holds the density ceiling by thinning the
most crowded spots, never repeats a layout and keeps `iris`/`over` 90 s apart (a loud one too close
plays as its kind's quiet layout). The job writes into the saved edit in one transaction — suggestions
replace only `suggested: true` layers, descriptors fill only empty guest lower thirds, key ideas never
double a term — and bumps `edit.version`, so an open editor refetches (no local changes) or keeps its
work and says to save or discard first. `touchSuggested` drops the mark on any highlight the producer
changes, on every layers update. The density is fixed at Normal until M5 wires the setting; the cost
sits at `ESTIMATE_USD.highlights` = $0.50 — like retakes the transcript is the bulk — **measure on a
real episode and tighten**. The run's state and counts live on `episode.highlights`
(`/api/studio/episodes/[id]/highlights`).

### M5 — settings and polish

- **Studio settings** (spec 018): "Motion graphics" on/off (D2); highlight density Off / Light / Normal / Rich
  (D4); "Suggest highlights when the edit is built" (D3); which layouts are allowed (all six by default).
- **Usage page:** graphics drawing time per render.
- **Hand-off export** (019 item 4.1): graphic clips export as files beside the cuts; highlights export as markers
  (the reframe itself can't be expressed in an XML timeline).

**Built.** The Studio settings (spec 018 pattern, nothing saved before them changes behaviour):
`motionGraphics` (D2, on) gates the automatic placement on fresh edits in both Build for Studio editor
and the editor's first open (through the edit route's `graphics` payload); `highlightDensity` (D4,
Normal) is read by the suggestions job, with Off refusing the run and hiding Suggest highlights
(`highlightsOff` on the edit GET); `suggestOnBuild` (D3, off) starts the suggestions with a fresh
build, best-effort; `highlightLayouts` narrows what the pacing may pick, a kind with nothing left
falling back to its full set. The render clocks real drawing time (cached clips cost nothing) onto
`editRender.graphicsSeconds`, shown under the Usage page's machine time. The hand-off export carries
each drawn graphic clip as a file (`graphicClip`, named by the cache's template-hash) and each
highlight as a marker at its place on the exported timeline — sequence markers in the FCP7 XML for
Resolve and Premiere, a marker inside the covering `asset-clip` on its source clock for Final Cut; a
file auto-editor writes in an unrecognised shape is left unmarked rather than corrupted.

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

## Decisions for Tom — answered 26 October 2026

- **D1** Keep the simple ASS title card and lower third beside the new templates? **Tom:** build moving
  title cards, the "In this episode" card and the rest in the style of these motion graphics, and keep the
  movement professional. So the moving templates are the show's look and the automatic placement uses them;
  the ASS ones stay available as "Simple" but are not the default anywhere.
- **D2** Motion graphics on for every new episode? **Tom: yes, on by default.**
- **D3** Highlights placed automatically when the edit is built, or only on "Suggest highlights"?
  **Tom: on "Suggest highlights".**
- **D4** Default density. **Tom: Normal — but don't force motion where it isn't helpful.** The pacing rules
  treat the density as a ceiling to aim under, never a quota: a stretch with no strong moment stays plain.
- **D5** The Shorts overlay (`short`): in this spec or with Shorts later? **Tom: later — but don't forget
  it.** docs/BACKLOG.md carries it so it survives this spec closing.
- **D6** Descriptors and key-idea definitions are Claude's words. Show them for approval before they can be
  rendered, or just mark them? **Tom: the default** — marked "check before publishing" in the editor, and
  the render's quality report lists them.

## Out of scope

AI-generated video, music, 3D, face tracking (the windows are fixed positions; Zoom frames put the face near the
middle), and graphics in the audio podcast.
