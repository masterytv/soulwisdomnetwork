# Spec 024: Studio readability

**Date:** 17 November 2026
**Status:** Built
**Related:** `docs/specs/020-studio-editor.md` (the editor, which reads more compactly), WCAG 2.2 level AA

## Goal

The Podcast Studio was hard to read for a producer working with Tom: small text, dim grey, and buttons whose edges could
barely be seen. Every Studio page now reads more easily by default, and a **High contrast** switch and a **Text size**
control in the Studio bar change the whole Studio at once, for each person.

## What was wrong (measured on the Studio's own colours, against the card colour #1E1035)

| Problem | Measured | Now |
| --- | --- | --- |
| Every outlined button and hint (`text-xs`) | 12px, about 190 places | 15px |
| Tiny labels (`text-[8px]` to `text-[11px]`) | 8–11px, about 30 places | 13px (`text-2xs`); 12px in the editor; the timeline's clip labels 11px (were 9px), fixed in their 16px tracks; the glyphs in its little markers stay as they were |
| `text-gray-500` | 3.7 : 1 (AA needs 4.5) | 6.7 : 1 |
| `text-gray-600` | 2.4 : 1 | 6.7 : 1 |
| Button and field edges (`border-white/10`, `/15`) | about 1.5 : 1 (WCAG 1.4.11 needs 3) | 4.8 : 1 |
| Steps to come and steps done | colour only | steps to come are dashed, the current one has ▶ |
| Delete, Start over and Finished | all alike | Delete is red |
| The words of an "In this episode" clip | boxed word by word, small | underlined in gold, 16px |
| The green Approve buttons (white on emerald-600) | 3.7 : 1 | emerald-700, 5.4 : 1 |

## Decisions (Tom, 17 November 2026)

- **Easier to read is the default** for everyone; high contrast is on top of it.
- **A text size control** beside the switch: Normal, Large (×1.15) and Larger (×1.3).
- **The Studio editor is included.** It fits a script, preview, panels and timeline in one window, so its text grows
  less (13px for `text-xs`), and the timeline's smallest labels grow at most one step, to stay inside their tracks.

## How it works

- `components/studio/readability.tsx` `StudioFrame` wraps every Studio page (`app/admin/podcast/layout.tsx`,
  `app/admin/usage/layout.tsx`) in `<div class="studio" data-contrast data-text>` and shows the controls in a bar at the
  top. The editor shows them in its own bar instead (`studio-editor/page.tsx`).
- The look is CSS in `app/globals.css`. Tailwind v4's `text-*` sizes and greys read CSS variables, so `.studio` redefines
  `--text-xs`, `--text-sm`, … (times `--studio-scale`) and `--color-gray-400`/`500`/`600` for the whole Studio, without
  changing each page. `[data-studio-dense]` (the editor's workspace) sets its smaller sizes.
- Tailwind bakes transparency into a class (`border-white/10` is 10% white, whatever the variables say), so the Studio's
  surfaces and edges have names of their own in `@theme`: `bg-studio-page`, `-card`, `-panel`, `-raised`, `-deep`,
  `-sunk`, and `border-studio-edge` (a control's edge), `-line` (a card's outline) and `-hairline` (a divider). A
  button, link or field drawn with a card's outline gets the control's edge from CSS, so its hover and focus colours
  still win.
- **High contrast** (`data-contrast="high"`) redefines those colours: black surfaces, white text and edges (21 : 1), the
  ambers as one yellow (#ffd400, 14.7 : 1), lighter greens, reds and blues, and 2px edges on controls.
- Everywhere in the Studio: a 3px yellow keyboard focus ring (not on the editor's own shortcut area,
  `data-focus-container`), underlined links (not those drawn as buttons or pills), and animations stopped when the
  computer asks for reduced motion.
- `lib/readability.ts` reads and writes the choice (localStorage `studio-readability`, so it is per person and per
  browser). Until a person chooses, high contrast follows the computer's "Increase contrast" setting
  (`prefers-contrast: more`).

## Out of scope

The public site, the community feed and the site's own header are unchanged. What the Studio draws as pictures (the
thumbnail canvas, the graphics templates, the video itself) is unchanged: it is what viewers see.
