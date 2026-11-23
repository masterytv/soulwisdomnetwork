<!--
A copy of the live marketing document, kept here so any session or person working in this repo can read it.
The live document is the one to edit: "Low-Cost Marketing Plan: Soul Wisdom Collective & Project Profound",
https://claude.ai/artifact/2nQRFNeyJu55zqyrt8GGnu (Claude Docs). Copied on 2026-11-23 from its version 80, main tab only.
When the live document's status, links, rules or decision log change in a way that matters here, copy it again.
This repo is public: leave out account IDs, subscriber counts and anything private.
-->

# Low-Cost Marketing Plan: Soul Wisdom Collective & Project Profound

Nov 18, 2026 · @Tom Wood

We already make more content than we distribute, so the plan is distribution, not more production: send every Short and episode to more places, point every short piece at a long one, and turn viewers into email subscribers. It fits the limits you set: about $16–44 a month in tools (of the $50–150 budget) and 1–2 hours of your time a week, spent approving, not posting.

## Status, links and rules (keep this current)

This document is the shared marketing reference for Tom, Daniel and any AI session. Update the status table and the decision log whenever a step moves, and read the rules below before changing anything that publishes.

### Status by step

| Step | Status | Updated | Notes |
| --- | --- | --- | --- |
| 1. YouTube audit and podcast feed | Mostly done | Nov 18, 2026 | Short Maker: no audit needed. Soul Wisdom Studio: no audit needed (an episode it uploaded Oct 28 as unlisted is viewable, which a locked project can't do; its first scheduled Short goes out Dec 23, check it went public). PP: its YouTube job has never run (SHARE\_JOB\_ENABLED is off), so nothing to check until it is turned on |
| 2. Every Short links to a long version | Merged to staging | Nov 18, 2026 | Code done: PP Shorts open with the experiencer's PP page (UTM tagged), masterytv/short-maker#71; Soul Wisdom Shorts and clips open with the full-episode link, masterytv/soulwisdomnetwork#293. Both merged to staging Nov 18; live once Tom promotes them to main. The API can't set a Short's related video or pin a comment: related video is set by hand in YouTube Studio |
| 3. One email list on Resend | Merged to staging | Nov 18, 2026 | Merged to staging Nov 18: masterytv/profound-archive#89 (list, Resend copy, unsubscribes, ConvertKit removed) and masterytv/soulwisdomnetwork#294 (sign-up form). Split into two emails (masterytv/profound-archive#90, masterytv/soulwisdomnetwork#296). Resend segments, webhook and secret set up by Tom Nov 19, turned on in masterytv/profound-archive#92 (staging). Next: copy subscribers and make the first drafts on staging, then promote to main. |
| 4. Weekly "NDE of the Week" email | Merged to staging | Nov 18, 2026 | Sends itself at 9:00 am ET, with a cancel window and an email to Tom: NDE of the Week on Mondays (masterytv/profound-archive#94), Soul Wisdom Video of the Week on Tuesdays (Soul Wisdom's own system, masterytv/soulwisdomnetwork#297). Both merged to staging Nov 19; Soul Wisdom sign-ups moved out of PP's database (1 row). Tom promoting staging to main Nov 19, Soul Wisdom first, then deploying its Firestore rules from main. First sends: Mon Nov 23 (NDE of the Week) and Tue Nov 24 (Video of the Week), 9:00 am ET; checks booked for both mornings |
| 5. Experiencer outreach drafts | Not doing for now | Nov 19, 2026 | Tom, Nov 19: no outreach for now. If it comes back: drafts only, which Tom sends himself. PP profiles hold public links, not emails; PP admin's channel-contacts table has the host channels' emails |
| 6. Cross-post Shorts to Facebook, Instagram, TikTok | Researched, waiting on Tom | Nov 19, 2026 | Tom said yes to automatic cross-posting Nov 19 (D-2026-11-19-crosspost). Researched: recommend Upload-Post plus a new stage in Short Maker, PP first. Waits for Tom's pick and the accounts |
| 7–17 | Not started |  | See Prioritized steps |
| 9. Podcast apps | Mostly done | Nov 18, 2026 | Listed on Apple, Spotify, Amazon, Podcast Index. Website buttons live on main (Nov 18). Only 1 episode in the feed so far |

### Accounts and links

| What | Where | Owner or notes |
| --- | --- | --- |
| PP YouTube channel | [youtube.com/@projectprofound](https://www.youtube.com/@projectprofound) | Daily Short at 9 am ET from Short Maker |
| Soul Wisdom YouTube channel | [youtube.com/@SoulWisdomCollective](https://www.youtube.com/@SoulWisdomCollective) | Episodes, clips and Shorts from the Studio, uploaded by button |
| Short Maker's Google Cloud project | "My First Project" | Default quotas (10,000 units, 100 uploads a day); uploads publish without an audit |
| Podcast feed | [soulwisdomcollective.com/podcast/feed.xml](https://soulwisdomcollective.com/podcast/feed.xml) | Source for every podcast app; episodes join it by ticking "In the podcast feed" |
| Apple Podcasts | [Soul Wisdom Collective](https://podcasts.apple.com/us/podcast/soul-wisdom-collective/id6836432434) | Apple Account soulwisdomcollective@gmail.com |
| Spotify | [Soul Wisdom Collective](https://open.spotify.com/show/7lgFLbmk8pLg7b83b3OrbK) | Spotify for Creators, reading the feed. Two empty shows there; never delete the account |
| Amazon Music | [Soul Wisdom Collective](https://music.amazon.com/podcasts/54c6d2f6-bac8-4f8f-ae13-740f5711995c/soul-wisdom-collective) | Reading the feed |
| Podcast Index | [podcastindex.org/podcast/8121281](https://podcastindex.org/podcast/8121281) | Directory only; no website button |
| This document | [Low-Cost Marketing Plan](https://claude.ai/artifact/2nQRFNeyJu55zqyrt8GGnu) | Claude Docs; share it from the page to give others access |

### Rules for anyone doing marketing work

- Budget: $50–150 a month for tools and boosts, on top of the apps' AI limits. Tom's time: 1–2 hours a week, spent approving, not posting.
- Goals for the next 6 months: grow YouTube and the podcast, build an email list, bring traffic to both sites. Book sales are not a goal yet.
- Nothing uploads or posts without Tom, except under a standing agreement logged in short-maker's DECISIONS.md with an ID, date and time. The only one so far: Short Maker's automation uploads its own Shorts (D-2026-11-17-upload). Cross-posting needs its own entry first.
- Content rules carry over to every platform: retell in Tom's words with short quotes, credit and link every experiencer (PP page first, YouTube in parentheses), claims as reports, no words YouTube limits (suicide, abuse…), no self-harm stories, the AI disclosure on posts with AI pictures, never pass a stranger's face off as a real person.
- Code changes go through a branch, a pull request into `staging`, Tom's test there, then `staging` to `main`. Never push to `main`.
- PP's database is shared by staging and production, and Short Maker's tables live in it: no migrations or writes from a session; reads only with Tom's yes.
- Tom works in Eastern Time; give times in ET.

### Decision log

| Date | Decision |
| --- | --- |
| Nov 18, 2026 | Budget $50–150 a month; Tom's time 1–2 hours a week; goals as above. Existing channels: both YouTube channels and an email list |
| Nov 18, 2026 | Short Maker needs no YouTube audit; one release a day at 9 am ET confirmed working (the extra Shorts on Nov 17–18 were from the old three-a-day schedule) |
| Nov 18, 2026 | Spotify lists the show from the RSS feed, not as a Spotify-hosted show (no manual uploads; Spotify video skipped for now) |
| Nov 18, 2026 | Website shows Apple Podcasts, Spotify and Amazon Music buttons; no Podcast Index button |
| Nov 18, 2026 | Tool choices recommended, not yet bought: Upload-Post for cross-posting, Kit (free) for email (Kit declined the same day, below) |
| Nov 18, 2026 | No Kit: email stays on Resend for the list, the drips and the weekly newsletter (Tom) |
| Nov 18, 2026 | Listen buttons promoted to main (Tom). Soul Wisdom's YOUTUBE\_PLAYLIST\_ID set to the "Soul Wisdom Collective Podcast" playlist |
| Nov 18, 2026 | Build the Resend email plan as written; one read-only query of PP's subscribers allowed (Tom) |
| Nov 19, 2026 | Two weekly emails, not one: PP's "NDE of the Week" to PP sign-ups, and "Soul Wisdom Video of the Week" to Soul Wisdom sign-ups, each with one line about the other site (Tom). Sign-up on staging tested and working |
| Nov 19, 2026 | Weekly emails send automatically at 9:00 am ET: NDE of the Week on Mondays, Soul Wisdom Video of the Week on Tuesdays, scheduled a couple of hours early with a cancel window and an email to Tom; nothing sends if content is missing (Tom) |
| Nov 19, 2026 | The two newsletters run on separate systems: PP's in profound-archive (Supabase list), Soul Wisdom's in soulwisdomnetwork (its own Firestore list and public sign-up route, the second exception to requireRole). Soul Wisdom sign-ups are moved out of PP's database once (Tom) |
| Nov 19, 2026 | No experiencer outreach for now (step 5 parked). If it is picked up again, Claude drafts and Tom sends each one himself; nothing sends by itself (Tom) |
| Nov 19, 2026 | Cross-post automatically once YouTube has published a Short (Tom). Logged in short-maker's DECISIONS.md as D-2026-11-19-crosspost. How and where to post is still open: see the Cross-posting decision tab |

Step 6 research, where to post and whether to buy or build, is in the "Cross-posting decision" tab of the live document (not copied here).

## Where we stand

The three apps already produce a daily stream of finished, credited content. What is missing is almost all on the distribution side.

| What | Already made | Where it goes today | Gap |
| --- | --- | --- | --- |
| NDE Shorts (Short Maker) | 1 a day, up to 90 a month, voiced, credited, thumbnail | YouTube only, auto-uploaded | No Facebook, Instagram or TikTok; no link to a long version |
| Shared-story videos (PP) | 1 a day from "Share Your Experience" | YouTube only | Same as above |
| PP blog | 3 AI articles a day (NDE Q&A, UAP Q&A, an experiencer story) | Site and sitemap | No email digest, no social posts |
| PP archive | 5,000+ NDE accounts, experiencer profiles, question pages, 7 visualizations | Indexed by Google; AI crawlers blocked since Oct 2026 for hosting cost | No hub pages with archive statistics; shared-story and blog category pages not in the sitemap |
| Soul Wisdom episodes | Episode, chapters, quotes, translated captions, thumbnails, audio MP3 | YouTube | Podcast feed built but off by default; not confirmed on Apple or Spotify |
| Soul Wisdom clips and Shorts | Picked quotes, 5 s to 3 min, one a day | YouTube | No cross-posting |
| Social post drafts | LinkedIn, Instagram, X posts and an email per episode | Copy buttons in the Studio only | Nothing posts them |
| Email | PP: newsletter sign-up, drip emails, admin broadcasts (Resend, free 100 a day), plus a ConvertKit script | Drips and manual broadcasts | No regular newsletter; Soul Wisdom has no sign-up at all |
| Analytics | PP: Google Analytics 4 | — | Soul Wisdom and Short Maker: none; no YouTube Analytics read back |

Two things to check before anything else: whether the YouTube API audit has passed (until it does, API uploads stay private), and whether the Soul Wisdom podcast feed is switched on. Both were unclear from the code.

## The strategy

One loop for both brands: what we already make reaches new people on more platforms, every short piece links to a long one, and the long ones ask for an email address. The weekly email then sends people back to the newest Short and episode, which is what makes the loop grow on its own.

*The flywheel (a diagram in the live document):* **Make** (daily NDE Shorts, Soul Wisdom episodes and clips, the PP archive and blog) → **Reach** (YouTube, Reels on Facebook, Instagram and TikTok, experiencers sharing their Short, search and podcast apps) → **Deepen** (the PP experiencer page, the full episode) → **Own** (the weekly email), and each weekly email sends readers back to the newest Short and episode.

The two brands feed each other: NDE-themed Soul Wisdom episodes link to Project Profound, and Project Profound's pages, chat and emails promote the podcast.

## Prioritized steps

Do the steps in this order: each one ranks by how much it should move views, subscribers and sign-ups against its cost and your time. Phase 1 is almost all small code changes to what exists; Phase 2 builds the one new piece (a distribution queue); Phase 3 is relationships and longer bets. "Build" means a Claude session in the repo; "Your time" is the ongoing weekly cost to you.

### Phase 1: weeks 1–4, quick wins

| # | Step | Brand | Why it matters | Cost / month | Your time | Build |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Confirm the YouTube API audit has passed and the podcast feed is on | Both | Until the audit passes, API uploads are private and need hand-publishing; the feed being off means no Apple or Spotify | $0 | 15 min once | None |
| 2 | Point every Short at a long version: first line of the description and a pinned comment link the experiencer's PP page (with UTM tags); Soul Wisdom Shorts set YouTube's related-video link to the full episode | Both | Shorts give reach but convert poorly (about 500 views per subscriber); the link turns that reach into site visits and long-form viewers | $0 | None | Small |
| 3 | One email list on Resend (Tom, Nov 18: no Kit): PP's list, add sign-up to Soul Wisdom, PP case pages and the AI chat ("email me this conversation") | Both | The only channel we own; religion and spirituality emails open at 40–55% | $0 | None | Small–medium |
| 4 | Weekly "NDE of the Week" email, drafted automatically from the week's best Short, PP story and Soul Wisdom episode, sent by you | Both | Gives subscribers a reason to stay and a click back to both sites every week | $0 | 10 min a week | Small |
| 5 | Experiencer outreach: when a Short goes live, draft an email to that experiencer with the link, a vertical MP4 and an invitation to share it or co-own it on YouTube as a collaborator | PP | Each one brings a warm audience that already trusts them; near-zero cost | $0 | 15 min a week to approve | Small |
| 6 | Open Facebook Page, Instagram and TikTok accounts for both brands and cross-post every Short there through Upload-Post (needs your agreement logged in DECISIONS.md first) | Both | Facebook is where the 45+ audience is (52% of US adults use it daily); the extra cost per post is close to nil | $16–24 | 30 min once | Small |

### Phase 2: months 2–3, build the distribution machine

| # | Step | Brand | Why it matters | Cost / month | Your time | Build |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | A distribution queue: every finished asset becomes per-platform drafts you approve in one screen; a job posts them through the scheduler and reads the stats back | Both | Turns the Studio's unposted social drafts and the PP blog into posts without you posting anything | $0 | Folded into the weekly review | Medium |
| 8 | Quote cards and carousels drawn in code from episode quotes and Short beats, in the brand kit | Both | Instagram carousels get the most engagement per view; quote pins suit Pinterest | $0 | None | Medium |
| 9 | Soul Wisdom: switch the feed on, submit it to Apple, Spotify, Amazon and YouTube Music; add a sitemap, analytics and an episode page with transcript | SWC | Most podcast listening happens in apps we're not in yet; episode pages rank in search | $0 | 30 min once | Small–medium |
| 10 | PP search pages: hub pages with archive-only statistics ("NDEs with a life review", with the real count from the archive), the missing pages added to the sitemap, an "about our data" page | PP | Google rewards pages only we can make; generic AI pages are what it penalizes | $0 | None | Medium |
| 11 | Let AI answer engines read PP again (OpenAI's search bot, Perplexity, Google), keep training-only crawlers blocked, and rate-limit or cache them so hosting stays in budget | PP | ChatGPT, Perplexity and Google AI answers can't cite pages they can't read | $0–10 hosting | None | Small |
| 12 | Cross-link the brands: NDE-themed episodes link to PP; PP's chat, footer and emails promote the podcast | Both | Each audience is the other's best prospect | $0 | None | Small |

### Phase 3: months 3–6, reach and relationships

| # | Step | Brand | Why it matters | Cost / month | Your time | Build |
| --- | --- | --- | --- | --- | --- | --- |
| 13 | YouTube multi-language audio on episodes and the best Shorts (Spanish, Portuguese, German, French), after checking how your voice sounds dubbed | Both | Free; channels in YouTube's pilot got over 25% of watch time from other languages | $0 | 20 min to check | None–small |
| 14 | One podcast guest swap or IANDS contact a month (Afterlife Revealed, NDE-interview shows, local IANDS groups, the 2027 conference) | SWC | Recommendations from shows people already hear are the second-biggest way listeners find podcasts | $0 | 1 hour a month | None |
| 15 | A yearly data report, "What 5,000 near-death experiencers report", used as a press pitch and an email sign-up gift | PP | Original statistics earn press links, which build search trust and AI citations | $0–20 | 2 hours once | Medium |
| 16 | If either is (or becomes) a 501(c)(3): Google Ad Grants (up to $10,000 a month of search ads), YouTube's Nonprofit Program, Canva for Nonprofits | Both | The biggest single free reach lever available; it needs nonprofit status first | $0 | 3–4 hours once, then 30 min a month | Small |
| 17 | Paid boosts, $30–80 a month, only on posts that already did well organically (a top Reel, or a lead form for the email list) | Both | Spend follows proof; stays inside the budget | $30–80 | 15 min a month | None |

Not doing: LinkedIn, X and Threads beyond what the scheduler copies at no extra effort; Reddit self-promotion (answer questions instead, if ever); paid clip tools such as OpusClip, which our pipelines already replace.

## Podcast apps: one-time setup (step 9)

The Soul Wisdom audio feed is live at [soulwisdomcollective.com/podcast/feed.xml](https://soulwisdomcollective.com/podcast/feed.xml), but no podcast app knows about it yet. It holds one episode, its artwork is fine (3,000 × 3,000 JPEG, the size Apple asks for), and it has no owner email, which Spotify needs. About an hour in total, then 2 minutes per episode. Menu names in Apple's and Spotify's sites change now and then; follow the nearest match.

Where the podcast is listed (add each link here as it goes live):

| Directory | Link | Status | Date |
| --- | --- | --- | --- |
| RSS feed (the source for every app) | [soulwisdomcollective.com/podcast/feed.xml](https://soulwisdomcollective.com/podcast/feed.xml) | Live | Oct 2026 |
| Spotify | [open.spotify.com/show/7lgFLbmk8pLg7b83b3OrbK](https://open.spotify.com/show/7lgFLbmk8pLg7b83b3OrbK) | Submitted from the feed; live within a few hours | Nov 18, 2026 |
| Apple Podcasts | [podcasts.apple.com/us/podcast/soul-wisdom-collective/id6836432434](https://podcasts.apple.com/us/podcast/soul-wisdom-collective/id6836432434) | Live, reading the feed (owner: the soulwisdomcollective@gmail.com Apple Account) | Nov 18, 2026 |
| Amazon Music | [music.amazon.com/podcasts/54c6d2f6-…/soul-wisdom-collective](https://music.amazon.com/podcasts/54c6d2f6-bac8-4f8f-ae13-740f5711995c/soul-wisdom-collective) | Live | Nov 18, 2026 |
| Podcast Index | [podcastindex.org/podcast/8121281](https://podcastindex.org/podcast/8121281) | Live (a directory for other apps; no website button) | Nov 18, 2026 |

Spotify for Creators also holds two empty shows made on Nov 18 ("Soul Wisdom Collective Podcast" and "Untitled Show"). They have no episodes and stay invisible; leave them, and never delete the Spotify for Creators account, which would delete the real show too.

### 1. Get the feed ready (Soul Wisdom Studio, 15 min)

- [x] In the Studio settings (/admin/podcast/settings), under the podcast feed, fill in the owner email. It is public in the feed, so use a shared address you check, not a personal one. Spotify sends its verification code there.
- [ ] Put more episodes in the feed: on each published episode's page, press "Make the podcast MP3", then tick "In the podcast feed". A show with several episodes makes a better first impression on reviewers and new listeners.
- [ ] Check the feed at [Cast Feed Validator](https://www.castfeedvalidator.com) and fix anything it marks as an error.

### 2. Apple Podcasts (15 min, then a review of a few days)

- [x] Sign in at [Apple Podcasts Connect](https://podcastsconnect.apple.com) with the Apple Account that should own the show.
- [x] Press + and choose New Show, then "Add a show with an RSS feed", and paste the feed address.
- [x] Check the details it reads from the feed, answer the content-rights question, and press Submit for Review.
- [x] When Apple approves it (you get an email), copy the show's Apple Podcasts link. Listing on Apple also puts the show in most other apps, such as Overcast and Pocket Casts.

### 3. Spotify (15 min, live within hours)

- [x] Sign in at [Spotify for Creators](https://creators.spotify.com) with a Spotify account.
- [x] Choose to add an existing podcast hosted elsewhere, and paste the feed address.
- [x] Enter the 8-digit code Spotify emails to the feed's owner email.
- [x] Pick the category, language and country, and submit. Copy the show's Spotify link once it appears.

### 4. The rest (10 min each, optional)

- [x] [Amazon Music and Audible](https://podcasters.amazon.com): add the show by its feed address.
- [x] [Podcast Index](https://podcastindex.org/add): add the feed; several newer apps read their lists from it.
- [ ] Put the Apple and Spotify links on soulwisdomcollective.com, in the YouTube channel description and in each episode's show notes.

### Every new episode (2 min)

- [ ] After the final cut is approved: on the episode's page, press "Make the podcast MP3", then tick "In the podcast feed". Apple and Spotify pick it up from the feed by themselves, usually within a day. This step can be automated later, as part of the distribution queue (step 7).

## Channel playbook

YouTube stays the centre for both brands; Facebook and Instagram are the main additions, because that is where our mostly female, 40+ audience spends time. Everything else gets automatic copies or nothing.

| Channel | Project Profound | Soul Wisdom Collective | Cadence | Priority |
| --- | --- | --- | --- | --- |
| YouTube | Daily NDE Short (already live), shared-story videos; every Short linked to the PP page | Full episodes, chapters, daily clip Shorts linked to the episode; podcast playlist | As made | Core |
| Email (Resend) | "NDE of the Week" | The new episode and a quote, in the same email | Weekly | Core |
| Websites | Archive, hub pages, daily blog, data report | Episode pages with transcripts, sign-up | As made | Core |
| Facebook Page | Same Shorts as Reels; one archive story or quote card a day | Clips as Reels, episode posts | Daily | High |
| Instagram | Reels; a weekly carousel ("5 things experiencers report about…") | Reels; quote carousels from each episode | Daily Reels, 1–2 carousels a week | High |
| TikTok | Same Shorts | Same clips | Daily | Medium: younger audience, free to add |
| Podcast apps | — | Apple, Spotify, Amazon, YouTube Music from the feed | Per episode | High, one-time setup |
| Pinterest | Quote pins linking to case pages | Quote pins linking to episodes | Automatic | Low cost, test |
| Threads, Bluesky, X, LinkedIn | Automatic copies only | Automatic copies only | Automatic | Low |
| Reddit, Facebook groups | Only genuine answers with a relevant archive link, by each group's rules | — | Occasional | Low, never automated |

One rule across all of them: a short piece always points to a long one (the PP page, the full episode or the email sign-up), with UTM tags so we can see which channel sends people.

## Tools: buy or build

Buy one thing, an API-first scheduler, because it has already passed the approvals TikTok, Meta, Pinterest and LinkedIn require, which would take us weeks to months each. Build everything else in the apps we have: they already write, render, check and schedule better than the creative tools on the market. Prices were checked on 2026-11-18 where linked; confirm before buying.

| Need | Choice | Buy or build | Cost / month | Why this one |
| --- | --- | --- | --- | --- |
| Posting to Facebook, Instagram, TikTok, Pinterest, Threads, Bluesky, X, LinkedIn | [Upload-Post](https://www.upload-post.com/pricing) Basic: 5 profiles, unlimited posts, API and MCP | Buy | $16 (annual) or $24 | Cheapest with a full API; fallback [Zernio](https://zernio.com/pricing) (about $42–78 for 9–20 accounts) |
| YouTube uploads | Our own code (Short Maker, Studio, PP) | Built | $0 | Already works; keep it direct |
| Email list and newsletter | [Resend](https://resend.com/pricing), already in use: marketing broadcasts free up to 1,000 contacts | Buy (free) | $0 | Big free tier, API, RSS-to-email, recommendation network; beehiiv's free tier dropped to 2,500 |
| Transactional and drip email | Resend, as now | Built | $0 | Keep for everything: drips, alerts and the newsletter (Tom, Nov 18) |
| Carousels, quote cards, thumbnails | Remotion stills or @vercel/og in the brand kit | Build | $0 | Consistent and free; Canva's template API is Enterprise-only |
| Occasional hand-made designs | Canva (free for registered nonprofits) | Buy (free if eligible) | $0 | Only for one-offs |
| Clips from episodes | The Studio's Shorts pick and render | Built | $0 | OpusClip and similar would duplicate it |
| Distribution queue, approvals, UTM links, own short links (/go/…), link-in-bio page | Our apps | Build | $0 | Keeps you approving in one place, with the spending ledgers we have |
| Analytics | GA4 (PP), Vercel or PostHog free (others), YouTube Analytics API, the scheduler's stats API | Build a small dashboard | $0 | Metricool Starter (about $20) only if we want a ready-made dashboard before ours |
| Automation glue | GitHub Actions and Vercel Cron, as now | Built | $0 | n8n, Make or Zapier would split the logic for no gain |

Total: about $16–24 a month in tools, rising to $36–44 with Metricool. The rest of the $50–150 budget is held for paid boosts in Phase 3, once we know which posts work.

## Automation: how posts get out

Build one shared distribution queue, as a new area of Short Maker (it already has the cron, the job runner and the spending ledger), and let the other two apps hand it their finished assets. You approve; code posts. A post is never published without your approval, except under a standing rule you log in DECISIONS.md (for example, "cross-post every Short that YouTube already published").

1. **An asset is finished.** A Short is published on YouTube, a Studio episode or clip is approved, a PP blog story goes live. The app sends it to the queue: the video or image in Blob, its title, its credits, its link.
2. **Drafts are written.** Claude or Gemini writes one caption per platform under the content rules (credit the experiencer, claims as reports, YouTube's limited words left out, the AI line). The app adds UTM tags and an own-domain short link, and draws the carousel or quote card if the platform needs one.
3. **You approve.** One screen per week lists the drafts by day and platform with Approve, Edit and Skip. Standing rules approve whole kinds at once.
4. **A job posts them.** It sends each approved post to the scheduler's API at its slot (Short at 9 am ET on YouTube, then Facebook, Instagram and TikTok a few hours later), keeps the post IDs, and records any cost in the ledger.
5. **Stats come back.** A nightly job reads YouTube Analytics and the scheduler's stats into the queue, so the weekly screen shows what worked and the email digest picks the week's best.
6. **Outreach and email ride the same queue.** The experiencer email and the weekly newsletter are drafts in the same screen.

Keep the scheduler behind a thin adapter, so moving from Upload-Post to Zernio or a self-hosted Postiz later is a one-file change.

## Your weekly routine

Once Phase 2 is built, the whole plan runs on about 75 minutes of your time a week, in one sitting plus a few replies.

| When (ET) | What you do | Time |
| --- | --- | --- |
| Monday | Approve the week's posts in the queue, and the experiencer emails | 30 min |
| Thursday | Read and send the "NDE of the Week" email | 10 min |
| Any day | Answer the best comments on YouTube and Facebook | 20 min |
| Once a month | One relationship: a guest swap, an IANDS contact or a press pitch | 1 hour |
| Once a month | Look at the dashboard and pick what to boost or drop | 15 min |

Until the queue exists (Phase 1), expect about 2 hours a week, because approvals happen in the scheduler's own screen.

## Measuring it

We judge the plan by three numbers that match your goals: email subscribers, YouTube subscribers and watch hours, and visits from social and email to the two sites. The targets below are relative because we have no baseline yet; step 1 records it.

| Measure | Where it comes from | 6-month target |
| --- | --- | --- |
| Email subscribers | Resend | +3,000, or 5x today's list, whichever is smaller |
| Email click rate | Resend (opens are inflated by Apple Mail) | Over 3% |
| YouTube subscribers, both channels | YouTube Analytics | 2x today |
| Long-form watch hours | YouTube Analytics | +50% |
| Engaged Shorts views (not plain views, which since March 2025 count every replay) | YouTube Analytics | Track the trend |
| Facebook and Instagram followers | Scheduler stats | 1,000 each per brand |
| Visits from social and email | GA4 and the /go links, by UTM | 25% of site visits |
| Experiencers who share their Short | Queue log | 1 in 5 |
| Podcast app listens | Apple and Spotify dashboards | Track the trend |

Review monthly. A channel that shows no growth after 3 months of daily posting is cut back to automatic copies.

## Risks and guardrails

The biggest risk is YouTube treating the daily automated Shorts as mass-produced; the rest are already covered by rules we have.

| Risk | What could happen | Guardrail |
| --- | --- | --- |
| YouTube's "inauthentic content" rule (July 2025) | Templated, mass-produced videos lose monetization, not reach | Keep each Short visibly different: your voice, varied openings and structures, no reused stock (already handled), and now and then your own comment on the story |
| AI picture labels | Undisclosed realistic AI images get labelled automatically and repeat offences risk penalties | Short Maker and the Studio already set YouTube's altered-content flag; set the same AI label on Facebook, Instagram and TikTok posts through the scheduler |
| Self-harm and limited words | Age restriction kills Shorts reach | Keep the current rules (no stories of self-harm, no limited words) on every platform's captions too |
| Medical claims | Reach limits, loss of trust | Claims as reports ("experiencers report…"), never proof |
| Google's scaled-content policy | Thin AI pages demoted | Hub pages built from real archive counts and quotes, not rewrites |
| Hosting cost from AI crawlers | The October 2026 spend spike returns | Allow only search and answer bots, cache their pages, watch the App Hosting bill weekly for a month |
| Uploads without you | Breaks your rule | Every new automatic path is logged in DECISIONS.md before it runs |
| Posting from staging | Real posts from a test site | The posting job runs only in production, as the Studio's jobs already do from `main` |

## Email plan (steps 3–4) on Resend, proposed Nov 18

One list, kept where it is now (PP's `quiz_leads`), fed by both sites, and a weekly "NDE of the Week" draft that Tom sends from Resend. Nothing is built until Tom approves. No migrations and no new tables.

The weekly email goes out as a Resend marketing broadcast, not one email at a time as PP's admin broadcast does now. Single sends count against the free plan's 100 emails a day; broadcasts are free up to 1,000 contacts, then $40 a month for 5,000 ([Resend pricing](https://resend.com/pricing)). How many subscribers PP has is the first thing to find out.

| Part | What changes | Risk to live data |
| --- | --- | --- |
| Soul Wisdom sign-up | A form in the site footer and on /podcast posts to PP's `/api/quiz-lead` as a new list, `newsletter_swc`. PP's route accepts that list and requests from soulwisdomcollective.com | No schema change if `archetype` has no database check limiting its values (to confirm with one read) |
| Resend audience | `/api/quiz-lead` also adds newsletter sign-ups to one Resend audience, after the existing save. If Resend fails, the sign-up still succeeds | None in PP's database |
| Existing subscribers | One-time read of active newsletter rows in `quiz_leads`, added to the Resend audience through its API | A read of the shared database: needs Tom's yes |
| Unsubscribes | A Resend webhook tells PP when someone unsubscribes from a broadcast; PP sets `is_active=false`, so the drips stop too | An ordinary app write to the shared database |
| NDE of the Week | A weekly job in Project Profound (Thursday; it already has the story and Resend) picks the week's most-viewed PP Short, PP's story of the day and the newest Soul Wisdom episode (from the podcast feed), writes short blurbs and creates the Resend broadcast as a draft. Tom reviews and sends it (about 5 minutes a week) | None; about $0.01 of AI a week, counted against Short Maker's limits |
| ConvertKit script | Removed from PP's pages, the cookie banner and the privacy page, since Kit is not used | None |

**Changed Nov 19 (Tom): two emails, one per site.** "NDE of the Week" goes to Project Profound sign-ups (the week's most-watched PP Short and the Story of the Day, plus one line about the podcast). "Soul Wisdom Video of the Week" goes to Soul Wisdom sign-ups (the week's most-watched Soul Wisdom video and the newest episode, plus one line about Project Profound), sent from newsletter@soulwisdomcollective.com, which is already verified in Resend. Each has its own Resend segment; unsubscribing from a broadcast still stops all our emails to that person.

Order: subscriber count and the `archetype` check (one read) → Soul Wisdom form → Resend audience → existing subscribers → unsubscribe webhook → weekly draft → ConvertKit script removed.

## Decisions needed from you

Six questions for Phase 1, three answered.

- [ ] Short Maker's uploads go public on their scheduled day with no one publishing them by hand (checked 2026-11-18), so it needs no audit. The podcast feed is on and listed in the apps. Still to check: the Soul Wisdom Studio's and PP's upload projects.
- [x] May Shorts that YouTube has already published be cross-posted automatically to Facebook, Instagram and TikTok? Answered Nov 19: yes, once YouTube publishes.
- [ ] Is Project Profound or Soul Wisdom Collective a registered 501(c)(3), or would you register one? It decides Ad Grants, the YouTube Nonprofit Program and free Canva.
- [x] Kit for the newsletter? Answered Nov 18: no, stay on Resend.
- [ ] May PP let AI answer engines read it again (with caching and a rate limit), keeping training crawlers blocked?
- [x] For experiencer outreach: may we email experiencers at the contact details on their public profiles, with your name on the email? Answered Nov 19: no outreach for now.

## Sources

Researched 2026-11-18. Vendor numbers come from vendor or third-party pages and may change.

- [Pew: Americans' social media use, 2025](https://www.pewresearch.org/internet/2025/11/20/americans-social-media-use-2025)
- [Pew: beliefs about the afterlife, 2025](https://www.pewresearch.org/religion/2025/05/06/beliefs-about-the-afterlife/)
- [YouTube: 1 billion monthly podcast users](https://blog.youtube/news-and-events/1-billion-monthly-podcast-users/)
- [AIR Media-Tech: Shorts and long-form, 18,000 channels](https://air.io/en/audience-growth/do-youtube-shorts-help-your-long-form-videos-grow-data-from-18000-channels)
- [Tubefilter: Metricool Shorts study, 2026](https://www.tubefilter.com/2026/08/03/youtube-shorts-long-form-study-metricool/)
- [Tubefilter: Shorts view counting change, 2025](https://www.tubefilter.com/2025/03/26/youtube-shorts-views-counting-stats/)
- [YouTube multi-language audio rollout](https://ppc.land/youtube-makes-multi-language-audio-available-to-millions-of-creators/)
- [YouTube Collaborations feature](https://ppc.land/youtube-launches-collaboration-feature-for-creator-partnerships/)
- [Buffer: Instagram reach and engagement analysis](https://buffer.com/resources/instagram-reach-engagement-analysis/)
- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Scaled content abuse policy](https://ppc.land/scaled-content-abuse/)
- [Profound: AI platform citation patterns](https://www.tryprofound.com/blog/ai-platform-citation-patterns)
- [Email benchmarks 2025](https://www.neverbounce.com/blog/2025-email-benchmark-report) and [MailerLite benchmarks](https://www.mailerlite.com/blog/compare-your-email-performance-metrics-industry-benchmarks)
- [YouTube inauthentic content update, July 2025](https://www.plagiarismtoday.com/2025/07/08/youtube-targets-inauthentic-content/)
- [YouTube AI labels](https://blog.youtube/news-and-events/improving-ai-labels-for-viewers-and-creators/)
- [Google Ad Grants requirements](https://www.elevationweb.org/blog/google-ad-grant-requirements/)
- [Upload-Post pricing](https://www.upload-post.com/pricing), [Zernio pricing](https://zernio.com/pricing), [Buffer pricing](https://buffer.com/pricing), [Metricool pricing](https://metricool.com/pricing/), [Resend pricing](https://resend.com/pricing)
- [TikTok Content Posting API](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- [Instagram publishing limit](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit)
- [Next Level Soul channel stats](https://vidiq.com/youtube-stats/channel/UCuulUz5sIdikcX8F5mbP2YA) and [Anthony Chene channel stats](https://vidiq.com/youtube-stats/channel/UC-Po06059DOMqDCItQBz7SA)
