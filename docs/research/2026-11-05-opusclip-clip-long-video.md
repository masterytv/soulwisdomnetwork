# OpusClip's "Clip long video" against our Shorts: what it would take (5 November 2026)

Tom sent two screenshots of OpusClip from his trial: the dashboard, and the setup screen that opens after a
YouTube link is pasted under **Clip long video**. The link was "Can We Ever Be Egoless? NDEs on Forgiveness and the
Shadow", 47:54 long, 47 credits. He asked four things:

- every feature on that screen;
- what building all of them would take;
- how that compares with our Shorts;
- the costs, time and effort, the steps, the UI changes, and anything else he might not have thought of.

How this was researched:

- **OpusClip.** All 260 help-centre articles, read verbatim from its `llms-full.txt`, plus its pricing page.
  Labels the help centre does not explain (such as "Credit saver", "AI picks", the headline style names and the
  caption presets) come from the web app's public text and code files. Those are marked **(app code)**: they can
  change without notice and are not documentation.
- **Third-party prices** are from the vendors' own pages.
- **Our side** is the code on `main` at `4c5d7f8`.

Everything was read on 5 November 2026. Sources are listed at the end.

## Summary

- **OpusClip's setup screen has about 25 controls in six groups:** source and layout, clipping, captions and graphics,
  sound, look, and translation. After **Create**, it adds a results page with a virality score, a clip editor,
  exports, posting to nine platforms with a calendar, analytics, YouTube auto-import and an API.
- **We already have about a third of it, in our own form.** Shorts today (spec 013) offer:
  - Claude's picks, each with a score, a hook and a reason, following a direction box;
  - trims made by clicking words;
  - one vertical layout and one caption style;
  - a headline in the brand colours;
  - approval at Checkpoint E;
  - YouTube scheduling, one a day.

  Some of what we have, OpusClip does not: nothing is posted before a person approves it, clips are cut from the
  cleaned and loudness-matched final cut, the look matches the thumbnails, and the records are ours (OpusClip
  projects expire after 30 days, and it may train on our videos).
- **The large gaps:**
  - layouts that follow the speaker;
  - a choice of caption styles;
  - hook cards;
  - effects: zoom, sound effects, emojis, motion graphics, transitions and colour;
  - b-roll inside clips;
  - a real clip editor;
  - other platforms, a calendar and analytics.
- **What all of it would take.** About 30 build items, roughly **25–35 working days** of building with Claude Code
  as we do now. That is **6–8 calendar weeks**, because every job change has to reach `main` and be tested on a
  real episode. Tom's part is about **20–30 hours** of decisions and testing.
- **A recommended core of about 18 items** would take **12–18 working days, 3–4 weeks**, and cost about
  **$1–2 an episode** to run: Claude's text only, since the repository is public and its GitHub runners cost
  nothing.
- **OpusClip's cost for comparison.** Pro is $29 a month for 300 credits. Tom's run used 47 credits. With every
  premium feature on for the top 10 clips, the same episode would cost **about 400–580 credits**, more than a month
  of Pro.
- **The finding that changes the plan.** Our recordings are Zoom gallery view, so each person sits in a tile of
  about 960×540. OpusClip's **Fill** layout crops one speaker to full-screen vertical, which would blow
  that tile up about **3.5×** and look soft. A **Split** layout, one person above the other, needs only about
  1.8× and shows both faces, which suits a two-host conversation.
- **Recommendation: don't chase parity.**
  1. First, compare OpusClip's top 10 clips from the Egoless episode with ours, blind.
  2. Then build the core: a clean picture, Split and Fill layouts, caption styles, a hook card, gentle zooms, quiet
     sound effects, the 9:16 motion overlay already designed in spec 021, the episode's own b-roll stills, a clip
     editor, analytics and the cover frame.
  3. Skip or defer dubbing, AI-video b-roll, emoji-heavy styles and YouTube-link import.

The rest of this page has the detail behind each point.

## 1. OpusClip's setup screen, control by control

Plans: Free, Starter ($15 a month), Pro ($29 a month per pack of 300 credits and 2 seats), Business (custom), and
Max ($129 a month for 1,500 credits). Processing costs **1 credit per minute** of the range selected. The "top
clips" premium features cost extra, counting each clip as one minute.

### Source and layout (the top card)

| Control | What it does | Options and limits | Plan, credits |
|---|---|---|---|
| **Source** | YouTube link, upload, Google Drive, Zoom link, and others | Up to 10 hours; files up to 10 GB (Free and Starter) or 30 GB (Pro) | All |
| **1080p badge** | Not documented. A 1920×1080 source cropped to 9:16 is 608×1080 and is **upsampled** to 1080×1920 | — | — |
| **Speech language** | Auto-detect, or one of 25 languages | 5 full (English, German, Spanish, French, Portuguese), 20 beta. No Hindi or right-to-left languages. Filler detection is English only | All |
| **Genre** | Chooses a "curation model" | Auto, Q&A, Commentary, Marketing, Webinar, Motivational speech, Podcast, Academic, Listicle, Product reviews, How-to, Comedy, Sports commentary, Church, News, Vlog, Gaming, Others | Starter and up |
| **Adjust range / Credit saver** | Processes only part of the video. "Credit saver" pre-trims the range to the credits left (app code) | Start and end on a filmstrip | Fewer credits |
| **Layout** ("9:16, 7 layouts") | How a 16:9 picture becomes vertical | **Fill** (crop on the speaker), **Fit** (letterboxed, or over a blurred copy; crop original, 4:3 or 1:1), **Split** (two speakers stacked), **Three**, **Four**, **ScreenShare** (screen above, speaker below), **Gameplay**. Several can be ticked: "AI can choose the best layout for each scene". "Pin first speaker". 16:9, 1:1 and 4:5 get Fill and Fit only | 9:16 on all plans; 1:1 and 16:9 on Pro |
| **Upload SRT** | Your own captions in place of its transcript | Strict SRT. Turns off speaker colours | — |
| **Recipe** | A saved set of which edits run, with their options and the Brand Kit | 8 built-in Recipes; saving one makes a copy under "My custom Recipes" | All |
| **Brand Kit** | The look | One logo, caption style, headline style, layouts per ratio, intro and outro (Pro), music, positions per ratio. Not yet in a kit: brand colours, backgrounds, your own music | Free: default only. Starter: 1. Pro: up to 4 |

### Clipping

| Control | What it does | Options | Plan, credits |
|---|---|---|---|
| **Clipping** on or off | Off sends the whole video through the other edits (videos up to 15–30 min) | — | — |
| **AI picks** (app code) | The clip model | **Auto**; **ClipAnything** (multimodal: picture, objects, actions, on-screen text, laughter, cheering, emotion; 20–40 min to run); **ClipBasic** (transcript only) | — |
| **Clip length** (app code) | Ranges to aim for, more than one allowed | Auto (0–3 min), under 30 s, 30–59 s, 60–89 s, 90 s–3 min, 3–5 min, 5–10 min, 10–15 min | All |
| **Moments to include** | A prompt | ClipAnything: a scene, action, emotion, person, compilation or sound ("all the laughing scenes"). ClipBasic: keywords that are spoken. English only. Not editing instructions | Pro and Business |
| **How many clips** | Not a control; it follows the length | 23–32 clips for a 30–60 min source | — |

### Essentials

| Control | What it does | Options | Plan, credits |
|---|---|---|---|
| **Captions** | Animated burned-in captions | **44 presets** (app code), first and default `word-cut`; then Marker sweep, Negative keywords, Karaoke, Handwritten, Typewriter, Glide, Editorial, Punch, Retro 3D, Bouncing dot, Sticker, Comic, and more. Font (17 built in, 2 of your own on Pro), size, colours, highlight colour, stroke, shadow, case, one or three lines, position Auto (avoids heads), Top, Middle or Bottom. Keyword highlighting, speaker colours (Business) | All; watermark on Free |
| **Auto hook: Headline** | A title over the clip's opening | Styles **Classic**, **Editorial**, **Statement** (app code; new 21 October 2026). Position chosen by AI to avoid faces. Top 10 clips | Free, all plans |
| **Auto hook: Viral hook** | Animated text, zoom and sound effects over the opening words. Does not lengthen the clip | Template families: Clean and corporate, High-energy, Editorial and luxe, Playful and handmade | 20 credits a run; Pro |
| **Motion graphics** (Beta) | Animated graphics at names, numbers and dates, read from the transcript; no sound | 86 types: big number, charts, name and role, subscribe card, tweet card, review card, countdown… | 6 credits/min (shown Free: a promotion); Pro |
| **AI Emojis** | Emojis added to the captions | Needs captions on | All |
| **Auto B-roll** | Pictures over the speaker | **AI image** (one consistent style), **stock video** (free), **AI video** (a model such as "Seedance"; billed by use, not in the estimate). Full screen, picture-in-picture or split | Starter: 3 clips a month. Pro: 50 a day (image), unlimited (stock) |

### Sound sharp

| Control | What it does | Options | Plan, credits |
|---|---|---|---|
| **Speech cleanup** | Cuts pauses and fillers | Pauses, fillers, or both; pause threshold (default 0.5 s); filler list ("um", "uh", "you know", stutters). "Remove bad takes" is a separate editor feature (Pro) | Starter and up |
| **Enhance audio** | Noise reduction, voice isolation, volume boost | Two sliders | Pro, 10 a day; a few free uses, then credits a minute (about 6, app code) |
| **Auto SFX** | Sound effects from a curated library at transitions, impacts and reactions; each one is a block you can edit | — | 7 credits/min of clip; Pro |

### Look good

| Control | What it does | Plan, credits |
|---|---|---|
| **Auto Zoom** | Gentle zoom-ins at key moments, then back out; needs a change of aspect ratio | Pro; price not found |
| **Auto transitions** | Transitions at jump cuts (cross fade, cross zoom, zoom in or out, punch in, slow push, and more) | Pro; price not found |
| **Auto Color Correction** | White balance, brightness and contrast, with an intensity slider | Pro; "free" and "1 credit" in the same article |

### Translate

| Control | What it does | Plan, credits |
|---|---|---|
| **Voice dubbing** | Translated speech in a clone of the speaker's voice, in 25 languages. With two speakers, **both are dubbed in the main speaker's voice** | 10 credits/min; Pro |
| **Caption translation** | Captions translated, **into English only** | Not found |

### The summary panel

- "Video processing 47 credits" is the 1-credit-a-minute rule.
- "Premium features applied to top 10 clips" is a slider from 1 to 30 (app code). Clips are ranked by their AI
  score, not by where they come in the video. A per-minute feature counts each clip as one minute, and credits are
  refunded if fewer clips come back.

## 2. What OpusClip does after Create

- **Results:**
  - each clip gets a title, description, hashtags and a **virality score** of 0–99, built from Hook, Flow, Value
    and Trend (the method is not published; Starter and up);
  - clips can be sorted by score or by time, liked or disliked;
  - "Reprompt" runs a new search, one prompt at a time.
- **Clip editor:**
  - trim and extend by the transcript, add a stretch from anywhere in the source, split and rearrange;
  - layout per segment, manual reframe and subject tracking;
  - caption text, style and timing; up to five text overlays;
  - motion graphics, hooks and b-roll;
  - music (its library, or your own upload) and an AI voice-over;
  - intro and outro cards, a censor (beep or mute), and brand vocabulary for transcript fixes.
- **Export:**
  - MP4, with a watermark on Free;
  - bulk download (Pro);
  - an XML for Premiere or DaVinci Resolve (Pro, one clip at a time, captions as flat overlays);
  - SRT and transcript files.
- **Posting:**
  - Starter posts straight away to YouTube Shorts, TikTok and Instagram Reels.
  - Pro adds Facebook (posted as an ordinary video, not a Reel), LinkedIn, X (3 credits a post), Pinterest,
    Threads and Bluesky, and scheduling on a drag-and-drop calendar.
  - The bulk scheduler is YouTube only.
  - Its rate limits follow each platform: TikTok 15 a day, Instagram 40, YouTube about 15.
- **Analytics:** for one YouTube or TikTok account, plus the posts it made. Clip analytics are Business only.
- **Auto-import:** your own public YouTube uploads over 3 minutes, checked hourly; Starter and Pro.
- **Projects expire:**
  - after 30 days on Starter and Pro (unless saved to the cloud on Pro), 3 days on Free and 7 days on the trial;
  - 3 days after cancelling.
- **Data:** non-enterprise videos "may" be used to train its models.
- **API:**
  - for Pro (beta), Max and Business, spending plan credits;
  - 900 credits a month cap on Pro and Max, 4 projects at once, 10 credits minimum per project;
  - an MCP server and a Claude connector.
- **Other tools on the dashboard** are built-in Recipes: Clean up recording (adds eye-contact correction),
  Auto-edit talking videos, Captions, Reframe, Social edits, AI B-roll and Translate & dub. **Upscale** costs credits
  per 10 seconds, for videos up to 5 minutes.

## 3. Our Shorts today

Spec 013 describes them. The code:

| Part | Files |
|---|---|
| Shared rules (layout, caption timing, what YouTube gets) | `lib/shorts.ts` |
| Claude's picks | `lib/shortPicks.ts` |
| The job | `agent/src/podcast/shorts.ts`, modes `pick`, `titles`, `render`, `upload` |
| The drawing (ASS for libass) | `agent/src/podcast/shortsRender.ts` |
| The ffmpeg command | `renderShort` in `agent/src/podcast/media.ts` |
| The Studio panel | `components/studio/shorts.tsx`, on the show notes page |

**The flow, once the final cut exists:**

1. **Choose moments.** Either:
   - tick key quotes; or
   - press **Find the best moments**: Claude reads the whole final cut and suggests up to 10 quick moments and 5
     longer ones (90 s to 3 min), each with a score out of 10, its hook and a reason, following an optional
     direction. It reserves $0.40.
2. **Edit each short.** Click a word to move an end there. Write or generate the headline (with `*gold*` words) and
   the title. Tick the AI-imagery flag. Reorder the shorts, which sets the schedule order.
3. **Make shorts.** Draws each changed short in about a minute, on GitHub Actions.
4. **Checkpoint E.** Watch each short and approve it.
5. **Schedule on YouTube.** Approved shorts go up Private with a publish time, one a day. Each description carries
   the spoken words, the episode link, the music credits and `#shorts`.

**The look.** 1080×1920. From the top: the logo, the headline, the episode's 16:9 picture trimmed to 14:9 or 13:9
between gold rules, the speaker's name, then large captions a few words at a time, with the word being spoken in
gold. The type is Outfit Black, in the Studio settings' colours.

**What we have that OpusClip lacks:**

- a person approves every short before it is scheduled;
- shorts come from the edited final cut, so the clean-up, levelling and cuts carry over;
- the look matches the thumbnails;
- the schedule continues across episodes;
- YouTube's AI flag is set from the b-roll;
- nothing expires, and nothing is used to train anyone's model.

**What it does not do:**

- clip anything but our own episodes, or before the final cut;
- frame vertically in any other way than stacked;
- offer more than one caption style;
- show a headline that moves or changes;
- add effects (zoom, sound, emojis, graphics, transitions, colour);
- add b-roll beyond what the final cut already has;
- post anywhere but YouTube, or show analytics;
- let you choose a cover frame (that is in `docs/BACKLOG.md`);
- work in any language but English.

## 4. Side by side: every feature, what we have, what it would take

Sizes:

- **S**: a few hours of building with Claude, one PR.
- **M**: about a day, one or two PRs.
- **L**: two to four days, several PRs, including the fixes after the first real episode.

These are calibrated on this repository's history. Spec 021's five motion-graphics PRs were built and merged in one
day (26 October), as were spec 022's three stages (28 October). But the first real Shorts renders then needed six
fix PRs over 28–29 October. **Real-episode testing is the slow part**, and jobs only run once they are on `main`.

The **#** column is the build item in section 6.

| OpusClip feature | Ours today | To build | Size | # |
|---|---|---|---|---|
| **Source: any link, upload, Drive** | Our episodes only (Drive ingest or Studio upload); Shorts wait for the final cut | Clips from any uploaded video, without the notes and edit steps | M | 7.1 |
| YouTube link import | — | Possible, but unreliable from cloud runners, and against YouTube's terms for videos that aren't ours (section 8) | S, risky | 7.2 |
| Speech language (25) | English | AssemblyAI language detection; the prompts in that language | S | 7.3 |
| Genre | The Studio settings' kind of recording (podcast, meeting, talk) | Nothing: we have one show | — | — |
| Adjust range | Picks read the whole final cut | A range on the filmstrip | S | 2.4 |
| **Layouts** Fill, Fit, Split, Three, Four, ScreenShare, Auto; 1:1, 4:5, 16:9 | Stacked (like Fit) at 14:9 or 13:9; 9:16 only | Faces and tiles found at ingest; speakers mapped from the transcript and speaker tracks; a renderer whose crop changes over time | L | 1.2, 1.3, 2.1 |
| Upload SRT | Our transcript, corrected in the Studio | Not needed | — | — |
| Recipes | One set of Studio settings | Saved clip settings (one show, so a single default is enough) | S | 1.4 |
| Brand Kit | Studio settings: colours, logo, Outfit and Cinzel, intro and outro | Caption and headline style, positions, clip music | S | 1.4 |
| **AI picks** (ClipAnything, ClipBasic) | Claude reads the transcript: 10 quick and 5 long picks, score, hook, reason | Length presets, count, range, a score breakdown. Picture cues (laughter, gestures) only if the bake-off shows they matter | S | 2.4 |
| Clip length | Fixed: 20–90 s quick, 90 s–3 min long | Presets | S | 2.4 |
| Moments to include | **Direction** box, up to 1,000 characters | Nothing | — | — |
| Virality score 0–99 | Score 1–10 with a reason | Hook, flow, value and trend; then measured against real views | S, then M | 2.4, 6.5 |
| **Caption styles** (44) | One | 6–8 presets in our brand, Claude-marked keywords, position, lines | M | 2.2 |
| **Headline hook** | A headline over the whole short | Three styles, big for the first seconds, then settled or gone | S | 2.3 |
| Viral hook | — | An animated hook template with a sound | M (inside 3.4) | 3.4 |
| **Motion graphics** | Spec 021 templates at 16:9; the 9:16 Short overlay designed (`Short.dc.html`), not built | 9:16 templates (overlay, name, key idea, end card), placed by Claude | M | 3.4 |
| AI Emojis | — | Claude picks a few; Noto Emoji pictures pop in | S | 3.3 |
| **B-roll**: AI image, stock, AI video | Only the b-roll already in the final cut | The episode's own stills; stock video; AI video | S, M, M | 4.1–4.3 |
| Speech cleanup | Done in the edit (fillers, stammers, pauses) and inherited | Only for clips from unedited videos: reuse the editor's marking | S | 7.1 |
| Enhance audio | Done in the render (Studio sound, DeepFilterNet, Auphonic) and inherited | Same: reuse for unedited videos | S | 7.1 |
| **Auto SFX** | Studio wind sounds and the show library, in episodes | Placed on hooks and changes, mixed under the voice | S | 3.2 |
| **Auto zoom** | The highlight reframe engine, in episodes | Slow push-ins on emphasised lines | S | 3.1 |
| Auto transitions | 21 transitions, in episodes | Between a clip's segments | S | 3.5 |
| Colour correction | — | Measured per episode, or a show look | S | 3.6 |
| Eye contact | — | Skip: no open tool good enough | — | — |
| Voice dubbing | — (spec 005: "no demand") | A dubbing API | M | 7.5 |
| Caption translation | Episode captions in up to 5 languages, as YouTube tracks | The same for shorts | S | 7.4 |
| **Clip editor** | Word trims, headline, title, order, approve | Vertical preview, layout per segment, captions and effects as items | L | 5.2 |
| Export (XML, SRT, bulk) | MP4 in Storage; the hand-off export for episodes | Per-clip SRT and XML, download all | S | 5.3 |
| **Posting** (9 platforms), calendar | YouTube, one a day | Instagram and Facebook, TikTok, LinkedIn, X and others; a calendar | M each | 6.1–6.4 |
| Analytics | — (in `docs/BACKLOG.md`) | YouTube Analytics on each card, fed back into the picks | M | 6.5 |
| Auto-import | Drive ingest already starts the pipeline | Nothing | — | — |
| Upscale | — | Only if Fill is wanted on gallery tiles | M | 7.6 |
| Custom thumbnail | In `docs/BACKLOG.md` (cover-frame slider) | The slider | S | 6.6 |
| Music, voice-over, censor | Show library with licence checks (episodes) | Music under clips is part of 3.2; skip the rest | — | — |

## 5. Costs, time and effort

### Building

| Phase | Items | Building | Tom's time |
|---|---|---|---|
| 0. Bake-off | Compare OpusClip's top 10 with ours | — | 1–2 h |
| 1. Foundations | Clean picture, picture analysis, segment renderer, clip settings | 5–7 days | 3–4 h |
| 2. Core look | Layouts, caption styles, hook, better picks | 3 days | 3 h |
| 3. Polish | Zoom, sound effects, emojis, 9:16 graphics, transitions, colour | 3–4 days | 3 h |
| 4. B-roll | Episode stills, stock video (AI video: not recommended) | 1–2 days | 1–2 h |
| 5. Studio UI | Clips page, clip editor, exports | 4–5 days | 3–4 h |
| 6. Distribution and learning | Instagram and Facebook, TikTok, others, calendar, analytics, cover frame | 4–6 days | 4–6 h, including the Meta developer app and a posting service |
| 7. Beyond our episodes | Any video, link import, languages, caption translation, dubbing, upscale | 4–5 days | 2–3 h |
| **Everything** | about 30 items | **25–35 working days, 6–8 weeks** | **20–30 h** |
| **Recommended core** | 0, 1, 2, most of 3, 4.1, 5.1, 5.2, 6.5, 6.6 | **12–18 working days, 3–4 weeks** | **12–18 h** |

**Cost of building.** This is Claude Code usage under the existing subscription, plus Tom's time. For scale only:
a contractor without AI help, at the $50 an hour used in the September research, would need roughly three times as
long. That is **about $30,000–$42,000 for everything, or $15,000–$22,000 for the core**. This is an assumption,
not a quote.

**Upkeep.** OpusClip ships changes weekly; we would own our bugs. Budget a few hours a month. The October Shorts
stalls are the example: six fix PRs before the first real batch rendered.

### Running

Per episode, assuming about 10 clips of 45 seconds (7.5 minutes of clips). A month is three episodes, the
September research's assumption.

**The core (option C):**

| Item | Per episode | Notes |
|---|---|---|
| Claude: picks | about $0.40 | Reserved today; the real cost is still to be measured |
| Claude: titles, headlines, keywords, zoom and sound marks | $0.10–0.30 | One run for all clips; titles alone reserve $0.05 today |
| Rendering and picture analysis | $0 | GitHub's standard runners are free for public repositories, with 4 CPUs and 16 GB. If the repository went private: 2 CPUs at $0.006 a minute, about $0.50–1 an episode |
| Storage and previews | a few cents to $0.30 | About 50 MB a clip |
| B-roll: the episode's stills, stock video | $0 | The stills are already paid for. Pexels and Pixabay are free; Pexels asks for a prominent link to it inside our app, not in the videos |
| **Total** | **about $1–2** | **$3–6 a month** |

**Paid extras, if turned on:**

| Extra | Price | Per episode |
|---|---|---|
| AI video b-roll | Google Veo 3.1 Lite $0.03/s at 720p; Veo 3.1 Fast $0.10/s at 1080p; Gemini Omni Flash about $0.07/s at 720p; Runway Gen-4 Turbo $0.05/s. **OpenAI shut down the Sora API on 24 September 2026** | $5–16 (20 beats of 4 s, one retry each) |
| Dubbing, per language | ElevenLabs $0.50/min without watermark: it clones each speaker, and its policy requires their consent. Its v2 is $2.20/min. Azure's standard voices about $0.33/min. YouTube's own auto-dubbing is free but works only inside YouTube | about $3.75 |
| Upscaling, for Fill | Topaz API about $0.65–0.86/min from 720p to 1080p; fal.ai's Topaz $0.20 per 10 s at 1080p | $5–9 |
| Posting to Instagram, Facebook, YouTube, LinkedIn | Free through their own APIs | $0 |
| Posting to X | $0.015 a post (media upload price not found) | pennies |
| One posting service for every platform | upload-post $16–24 a month (sends TikTok posts as drafts); Buffer $5 per channel a month, API on every plan; Ayrshare $149 a month (posts publicly on TikTok) | a month |
| Hosted reframing, in place of our own | Cloudinary auto-crop, about $0.37 per 60-second clip | not needed |

With every extra on and one dubbing language, the total is about **$60–240 a month**, depending mostly on the
posting service ($16 or $149 a month).

**OpusClip for the same work:**

| What is turned on | Credits an episode | A month at 3 episodes |
|---|---|---|
| Tom's run: headline, emojis, motion graphics while free | 47 | 141: one Pro pack, $29 ($14.50 a month billed yearly) |
| Every premium feature on the top 10 clips: viral hook 20, motion graphics 60 (6/min once the promotion ends), sound effects 70, enhance audio about 60 (app code), dubbing 100 per language, AI-image b-roll about 40 (app code), colour about 10 | about 400; about 580 with AI-video b-roll in place of images (about 21/min, app code) | 1,200–1,740: Max ($129 for 1,500) plus top-ups, or 4–6 Pro packs ($116–174) |

**What this says.** For the core look, building costs a few dollars a month against OpusClip's $29. With everything
on, the two cost about the same. The reason to build is control, approval and brand, not price.

## 6. The build, step by step

Each item below is its own PR into `staging`, in this order, at the model effort shown, following
`docs/PLANNING.md`: Medium is small, High is the default, and Extra is used where a mistake moves an episode's
timing. **Jobs run only from `main`**, so each job change must be promotable on its own before Tom can test it on a
real episode.

### Phase 0: the bake-off (Tom, no code)

Tom already has OpusClip's clips for the Egoless episode, and they last 7 days on the trial, so download them now.

1. Run **Find the best moments** on the same episode.
2. Put OpusClip's top 10 and our picks side by side.
3. Note which differences matter: the moments chosen, the layout, the captions, the hook, the zooms and effects.
4. Watch two or three of each blind, the way the clean-up bake-off was done (`agent/src/podcast/cleanupCompare.ts`).

This decides which phases are worth building, for an hour or two of Tom's time.

### Phase 1: foundations

**1.1 A clean picture (M, Extra).**

- *The problem.* Shorts are cut from the final cut today, which has the 16:9 graphics burned in: lower thirds, the
  logo bug, highlight reframes, b-roll, and captions when they are on. A vertical crop would slice through them.
- *The fix.* Take each clip's picture from the original recording through the edit's kept ranges (`lib/edit.ts`
  `keepRanges` and `editedTime`), and its sound from the final cut, which is already cleaned and at −14 LUFS.
- *The rule.* Clips stay inside one part of the episode, so no transition falls inside a clip.
- *The fallback.* If the mapping proves fragile, a second render of the episode with graphics off. That costs a
  render for every episode.

**1.2 Picture analysis at ingest (M, High).**

- Sample a frame every half second and find the faces on the CPU with MediaPipe's face detector (Apache-2.0, a few
  milliseconds a frame) or OpenCV's YuNet (MIT).
  - Not YOLO face models: AGPL or GPL.
  - Not InsightFace's models: non-commercial only.
  - Not TalkNet's pretrained weights: trained partly on non-commercial data.
- Group the faces into Zoom tiles, and notice a shared screen.
- Map each tile to a speaker: the transcript's speaker turns, and the per-person audio files when they exist (spec
  019 item 3.3), say who is talking, and the tile whose face moves with that voice is theirs.
- Save the result as `analysis/faces.json`, beside the silences and peaks, and fill it in for older episodes the
  way ingest already does for thumbnails.
- *Why not ML active-speaker detection?* Our tiles do not move, and the transcript already knows who is speaking.
  That is the cheap, reliable route.

**1.3 The segment renderer (L, Extra).** This grows out of `renderShort`.

- A clip becomes a list of segments. Each segment has its own stretch of the recording, a layout, and a crop that
  can move (for zooms), using `lib/reframe.ts`'s easing table so the preview and the render agree.
- Segments are joined by cuts or the 21 existing transitions.
- The text, the 9:16 graphics and the sounds go on top, and the whole is encoded once.
- The output size is a parameter (1080×1920, 1080×1080, 1080×1350, 1920×1080), so other ratios cost nothing later.
- `RENDER_VERSION` and `sameRender` grow to cover the new inputs.

**1.4 Clip settings and data (M, High).**

- *The show's defaults* go in a `clips` section of `studio/settings` (the "Brand Kit and Recipe"): ratio, allowed
  layouts, caption style, headline style, each effect on or off, lengths, count, music.
- *Each episode's clips* grow out of `episodes/{id}.shorts`. Keep its fields and add segments, layout and effects:
  "evolve what exists; never build a second version" (`docs/PLANNING.md`).
- Each new field gets its schema, a limit and a test in the route, or every save fails.

### Phase 2: the core look

**2.1 Layouts (M, High).**

| Layout | What it shows | Notes |
|---|---|---|
| **Split** | Both tiles stacked, each cropped to 9:8 | About 1.8× enlargement: sharp enough |
| **Fill** | The speaker's tile, switching at speaker turns, with a minimum hold so it doesn't flicker | About 3.5× from a 960×540 tile; a warning in the Studio until the recording changes (section 8) |
| **Fit** | Today's stacked layout, plus a blurred-background variant | — |
| **Screen share** | Screen above, speaker below | — |
| **Auto** | Split during back-and-forth, Fill or Fit on a long answer | — |

1:1, 4:5 and 16:9 come from the same renderer.

**2.2 Caption styles (M, High).**

- About 6–8 presets, drawn in ASS so they stay within libass:
  - today's gold word;
  - one word at a time;
  - karaoke fill (`\kf`);
  - a box behind the word (BorderStyle 3), the "marker";
  - pop-in (`\t` scale);
  - a quiet "editorial" style in Cinzel;
  - two lines;
  - captions off.
- Claude marks one or two keywords a line for the accent colour, in the same pass as the titles.
- Position (top, middle, bottom, or auto above the faces), size, and per-clip override.
- The animated Short overlay (spec 021's `short`) arrives in 3.4.

**2.3 Hook headline (S, High).** Three styles in our brand:

- **Classic**: today's headline;
- **Editorial**: Cinzel, small capitals;
- **Statement**: large words on a band.

Each is shown big for the first 2–3 seconds, then settles at the top or fades. Claude already writes the words.

**2.4 Better picks (S, Medium).**

- Clip-length presets, the number of clips, and a range on the filmstrip (the thumbnails already exist,
  `analysis/thumbs_N.jpg`).
- The score split into hook, flow, value and trend, with the reason.
- Titles and headlines written in the same run, saving a step.
- The prompt and schema are in `lib/shortPicks.ts`; the $0.40 reserve stays.

### Phase 3: polish

**3.1 Auto zoom (S, High).**

- Slow push-ins (1.0 to about 1.12 over 2–4 seconds) on lines Claude marks as emphatic, at most one every 15
  seconds.
- Fill and Split only.
- The easing is `lib/reframe.ts`'s.

**3.2 Sound effects and music (S, High).**

- A soft wind or whoosh under the hook card and at layout changes, from the Studio's own wind sounds (no licence
  needed) and licence-checked library effects.
- An optional music bed, ducked under the voice with the existing `musicMix`.
- Off by default.

**3.3 Emojis (S, Medium).**

- Claude picks at most a few per clip, only where they add something.
- Drawn as Noto Emoji pictures popping in beside the caption: libass cannot draw colour emoji, so ffmpeg overlays
  them.
- Off by default; this is a brand question for a contemplative show.

**3.4 9:16 motion graphics (M, High).**

- Build the `short` overlay already designed in `docs/specs/021-motion-graphics/Short.dc.html` (the backlog item).
- Add 9:16 versions of the name lower third, the key idea, the pull quote and an end card ("The full conversation
  on YouTube").
- Animated hook templates go in here too.
- Placement reuses the highlights pass (`lib/highlights.ts`: every quote checked against the transcript, pacing
  enforced in code).
- Drawing goes through the existing renderer, `agent/src/podcast/graphics/render.ts`, and is cached in Storage.

**3.5 Transitions between segments (S, Medium).** Reuse `lib/transitions.ts`; this falls out of 1.3.

**3.6 Colour (S, High).**

- Measure each episode's picture once (ffmpeg `signalstats`) and correct the white balance and levels within
  limits, or apply a show look (a LUT) Tom picks once.
- The same correction can go on the full episode's render.

### Phase 4: b-roll

**4.1 The episode's own stills (S, Medium).**

- The approved b-roll images (spec 008) already exist and are paid for.
- Show them full-screen, or in the top half with a slow pan, where they fall inside a clip.
- YouTube's AI flag is already set from them (`showsBroll`).

**4.2 Stock video (M, High).**

- Claude suggests search words for a few beats per clip.
- The job fetches three candidates per beat from a stock library.
- The producer picks one or none in the clip editor. Stock footage can easily be off-tone for this show, so no
  candidate goes in unseen.

**4.3 AI video (M; not recommended).** Generated clips per beat.

- Tom dropped Sora b-roll for episodes on 5 October (N2), and OpenAI has since shut down the Sora API.
- The candidates now are Google's Veo 3.1 (on Vertex) or Gemini Omni Flash, at $0.03–0.10 a second (section 5).
- It would need its cost reserved against the daily limit, and the limit raised.
- It must be flagged as synthetic on every platform.

### Phase 5: the Studio

**5.1 The Clips page (M, High).** Shorts move off the notes page onto their own page with its own step in the
Journey. The page has a setup card like OpusClip's, a summary card, and a grid of results. Details in section 7.

**5.2 The clip editor (L, Extra).**

- A vertical preview drawn live in the browser, by cropping and moving the `<video>` element with CSS as
  `components/studio/highlightPreview.tsx` does. No render is needed to see a change.
- The transcript with word trims, as today.
- A strip of the clip's segments, with the layout of each.
- The headline and caption text, which are editable.
- Every effect (zoom, sound, emoji, graphic, b-roll) as an item to remove or change.
- **Approve** stays Checkpoint E.
- Anything that follows the playhead subscribes through `useVideoTime.ts`, never React state: the 8,000-word lesson
  in `docs/PLANNING.md`.

**5.3 Exports (S, Medium).** Download one clip or all of them, an SRT per clip, and the hand-off XML
(`podcast/editExport.ts`) for a clip.

### Phase 6: distribution and learning

**6.1 Instagram Reels and Facebook Reels (M).**

- **Instagram** goes through Meta's "Instagram API with Instagram Login".
  - It needs a Business or Creator account and a Meta developer app.
  - It needs **no Facebook Page and no App Review** for our own accounts: Standard Access covers them.
  - Reels of 3 seconds to 15 minutes, up to 100 posts a day.
  - The file must be at a public address, so a signed Storage link.
- **Facebook Reels** need a Page, run 3–90 seconds, and allow 30 a day.

**6.2 TikTok (S, through a posting service).**

- TikTok's API posts only privately until an app passes its audit.
- Its guidelines say the audit will not accept "a utility tool to help upload contents to the account(s) you or your
  team manages", which is exactly what ours would be.
- So TikTok goes through a posting service (6.3), or is posted by hand from the downloaded file.
- `docs/BACKLOG.md`'s "start the audit application early" no longer helps.

**6.3 LinkedIn, X, Threads, Bluesky (S–M each), or one paid service for all of them (M).**

- *Each platform's own API.* LinkedIn needs an application for its Community Management API. X charges per post.
- *A posting service.* Buffer is $5 per channel a month; upload-post is $16–24 a month and sends TikTok posts as
  drafts to publish from the phone; Ayrshare is $149 a month and posts publicly on TikTok.

**6.4 A calendar (M).** A month view of everything scheduled on every platform, with drag to move. It replaces
"one a day, in page order" as the only control.

**6.5 Analytics (M).**

- Pull each short's views, average percentage viewed and subscribers gained from the YouTube Analytics API every
  week, then the other platforms.
- Show them on each clip card.
- Give Claude the last ten results with the next picks ("these worked, these did not").

Neither OpusClip nor any other tool can know what works for this audience; this is how ours would learn.

**6.6 Cover frame (S, Medium).** The slider already described in spec 013 "Later".

### Phase 7: beyond our own episodes (only if wanted)

| Item | What it is | Size, effort |
|---|---|---|
| **7.1 Any video as a clip source** | Studio upload or Drive, transcribed, then clipped without the notes or the edit. Speech clean-up and audio clean-up reuse the editor's marking (`lib/programme.ts` `firstEdit`) and `podcast/voiceCleanup.ts` | M, High |
| **7.2 YouTube link import** | Section 8 has the risks | S, High |
| **7.3 Other speech languages** | AssemblyAI's language detection, and the prompts in that language | S, Medium |
| **7.4 Translated captions on shorts** | Reuse `mode: translations`, as caption tracks or burned in per language | S, Medium |
| **7.5 Voice dubbing** | ElevenLabs' API, which clones each speaker separately (OpusClip uses the main speaker's voice for everyone); a separate upload per language; consent from each voice (section 8). YouTube's free auto-dubbing in YouTube Studio may make this unnecessary | M, High |
| **7.6 Upscaling** | Only if Fill must look sharp on gallery tiles: a hosted upscaler such as Topaz (section 5). Better fixed at the recording | M, High |

## 7. What changes in the Studio

- **A Clips page** at `/admin/podcast/[episodeId]/clips`, with its own step in the Journey, in place of the Shorts
  section on the notes page.
  - **Top card:**
    - the source (this episode, or an uploaded video);
    - the filmstrip with a range to clip;
    - the layout chooser, showing the episode's own frame cropped each way so the 3.5× softness of Fill is visible
      before choosing;
    - the ratio.
  - **Settings, grouped like OpusClip's:**
    - Clipping: length, number, the direction box;
    - Essentials: caption style with live samples, headline style, motion graphics, emojis, b-roll;
    - Sound: effects, music;
    - Look: zoom, transitions, colour;
    - Translate.

    Each defaults from the Studio settings, and **Save as the show's default** writes them back.
  - **Summary card:** the estimated cost against the daily limit (Claude, stock or AI b-roll, dubbing), the
    estimated time, and **Find clips**.
  - **Results:**
    - a grid of 9:16 cards with the score, hook, reason, length and layout;
    - sort by score or by time, hide the ones you don't want;
    - tick several to make, approve or schedule at once;
    - each card opens the clip editor (5.2).
- **The Studio settings** get a **Clips** section: the style defaults above, the platforms and their posting times,
  and the end card's wording.
- **A Calendar page** (6.4) under the Studio, beside the backlog.
- **The Usage page** counts each clip render's minutes and any paid extras per episode.
- **Phones.** The Studio editor is desktop-only (decision U3), but reviewing and approving clips is the kind of
  thing done on a phone. The results grid and **Approve** should work at phone width; the clip editor can stay
  desktop-only.

## 8. Things you might not be thinking about

1. **Picture quality decides the layouts.** Gallery view at 1080p gives each of two people a tile of about
   960×540; at 720p about 640×360.
   - Fill crops a 304×540 strip and enlarges it about 3.5× (5× at 720p). Split enlarges about 1.8×. Today's
     stacked layout shrinks the picture, which is why it looks sharp.
   - Fill would look sharp only with a better source:
     - Zoom's "Record active speaker, gallery view and shared screen separately" setting gives a full-frame speaker
       file. Zoom's forum reports it often comes out at 640×360 or 720p unless conditions are right, and the ingest
       today skips a folder with more than one video, so that would change too.
     - Or each host records their own camera locally, as Riverside-style tools do.
     - Or AI upscaling (7.6).
   - This is the biggest single question, and it is about recording, not code.
2. **The final cut has 16:9 graphics burned in.** Lower thirds, the logo bug, highlight reframes and b-roll are
   in the picture shorts are cut from today. A vertical crop needs the clean picture (1.1).
3. **Brand and tone.** OpusClip's defaults are tuned for high-energy content: emojis, "negative keyword" red
   highlights, whooshes, punch-in zooms. For conversations about near-death experiences and forgiveness, restraint
   is the brand. Every effect should be off or gentle by default, and the bake-off should check how OpusClip's
   versions land with this audience.
4. **Guests and context.**
   - A 40-second clip of someone's near-death experience can misrepresent it. Keep a person's approval before
     anything is posted (Checkpoint E): OpusClip's auto-posting and auto-import skip that step.
   - Consider a line in the guest release covering short clips on every platform.
   - Consider sending guests their clips, which the follow-up email could carry.
5. **Voices are personal data.**
   - OpusClip's dubbing clones the main speaker's voice and uses it for **everyone** in the clip, so a guest would
     speak in the host's voice.
   - Any dubbing needs each speaker's consent and a "translated, AI voice" label.
6. **AI labels on every platform.** YouTube's synthetic-media flag is already set from AI b-roll. AI video b-roll,
   AI images and dubbing need the equivalent label on Instagram and TikTok too.
7. **Music and Content ID.** A music bed under shorts can draw copyright claims. The show library's licence checks
   (spec 020 E7) apply; the Studio's own wind sounds are safe.
8. **Each platform covers a different part of the screen,** and their length limits keep changing. Today's layout
   keeps everything above y = 1500 for YouTube. TikTok and Reels cover more of the bottom and the right side, so
   one safe area for all three is needed before posting to them. Check each platform's upload limits when that
   phase starts; third-party summaries disagree.
9. **Quotas and limits:**
   - YouTube's default API quota fits about six uploads a day (spec 013). More shorts a day, or more channels,
     means asking Google for more.
   - The Studio's **$10 a day spending limit** (`lib/server/spending.ts`) would refuse AI video or dubbing runs
     unless their costs are reserved and the limit raised.
   - TikTok allows about 15 posts a day per creator. Its audit, without which posts stay private, refuses tools
     that only post to their own team's accounts, so TikTok needs a posting service or posting by hand (6.2).
10. **Jobs only run from `main`.** Every job change is tested on a real episode only after promotion, so the plan
    is many small, promotable PRs, as the October Shorts fixes showed.
11. **Rendering is free while the repository is public.**
    - GitHub's standard runners cost nothing for public repositories, and a job may run 6 hours.
    - The flip side: everything we build is public for anyone to copy.
    - If the repository ever goes private, minutes count: $0.006 a minute on a 2-CPU runner, after $12–18 a month
      included. GPU runners (a T4 at $0.052 a minute) are billed even for public repositories.
12. **Measure before believing a score.** OpusClip's virality score and ours are both a model's guess. Analytics
    (6.5) is the only way to know which clips work for Soul Wisdom's audience, so it belongs early, not last.
13. **YouTube links.**
    - YouTube's terms forbid downloading except where YouTube expressly allows it, or with written permission.
    - The Data API has no download method at all. YouTube Studio's own download is manual and 720p at most.
    - yt-dlp now needs a JavaScript runtime and a "PO token" plugin, and reports say data-centre machines such as
      GitHub's runners get "Sign in to confirm you're not a bot".
    - For our own episodes we never need a link: the recording is already in Storage.
    - For back-catalogue episodes outside the Studio, upload the original file.
    - For other people's videos, the rights question comes before the technical one.
14. **OpusClip's own terms:**
    - projects expire (download everything);
    - non-enterprise videos may train its models;
    - credits on annual plans are reported differently on two of its own pages;
    - the Pro annual price may have risen in October (a third-party tracker says $19.43 a month; its page still
      says $14.50);
    - "Free" on Motion graphics and the AI-image b-roll is marked as a limited-time offer in its code.
15. **Licences for the pieces:**
    - **Caption looks.** A caption look itself is not protected (US copyright excludes lettering and colouring as
      such), but each font file has its own licence. Ours, Outfit and Cinzel, are OFL. Don't name a preset after a
      real person.
    - **Emojis.** Noto Emoji's images are Apache-2.0 and the safest choice. Twemoji needs a credit. OpenMoji is
      share-alike: avoid it.
    - **Sound effects.** Freesound's API needs a negotiated agreement for commercial use, and Pixabay's sounds have
      no API. Stay with the Studio's wind sounds and hand-checked library sounds.
    - **Stock video.** Pexels asks for a prominent link to it inside our app.
16. **Upkeep is the hidden cost of building.** OpusClip changes weekly; every feature we build is ours to keep
    working. The case for building is control, approval, brand and no per-clip bill, not that it will be finished
    once.

## 9. Options

| Option | What it is | Cost a month (3 episodes) | Tom's time an episode | Trade-off |
|---|---|---|---|---|
| **A. Use OpusClip as it is** | Paste each episode, pick clips there, post from there | $29 (basic) to about $129+ (everything on) | 30–60 min in OpusClip, outside the Studio | Fastest; loses approval in the Studio, the brand look, our records; expiry; training |
| **B. Hybrid** (the September plan) | Our picks and approval; OpusClip's API renders the styled clips; we schedule | $29+ (API spends plan credits; 900 a month cap, 10-credit minimum per project) | 10–15 min | Little to build (about 2–3 days); depends on a beta API and its look |
| **C. Build the core** (recommended) | Phases 0–3, 4.1, 5.1–5.2, 6.5–6.6 | About $3–6 (Claude) | 10–15 min in the Studio | 3–4 weeks; we own the upkeep |
| **D. Build everything** | Phases 0–7 | About $3–6, up to about $60–240 with every paid extra on (section 5) | 10–15 min | 6–8 weeks; most of the extra weeks go on features this show may not use |

**Recommendation: C, after the bake-off.** Phase 0 costs an hour and may shrink the plan. Phases 1 and 2 are where
nearly all the visible difference is: layouts, captions and the hook. Distribution beyond YouTube (6.1–6.4) is
worth doing next, in the order the audience is found. Dubbing, AI video, emojis and link import wait until there
is a reason.

## 10. Decisions for Tom

1. **Run the bake-off first?** It takes an hour or two, using OpusClip's Egoless clips before the trial's 7 days
   are up.
2. **What do clips come from:** only our episodes, or any video (7.1)? YouTube links for other people's videos
   (7.2)?
3. **Recording.**
   - Stay with gallery view, so Split is the main layout and Fill looks soft?
   - Or change the recording for sharper single-speaker crops (item 1 in section 8)?
4. **Effects by default:** off and gentle (recommended), or OpusClip's livelier style?
5. **B-roll in clips:** the episode's stills only, plus stock video with a review step? AI video stays dropped
   (N2)?
6. **Platforms, and in what order:** Instagram and Facebook first (free, and no Meta review for our own
   accounts), then LinkedIn and X? TikTok can only go public through a paid service (Ayrshare, $149 a month), as
   drafts to publish from the phone (upload-post, $16–24 a month), or by hand. Which?
7. **Dubbing:** no, as spec 005 decided, unless there is an audience in another language?
8. **Keep OpusClip after the trial?** For the bake-off only, or as option A or B in the meantime?

## Sources

All read on 5 November 2026. Some sources are OpusClip's public app files (marked "app code" above). They show what
the app does today, are not documentation, and can change without notice.

**OpusClip: pricing and credits**

- https://www.opus.pro/pricing (page published 5 Nov 2026)
- https://www.opus.pro/agent/pricing (Max)
- https://help.opus.pro/docs/article/how-are-credits-consumed
- https://help.opus.pro/docs/article/plans-and-credits
- https://www.usagepricing.com/blueprint/activity/opus-clip-2026-10-06-pro-annual-price-rise (third party: the
  reported Pro annual rise)

**OpusClip: Recipes, Brand Kit and the setup screen**

- https://help.opus.pro/docs/article/how-to-use-recipes
- https://help.opus.pro/docs/article/create-and-save-a-custom-recipe
- https://help.opus.pro/docs/article/how-do-recipes-and-brand-kit-work-together
- https://help.opus.pro/docs/article/how-to-use-brand-kit
- https://help.opus.pro/docs/article/layout-and-reframing
- https://help.opus.pro/docs/article/adjust-the-aspect-ratio
- https://help.opus.pro/docs/article/video-languages-supported
- https://help.opus.pro/docs/article/select-subtitle-language
- https://help.opus.pro/docs/article/upload-own-srt
- https://help.opus.pro/docs/article/select-timeframe
- https://help.opus.pro/docs/article/select-clip-length
- https://help.opus.pro/docs/article/get-clips-faq-2 (cropping and upsampling)

**OpusClip: clipping**

- https://help.opus.pro/docs/article/9947095-clip-anything
- https://help.opus.pro/docs/article/clip-anything-prompt-manual
- https://help.opus.pro/docs/article/clipanything-qa-4
- https://help.opus.pro/docs/article/select-keywords
- https://help.opus.pro/docs/article/how-many-clips

**OpusClip: editing features**

- https://help.opus.pro/docs/article/auto-headline
- https://help.opus.pro/docs/article/add-a-viral-hook
- https://help.opus.pro/docs/article/add-motion-graphics
- https://help.opus.pro/docs/article/ai-emojis-keywords
- https://help.opus.pro/docs/article/ai-broll
- https://help.opus.pro/docs/article/speech-cleanup
- https://help.opus.pro/docs/article/speech-enhancement
- https://help.opus.pro/docs/article/auto-sfx
- https://www.opus.pro/tools/zoom-in-effect
- https://help.opus.pro/docs/article/add-transition-effects
- https://help.opus.pro/docs/article/auto-color-correction
- https://help.opus.pro/docs/article/eye-contact-correction
- https://help.opus.pro/docs/article/video-dubbing
- https://help.opus.pro/docs/article/change-captions
- https://help.opus.pro/docs/article/upscale-a-video

**OpusClip: results, export and posting**

- https://help.opus.pro/docs/article/virality-score
- https://help.opus.pro/docs/article/import-to-adobe-premiere
- https://help.opus.pro/docs/article/import-to-davinci-resolve
- https://help.opus.pro/docs/article/add-social-accounts
- https://help.opus.pro/docs/article/schedule-clips
- https://help.opus.pro/docs/article/scheduler-faq-troubleshoot
- https://help.opus.pro/docs/article/bulk-scheduler
- https://help.opus.pro/docs/article/posting-rate-limits
- https://help.opus.pro/docs/article/post-to-x

**OpusClip: import, storage, data and the API**

- https://help.opus.pro/docs/article/auto-import
- https://help.opus.pro/docs/article/saving-your-projects
- https://help.opus.pro/docs/article/features-not-included-free-trial
- https://help.opus.pro/docs/article/opusclip-data-training
- https://help.opus.pro/api-reference/overview
- https://help.opus.pro/api-reference/limitation
- https://help.opus.pro/api-reference/openapi.json
- https://help.opus.pro/llms-full.txt (every help article in one file)

**OpusClip: the web app's public files**

- https://clip.opus.pro/locales/en/clip.json
- https://clip.opus.pro/locales/en/editor.json
- the app's JavaScript bundles under `clip.opus.pro/_next/static/chunks/`: Recipe IDs, caption preset order,
  clip-length options, the top-clips slider, fallback prices
- https://opusclip.canny.io/changelog (headline styles, 21 Oct 2026)

**Dubbing**

- https://elevenlabs.io/pricing/api
- https://elevenlabs.io/docs/capabilities/dubbing
- https://elevenlabs.io/use-policy
- https://rask.ai/pricing
- https://azure.microsoft.com/pricing/details/speech
- https://learn.microsoft.com/azure/ai-services/speech-service/video-translation-overview

**AI video**

- https://cloud.google.com/vertex-ai/generative-ai/pricing (Veo 3.1)
- https://aistudio.google.com/docs/pricing (Gemini Omni Flash)
- https://developers.openai.com/api/docs/deprecations (Sora shut down 24 Sep 2026)
- https://docs.dev.runwayml.com/guides/pricing
- https://lumalabs.ai/api/pricing

**Stock video**

- https://www.pexels.com/api/documentation
- https://www.pexels.com/license
- https://pixabay.com/api/docs
- https://pixabay.com/service/license-summary

**Face detection and reframing**

- https://github.com/google-ai-edge/mediapipe (Apache-2.0)
- https://developers.google.com/edge/mediapipe/solutions/vision/face_detector
- https://github.com/opencv/opencv_zoo (YuNet, MIT)
- https://github.com/TaoRuijie/TalkNet-ASD
- https://github.com/Junhua-Liao/Light-ASD
- https://www.ultralytics.com/license (AGPL-3.0)
- https://cloudinary.com/documentation/transformation_counts

**Upscaling**

- https://developer.topazlabs.com/getting-started/model-pricing/video-models.md
- https://fal.ai/models/topaz/upscale/video/precision
- https://replicate.com/pricing

**Posting**

- https://developers.tiktok.com/doc/content-posting-api-get-started
- https://developers.tiktok.com/doc/content-sharing-guidelines
- https://developers.facebook.com/docs/instagram-platform/content-publishing
- https://developers.facebook.com/docs/video-api/guides/reels-publishing
- https://learn.microsoft.com/linkedin/marketing/community-management/shares/videos-api
- https://docs.x.com/x-api/getting-started/pricing
- https://www.ayrshare.com/pricing
- https://www.upload-post.com/pricing
- https://buffer.com/pricing

**YouTube**

- https://www.youtube.com/static?template=terms
- https://developers.google.com/youtube/v3/docs/videos
- https://support.google.com/youtube/answer/56100
- https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide

**Licences**

- https://github.com/googlefonts/noto-emoji
- https://github.com/jdecked/twemoji
- https://github.com/hfg-gmuend/openmoji
- https://freesound.org/help/tos_api
- https://www.law.cornell.edu/cfr/text/37/202.1

**GitHub Actions**

- https://docs.github.com/en/billing/reference/actions-runner-pricing
- https://docs.github.com/en/actions/reference/runners/github-hosted-runners

**Zoom recording resolution** (forum answers, not Zoom's documentation)

- https://community.zoom.com/meetings-2/record-active-speaker-gallery-view-and-shared-screen-separately-not-recording-in-1080p-8268
- https://community.zoom.com/meetings-2/video-quality-active-speaker-cloud-recording-41290

**Earlier research in this repository**

- `docs/research/2026-09-21-podcast-pipeline-options.md`
- `docs/research/2026-09-22-podcast-pipeline-executive-report.md` (OpusClip as a render service; the $50 an hour
  rate)
