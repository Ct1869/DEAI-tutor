# DEAI Tutor

This is the MIT-licensed application source for a personal, self-hosted German
learning app. The license covers this repository's application code and
documentation; it does not cover textbooks, answer keys, or user data.

The app includes a guided Unit 1 tutor pilot with a separate learning database.
The original textbook, answer key, extracted text, personal history, and all
credentials must be provided privately by each authorized operator. They are
not part of this repository. The Unit 1 pilot uses newly authored practice
prompts and records source page references; it does not contain the PDFs.

## Local installation

Requirements: Node.js 20.9 or newer, npm, SQLite support through the bundled
`better-sqlite3` dependency, and Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`)
for PDF import. The source PDFs must be obtained lawfully by the operator.

1. Copy `.env.example` to `.env.local` and set unique values for `AUTH_PASS`,
   `SESSION_SECRET`, and `QUIZ_API_KEY`. Keep `.env.local` private.
2. Run `npm ci` and `npm run build`.
3. Start locally with `npm run start` (port 1222), behind HTTPS for remote use.
4. Store book files in `private/books/<book-id>/` using the app's authenticated
   upload flow, or place your own lawful copies there with owner-only permissions.
   The Unit 1 pilot currently expects `private/books/4/book.pdf` and
   `private/books/4/answers.pdf` matching the reviewed source hashes.
5. Back up `data.db*`, `private/`, and `.env.local` outside Git. Restore them
   only on the operator's private host. Do not seed from another person's data.

On a new installation, the app initializes `data.db` on first use. The tutor
pilot initializes its own `private/pilot-learning.db` when used. No database
or book file is shipped in this source release. The pilot is unavailable until
the matching private PDFs are present.

## Remote self-hosting

Run the Node process as a non-root account. Put a TLS reverse proxy in front
of port 1222 and restrict direct access to that port. Keep `private/`, databases,
and `.env.local` readable only by the app account. Set `APP_URL` to the HTTPS
origin. Configure process supervision and backups for your own host; do not
copy production credentials or databases into a public repository or image.

## AI status

This source release deliberately disables the legacy connector that read Codex
credentials and called an unsupported ChatGPT endpoint. It does not yet
implement Sign in with ChatGPT. Deterministic tutor activities and review
scheduling can run; free-form AI grading and conversation cannot. The planned
integration will use the official SIWC PKCE flow and Responses API only after
eligibility and repository publication are approved.

See `PILOT_ENGINE.md` for current pilot capabilities and limits.
