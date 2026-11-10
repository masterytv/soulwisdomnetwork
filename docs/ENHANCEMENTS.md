# Possible enhancements

Ideas worth keeping that nobody has agreed to build yet. `docs/BACKLOG.md` holds what *has* been
agreed. When one of these is chosen, move it there (or straight into a numbered spec).

## Open-source tools (reviewed 2026-11-03)

Reviewed from a list of free video-editing repositories, checked against the pipeline as it
stands. None is needed now.

### Worth trying later

- **rembg: hosts cut out for thumbnails** (https://github.com/danielgatis/rembg, MIT).
  `agent/src/podcast/thumbnails.ts` offers a frame from the episode, brand options and an AI
  background, but the frame keeps its own room behind it. rembg could take the room out so the
  host stands over the AI background, the usual YouTube thumbnail look. It only works on a few
  stills, so it runs on an ordinary GitHub Actions runner in seconds, with no GPU. It fits the
  existing frame → background → texts flow.
  - Possibly paired with **Real-ESRGAN** (https://github.com/xinntao/Real-ESRGAN, BSD-3) to
    sharpen that one still frame before it is cut out: Zoom often records at 720p. Not for
    video (see below).
- **librosa: the opening's cuts on the music's beat** (https://github.com/librosa/librosa, ISC).
  Build the opening (`buildOpening` in `lib/programme.ts`) puts teaser clips over music with
  dissolves timed without knowing the music's beat. librosa could find each library track's
  beats once, when it is added to the show library (`lib/server/library.ts`, the same moment its
  licence is checked), and save them with it. `buildOpening` would then move each dissolve to the
  nearest beat. Small, cheap, and you'd notice it on every episode.
- **color-matcher: the two hosts' cameras matched** (https://github.com/hahnec/color-matcher;
  check the licence, believed GPL). Two webcams rarely agree on colour, and it shows when a cut
  goes from one host to the other. It could measure each camera's colour once per episode and
  give the render a correction (for example a LUT for ffmpeg's `lut3d`), as Studio sound gives
  each speaker their own EQ and level. An experiment: compare it on one episode before building
  it in.

### Already covered

- **Auto-Editor**: already used, as a pinned binary, for the Resolve/Premiere/Final Cut hand-off
  (`agent/src/podcast/editExport.ts`). Dead air is cut from the transcript and the measured
  silences (`agent/src/podcast/silences.ts`, `firstEdit`), more accurately than loudness alone.
- **HyperFrames** (https://github.com/heygen-com/hyperframes): the same idea as our motion
  graphics (`agent/src/podcast/graphics/`, HTML drawn by headless Chromium into transparent
  clips). Maybe worth skimming for animation ideas; no reason to switch.
- **FFmpeg**: does every encode already, pinned by sha256 (`.github/actions/ffmpeg`).

### Not useful for this show

- **vid.stab**: webcams sit still; nothing to steady.
- **RIFE**: slow motion has no place in a conversation.
- **PySceneDetect**: a Zoom recording has almost no shot changes; ffmpeg's own scene filter
  covers the rare case.
- **Real-ESRGAN on video**: a 60-minute episode is about 100,000 frames, impractical without a
  GPU, and AI upscaling can make faces look waxy.
- **Demucs**: splits music into stems. Voice clean-up is already DeepFilterNet, Studio sound and
  Auphonic.
