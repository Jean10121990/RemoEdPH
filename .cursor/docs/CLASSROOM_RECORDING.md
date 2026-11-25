# Classroom QA recording (admin monitoring)

## Purpose

Low-quality **lesson monitoring** clips (~25 min max) so QA/admin can review teaching quality and technical issues. **Only admins** list, download, or delete recordings from **Admin → Lesson recordings**.

## How it works

1. **Teacher Start** is gated until the **student remote video/audio is live**.
2. **Client-side `MediaRecorder`** encodes a **480p canvas copy** of the classroom tab (`getDisplayMedia`, then scaled to max height 480 at 8 fps) as **WebM (VP8 + Opus)**. The original capture is not scaled: a cropped clone of that full tab is still what the student sees.
3. A **cloned, region-cropped** track is still published to the student for the **slide/presentation share** (prev/next sync unchanged). The QA file is the 480p canvas, not that full-size tab.
4. The browser uploads **480p chunks** (~10s, about 350 kbps video) via `PUT` while the class is still going, so the file is usually ready within a minute after recording stops. Chunks are a normal upload, not a keepalive request (those are capped around 64 KB and were dropping every piece, which left QA Hub on “Uploading · 0 B”). If the tab closes after video has arrived, the server assembles it after a few quiet minutes. A session that never received video is marked failed after 30 minutes instead of staying on Uploading.
5. The server appends chunks to one file under `uploads/classroom-recordings/`.
6. Each row has **`expiresAt`** based on **`CLASSROOM_RECORDING_RETENTION_DAYS`** (default **7** = one week; set **`3`** for three days). An **automated purge** (default **every 7 days**, not daily) deletes rows/files whose `expiresAt` has passed. Admins can still **Purge expired** anytime from the admin UI.

## Performance impact on live class

- **WebRTC (audio/video)** stays on its existing peer connection; we **do not** add a second encode of the camera for sending.
- **Cost**: one **encode** for monitoring (CPU) + **periodic uploads** (network). The QA file is 480p at about 350 kbps video and 32 kbps audio, so a 25-minute class stays small enough to upload and for QA Hub to download. After upload, ffmpeg stores an MP4 capped at 480p and 450 kbps.
- **Recommendation**: enable only when needed (`CLASSROOM_QA_RECORDING_ENABLED=true`), or use query flag `?qaRecord=1` for spot checks.

## Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `CLASSROOM_QA_RECORDING_ENABLED` | **on** | Set to **`false`** to hide QA recording in `live-classroom.html` (still can force with `?qaRecord=1`) |
| `CLASSROOM_QA_RECORDING_MAX_MINUTES` | `25` | Shown as the usual class length. The recorder does **not** stop itself. The teacher clicks **Stop**, the classroom tab stays open, then they click **Finish**. |
| `CLASSROOM_RECORDING_RETENTION_DAYS` | `7` | `expiresAt` = now + N days (**`3`** = three days, **`7`** = one week) |
| `CLASSROOM_RECORDING_PURGE_INTERVAL_DAYS` | `7` | How often the server runs the expired-file cleanup (**not** daily; default weekly) |
| `CLASSROOM_RECORDING_MAX_MB` | `120` | Per-file upload cap |

## API (summary)

- `GET /api/classroom-recording/config` — public; feature flags.
- `POST /api/classroom-recording/session` — teacher or student JWT; starts session.
- `PUT /api/classroom-recording/session/:id/chunk` — raw body; append chunk.
- `POST /api/classroom-recording/session/:id/complete` — finalize metadata. The checkpoint average already on the row is marked final. This does not wait for another score.
- `POST /api/classroom-recording/session/:id/qa-checkpoint` — teacher JWT that owns the upload, while the row is uploading. One JPEG, a short audio clip, camera on/off, and the elapsed time. Samples are not stored. At most once per 30 seconds.
- `GET /api/classroom-recording/my-scores` — teacher JWT. Totals are the sum of the 10 category scores. Each finished class on the teacher schedule can open this score. `videoAvailable` is true only while the file is still inside the retention window.
- `POST /api/classroom-recording/:id/preview-ticket` — teacher JWT, own recording only, and only while the video has not been purged.
- `GET /api/classroom-recording/:id/preview?ticket=` — plays that video inline. The ticket lasts 2 minutes.
- After `expiresAt` (default 7 days) the purge deletes the video and keeps the score row. Teachers can still open the score. An admin Delete still removes the score with the row.
- `GET /api/admin/classroom-recordings?date=YYYY-MM-DD` — admin JWT. Each row includes the score total and whether a critical flag is open.
- `GET /api/admin/classroom-recordings/:id/qa` — admin JWT, `qa:recordings_view`. Full breakdown.
- `PATCH /api/admin/classroom-recordings/:id/qa` — admin JWT, `qa:analyzer_review`. Reviewer scores and flag status. The server recomputes the total.
- `POST /api/admin/classroom-recordings/:id/qa/reanalyze` — admin JWT, `qa:analyzer_review`. Reads the saved MP4. If a reviewer already saved, the body must send `force: true`.
- `GET /api/admin/classroom-recordings/:id/download` — admin JWT.
- `DELETE /api/admin/classroom-recordings/:id` — admin JWT. Deletes the score with the file.
- `POST /api/admin/classroom-recordings/purge-expired` — admin JWT.

The Lesson recordings table shows the running score and an info breakdown (10 categories, critical flags, seek links once the file is MP4). `GEMINI_API_KEY` scores the slices. Without it, camera-off still flags and the total stays unscored.

## Future (optional)

- Canvas composite of tiles if tab capture is unavailable (higher CPU).
- Dedicated **worker** tab for recording to isolate main thread (if profiling shows jank).
