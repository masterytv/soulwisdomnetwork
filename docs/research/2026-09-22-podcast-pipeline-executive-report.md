# Podcast Production Pipeline: Executive Report

**Prepared for:** Soul Wisdom Network leadership
**Date:** 22 September 2026
**Decision needed by:** end of week, so the backlog can start processing

---

## 1. The short version

We want one system that takes a Zoom recording and, with almost no manual work, produces a named transcript, a searchable episode record, a website where the team can browse and approve everything, and short clips ready to publish.

We can build that. The recommended path costs **roughly $350 in the first year and about 130 hours of our time**, most of which is a one-time build. After that it settles at **about $11 and 45 minutes of human attention per episode**.

The alternative of buying an off-the-shelf editing tool and doing the work by hand is cheaper to start but costs **about 1 hour 50 minutes per episode forever** — roughly 68 hours a year at our volume, against 27 hours for the built system. The built system pays back its build time in under two years on labour alone, and it is the only option that gives us a website, real search, and a permanent record we own.

**Three things worth knowing before you read on:**

1. **Machine transcription is cheap. Human review is not.** Transcribing and analysing a 60-minute episode costs about $1. Everything else in the budget is either a subscription or our own time. So the design goal is not "cheapest software" — it is "fewest minutes of human attention per episode."
2. **Getting real speaker names is the hard part.** Most transcription services return "Speaker 1", "Speaker 2". Only one service on our shortlist turns those into "Tom" from a simple list of names, with no voice setup. That single capability drives most of the technical design.
3. **Nothing publishes without a human saying yes.** There are four approval points. The automation gets everything ready; a person clicks approve.

---

## 2. What we recommend

Build the pipeline on the website and infrastructure we already have, and buy only the two things we cannot reasonably build.

| Stage | What we do | Why |
|---|---|---|
| **1. Pick up the recording** | A scheduled job checks the Google Drive folder and picks up new files | Reuses the exact pattern our content scout already uses. No new infrastructure. |
| **2. Transcribe with names** | AssemblyAI, about $0.25 per hour of audio | The only shortlisted service that turns "Speaker A" into "Tom" from a plain list of names, in one step, with no voice enrolment, on a full 60-minute file |
| **3. Store the episode record** | One record per episode in our existing database, transcript text in cloud storage | Same database the website already uses. Free at our volume. |
| **4. Management website** | A new Episodes area inside our existing Next.js site | Search, transcript that seeks the video when you click a line, metadata panel, status tracking, approval buttons. Behind our existing login. |
| **5. AI analysis** | Claude, about $0.07 per episode | Produces summary, tags, themes, topics, chapters, key quotes, title options, a description draft and 10 clip suggestions. Our code then checks every quote and timestamp against the transcript. |
| **6. Shorts** | OpusClip, $29/month | The only clipper that accepts exact start and end times, so it can be driven straight from the episode record. We trim each clip first, which cuts the credit cost by six times. |
| **When an episode needs a real edit** | Rent a Descript seat that month, about $35 | Not a monthly commitment. A workbench we pick up when we need it. |

**Four human checkpoints, all on the website:** confirm speaker names → approve summary, tags and chapters → approve which clips to cut → review the finished shorts before they go out.

**Later, if we want to remove the last subscription:** replace OpusClip with our own rendering (Remotion), which is free for teams of three or fewer. That is an extra 2-3 days of build and takes the running cost to essentially zero.

---

## 3. Options by total cost

This is the trade-off table. Every option is priced for the **same workload: the 20-episode backlog plus 36 new episodes (3 a month for a year).** Human hours include the build. No dollar value is placed on our own time — the hours are shown so we can weigh them ourselves.

### Year one: what we spend and what we do

| # | Option | What we get | Build | **Year-one cash** | **Year-one hours** |
|---|---|---|---|---|---|
| 1 | **Transcripts only** | Named transcripts and metadata for every episode. No website, no clips. Files live in the repo. | 3-4 days | **$55** | **50 h** |
| 2 | **Transcripts + website** | Everything in option 1, plus the searchable management site with video, seeking transcript and approvals. No clips. | 6-8 days | **$55** | **80 h** |
| 3 | **Buy, don't build** (Descript) | A professional editor. Speaker naming, edits and clips all done by hand in its interface. No website, no search, no permanent record. | 1 day | **$290** | **110 h** |
| 4 | **Low-code glue** (n8n) | Automated pipeline with approvals in Slack. No website, no search. State split between two systems. | 2-4 days | **$690** | **85 h** |
| 5 | **Full build** (recommended) | Everything: ingest, named transcripts, records, website, AI analysis, clips, publishing | 9.5-13 days | **$350** | **135 h** |
| 6 | **Full build, no subscriptions** | Same as option 5, with our own rendering instead of OpusClip | 12-16 days | **$60** | **155 h** |

### Year two onward: the number that actually matters

Once the build is done it does not recur. This is the ongoing picture at 3 episodes a month.

| # | Option | **Cash per year** | **Hours per year** | **Per episode** |
|---|---|---|---|---|
| 1 | Transcripts only | $35 | 15 h | $1 + 25 min |
| 2 | Transcripts + website | $35 | 14 h | $1 + 23 min |
| 3 | Buy, don't build | $290 | 68 h | $8 + 1 h 50 min |
| 4 | Low-code glue | $670 | 39 h | $19 + 1 h 5 min |
| 5 | **Full build** | **$385** | **27 h** | **$11 + 45 min** |
| 6 | Full build, no subscriptions | $40 | 27 h | $1 + 45 min |

### How to read this

- **Option 3 is the cheapest to start and the most expensive in time.** One day of setup and slightly lower cash than option 5, but every episode costs nearly two hours of someone's attention, forever — 68 hours a year against 27 — and we end up with nothing we own: no search, no record, no site.
- **Option 4 is the worst value.** It costs the most cash of any option and still leaves us without a website. The subscriptions alone cost more than everything else in the running budget.
- **Option 5 is the recommendation.** It is the highest one-time investment and the lowest ongoing one. Against option 3 it saves about 41 hours a year. The build pays for itself in labour in roughly two years, and immediately in everything option 3 cannot do at all.
- **Option 6 is option 5 with the last subscription removed.** Three more days of build, then it runs for about $3 a month. Worth doing once the pipeline is stable and we know what our clips should look like — not on day one, while we are still learning what good output looks like.
- **Options 1 and 2 are real fallbacks, not consolation prizes.** If we want the backlog searchable and nothing else, option 1 gets us there for the price of a dinner. Option 2 adds the site. Both are genuine stopping points — and both are literally the first two phases of option 5, so nothing is wasted if we continue.

### The cheapest route to a decision

Options 1, 2 and 5 are the same project, stopped at different points. We can commit to option 1 this week, see the real transcript quality on our own episodes, and then decide whether to continue. That is the plan in section 7.

---

## 4. The six stages, and why we chose what we chose

### Stage 1 — Getting the recording

We looked at five ways to notice a new recording. A scheduled job that checks the Drive folder wins because it costs nothing, works on the backlog as well as new episodes, and copies a pattern already working in our repo.

The obvious-seeming alternative — have Google notify us the moment a file lands — is worse than it sounds. Those notification channels expire after a week, need a verified domain, and arrive with no information in them, so we would still need a scheduled job to re-subscribe and a second call to find out what changed. We would be maintaining two mechanisms to save 30 minutes of latency on a podcast.

**Cost: $0.** Runs inside our free allowances.

### Stage 2 — Transcription with real names

This is the decision that matters most. Nine services were compared.

| Service | Cost per hour | Turns "Speaker A" into "Tom"? |
|---|---|---|
| **AssemblyAI (recommended)** | **$0.25** | **Yes — from a plain list of names, one step, no voice setup** |
| Deepgram | $0.26 | No — numbers only |
| ElevenLabs | $0.22 | Unclear; the naming feature exists but is undocumented |
| Speechmatics | $0.24 | Yes, but requires enrolling each voice first |
| pyannoteAI | $0.13 + a second service for the words | Yes, with voiceprints — best accuracy, two bills, two systems |
| OpenAI | $0.36 | Yes, but the model is scheduled for removal in early 2027 with no replacement |
| Google Gemini | $0.31 | Caps at 30 minutes per request, and calls three-or-more-speaker attribution experimental |
| Google Speech-to-Text | $0.18-$0.96 | No — numbers only |
| Self-hosted (WhisperX) | Free software | No, and it needs a graphics machine and ongoing babysitting |

AssemblyAI wins on the one feature that removes the most human work. Everything else on the list either gives us numbered speakers — leaving a person to work out who is who — or requires a voice enrolment step we would have to build and maintain.

**Cost: about $0.25 per episode, plus 5-15 minutes of a person confirming the names were right.**

**Worth knowing:** no vendor publishes accuracy figures for crosstalk — people talking over each other. Based on published benchmarks we should expect roughly 8-17% of speech time to be mislabelled on a mixed-down recording, concentrated in interruptions and one-word replies. This is exactly why the confirmation step is mandatory, and why the Zoom settings in section 8 matter: recording each participant on a separate track removes this problem entirely for future episodes.

### Stage 3 — The episode record

One record per episode in our existing database, with the word-by-word transcript in cloud storage alongside it. The transcript goes in storage rather than the database because an hour of word-level timing data can exceed the database's per-record size limit.

We looked at Google Sheets, Notion and Airtable. All three are faster to set up and none of them can do the thing we actually need: click a line of transcript and have the video jump to that moment. They also cost $20 a seat per month, which is more than the entire rest of the pipeline.

**Cost: under $1 per episode**, mostly storing the video.

### Stage 4 — The management website

A new Episodes area inside the site we already run. Browse and filter by title, speaker, tag, theme, topic or status. Search across metadata and full transcript text. Click any transcript line to seek the video. Metadata panel, status tracking, and the four approval buttons. Behind our existing login with a team allowlist.

Search runs in the browser, which is free and instant up to about 50 episodes. Past that we add a hosted search index — still free at our size, and cheap well beyond it.

**Cost: $0** within our existing free allowances, plus about $0.07 of bandwidth each time someone watches a full episode on the site.

**Build: 3-4 days.** This is the single biggest piece of work and the thing none of the buy-it options provide.

### Stage 5 — AI analysis

Claude reads the transcript and returns the summary, tags, themes, topics, chapters, key quotes, title options, a description draft and 10 clip candidates with exact timings.

The risk with any AI summary is invented quotes and drifting timestamps. We handle that in code rather than by trusting the model: every utterance is numbered, the model may only cite those numbers, every quote must appear word-for-word in the transcript or it gets flagged, and every timestamp is checked against the episode length and snapped to real word boundaries.

We also looked at feeding the video itself to Google Gemini — the only frontier model that accepts a 60-minute video. It costs four to eight times as much, its timestamps are less reliable than the transcript's, and it does not know who anyone is. Worth revisiting if we ever need visual cues, like reactions and gestures, to pick clips.

**Cost: about $0.07 per episode**, plus 23 minutes of approval.

### Stage 6 — Shorts

Two tracks, and we need both.

**Automated shorts** come from OpusClip, which is the only clipper that will take our exact start and end times instead of choosing its own moments. That matters: it means the clips our team approved on the website are the clips that get rendered. We trim each approved range to 60-90 seconds before sending it, which drops the credit cost from 180 to 30 per episode — one $29 seat covers 10 episodes a month instead of under two.

**Human edits** go to Descript, rented by the month only when an episode needs a real cut. Descript now has a proper API and can import a Zoom recording as a multitrack session with speakers auto-detected — but it has no way to set speaker names or cut by timestamp from the API, so those stay manual. It is a good workbench, not a good pipeline.

**Later:** our own rendering (Remotion) is free for a team of our size and gives full control over branding. Add 2-3 days of build and the $29/month goes away.

**Cost: $29/month, plus 22 minutes per episode to pick and review clips.**

---

## 5. The four end-to-end options compared

| | **A. Buy Descript** | **B. Low-code glue** | **C. Build it** | **D. Build it + rent Descript** |
|---|---|---|---|---|
| Build time | 1 day | 2-4 days | 9-12 days | 9.5-13 days |
| Cash per episode | $8 | $19 | $11 | $11, or $19 with a Descript seat |
| Human time per episode | 1 h 50 min | 1 h 5 min | 45 min | 45 min |
| Management website | No | No | **Yes** | **Yes** |
| Search across transcripts | No | No | **Yes** | **Yes** |
| Fits our existing stack | No | Partly | **Yes** | **Yes** |
| We own the data | No | Partly | **Yes** | **Yes** |
| Professional editing available | Yes | No | No | **Yes, when needed** |
| Risk of wrong output reaching the public | Medium | Medium | Low | **Lowest** |

**D is the recommendation.** It is C plus the option to rent a professional editor for the episodes that deserve one. It costs the same as C until we actually use that option, and it closes C's only real gap — there is no good tool for taste-driven cuts that is not a human in an editing interface.

---

## 6. Getting from "Speaker 1" to "Tom"

This deserves its own section because it is where automated pipelines usually fail, and where the quality of everything downstream is decided. A wrong name in the transcript becomes a wrong name in the summary, in the chapters, in the clip captions, and eventually in a published short.

**Four ways to do it, in order of how well they work:**

1. **Separate audio track per person.** If Zoom records each participant on their own track, attribution is not a guess — we know who is speaking because we know whose microphone it is. Perfect through crosstalk. Only works for future episodes, only if the setting is on, and it is not retroactive.
2. **Give the service the list of names.** AssemblyAI takes a list of who is in the room and maps each detected voice to one of them. Works on the existing backlog. Accuracy is bounded by how well it separates the voices in the first place.
3. **Voiceprints.** Enrol each recurring host once from 30-60 seconds of clean audio; the system then recognises them across every future episode. Best accuracy available, and it can be applied retroactively to the backlog. Adds a second vendor and a second bill.
4. **A person confirms.** One screen, one line per detected speaker with a sample sentence and a name dropdown. Always correct if someone is paying attention.

**Our plan uses 2 and 4 now, 1 as soon as Zoom is configured, and 3 as an upgrade.** Practically: the pipeline sends AssemblyAI the participant names, then shows a confirmation screen with a sample sentence for each detected speaker. A person confirms or corrects it in about 5 minutes on a clean episode, 15 on a messy one. Once confirmed, we can use that clean audio to enrol voiceprints for our recurring hosts and stop doing this step for them.

**The 20 backlog episodes get nothing from Zoom.** Per-participant audio and Zoom's own transcripts are not retroactive. The backlog goes through approach 2 with a person confirming.

---

## 7. Rollout

Three phases, each of which is a real stopping point.

### Phase 1 — Backlog transcripts and metadata (week 1, 3-4 days)

Process all 20 existing episodes: named transcripts with timestamps, summaries, tags, themes, topics, chapters, key quotes. Approvals happen as file edits for now.

**Cost: about $20. About 8 hours of review across the 20 episodes.**
**Done when:** all 20 episodes have confirmed speaker names, approved metadata and verified quotes.

Before this starts, a half-day of housekeeping: three of our dependencies need updating, including one that has reached end of life.

### Phase 2 — Management website (weeks 2-3, 3-4 days)

The Episodes area: list, search, filter, video player, seeking transcript, metadata panel, status tracking. The approval steps move from file edits onto the site.

**Cost: $0** within existing free allowances. **About 6 hours of review** for the new episodes that arrive during this period.
**Done when:** the team can find an episode by title, speaker, tag or a phrase from the transcript, and clicking a transcript line seeks the video on both desktop and phone.

### Phase 3 — Clips and shorts (weeks 3-4, 3-4 days)

Clip picking, automatic trimming, rendering, review, and publishing to YouTube as unlisted.

**Cost: $29/month. About 22 minutes per episode** to pick and review clips.
**Done when:** a new episode goes from Drive to published shorts in under 45 minutes of human time, and nothing reaches YouTube without two human approvals.

---

## 8. Do this before we commit — about one hour

Four checks on our own Zoom account. They are cheap, and two of them could materially reduce the human time per episode.

1. **Turn on the four recording settings** (separate audio per participant, audio transcript, display participants' names, record views separately), record a three-minute test, and check whether the per-participant audio files are labelled with people's names. If they are, future episodes get speaker names for free and the confirmation step becomes a formality.
2. **Download that test recording's transcript file** and check whether it already carries speaker names. If it does, Zoom gives us a head start on every future episode at no cost.
3. **Open one backlog recording** and note the layout — active speaker, gallery tiles, or shared screen. This decides how shorts get cropped to vertical, and whether shorts are even possible from a screen-share-heavy episode.
4. **Check whether cloud copies of the 20 backlog meetings still exist** in Zoom with transcripts. If they do, we get free speaker labels for the entire backlog.

Alongside these, a **$0.50 pilot**: run two backlog episodes through AssemblyAI and count the naming errors. That single number tells us whether to budget 5 minutes or 15 minutes per episode for confirmation — which, across a year, is the difference between 27 and 33 hours.

---

## 9. Risks

| Risk | What could happen | How we handle it |
|---|---|---|
| **Wrong speaker names** | A clip goes out attributing a quote to the wrong person | Mandatory confirmation before anything proceeds; the $0.50 pilot measures the real error rate; the final shorts review catches wrong-face crops; per-participant Zoom audio removes the problem for future episodes |
| **Invented summaries or quotes** | An AI-written description contains something nobody said | Every quote must match the transcript word-for-word or it is flagged; every timestamp is range-checked; nothing is published without approval |
| **Guest privacy** | Guest audio reaches four or five vendors, each with different default data policies | Settle every vendor's retention and training settings before the first upload; delete transcripts from the vendor once copied; several default to using our data for training unless we opt out |
| **Vendor lock-in** | A vendor changes terms or shuts down and we lose our work | Our database and storage are the permanent record; every vendor sits behind a swappable interface; OpusClip projects expire after 30 days, so we pull exports immediately |
| **Cost creep at volume** | Clip credits or editing seats quietly multiply | Pre-trimming clips cuts credits six-fold; we verify the credit charging on day one; usage is tracked per episode with an alert before any seat limit |
| **Dependency drift** | Something breaks because an SDK reached end of life | One half-day of updates before Phase 1; ongoing dependency checks in CI |

The single largest risk is the first one, and the mitigation is the same in every case: a person confirms before anything moves forward.

---

## 10. Decisions we need

**This week, because they change what gets built:**

1. **Which cost option?** Section 3. The recommendation is option 5, committing one phase at a time.
2. **Zoom setup.** Which settings are on, and results of the four checks in section 8.
3. **Subscription ceiling.** $29/month, $53-64/month if we keep a Descript seat, or $0 with three extra days of build.

**Assumptions we have used — tell us if any are wrong:**

| # | Assumption |
|---|---|
| 1 | 60-minute episodes, 3 speakers. A 90-minute average raises API costs by half. |
| 2 | 3 episodes a month. One clip seat covers 10 a month, so growth is cheap. |
| 3 | The 20 backlog files are plain video files in Drive, with no Zoom transcript or separate tracks. |
| 4 | YouTube Shorts first, then TikTok, Instagram and LinkedIn. |
| 5 | Descript is not currently licensed. |
| 6 | One team member runs all four approval steps. |
| 7 | US processing is acceptable; EU-only processing is available but changes prices. |
| 8 | Team of three or fewer, which makes our own rendering free. |
| 9 | One Drive subfolder per episode going forward, containing the video and a list of participants. |
| 10 | An admin can create a service account and share the Drive folder. |

---

## 11. Where these numbers come from

Every figure here comes from a detailed research report produced on 21 September 2026, which compared 40-plus services across the six stages with full source citations. That report is at `docs/research/2026-09-21-podcast-pipeline-options.md`.

Two caveats worth stating plainly:

- **Prices are as published in September 2026 and should be confirmed on the vendor's site before we buy anything.** The detailed report lists exactly which figures need reconfirming. None of them would change the recommendation — the gaps between options are much larger than any plausible price movement.
- **Build-time estimates assume the work is done with Claude Code**, as our existing agent work was. They are estimates, not quotes. The phased plan exists partly so that the first phase tells us how good those estimates are before we commit to the rest.
