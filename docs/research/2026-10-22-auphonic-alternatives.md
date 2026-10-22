# Free, open-source stand-ins for Auphonic (22 October 2026)

Tom asked whether free tools could replace Auphonic in the pipeline, as automatic as possible, so the voices sound
normalized, full and professional. This is what was found, and why spec 019 item 3.4 (Studio sound) is built the way
it is. Licences and dates were read from the projects' own pages on this date; speeds were not measured unless said.

## Summary

No maintained open-source project does everything Auphonic does (leveller, noise removal, automatic EQ, loudness,
multitrack) in one step; searches find only paid alternatives and the long-dead Levelator. Its parts, though, are all
available free: ffmpeg has a leveller, de-esser, EQ, compressor, limiter and two-pass loudness, and DeepFilterNet
(already in the pipeline) removes noise. The one missing part is the **automatic EQ**, which item 3.4 builds: each
speaker measured against the average speech spectrum (ANSI S3.5-1997), within limits.

## Candidates

| Tool | What it does | Licence | Maintained | Verdict |
|---|---|---|---|---|
| ffmpeg filters (`speechnorm`, `dynaudnorm`, `agate`, `deesser`, `adynamicequalizer`, `equalizer`, `acompressor`, `alimiter`, `loudnorm`) | Levelling, gating, de-essing, EQ, compression, limiting, loudness | LGPL/GPL (the build) | Yes | **Used** (item 3.4) |
| DeepFilterNet (Rikorose) | Neural noise removal at 48 kHz | MIT or Apache-2.0 | Release 0.5.6 (2023); last commit October 2024 | **Used**, held to 30 dB of reduction |
| ffmpeg-normalize (slhck) | Two-pass EBU R128 normalization driving ffmpeg | MIT | 1.43.0, October 2026 | Not needed: the render's own two-pass `loudnorm` does the same |
| "Loudness.ai Developer Kit" (`loudness-audio-kit` on PyPI) | Real, MIT wrapper code, uploaded 13 October 2026 | MIT (code); the weights' licence is the publisher's "interpretation" | New, 8 commits | Nothing new: inside is DeepFilterNet3 (ONNX) and `highpass`, `acompressor`, two-pass `loudnorm` |
| Matchering (sergree) | Matches a track's level, EQ, peak and width to a reference | GPL-3.0 | Last release 2022 | Made for music (brickwall limiter, stereo width); needs a reference track. Not used |
| LUFScale | Desktop loudness normalizer (macOS, Windows) | GPL-3.0-or-later | 2026 | Not a Linux command-line tool |
| Audacity, Ardour | Editors (DAWs) | GPL | Yes | Manual, not automatic |
| Spotify pedalboard | Python audio effects, VST3 hosting | GPL-3.0 | 0.9.26, October 2026 | ffmpeg already covers it |
| LSP plugins (LV2/LADSPA) | Broadcast-grade compressor, de-esser, EQ, limiter | LGPL-3.0 | Yes | A possible upgrade through ffmpeg's `lv2` filter; the runner's ffmpeg build was not checked for it |
| ClearerVoice-Studio (`clearvoice`, MossFormer2_SE_48K, SR_48K) | AI enhancement and super-resolution | Apache-2.0 code; **model licence not stated** | PyPI 0.1.2, July 2025 | Best AI candidate for a blind test; needs PyTorch (~2 GB) and models from Hugging Face |
| Resemble Enhance | AI denoise plus a generative "studio quality" step | MIT | Last commit December 2024 | Worth a blind test; can invent "s" sounds or breaths |
| Sidon (sarulab) | Speech restoration through a vocoder | MIT | 2025–26 | Experimental; resynthesis can change the voice |
| VoiceFixer | General restoration through a vocoder | MIT | 2023 | Old; changes the voice's character |
| Meta denoiser | Noise removal | **CC-BY-NC 4.0 (non-commercial)**; archived 2023 | No | Excluded |

GPL tools would be fine here: they run as separate programs on our own runner and are never distributed. Only
non-commercial terms rule a tool out.

## The target spectrum

ANSI S3.5-1997 (Speech Intelligibility Index), table 3, standard speech spectrum level at normal vocal effort, dB per
Hz at one-third-octave centres 160 Hz–8 kHz: 32.41, 34.48, 34.75, 33.98, 34.59, 34.27, 32.06, 28.30, 25.01, 23.00,
20.15, 17.32, 13.18, 11.55, 9.33, 5.31, 2.59, 1.13. The standard itself is sold; the values were checked against
three open-source copies that agree exactly: the CRAN `SII` package (`data/onethird.rda` and
`inst/extdata/SII_Constants.xls`, https://github.com/cran/SII) and a MATLAB SII
(https://github.com/UKY-Distributed-Audio-Lab/Array-Toolbox, `sii.m`). Byrne et al. (1994)'s international LTASS
(openMHA's `LTASS_speech_level_in_frequency_bands.m`) has the same shape and reaches 63 Hz–16 kHz, if a wider range is
ever wanted.

## Not checked

- The AI enhancers' speed on the runner (4 cores, no GPU) and how they sound; Hugging Face and the PyTorch index are
  not reachable from the sandbox.
- ClearerVoice's model licence (its Hugging Face pages could not be read).
