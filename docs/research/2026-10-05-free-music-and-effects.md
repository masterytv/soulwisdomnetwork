# Free and royalty-free music and sound effects

**Date:** 5 October 2026
**Asked by:** Tom (spec 020, decision U2): "search for free or royalty free music and effects; we'll
do the licence check manually".
**Used by:** `docs/specs/020-studio-editor.md` (show library, item E7).

## Read this first

**Every term below needs checking on the source's own licence page before a file is used.** The
research sandbox could not open those pages: the proxy blocked all of them. The terms come from
search-result text instead.
- **[source]** means the wording is the source's own, as quoted in search results.
- **[secondary]** means a review, a library guide or general knowledge.

This is a shortlist for the manual check, not legal advice.

## Shortlist

**Music beds** (intro and outro beds, gentle ambient underscoring):
1. **Pixabay Music**
   - no credit;
   - avoid tracks with the shield icon (registered with Content ID);
   - save the licence certificate.
2. **Mixkit music:** no credit; reportedly not in Content ID.
3. **Incompetech (Kevin MacLeod):** CC BY 4.0, with the exact credit below.
4. **Freesound CC0** ambient drones and pads.
5. **Paid, if wanted:** Epidemic Sound is the cleanest single licence for YouTube and a podcast
   feed.

**Transition effects** (whooshes, risers, chimes, soft impacts):
1. **Sonniss GameAudioGDC bundles:** professional, royalty-free, no credit.
2. **Mixkit sound effects:** no credit; podcasts, YouTube and social are named as allowed.
3. **Freesound** CC0, or CC BY with credit.
4. **Pixabay sound effects.**
5. **Zapsplat:** free tier needs a credit.

**Not for us:**
- **BBC Sound Effects:** RemArc licence, personal, educational and research use only.
- **Bensound free:** no podcasts, and one credit per video.
- **Anything CC BY-NC or CC BY-ND:** no commercial use; ND bars putting it in a video.
- **YouTube Audio Library** for anything but YouTube. Its tracks are effectively YouTube-only, so
  they cannot go in an audio feed, Instagram or TikTok.

## Sources

| Source | What | Licence (key terms) | Credit | Content ID risk | API |
|---|---|---|---|---|---|
| [Pixabay](https://pixabay.com/music/) (Canva) | Music; 130,000+ effects | Pixabay Content License, site-wide: commercial use; no selling or redistributing on its own [source] | None [source] | Some contributors register tracks (shield icon); Pixabay gives a certificate to dispute claims [source] | Images and video only, no audio [secondary] |
| [Mixkit](https://mixkit.co/license/) (Envato) | ~1,000 music tracks, ~3,000 effects | Free licences for music and for effects: commercial use; effects allowed in podcasts, YouTube, social, broadcast; music not for broadcast; never register in Content ID [source] | None | Low [secondary] | None |
| [Freesound](https://freesound.org) (UPF) | ~715,000 sounds | Per sound: CC0 and CC BY are fine; **CC BY-NC is not**; check old Sampling+ ones [source] | CC BY: `"Title" by user (https://freesound.org/s/ID/) licensed under CC BY 4.0` [source] | Low | Free only for non-commercial use; commercial use needs an agreement with UPF [source] |
| [Incompetech](https://incompetech.com) (Kevin MacLeod) | ~2,000 tracks | CC BY 4.0; a paid licence drops the credit [secondary] | `"Title" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 https://creativecommons.org/licenses/by/4.0/` [source] | Low; very familiar to audiences | None |
| [Sonniss GameAudioGDC](https://sonniss.com/gameaudiogdc/) | Tens of GB of effects (2026 bundle ~7.5 GB) | Royalty-free, commercial, all media; no reselling sounds, no AI training [secondary] | None | None | None |
| [Zapsplat](https://www.zapsplat.com/license-type/standard-license/) | Effects, some music | Basic (free): commercial, broadcast, podcast, YouTube [source] | "Sound effects obtained from https://www.zapsplat.com" [source]; Gold removes it | Low | None |
| [YouTube Audio Library](https://support.google.com/youtube/answer/3376882) | Music and effects | Standard tracks: monetised YouTube use, no credit; CC tracks need credit [source] | Some tracks | None on YouTube | None |
| [Free Music Archive](https://freemusicarchive.org) | Music | Per track, chosen by the artist; many NC or ND [source] | Per track | Some claimed | — |
| [ccMixter](https://ccmixter.org) | Music | Per track; use the "commercial projects" (CC BY) filter [source] | Artist, title, links [source] | Some | — |
| [Musopen](https://musopen.org) | Classical recordings | Per recording; public domain not guaranteed [source] | Per recording | Some claimed (e.g. Goldberg Variations) [source] | — |
| [Chosic](https://www.chosic.com/free-music-policy/) | Mixed (re-hosts others) | Public domain and CC BY; never put it in Content ID [source] | Copy the block from the track page | Some | — |
| [Uppbeat](https://uppbeat.io) | Music | Free plan: 3 downloads a month, one credit code per video; "non-commercial content" on one page [source] | Code per video | — | Ambiguous for a business channel; ask them or pay |
| [Kenney](https://kenney.nl) / [OpenGameArt](https://opengameart.org) | Game and UI sounds; CC0 calm and cinematic collections | Kenney all CC0; OpenGameArt per asset (avoid GPL, BY-SA) [secondary] | CC0: none | None | — |

**Paid fallbacks [secondary]:**
- **Epidemic Sound:** YouTube, social, and podcasts on Spotify and Apple. Published work stays
  cleared after cancelling.
- **Artlist:** YouTube, Instagram, TikTok and podcasts; one channel per platform.
- **Musicbed:** podcasts on all plans; Content ID cleared with SyncID.
- **Envato Elements:** commercial licence on every download; Claim Clear for Content ID.

## Cautions

- **Free is not claim-free.** Some "free" tracks are registered with Content ID by their
  contributors. Keep proof of every download to dispute a claim. Never post a Short that is only
  music.
- **Never register these files in Content ID ourselves.** Mixkit and Chosic forbid it.
- **Credit codes are per video** (Uppbeat, Bensound). One code cannot cover the episode and its
  Shorts.
- **No usable API for a commercial Studio** (Freesound needs an agreement; Pixabay has no audio
  API). Files are downloaded by hand and added to the show library.

## What the show library keeps per file

So the manual check is done once and remembered (spec 020, item E7):
- the file, its source URL and its author;
- the licence name and licence URL;
- the download date, and a snapshot of the licence page that day (PDF or screenshot);
- any certificate or credit code;
- the credit text, if one is needed;
- **checked by** and **checked on**. The file cannot be used until these are filled in.
- where it has been used (episodes and Shorts), so a claim can be traced.
