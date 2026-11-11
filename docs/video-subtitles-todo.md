# Video transcription, translation, and subtitles — development checklist

## Goal

Users upload a video or paste a supported video URL, extract spoken dialogue, translate it into a selected language, review the result, and download subtitles.

Pipeline: video input → audio extraction → timestamped transcription → AI translation → subtitle preview/editing → export.

This is an implementation plan; the feature is not implemented yet.

## 1. Resolve dependencies and define the first release

- [ ] Verify the supplied AI API's response format, prompt limits, supported translation languages, timeout behavior, rate limits, and error responses.
- [ ] Verify whether the API accepts audio and returns timed transcription. The supplied `{ "prompt": "Hello!" }` example establishes only a text request; it does not establish speech recognition support.
- [ ] If needed, select a separate multilingual speech-to-text service or model that returns segment/word timestamps and detected language. Benchmark before choosing it.
- [ ] Define separate source-language and translation-language capability lists. Offer every validated language, with clear feedback for unsupported combinations; do not promise universal language coverage without verification.
- [ ] Define supported input formats, upload size, video duration, concurrency, retention period, and processing budget.
- [ ] Scope URL support initially to YouTube and direct public video files; show an explicit error for unsupported platforms, private links, playlists, or live streams. Extend providers later.
- [ ] First release: original transcript, one selected translation language, editable subtitle preview, SRT/VTT subtitle downloads, and TXT transcript download.
- [ ] Later release: multiple translation tracks, speaker labels, bilingual subtitles, embedded tracks, and video exports with burned-in subtitles.

## 2. Integrate the supplied translation API

- [ ] Add server-only `THUN_AI_API_URL` and `THUN_AI_API_KEY` configuration; document placeholders in `.env.example`.
- [ ] Use `POST https://ai-thun-murex.vercel.app/api/chat`, `Authorization: Bearer <server secret>`, and JSON `{ "prompt": "..." }` from server code only.
- [ ] Replace the credential shared in chat before production use. Do not put it in source code, browser bundles, examples, logs, or this document.
- [ ] Create a dedicated translation client, separate from form-answer generation in `src/aiGenerator.ts`.
- [ ] Parse the verified response schema; handle authentication failures, invalid responses, rate limits, and timeouts explicitly.
- [ ] Translate batches of cues with stable IDs and nearby context. Require structured output containing exactly the requested IDs and translated text.
- [ ] Treat transcript contents as data in the prompt. Preserve names, numbers, meaning, and punctuation; prohibit added commentary or invented speech.
- [ ] Keep timing under application control. Validate missing/duplicate IDs, empty translations, and malformed output; retry only failed batches with bounded retries and backoff.
- [ ] Preserve the original transcript so users can retry translation or choose another language without retranscribing audio.

## 3. Build durable jobs and media input

- [ ] Introduce a dedicated subtitle job model with owner, input reference, source/target languages, stage, progress, error, cues, output references, timestamps, and expiry.
- [ ] Store job state durably and execute work through a queue/worker that supports long video processing. The current `src/store.ts` uses process-local maps, so it is not sufficient for durable subtitle jobs.
- [ ] Add authenticated upload/job-creation, status, cancel, cue-update, translation-retry, and export endpoints under `/api/subtitles`.
- [ ] Use private object storage and signed upload/download URLs for large files; verify deployment upload, memory, execution, and storage limits before setting product limits.
- [ ] Check job ownership on every read, edit, retry, cancel, and download request.
- [ ] Validate input before charging: actual media type, size, duration, readable streams, and presence of audio. Handle silent videos with a clear result.
- [ ] Reuse/refactor the media subprocess patterns from `app/api/video-convert/route.ts` and the YouTube downloader from `app/api/youtube/download/route.ts`.
- [ ] Validate URL protocols, provider hosts, redirects, and resolved addresses; block private/local network targets and enforce download size/time limits.
- [ ] Use isolated temporary directories and subprocess argument arrays, with timeouts, cancellation, and cleanup on every exit path.
- [ ] Make worker stages restartable and job submission idempotent so retries do not duplicate processing or billing.

## 4. Extract audio and transcribe speech

- [ ] Inspect media with FFprobe and use FFmpeg to extract audio in the transcription provider's required format.
- [ ] Split long audio into bounded chunks with a strategy for overlap and boundary deduplication. Retain each chunk's original time offset.
- [ ] Support automatic source-language detection and a manual override; flag uncertain detection and mixed-language content for review.
- [ ] Convert provider output into canonical cues: `{ id, startMs, endMs, sourceText, translatedText? }`.
- [ ] Apply chunk offsets and validate that times are ordered, nonnegative, within video duration, and have `endMs > startMs`.
- [ ] Preserve silence gaps, deduplicate overlap text, and flag low-confidence segments when the provider supplies confidence information.
- [ ] Ensure speech-free sections do not become invented dialogue; let users correct transcription before translation.

## 5. Generate readable subtitles

- [ ] Build cues from speech timestamps; do not ask a text translation model to invent synchronization.
- [ ] Implement language-aware line wrapping, cue length, reading-speed targets, minimum display duration, and overlap checks.
- [ ] Keep translated text aligned to source cue IDs. If text must be split or reflowed, derive timing from available word/segment boundaries and flag compromises for review.
- [ ] Export UTF-8 SRT and WebVTT with correct numbering, escaping, timestamp syntax, and multiline text.
- [ ] Preserve Unicode for Khmer, CJK scripts, accented text, and right-to-left languages. Verify browser rendering and editing for each supported script.
- [ ] Generate TXT from the selected transcript/translation track, and use safe filenames containing the output language.

## 6. Add the user interface

- [ ] Add a “Video Subtitles” tool to the tab registry and rendering in `app/app/page.tsx`; put the new feature UI in its own component.
- [ ] Provide upload/drop input and a URL input, with supported sources and limits visible before submission.
- [ ] Add source language (“Auto detect” default), target language, and an original-language-only option.
- [ ] Show video metadata and a credit estimate before the user starts processing.
- [ ] Display progress by stage: uploading/downloading, extracting audio, transcribing, translating, and generating subtitles.
- [ ] Support cancellation and resuming job status after navigation or refresh.
- [ ] Provide a synchronized video preview with switchable original/translated tracks and an editable cue list for text and timing.
- [ ] Provide TXT, SRT, and VTT downloads; regenerate exports after edits.
- [ ] Show actionable errors for no audio, unsupported language/link, expired files, insufficient credits, and provider failures.

## 7. Credits, privacy, and deployment

- [ ] Add a subtitle credit kind and pricing rule in `src/credits.ts`; determine pricing from measured transcription/translation cost and media duration.
- [ ] Reserve/deduct credits atomically per job after validation. Make final charges/refunds idempotent and define partial-failure/cancellation policy.
- [ ] Adapt billing for workers using the verified job owner; `spendCredits` currently obtains the user from request-session context.
- [ ] Explain that audio/transcripts are sent to configured AI providers, and define automatic media/output expiry plus a user deletion action.
- [ ] Ensure signed URLs expire and logs exclude API keys, private media URLs, and transcript content by default.
- [ ] Provision worker dependencies, private storage, queue, secrets, multilingual fonts where needed, and scheduled cleanup of expired jobs/files.
- [ ] Monitor stage duration, failures, retries, provider usage, and cost per processed minute.

## 8. Verify before release

- [ ] Test upload and supported URL workflows from input through downloaded subtitles and transcript.
- [ ] Evaluate real speech samples in each launch language, including Khmer, English, CJK, and a right-to-left language; publish only validated capabilities.
- [ ] Test noisy audio, silence, long pauses, mixed-language speech, overlapping speakers, and long videos crossing chunk boundaries.
- [ ] Check subtitle synchronization at the start, middle, end, and chunk boundaries; import exports into an independent subtitle player/editor.
- [ ] Test malformed AI responses, rate limits, timeouts, worker restarts, cancellation, and translation-only retries.
- [ ] Test owner isolation, hostile URLs, oversized/corrupt media, expiry cleanup, and duplicate requests without double charges/refunds.
- [ ] Run TypeScript checks, the production build, and targeted tests for cue timing, chunk stitching, export formats, and job/billing transitions.

## First-release acceptance criteria

- An authenticated user can submit a supported upload or URL and obtain a timestamped transcript.
- The user can generate a translation in any validated target language, while keeping source text and cue alignment.
- The user can preview, edit, and download synchronized SRT/VTT subtitles and a TXT transcript.
- Job progress survives refresh; failures and cancellation follow the documented credit policy.
- Secrets remain server-side, users access only their own jobs, and retained files are deleted on schedule.
