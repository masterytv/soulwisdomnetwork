# Spec 004: Member Directory & Messaging

## Goal
Enable members to find each other and communicate privately.

## 1. Member Directory (`/members`)
- **UI**: A grid or list of user cards.
- **Card Content**: Avatar, Display Name, Bio snippet, "Message" button.
- **Search**: Basic filter by name.

## 2. Messaging System (`/messages`)
A real-time Direct Messaging (DM) system.

### Data Model (Firestore)

#### `conversations` (Collection)
- `id`: Unique ID (often a hash of sorted participant UIDs for 1v1).
- `participants`: Array of UIDs.
- `lastMessage`: String (for preview).
- `lastMessageTimestamp`: Timestamp.
- `updatedAt`: Timestamp (for sorting conversation list).

#### `messages` (Collection)
- `id`: Auto-ID.
- `conversationId`: String (foreign key).
- `senderId`: String.
- `content`: String.
- `createdAt`: Timestamp.

### UI Structure
- **Sidebar**: List of active conversations.
- **Main Chat**: Scrollable message history + Input area.

## 3. Routes
- `/members`: Publicly accessible (to members) directory.
- `/messages`: Inbox.
- `/messages/[conversationId]`: Specific chat.

## 4. Implementation Steps
1. **Directory Page**: Fetch and list all users from `users` collection.
2. **DM Infrastructure**: 
   - Logic to find/create a conversation ID between two users.
   - Messenger layout.
3. **Chat Logic**: 
   - Real-time listener for `messages` where `conversationId == current`.
   - Function to send messages and update `conversations` metadata.
