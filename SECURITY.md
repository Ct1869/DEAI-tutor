# Private data boundary

Never commit `.env.local`, `private/`, textbooks, answer keys, extracted text,
learning databases, credential files, backups, or build artifacts. This source
repository intentionally contains no original textbook PDF or answer-key file.

Before publishing a future repository, inspect its staged paths with
`git diff --cached --name-only` and run a secret scanner over the complete new
repository history. Start from a new repository; do not import the unrelated
parent Git history. Keep backups outside the source checkout.

The existing production site and databases are separate from this repository.
The legacy Codex authentication connector is disabled here pending an official
Sign in with ChatGPT implementation. Do not copy Codex or ChatGPT session files
into this app.
