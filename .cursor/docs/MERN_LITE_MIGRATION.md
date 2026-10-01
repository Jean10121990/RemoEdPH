# RemoEdPH — MERN-lite migration (React + Express + MongoDB)

This document describes the **incremental** move from static HTML/JS to a React SPA, without breaking the live site.

## Layout

| Path | Role |
|------|------|
| `server/` | Existing Node/Express API + MongoDB (Mongoose). **Source of truth** for auth, credits, lessons, payments. |
| `public/` | Legacy HTML pages — **kept** until each flow is rebuilt in React. |
| `client/` | New Vite + React SPA (landing shell + shared components first). |

## Local development

1. **Backend** (serves `/api`, static `public/`, images):

   ```bash
   npm start
   ```

2. **React** (hot reload, proxies API + static assets):

   ```bash
   cd client && npm install && npm run dev
   ```

   Open **http://localhost:5173/app/** (the app uses `basename=/app`).

3. Create `client/.env` from `client/.env.example` so navbar/plan links reach the legacy app:

   ```
   VITE_LEGACY_BASE=http://localhost:8080
   ```

## Production URL

After `npm run client:build`, Express serves the SPA at **https://your-host/app/** (see `server/index.js`). Classic HTML remains at `/`, `/index.html`, etc., until you switch the default route.

## Security additions (server)

- **helmet** — HTTP hardening. `contentSecurityPolicy` is off for now so existing `public/*.html` inline scripts keep working during migration.
- **express-validator** — Lesson create/update routes validate IDs, lengths, and types.
- **isomorphic-dompurify** — `teacherNotes` sanitized before save (`server/utils/sanitizeHtml.js`).
- **Credit math** — Centralized in `server/services/studentCreditSummary.js`; `GET /api/student/credits` uses it so clients only display numbers.

## Converting more pages

For each legacy HTML file:

1. Add a route in `client/src/App.jsx`.
2. Move markup into `client/src/pages/...`.
3. Replace `fetch`/`XMLHttpRequest` with `client/src/api/http.js` (`axios` instance to `/api`).
4. Remove duplicated client-side business logic; call an API that uses Mongoose models only.

## Production (when ready)

- `cd client && npm run build`
- Serve `client/dist` from Express (similar to `application-form/dist`) **or** host the SPA on a CDN and keep API on the same domain for cookies/CORS.

## Preserving UI / brand

- React global styles live in `client/src/App.css` with the same tokens as the consolidated `public/style.css` `:root` and `landing-brand.css` (e.g. `--remo-blue`, `--main-radius: 20px`).
- Reuse `<Guide character="ed|remo|sophia" />` for mascot placement.
