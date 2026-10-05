# Feature backlog

Features and fixes agreed but not built yet. Add to it when something is decided for later;
move an item into a numbered spec (`docs/specs/NNN-name.md`) when work on it starts, and delete
it here when it ships.

## Distribution

- **Post shorts (and episode clips) to other platforms.** Today the shorts go to YouTube only
  (spec 013). The same rendered files could go to:
  - **Instagram Reels**: planned in specs 005 and 013 ("Instagram later"). Posting goes through
    the Instagram Graph API, which needs a Business or Creator account linked to a Facebook Page.
  - **TikTok**: their posting API only allows private posts from apps that have not passed
    TikTok's audit, and the audit takes an unpredictable time (spec 005). Start the
    application early, and add TikTok when it clears.
  - **Others** (Facebook, LinkedIn, X) if wanted.

  Each platform needs its own sign-in secrets, a per-platform caption (from the short's title
  and the episode link), and its own schedule beside YouTube's one a day.
- **Weekly performance pull** (spec 005): views, watch time, retention and click-through for
  each episode and short, from YouTube and then the other platforms.

## Second podcast

- **Per-show settings**: YouTube channel, intro and outro, branding, Claude prompts, Drive
  folders and shorts schedule, so the Studio can run more than one show.
- Then **SETUP.md** (run your own copy), **CONTRIBUTING.md** and a **license** (Tom to choose).

## Editor Light (replacing Descript)

- **Editor Light v2** (`docs/specs/019-editor-light-v2.md`): the best ideas from Rescript, CutScript,
  auto-editor, DeepFilterNet and Auphonic, in phases, to start once the current plan is done. The
  research behind it is `docs/research/2026-10-05-open-source-editors.md`. The full editing page
  (split, timeline with audio, transitions, media, overlays, music) is `docs/specs/020-studio-editor.md`.
  Start at `docs/PLANNING.md`.

## Studio

- **Shorts cover-frame slider**: pick the frame YouTube shows for each short.

## Community site

- **Community feed, next steps** (spec 016): more than one community; editing posts and
  comments; reporting a post to the admins; reply notifications; link previews; search.
- **Older profiles named after their email**: members who signed up with email and password
  before spec 016 are named after the part of their email before the @. They can rename
  themselves in Edit profile; an admin could rename the rest.
- **People directory.**

## Not code

- **Daniel** to review the privacy policy and terms.
