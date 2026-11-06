# Unit 1 tutor pilot

This source release disables the legacy ChatGPT connector and contains no private
PDFs. Source-dependent extraction checks run only when the operator supplies
the matching PDFs in private storage. Official SIWC integration is pending.

## Source boundary

The only curriculum sources are `private/books/4/book.pdf` and `private/books/4/answers.pdf`. The first pilot unit is printed pages 10–13 (PDF pages 11–14); solutions are printed pages 265–266 (answer PDF pages 1–2). The content manifest stores SHA-256 hashes and exact page references. The old `data.db`, `book.txt`, `answers.txt`, quizzes, vocabulary and question histories are not read by the new engine.

The scanned PDFs have no useful embedded text on these pages. The generic ingestion pipeline renders each page, checks extraction quality, accepts a local OCR provider if available, and blocks promotion when text is missing. A source analysis provider may propose objectives, activities and rubrics, but output is only a draft. Schema validation checks page inventory, IDs, exercise references, answer-page references and unmapped answers. Human page and solution review is required before publication. Unit 1 is a reviewed seed entered from direct visual examination of the original pages. No other unit has been processed.

The reviewed seed covers the ten numbered exercises. Exercise 3 item 1 has no explicit numbered solution in the key, and Exercise 4 gives corrected whole emails rather than a numbered error list. Those publisher mappings remain flagged for manual inspection; the pilot's exact-graded prompts are newly authored examples grounded in the unit rules, not claimed transcriptions of missing key entries.

## Reusable flow

`tutor-engine/ingestion.ts` takes arbitrary PDF page ranges and interchangeable OCR and source-analysis providers. `types.ts` defines unit, objective, activity, source, evidence, attempt and review records. `quality.ts` checks source identity and manifest integrity. `engine.ts` plans sessions from an active unit plus a catalog of earlier verified units, puts due previous objectives first, gives one activity at a time, and changes teaching approach after errors. The same machinery can accept a future Unit 2 draft without code changes; a synthetic draft test demonstrates this without reading Unit 2.

The pilot route is `/tutor`. It uses `private/pilot-learning.db` by default, or `TUTOR_DB_PATH` for isolated testing. It never writes to the legacy learning tables. The homepage links to the pilot. A 15, 30, 45 or 60 minute session walks through diagnostic, teaching, guided work, recall, application, writing and speaking where those activities exist. It reports textbook coverage, practice completion, demonstrated mastery and delayed retention separately.

## Mastery and review rules

Every response is stored with its activity, objective, mode, assistance flag, grading method and confidence. A correct guided answer is not independent mastery. Free writing and spoken transcripts are saved as pending when no validated model is available. No pronunciation score is inferred from a transcript. Independent recall and application are separate evidence. A delayed retention prompt uses a different sentence. A failed check increases lapse count and reopens the objective.

The pilot uses a conservative SM-2 baseline: first independent success schedules one day, second schedules three days, later intervals depend on ease; a failure schedules a near-term retry. This is a provisional scheduler, not FSRS and not calibrated for this learner. The planner caps due reviews to about 40% of a session so missed days cannot consume the whole budget. A cumulative catalog lets old objectives appear before current-unit work.

## AI and voice status

The product goal is a model-directed tutor for explanation, free-form assessment, diagnosis, new examples and dialogue. `TutorProvider` is the provider contract. `OllamaProvider` and `OllamaVisionSourceProvider` are **unvalidated local adapters**. They are not enabled for grading unless `TUTOR_AI_VALIDATED=1` is set after an end-to-end test with a suitable local model. No model is installed on this host. No paid service or legacy Codex authentication is used by the pilot.

Officially supported future options include [OpenAI Realtime or chained voice agents](https://developers.openai.com/api/docs/guides/voice-agents) and [Google Gemini Live](https://ai.google.dev/gemini-api/docs/live-api). These require separate account eligibility, credentials and possible usage charges, so they are not enabled. [Ollama's official API](https://github.com/ollama/ollama/blob/main/docs/api.md) supports a local chat endpoint and JSON responses. Browser speech output and speech recognition are available only where the browser supports them; recognition may use a remote browser service. Neither constitutes sound-level pronunciation assessment.

Original publisher audio is absent. The Unit 1 reference to “Sprechtraining 2” remains an unavailable original-media dependency. Cornelsen lists audio for first-edition ISBN 978-3-06-021482-2 via its [publisher materials](https://www.cornelsen.de/_Resources/Persistent/b/c/5/5/bc55ee5dd57146c8044535039cdb22efa380c9d0/grammatik_aktiv_bestandteile_mit_isbn_international.pdf). New browser-spoken prompts are explicitly generated practice, not the publisher recording.

## Verified and limited

| Capability | Status |
| --- | --- |
| Unit 1 page and answer-key review | Done for the pilot pages; content is a reviewed seed |
| One-step guided session and persistence | Implemented and locally smoke-tested |
| Exact grading of constrained prompts | Implemented; valid free variants may need human or model review |
| Assistance-aware evidence and delayed schedule | Implemented with provisional SM-2 baseline |
| Cumulative planning across verified units | Implemented and tested with a synthetic previous unit |
| Automated ingestion of scanned pages | Blocks without OCR or reviewed transcription |
| Automated generation of a publishable curriculum | Draft interface only; no validated local model or human review workflow yet |
| Free-form AI tutor and naturalness grading | Unavailable on this host; adapter is unvalidated |
| Live conversation and pronunciation feedback | Unavailable; browser microphone can provide a transcript only |
| Original publisher listening activity | Unavailable until authorized audio is supplied |

## Checks

`npm test` and `npm run build` pass in this source-only repository. One extraction test skips when the private PDFs are absent. The local HTTP smoke test in `scripts/pilot-smoke.mjs` was run against the original private deployment, not this source-only copy. The old Codex-auth test was removed with the unsupported connector.
