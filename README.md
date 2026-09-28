# VK Quiz App

VK Quiz is a Next.js 16 quiz app with organizer and participant screens, Prisma + SQLite persistence, and cookie-based organizer auth.

The existing quiz UI was intentionally preserved. Organizer auth, quiz management, participant join/play flow, and leaderboards now use real database-backed API routes. The participant frontend only keeps `participantId`, `sessionId`, and `roomCode` in `sessionStorage` for navigation recovery.

## Tech Stack

- Next.js 16 App Router
- React 19
- Prisma ORM
- SQLite
- bcryptjs for password hashing

## Environment

Create a `.env` file from `.env.example` if you need to recreate it:

```bash
cp .env.example .env
```

Required variables:

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="change-me-before-production"
```

The SQLite database file is created at `prisma/dev.db`.

## Install And Run

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Open `http://localhost:3000`.

Development and production now use the custom Node.js server in [server.mjs](./server.mjs) so Next.js and Socket.IO share the same HTTP server:

```bash
npm run dev
npm run build
npm run start
```

## Prisma Workflow

Generate the Prisma client:

```bash
npx prisma generate
```

Create a new migration while editing the schema:

```bash
npm run prisma:migrate -- --name your_migration_name
```

Apply checked-in migrations:

```bash
npx prisma migrate deploy
```

## Database Schema

The Prisma schema includes:

- `User`
- `Quiz`
- `Question`
- `Option`
- `QuizSession`
- `Participant`
- `Answer`

The initial migration is checked in under `prisma/migrations/20260729190000_init/`.

## API Routes

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Quiz routes:

- `GET /api/quizzes`
- `POST /api/quizzes`
- `GET /api/quizzes/[id]`
- `PATCH /api/quizzes/[id]`
- `DELETE /api/quizzes/[id]`
- `GET /api/quizzes/room/[roomCode]`

Session routes:

- `POST /api/sessions`
- `GET /api/sessions/room/[roomCode]`
- `PATCH /api/sessions/[id]`
- `POST /api/sessions/[id]/join`
- `GET /api/sessions/[id]/participants`
- `POST /api/sessions/[id]/answers`
- `GET /api/sessions/[id]/leaderboard`

## Auth Notes

- Passwords are hashed with `bcryptjs`.
- Successful login and registration set an `httpOnly` session cookie.
- Organizer quiz routes require that cookie.

## Real-Time Architecture

- [server.mjs](./server.mjs) starts Next.js 16 and attaches Socket.IO to the same Node.js HTTP server.
- [socket-server.mjs](./socket-server.mjs) validates organizer, participant, and leaderboard subscriptions before joining rooms.
- [src/lib/socket/server.ts](./src/lib/socket/server.ts) is the reusable server-side emit layer used by API routes after successful Prisma/database mutations.
- [src/lib/socket/client.ts](./src/lib/socket/client.ts) is the reusable client singleton used by organizer, participant, and leaderboard pages.
- Prisma and the existing API routes remain the source of truth. Socket events only notify clients after successful database updates.
- Pages still do a normal fetch on first load and after reconnect so refreshes restore the current state from SQLite even without an active socket connection.

## Socket Events

The app uses room-based events keyed by `sessionId` and a separate organizer room for organizer-only events:

- `participant:join`
- `participant:list-updated`
- `quiz:started`
- `quiz:question-changed`
- `quiz:finished`
- `answer:submitted`
- `leaderboard:updated`

Current behavior:

- Participant joins immediately update organizer participant counts.
- Starting a quiz emits `quiz:started`.
- Changing the current question emits `quiz:question-changed`.
- Finishing a quiz emits `quiz:finished`.
- Answer submissions emit `answer:submitted` to the organizer room and `leaderboard:updated` to all session subscribers.

## Participant Flow Notes

- Participants join with a real `QuizSession` room code.
- Answers are validated and scored on the backend inside the existing transaction.
- Correct answers are not exposed to participants before submission.
- Leaderboards are loaded from the database and persist after refresh.
- WebSocket is only the real-time notification layer; it does not replace database persistence.

## Manual Test Flow

Use one normal browser window for the organizer and one private/incognito window for the participant:

1. Organizer window:
   - Open `/organizer`
   - Register a new organizer account or log in
   - Create a quiz from `/organizer/dashboard/create`
   - Open the quiz from `/organizer/dashboard/quiz/[id]`
   - Click the start button and note the room code
2. Participant window:
   - Open `/join`
   - Enter a name and the organizer room code
   - Verify that the organizer participant count updates immediately
   - Verify that `/play/[roomCode]` loads and switches automatically as the organizer moves through the session
   - Submit an answer and confirm the organizer leaderboard updates immediately
3. Organizer window:
   - Move to the next question and verify the participant view changes instantly without a refresh
   - Finish the quiz and verify the participant sees the final result screen instantly
4. Participant window:
   - Confirm the final score screen appears automatically
   - Open `/leaderboard/[roomCode]` and verify ordering by score and correct answer count
   - Leave the leaderboard open and verify new answer results appear live before the quiz finishes
5. Refresh check:
   - Refresh both organizer and participant windows during an active or finished session
   - Verify that the current session state, score, participants, and leaderboard restore from the database
6. Organizer window:
   - Delete a quiz from the dashboard
   - Log out and confirm organizer pages redirect back to `/organizer`

## Verification

Recommended commands:

```bash
npx prisma format
npx prisma generate
npx prisma migrate status
npm run typecheck
npm run lint
npm run build
```

On Windows, `npx prisma generate` can fail if `node_modules/.prisma/client/query_engine-windows.dll.node` is locked by another running process. If that happens, stop the process that is holding the file and rerun the command.
