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
- `OpenSans-Regular.ttf`/`-Bold.ttf`, `Roboto-Regular.ttf`/`-Bold.ttf`, `Lato-Regular.ttf`/`-Bold.ttf`,
  `EBGaramond-Regular.ttf`, `DejaVuSerif.ttf`: the on-screen text families (`lib/onScreen.ts` FONTS), which the
  render's `fontsdir` serves to libass like the Outfit pair, so no job installs fonts from apt (whose mirror
  kept stalling CI). The static instances as Google Fonts served them, saved on 27 October 2026
  (`OFL-OpenSans.txt`, `OFL-Roboto.txt`, `OFL-Lato.txt`, `OFL-EBGaramond.txt`), and DejaVu Serif 2.37 from
  https://github.com/dejavu-fonts/dejavu-fonts (`LICENSE-DejaVu.txt`, Bitstream Vera licence: free to bundle).

All the rest under the SIL Open Font License 1.1, which allows bundling them here.
