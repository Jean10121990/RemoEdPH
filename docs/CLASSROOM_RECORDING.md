# Classroom QA recording (admin monitoring)

## Purpose

Low-quality **lesson monitoring** clips (~25 min max) so QA/admin can review teaching quality and technical issues. **Only admins** list, download, or delete recordings from **Admin → Lesson recordings**.

## How it works

1. **Client-side `MediaRecorder`** encodes the **remote** peer’s `MediaStream` (what you see/hear from the other person) as **WebM (VP8 + Opus)** at a **low bitrate** — not server-side SFU recording.
2. The browser uploads **chunks** (~20s) via `PUT` so memory stays bounded.
3. The server appends chunks to one file under `uploads/classroom-recordings/`.
4. Each row has **`expiresAt`** based on **`CLASSROOM_RECORDING_RETENTION_DAYS`** (default **7** = one week; set **`3`** for three days). An **automated purge** (default **every 7 days**, not daily) deletes rows/files whose `expiresAt` has passed. Admins can still **Purge expired** anytime from the admin UI.

## Performance impact on live class

- **WebRTC (audio/video)** stays on its existing peer connection; we **do not** add a second encode of the camera for sending.
- **Cost**: one **encode** for monitoring (CPU) + **periodic uploads** (network). Keeping bitrate low (~250–300 kbps video + ~48 kbps audio) limits impact.
- **Recommendation**: enable only when needed (`CLASSROOM_QA_RECORDING_ENABLED=true`), or use query flag `?qaRecord=1` for spot checks.

## Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `CLASSROOM_QA_RECORDING_ENABLED` | **on** | Set to **`false`** to hide QA recording in `live-classroom.html` (still can force with `?qaRecord=1`) |
| `CLASSROOM_QA_RECORDING_MAX_MINUTES` | `25` | Auto-stop recording |
| `CLASSROOM_RECORDING_RETENTION_DAYS` | `7` | `expiresAt` = now + N days (**`3`** = three days, **`7`** = one week) |
| `CLASSROOM_RECORDING_PURGE_INTERVAL_DAYS` | `7` | How often the server runs the expired-file cleanup (**not** daily; default weekly) |
| `CLASSROOM_RECORDING_MAX_MB` | `120` | Per-file upload cap |

## API (summary)

- `GET /api/classroom-recording/config` — public; feature flags.
- `POST /api/classroom-recording/session` — teacher or student JWT; starts session.
- `PUT /api/classroom-recording/session/:id/chunk` — raw body; append chunk.
- `POST /api/classroom-recording/session/:id/complete` — finalize metadata.
- `GET /api/admin/classroom-recordings?date=YYYY-MM-DD` — admin JWT.
- `GET /api/admin/classroom-recordings/:id/download` — admin JWT.
- `DELETE /api/admin/classroom-recordings/:id` — admin JWT.
- `POST /api/admin/classroom-recordings/purge-expired` — admin JWT.

## Future (optional)

- Composite **slides + camera** (higher CPU — phase 2).
- Dedicated **worker** tab for recording to isolate main thread (if profiling shows jank).
