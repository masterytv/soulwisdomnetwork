# Spec 021 design reference

The approved look for spec 021 (`docs/specs/021-motion-graphics.md`), copied from the
"Soul Wisdom Motion Templates" design canvas on 26 October 2026. Each file is one template at its
real size (1920×1080, the Short 1080×1920), looping so the motion can be judged.

These are **design references, not runtime code.** They are Design Component pages
(`<x-dc>`, `support.js`), which only run inside the design canvas. The graphics renderer (spec 021
item M1) rebuilds each one as a plain HTML template with the same markup, colours, type and
keyframes, and swaps the review loop for the in / hold / out timing in the spec.

| File | Template | Spec id |
|---|---|---|
| Main.dc.html | Episode title card | `titleCard` |
| LogoSting.dc.html | Logo sting | `logoSting` |
| Stinger.dc.html | Starlight transition | `starlight` (a transition, not a layer) |
| LowerThirdGuest.dc.html | Lower third, guest | `lowerThird` |
| LowerThirdHosts.dc.html | Lower thirds, hosts, and the logo bug | `lowerThird` (compact), `logoBug` |
| TeaserTag.dc.html | "In this episode" tag | `teaserTag` |
| Quote.dc.html | Full-screen pull quote | `pullQuote` |
| Chapter.dc.html | Chapter divider | `chapter` |
| Concept.dc.html | Key idea callout | `keyIdea` |
| EndScreen.dc.html | End screen | `endScreen` |
| Short.dc.html | Shorts overlay | `short` (later; see the spec) |
| System.dc.html | Colour, type and motion rules | — |
| HighlightSplit.dc.html | Highlight: split, quote right | `splitQuote` |
| HighlightWord.dc.html | Highlight: stressed word | `splitWord` |
| HighlightBelow.dc.html | Highlight: quote under the video | `below` |
| HighlightOver.dc.html | Highlight: words over the video | `over` |
| HighlightClose.dc.html | Highlight: close the video | `iris` |
| HighlightPush.dc.html | Highlight: push to a side panel | `push` |

Bracketed text (`[Guest Name]`, `[SPEAKER FOOTAGE]`) is placeholder; the grey plates stand in for
the episode's video. The sample quotes are lines from the home page's "What we hold to".
