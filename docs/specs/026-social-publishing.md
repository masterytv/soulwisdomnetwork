# Spec 026: Social publishing

**Date:** 23 November 2026
**Status:** Approved (Tom's answers of 23 November, 2:54 pm ET, in Decisions). Stage 1 (this spec) written; stage 2 (Reels) and stage 3 (image posts) built; stages 4–5 to build
**Related:** `docs/specs/013-shorts.md` (the Shorts this posts), `docs/specs/025-clips.md` (the shared publishing helpers),
`DECISIONS.md` (D-2026-11-23-swc-autopost), the plan doc's "SWC publishing plan" tab
(https://claude.ai/artifact/2nQRFNeyJu55zqyrt8GGnu), and Project Profound's finished version in `masterytv/short-maker`
(`src/lib/social/`, `src/app/social/`), which this copies where it fits. Nothing is imported across repos.

## Goal

Every Short that goes to YouTube also goes to Soul Wisdom's Instagram and Facebook, through Upload-Post (profile
`soul_wisdom_collective`, Basic plan, the same account and API key as Project Profound's):

1. **Reel**: the Short's own MP4, as on YouTube, 3 hours after YouTube publishes it.
2. **Image post**: a quote card with the speaker's own words from the Short over a frame of them.
3. **Story carousel**: up to 9 frames from the Short's stretch of the episode, each with a 5 to 15-word line retelling
   the moment; the last slide is always soulwisdomcollective.com.

No data card and no Facebook link post for now. A link post may come later, once each episode has its own page on the site.

**YouTube channel posts, by hand for now.** YouTube's posts API (`posts.insert`, 1 to 10 images) is open only to approved
launch partners until general availability, planned for 2027. It needs OAuth with the `youtube` scope and can't schedule
posts. So each carousel on the Studio Social page has a **YouTube post** button that downloads its slide images (JPEG,
4:5) and a ready-to-paste text: the title, the speaker's credit and the episode link. The images and text are stored on
the post (`content.youtube`), so automatic posting can be added once the API opens.

## Decisions (23 November 2026, Tom)

| Question | Tom's answer |
|---|---|
| Do Soul Wisdom's posts go out by themselves? | Yes (D-2026-11-23-swc-autopost in `DECISIONS.md`) |
| Spacing | Reels follow YouTube, 2 a day. Carousels and image posts are queued at 1 a day each, in the Shorts' order |
| Times | Each Reel 3 hours after its Short's YouTube `publishAt`. Feed posts at 7 pm ET; when a carousel and an image post fall on the same day, the image post goes at 7:30 pm |
| Which Shorts | Every Short approved at Checkpoint E and scheduled on YouTube |

Settled in the plan, kept here:

- **Frames come from the episode's final cut, not the rendered Short.** The Shorts have captions burned in. ffmpeg takes
  clean frames from the final cut within each Short's `startMs`–`endMs`, cropped to 4:5 around the speaker.
- **Claude's words are checked in code.** A carousel slide is kept only when its frame exists, its line has 5 to 15
  words, it has no limited words, and its gold phrase is copied exactly from the line. Fewer than 4 slides: no carousel
  (noted once as cancelled, so it isn't tried or paid for again). The quote card's words are the speaker's own,
  copied exactly from the Short's transcript, and its gold phrase is copied exactly from the quote.
- **Every card carries the Soul Wisdom logo and one key phrase in the gold accent `#f7c65b`.** Cards are 1080 × 1350
  JPEG (Instagram's API takes no other picture format), in the Studio's brand: background `#140a2e`, Outfit and Cinzel.
- **Every caption credits the speaker and links the episode** (`episodeLink` in `lib/publishing.ts`: the episode on
  YouTube once it is there, else the podcast playlist, else the site).
- **Paid calls stay within the Studio's $10 daily limit** (`lib/server/spending.ts`). The social job reserves its
  estimate in `studio/spending` before calling Claude, as the Studio's own starts do, and records the real cost on the
  episode's `costs.items`. A refused run leaves the post waiting and tries again on a later run.

## How it runs

App Hosting has no cron, and GitHub's scheduled runs start hours late. So nothing depends on a run being on time:

1. **Planned as soon as the Shorts are scheduled.** `podcast_shorts.yml` in upload mode ends by running the social job
   (`agent/src/social/run.ts`, mode `plan`) for that episode. It makes each new Short's posts, draws their cards, and
   hands each post to Upload-Post **with its own time set** (`scheduled_date`). Upload-Post stores the media with the
   job, so a post goes at its time whatever GitHub does.
2. **An hourly check** (`social.yml`, cron, and by hand) runs mode `check` over every episode:
   - plans any approved, scheduled Short that has no posts yet (a Short scheduled before this was built, or a run that
     failed);
   - asks YouTube for each planned Short's status (`videos.list`, part `status`). A Short that is neither public nor
     private-with-a-`publishAt` (that is, unscheduled, deleted, or set private) has every one of its posts cancelled at
     Upload-Post (`DELETE /api/uploadposts/schedule/{job_id}`), status `cancelled`, reason "Unscheduled on YouTube". A
     Short whose `publishAt` moved has its Reel moved with it (`PATCH` the job's `scheduled_date`);
   - reads back each post whose time has passed (`GET /api/uploadposts/status`) and saves each platform's result and
     link.

   Because runs can be hours late, a Short unscheduled within a few hours of its time may still have its Reel posted.
   The Social page's **Cancel** acts at once (it calls Upload-Post from App Hosting), so that is the way to stop one in
   a hurry.
3. **Never posted:** a Short not approved at Checkpoint E, a Short whose approval is out of date (re-rendered since), a
   Short with no `youtube.videoId`, a Short YouTube doesn't show as scheduled or public, and any Short whose YouTube
   `publishAt` is before `SOCIAL_START` (a repo variable, an ISO time; default the day this is switched on), so turning
   it on never floods the accounts with old Shorts.

### Times

- **Reel:** the Short's YouTube `publishAt` + 3 hours (`REEL_DELAY_HOURS`).
- **Feed posts:** each kind has its own queue, one a day at 7 pm ET (`FEED_TIME`), image posts at 7:30 pm
  (`FEED_SECOND_OFFSET_MINUTES`). A new post takes the first day after the last day already taken by its kind, and never
  a day before its Short's Reel (its own Short must be out first). Shorts are queued in their YouTube order. One episode
  of 25 Shorts then fills about 25 days of feed, covering the gap until the next episode. A cancelled post's day is not
  refilled.
- Everything is stored in UTC and shown in ET (EST/EDT).

### Off switch

Repo variable `SOCIAL_AUTOPOST=off`: posts are still planned and drawn, but each waits on the Social page as `waiting`
until **Post** is pressed. Post queues it, and starts `social.yml` (mode `send`), which hands it over with its time (or
at once, if its time has passed by less than 6 hours; a post more than 6 hours late is dropped as `missed`).

## The data

`social_posts/{episodeId}_{shortId}_{kind}`: one document per post, so a second plan never makes a second post (the ID
is the uniqueness rule, as Short Maker's unique index is). Admin SDK only: `firestore.rules` denies it, and only the
Studio's routes and the job read it.

```ts
interface SocialPost {
    kind: 'reel' | 'image' | 'carousel';
    episodeId: string;
    shortId: string;
    shortTitle: string;
    speaker: string;
    youtube: { videoId: string; url: string; publishAt: number };   // the Short's, when planned
    postAt: number;                    // ms UTC
    platforms: ('instagram' | 'facebook')[];
    status: 'waiting' | 'sent' | 'posted' | 'partial' | 'failed' | 'held' | 'cancelled' | 'missed';
    reason: string | null;             // why held, cancelled or failed
    content: ReelContent | ImageContent | CarouselContent;   // captions, files (Storage paths), the gold phrase
    uploadPost: { jobId: string | null; requestId: string; scheduled: boolean; sentAt: number } | null;
    results: Record<string, { ok: boolean; url: string | null; postId: string | null; error: string | null }>;
    createdAt: number;
    updatedAt: number;
}
```

`CarouselContent` also keeps `youtube: { images: string[]; text: string }` for the YouTube post button.

Queries, with their composite indexes in `firestore.indexes.json`:

- the Social page and calendar: `postAt` in a range, ordered by `postAt` (one field, no composite index);
- the check: `status in [...]` ordered by `postAt` (index `status` + `postAt`);
- one episode's posts: `episodeId ==` ordered by `postAt` (index `episodeId` + `postAt`);
- the last day taken by a kind: `kind ==` ordered by `postAt` desc (index `kind` + `postAt`).

Each Reel's cover is a still of its Short 1.5 s in (`reel-cover.jpg`). Cards and frames live in Storage under `social/{episodeId}/{shortId}/` (Storage stays closed to the browser). Upload-Post
gets each file by a signed URL valid for an hour, made when the post is handed over; it copies the media into the job.
The Studio shows them through signed URLs made when the page loads.

## The Studio

**Social** (`/admin/podcast/social`, producers and admins, every route through `requireRole()`), like Short Maker's
`/social`, in the Studio's readability classes (spec 024):

- what's coming, newest last, then the last 14 days, each post with its pictures, its captions, its time in ET, its
  status, and live links once posted;
- **Edit** the captions until the post goes (a post already handed over is changed with Upload-Post's `PATCH`);
- **Hold** (cancelled at Upload-Post, kept, can be released), **Cancel**, and **Post** (when autopost is off, or to send a
  held one again);
- on each carousel, **YouTube post**: downloads the slide JPEGs and a `.txt` with the ready-to-paste text;
- the monthly **calendar** (`/admin/podcast/social/calendar`): Sunday first, ET, each day listing its posts (time, kind,
  IG/FB) coloured by status, live links for past posts, "+N more" on a busy day.

## Secrets and settings

- `UPLOAD_POST_API_KEY`: a **repo secret** (the job hands posts over) **and** a Secret Manager secret
  (`firebase apphosting:secrets:set UPLOAD_POST_API_KEY --project soulwisdomnetwork`, then `grantaccess` for the
  `soulwisdomnetwork-staging` backend too; the Social page's Hold, Cancel and Edit). Declared in `apphosting.yaml`, so
  the secret must exist before stage 2 reaches `staging`, or the build fails.
- Repo variables: `UPLOAD_POST_PROFILE` (`soul_wisdom_collective`), `FACEBOOK_PAGE_ID` (Soul Wisdom's Page), and
  optionally `SOCIAL_START` (default 2026-11-24 00:00 ET) and `SOCIAL_AUTOPOST`. The Studio only cancels and changes
  posts, which needs the key alone, so App Hosting gets neither variable.

## Files

| File | What it does |
|---|---|
| `lib/social/plan.ts` | Pure rules: kinds, statuses, times (Reel delay, feed queue, ET), which Shorts qualify, YouTube status → keep or cancel |
| `lib/social/captions.ts` | Pure: each platform's caption, the speaker's credit and the episode link, Instagram's 2,200 characters |
| `lib/social/limitedWords.ts` | Words the platforms limit (copied from Short Maker's `src/lib/domain/limitedWords.ts`): never in a card or caption |
| `lib/social/uploadPost.ts` | The only file that knows Upload-Post's API (copied from Short Maker): forms, send, status, cancel, patch |
| `lib/social/quote.ts`, `carousel.ts`, `highlight.ts` | Stages 3–4: Claude's prompts and the checks on its words |
| `lib/social/calendar.ts` | Stage 5: the month grid (pure, copied from Short Maker) |
| `lib/server/social.ts` | The Studio's reads and actions (list, edit, hold, cancel, post) |
| `agent/src/social/run.ts` | The job: modes `plan`, `check`, `send` |
| `agent/src/social/frames.ts`, `cards.ts` | Stages 3–4: frames from the final cut, cards drawn in headless Chromium |
| `.github/workflows/social.yml` | The hourly check, and `send`/`plan` by hand |
| `app/admin/podcast/social/` | The Social page and calendar |
| `app/api/studio/social/` | Its routes |

## Stages (each a PR into `staging`)

1. **Spec and decisions** (this).
2. **Reels**: the Upload-Post client and its tests, `social_posts` with rules and indexes, planning Reels when Shorts are
   scheduled, the hourly check (results, cancel on unschedule), and a first Social page.
3. **Image posts**: frames from the final cut, the quote card (logo, gold phrase), captions crediting the speaker with
   the episode link, the 1-a-day queue. Sample cards rendered locally and shown to Tom before shipping.
4. **Story carousels**: frames, Claude's lines with the checks, the end slide, the 1-a-day queue, and the YouTube post
   button. Sample slides shown to Tom first.
5. **The calendar** in the Studio.

Jobs only run from `main` (the Studio starts them there), so staging can show the pages, but a post is only made once a
stage is on `main`.

## The image post (stage 3)

`agent/src/social/image.ts`, rules in `lib/social/quote.ts`, layout in `lib/social/cards.ts`:

1. Six small frames from the final cut, spread over the Short's `startMs`–`endMs`.
2. Claude (the notes' model) reads the Short's words and looks at the frames. It returns the quote (one to three
   consecutive sentences, 30 to 220 characters), its gold phrase (2 to 6 words), the frame that shows the speaker best,
   and where their face is across it. About $0.06 a Short, reserved against the daily limit first.
3. The code keeps it only when the quote's words are the speaker's own, in order (capitals, punctuation, "um"s and a
   stammered word aside: `isVerbatim`), and it has no limited words. A gold phrase not copied exactly from the quote
   becomes its last clause. A quote that fails is noted once as "Not made" (`notMade`), never tried again.
4. That frame at 1920 × 1080, cropped to 4:5 around the speaker (`cropAround`), under the card: the logo top left, the
   quote in Outfit with the gold phrase in `#f7c65b`, the speaker's name in Cinzel, soulwisdomcollective.com at the foot.
5. Captions: the quote, "— Speaker, on Soul Wisdom Collective", the episode's link (tagged `utm_medium=image`), hashtags.
6. It takes the next free day in the image posts' queue at 7:30 pm ET, after its Short's Reel.

## Limits and failure

- A Reel needs Facebook's limits: 3 to 90 seconds as a Reel; longer Shorts go to Facebook as a Page video, which it shows
  as a Reel (`facebook_media_type`, as Short Maker does). Instagram takes Reels up to 3 minutes; our Shorts never pass 3.
- Upload-Post's Basic plan has unlimited uploads and up to 20,000 scheduled posts pending; we plan about 120 a month.
- A refused hand-over (Upload-Post down, a 4xx) marks the post `failed` with Upload-Post's words; the next check tries
  it again while its time is under 6 hours past.
- A Reel moved later on YouTube keeps its feed posts' days: a moved Short's image post or carousel may then come out
  before its Reel. Rare (Shorts are rarely moved), and its Short is public by then either way.
- Each post's ID is sent as Upload-Post's request ID and `Idempotency-Key`, so a retry never posts twice.

## Tests

`lib/social/*.test.ts`: the times (Reel delay across the EST/EDT change, the feed queue, the 7:30 second slot), which
Shorts qualify, YouTube status → keep, move or cancel, the Upload-Post forms, result parsing, captions (credit, link,
limits), and in later stages the checks on Claude's words and the calendar grid.
