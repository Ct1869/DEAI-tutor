# Self-hosting guide

This guide installs the source release on a VM. It has no licensed AI
provider yet and ships no textbook, answer key, or learning history.

## Requirements

- Node.js 20.9 or newer and npm.
- Poppler tools (`pdfinfo`, `pdftotext`, `pdftoppm`) for PDF import.
- An HTTPS reverse proxy; only the proxy should reach the app's port 1222.
- A dedicated, unprivileged account that owns the app and its private data.

## Install

1. Copy the approved source repository to a dedicated directory. Do not copy
   the unrelated parent repository or any old Git history.
2. From the app directory, run `npm ci`, then `npm test` and `npm run build`.
   One extraction test is skipped when the private PDFs are absent.
3. Copy `.env.example` to `.env.local`. Set a unique username, long password,
   independent API key, and a random `SESSION_SECRET` of at least 32 bytes.
   Set `APP_URL` to your HTTPS origin. Keep `.env.local` readable only by the
   app account. The app refuses production sessions without `SESSION_SECRET`.
4. Create `private/books/` with owner-only access. Copy only books you are
   licensed to use, or upload them through the authenticated app. The Unit 1
   pilot expects its reviewed original PDFs at `private/books/4/book.pdf` and
   `private/books/4/answers.pdf`; it checks their SHA-256 hashes before use.
5. Start `npm run start` as the app account. Supervise the process with your
   preferred service manager, using this directory as its working directory.
   Never put secrets in service command-line arguments.
6. Configure your HTTPS proxy to forward to `127.0.0.1:1222`, set the correct
   host and forwarded-protocol headers, and restrict direct access to 1222.
   Apply login rate limiting at the proxy. Check that unauthenticated requests
   cannot access private pages or API routes.

## Data and backups

The legacy app creates `data.db` and possible WAL/SHM companions in the app
working directory. The tutor pilot creates `private/pilot-learning.db` unless
`TUTOR_DB_PATH` names another private location. Back up databases consistently,
including live WAL state, and back up private PDFs and `.env.local` separately.
Never add these files to Git, deployment images, logs, or public storage.
Keep their permissions restricted to the app account.

The source-only repository contains no production database, account, or book.
Moving an existing installation requires a separate, private data migration;
publishing this source candidate does not move or reset the existing website.
