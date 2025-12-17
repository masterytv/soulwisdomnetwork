# Firebase Setup Instructions

## 1. Get the Keys
1.  In the Firebase Console (Project Settings > General), look at the **"Your apps"** section (from your screenshot).
2.  Click the **`</>`** (Web) icon.
3.  Enter a nickname (e.g., "Soul Wisdom Web").
4.  **Uncheck** "Also set up Firebase Hosting" (we already did that).
5.  Click **Register app**.
6.  You will see a code block. Look for `const firebaseConfig = { ... }`.

## 2. Create Environment File
Create a new file in your project root called `.env.local` and paste the following, filling in the values from step 1:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=paste_apiKey_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=soulwisdomnewtwork.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=soulwisdomnewtwork
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=soulwisdomnewtwork.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=paste_messagingSenderId_here
NEXT_PUBLIC_FIREBASE_APP_ID=paste_appId_here
```

## 3. Enable Authentication
1.  Go to **Build** -> **Authentication** in the left sidebar.
2.  Click **Get started**.
3.  **Sign-in method** tab:
    *   Click **Google** -> Enable -> Save.
    *   Click **Email/Password** -> Enable -> Save.

## 4. Enable Firestore
1.  Go to **Build** -> **Firestore Database**.
2.  Click **Create database**.
3.  Select location `nam5 (us-central)` (or default).
4.  Select **Start in Test mode**.
5.  Click **Create**.
