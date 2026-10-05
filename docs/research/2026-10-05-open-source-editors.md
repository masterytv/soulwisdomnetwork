# Open-source Descript alternatives: what to take from each

**Date:** 5 October 2026
**Asked by:** Tom, while Editor Light (`docs/specs/015-editor-light.md`) was being merged
**Question:** Should we adopt Rescript, CutScript or another open-source editor instead of
building our own, and what is the most robust way to build the full podcast pipeline?
**Plan that came out of it:** `docs/specs/019-editor-light-v2.md`

## Answer

Keep our own Editor Light. Its design is the most robust of everything reviewed:
- the edit is a list of cuts on the episode in Firestore;
- the producer edits in the browser on a 720p proxy;
- ffmpeg renders the full-resolution file in GitHub Actions.

None of the projects below handles hour-long episodes, a shared database, approvals and a
headless render better. Their value is in specific ideas, and a little MIT or public-domain code.
Spec 019 lists what we take, in what order.

## How this was checked

- Rescript and CutScript were cloned and read in full. Rescript's MIT snapshot was compared with
  its current code.
- auto-editor, DeepFilterNet and Remotion were downloaded and **run** in a sandbox like a GitHub
  Actions runner (4 vCPU, 15 GB, Ubuntu's ffmpeg 6.1.1). Their numbers below are measured.
- auphonic.com and remotion.dev were blocked from the sandbox. Their prices and API details come
  from third-party pages and a 2024 copy of Auphonic's `info.json`. **Check them before relying
  on them.**
- Star counts and dates are approximate (the GitHub API was blocked).
- Licences were read from each repo's LICENSE file. This is not legal advice.

## The candidates

### Rescript — https://github.com/wassgha/rescript

The closest match to us: Next.js 16, React 19, Tailwind v4 and TypeScript, about 920 stars, and
very active (v1.2.4 on 4 October 2026). It is effectively one developer, with many commits by an
AI agent.

**Licence: PolyForm Noncommercial 1.0.0 since commit `a9b378e` (31 July 2026).** We cannot use
the current code. The tree just before it (`a9b378e^`, tags up to v1.0.9) is MIT, and can be used
with its copyright notice kept. Commit `608c2d4` (timeline export) is dated before the change but
is **not** in the MIT tree.

**How it works:**
- Everything runs on the user's device:
  - Whisper and speaker detection in the browser (transformers.js, ONNX);
  - render with ffmpeg.wasm, or native ffmpeg in its Electron app.
- Storage is IndexedDB.

**Worth taking:**

| Idea | In the MIT tree? | How it works |
|---|---|---|
| Correct a misheard word | Yes (`lib/store.ts` `correctWords`) | Typed text is split into words. They share the old words' time span in proportion to their length. One undo step. No re-alignment against the audio. |
| Waveform under the timeline | Yes (`components/Timeline.tsx`) | Canvas, visible window only. Min/max of the samples in each pixel column. Cut parts drawn red and hatched. Zoom 1–256× at the pointer. |
| Drag cut edges and word edges | Yes (`lib/edits.ts` `clampWordBounds`, `trimEdge`) | Words are at least 20 ms long and cannot cross a neighbour. A clip can only reclaim the gap next to it. |
| A drag is one undo step | Yes (`beginGesture`/`endGesture`) | A gesture opens one history entry, and drops it if nothing changed. |
| Autosave that survives a closed tab | Yes (`lib/autosave.ts`) | 500 ms debounce, one write in flight plus one queued, flushed when the tab is hidden. |
| Silences from word gaps | Yes (`lib/silences.ts`) | Gaps of at least 0.3 s, keeping 0.05 s next to speech. The same idea as our `suggestCuts`. |
| Speech the transcript missed | **No** (`lib/disfluencies.ts`, noncommercial) | Where voice detection hears speech that no word covers for at least 0.3 s, it inserts a `...` word that can be cut. Usually a dropped "um". |
| Restore all fillers / all silences | **No** (noncommercial) | Puts back every cut of one kind. |
| Export to Resolve, Premiere, Final Cut, AAF, Reaper | **No** (`lib/serializeTimeline.ts`, noncommercial) | Each kept range becomes one clip, rounded to whole frames. |

**Not worth taking:**
- Transcription and rendering in the browser do not suit hour-long episodes.
- ffmpeg.wasm needs cross-origin-isolation headers (COOP/COEP), and COOP would likely break our
  Google pop-up sign-in.
- Its UI components depend on its own store, so they would not drop into our app.

**Its preview** seeks past cuts on one media element, exactly like ours. Neither repo has gapless
playback or crossfades.

### CutScript — https://github.com/DataAnts-AI/CutScript

**Licence: MIT.** About 260 stars. Electron and React, with a Python FastAPI backend (WhisperX,
pyannote, DeepFilterNet, torch).

It is effectively abandoned and a prototype. The editor arrived in one commit on 3 March 2026,
and the last commit was 6 March. There are no tests.

**Worth taking:**
- **The idea of a Claude clean-up pass.** It sends `index: word` lines, and the model returns word
  indexes with a reason for each: fillers, "you know", "I mean", stammers.
  - Its prompt (`backend/services/ai_provider.py`) is a usable start.
  - Its flaw is that it deletes everything returned. We must make each one a suggestion the
    producer reviews.
- **DeepFilterNet as a stronger voice clean-up**, see below.

**Avoid:**
- **Its captions drift out of sync after every cut.** The remaining words keep their original
  times. Ours (`editedWords`) already move words onto the edited timeline.
- Stream-copy joins, which cut on keyframes, not words.
- Upscaling everything to 1080p.
- `eval()` on ffprobe output.
- A local `/file?path=` endpoint open to any site.

### auto-editor — https://github.com/WyattBlue/auto-editor

**Licence: Unlicense (public domain).** About 5,400 stars, very active (31.7.2 on 3 October 2026).
It is now written in Nim, and pip and apt copies are old. In CI, use the release binary:
`auto-editor-linux-x86_64`, 46 MB, needing only libc and libstdc++. Pin the version.

A licence key only gates renders over 3200×1800 and multi-source renders. Analysis and exports
are free.

**Measured here:**
- **Pauses by loudness:** an hour of audio was analysed in **1.3 s**.
  - Command: `--edit audio:threshold=0.04` (or `audio:-30dB`) `--margin 0.2s --export v1 -o -`
    writes JSON to stdout.
  - `-tb 1000` gives times in milliseconds.
  - v1 output: `{"chunks": [[startFrame, endFrame, speed]]}`. A speed of `99999` means cut.
- **Edit export:** it reads a timeline we write (its v3 JSON) and exports `premiere` (FCP7 XML),
  `resolve-fcp7`, `final-cut-pro`/`resolve` (FCPXML 1.11, or 1.10 with `:version=10`), `shotcut`,
  `kdenlive` and `premiere-otio`.
  - A hand-written two-range cut list exported correctly to Premiere XML and FCPXML.
  - The source file must be present when it runs, because it is probed.
  - Paths come out absolute; rewrite them for the producer.

`--export json` and `--export timeline` do not exist, whatever older posts say. `-o x.json` is
silently renamed to `x.v3`.

### DeepFilterNet — https://github.com/Rikorose/DeepFilterNet

**Licence: MIT or Apache-2.0.** A neural noise remover, clearly better than RNNoise in published
tests (DFN3 PESQ 3.17 on VoiceBank+DEMAND). It is **frozen**: last commit October 2024, v0.5.6.

**Running it:**
- Release assets: `deep-filter-0.5.6-x86_64-unknown-linux-musl` (a CLI that takes 48 kHz WAV
  only), and `libdeep_filter_ladspa-0.5.6-x86_64-unknown-linux-gnu.so`.
- **The LADSPA plugin runs inside our existing ffmpeg chain:**
  `aresample=48000,ladspa=file=…/libdeep_filter_ladspa.so:plugin=deep_filter_mono:controls=c0=100`
  (`c0` is the attenuation limit in dB).

**Measured speed:**

| Clean-up | Time per minute of audio, one core | Per hour of audio |
|---|---|---|
| Current chain (highpass, afftdn, compressor) | 0.5 s | about 30 s |
| DeepFilterNet CLI | 21 s | about 21 min |
| DeepFilterNet in ffmpeg (LADSPA) | 25 s | about 25 min |

It uses one core. Splitting the audio into four parallel pieces should bring an hour down to
about 6 minutes (not measured).

### Auphonic — https://auphonic.com (a paid service with an API, not open source)

**Already in the repo:** `agent/src/podcast/auphonic.ts`, command line only, never called live.

**What it offers:**
- Levelling, noise, reverb and hum removal, and loudness targets from −13 to −19 LUFS with a
  true-peak limit.
- Automatic cutting of fillers, silences, coughs and music.
  - Cutting can be **applied**, or exported as a **cut list** with uncut audio: Reaper CSV,
    Audacity, Audition, a Resolve EDL, FCP7 XML or FCPXML.
  - Our `auphonic.ts` asks for the Reaper CSV, and turns it into our cuts.
- **Multitrack:** one file per speaker, with per-track levelling and gating, crosstalk handling
  and a "mic bleed remover".
- Video cutting since April 2026.

**Prices (third-party, check at auphonic.com/pricing):**
- Free: 2 hours a month.
- Monthly: $11 for 9 h, $24 for 21 h, $49 for 45 h.
- One-off credits: $12 for 5 h.

**Before going live**, check the field names `auphonic.ts` sends (`cut_mode`, `filler_cutter`,
`silence_cutter`, `cough_cutter`) against `GET https://auphonic.com/api/info.json`. The 2024 copy
used a boolean `export_uncut_audio` instead of `cut_mode`.

### Rendering graphics: Remotion and Revideo

- **Remotion:** source-available.
  - Free for individuals and companies of **up to 3 employees**. Bigger companies need a
    Company Licence: about $100 a month minimum for automated renders.
  - Measured here: a 60 s 1080×1920 text-and-gradient Short rendered headless in **110 s**,
    with no GPU.
  - The repo once had a `remotion/` starter. It was deleted, but `package.json` still has a dead
    `"video"` script.
- **Revideo** (https://github.com/midrender/revideo): **MIT**. It renders headless the same way.
  Turn its telemetry off with `DISABLE_TELEMETRY=true`.
- **For us:** neither is needed for cutting. They matter only if we want animated captions,
  audiograms or lower thirds beyond what ffmpeg and ASS already do in `shortsRender.ts`.
  **Choose Revideo** unless we are certain we stay at 3 people or fewer.

### Checked and ruled out

| Project | Why not |
|---|---|
| Audapolis, transcribee | AGPL-3.0. Audapolis has had no code changes since October 2023. Ideas only. |
| OpenCut | MIT and very popular, but being rewritten in Rust as a desktop app. Nothing to use today. |
| Twick | Source-available. Renders through Puppeteer, which is fragile in CI. |
| Editly, Motion Canvas | No commits since February 2025. |
| designcombo / OpenVideo | Same 3-employee licence as Remotion; renders in the browser only. |
| Diffusion Studio core | Free use must put a "Made with Diffusion Studio" watermark on videos. |
| ffmpeg.wasm | Fine for short previews; memory-limited for hour-long episodes. |
| WhisperX | AssemblyAI already gives us word times and speaker names. |
| OpenTimelineIO | A good model, but no JavaScript library. Final Cut cannot import it; Premiere only from 25.6. |

## Edit export formats

For an "open this edit in a full editor" escape hatch:

| Format | Resolve (free) | Premiere | Final Cut | Notes |
|---|---|---|---|---|
| FCP7 XML (xmeml) | Yes | Yes | No | Whole-frame in and out points; carries the media path |
| FCPXML 1.10 | Yes | No | Yes | Times must be multiples of the frame duration (`1001/30000s` at 29.97) |
| CMX3600 EDL | Yes | Yes | No | No media path; 8-character reels; fallback only |
| OTIO | Yes (18.5+) | 25.6+ | No | |

**Descript imports none of them.** It only exports them.

**Choice:** FCP7 XML and FCPXML 1.10, made by auto-editor from our cut list.

## Useful ffmpeg checks (measured)

- **Pauses from the audio:**
  `ffmpeg -i f -af silencedetect=noise=-35dB:d=0.5,ametadata=mode=print:file=- -vn -f null -`
  prints `lavfi.silence_start=` and `lavfi.silence_end=` lines.
- **Loudness of a finished file:** `ffmpeg -i f -af ebur128=peak=true -vn -f null -` gives the
  integrated loudness (I), range (LRA) and peak.
  - On the second `loudnorm` pass, check `"normalization_type":"linear"`. It quietly turns
    `dynamic` when the true-peak limit cannot be met.
- **Black frames:** `-vf blackdetect=d=0.5:pix_th=0.1` prints `black_start`, `black_end` and
  `black_duration`.

## Where to get them again

The research clones were in a temporary sandbox and are gone. To look again:

```bash
git clone https://github.com/wassgha/rescript && cd rescript && git checkout a9b378e^   # the MIT tree only
git clone https://github.com/DataAnts-AI/CutScript                                       # MIT
curl -L -o auto-editor https://github.com/WyattBlue/auto-editor/releases/download/31.7.2/auto-editor-linux-x86_64
curl -LO https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6/libdeep_filter_ladspa-0.5.6-x86_64-unknown-linux-gnu.so
```

**Never open Rescript's current code (anything at or after `a9b378e`, and `608c2d4`) when
building the features spec 019 marks "idea only".** Work from the descriptions in this document
and in spec 019.
