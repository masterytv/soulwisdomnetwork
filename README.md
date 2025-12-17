# Soul Wisdom Network

The premier network for spiritual growth, connection, and wisdom.

## Project Overview
Built with:
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS v4 ("Mystic Indigo" Theme)
- **Deployment**: Firebase Hosting
- **CI/CD**: GitHub Actions

## Getting Started

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Run Development Server**:
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) to view it.

## Deployment

### Automated (Recommended)
This repository uses **GitHub Actions** to deploy automatically.
- Merging to `main` triggers a deploy to the live site.
- Requires `FIREBASE_SERVICE_ACCOUNT_SOULWISDOMNEWTWORK` secret in GitHub.

### Manual
```bash
npx firebase-tools deploy
```

## Documentation
- [Onboarding Guide](docs/ONBOARDING.md)
- [Design Spec](docs/specs/002-design-update.md)
