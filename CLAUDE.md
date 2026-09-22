# Soul Wisdom Network

Next.js community site for the Soul Wisdom podcast, plus an agent that scores YouTube
videos. A podcast production pipeline is specified but not yet built — see
`docs/specs/005-podcast-production-pipeline.md`.

**Live:** https://soulwisdomcollective.com

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript · Firebase (Firestore, Auth,
App Hosting) · Node 24

```
app/          routes (dashboard, members, messages, profile, signal, admin, login)
components/   auth/ curate/ daily/ feed/
lib/firebase/ config.ts (client init), firestore.ts, messaging.ts
context/      React context providers
agent/src/    scout.ts — YouTube scorer, runs in GitHub Actions, NOT on App Hosting
scripts/      make_admin.ts
docs/specs/   numbered specs, 001-005
types/
```

```bash
npm run dev      # local, needs .env.local
npm run build    # next build
npm run lint     # eslint
npx tsc --noEmit # typecheck
```

Develop locally. An App Hosting build takes ~10 minutes, so never deploy to test a change.

## Firebase

Project **`soulwisdomnetwork`** · Blaze · Firestore `nam5` · App Hosting `us-central1`

**This uses Firebase App Hosting, not Firebase Hosting.** Two different products with
confusingly similar names. App Hosting runs the app on Cloud Run and builds from GitHub.
Never enable Firebase Hosting, and never tick "Also set up Firebase Hosting" anywhere.

Pushing to `main` triggers a build and rollout automatically. There is no deploy workflow
in CI — App Hosting connects to the repo directly. Do not add one.

### Secrets

Runtime config lives in **Google Secret Manager**, mapped to env vars by `apphosting.yaml`.
Six secrets, all `FIREBASE_*`. To add or rotate one:

```bash
firebase apphosting:secrets:set SECRET_NAME --project soulwisdomnetwork
```

Answer **Production**, and **yes** to granting the backend access. Decline the offer to add
it to `apphosting.yaml` — the file already declares what the app needs.

Creating a secret in the Cloud Console instead creates it **without** the IAM binding, and
the build then fails with `fah/misconfigured-secret`. Fix with:

```bash
firebase apphosting:secrets:grantaccess SECRET_NAME \
  --project soulwisdomnetwork --backend soulwisdomnetwork
```

The agent's keys (`YOUTUBE_API_KEY`, `OPENAI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`) are
**GitHub repo secrets**, not Secret Manager, because the agent runs in Actions. They are
deliberately absent from `apphosting.yaml`.

### Firestore

`firestore.rules` and `firestore.indexes.json` are the source of truth. Nothing deploys
them automatically:

```bash
firebase deploy --only firestore:rules,firestore:indexes --project soulwisdomnetwork
```

Collections: `users`, `posts`, `comments`, `conversations`, `messages`, `feed_items`,
`channels`.

Two rules are load-bearing and easy to break:

- **`posts` update** allows any signed-in user to change *only* `commentCount` and
  `likesCount`. The like and comment buttons write to posts they do not own. Tightening
  this to author-only breaks both buttons.
- **`messages` read** checks conversation membership via a `get()` on the parent
  conversation, not a field on the message.

`feed_items` and `channels` are written by the scout through the Admin SDK, which bypasses
rules entirely — so they need no client write access and have none.

Never use Firestore "Test mode". It permits unrestricted reads and writes from anywhere.

Adding a query with `where` + `orderBy` on different fields needs a composite index in
`firestore.indexes.json`, or it throws at runtime.

### Auth

Google and Email/Password. Any new domain the app is served from must be added to
**Authentication → Settings → Authorized domains**, or sign-in fails there with
`auth/unauthorized-domain` while the rest of the site works normally.

The browser API key is not a secret — it ships in every client bundle. The **service
account JSON** is, and bypasses all security rules.

## Git

`main` is protected: no direct pushes, PRs required. Work flows
**feature branch → `staging` → `main`**.

Merging to `main` deploys to production. Keep PRs to one concern.

## Conventions

- Verify with `npx tsc --noEmit` and `npm run build` before pushing — a red build costs a
  ten-minute cycle.
- Specs live in `docs/specs/NNN-name.md` and are numbered sequentially.
- `.env.local` and `serviceAccountKey.json` are gitignored. Keep it that way.

## Known state

- `@google/generative-ai` is end-of-life; migrate to `@google/genai`.
- `firebase-admin` is on v14, which removed the namespaced API (`admin.firestore()`,
  `admin.credential`). Import from `firebase-admin/app` and `firebase-admin/firestore`.
- `/curate` and `/daily` are disabled stubs; `daily_harvest.yml` is manual-trigger only.
- `agent/src/test_gemini.ts` reads `GEMINI_API_KEY`, which no longer exists anywhere.
