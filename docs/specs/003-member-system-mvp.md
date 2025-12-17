# Spec 003: Member System MVP (Auth, Profile, Community)

## Goal
Build a Minimum Viable Product (MVP) for a community platform similar to Skool/Twitter.
**Core Features:**
1.  **Authentication**: User Sign-up/Login.
2.  **Profiles**: Custom user profiles.
3.  **Feed (Dashboard)**: Create and view text-based posts.
4.  **Interaction**: Basic commenting on posts.

## 1. Technical Architecture
-   **Framework**: Next.js 15 (App Router).
-   **Auth**: Firebase Authentication (Google Provider + Email/Password).
-   **Database**: Cloud Firestore.
-   **Styling**: Tailwind CSS v4 ("Mystic Indigo" Theme).

## 2. Data Model (Firestore)

### `users` (Collection)
Stores public profile data.
-   `uid` (string): Matches Auth UID.
-   `displayName` (string): Full name.
-   `email` (string): User email.
-   `username` (string): Unique handle (unique index required).
-   `photoURL` (string): Profile picture.
-   `bio` (string): Short description.
-   `createdAt` (timestamp).

### `posts` (Collection)
Main community feed items.
-   `id` (auto-id).
-   `authorId` (string): Reference to `users.uid`.
-   `authorName` (string): Denormalized for read efficiency.
-   `authorPhoto` (string): Denormalized.
-   `content` (string): Text content (Markdown support optional later).
-   `createdAt` (timestamp).
-   `likesCount` (number).
-   `commentCount` (number).

### `comments` (Collection or Subcollection)
Comments on posts.
-   `id` (auto-id).
-   `postId` (string): Reference to `posts.id`.
-   `authorId` (string).
-   `authorName` (string).
-   `authorPhoto` (string).
-   `content` (string).
-   `createdAt` (timestamp).

## 3. Application Routes & UI

### Public
-   `/`: Landing Page (Existing).
-   `/login`: Sign In / Sign Up form.

### Protected (Requires Auth)
*Wrapped in an `<AuthGuard>` component.*

-   `/dashboard` (Home):
    -   **Top**: "What's on your mind?" Input (Create Post).
    -   **Main**: Infinite scroll feed of all posts (newest first).
-   `/profile/[username]`:
    -   **Header**: User info, Avatar, Bio, Edit Profile button (if own profile).
    -   **Body**: List of posts by this user.
-   `/settings`:
    -   Form to update Name, Bio, Avatar.

## 4. Key Components
1.  **`AuthProvider`**: Context to manage global user state (`user`, `loading`, `profile`).
2.  **`AuthGuard`**: Redirects to `/login` if unauthenticated.
3.  **`PostComposer`**: Textarea + Submit button.
4.  **`PostCard`**: Displays Author info, content, timestamp, and interaction buttons.
5.  **`CommentSection`**: Collapsible list of comments under a post.

## 5. Security Rules (Firestore)
-   `users`: Readable by everyone. Writeable only by owner.
-   `posts`: Readable by everyone. Create by auth users. Update/Delete only by owner.
-   `comments`: Readable by everyone. Create by auth users.

## 6. Implementation Phases
1.  **Scaffold**: Setup Context, Auth Guard, and Routes.
2.  **Auth Integration**: Implement Login/Logout flow.
3.  **Database Wiring**: Create Firestore hooks/services.
4.  **Feature - Feed**: Post creation and listing.
5.  **Feature - Profiles**: User profile pages and editing.
