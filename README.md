# ShikshakG admin console

Staff console for the ShikshakG backend. It is a separate app from the student website (`../ShikshakG_frontend`) so staff
screens are never downloaded by students. Same backend, same light-blue palette, its own Cloudflare deploy.
Desktop first, usable on a tablet, not designed for phones.

## Status

| Phase | What | State |
|---|---|---|
| A0 | Shell, staff sign-in, role-aware menu, table / form / dialog kit | Done |
| A1 | Exam dates: add, edit draft, publish, correct, recheck, retire, stale queue | Done, with the catalog editor: categories, exams, stages, syllabus per stage (weightages, order, shown-as names), the subject and topic tree, prerequisites, and blueprint versions |
| A2 | Question bank, keyboard review queue, student reports, pools and aliases | Done. Question history and a staff action log viewer need backend routes that do not exist yet |
| A3 | JSON imports and PDF extraction review | Done. Tested end to end with a generated PDF: upload, review beside the page, import, publish |
| A4 | Papers and tests | Done. A paper becomes a published test a student can start; locked after first attempt, new version replaces it |
| A5 | Courses and video upload | Done. Build sections, chapters and lectures; upload an MP4, topics, notes and links; publish; a student can play a free lecture |
| A6 | Commerce (admin role only) | Done. Products and prices, orders, refunds, give and take away access. Refund processing is tested with faked server answers, because it moves real money |
| A7 | AI controls (admin role only) | Done for the all-exams policy (every setting, checked, with a change list before saving) and the questions-to-double-check list. Per-exam policies need the backend to expose exam ids |
| A8 | Users and roles, action log, announcements, current affairs, daily quiz | Done on sample data kept in the browser, because the backend has no routes for them. A banner on each screen says so. What the backend must build is in `docs/BACKEND_NEEDS.md` |

## Review queue keys

Open **Review queue** and clear it without the mouse: **A** approve and publish, **R** send back to draft with a note,
**X** reject with a note, **S** or the right arrow skip, **U** undo the last decision (also after the queue is empty),
**E** open the editor, **?** list the shortcuts. In a note box, **Enter** saves and **Esc** cancels. Every decision is
announced to screen readers. Questions without a topic cannot be published; the queue says so and links to the editor.

Two backend facts to know: the question list returns a preview, not the full question (the queue fetches the one on screen
and prefetches the next), and resolving a student report does not change the question, so the console sends a live
question back to review itself.

## From a PDF to published questions

1. **PDF extraction**: upload the PDF (a compilation book or one paper), pick its subject, and leave it. A worker reads each
   page; the document shows "Ready to review" when done.
2. **Open the document**: the original page is on the left with the question outlined, the extracted question on the right.
   Every automatic check that failed is listed in plain words; "Must fix" ones block approval. Fix text, answer, source
   and topic, then **Ctrl + Enter** to save and approve, or **X** to reject with a note (**J** / **K** move between questions).
3. **Import**: approved questions are sent to the question bank as questions waiting for review. The import runs in the
   background; follow it from the banner.
4. **Review queue**: publish them with **A**. Only then can students see them.

JSON imports follow the same last two steps. The importer matches records by their text, so uploading the same wording again
updates the existing question instead of creating a copy.

## Run it

The local backend must be up (`docker compose up` in `../shikshag_backend`, API on port 8020) and its
`CORS_ORIGINS` must include `http://localhost:3100`.

```bash
npm install
npm run dev          # http://localhost:3100
```

Environment (`.env.local`, see `.env.example`): `NEXT_PUBLIC_API_URL` (backend origin) and `NEXT_PUBLIC_APP_ENV`.

## Staff accounts

There is no public sign-up. An operator creates an account, and the person sets a password from the emailed link:

```bash
docker exec shikshag-api-1 python -m app.cli create-admin --email ops@example.com --full-name "Ops Admin"
docker exec shikshag-api-1 python -m app.cli create-admin --email editor@example.com --full-name "An Editor" --role content_editor
```

Locally the email provider prints the link in `docker logs shikshag-worker-1`.

Roles: **admin** sees everything; **content_editor** does not see Commerce, AI controls, or Users and roles, and is refused if
they open those addresses directly. The menu only hides things. The backend checks the role on every call, and a student
account is refused at sign-in and keeps no session.

## Build and check

```bash
npm run build        # next build, then fills the Content-Security-Policy into out/_headers
npm run serve        # serves out/ on port 3100 with the same headers Cloudflare sends
npm run e2e          # Playwright against the build and the local backend
```

The end-to-end suite covers student refusal, different menus for editor and admin, a full date lifecycle (draft, publish,
reaches a student, correct, replace, retire), the stale queue, and every screen at 768 and 1280 px for overflow, CSP
violations and accessibility (axe, WCAG 2.1 AA). Run `npx playwright install chromium` once first.

## Deploying

Cloudflare build command `npm run build`, output `out`. Set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_APP_ENV` as build variables.
The backend's `CORS_ORIGINS` must include this site's origin. Use its own project and domain, for example
`admin.shikshakg.com`.

## API types

`npm run api:pull` downloads the backend's OpenAPI file and `npm run api:types` regenerates `src/lib/api/schema.d.ts`.
Each app generates its own, so no shared package is needed.
