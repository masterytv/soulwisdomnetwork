# Render fonts

Fonts the podcast jobs use on the GitHub Actions runner, so a render never downloads one:

- `Outfit-SemiBold.ttf`, `Outfit-Black.ttf`: the captions', titles' and Shorts' text (ffmpeg's `fontsdir`),
  copyright 2021 The Outfit Project Authors (`OFL.txt`).
- `Cinzel-latin.woff2`: the motion graphics templates' titling face (docs/specs/021-motion-graphics.md),
  the variable font's Latin file as Google Fonts serves it, saved on 26 October 2026; copyright 2020 The
  Cinzel Project Authors (`OFL-Cinzel.txt`). The templates load it, and the site's `app/fonts/Outfit-latin.woff2`,
  from these files only (agent/src/podcast/graphics/files.ts) — never from the network.

- `EBGaramond-Italic-latin.woff2`: the templates' quote face, the variable italic's Latin file as Google
  Fonts serves it, saved on 26 October 2026; copyright 2017 The EB Garamond Project Authors
  (https://github.com/octaviopardo/EBGaramond12), SIL OFL 1.1 like the rest.

All under the SIL Open Font License 1.1, which allows bundling them here.
