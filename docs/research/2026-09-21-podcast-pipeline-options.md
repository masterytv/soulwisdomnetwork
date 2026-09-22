# Automated Podcast Post-Production Pipeline: Zoom to Drive to Named Transcript to Management Website to AI Clips

Research date: 2026-09-21 (all prices and limits were checked on that date). Prepared for the soulwisdomnetwork team (Next.js 16, Firebase App Hosting, Firestore, GitHub Actions, Claude Code).

**How to read the tags.** `[VERIFIED 2026-09-21 #n]` = the page loaded live in the research environment; `[SNIPPET 2026-09-21 #n]` = the official page was read through a search-engine index because the environment's egress allowlist blocked the site itself; `[THIRD-PARTY 2026-09-21 #n]` = dated non-vendor page; `[UNVERIFIED - estimate: reasoning]` = our own assumption; `[NOT FOUND]`, `[COULD NOT ACCESS 2026-09-21 #n]` and `[EXISTENCE UNCONFIRMED]` as named. `#n` points to the numbered source in section 9 (URL, access date and evidence class). `[UNVERIFIED - estimate: G]` = human-minute assumptions listed in register row (a) of section 8; `[UNVERIFIED - conservative assumption: Descript media hours #1]` = 3 media hours assumed per 3-track import (per-track billing NOT FOUND). No number in this report comes from memory. Most vendor pricing pages could only be read as SNIPPET grade, so confirm them on the live page before purchase; section 8 lists every non-VERIFIED price, limit and vendor claim. The body exceeds the brief's 3,000-5,000 words because the Section 4 schema requires ten populated columns for every option row.

**Assumptions in all arithmetic:** 60-min episode, 3 speakers, 3 episodes/month (midpoint of 2-4; 10/month as stress case), 20-episode backlog, $50/hr labor, 1 EUR = 1.10 USD [UNVERIFIED - estimate: assumed FX rate].

## 1. Executive summary

Build **Bundle D (Hybrid)**: custom code on your stack for ingest (GitHub Actions cron polling Drive), transcription, metadata and the website; OpusClip's API (later Remotion) renders shorts from the Firestore record; Descript is leased only when an episode needs a human cut. Transcription: AssemblyAI `universal-3-5-pro` with Speaker Identification, which names speakers from a text candidate list without enrollment, on a 60-min MP4 by URL, $0.25/hr [SNIPPET 2026-09-21 #2]. Analysis: Claude Sonnet 5 structured outputs, $0.074/episode [VERIFIED 2026-09-21 #3].

Setup: 9.5-13 developer-days ($3,800.00-$5,200.00 at $50/hr) [UNVERIFIED - estimate: section 5]. Subscriptions: none in weeks 1-2; OpusClip Pro $29.00/month from week 3 [SNIPPET 2026-09-21 #4]; Descript $35.00 monthly only when needed [THIRD-PARTY 2026-09-21 #5]. Backlog of 20: $18.98 API plus $416.67 review.

Per episode at 3/month: **$48.19** ($1.02 API and infrastructure = $0.95 plus $0.072 egress billed only beyond the free 100 GB/month; $9.67 subscription; $37.50 for 45 minutes of checkpoints); $56.19 with a Descript seat; $41.42 at 10/month. Bundle A (Descript only): $102.17, labor dominates.

Biggest risk: speaker mislabeling. Context-based naming has no voice memory and no vendor publishes crosstalk accuracy; a mandatory confirmation step gates every episode, and per-participant Zoom audio makes attribution deterministic once tests 1-2 (section 1.2) pass.

### 1.1 Buy list by week

|When|Buy|Fund or configure (no purchase)|Cash out|
|---|---|---|---|
|Week 1 (Phase 1)|Nothing|AssemblyAI paid account (Speaker Identification is outside the $50 credit [SNIPPET 2026-09-21 #2]); training opt-out [SNIPPET 2026-09-21 #6]; Anthropic API key [VERIFIED 2026-09-21 #3]; Day-0 pilot 2 x $0.25 = $0.50 [SNIPPET 2026-09-21 #2]|~$19 API over the backlog ($18.98, 3.3) [SNIPPET 2026-09-21 #2] [VERIFIED 2026-09-21 #3] [VERIFIED 2026-09-21 #7]|
|Week 2 (Phase 2)|Nothing|Firebase Auth exists; Cloud Storage bucket for proxies and transcripts|$0 in free tiers [VERIFIED 2026-09-21 #7]|
|Week 3 (Phase 3)|OpusClip Pro, monthly, $29.00 [SNIPPET 2026-09-21 #4]|Day-1 check: a pre-trimmed 60-90 s upload is charged the 10-credit minimum, not the source length [SNIPPET 2026-09-21 #8]; YouTube OAuth consent|$29.00 [SNIPPET 2026-09-21 #4]|
|First episode needing polish|Descript Creator, monthly, $35.00 [THIRD-PARTY 2026-09-21 #5]|Annual $288.00 [SNIPPET 2026-09-21 #9] only once the "early access" API is confirmed on the account [SNIPPET 2026-09-21 #10]|$35.00 [THIRD-PARTY 2026-09-21 #5]|

Recurring floor: $29.00/month (Bundle C) [SNIPPET 2026-09-21 #4]; $53.00-$64.00/month with Descript kept (annual $24.00 [SNIPPET 2026-09-21 #9] or monthly $35.00 [THIRD-PARTY 2026-09-21 #5]); $0/month on Remotion [VERIFIED 2026-09-21 #11] (+2-3 dev-days, Stage 6).

### 1.2 Test this week (about one hour, before Phase 1)

|#|Where and what|Pass|Fail means|
|---|---|---|---|
|1|Zoom web portal > Settings > Recording: enable "Record a separate audio file of each participant", "Audio transcript", "Display participants' names in the recording", "Record active speaker, gallery view and shared screen separately" [SNIPPET 2026-09-21 #12] [SNIPPET 2026-09-21 #13] [VERIFIED 2026-09-21 #14]; record a 3-min cloud test; `GET /meetings/{meetingId}/recordings`, read `participant_audio_files[].file_name` [SNIPPET 2026-09-21 #12]|File names carry display names: Fallback 1 works|Generic names: map via the participants list, or AssemblyAI plus confirmation|
|2|Download that recording's `.transcript.vtt` [SNIPPET 2026-09-21 #15] [THIRD-PARTY 2026-09-21 #16]|Cues carry display names: Zoom seeds names|No names: tracks (test 1) or AssemblyAI only|
|3|Open the test MP4 and one backlog MP4; note the layout: active speaker, gallery tiles or shared screen [SNIPPET 2026-09-21 #13]|Gallery or active-speaker: Stage 6 crop mechanism applies|Shared-screen layout: shorts need the separate active-speaker file|
|4|Zoom web portal > Recordings: do cloud copies of the 20 backlog meetings still exist with a transcript? (5 min [UNVERIFIED - estimate])|Yes: free display-name labels from `.transcript.vtt`|No: names from `docs/episodes/_manifest.csv` plus AssemblyAI|

### 1.3 Three decisions we need this week (the rest are in section 7)

1. **Zoom mode** and the results of tests 1-4. Assumed: plain MP4s in Drive, all four settings off.
2. **Episodes per month and length.** Assumed 3/month at 60 min. Drives OpusClip credits (30/episode after pre-trim, 10 episodes per seat [SNIPPET 2026-09-21 #8]) and Descript media hours (assumed 3 per 3-track import, 10 episodes per seat [UNVERIFIED - conservative assumption: Descript media hours #1]).
3. **Subscription ceiling.** $29/month (OpusClip only [SNIPPET 2026-09-21 #4]), $53-$64/month (plus Descript [SNIPPET 2026-09-21 #9] [THIRD-PARTY 2026-09-21 #5]), or $0 with Remotion [VERIFIED 2026-09-21 #11].

## 2. Stage-by-stage tables

Basis: 60-min episode, 3/month (10/month in brackets), $50/hr. Every Setup time is [UNVERIFIED - estimate: Claude Code-assisted build]; every human-minute figure is [UNVERIFIED - estimate: G]. Stage 1 needs 0 human minutes.

### Stage 1: Ingest trigger

|Option|Setup time|Setup cost|Price as quoted|Derived cost per 60-min episode|Automation|Quality risk|Pros|Cons|Confidence|
|---|---|---|---|---|---|---|---|---|---|
|GitHub Actions cron polling Drive (`daily_harvest.yml` pattern), DEFAULT|2-4 h|$0|Linux 2-core $0.006/min beyond 2,000 free min/month, monthly [VERIFIED 2026-09-21 #17]; job max 6 h [VERIFIED 2026-09-21 #18]|30-60 runner-min [UNVERIFIED - estimate: encode 1-2x realtime]; 60 x $0.006 = $0.36 list; 180 min at 3/mo (600 at 10/mo) < 2,000 free = $0 [VERIFIED 2026-09-21 #17]|Full: cron > list > diff Firestore|Low: latency equals cron interval|Zero new infra|Up to an hour of latency|H|
|Cloud Run job + Cloud Scheduler polling|4-8 h|$0 (3 jobs free)|$0.10/job/month, 3 free [VERIFIED 2026-09-21 #19]; $0.000018/vCPU-s, $0.000002/GiB-s, 240,000 vCPU-s/month free, monthly [VERIFIED 2026-09-21 #20]; task timeout 168 h [SNIPPET 2026-09-21 #21]|4 x 1,200 s x $0.000018 + 16 x 1,200 s x $0.000002 = $0.1248 + $0.10/3 = $0.158 list; $0 in free tiers [VERIFIED 2026-09-21 #20]|Full: Scheduler > job > diff|Low: Med if 600 s default timeout stays|No 6 h cap|Deploy step|H: live-loaded|
|Drive push (`changes.watch` to an HTTPS receiver)|6-12 h|$0|Drive API free; channels expire after 1 week (`changes`) / 1 day (`files`); verified domain; empty body [SNIPPET 2026-09-21 #22]|$0 + job $0.1248 list / $0 free tier [VERIFIED 2026-09-21 #20]|Full: push > `changes.list` > job|Med: channel expiry silently stops events|Seconds of latency|Cron still needed to re-watch|M: snippet|
|Zoom `recording.completed` webhook (S2S OAuth app)|4-8 h|$0 if Zoom already paid|Workplace Pro $14.16/user/month annual [SNIPPET 2026-09-21 #23]; answer in 3 s, 5xx-only retries [SNIPPET 2026-09-21 #24]; download token 24 h [SNIPPET 2026-09-21 #25]; storage 5 GB/license [SNIPPET 2026-09-21 #26] vs 10 GB [SNIPPET 2026-09-21 #23]|API $0; seat if attributed $14.16/3 = $4.72 ($1.42) [SNIPPET 2026-09-21 #23]|Full, new episodes only: webhook > download > Storage|Med: non-5xx failures lose the event|Earliest|No backlog|M|
|n8n / Make / Zapier trigger|2-4 h|$24 / $12 / $19.99 first month [SNIPPET 2026-09-21 #27] [SNIPPET 2026-09-21 #28] [SNIPPET 2026-09-21 #29]|n8n Starter $24/mo monthly, 2,500 executions [SNIPPET 2026-09-21 #27], 320 MiB RAM [VERIFIED 2026-09-21 #30]; Make Core $12/mo monthly, 10,000 credits [SNIPPET 2026-09-21 #28], 100 MB/file [SNIPPET 2026-09-21 #31]; Zapier Professional from $19.99/mo, 750 tasks, cycle not in snippet [SNIPPET 2026-09-21 #29]|$24/3 = $8.00 ($2.40) [SNIPPET 2026-09-21 #27]; $12/3 = $4.00 ($1.20) [SNIPPET 2026-09-21 #28]; $19.99/3 = $6.66 ($2.00) [SNIPPET 2026-09-21 #29]|Full: Drive Trigger (1-min poll, no subfolders [VERIFIED 2026-09-21 #32]) > HTTP nodes|Med: Make 40-min scenario cap [THIRD-PARTY 2026-09-21 #33]|Fastest demo|No n8n Zoom trigger; fee dwarfs API|M|

**Hard limits.** Push channels carry no payload [SNIPPET 2026-09-21 #22]; n8n 320 MiB [VERIFIED 2026-09-21 #30] and Make 100 MB/file [SNIPPET 2026-09-21 #31] forbid routing the MP4 through a workflow; Cloud Run functions cap at 540 s (event) / 1,800 s (scheduled) / 3,600 s (HTTP), so downloads belong in a job [VERIFIED 2026-09-21 #34]; Drive quotas changed 2026-05-01, overage billing pending [SNIPPET 2026-09-21 #35].

**Changes since January 2025.** Drive API: new quota units for projects created after 2026-05-01 [SNIPPET 2026-09-21 #35]. GitHub Actions: runner prices cut 2026-01-01 [SNIPPET 2026-09-21 #36] [VERIFIED 2026-09-21 #17]. Zoom: no `recording.completed` change found [SNIPPET 2026-09-21 #37] [NOT FOUND]. n8n: 3.0 self-host Docker-only, October 2026 [VERIFIED 2026-09-21 #38]. Make: credits replaced operations, November 2025 [SNIPPET 2026-09-21 #39]. Zapier: AI-step pricing change 2026-06-15 [SNIPPET 2026-09-21 #40].

### Stage 2: Transcription with real speaker names and timestamps

Derived cost = API + LLM naming pass where the vendor returns integer labels (Claude Haiku 4.5, 15,500 in / 300 out = $0.017 [VERIFIED 2026-09-21 #3]) + name confirmation 5 min = $4.17 clean (15 min = $12.50 messy, the planning case in sections 3 and 5). Not shortlisted (integer labels): AWS $0.36/hr [VERIFIED 2026-09-21 #41]; Azure ~$0.18/hr [THIRD-PARTY 2026-09-21 #42]; Gladia $0.61/hr [SNIPPET 2026-09-21 #43]; Zoom's transcript (4.1) [SNIPPET 2026-09-21 #15], Scribe API price [COULD NOT ACCESS 2026-09-21 #44].

|Option (model ID; timestamps; max input; native diarization)|Setup time|Setup cost|Price as quoted|Derived cost per 60-min episode|Automation|Quality risk|Pros|Cons|Confidence|
|---|---|---|---|---|---|---|---|---|---|
|AssemblyAI `universal-3-5-pro` + `speaker_labels` + Speaker Identification, DEFAULT; word ms [VERIFIED 2026-09-21 #45]; 5 GB / 10 h by URL; native|2-4 h|$0 ($50 credit; Speaker ID paid-only [SNIPPET 2026-09-21 #2])|$0.21 + $0.02 labels + $0.02 Speaker ID = $0.25/hr, per second [SNIPPET 2026-09-21 #2]; names from a per-file list, "accuracy highest with 2-4 speakers" [SNIPPET 2026-09-21 #46]|$0.25 + $4.17 = $4.42 ($12.75 messy) [SNIPPET 2026-09-21 #2]|Full to checkpoint 1: URL + names > webhook > confirm|Low-Med: misses a silent guest|Names in one call|No voice memory|H features, M price|
|Deepgram `nova-3` + LLM naming; word [VERIFIED 2026-09-21 #47]; 2 GB, 10-min processing cap; native|3-5 h|$0 ($200 credit [SNIPPET 2026-09-21 #48])|$0.0043/min mono = $0.258/hr, diarization included [SNIPPET 2026-09-21 #48]; `mip_opt_out=true` = request-only retention [SNIPPET 2026-09-21 #49]|$0.258 + $0.017 + $4.17 = $4.445 [SNIPPET 2026-09-21 #48]|Full: callback > Haiku naming > confirm|Med: competitor-run DER 26.9% [THIRD-PARTY 2026-09-21 #50]|Longest free runway|Training opt-in by default|M: price snippet|
|OpenAI `gpt-4o-transcribe-diarize` + known speakers; segment-level only [VERIFIED 2026-09-21 #51]; 25 MB/request [SNIPPET 2026-09-21 #52]; native|6-10 h|$0|$0.006/min = $0.36/hr [SNIPPET 2026-09-21 #53]; `known_speaker_names[]` + 2-10 s clips, max 4 speakers, per request|$0.36 + $4.17 = $4.53 [SNIPPET 2026-09-21 #53]|Full: chunk > transcribe > stitch|High: removal 2027-02-26, no successor [THIRD-PARTY 2026-09-21 #54]|Voice references|25 MB forces chunking|M: price snippet|
|Google `gemini-3.5-transcribe`; word [VERIFIED 2026-09-21 #55]; 30 min/request with diarization; native `spk:n`, up to 8|6-10 h|$0|Audio in $2.00/M, text out $12/M tokens, usage monthly; page's basis 25 audio tokens/s, 175 text tokens/min, blended $0.0051/audio-min [VERIFIED 2026-09-21 #56]; "3 or more speakers is experimental" [SNIPPET 2026-09-21 #57]|90,000 tok x $2.00/M = $0.18 + 10,500 tok x $12/M = $0.126 = $0.31; + $0.017 + $4.17 = $4.50 [VERIFIED 2026-09-21 #56]|Full: two chunks > re-align labels > naming|High: chunk-boundary drift|Cheap|No `custom_vocabulary` with diarization|M: cap from snippet|
|Google `gemini-3.8-flash` audio understanding; `MM:SS` text timestamps; 9.5 h audio, 2 GB file; prompted diarization|3-6 h|$0|$0.75/M in, $3.75/M out promo to 2026-12-31, then $1.50/$7.50 [VERIFIED 2026-09-21 #56]; audio 32 tok/s [SNIPPET 2026-09-21 #58]|115,200 tok x $0.75/M = $0.0864 + 14,000 out x $3.75/M = $0.0525 = $0.1389 (standard $0.2778) + $4.17 = $4.31 [VERIFIED 2026-09-21 #56] [SNIPPET 2026-09-21 #58]|Full: upload > prompt > validate JSON|High: generated, not verbatim|Cheapest|Hallucination risk|M: token rate snippet|
|Google STT v2 `chirp_3`; word offsets [VERIFIED 2026-09-21 #59]; 8 h batch via GCS [SNIPPET 2026-09-21 #60]; native|4-8 h|$0|$0.016/min = $0.96/hr; dynamic batch $0.003/min = $0.18/hr, 24 h SLO [VERIFIED 2026-09-21 #61]|$0.96 (batch $0.18) + $0.017 + $4.17 = $5.15 ($4.37) [VERIFIED 2026-09-21 #61]|Full: GCS upload > `batchRecognize` > naming|Med: generic labels only|In-GCP|4x the default price|H: live-loaded|
|ElevenLabs `scribe_v2`; word [VERIFIED 2026-09-21 #62]; 5 GB / 10 h; native, 32 speakers|3-5 h|$0|$0.22/hr batch, $0.39/hr realtime [SNIPPET 2026-09-21 #63]; `use_speaker_library` flag, registration endpoint NOT FOUND|$0.22 + $0.017 + $4.17 = $4.41 [SNIPPET 2026-09-21 #63]|Full: upload > webhook > naming|Med: speaker library API unknown|Cheapest full API|Zero retention Enterprise-only [SNIPPET 2026-09-21 #64]|M: price snippet|
|Speechmatics batch, `standard` / `enhanced` / `melia-1` (no identification on `melia-1`) [VERIFIED 2026-09-21 #65]; word; 1 GB; native|4-8 h|$0 ($100 credit [VERIFIED 2026-09-21 #66])|From $0.24/hr; `melia-1` from $0.129/hr; per second [SNIPPET 2026-09-21 #67]; enrolled identifiers, max 50, key-bound [SNIPPET 2026-09-21 #68]|$0.24 + $4.17 = $4.41 [SNIPPET 2026-09-21 #67]|Full: enroll once > job with `speakers[]` > confirm guests|Low-Med: guests still inferred|Cleanest "Tom:" mechanism|Identifiers key-bound|M: price snippet|
|pyannoteAI `precision-2` + voiceprints + Deepgram words; turn-level [VERIFIED 2026-09-21 #69]; max input [NOT FOUND]; diarization only|8-16 h|Developer EUR 19/mo = $20.90 first month if required [SNIPPET 2026-09-21 #70]|EUR 0.112/hr; EUR 0.015 per voiceprint; monthly plan [SNIPPET 2026-09-21 #70]|EUR 0.112 x 1.10 = $0.1232 + 3 x EUR 0.015 x 1.10 / 20 = $0.0025 = $0.1257 [UNVERIFIED - estimate: FX 1.10] + $0.258 + $4.17 = $4.55 (+ $6.97 if the plan is mandatory) [SNIPPET 2026-09-21 #70]|Full: diarize > identify > merge words|Low: DER 12.9% AMI-IHM [VERIFIED 2026-09-21 #71]; Med integration|Persistent voice map; best DER|Two bills; EUR|M: EUR snippet|
|WhisperX `large-v2` + pyannote `speaker-diarization-community-1`, self-hosted [VERIFIED 2026-09-21 #72]; word (forced alignment); max input [NOT FOUND], hardware-bound|1-3 days|$0 software|~70x realtime on GPU only [VERIFIED 2026-09-21 #72]|Cloud Run 20-min CPU run $0.1248 list, $0 free tier [VERIFIED 2026-09-21 #20] [UNVERIFIED - estimate: CPU runtime] + $0.017 + $12.50 messy review (DER 17-27% [VERIFIED 2026-09-21 #71]) = $12.64|Full, self-operated: job > WhisperX > naming|High: DER 17-27% [VERIFIED 2026-09-21 #71]|No data leaves your project|Ops burden|M: CPU runtime unmeasured|

**Hard limits.** Only pyannoteAI and Speechmatics keep a voice profile across files; AssemblyAI and OpenAI name per file; the rest return integers. Zoom's transcript exists only for recordings still in Zoom cloud [SNIPPET 2026-09-21 #15]; ElevenLabs multichannel caps at 1 h per file [VERIFIED 2026-09-21 #73]; WhisperX runs ~70x realtime on GPU only [VERIFIED 2026-09-21 #72] and adds 1-3 days of ops. Before guest audio is sent: AssemblyAI free tier cannot opt out of training [SNIPPET 2026-09-21 #6], Deepgram opts in by default [SNIPPET 2026-09-21 #49], Gladia Free retains recordings 1 year [VERIFIED 2026-09-21 #74].

**Changes since January 2025.** AssemblyAI: Universal-3.5 Pro async 2026-07-07 at $0.21/hr, Universal-3 Pro retired 2026-09-02 [SNIPPET 2026-09-21 #75]. Deepgram: Nova-3 (2025-02), Batch Diarization v2 GA 2026-05, `speaker_confidence` 2026-08-28 [VERIFIED 2026-09-21 #76]. OpenAI: transcription family deprecation announced 2026-08-26, removal 2027-02-26 [THIRD-PARTY 2026-09-21 #54]. Chirp 3: no relevant change found [NOT FOUND], V2 still $0.016/min [VERIFIED 2026-09-21 #61]. Gemini: Gemini 3 family, `gemini-3.5-transcribe`, promo to 2026-12-31 [VERIFIED 2026-09-21 #56]. Speechmatics: `melia-1`, credit billing [VERIFIED 2026-09-21 #65] [VERIFIED 2026-09-21 #66]. pyannoteAI: `/voiceprint` and `/identify` in the SDK [VERIFIED 2026-09-21 #69]. WhisperX 3.8.x, pyannote.audio 4.0 [VERIFIED 2026-09-21 #72] [VERIFIED 2026-09-21 #77]. ElevenLabs: `scribe_v1` removal date [NOT FOUND] [VERIFIED 2026-09-21 #62].

### Stage 3: Per-episode metadata record

|Option|Setup time|Setup cost|Price as quoted|Derived cost per 60-min episode|Automation|Quality risk|Pros|Cons|Confidence|
|---|---|---|---|---|---|---|---|---|---|
|Firestore `episodes` doc + Cloud Storage `transcripts/{id}.json`, RECOMMENDED|0.5-1 day|$0 (Blaze on)|Free 50k reads / 20k writes per day, then $0.03 per 100k reads, $0.09 per 100k writes, monthly; 1 MiB document limit [VERIFIED 2026-09-21 #78]; Storage $0.020/GiB-month [VERIFIED 2026-09-21 #7]|2,000 reads + 300 writes = $0.00087 list, $0 free quota [VERIFIED 2026-09-21 #78]; 12 x 2.6 GiB x $0.020/GiB-month = $0.624 [VERIFIED 2026-09-21 #7] [UNVERIFIED - estimate: 2.0 + 0.6 GiB]|Full: pipeline writes doc > JSON to Storage > status in code|Low: typed schema|Same DB as the app|No native text search|H|
|Google Sheet + Doc per transcript|0.5 day|$0 (Workspace paid)|Sheets API v4 [VERIFIED 2026-09-21 #79]; cell limits [COULD NOT ACCESS 2026-09-21 #80]|$0 API + 5 min tidying flattened cells = $4.17 [UNVERIFIED - estimate]|One-click: script appends row > Doc link > status dropdown|Med: arrays flattened, no validation|Zero code|No transcript seek|M|
|Markdown in repo (`docs/episodes/*.md` + JSON sidecar)|0.5 day|$0|Actions $0.006/min beyond 2,000 free [VERIFIED 2026-09-21 #17]|$0 (commit job < 1 min, inside the free minutes) [VERIFIED 2026-09-21 #17]|Full for writes: job > commit > status via PR edits|Med: hand-edited front matter|Versioned diffs|No query API|H|
|Notion database|1 day|$60 first month (3 members) [SNIPPET 2026-09-21 #81]|Business $20/member/mo, annual [SNIPPET 2026-09-21 #81]; API search title-only, 10,000-row cap [VERIFIED 2026-09-21 #82]|$60/3 = $20.00 ($6.00 at 10/mo) [SNIPPET 2026-09-21 #81]|One-click: n8n Notion node > page > status select|Med: transcript not API-searchable|Browse UI|No seekable player|M: price snippet|
|Airtable base|1 day|$60 first month (3 users) [SNIPPET 2026-09-21 #83]|Team $20/user/mo, annual [SNIPPET 2026-09-21 #83]; 10 GB attachments per base [SNIPPET 2026-09-21 #84]; JS SDK last published 2023-08-16 [VERIFIED 2026-09-21 #85]|$60/3 = $20.00 ($6.00 at 10/mo) [SNIPPET 2026-09-21 #83]|One-click: script creates record > attachment > status field|Med: 10 GB fills after ~5 MP4s [UNVERIFIED - estimate]|Views, Interfaces|Dormant SDK|M: price snippet|

**Schema** (Firestore `episodes/{id}`; word-level JSON in Storage because ~9,000-11,000 words x ~100-120 bytes with per-word start/end/confidence/speaker = 0.9-1.3 MB can exceed the 1 MiB cap [VERIFIED 2026-09-21 #86] [UNVERIFIED - estimate: bytes per word]): `id`, `title`, `recordedAt`, `durationSec` [VERIFIED 2026-09-21 #87], `source{}` (Drive id, Storage and proxy paths), `video{}` (playback URL or YouTube id, deep-link format), `speakers[] {id, name, zoomDisplayName?, voiceprintId?, confirmed, galleryTile?}`, `transcript{}` (path, vendor, model, speaker map), `summary{}`, `titleOptions[]`, `descriptionDraft`, `tags[]`, `themes[]`, `topics[]`, `chapters[] {startSec, endSec, title}`, `keyQuotes[] {startSec, endSec, speakerId, text, verified}`, `clipCandidates[] {startSec, endSec, hook, platform, score, status}`, `status` (`ingested` > `transcribed` > `speakers_confirmed` > `summarized` > `analyzed` > `edited` > `published`, code-written). Deep links: website `/episodes/{id}?t={seconds}` (sets `video.currentTime` [VERIFIED 2026-09-21 #88]); YouTube `?t=`; Vimeo `setCurrentTime()` [VERIFIED 2026-09-21 #89]; Stream `?startTime=` [VERIFIED 2026-09-21 #90].

**Changes since January 2025.** Firestore Enterprise edition (MongoDB API, full-text indexes) announced 2025-04-09 [VERIFIED 2026-09-21 #91]; `databaseEdition` is immutable [VERIFIED 2026-09-21 #92]. Sheets API: no change found [NOT FOUND]. Notion API 2025-09-03 replaced databases with data sources [VERIFIED 2026-09-21 #93]. Airtable: no SDK release since 2023 [VERIFIED 2026-09-21 #85].

### Stage 4: Video management website

|Option|Setup time|Setup cost|Price as quoted|Derived cost per 60-min episode|Automation|Quality risk|Pros|Cons|Confidence|
|---|---|---|---|---|---|---|---|---|---|
|Next.js `app/episodes/` in the existing app + Firestore via firebase-admin; client-side MiniSearch/Fuse; optional Firestore vector search, RECOMMENDED|3-4 dev-days|$0|App Hosting on Cloud Run, request-based tier free 180,000 vCPU-s, 360,000 GiB-s, 2M requests/mo (instance-based tier 240,000 vCPU-s + 450,000 GiB-s), monthly [VERIFIED 2026-09-21 #20]; Firebase Auth 50,000 MAU free [VERIFIED 2026-09-21 #94]; minisearch 7.2.0, fuse.js 7.5.0 free [VERIFIED 2026-09-21 #95] [VERIFIED 2026-09-21 #96]|$0 in free tiers; one full play of a 0.6 GiB proxy = 0.6 x $0.12 = $0.072 beyond 100 GB/mo free egress [VERIFIED 2026-09-21 #7]; embedding 16,000 tok x $0.02/M = $0.00032 [VERIFIED 2026-09-21 #97]|Full: pages read `episodes` > approval buttons write status > pipeline resumes|Low: same stack and auth|Same auth and CI; HTML5 `<video>` over a signed proxy URL seeks natively [VERIFIED 2026-09-21 #88]|Build time|H|
|Next.js + Supabase (tsvector + pgvector)|4-5 dev-days|$25 first month [VERIFIED 2026-09-21 #98]|Free: 500 MB DB, 50 MB upload, pauses after 1 week idle; Pro $25/mo, cycle not stated in plans.ts [VERIFIED 2026-09-21 #98]|$25/3 = $8.33 ($2.50 at 10/mo) [VERIFIED 2026-09-21 #98]|Full: pipeline writes Postgres > pages query > buttons write status|Low-Med: second auth and sync path|Full-text + vectors in one DB [VERIFIED 2026-09-21 #99]|Second DB and auth|H: live-loaded|
|No-code Notion / Airtable Interfaces|0.5-1 day|$60 first month (3 seats) [SNIPPET 2026-09-21 #81] [SNIPPET 2026-09-21 #83]|Notion Business $20/member/mo annual [SNIPPET 2026-09-21 #81]; Airtable Team $20/user/mo annual [SNIPPET 2026-09-21 #83]|$60/3 = $20.00 ($6.00 at 10/mo) [SNIPPET 2026-09-21 #81] [SNIPPET 2026-09-21 #83]|One-click: n8n writes page > status select|High: no transcript-to-video seek|Fastest|Fails the seek requirement|M: snippets|
|Off-the-shelf video library (Vimeo, Mux, Cloudflare Stream, unlisted YouTube; Wistia [COULD NOT ACCESS 2026-09-21 #100])|0.5 day upload + 1-2 days to embed|Vimeo $25 first month [SNIPPET 2026-09-21 #101] or Stream usage [VERIFIED 2026-09-21 #102]|Vimeo Standard $25/mo annual [SNIPPET 2026-09-21 #101]; Stream $5 per 1,000 min stored/mo, $1 per 1,000 min delivered [VERIFIED 2026-09-21 #102]; Mux per-minute, 100,000 delivered min/mo free [SNIPPET 2026-09-21 #103]; YouTube free, `videos.insert` = 1,600 of 10,000 daily units [SNIPPET 2026-09-21 #104]|Vimeo $25/3 = $8.33 [SNIPPET 2026-09-21 #101]; Stream 60 x $5/1,000 = $0.30/mo stored [VERIFIED 2026-09-21 #102]; YouTube $0 [SNIPPET 2026-09-21 #104]|One-click: API upload > embed > status in Firestore|Med: Mux captions give labels, not names|Encoding, CDN, player solved; YouTube seeks by `?t=` [VERIFIED 2026-09-21 #105]|Own UI still needed; lock-in|M: snippets|

**Search at 200 episodes.** Firestore filters on tags, speakers and status are $0 in free quota but Standard edition has no text search [VERIFIED 2026-09-21 #78]; client-side MiniSearch is $0 to ~50 episodes [UNVERIFIED - estimate: 10k words per episode]; then the Algolia Firestore extension, free at this size, later $0.50 per 1k searches [SNIPPET 2026-09-21 #106], or Typesense Cloud ~$21.60/mo [SNIPPET 2026-09-21 #107]; Meilisearch Cloud from $30/mo [VERIFIED 2026-09-21 #108]. Vector: 200 x 16,000 tok x $0.02/M = $0.064 Voyage ($0 within 200M free tokens) [VERIFIED 2026-09-21 #97]; `findNearest` bills 1 read per 100 entries scanned [VERIFIED 2026-09-21 #109].

**Hard limits.** The Drive `/preview` iframe has no seek API [NOT FOUND] and caps playback at 1080p [SNIPPET 2026-09-21 #110], so Drive stays the archive; Cloud CDN cuts North America egress to $0.08/GiB [VERIFIED 2026-09-21 #111]; the App Hosting adapter accepts Next.js >= 16.1.0 only [VERIFIED 2026-09-21 #112].

**Changes since January 2025.** Algolia extension 1.3.0 (2026-06-22) [VERIFIED 2026-09-21 #113]; Typesense extension v3.0.0 [VERIFIED 2026-09-21 #114]; Meilisearch now MIT + BSL Enterprise [VERIFIED 2026-09-21 #115]; Mux SDK renamed `@mux/ts` [VERIFIED 2026-09-21 #116]; Cloudflare Stream prices unchanged [VERIFIED 2026-09-21 #102]; Supabase template pins Tailwind v3 [VERIFIED 2026-09-21 #117]; Vimeo server SDK unchanged since 2024 [VERIFIED 2026-09-21 #118]; App Hosting adapter blocks Next.js versions outside its safe list [VERIFIED 2026-09-21 #112]; YouTube `videos.insert` unchanged [VERIFIED 2026-09-21 #105], quota-policy pages [COULD NOT ACCESS 2026-09-21 #119].

### Stage 5: AI editorial analysis

Input: the Stage 2 transcript. Output: summary, tags/themes/topics, chapters, key quotes, title options, description draft, 10 clip candidates with start/end seconds. Tokens: ~18,000 in on the Claude 4.7+ tokenizer + 1,500 instructions, 3,500 out [UNVERIFIED - estimate: PRICES.md section B]. Human step in every row: approve summary/tags/chapters 8 min + pick 3 of 10 clips 15 min = 23 min = $19.17 [UNVERIFIED - estimate: G].

|Option|Setup time|Setup cost|Price as quoted|Derived cost per 60-min episode|Automation|Quality risk|Pros|Cons|Confidence|
|---|---|---|---|---|---|---|---|---|---|
|Claude Sonnet 5 `claude-sonnet-5`, structured outputs, DEFAULT; 1M context [VERIFIED 2026-09-21 #3]|1-1.5 dev-days|$0|$2/M in, $10/M out; batch $1/$5 [VERIFIED 2026-09-21 #3]|19,500/1M x $2 + 3,500/1M x $10 = $0.074 (batch $0.037); + $19.17 = $19.24 [VERIFIED 2026-09-21 #3] [UNVERIFIED - estimate: G]|Full: segments > schema call > verifier|Low-Med: constrained JSON, verified quotes|Cheap|No audio/video input [VERIFIED 2026-09-21 #120]|H|
|Claude Opus 5 `claude-opus-5`, sync or Batch API; 1M context [VERIFIED 2026-09-21 #3]|+0.25 day sync; +0.5 day batch polling|$0|$5/$25; batch $2.50/$12.50 [VERIFIED 2026-09-21 #3]|sync 19,500/1M x $5 + 3,500/1M x $25 = $0.0975 + $0.0875 = $0.185; batch $0.0925; + $19.17 = $19.36 / $19.26; backlog 20 x $0.185 = $3.70 sync [VERIFIED 2026-09-21 #3] [UNVERIFIED - estimate: G]|Full: same call > model id swapped > verifier|Low-Med: same verifier as Sonnet; quality gain unmeasured [NOT FOUND]|Strongest hook selection|Batch needs a 24 h window, so the backlog uses Sonnet 5 sync ($0.074 [VERIFIED 2026-09-21 #3], cheaper than Opus batch)|H: live-loaded|
|Claude Haiku 4.5 `claude-haiku-4-5-20251001`; 200K context [VERIFIED 2026-09-21 #3]|Same code|$0|$1/$5 [VERIFIED 2026-09-21 #3]|15,500/1M x $1 + 3,500/1M x $5 = $0.033; + $19.17 = $19.20 [VERIFIED 2026-09-21 #3] [UNVERIFIED - estimate: G]|Full: same call > model id swapped > verifier|Med: weaker hook selection|Cheapest Claude|Quality gap unquantified [NOT FOUND]|M: gap unmeasured|
|OpenAI `gpt-5.4` (1.05M context) / `gpt-5.5` (1M context), installed SDK, `zodTextFormat`|1-1.5 dev-days|$0|`gpt-5.4` $2.50/$15; `gpt-5.5` $5/$30 [SNIPPET 2026-09-21 #53]|5.4: 15,500/1M x $2.50 + 3,500/1M x $15 = $0.091; 5.5: $0.1825; + $19.17 = $19.26 / $19.35 [SNIPPET 2026-09-21 #53] [UNVERIFIED - estimate: G]|Full: segments > `strict` schema call > verifier|Low-Med: strict schema|SDK in repo|No video input [VERIFIED 2026-09-21 #51]|M: price snippet|
|Gemini 3.8 Flash `gemini-3.8-flash`, transcript text; 1M context|1 day + migrate to `@google/genai` [VERIFIED 2026-09-21 #121]|$0|$0.75/$3.75 promo to 2026-12-31, then $1.50/$7.50 [VERIFIED 2026-09-21 #56]|15,500/1M x $0.75 + 3,500/1M x $3.75 = $0.025 promo, $0.0495 from 2027; + $19.17 = $19.19 [VERIFIED 2026-09-21 #56] [UNVERIFIED - estimate: G]|Full: segments > `responseJsonSchema` call > verifier|Med: same verifier|Cheapest|SDK migration|M: Developer API snippet|
|Gemini 3.8 Flash `gemini-3.8-flash`, video input (multimodal pass)|1.5 days incl. `@google/genai` migration [VERIFIED 2026-09-21 #121]|$0|$0.75/$3.75 promo to 2026-12-31, then $1.50/$7.50 [VERIFIED 2026-09-21 #56]; ~100 tokens/s at default resolution [SNIPPET 2026-09-21 #122]|360,000/1M x $0.75 + 3,500/1M x $3.75 = $0.283 promo, $0.566 standard [VERIFIED 2026-09-21 #56]; stacked on Sonnet = $19.52 [UNVERIFIED - estimate: G]|Full: upload 720p proxy > prompt > re-snap timestamps to ASR words|Med-High: timestamps are model text|Only frontier model ingesting a 60-min MP4|4-8x transcript cost|M: token rate|
|Twelve Labs `pegasus1.2` (source prints "Pegasus 1.2"; index + analyze); 2 GB / 2 h|1 day|$0 (free 600 min [SNIPPET 2026-09-21 #123])|Index $0.042/min; analyze $0.021/min + $0.0075/1k tokens; usage-billed monthly, cycle not in snippet [SNIPPET 2026-09-21 #123]|60 x $0.042 + 60 x $0.021 + 3.5 x $0.0075 = $3.81; + $19.17 = $22.98 [SNIPPET 2026-09-21 #123] [UNVERIFIED - estimate: G]|Full: upload > index > analyze prompt|Med: video moments, no speaker names|Purpose-built moment search|50x LLM cost|L-M: snippet, mirrors|
|OpusClip ClipAnything or Vizard as the analysis brain|0.5 day|Pro $29 / Business $19.50 first month [SNIPPET 2026-09-21 #4] [SNIPPET 2026-09-21 #124]|OpusClip Pro $29/mo monthly, 300 credits, 1 credit = 1 source minute [SNIPPET 2026-09-21 #4]; Vizard Business $19.50/mo annual, `viralScore` 0-10 [SNIPPET 2026-09-21 #124]|$29/3 = $9.67 + Sonnet $0.074 + $19.17 = $28.91; Vizard $19.50/3 = $6.50 + $0.074 + $19.17 = $25.74 [SNIPPET 2026-09-21 #4] [SNIPPET 2026-09-21 #124] [VERIFIED 2026-09-21 #3] [UNVERIFIED - estimate: G]|One-click: `customPrompt` > scores and titles > human picks|Med-High: 48-76% multi-speaker accuracy, 20-40% discard rate [THIRD-PARTY 2026-09-21 #125]|Finds and renders in one step|No chapters or summary; 60-180 credits per full-source episode if OpusClip curates the source [SNIPPET 2026-09-21 #8]; Vizard takes no timestamps [THIRD-PARTY 2026-09-21 #126]|M / L-M: prices snippet, accuracy third-party|

**Hallucination controls, every LLM row:** number each diarized utterance (`seg_0001 {speaker, start_s, end_s, text}`) and let the model cite only those ids; strict JSON schema, `additionalProperties:false`, speaker enum of confirmed names, integer seconds (Claude `output_config.format` [VERIFIED 2026-09-21 #127]; OpenAI and Gemini equivalents); a quote must be a substring of its cited segments or it routes to review; `0 <= start_s < end_s <= durationSec`; clips 15-90 s snapped to ASR words.

**Hard limits and changes since January 2025.** Anthropic: no video/audio input [VERIFIED 2026-09-21 #120]; Citations cannot combine with structured outputs [VERIFIED 2026-09-21 #127]; Sonnet 5 $2/$10 made permanent; +30% tokenizer on 4.7+ [VERIFIED 2026-09-21 #3]. OpenAI: no video input [VERIFIED 2026-09-21 #51]. Google: HIGH video resolution (~1.1M tokens) exceeds the 1M context; Files API 2 GB / 48 h [SNIPPET 2026-09-21 #122]. Twelve Labs: 2 GB / 2 h async [SNIPPET 2026-09-21 #123]; free plan now a lifetime 10 h pool [THIRD-PARTY 2026-09-21 #128].

### Stage 6: Editing and shorts

Tracks: (a) Descript as the human editor; (b) OpusClip API or Remotion driven from `clipCandidates[]`. Human minutes [UNVERIFIED - estimate: PRICES.md section G; G gives 5 min for shorts review, 7 used because three clips are reviewed]: shorts review (checkpoint 3b) 7 min = $5.83; manual 3-clip creation in a UI editor 30 min = $25.00; full manual Descript edit 105 (G midpoint) + 8 metadata = 113 min = $94.17; Underlord-review variant 37.5 (G midpoint) + 8 metadata + 5 shorts review = 50.5 min = $42.08.

|Option|Setup time|Setup cost|Price as quoted|Derived cost per 60-min episode|Automation|Quality risk|Pros|Cons|Confidence|
|---|---|---|---|---|---|---|---|---|---|
|Descript Creator (API + n8n node + MCP)|0.5-1 day|$288 annual upfront [SNIPPET 2026-09-21 #9], or $35 first month monthly [THIRD-PARTY 2026-09-21 #5]|Creator $24/person/month annual: 30 media h, 800 AI credits [SNIPPET 2026-09-21 #9]; API "early access" for paying users [SNIPPET 2026-09-21 #10]|$24/3 = $8.00 + $94.17 manual = $102.17, or + $42.08 = $50.08 with Underlord [SNIPPET 2026-09-21 #9] [UNVERIFIED - estimate: G]; 10 episodes per seat [UNVERIFIED - conservative assumption: Descript media hours #1]|Human-in-loop: API import > `POST /jobs/agent` > UI names and cuts > publish|Med: agent non-deterministic|Team's choice; Underlord tooling|No API for speaker names, timestamp cuts or publish; Zoom import UI-only [SNIPPET 2026-09-21 #129]|M: snippets disagree|
|OpusClip Pro API, RECOMMENDED shorts renderer|1-2 dev-days incl. `trim.ts`|$29 first month (monthly) [SNIPPET 2026-09-21 #4]|Pro $29/mo monthly, 300 credits, 1 credit = 1 source minute [SNIPPET 2026-09-21 #4]; 15 h API video/month; 10-credit minimum per project [SNIPPET 2026-09-21 #8]|$29/3 = $9.67 + $5.83 = $15.50 [SNIPPET 2026-09-21 #4] [UNVERIFIED - estimate: G]; each approved range pre-trimmed to 60-90 s (ffmpeg [VERIFIED 2026-09-21 #130]) is its own project: 3 x 10-credit minimum = 30 credits = 10 episodes per seat [SNIPPET 2026-09-21 #8]|Full: trim > `curationPref.range` + `skipCurate` + `brandTemplateId` > webhook > `/post-tasks` publish after 3b [VERIFIED 2026-09-21 #131]|Med: wrong face on gallery view|Only clipper taking exact timestamps|Beta API; 30-day expiry; credit charging assumed (day-1 check); may train on non-enterprise data [SNIPPET 2026-09-21 #132]|M-H|
|Vizard|1 day|$19.50 first month at the annual rate [SNIPPET 2026-09-21 #124]|Business $19.50/mo annual [SNIPPET 2026-09-21 #124]|$19.50/3 = $6.50 + $12.50 pick + $5.83 = $24.83 [SNIPPET 2026-09-21 #124] [UNVERIFIED - estimate: G]|One-click: upload > `webhookUrl` > human picks; no timestamps|High: edit endpoint only for sources < 3 min [THIRD-PARTY 2026-09-21 #126]|Cheapest API clipper|Not driveable from the record|L-M: limits third-party|
|Riverside (Business API read-only)|0.5 day UI|$29 first month monthly ($24/mo annual) [SNIPPET 2026-09-21 #133]|Pro $29/mo monthly, $24/mo annual [SNIPPET 2026-09-21 #133]; API Business-only, read/download [SNIPPET 2026-09-21 #134]|$24/3 = $8.00 + $12.50 + $5.83 = $26.33 [SNIPPET 2026-09-21 #133] [UNVERIFIED - estimate: G]|Human-in-loop: upload > Magic Clips in UI > download via API|Med: external-upload cap, no clip endpoint|Strong if you record in Riverside|Zoom files = external uploads ~15 h/month [THIRD-PARTY 2026-09-21 #135]|M|
|CapCut Pro / VEED (no editing API)|0.5 day each|$19.99 / ~$24 first month [THIRD-PARTY 2026-09-21 #136]|Official pricing pages [COULD NOT ACCESS 2026-09-21 #137] [COULD NOT ACCESS 2026-09-21 #138]; third-party: CapCut Pro $19.99/mo monthly, VEED Pro ~$22-24/mo annual [THIRD-PARTY 2026-09-21 #136]; VEED API only Fabric/lipsync/bg removal [VERIFIED 2026-09-21 #139]|$19.99/3 = $6.66 + $25.00 = $31.66; VEED $8.00 + $25.00 = $33.00 [THIRD-PARTY 2026-09-21 #136] [UNVERIFIED - estimate: G]|Human-in-loop: upload > UI edit > export|Med: manual crops, no record link|Cheap captions and templates|No API, no XML/EDL [VERIFIED 2026-09-21 #139]|L: prices third-party only|
|Adobe Premiere Pro|2-3 days for a UXP panel reading Firestore clips|$22.99 first month [SNIPPET 2026-09-21 #140]|$22.99/mo annual paid monthly, $34.49 month-to-month [SNIPPET 2026-09-21 #140]|$22.99/3 = $7.66 + $25.00 = $32.66 [SNIPPET 2026-09-21 #140] [UNVERIFIED - estimate: G]|Human-in-loop: UXP panel imports > sets in/out > exports [VERIFIED 2026-09-21 #141]; Firefly A/V REST sales-gated, 30-min cap [VERIFIED 2026-09-21 #142]|Low: a human cuts every clip; no automatic crop or switching|Best manual polish|Desktop only, no headless render|M|
|Remotion programmatic rendering (+ffmpeg / whisper.cpp captions)|2-3 dev-days for crop logic|$0 license for <= 3 people [VERIFIED 2026-09-21 #11]|Automators $0.01/render, $100/mo minimum at 4+ people, monthly [VERIFIED 2026-09-21 #143]; Lambda 1-min render $0.017-0.021 [VERIFIED 2026-09-21 #144]|3 x ~$0.03 = $0.09 [VERIFIED 2026-09-21 #144] [UNVERIFIED - estimate: from the 1-min example] + $5.83 = $5.92; 4+ people: $100/3 + $0.09 + $5.83 = $39.25 [VERIFIED 2026-09-21 #143] [UNVERIFIED - estimate: G]|Full: `renderMediaOnLambda({inputProps})` > `@remotion/captions` > Storage; crop by `speakers[].galleryTile` or centre crop per turn|Med: no face tracking until 3b catches errors|Lowest run cost; full brand control|Build effort; Lambda 15-min / 10 GB|M: render cost extrapolated|

Excluded: Submagic caps videos at 30 min [SNIPPET 2026-09-21 #145]; DaVinci Resolve Studio ($295 one-time, scriptable [THIRD-PARTY 2026-09-21 #146]) needs an always-on GPU machine; Kapwing (Pro $16/mo annual, 120-min cap [THIRD-PARTY 2026-09-21 #147]; [COULD NOT ACCESS 2026-09-21 #148]) and AutoPod ($29/mo, per-mic switching [THIRD-PARTY 2026-09-21 #149]; [COULD NOT ACCESS 2026-09-21 #150]) are off the brief's list and third-party-only; Munch discontinued 2025-12-31; Mirage has no long-form clipping API [THIRD-PARTY 2026-09-21 #125].

**Feature coverage.** Filler/silence removal: Descript UI or agent prompt [SNIPPET 2026-09-21 #10], OpusClip `enableRemoveFillerWords` [VERIFIED 2026-09-21 #131], Vizard under 3 min only [THIRD-PARTY 2026-09-21 #126], Riverside Magic Editor UI [SNIPPET 2026-09-21 #133], CapCut/VEED UI [THIRD-PARTY 2026-09-21 #136], Premiere text-based bulk deletion [SNIPPET 2026-09-21 #140], Remotion custom code. Multicam switching: Descript auto speaker detection [SNIPPET 2026-09-21 #151], Automatic Multicam only for Rooms [SNIPPET 2026-09-21 #152]; OpusClip one-to-four-person layouts [VERIFIED 2026-09-21 #131]; Riverside [NOT FOUND]; Vizard [NOT FOUND]; CapCut/VEED none [THIRD-PARTY 2026-09-21 #136]; Remotion custom. 9:16 and captions: OpusClip [VERIFIED 2026-09-21 #131], Vizard [THIRD-PARTY 2026-09-21 #126], Riverside Magic Clips [SNIPPET 2026-09-21 #133], CapCut/VEED [THIRD-PARTY 2026-09-21 #136], Descript and Premiere UI [SNIPPET 2026-09-21 #9] [SNIPPET 2026-09-21 #140], Remotion custom crop + `@remotion/captions` [VERIFIED 2026-09-21 #11]. Brand templates: OpusClip `brandTemplateId` [VERIFIED 2026-09-21 #131], Vizard `templateId` [THIRD-PARTY 2026-09-21 #126], Premiere MOGRT [VERIFIED 2026-09-21 #141], Remotion components, CapCut brand kit and VEED templates [THIRD-PARTY 2026-09-21 #136]; Descript and Riverside [NOT FOUND]. Driven from the record: OpusClip `range` + `skipCurate` [VERIFIED 2026-09-21 #131], Remotion `inputProps`, Premiere UXP panel [VERIFIED 2026-09-21 #141]; Descript only as an agent prompt [UNVERIFIED - untested]; Vizard, Riverside, CapCut/VEED no.

**Hard limits and changes since January 2025.** Descript: media hours per multitrack import [NOT FOUND] (Rooms sessions bill once [SNIPPET 2026-09-21 #1]); Hobbyist and Business prices conflict between official snippets [SNIPPET 2026-09-21 #9] [SNIPPET 2026-09-21 #153]; public API/CLI, n8n node and hosted MCP shipped Feb-May 2026 [VERIFIED 2026-09-21 #154]. OpusClip: API on Pro/Max/Enterprise, 15 h/month, 10-credit floor [SNIPPET 2026-09-21 #8]; 30-day expiry [THIRD-PARTY 2026-09-21 #155]. Vizard: API without a timestamp parameter, edit endpoint under 3 min only [THIRD-PARTY 2026-09-21 #126]; other changes [NOT FOUND]. Riverside: domain moved to riverside.com [SNIPPET 2026-09-21 #133] [COULD NOT ACCESS 2026-09-21 #156]; API Business-only [SNIPPET 2026-09-21 #134]. Premiere: ExtendScript sunset, build on UXP [VERIFIED 2026-09-21 #141]. Remotion: Automators $0.01/render, $100/month minimum, 5.0 terms pending [VERIFIED 2026-09-21 #143]; Free license counts employees [VERIFIED 2026-09-21 #11]. VEED: public API + SDKs (Aug 2026), Open Edit CLI [VERIFIED 2026-09-21 #139] [VERIFIED 2026-09-21 #157]. CapCut and Kapwing: no relevant change found [NOT FOUND].

## 3. Bundled end-to-end options

Four human checkpoints in every bundle: (1) confirm speaker names, (2) approve summary/tags/chapters, (3) approve clip selection before render, (3b) review rendered shorts before publish; nothing publishes without 3 and 3b. "As automated as possible while keeping quality high" means everything up to those approvals runs unattended, each approval is one click on a pre-filled proposal, and failed steps re-run idempotently from Firestore state. Planning number 45 min per episode (names 15, metadata 8, clips 15, shorts 7 against G's 5), the "messy" naming case [UNVERIFIED - estimate: G].

**A. All-in-one (Descript-centered).** (1) Record in Zoom cloud; backlog stays in Drive. (2) Descript imports the recording as a multitrack sequence (UI only; backlog via MCP `import_drive_media`); Automatic Speaker Detection; **checkpoint 1 in the Descript UI**. (3) Underlord: filler words, Studio Sound, show notes, summary, chapters; **checkpoint 2**: human edits, pastes into a Google Sheet row (the status record). (4) Underlord highlight clips; human picks 3-5, reframes 9:16, captions; **checkpoint 3**. (5) `POST /export/transcript` (markdown only) to Drive; `POST /jobs/publish`; human uploads to YouTube. Manual work 93-133 min, midpoint 113.

**B. Low-code (n8n Cloud Starter).** (1) Google Drive Trigger polls every minute; only the file ID moves through n8n. (2) HTTP node to AssemblyAI with `speaker_labels` and names from the filename; Wait node resumes on the webhook; Slack posts a sample sentence per speaker; **checkpoint 1 in Slack**. (3) Anthropic node (Sonnet 5, JSON schema) returns metadata and 10 clip candidates; Code node verifies them; Firestore node writes `episodes`; **checkpoints 2 and 3 in Slack**. (4) Cloud Run job pre-trims approved ranges; one OpusClip project per file (`skipCurate`, webhook); **checkpoint 3b in Slack**; YouTube node uploads unlisted. Babysitting timed-out executions ~10 min/episode [UNVERIFIED - estimate]; 55 min total.

**C. Custom code on your stack (Claude Code-built).** (1) Actions cron runs `agent/src/ingest.ts`: Drive `files.list` per episode subfolder, diff against Firestore, doc `ingested` with candidate names (backlog: `_manifest.csv`); ffmpeg extracts M4A and a 720p proxy to Storage. (2) AssemblyAI by signed URL with names; webhook stores `transcripts/{id}.json`; `transcribed`. (3) **Checkpoint 1 on the website** (names, gallery tiles; Phase 1: front matter in a PR); `speakers_confirmed`. (4) Sonnet 5 structured outputs; code verifies quotes and timestamps; `summarized`. (5) **Checkpoints 2 and 3 on the website**; `analyzed`. (6) `trim.ts` cuts approved ranges to 60-90 s; OpusClip project per file (or Remotion); **checkpoint 3b**; `edited`. (7) YouTube `videos.insert` unlisted (`youtube.upload` scope [VERIFIED 2026-09-21 #105]; channel owner's OAuth consent, stored `YOUTUBE_REFRESH_TOKEN` [COULD NOT ACCESS 2026-09-21 #158]); `published`. (8) `/episodes` list with MiniSearch; `/episodes/[id]` seeks from transcript clicks; Firebase Auth plus a `team/{uid}` allowlist.

**D. Hybrid (RECOMMENDED).** Steps 1-5 and 8 of C unchanged. (6) If an episode needs polish, Actions calls Descript `POST /jobs/import/project_media` with a signed Storage URL and `POST /jobs/agent` ("remove filler words, Studio Sound") with `callback_url`; the human finishes in the Descript UI (names re-typed there; the API cannot set them); `POST /jobs/publish` returns a `download_url` copied to Storage. (7) Shorts via `trim.ts` + OpusClip (or Remotion later), checkpoint 3b, YouTube as in C. Descript is a leased workbench; Firestore and Storage remain the record. Planning floor 45 min, polished ceiling 75 min.

### 3.1 Bundle table

|Option|Setup time|Setup cost (one-time)|Price as quoted|Derived cost per 60-min episode|Automation|Quality risk|Pros|Cons|Confidence|
|---|---|---|---|---|---|---|---|---|---|
|A. All-in-one Descript|0.5-1 day [UNVERIFIED - estimate: DECISIONS]|$288.00 annual upfront [SNIPPET 2026-09-21 #9] or $35.00 first month [THIRD-PARTY 2026-09-21 #5]; labor 0.5-1 day x 8 h x $50 = $200.00-$400.00 [UNVERIFIED - estimate]|Creator $24/person/month annual [SNIPPET 2026-09-21 #9]|$0.00 API + $24.00/3 ($8.00) + 113 min ($94.17) = $102.17; $96.57 at 10/mo [SNIPPET 2026-09-21 #9] [UNVERIFIED - estimate: G]|Human-in-loop: import > name > prompt|Med: Underlord non-deterministic|Fast start|Labor dominates|M: snippets disagree|
|B. Low-code n8n|2-4 days [UNVERIFIED - estimate: DECISIONS]|$24.00 n8n + $29.00 OpusClip = $53.00 first month [SNIPPET 2026-09-21 #27] [SNIPPET 2026-09-21 #4]; labor 2-4 days x 8 h x $50 = $800.00-$1,600.00 [UNVERIFIED - estimate]|n8n $24/mo monthly [SNIPPET 2026-09-21 #27]; OpusClip $29/mo monthly [SNIPPET 2026-09-21 #4] [SNIPPET 2026-09-21 #8]|$1.02 + $53.00/3 ($17.67) + 55 min ($45.83) = $64.52; at 10/mo $1.02 + $5.30 + $45.83 = $52.15 [SNIPPET 2026-09-21 #2] [VERIFIED 2026-09-21 #3] [SNIPPET 2026-09-21 #27] [SNIPPET 2026-09-21 #4] [UNVERIFIED - estimate: G]|One-click in Slack: 4 approvals > babysit timeouts|Med: Cloud timeouts; subfolder blind spot|No code; Slack approvals|No website; state split n8n/Firestore|M|
|C. Custom code|9-12 dev-days [UNVERIFIED - estimate: DECISIONS]|$29.00 OpusClip Pro first month (Phase 3) [SNIPPET 2026-09-21 #4]; labor 9-12 days x 8 h x $50 = $3,600.00-$4,800.00 [UNVERIFIED - estimate]|AssemblyAI $0.25/hr [SNIPPET 2026-09-21 #2]; Sonnet 5 $2/$10 [VERIFIED 2026-09-21 #3]; OpusClip $29/mo monthly [SNIPPET 2026-09-21 #4]|API + infra $0.94919 (3.3) + $0.072 egress for one full 0.6 GiB play [VERIFIED 2026-09-21 #7] ($0 inside the free 100 GB/month) = $1.02; $1.02 + $29.00/3 ($9.67) + 45 min ($37.50) = $48.19; at 10/mo $1.02 + $2.90 + $37.50 = $41.42; Remotion variant $38.61 [SNIPPET 2026-09-21 #2] [VERIFIED 2026-09-21 #3] [SNIPPET 2026-09-21 #4] [VERIFIED 2026-09-21 #11] [UNVERIFIED - estimate: G]|Full to the 4 website buttons|Low-Med: code-verified quotes; diarization errors remain|Own data and website; cheapest run-rate|Longest build; no editor for taste cuts|H prices; M effort|
|D. Hybrid (RECOMMENDED)|9.5-13 dev-days [UNVERIFIED - estimate: C + Descript setup]|$29.00 to start [SNIPPET 2026-09-21 #4]; Descript $35.00 monthly when first needed [THIRD-PARTY 2026-09-21 #5], annual $288.00 once the API is confirmed [SNIPPET 2026-09-21 #9]; labor 9.5-13 days x 8 h x $50 = $3,800.00-$5,200.00 [UNVERIFIED - estimate]|As C plus Descript $24/mo annual [SNIPPET 2026-09-21 #9] or $35/mo monthly [THIRD-PARTY 2026-09-21 #5]|Floor = C ($48.19; $41.42 at 10/mo); annual Descript seat kept: $1.02 + $53.00/3 ($17.67) + $37.50 = $56.19, at 10/mo $1.02 + $5.30 + $37.50 = $43.82 ($59.85 on the $35 monthly seat) [SNIPPET 2026-09-21 #9] [SNIPPET 2026-09-21 #4] [THIRD-PARTY 2026-09-21 #5] [UNVERIFIED - estimate: G]|Full to the 4 buttons; Descript optional: import > agent > UI finish|Low: C's checks plus a human editor|Best quality ceiling; Descript swappable|Two subscriptions when Descript is kept|M: API early access [SNIPPET 2026-09-21 #10]|

### 3.2 Decision Matrix

Scores 5 = best [UNVERIFIED - estimate]. Build cost = labor (3.1) + subscriptions to start (A $35.00-$288.00; B $53.00; C and D $29.00); per-video figures from 3.1. The Tag column covers every dollar cell in its row.

|Bundle|Time-to-build|Build cost|Per-video at 3/mo|Per-video at 10/mo|Automation|Quality risk|Stack fit|Lock-in|Tag|
|---|---|---|---|---|---|---|---|---|---|
|A|5 (0.5-1 day)|5 ($235.00-$688.00)|1 ($102.17)|1 ($96.57)|1 (manual UI)|3 (Med)|1 (outside repo)|2 (projects in Descript)|[SNIPPET 2026-09-21 #9] [THIRD-PARTY 2026-09-21 #5] [UNVERIFIED - estimate: G]|
|B|4 (2-4 days)|4 ($853.00-$1,653.00)|3 ($64.52)|3 ($52.15)|3 (Slack one-click)|3 (Med)|2 (n8n beside stack)|3 (workflow JSON exportable)|[SNIPPET 2026-09-21 #27] [SNIPPET 2026-09-21 #4] [SNIPPET 2026-09-21 #2] [VERIFIED 2026-09-21 #3] [UNVERIFIED - estimate: G]|
|C|2 (9-12 days)|2 ($3,629.00-$4,829.00)|5 ($48.19)|5 ($41.42)|5 (full to buttons)|4 (Low-Med)|5 (Next.js + Firestore)|5 (own data)|[SNIPPET 2026-09-21 #2] [VERIFIED 2026-09-21 #3] [SNIPPET 2026-09-21 #4] [UNVERIFIED - estimate: G]|
|D|2 (9.5-13 days)|1 ($3,829.00-$5,229.00; +$35.00 the first month Descript is used)|4 ($48.19-$56.19)|4 ($41.42-$43.82)|5 (full to buttons)|5 (Low)|5 (as C)|4 (Descript optional)|[SNIPPET 2026-09-21 #9] [SNIPPET 2026-09-21 #4] [THIRD-PARTY 2026-09-21 #5] [UNVERIFIED - estimate: G]|

### 3.3 One-time backlog cost, 20 episodes

|Bundle|Phase 1 (transcripts + metadata)|USD|Full pipeline incl. shorts|USD|Tag|
|---|---|---|---|---|---|
|C (OpusClip)|($0.25 AssemblyAI + $0.074 Sonnet 5 + $0.624 Storage + $0.00087 Firestore + $0.00032 embedding = $0.94919) x 20 = $18.98; review 25 min (names 15, metadata 8, spot-check 2) x 20 = $416.67|$435.65|$435.65 + 600 OpusClip credits (2 seat-months x $29.00 = $58.00) + 20 x 22 min (clips 15 + shorts 7) = $366.67 = $860.32|$860.32|[SNIPPET 2026-09-21 #2] [VERIFIED 2026-09-21 #3] [VERIFIED 2026-09-21 #7] [SNIPPET 2026-09-21 #4] [SNIPPET 2026-09-21 #8] [UNVERIFIED - estimate: G]|
|C (Remotion)|Same as C (OpusClip): $435.65|$435.65|$435.65 + 60 Lambda renders (20 x 3 x ~$0.03 = $1.80) + $366.67 = $804.12|$804.12|[SNIPPET 2026-09-21 #2] [VERIFIED 2026-09-21 #3] [VERIFIED 2026-09-21 #7] [VERIFIED 2026-09-21 #11] [VERIFIED 2026-09-21 #144] [UNVERIFIED - estimate: G]|
|D (Hybrid)|Same as C (OpusClip): $435.65; Descript is not used on the backlog|$435.65|Same as C (OpusClip): $860.32; if one monthly Descript seat is leased for polish, + $35.00 = $895.32|$860.32-$895.32|[SNIPPET 2026-09-21 #2] [VERIFIED 2026-09-21 #3] [VERIFIED 2026-09-21 #7] [SNIPPET 2026-09-21 #4] [SNIPPET 2026-09-21 #8] [THIRD-PARTY 2026-09-21 #5] [UNVERIFIED - estimate: G]|
|B|C (OpusClip) + $24.00 n8n + babysitting 10 min x 20 ($166.67) = $626.32|$626.32|$626.32 + $58.00 + $366.67 = $1,050.99|$1,050.99|[SNIPPET 2026-09-21 #27] [SNIPPET 2026-09-21 #4] [SNIPPET 2026-09-21 #8] [UNVERIFIED - estimate: G]|
|A|Names and metadata typed by hand: 20 x (15 + 45-60 min) = $1,000.00-$1,250.00 + 1 seat-month $24.00 = $1,024.00-$1,274.00|$1,024.00-$1,274.00|113 min x 20 = $1,883.33 + 2 seat-months x $24.00 = $48.00 (3-track imports, 60 media h) = $1,931.33|$1,931.33|[SNIPPET 2026-09-21 #9] [UNVERIFIED - estimate: G] [UNVERIFIED - conservative assumption: Descript media hours #1]|

### 3.4 Monthly run-rate (subscriptions + n x (API + infra + human))

|Bundle|Arithmetic|2/mo|4/mo|10/mo|Tag|
|---|---|---|---|---|---|
|A|$24.00 + n x $94.17|$212.33|$400.67|$965.67|[SNIPPET 2026-09-21 #9] [UNVERIFIED - estimate: G]|
|B|$53.00 + n x $46.85 (one OpusClip seat at 10: 300 credits)|$146.70|$240.40|$521.50|[SNIPPET 2026-09-21 #27] [SNIPPET 2026-09-21 #4] [UNVERIFIED - estimate: G]|
|C (OpusClip) = D floor (no Descript seat)|$29.00 + n x $38.52|$106.04|$183.08|$414.20|[SNIPPET 2026-09-21 #4] [UNVERIFIED - estimate: G]|
|C (Remotion)|$0.00 + n x $38.61|$77.22|$154.44|$386.10|[VERIFIED 2026-09-21 #11] [VERIFIED 2026-09-21 #144] [UNVERIFIED - estimate: G]|
|D with an annual Descript seat kept|$53.00 + n x $38.52|$130.04|$207.08|$438.20|[SNIPPET 2026-09-21 #9] [SNIPPET 2026-09-21 #4] [UNVERIFIED - estimate: G]|

## 4. Speaker naming: from "Speaker A" to "Tom:"

### 4.1 What Zoom cloud vs local recordings provide

|Item|Cloud recording|Local (computer) recording|Sources|
|---|---|---|---|
|Files|MP4, M4A, M3U, TXT chat, CC.VTT, VTT transcript|Same formats on the host's disk|[SNIPPET 2026-09-21 #159]|
|Per-participant audio|`participant_audio_files[]` only when the per-participant setting is on; not retroactive; settings PATCHable via API [VERIFIED 2026-09-21 #14]. No name field in the schema; one captured payload shows `file_name = "Audio only - <display name>"` (not Zoom docs; test 1)|Desktop setting, up to 80 participants, phone callers merged; no API; community only: file name begins with the participant's name, official wording NOT FOUND|[SNIPPET 2026-09-21 #12] [SNIPPET 2026-09-21 #160] [THIRD-PARTY 2026-09-21 #161] [THIRD-PARTY 2026-09-21 #162]|
|Transcript|VTT labeled by participant display name of the audio stream (not voice); "Unknown Speaker" editable; whether the downloaded `.transcript.vtt` carries names is NOT FOUND officially (community: `.cc.vtt` did, `.transcript.vtt` did not); test 2|None|[SNIPPET 2026-09-21 #15] [SNIPPET 2026-09-21 #163] [THIRD-PARTY 2026-09-21 #16] [SNIPPET 2026-09-21 #164]|
|Video layout|Web-portal setting: active speaker or gallery with shared screen, or separate files; gallery not recorded while a screen is shared [SNIPPET 2026-09-21 #13]; API `record_files_separately{}` [VERIFIED 2026-09-21 #14]; decides the crop (test 3)|Layout options [NOT FOUND]|[SNIPPET 2026-09-21 #13] [VERIFIED 2026-09-21 #14]|
|The 20 backlog MP4s in Drive|Nothing, unless cloud copies still exist with the settings on [UNVERIFIED - estimate: test 4]|Nothing|rows above|

### 4.2 Four approaches

|Approach|How it works|Needs from Zoom (cloud vs local)|Accuracy, 3-4 speakers|Crosstalk / overlap|Cost per 60-min episode|Human effort|Failure modes|
|---|---|---|---|---|---|---|---|
|1. Zoom names via per-track audio|Transcribe each track with diarization off; stamp utterances with the track's name; merge by time|Cloud: per-participant setting on (future only); local: per-track files uploaded by hand|Deterministic; residual mic bleed and shared devices|Best: overlap preserved per track|Deepgram 3 x 60 x $0.0043 = $0.774 [SNIPPET 2026-09-21 #48]; ElevenLabs 3 x $0.22 = $0.66, max 5 channels, 1 h per file [SNIPPET 2026-09-21 #63] [VERIFIED 2026-09-21 #73]|Confirm track = name, 2-3 min [UNVERIFIED - estimate]|Not retroactive; file-name mapping untested|
|2. LLM / context inference|AssemblyAI Speaker Identification maps A/B/C to a passed name list in one call; or a Claude/Gemini pass over the diarized transcript; OpenAI: 2-10 s reference clips, max 4 speakers|Nothing; mixed MP4 works (backlog OK)|Bounded by diarizer DER (8-17%, 4.3); naming accuracy [NOT FOUND]|Inherits the diarizer's overlap handling|AssemblyAI $0.25 all-in [SNIPPET 2026-09-21 #2]; Haiku 4.5 pass $0.017 [VERIFIED 2026-09-21 #3]; Gemini 3.8 Flash pass 15,500 x $0.75/M + 300 x $3.75/M = $0.013 [VERIFIED 2026-09-21 #56]; OpenAI diarize $0.36 [SNIPPET 2026-09-21 #53]|5 min ($4.17) clean, 15 min ($12.50) messy [UNVERIFIED - estimate]|Silent host swap; unnamed guest stays "C"|
|3. Persistent voice map with enrollment|pyannoteAI `/voiceprint` once per host, `/identify` per episode (precision-2 required) [VERIFIED 2026-09-21 #69]; Speechmatics `get_speakers` identifiers resent as `speakers[]` (max 50, key-bound) [VERIFIED 2026-09-21 #65]; ElevenLabs registration endpoint [NOT FOUND]; Azure retired 2025-09-30 [VERIFIED 2026-09-21 #165]|Nothing (backlog OK)|Hosts matched by voice; verification EER 0.18-0.49% (vendor-run [VERIFIED 2026-09-21 #166]) vs 8-17% DER; guests still need approach 2 or 4|Segmentation still limits overlap|pyannoteAI EUR 0.112 x 1.10 = $0.1232 + 3 x EUR 0.015 x 1.10 / 20 = $0.0025 = $0.1257; Developer plan EUR 19 x 1.10 / 3 = $6.97 if required [SNIPPET 2026-09-21 #70] [UNVERIFIED - estimate: FX 1.10]; plus an STT; Speechmatics $0.24 [SNIPPET 2026-09-21 #67]|Enrollment once ~30 min; then 2-5 min per episode [UNVERIFIED - estimate]|Voiceprint lock-in; EUR pricing snippet-only [SNIPPET 2026-09-21 #70]|
|4. Manual confirmation UI|Website step: one row per label with sample sentence, audio snippet, name dropdown, per-utterance override; Descript: auto detection then a prompt to name each speaker, no API for names [SNIPPET 2026-09-21 #151]|Nothing|~100% for labels; utterance fixes depend on reviewer patience|Fixable by hand, slowly|Website $0 API; Descript Creator $24/3 = $8.00 [SNIPPET 2026-09-21 #9]|5-15 min ($4.17-$12.50) [UNVERIFIED - estimate]|Reviewer fatigue; Descript edits need re-export|

### 4.3 Accuracy evidence

|Evidence|Figures|Sources|
|---|---|---|
|pyannote published DER (%), community-1 vs precision-2|AMI-IHM 17.0 vs 12.9; AMI-SDM 19.9 vs 15.6; VoxConverse 11.2 vs 8.5; DIHARD 3 20.2 vs 14.7; CALLHOME 26.7 vs 16.6|[VERIFIED 2026-09-21 #71]|
|AssemblyAI vendor claims|Speaker Identification "accuracy highest with 2-4 speakers"; 2.9% speaker-count error; cpWER 30.17 vs Deepgram 37.92, ElevenLabs 35.26 (vendor-run)|[SNIPPET 2026-09-21 #46] [SNIPPET 2026-09-21 #167] [SNIPPET 2026-09-21 #168]|
|Gemini 3.5 Transcribe|"3 or more speakers is experimental"; 30-min cap with diarization|[SNIPPET 2026-09-21 #57]|
|Enrolled-voice verification EER|Eagle 0.18%, pyannote embedding 0.49%, SpeechBrain 0.70% (vendor-run)|[VERIFIED 2026-09-21 #166]|
|Deepgram, OpenAI, Speechmatics, ElevenLabs absolute DER; minimum speech per speaker|[NOT FOUND]||
|Crosstalk-specific accuracy|[NOT FOUND] from any vendor. [UNVERIFIED - estimate: a mixed-down 3-speaker episode should see 8-17% of speech time mislabeled (VoxConverse to AMI-SDM range), concentrated in overlapped and one-word turns; per-track audio removes this class]||

### 4.4 Recommendation

**Default:** AssemblyAI `universal-3-5-pro` with `speaker_labels` and Speaker Identification, fed the known participant names (Drive filename or episode record; Zoom participant list later), then a mandatory confirmation screen with one sample sentence per detected speaker: $0.25 plus 5-15 min of review. **Fallback 1 (new episodes, pending tests 1-2):** Zoom per-participant audio and names, transcribed per track. **Fallback 2 (backlog, recurring hosts):** pyannoteAI precision-2 voiceprints (or Speechmatics identifiers) enrolled from 30-60 s of confirmed audio per host after checkpoint 1 (EUR 0.015 each [SNIPPET 2026-09-21 #70]); the backlog is re-identified and only unmatched clusters and guests are reviewed.

Per-episode flow: (1) poller finds the MP4; the record lists candidate names (`participants.txt` in the Drive subfolder, or `docs/episodes/_manifest.csv` for the backlog); (2) if `participant_audio_files[]` exist, transcribe per track and skip to step 5, else submit the mixed file to AssemblyAI with `speakers[{name, description}]`; (3) if host voiceprints exist, pyannoteAI `identify` overwrites matched hosts; (4) write `speakers[{id, name, confirmed:false}]` and the transcript JSON; `transcribed`; (5) website screen (Phase 1: front matter in a PR) plus a Slack message show a sample sentence per label; reviewer confirms or corrects (5-15 min) and assigns gallery tiles; (6) `speakers_confirmed`; confirmed segments feed enrollment: 30-60 s of clean audio per host to `POST /voiceprint` (EUR 0.015 each [SNIPPET 2026-09-21 #70]) or Speechmatics `get_speakers: true`, stored in `speakers.voiceprintId`; backlog re-identified, only unmatched clusters reviewed; re-enroll after model updates; corrections logged.

## 5. Final recommendation with phased rollout

**Bundle D (Hybrid), why.** D costs the same as C until a Descript seat is kept, then $8.00 more per episode at 3/month on an annual seat ($56.19 vs $48.19), yet is $46 cheaper than A and $8 cheaper than B while adding what C lacks: a purchased editor for taste-driven cuts. Totals as in section 1; recurring floor $29.00/month [SNIPPET 2026-09-21 #4], $53.00-$64.00 with Descript kept [SNIPPET 2026-09-21 #9] [THIRD-PARTY 2026-09-21 #5], $0 on Remotion (+2-3 dev-days).

**Before Phase 1:** the four Zoom tests in section 1.2 (about one hour), then the Day-0 pilot.

|Phase|Scope and build tasks|Time|Cost|Definition of done|
|---|---|---|---|---|
|1. Backlog transcripts + metadata (week 1)|**Day 0:** producer fills `docs/episodes/_manifest.csv`; pilot 2 MP4s through AssemblyAI ($0.50 [SNIPPET 2026-09-21 #2]) to count label errors and set the review budget; fund AssemblyAI and opt out of training (Speaker Identification is outside the $50 credit) [SNIPPET 2026-09-21 #2] [SNIPPET 2026-09-21 #6]. **PR 0 (~0.5 day):** migration note. **Pipeline:** bundle C steps 1-4 as a matrix job per episode, plus `docs/episodes/{id}.md`; `DELETE /v2/transcript/{id}` at AssemblyAI after copy (retention otherwise indefinite [SNIPPET 2026-09-21 #6]). **Checkpoints 1-2** as front-matter edits in a PR, synced to Firestore by the next cron run|3-4 dev-days [UNVERIFIED - estimate: DECISIONS]|API + infra $0.94919 x 20 = $18.98 (includes 12 months of Storage; the first month's Storage bill alone is 20 x 2.6 GiB x $0.020 = $1.04) [SNIPPET 2026-09-21 #2] [VERIFIED 2026-09-21 #3] [VERIFIED 2026-09-21 #7]; review 25 min x 20 = $416.67 (DECISIONS' 1.5 h/episode = $1,500.00 upper bound) [UNVERIFIED - estimate: G]; Actions $0 inside the free minutes [VERIFIED 2026-09-21 #17]; subscriptions $0|All 20 docs at `summarized` with `speakers[].confirmed`, `metadata_approved` and every `keyQuotes[].verified` true; markdown committed; pilot label-error count recorded in section 8|
|2. Video management website (weeks 2-3)|Auth-gated `/episodes` list with MiniSearch (Algolia extension beyond ~50 episodes [SNIPPET 2026-09-21 #106]) and status filter; `/episodes/[id]` with player, seeking transcript, metadata panel, status control; `SpeakerConfirm` (checkpoint 1, 4.2 approach 4) and `ApproveMetadata` (checkpoint 2) replace the PR loop; `?t=` deep links; Firebase Auth plus a `team/{uid}` allowlist|3-4 dev-days [UNVERIFIED - estimate: DECISIONS]|App Hosting no-cost tier on Blaze [SNIPPET 2026-09-21 #169]; Cloud Build $0.006/build-min after 2,500 free [VERIFIED 2026-09-21 #170]; Auth 50,000 MAU free [VERIFIED 2026-09-21 #94]; egress $0.072 per full view beyond 100 GB/month free [VERIFIED 2026-09-21 #7]|Team approves Phase 1 output on the page; search finds an episode by title, speaker, tag or transcript phrase; `?t=` links seek on desktop and phone|
|3. AI clip analysis + editing/shorts (weeks 3-4)|Bundle C steps 5-7: `ClipPicker` (checkpoint 3), `trim.ts`, OpusClip project per file (30 credits/episode), `ShortsReview` (checkpoint 3b rejects a wrong-speaker crop), YouTube unlisted; Descript only for a human cut. Prerequisites: OpusClip Pro monthly [SNIPPET 2026-09-21 #4]; day-1 check that a pre-trimmed upload is charged the 10-credit minimum [SNIPPET 2026-09-21 #8]; channel owner's OAuth consent and `YOUTUBE_REFRESH_TOKEN` [COULD NOT ACCESS 2026-09-21 #158]; compliance-audit status (unaudited projects' uploads may be forced private) [COULD NOT ACCESS 2026-09-21 #119]. Later: Remotion (+2-3 dev-days)|3-4 dev-days [UNVERIFIED - estimate: DECISIONS]|OpusClip Pro $29.00/month monthly, 300 credits = 10 episodes per seat [SNIPPET 2026-09-21 #4] [SNIPPET 2026-09-21 #8]; Descript $35.00 monthly only when needed [THIRD-PARTY 2026-09-21 #5], annual $288.00 [SNIPPET 2026-09-21 #9] once the API is confirmed [SNIPPET 2026-09-21 #10]; API + infra $1.02/episode (3.1); first month at 2-4 episodes $106.04-$183.08, or $130.04-$207.08 with an annual Descript seat [UNVERIFIED - estimate: G]|One new episode runs Drive to published shorts in <= 45 min of human time; nothing publishes without checkpoints 3 and 3b; title options and description draft on the record|

**Migration note (PR 0, ~0.5 day, harvest verified green before Phase 1).** Replace `@google/generative-ai` 0.24.1 (EOL) with `@google/genai` 2.23.0 [VERIFIED 2026-09-21 #171] [VERIFIED 2026-09-21 #172]; `openai` 7.0.0 and `firebase-admin` 14.4.0 need Node >= 22 while the repo pins `^6.16.0` and `^13.6.0` [VERIFIED 2026-09-21 #173] [VERIFIED 2026-09-21 #174]: set `node-version: '22'`, upgrade the SDKs, add the Anthropic SDK.

## 6. Risks and mitigations

|Risk|Why|Mitigation|Evidence|
|---|---|---|---|
|Speaker mislabeling; wrong-speaker short reaches YouTube|Context-based naming, no voice enrollment; "accuracy highest with 2-4 speakers"; crosstalk accuracy unpublished; OpusClip reframing and Remotion tile maps can pick the wrong face; unaudited API projects' uploads may be forced private|Mandatory confirmation; Day-0 pilot measures the error rate; checkpoint 3b gates `videos.insert`, unlisted first; per-participant Zoom audio (tests 1-2); pyannoteAI voiceprints for hosts; confirm compliance-audit status|[SNIPPET 2026-09-21 #46] [SNIPPET 2026-09-21 #70] [VERIFIED 2026-09-21 #131] [COULD NOT ACCESS 2026-09-21 #119]; crosstalk [NOT FOUND]|
|Hallucinated summaries and quotes|LLM may invent quotes or drift timestamps|Fixed schema; `keyQuotes[].verified` by exact string match; timestamps range-checked; approval gates status|Code-level control; no vendor figure|
|Vendor data retention / privacy for the recordings|Guest audio reaches AssemblyAI, Claude, OpusClip and optionally Descript; defaults differ: AssemblyAI keeps transcripts until deleted and trains unless a paid account opts out, Deepgram opts in by default, Gemini Developer API data "may be reviewed" (Vertex data is not), OpusClip may train on non-enterprise data, Descript opt-in, ElevenLabs retention NOT FOUND|Before the first upload: AssemblyAI opt-out, delete transcripts after copy; Deepgram `mip_opt_out=true`; Gemini via Vertex only; OpenAI `store:false`; OpusClip opt-out if eligible; check Descript's share-data setting; table below and register row (b) Retention|[SNIPPET 2026-09-21 #6] [SNIPPET 2026-09-21 #175] [SNIPPET 2026-09-21 #49] [VERIFIED 2026-09-21 #176] [SNIPPET 2026-09-21 #177] [SNIPPET 2026-09-21 #132] [SNIPPET 2026-09-21 #178] [VERIFIED 2026-09-21 #179] [SNIPPET 2026-09-21 #180] [SNIPPET 2026-09-21 #64]|
|Lock-in|Data trapped in a vendor UI|Firestore + Storage are the record; vendors behind `lib/vendors/*.ts`; OpusClip projects expire after 30 days, so pull exports at once|[THIRD-PARTY 2026-09-21 #155]|
|Cost creep at volume|API stays $0.32-$1.02/episode; OpusClip 10-credit floor: pre-trimmed uploads 30 credits/episode (10 episodes/seat/month), on the full 60-min source 180 if each of the 3 ranges is its own project (300/180 = 1.67 episodes/seat), 60 if one curated project; Descript media hours cap a seat at ~10 multitrack episodes/month; Gemini promo ends 2026-12-31 (video pass $0.283 to $0.566); egress: 20 episodes x 10 views x 0.6 GiB = 120 GiB, 20 GiB over the free 100 x $0.12 = $2.40|Verify per-project charging on day 1 of Phase 3; track `costs{}`; alert at 250 credits; import the mixed track into Descript unless multitrack is needed; Remotion $0 for <= 3 people; 720p proxies|[SNIPPET 2026-09-21 #4] [SNIPPET 2026-09-21 #8] [VERIFIED 2026-09-21 #11] [VERIFIED 2026-09-21 #56] [VERIFIED 2026-09-21 #7] [UNVERIFIED - conservative assumption: Descript media hours #1]|
|Deprecations / SDK EOL|`@google/generative-ai` EOL; `openai` 7 and `firebase-admin` 14 need Node 22; `gpt-4o-transcribe-diarize` removed 2027-02-26, no diarizing successor; n8n 3.0 self-host Docker-only|Migration note; never build naming on OpenAI; `npm outdated` in CI|[VERIFIED 2026-09-21 #173] [VERIFIED 2026-09-21 #174] [THIRD-PARTY 2026-09-21 #54] [VERIFIED 2026-09-21 #38]|
|Zoom storage quota and 24 h token; Drive quota changes|5 GB per license (support KB) vs 10 GB (product page); auto-delete may be on; `download_token` valid 24 h; webhook answers in 3 s; Drive limits updated 2026-05-01, overage billing "planned later in 2026"|Drive stays the archive; webhook downloads within the hour from a Cloud Run job; set `auto_delete_cmr_days` deliberately; poll every 15 min via `changes.list`; keep the pre-May-2026 project|[SNIPPET 2026-09-21 #26] [SNIPPET 2026-09-21 #23] [SNIPPET 2026-09-21 #25] [SNIPPET 2026-09-21 #24] [SNIPPET 2026-09-21 #35]|

**Vendor data retention and training** (settle before the first upload):

|Vendor|Position|Action|Evidence|
|---|---|---|---|
|AssemblyAI|Transcripts kept until deleted; paid accounts can opt out of training; EU endpoint data not used for training|Opt out; delete after copy|[SNIPPET 2026-09-21 #6] [SNIPPET 2026-09-21 #175]|
|Deepgram|In the Model Improvement Program by default; `mip_opt_out=true` = zero retention|Send `mip_opt_out=true` on every request|[VERIFIED 2026-09-21 #47] [SNIPPET 2026-09-21 #49]|
|OpenAI|API data not used for training; up to 30-day abuse retention; Responses `store` defaults true|`store:false`; current page [COULD NOT ACCESS 2026-09-21 #181]|[VERIFIED 2026-09-21 #179] [VERIFIED 2026-09-21 #51]|
|Gemini|Vertex: Google "will not use Customer Data to train"; Developer API "may be reviewed to improve Google products"; paid tier not used to improve (snippet)|Call Gemini via Vertex; Files API deletes at 48 h|[VERIFIED 2026-09-21 #176] [SNIPPET 2026-09-21 #177] [COULD NOT ACCESS 2026-09-21 #182]|
|Descript|Training opt-in, off by default; deleted projects purged within 30 days|Check the "share data" setting on day one|[SNIPPET 2026-09-21 #178] [COULD NOT ACCESS 2026-09-21 #183]|
|OpusClip|May train on non-enterprise data (anonymized); EU opt-out; projects expire after 30 days|Opt out if eligible; treat as a render service, not storage|[SNIPPET 2026-09-21 #132]|
|Zoom / ElevenLabs|Zoom: no customer audio/video/chat used to train its or third-party models; ElevenLabs: Zero Retention Mode Enterprise-only, default retention NOT FOUND|Zoom: auto-delete settings only; ElevenLabs: not recommended until confirmed|[SNIPPET 2026-09-21 #180] [SNIPPET 2026-09-21 #64]|

## 7. What we need from you

The three that change the build are in section 1.3; each item states the assumption used.

1. **Episode length and speakers.** Assumed 60 min, 3 speakers; 90 min raises API cost 1.5x and assumed Descript media hours to 4.5 per import [UNVERIFIED - conservative assumption: Descript media hours #1].
2. **Volume.** Assumed 3/month (midpoint of 2-4), 10/month as stress case; one OpusClip Pro seat covers 10/month at 30 credits [SNIPPET 2026-09-21 #8]; Descript media hours 10 per seat [UNVERIFIED - conservative assumption: Descript media hours #1].
3. **Zoom mode.** Assumed the 20 backlog files are plain MP4s in Drive with no Zoom transcript or tracks; run tests 1-4 (section 1.2).
4. **Target platforms.** Assumed YouTube Shorts first, then TikTok/Instagram/LinkedIn via OpusClip publish.
5. **Budget ceiling.** Assumed $29.00/month floor, Descript $35.00 monthly only when needed ($53.00-$64.00/month if kept), ~$19 backlog API (3.3); lower means Remotion only.
6. **Descript license.** Assumed not yet licensed, priced at Creator annual $288.00 [SNIPPET 2026-09-21 #9]; tell us your plan and billing cycle.
7. **Final QA owner.** Assumed one team member runs all four checkpoints at $50/hr, 45 min per episode, measured in the Day-0 pilot.
8. **Data residency.** Assumed US processing on default endpoints; otherwise AssemblyAI EU and Vertex regional endpoints, prices re-verified.
9. **YouTube unlisted for review.** Assumed acceptable for episodes going to YouTube anyway; otherwise every review view costs ~$0.07 in egress.
10. **Team size for Remotion.** Assumed <= 3 people (free [VERIFIED 2026-09-21 #11]); 4+ means Automators at $100/month minimum [VERIFIED 2026-09-21 #143].
11. **Workspace admin access.** Assumed an admin can create a service account and share the folder; outputs go to a shared drive or Storage.
12. **Speaker roster.** Assumed the same 3 hosts recur, giving a candidate-name list per episode; guests are named at checkpoint 1.
13. **Node 22.** Assumed the workflows and Firebase runtime may move to Node 22 in PR 0 before Phase 1 [VERIFIED 2026-09-21 #173] [VERIFIED 2026-09-21 #174].
14. **Backlog size.** Assumed 20 episodes; each extra one adds ~$0.95 API/infra plus 25 min ($20.83) of review.
15. **Drive folder convention.** Assumed one subfolder per new episode (MP4, optional `Audio only - <name>.m4a` tracks, `participants.txt`).

## 8. Assumptions and unverified figures register

Kinds: (a) arithmetic assumptions; (b) SNIPPET official figures to confirm live before purchase; (c) THIRD-PARTY figures; (d) NOT FOUND; (e) official pages that COULD NOT ACCESS, one row per vendor group; (f) EXISTENCE UNCONFIRMED.

|Kind|Item|Value used / status|Evidence|
|---|---|---|---|
|(a)|Episode length, speakers; volume; labor; FX|60 min, 3 speakers; 3/month (also 2, 4, 10), backlog 20; $50/hr; 1 EUR = 1.10 USD|[UNVERIFIED - estimate: brief midpoints; FX assumed]|
|(a)|Token counts; Gemini token rates|14,000 in (Haiku-era) or 18,000 (Claude 4.7+) + 1,500 instructions, 3,500 out; audio 32 tok/s (Vertex says 25), video ~100 tok/s|[SNIPPET 2026-09-21 #58] [UNVERIFIED - estimate: 9,000-11,000 words/hour; higher rate used]|
|(a)|Human minutes (tag `[UNVERIFIED - estimate: G]`)|names 5 clean / 15 messy; summary 8; clips 15; shorts 7 (G gives 5; 7 used because three clips are reviewed); planning 45/episode; backlog review 25; DECISIONS 1.5 h ($1,500.00 for 20) upper bound; manual Descript edit 105 (G midpoint of 85-125) + 8 metadata = 113; Underlord review 37.5 (G midpoint of 30-45) + 8 + 5 shorts = 50.5; manual metadata 45-60|[UNVERIFIED - estimate: PRICES.md section G; Day-0 pilot replaces naming]|
|(a)|Storage, Firestore ops, compute; Airtable attachments|2.0 GiB master + 0.6 GiB proxy, 12 months; 0.6 GiB egress per play; 2,000 reads + 300 writes; 30-60 runner-min or 20 min on 4 vCPU Cloud Run (Cloud Run job row: 4 vCPU x 1,200 s, 600 s default timeout raised); WhisperX CPU 20 min; Airtable 10 GB fills after ~5 MP4s|[UNVERIFIED - estimate: encode 1-2x realtime; GPU speed only in README #72]|
|(a)|Remotion render; low-code metering|~$0.03 per 60-s clip; n8n/Zapier do not bill empty polls, Make 1 credit per check, ~8 ops/episode|[UNVERIFIED - estimate: extrapolated from #144; empty-poll rules in no snippet]|
|(a)|Setup effort and build cost|A 0.5-1, B 2-4, C 9-12, D 9.5-13 dev-days (DECISIONS 6-10 / 6.5-11 plus 1 day for PR 0); Remotion crop +2-3; build cost = days x 8 h x $50 + subscriptions to start (3.2)|[UNVERIFIED - estimate: Claude Code-assisted build]|
|(a)|Crosstalk accuracy|~8-17% of speech time mislabeled, worse in overlap|[UNVERIFIED - estimate: from DER 12.9-16.6% #71]; vendor figures [NOT FOUND]|
|(a)|OpusClip credit charging|Uploaded (trimmed) length at the 10-credit minimum = 30 credits/episode; 180 if charged on the linked source|[SNIPPET 2026-09-21 #8] [UNVERIFIED - estimate: verify day 1 of Phase 3]|
|(a)|Descript media hours per multitrack import (tag `[UNVERIFIED - conservative assumption: Descript media hours #1]`)|3 media hours per 3-track import (10 episodes per seat); backlog Phase 1 assumes single-track imports (1 seat-month)|[UNVERIFIED - conservative assumption; per-track import billing NOT FOUND; Rooms sessions bill once per session #1]|
|(a)|Backlog layout; Day-0 pilot; backlog cloud copies|Gallery or active-speaker assumed for the crop mechanism (test 3); label-error count pending on 2 MP4s ($0.50); cloud copies of the 20 backlog meetings assumed gone (test 4, 5 min)|[UNVERIFIED - estimate: tests 3-4 (section 1.2) and Day 0]|
|(b)|AssemblyAI $0.21 + $0.02 + $0.02/hr, universal-2 $0.15, 5 GB/10 h, $50 credit, changelog dates, vendor-run accuracy (2.9% speaker-count error; cpWER 30.17 vs 37.92 vs 35.26); Deepgram nova-3 $0.0043/min, Growth $0.0036, $200 credit, `mip_opt_out`; OpenAI diarize $0.006/min, 25 MB, Batch API no audio, gpt-5.5 $5/$30, gpt-5.4 $2.50/$15|confirm|[SNIPPET 2026-09-21 #2] [SNIPPET 2026-09-21 #46] [SNIPPET 2026-09-21 #75] [SNIPPET 2026-09-21 #167] [SNIPPET 2026-09-21 #168] [SNIPPET 2026-09-21 #48] [SNIPPET 2026-09-21 #49] [SNIPPET 2026-09-21 #53] [SNIPPET 2026-09-21 #52]|
|(b)|Gemini Developer API prices, 30-min diarization cap, 8 speakers, audio 32 tok/s, video ~100 tok/s, Files API 2 GB / 48 h, 9.5 h audio, 20 req/day free, paid-tier data terms (Vertex prices VERIFIED); Chirp 3 8 h batch cap|confirm|[SNIPPET 2026-09-21 #184] [SNIPPET 2026-09-21 #57] [SNIPPET 2026-09-21 #58] [SNIPPET 2026-09-21 #122] [SNIPPET 2026-09-21 #185] [SNIPPET 2026-09-21 #177] [SNIPPET 2026-09-21 #60]|
|(b)|ElevenLabs $0.22/hr, zero retention Enterprise-only; Speechmatics $0.24 and $0.129/hr, enrolled identifiers max 50, key-bound; pyannoteAI EUR 19/mo, EUR 0.112/hr, EUR 0.015/voiceprint (plan-vs-usage relation unclear); Gladia $0.61/$0.20; Twelve Labs $0.042/min, $0.021/min, 600 free min, billing cycle not in snippet|confirm|[SNIPPET 2026-09-21 #63] [SNIPPET 2026-09-21 #64] [SNIPPET 2026-09-21 #67] [SNIPPET 2026-09-21 #68] [SNIPPET 2026-09-21 #70] [SNIPPET 2026-09-21 #43] [SNIPPET 2026-09-21 #123]|
|(b)|Descript annual Hobbyist $12 vs $16, Business $40 vs $50 (two official snippets disagree); Creator $24, 30 media h; API early access on paid plans (confirm the token appears in Settings on the actual account); Zoom import UI-only; Automatic Speaker Detection and naming prompt; Automatic Multicam Rooms-only; Rooms sessions bill once|confirm both conflicts|[SNIPPET 2026-09-21 #9] [SNIPPET 2026-09-21 #153] [SNIPPET 2026-09-21 #10] [SNIPPET 2026-09-21 #129] [SNIPPET 2026-09-21 #151] [SNIPPET 2026-09-21 #152] [SNIPPET 2026-09-21 #1]|
|(b)|OpusClip Pro $29, 300 credits, 15 h API, 10-credit minimum, training on non-enterprise data (EU opt-out); Vizard Business $19.50 annual; Submagic $39/$69, 30-min cap on every plan; Riverside Pro $29/$24, API Business-only; Premiere $22.99/$34.49|confirm|[SNIPPET 2026-09-21 #4] [SNIPPET 2026-09-21 #8] [SNIPPET 2026-09-21 #132] [SNIPPET 2026-09-21 #124] [SNIPPET 2026-09-21 #186] [SNIPPET 2026-09-21 #145] [SNIPPET 2026-09-21 #133] [SNIPPET 2026-09-21 #134] [SNIPPET 2026-09-21 #140]|
|(b)|n8n Starter $24/$20, 2,500 executions; Make Core $12/$9, 100 MB/file, credits since Nov 2025; Zapier $19.99, 750 tasks, AI-step pricing change 2026-06-15; Workspace Events API shared drives only; GitHub runner price cut 2026-01-01|confirm|[SNIPPET 2026-09-21 #27] [SNIPPET 2026-09-21 #28] [SNIPPET 2026-09-21 #31] [SNIPPET 2026-09-21 #39] [SNIPPET 2026-09-21 #29] [SNIPPET 2026-09-21 #40] [SNIPPET 2026-09-21 #187] [SNIPPET 2026-09-21 #36]|
|(b)|Algolia $0.50/1k searches; Typesense 720 free node-hours; Notion $20; Airtable $20/$24, 10 GB attachments; Mux prices; Vimeo $25; YouTube 1,600 units/upload; App Hosting billing; Cloud Run jobs 168 h; Drive push channels 1 week / 1 day; Drive preview 1080p cap|confirm|[SNIPPET 2026-09-21 #106] [SNIPPET 2026-09-21 #107] [SNIPPET 2026-09-21 #81] [SNIPPET 2026-09-21 #83] [SNIPPET 2026-09-21 #84] [SNIPPET 2026-09-21 #103] [SNIPPET 2026-09-21 #101] [SNIPPET 2026-09-21 #104] [SNIPPET 2026-09-21 #169] [SNIPPET 2026-09-21 #21] [SNIPPET 2026-09-21 #22] [SNIPPET 2026-09-21 #110]|
|(b)|Zoom: file formats, participant_audio_files, local recording up to 80 participants, display-name attribution and editable speakers, layout settings, 24 h token, 3 s webhook window and 5xx-only retries, Pro $14.16 vs $13.33, storage 5 GB vs 10 GB (conflict), captions change 2026-05-18, no training on customer media|confirm on the team's account|[SNIPPET 2026-09-21 #159] [SNIPPET 2026-09-21 #12] [SNIPPET 2026-09-21 #160] [SNIPPET 2026-09-21 #15] [SNIPPET 2026-09-21 #163] [SNIPPET 2026-09-21 #13] [SNIPPET 2026-09-21 #37] [SNIPPET 2026-09-21 #24] [SNIPPET 2026-09-21 #25] [SNIPPET 2026-09-21 #23] [SNIPPET 2026-09-21 #188] [SNIPPET 2026-09-21 #26] [SNIPPET 2026-09-21 #164] [SNIPPET 2026-09-21 #180]|
|(b)|Retention: AssemblyAI keeps transcripts until deleted, paid accounts opt out of training, EU endpoint not used for training (action: opt out, delete after copy); Deepgram in the Model Improvement Program by default, `mip_opt_out=true` = request-only retention (action: send it); OpenAI API data not trained on, 30-day abuse retention, Responses `store` defaults true (action: `store:false`; current page [COULD NOT ACCESS 2026-09-21 #181]); Gemini Vertex "will not use Customer Data to train", Developer API data "may be reviewed", paid tier not used to improve (action: Vertex only; Files API deletes at 48 h; [COULD NOT ACCESS 2026-09-21 #182]); Descript training opt-in, deleted projects purged within 30 days (action: check the share-data setting; [COULD NOT ACCESS 2026-09-21 #183]); OpusClip may train on non-enterprise data, EU opt-out, 30-day expiry (action: opt out, treat as a render service); Zoom: no customer media used to train; ElevenLabs Zero Retention Enterprise-only, default retention [NOT FOUND]|settle before the first upload|[SNIPPET 2026-09-21 #6] [SNIPPET 2026-09-21 #175] [SNIPPET 2026-09-21 #49] [VERIFIED 2026-09-21 #47] [VERIFIED 2026-09-21 #179] [VERIFIED 2026-09-21 #51] [VERIFIED 2026-09-21 #176] [SNIPPET 2026-09-21 #177] [SNIPPET 2026-09-21 #178] [SNIPPET 2026-09-21 #132] [SNIPPET 2026-09-21 #180] [SNIPPET 2026-09-21 #64]|
|(c)|Descript monthly seats $24 / $35 / $65; OpenAI gpt-transcribe $0.0045/min, gpt-4o-mini-transcribe $0.003/min, gpt-5-mini $0.25/$2, text-embedding-3-small $0.02/M; whisper-1 and gpt-4o-transcribe family shutdown 2027-02-26; Azure batch $0.18/hr, fast $0.36/hr|mirrors and captures|[THIRD-PARTY 2026-09-21 #5] [THIRD-PARTY 2026-09-21 #189] [THIRD-PARTY 2026-09-21 #54] [THIRD-PARTY 2026-09-21 #42] [COULD NOT ACCESS 2026-09-21 #190]|
|(c)|CapCut Pro $19.99 (region-dependent); VEED Pro ~$22-24, Studio $39; Kapwing Pro $16/$24, 120-min cap; DaVinci Studio $295 and scripting API; AutoPod $29; Munch shutdown; Captions/Mirage $9.99-$279.99|official pages blocked|[THIRD-PARTY 2026-09-21 #136] [THIRD-PARTY 2026-09-21 #191] [THIRD-PARTY 2026-09-21 #147] [THIRD-PARTY 2026-09-21 #149] [THIRD-PARTY 2026-09-21 #125] [THIRD-PARTY 2026-09-21 #192] [THIRD-PARTY 2026-09-21 #146]|
|(c)|Riverside external-upload cap 15 h/month; Vizard no timestamp parameter, editing endpoint < 3 min, 7-day URLs, Business $19.50 first month at the annual rate (Stage 6 row); pyannoteAI second sources (Starter EUR 99/mo, 20-s minimum); Make 40-min scenario limit; Zapier Zoom trigger needs paid Zoom|single sources|[THIRD-PARTY 2026-09-21 #135] [THIRD-PARTY 2026-09-21 #126] [THIRD-PARTY 2026-09-21 #193] [THIRD-PARTY 2026-09-21 #194] [THIRD-PARTY 2026-09-21 #33] [THIRD-PARTY 2026-09-21 #195]|
|(c)|Deepgram DER 26.9% (competitor-run); OpenAI transcription deprecation 2026-08-26 / removal 2027-02-26 (endoflife.date mirror); OpusClip 30-day project expiry; Twelve Labs free plan now a lifetime 10 h pool; OpusClip/Vizard 48-76% multi-speaker accuracy, 20-40% discard rate|single sources|[THIRD-PARTY 2026-09-21 #50] [THIRD-PARTY 2026-09-21 #54] [THIRD-PARTY 2026-09-21 #155] [THIRD-PARTY 2026-09-21 #128] [THIRD-PARTY 2026-09-21 #125]|
|(c)|Zoom, not from Zoom docs: extra storage 100 GB $40/mo, 1 TB $100/mo (community); VTT names (community); per-track file names (n8n JSON, community)|test on the team's account|[THIRD-PARTY 2026-09-21 #196] [COULD NOT ACCESS 2026-09-21 #197] [THIRD-PARTY 2026-09-21 #16] [THIRD-PARTY 2026-09-21 #161] [THIRD-PARTY 2026-09-21 #162]|
|(d)|Zoom: `.transcript.vtt` speaker names; VTT cue granularity; name field on cloud `participant_audio_files[]`; local-recording layout options; Scribe price; `download_access_token` TTL; transcript endpoint shape|test on the team's account|[NOT FOUND] #16 #198 #162 [COULD NOT ACCESS 2026-09-21 #44]|
|(d)|Crosstalk accuracy; DER for Deepgram, Speechmatics, ElevenLabs, OpenAI, Gemini; accuracy of context-based naming; ElevenLabs speaker-library endpoint; Speechmatics max duration; Gladia max_speakers; pyannoteAI voiceprints per call and max input; WhisperX max input|only pyannote publishes DER|[NOT FOUND]|
|(d)|Descript: API to set speaker names, cut by timestamp, upload cap, Free-plan tokens, per-track labels and media-hour billing on multitrack import; agent prompt cutting by timestamp|UI only|[NOT FOUND] #199 [UNVERIFIED - untested]|
|(d)|OpusClip Max price, overage, XML/EDL via API; Vizard API per-minute price; Riverside Business price, Magic Clips via API; AssemblyAI Auto Chapters price (deprecated) and summarization replacement|chapters from the LLM pass|[NOT FOUND] #200|
|(d)|Typesense Cloud hourly rate on the catalog page; Drive API numeric quotas, `*.run.app` domain verification, Workspace Events max TTL; App Hosting no-cost tier numbers; Firestore quota values; n8n Pro annual price; Make extra-credit price; Zapier file caps; Remotion 5.0 date; Firestore Enterprise text search via native API; Gemini 1.5/2.0/2.5 shutdown dates; Google Sheets cell limits; Drive `/preview` seek API; Haiku 4.5 and Opus 5 vs Sonnet 5 quality gap|check Cloud Console where applicable|[NOT FOUND] [COULD NOT ACCESS 2026-09-21 #201] #202 [SNIPPET 2026-09-21 #35] (numeric quotas not in snippet) [SNIPPET 2026-09-21 #169] (tier numbers not in snippet) [COULD NOT ACCESS 2026-09-21 #80]|
|(d)|No relevant change found since 2025-01: Google Sheets API, CapCut, Kapwing, Chirp 3, Vizard (beyond the timestamp limit), Zoom `recording.completed` payload; ElevenLabs default retention and `scribe_v1` removal date in official sources; Riverside automatic speaker switching and brand presets; Vizard multi-speaker layout control; Descript brand kit|stated in the body as [NOT FOUND]|[NOT FOUND]|
|(e)|YouTube `videos.insert` and compliance-audit pages (scope confirmed from discovery doc #105 only); Descript terms; Notion embeds; YouTube iframe; Vimeo help; extensions.dev; firebase.blog; riverside.fm|blocked|[COULD NOT ACCESS #158, #119, #183, #203, #204, #205, #206, #207, #156]|
|(e)|Gemini Developer API; OpenAI|blocked|[COULD NOT ACCESS #208, #182, #209, #210, #211, #181, #212]|
|(e)|Google Cloud / Firebase; Zoom|blocked|[COULD NOT ACCESS #213, #214, #215, #44, #197, #216, #217]|
|(e)|STT vendors|blocked|[COULD NOT ACCESS #190, #218, #219, #220, #221]|
|(e)|Editors and clip tools|blocked|[COULD NOT ACCESS #222, #223, #224, #225, #226, #137, #138, #148, #150, #227, #228, #229, #230, #231, #232, #233]|
|(e)|Search, database, video hosts, low-code; podcast-tool vendors|blocked|[COULD NOT ACCESS #234, #201, #235, #236, #100, #237, #238, #239, #240, #241, #242, #243, #244, #245, #246, #247]|
|(f)|Castmagic, Podium, Swell AI, Capsho (directories only; a Pipedream component implies a Castmagic API); Podcastle (site reportedly redirects to async.com; API is TTS-only); Deepgram "Nova-4", Gladia `solaria-fusion`, cloud "Premiere Pro API", CapCut business API|excluded|[EXISTENCE UNCONFIRMED] #248 #249 #250 #251 #252 #253 #254; spec #47|
|(f)|Elastic Firestore extension|resolved: exists (v0.4.1, nodejs14) but "no longer maintained"; excluded|[VERIFIED 2026-09-21 #255]|

## 9. Sources

Numbered in order of first citation; only cited sources are listed; access date 2026-09-21 for every entry. Evidence class: live-loaded (page fetched in this environment), search-index snippet (official page read through a search-engine index), third-party (dated non-vendor page or mirror), blocked (COULD NOT ACCESS: official page unreachable and no snippet surfaced). S56 301-redirects to https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing, the URL that loaded; both map to S56.

S1. https://help.descript.com/hc/en-us/articles/27841674958221-Track-and-understand-your-media-minutes-and-AI-credits - accessed 2026-09-21 - search-index snippet
S2. https://www.assemblyai.com/pricing - accessed 2026-09-21 - search-index snippet
S3. https://platform.claude.com/docs/en/about-claude/pricing - accessed 2026-09-21 - live-loaded
S4. https://help.opus.pro/docs/article/plans-and-credits - accessed 2026-09-21 - search-index snippet
S5. https://raw.githubusercontent.com/discimusdux-ai/ai-tool-stack/main/content/blog/loom-vs-descript-2026.mdx - accessed 2026-09-21 - third-party
S6. https://www.assemblyai.com/docs/data-retention-and-model-training - accessed 2026-09-21 - search-index snippet
S7. https://cloud.google.com/storage/pricing - accessed 2026-09-21 - live-loaded
S8. https://help.opus.pro/api-reference/overview - accessed 2026-09-21 - search-index snippet
S9. https://www.descript.com/pricing - accessed 2026-09-21 - search-index snippet
S10. https://help.descript.com/hc/en-us/articles/43370311322509-Descript-API - accessed 2026-09-21 - search-index snippet
S11. https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/docs/docs/license/faq.mdx - accessed 2026-09-21 - live-loaded
S12. https://developers.zoom.us/docs/api/meetings/ - accessed 2026-09-21 - search-index snippet
S13. https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0062314 - accessed 2026-09-21 - search-index snippet
S14. https://github.com/zoom/rivet-javascript/blob/main/users/users.d.ts - accessed 2026-09-21 - live-loaded
S15. https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064927 - accessed 2026-09-21 - search-index snippet
S16. https://community.zoom.com/t5/Zoom-Meetings/Meeting-Recordings-gt-Captions-gt-Speaker-Attribution/m-p/201931 - accessed 2026-09-21 - third-party
S17. https://raw.githubusercontent.com/github/docs/main/data/reusables/billing/actions-standard-runner-prices.md - accessed 2026-09-21 - live-loaded
S18. https://raw.githubusercontent.com/github/docs/main/content/actions/reference/limits.md - accessed 2026-09-21 - live-loaded
S19. https://cloud.google.com/scheduler/pricing - accessed 2026-09-21 - live-loaded
S20. https://cloud.google.com/run/pricing - accessed 2026-09-21 - live-loaded
S21. https://docs.cloud.google.com/run/docs/configuring/task-timeout - accessed 2026-09-21 - search-index snippet
S22. https://developers.google.com/workspace/drive/api/guides/push - accessed 2026-09-21 - search-index snippet
S23. https://www.zoom.com/en/products/collaboration-tools/zoom-workplace-pro/ - accessed 2026-09-21 - search-index snippet
S24. https://developers.zoom.us/docs/api/webhooks/ - accessed 2026-09-21 - search-index snippet
S25. https://developers.zoom.us/blog/meeting-api-querying-tips-part4/ - accessed 2026-09-21 - search-index snippet
S26. https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0067670 - accessed 2026-09-21 - search-index snippet
S27. https://n8n.io/pricing/ - accessed 2026-09-21 - search-index snippet
S28. https://www.make.com/en/pricing - accessed 2026-09-21 - search-index snippet
S29. https://zapier.com/pricing - accessed 2026-09-21 - search-index snippet
S30. https://raw.githubusercontent.com/n8n-io/n8n-docs/main/docs/deploy/use-n8n-cloud/configure-cloud/manage-your-data.md - accessed 2026-09-21 - live-loaded (source of https://docs.n8n.io/deploy/use-n8n-cloud/configure-cloud/manage-your-data, which is blocked)
S31. https://help.make.com/working-with-files - accessed 2026-09-21 - search-index snippet
S32. https://raw.githubusercontent.com/n8n-io/n8n/master/packages/nodes-base/nodes/Google/Drive/GoogleDriveTrigger.node.ts - accessed 2026-09-21 - live-loaded
S33. https://community.make.com/t/maximum-execution-timeout-40-minutes-error-handler-notification/8192 - accessed 2026-09-21 - third-party
S34. https://raw.githubusercontent.com/firebase/firebase-functions/master/src/v2/options.ts - accessed 2026-09-21 - live-loaded
S35. https://developers.google.com/workspace/drive/api/guides/limits - accessed 2026-09-21 - search-index snippet
S36. https://github.blog/changelog/2026-01-01-reduced-pricing-for-github-hosted-runners-usage/ - accessed 2026-09-21 - search-index snippet
S37. https://developers.zoom.us/docs/api/meetings/events/ - accessed 2026-09-21 - search-index snippet
S38. https://raw.githubusercontent.com/n8n-io/n8n-docs/main/docs/changelog/v30-breaking-changes.md - accessed 2026-09-21 - live-loaded (source of https://docs.n8n.io/changelog/v30-breaking-changes)
S39. https://help.make.com/introducing-credits-new-billing-unit-live-in-make - accessed 2026-09-21 - search-index snippet
S40. https://help.zapier.com/hc/en-us/articles/46597632373389-AI-by-Zapier-new-model-based-pricing-starting-June-15-2026 - accessed 2026-09-21 - search-index snippet
S41. https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/transcribe/current/us-east-1/index.json - accessed 2026-09-21 - live-loaded
S42. https://github.com/hail-hq/hail/blob/main/costs/stt.json - accessed 2026-09-21 - third-party
S43. https://www.gladia.io/pricing - accessed 2026-09-21 - search-index snippet
S44. https://zoom.us/pricing/developer - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S45. https://raw.githubusercontent.com/AssemblyAI/assemblyai-node-sdk/main/src/types/openapi.generated.ts - accessed 2026-09-21 - live-loaded
S46. https://www.assemblyai.com/docs/speech-understanding/speaker-identification - accessed 2026-09-21 - search-index snippet
S47. https://raw.githubusercontent.com/deepgram/deepgram-api-specs/main/openapi.yml - accessed 2026-09-21 - live-loaded
S48. https://deepgram.com/pricing - accessed 2026-09-21 - search-index snippet
S49. https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program - accessed 2026-09-21 - search-index snippet
S50. https://github.com/xinbenlv/zThink/blob/main/_posts/2026-08-27-speech-to-text-apis-august-2026.md - accessed 2026-09-21 - third-party
S51. https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml - accessed 2026-09-21 - live-loaded
S52. https://platform.openai.com/docs/guides/speech-to-text - accessed 2026-09-21 - search-index snippet
S53. https://developers.openai.com/api/docs/pricing - accessed 2026-09-21 - search-index snippet
S54. https://raw.githubusercontent.com/endoflife-date/endoflife.date/master/products/openai-api-models.md - accessed 2026-09-21 - third-party
S55. https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta - accessed 2026-09-21 - live-loaded
S56. https://cloud.google.com/vertex-ai/generative-ai/pricing - accessed 2026-09-21 - live-loaded (301-redirects to https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing, the URL that loaded)
S57. https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe - accessed 2026-09-21 - search-index snippet
S58. https://ai.google.dev/gemini-api/docs/audio - accessed 2026-09-21 - search-index snippet
S59. https://speech.googleapis.com/$discovery/rest?version=v2 - accessed 2026-09-21 - live-loaded
S60. https://cloud.google.com/speech-to-text/v2/quotas - accessed 2026-09-21 - search-index snippet
S61. https://cloud.google.com/speech-to-text/pricing - accessed 2026-09-21 - live-loaded
S62. https://github.com/elevenlabs/elevenlabs-js/blob/main/src/api/resources/speechToText/client/requests/BodySpeechToTextV1SpeechToTextPost.ts - accessed 2026-09-21 - live-loaded
S63. https://elevenlabs.io/pricing/api - accessed 2026-09-21 - search-index snippet
S64. https://elevenlabs.io/docs/developers/resources/zero-retention-mode - accessed 2026-09-21 - search-index snippet
S65. https://github.com/speechmatics/speechmatics-js-sdk/blob/main/packages/batch-client/schema/batch.yml - accessed 2026-09-21 - live-loaded
S66. https://raw.githubusercontent.com/speechmatics/docs/main/docs/administration/plans.mdx - accessed 2026-09-21 - live-loaded
S67. https://www.speechmatics.com/pricing - accessed 2026-09-21 - search-index snippet
S68. https://docs.speechmatics.com/speech-to-text/features/speaker-identification - accessed 2026-09-21 - search-index snippet
S69. https://raw.githubusercontent.com/pyannote/pyannoteAI-python-sdk/main/src/pyannoteai/sdk/client.py - accessed 2026-09-21 - live-loaded
S70. https://www.pyannote.ai/pricing - accessed 2026-09-21 - search-index snippet
S71. https://raw.githubusercontent.com/pyannote/pyannote-audio/develop/README.md - accessed 2026-09-21 - live-loaded
S72. https://raw.githubusercontent.com/m-bain/whisperX/main/README.md - accessed 2026-09-21 - live-loaded
S73. https://raw.githubusercontent.com/elevenlabs/skills/main/speech-to-text/references/transcription-options.md - accessed 2026-09-21 - live-loaded
S74. https://raw.githubusercontent.com/gladiaio/docs/main/chapters/limits-and-specifications/data-retention.mdx - accessed 2026-09-21 - live-loaded
S75. https://www.assemblyai.com/changelog - accessed 2026-09-21 - search-index snippet
S76. https://raw.githubusercontent.com/deepgram/deepgram-js-sdk/main/CHANGELOG.md - accessed 2026-09-21 - live-loaded
S77. https://pypi.org/pypi/whisperx/json - accessed 2026-09-21 - live-loaded
S78. https://cloud.google.com/firestore/pricing - accessed 2026-09-21 - live-loaded
S79. https://www.googleapis.com/discovery/v1/apis/sheets/v4/rest - accessed 2026-09-21 - live-loaded
S80. https://support.google.com/drive/answer/37603 - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S81. https://www.notion.com/pricing - accessed 2026-09-21 - search-index snippet
S82. https://raw.githubusercontent.com/makenotion/notion-mcp-server/main/scripts/notion-openapi.json - accessed 2026-09-21 - live-loaded
S83. https://airtable.com/pricing - accessed 2026-09-21 - search-index snippet
S84. https://support.airtable.com/docs/airtable-plans - accessed 2026-09-21 - search-index snippet
S85. https://registry.npmjs.org/airtable - accessed 2026-09-21 - live-loaded
S86. https://raw.githubusercontent.com/googleapis/googleapis/master/google/firestore/v1/document.proto - accessed 2026-09-21 - live-loaded
S87. https://www.googleapis.com/discovery/v1/apis/drive/v3/rest - accessed 2026-09-21 - live-loaded
S88. https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/htmlmediaelement/currenttime/index.md - accessed 2026-09-21 - live-loaded
S89. https://raw.githubusercontent.com/vimeo/player.js/master/README.md - accessed 2026-09-21 - live-loaded
S90. https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/stream/viewing-videos/using-the-stream-player/index.mdx - accessed 2026-09-21 - live-loaded
S91. https://cloud.google.com/blog/products/databases/announcing-firestore-with-mongodb-compatibility - accessed 2026-09-21 - live-loaded
S92. https://firestore.googleapis.com/$discovery/rest?version=v1 - accessed 2026-09-21 - live-loaded
S93. https://raw.githubusercontent.com/makenotion/notion-sdk-js/main/README.md - accessed 2026-09-21 - live-loaded
S94. https://cloud.google.com/identity-platform/pricing - accessed 2026-09-21 - live-loaded
S95. https://registry.npmjs.org/minisearch - accessed 2026-09-21 - live-loaded
S96. https://registry.npmjs.org/fuse.js - accessed 2026-09-21 - live-loaded
S97. https://platform.claude.com/docs/en/build-with-claude/embeddings - accessed 2026-09-21 - live-loaded
S98. https://raw.githubusercontent.com/supabase/supabase/master/packages/shared-data/plans.ts - accessed 2026-09-21 - live-loaded
S99. https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/database/full-text-search.mdx - accessed 2026-09-21 - live-loaded
S100. https://wistia.com/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S101. https://help.vimeo.com/hc/en-us/articles/12425432033937-About-Vimeo-plans - accessed 2026-09-21 - search-index snippet
S102. https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/stream/pricing.mdx - accessed 2026-09-21 - live-loaded
S103. https://www.mux.com/pricing - accessed 2026-09-21 - search-index snippet
S104. https://developers.google.com/youtube/v3/determine_quota_cost - accessed 2026-09-21 - search-index snippet
S105. https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest - accessed 2026-09-21 - live-loaded
S106. https://support.algolia.com/hc/en-us/articles/15745996583441-How-am-I-billed-on-the-Grow-plan - accessed 2026-09-21 - search-index snippet
S107. https://cloud-help-center.typesense.org/article/24-how-does-the-free-tier-work - accessed 2026-09-21 - search-index snippet
S108. https://raw.githubusercontent.com/meilisearch/documentation/main/resources/comparisons/algolia.mdx - accessed 2026-09-21 - live-loaded
S109. https://www.googleapis.com/discovery/v1/apis/firestore/v1/rest - accessed 2026-09-21 - live-loaded
S110. https://support.google.com/drive/answer/2423694 - accessed 2026-09-21 - search-index snippet
S111. https://cloud.google.com/cdn/pricing - accessed 2026-09-21 - live-loaded
S112. https://raw.githubusercontent.com/FirebaseExtended/firebase-framework-tools/main/packages/@apphosting/adapter-nextjs/src/utils.ts - accessed 2026-09-21 - live-loaded
S113. https://raw.githubusercontent.com/algolia/firestore-algolia-search/main/CHANGELOG.md - accessed 2026-09-21 - live-loaded
S114. https://raw.githubusercontent.com/typesense/firestore-typesense-search/master/extension.yaml - accessed 2026-09-21 - live-loaded
S115. https://raw.githubusercontent.com/meilisearch/meilisearch/main/README.md - accessed 2026-09-21 - live-loaded
S116. https://raw.githubusercontent.com/muxinc/mux-ts/main/CHANGELOG.md - accessed 2026-09-21 - live-loaded
S117. https://raw.githubusercontent.com/vercel/next.js/canary/examples/with-supabase/package.json - accessed 2026-09-21 - live-loaded
S118. https://raw.githubusercontent.com/vimeo/vimeo.js/master/README.md - accessed 2026-09-21 - live-loaded
S119. https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits - accessed 2026-09-21 - blocked (egress proxy; developers.google.com unreachable)
S120. https://platform.claude.com/docs/en/build-with-claude/vision - accessed 2026-09-21 - live-loaded
S121. https://raw.githubusercontent.com/google-gemini/deprecated-generative-ai-js/main/README.md - accessed 2026-09-21 - live-loaded
S122. https://ai.google.dev/gemini-api/docs/video-understanding - accessed 2026-09-21 - search-index snippet
S123. https://www.twelvelabs.io/pricing - accessed 2026-09-21 - search-index snippet
S124. https://help.vizard.ai/en/articles/10442011-how-pricing-and-billing-work-for-business-plan - accessed 2026-09-21 - search-index snippet
S125. https://raw.githubusercontent.com/kitcut-hq/kitcut/main/docs/market-shorts-2026.md - accessed 2026-09-21 - third-party
S126. https://raw.githubusercontent.com/singletask/vizard-mcp/main/skills/vizard/references/api.md - accessed 2026-09-21 - third-party
S127. https://platform.claude.com/docs/en/build-with-claude/structured-outputs - accessed 2026-09-21 - live-loaded
S128. https://raw.githubusercontent.com/rishabhcli/ZooVision/main/docs/sponsors/twelvelabs.md - accessed 2026-09-21 - third-party
S129. https://help.descript.com/hc/en-us/articles/29626422449293-Import-Zoom-recordings-into-Descript - accessed 2026-09-21 - search-index snippet
S130. https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/doc/ffmpeg.texi - accessed 2026-09-21 - live-loaded
S131. https://raw.githubusercontent.com/opus-pro/opus-skills/main/skills/opusclip/references/api-reference.md - accessed 2026-09-21 - live-loaded
S132. https://help.opus.pro/docs/article/opusclip-data-training - accessed 2026-09-21 - search-index snippet
S133. https://riverside.com/pricing - accessed 2026-09-21 - search-index snippet
S134. https://support.riverside.com/hc/en-us/articles/9068592900381-Riverside-Business-API - accessed 2026-09-21 - search-index snippet
S135. https://support.riverside.com/hc/en-us/articles/27728436340125-What-are-the-limits-for-uploading-external-files - accessed 2026-09-21 - third-party
S136. https://raw.githubusercontent.com/discimusdux-ai/ai-tool-stack/main/content/blog/best-ai-video-editing-tools-2026.mdx - accessed 2026-09-21 - third-party
S137. https://www.capcut.com/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S138. https://www.veed.io/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S139. https://registry.npmjs.org/@veedstudio/sdk - accessed 2026-09-21 - live-loaded
S140. https://www.adobe.com/products/premiere/plans.html - accessed 2026-09-21 - search-index snippet
S141. https://raw.githubusercontent.com/AdobeDocs/uxp-premiere-pro/main/src/pages/changelog/index.md - accessed 2026-09-21 - live-loaded
S142. https://raw.githubusercontent.com/AdobeDocs/ffs-audio-video-API/main/src/pages/getting-started/usage/index.md - accessed 2026-09-21 - live-loaded
S143. https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/docs/docs/terms.mdx - accessed 2026-09-21 - live-loaded
S144. https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/docs/docs/lambda/cost-example.mdx - accessed 2026-09-21 - live-loaded
S145. https://care.submagic.co/en/article/what-is-the-size-and-video-length-limit-for-each-video-in-submagic-gl84of/ - accessed 2026-09-21 - search-index snippet
S146. https://raw.githubusercontent.com/samuelgursky/davinci-resolve-mcp/main/docs/reference/resolve_scripting_api.txt - accessed 2026-09-21 - third-party
S147. https://raw.githubusercontent.com/sheetgenius/bitterclip-marketing/main/content/compare/kapwing.md - accessed 2026-09-21 - third-party
S148. https://www.kapwing.com/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S149. https://raw.githubusercontent.com/SysAdminDoc/OpenCut/main/docs/RESEARCH_COMPETITIVE_TEARDOWN_2026-06-10.md - accessed 2026-09-21 - third-party
S150. https://www.autopod.fm/ - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S151. https://help.descript.com/hc/en-us/articles/10249423506061-Detect-and-label-speakers-in-your-transcript - accessed 2026-09-21 - search-index snippet
S152. https://www.descript.com/blog/article/descript-season-7-rooms-zoom-automatic-multicam - accessed 2026-09-21 - search-index snippet
S153. https://help.descript.com/hc/en-us/articles/10255874128397-How-billing-works-in-Descript - accessed 2026-09-21 - search-index snippet
S154. https://github.com/descriptinc/descript-mcp - accessed 2026-09-21 - live-loaded
S155. https://raw.githubusercontent.com/sheetgenius/bitterclip-marketing/main/content/compare/opus-clip.md - accessed 2026-09-21 - third-party
S156. https://riverside.fm - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S157. https://raw.githubusercontent.com/veedstudio/open-edit/main/README.md - accessed 2026-09-21 - live-loaded
S158. https://developers.google.com/youtube/v3/docs/videos/insert - accessed 2026-09-21 - blocked (egress proxy; developers.google.com unreachable)
S159. https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064394 - accessed 2026-09-21 - search-index snippet
S160. https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060612 - accessed 2026-09-21 - search-index snippet
S161. https://raw.githubusercontent.com/DragonJAR/n8n-workflows-esp/main/workflows/05287-Publish-Zoom-class-recordings-to-Google-Classroom-automatically.json - accessed 2026-09-21 - third-party
S162. https://community.zoom.com/t5/Zoom-Meetings/Downloading-files-from-a-recording/m-p/37426 - accessed 2026-09-21 - third-party
S163. https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0076062 - accessed 2026-09-21 - search-index snippet
S164. https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0085668 - accessed 2026-09-21 - search-index snippet
S165. https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/includes/retire-speaker-recognition.md - accessed 2026-09-21 - live-loaded
S166. https://raw.githubusercontent.com/Picovoice/speaker-recognition-benchmark/main/README.md - accessed 2026-09-21 - live-loaded
S167. https://www.assemblyai.com/blog/speaker-diarization-improvements - accessed 2026-09-21 - search-index snippet
S168. https://www.assemblyai.com/blog/universal-3-5-pro-async - accessed 2026-09-21 - search-index snippet
S169. https://firebase.google.com/docs/app-hosting/costs - accessed 2026-09-21 - search-index snippet
S170. https://cloud.google.com/build/pricing - accessed 2026-09-21 - live-loaded
S171. https://registry.npmjs.org/@google/generative-ai - accessed 2026-09-21 - live-loaded
S172. https://registry.npmjs.org/@google/genai - accessed 2026-09-21 - live-loaded
S173. https://registry.npmjs.org/openai - accessed 2026-09-21 - live-loaded
S174. https://registry.npmjs.org/firebase-admin - accessed 2026-09-21 - live-loaded
S175. https://www.assemblyai.com/docs/faq/how-to-opt-out-of-data-sharing-for-our-model-improvement-program - accessed 2026-09-21 - search-index snippet
S176. https://cloud.google.com/terms/service-terms - accessed 2026-09-21 - live-loaded
S177. https://ai.google.dev/gemini-api/terms_preview - accessed 2026-09-21 - search-index snippet
S178. https://help.descript.com/hc/en-us/articles/10255866490125-Account-data-and-privacy - accessed 2026-09-21 - search-index snippet
S179. https://raw.githubusercontent.com/openai/openai-cookbook/main/examples/data/oai_docs/models.txt - accessed 2026-09-21 - live-loaded
S180. https://www.zoom.com/en/products/ai-assistant/resources/privacy-security/ - accessed 2026-09-21 - search-index snippet
S181. https://platform.openai.com/docs/guides/your-data - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S182. https://ai.google.dev/gemini-api/terms - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S183. https://www.descript.com/terms - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S184. https://ai.google.dev/gemini-api/docs/pricing - accessed 2026-09-21 - search-index snippet
S185. https://ai.google.dev/gemini-api/docs/rate-limits - accessed 2026-09-21 - search-index snippet
S186. https://www.submagic.co/pricing - accessed 2026-09-21 - search-index snippet
S187. https://developers.google.com/workspace/events/guides/events-drive - accessed 2026-09-21 - search-index snippet
S188. https://zoom.us/pricing - accessed 2026-09-21 - search-index snippet
S189. https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json - accessed 2026-09-21 - third-party
S190. https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/ - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S191. https://raw.githubusercontent.com/canivibecodeit/canivibecodeit/main/data/apps/veed.json - accessed 2026-09-21 - third-party
S192. https://raw.githubusercontent.com/inference-sh/grid/main/api/mirage/README.md - accessed 2026-09-21 - third-party
S193. https://raw.githubusercontent.com/api-evangelist/pyannoteai/main/plans/pyannoteai-plans-pricing.yml - accessed 2026-09-21 - third-party
S194. https://raw.githubusercontent.com/jlevy/thinking/main/docs/project/research/research-2026-09-02-parliamentary-transcription-tooling-inventory.md - accessed 2026-09-21 - third-party
S195. https://zapier.com/blog/upload-zoom-recordings-google-drive/ - accessed 2026-09-21 - third-party (vendor blog post, not a pricing or docs page)
S196. https://community.zoom.com/t5/Zoom-Meetings/Cloud-Recording-Plans/m-p/62406 - accessed 2026-09-21 - third-party
S197. https://zoom.us/pricing/additional - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S198. https://raw.githubusercontent.com/konfig-sdks/zoom-meeting-python-sdk/main/zoom_meeting_python_sdk/model/cloud_recording_get_meeting_recordings_response_participant_audio_files_item.py - accessed 2026-09-21 - third-party
S199. https://registry.npmjs.org/@descript/platform-cli - accessed 2026-09-21 - live-loaded
S200. https://raw.githubusercontent.com/AssemblyAI/assemblyai-skill/main/skills/assemblyai/references/speech-understanding.md - accessed 2026-09-21 - live-loaded
S201. https://cloud.typesense.org/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S202. https://raw.githubusercontent.com/typesense/typesense-website/master/typesense.org-v3/pages/typesense-vs-meilisearch.vue - accessed 2026-09-21 - live-loaded
S203. https://www.notion.com/help/embeds-and-connections - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S204. https://developers.google.com/youtube/iframe_api_reference - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S205. https://help.vimeo.com - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S206. https://extensions.dev - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S207. https://firebase.blog - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S208. https://ai.google.dev/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S209. https://ai.google.dev/gemini-api/docs/transcribe - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S210. https://platform.openai.com/docs/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S211. https://platform.openai.com/docs/models - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S212. https://platform.openai.com/docs/deprecations - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S213. https://docs.cloud.google.com/firestore/quotas - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S214. https://firebase.google.com/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S215. https://firebase.google.com/docs/firestore/solutions/search - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S216. https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0074786 - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S217. https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0078144 - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S218. https://aws.amazon.com/transcribe/pricing/ - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S219. https://www.rev.ai/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S220. https://picovoice.ai/pricing/ - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S221. https://www.speechmatics.com/privacy-policy - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S222. https://help.descript.com - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S223. https://www.descript.com/privacy - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S224. https://riverside.fm/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S225. https://docs.riverside.fm/ - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S226. https://docs.vizard.ai/docs/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S227. https://www.blackmagicdesign.com/products/davinciresolve - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S228. https://developer.adobe.com/premiere-pro/uxp/ - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S229. https://www.adobe.com/products/firefly/plans.html - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S230. https://www.remotion.pro/license - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S231. https://www.remotion.pro/terms-4-0 - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S232. https://docs.twelvelabs.io/ - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S233. https://aws.amazon.com/rekognition/pricing/ - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S234. https://supabase.com/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S235. https://www.meilisearch.com/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S236. https://vimeo.com/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S237. https://frame.io/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S238. https://otter.ai/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S239. https://help.otter.ai - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S240. https://app.n8n.cloud/service-pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S241. https://www.make.com/en/integrations/zoom - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S242. https://help.zapier.com - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S243. https://www.castmagic.io/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S244. https://hello.podium.page/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S245. https://www.swellai.com/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S246. https://www.capsho.com/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S247. https://podcastle.ai/pricing - accessed 2026-09-21 - blocked (COULD NOT ACCESS)
S248. https://raw.githubusercontent.com/PipedreamHQ/pipedream/master/components/castmagic/castmagic.app.mjs - accessed 2026-09-21 - third-party
S249. https://raw.githubusercontent.com/canivibecodeit/canivibecodeit/main/data/apps/castmagic.json - accessed 2026-09-21 - third-party
S250. https://github.com/tankvn/awesome-ai-tools/blob/main/Audio.md - accessed 2026-09-21 - third-party
S251. https://raw.githubusercontent.com/canivibecodeit/canivibecodeit/main/data/apps/swell-ai.json - accessed 2026-09-21 - third-party
S252. https://github.com/nathangathright/pod.garden/blob/main/products/Capsho.md - accessed 2026-09-21 - third-party
S253. https://raw.githubusercontent.com/api-evangelist/podcastle/main/apis.yml - accessed 2026-09-21 - third-party
S254. https://raw.githubusercontent.com/canivibecodeit/canivibecodeit/main/data/apps/podcastle.json - accessed 2026-09-21 - third-party
S255. https://raw.githubusercontent.com/elastic/app-search-firestore-extension/master/README.md - accessed 2026-09-21 - live-loaded
