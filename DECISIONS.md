# Decisions Tom made that change a standing rule

Each entry has an ID that the code, CLAUDE.md and the specs cite, the date and time it was made (Eastern Time), who
made it and in what words, and what it allows and doesn't. A rule that something waits for Tom changes only with an
entry here (as in `masterytv/short-maker`'s DECISIONS.md, whose entries cover Project Profound only).

## D-2026-11-23-swc-autopost: Soul Wisdom's Shorts go to Instagram and Facebook by themselves

- **When:** 2026-11-23, 2:54 pm ET (Monday), in a Claude Code session building Soul Wisdom's social publishing.
- **Who:** Tom.
- **His words:** asked "Do you agree that Soul Wisdom's posts (Reels, carousels, image posts on Instagram and Facebook)
  go out automatically through Upload-Post, with no button press each time?", he chose the answer "Yes, post
  automatically". In the same answers: Reels at 2 a day following YouTube, carousels and image posts at 1 a day each;
  each Reel 3 hours after its Short goes public on YouTube, feed posts at 7 pm ET; every Short approved at Checkpoint E.
- **Context:** step 6 of the low-cost marketing plan, brought to Soul Wisdom from Project Profound (the plan doc's "SWC
  publishing plan" tab). Project Profound's decisions (D-2026-11-19-crosspost, D-2026-11-23-feed-autopost) don't cover
  Soul Wisdom.
- **What it allows:** for every Short approved at Checkpoint E and scheduled on YouTube, the social job
  (`docs/specs/026-social-publishing.md`) hands its Reel, image post and story carousel to Upload-Post with their times
  set, to Soul Wisdom's own Instagram and Facebook (Upload-Post profile `soul_wisdom_collective`). Until each goes, the
  producers can read, edit, hold or cancel it on the Studio's Social page.
- **What it doesn't allow:** posting a Short that isn't scheduled or public on YouTube (a Short unscheduled there has
  its posts cancelled); posting a Short not approved at Checkpoint E, or whose approval is out of date; posting to any
  other account; posting to YouTube's community tab (the API isn't open; that stays a download for Tom to post by
  hand); an AI agent posting during a working session. Nothing posts until the code is built and merged to `main` by Tom.
- **Off switch:** repo variable `SOCIAL_AUTOPOST=off`: every post then waits for the Post button on the Social page.
