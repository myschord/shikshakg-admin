# What the backend still needs to build

The admin console is built against the backend that exists today, plus **five screens that run on sample data** because their routes do not exist yet. This file is the list of what the backend team (the owner) must create later. The routes below are proposals: the screens already follow them, and they can be changed freely before the backend starts. Changing one means editing `src/lib/api/a8.ts` (and `src/lib/mock/a8.ts`, which enforces the same rules in the browser).

When a route ships: set `NEXT_PUBLIC_USE_MOCKS=false` for the admin build, run `npm run api:pull && npm run api:types`, and replay `e2e/a8.spec.ts` against the real backend (the tests assume the sample seed, so they need a small seed script or edits).

Money amounts are decimal strings, times are ISO instants, dates are India calendar days (`YYYY-MM-DD`). Errors use the existing envelope `{error:{code,message,details,request_id}}`; the message is shown to the staff member as written, so write it in plain words. Every write below must record a staff action (`record_admin_action`) with `before` and `after`, because the Action log screen shows exactly those.

## Part 1. Features with a finished screen and no route

**Update, backend phase 17** (branch `phase/17-announcements-daily-quiz`, 2026-10-04): announcements (section 3) and the daily quiz (section 5) now exist on the server. The console still runs them on sample data until it is switched over. Where the real routes differ from what is written below, the real behaviour wins:

- announcements: a link must be an **app path** (`/exams/bpsc/tests`); `https://` is refused. A new status `sending` appears between scheduled and sent: "send now" answers `sending`, and `recipients` and `read_count` arrive once it is `sent`. Unknown fields in the body are refused. Only administrators may use the routes.
- daily quiz: the test must also be a **free preview** (`test_not_free`); swapping a day students have attempted is refused (`quiz_has_attempts`); list rows carry `test_status`; the student route answers 404 `no_daily_quiz` when none is set.

**Update, backend phase 18** (branch `phase/18-staff-operations`, 2026-10-04): users and roles (section 1), the action log (section 2) and the home numbers now exist on the server. The console still runs the first two on sample data. Where the real routes differ from the sample data, the real behaviour wins:

- **the blocked state is `suspended`**, not "disabled", and the status route accepts only `active` and `suspended` (409 `status_not_changeable` for anything else, including an unverified or anonymised account). User rows also carry `email_verified`. The list takes `q`, `role` and `status`.
- **errors:** `cannot_change_own_role`, `cannot_suspend_self`, `role_unchanged`, `status_unchanged`, `last_admin`, `account_anonymized`, `email_taken`, `user_not_found`; a reason is required (422 when blank).
- **the log:** filters are `actor_email`, `action_prefix`, `entity_type`, `entity_id`, `from`, `to` (India dates, both included); each entry has `at` (not a separate date and time) and `actor_email` is null for an operator command. Fill the "On" filter from `GET /admin/action-log/entity-types` instead of the fixed list: the real values include `exam_paper`, `pdf_document`, `pyq_pool`, `exam_blueprint` and have no `paper` or `current_affairs`. Values whose names look secret show as `[hidden]`.
- **the Today numbers:** `GET /admin/dashboard/stats` returns `students {active, joined_this_week, seen_this_week}`, `content {questions_in_review, open_reports, stale_exam_dates}` and `commerce {orders_this_week, revenue_this_week, refunds_waiting}` (null for editors).

| Screen | Who may use it | Status in the console |
|---|---|---|
| Users and roles | admin | Built on sample data |
| Action log | admin | Built on sample data (the data is already recorded by the backend; only a read route is missing) |
| Announcements | admin | Built on sample data |
| Current affairs | editor writes, admin publishes | Built on sample data |
| Daily quiz schedule | editor and admin | Built on sample data; the test picker already uses the real tests route |

### 1. Users and roles (admin only)

| Route | Purpose |
|---|---|
| `GET /admin/users?q&role&cursor&limit` | Search by name or email (case-insensitive substring), filter by role. Returns `Page<User>`. |
| `POST /admin/users/{id}/role` `{role, reason}` | Change role to `student`, `content_editor` or `admin`. |
| `POST /admin/users/{id}/status` `{status, reason}` | `active` or `disabled`. Disabling signs the person out (revoke refresh tokens). |
| `POST /admin/staff` `{email, full_name, role}` | Create a staff account and email an activation link (what `python -m app.cli create-admin` does today). `role` is `content_editor` or `admin`. |

`User` = `{id, email, full_name, role, status: "active"|"disabled", created_at, last_login_at|null}`.

Rules the screen expects the server to enforce (codes in brackets):
- `reason` is required, 1 to 200 characters (`reason_required`, 422).
- You cannot change your own role or disable yourself (`cannot_change_own_role`, `cannot_disable_self`, 409).
- The last active administrator cannot be demoted or disabled (`last_admin`, 409).
- Same role or status as now is refused (`role_unchanged`, `status_unchanged`, 409).
- A taken email on invite is refused (`email_taken`, 409).
- Audit actions: `users.role_changed`, `users.disabled`, `users.enabled`, `users.staff_invited`.

### 2. Action log (admin only)

`GET /admin/action-log?actor_email&action_prefix&entity_type&from&to&cursor&limit`, newest first.

`Entry` = `{id, at, actor_email, action, entity_type, entity_id, before: object|null, after: object|null}`.

Backend work: a read route over the existing audit table. Join the actor's email. `action_prefix` matches the start of `action` (for example `commerce` or `courses.`). Entity types the screen offers: `announcement, course, current_affairs, daily_quiz, entitlement, exam_event, lecture, paper, product, question, refund, test, user, ai_policy`. Add a type to `ENTITY_TYPES` in `ActionLogScreen.tsx` when the backend logs a new one. Never put secrets in `before` or `after`.

### 3. Announcements (admin only)

| Route | Purpose |
|---|---|
| `GET /admin/announcements?status&cursor&limit` | List, newest first. |
| `POST /admin/announcements` | Create. With `send_at` it is `scheduled`, otherwise `draft`. |
| `PATCH /admin/announcements/{id}` | Edit a draft or scheduled one (same body as create). |
| `POST /admin/announcements/{id}/send` | Send now. |
| `POST /admin/announcements/{id}/cancel` | Cancel a draft or scheduled one. |

`Announcement` = `{id, title, body, deep_link|null, exam_slug|null, send_push, status: "draft"|"scheduled"|"sent"|"cancelled", send_at|null, sent_at|null, recipients|null, read_count|null, created_at}`.

Behaviour: sending writes one **notification inbox row per recipient** (category `announcement`) and, when `send_push` is true, a push to those with the category on. `exam_slug` null means all students; otherwise students who follow that exam. A worker sends scheduled ones when `send_at` passes. This depends on the notification inbox in the website plan (`GET /notifications/inbox`, section 8 of `ShikshakG_frontend/docs/FRONTEND_PLAN.md`).

Rules: title 1 to 120 characters; body 1 to 1000; `deep_link` is a path starting with `/` or an `https://` address; `send_at` at least a minute ahead; sent or cancelled ones cannot be edited (`announcement_locked`, 409); a sent one cannot be cancelled (`announcement_sent`, 409). Audit: `announcements.created|updated|sent|cancelled`.

### 4. Current affairs

Staff routes (the student route is `GET /current-affairs?exam_slug&from&topic_id&importance&cursor`, already assumed by the website, ADR 001):

| Route | Purpose |
|---|---|
| `GET /admin/current-affairs?exam_slug&status&cursor&limit` | List. |
| `POST /admin/current-affairs` | Create as `draft`. |
| `PATCH /admin/current-affairs/{id}` | Edit a `draft` or `in_review` item. |
| `POST /admin/current-affairs/{id}/status` `{status, note}` | Move between states. |

`Item` = `{id, exam_slug, title, summary, source_name, source_url, published_on, importance: "low"|"medium"|"high", topic_ids: uuid[], status: "draft"|"in_review"|"published"|"retired", created_by, updated_at}`.

Allowed moves (same table as `CA_MOVES` in `src/lib/api/a8.ts`): `draft → in_review`; `in_review → published | draft`; `published → retired`; `retired → draft`. An invalid move is `invalid_transition` (409). **Publishing is admin only** (`permission_denied`, 403); editors write and send for review. Published items cannot be edited in place (`item_locked`, 409). Rules: title 1 to 200; summary 1 to 600; `source_url` starts with `https://`; `published_on` is not in the future; every `topic_id` belongs to the exam's syllabus. Audit: `current_affairs.created|updated|in_review|published|retired|draft`.

**Built (phase 19). The real routes differ from the sample data in these ways:**

- `importance` is a number, `1`, `2` or `3` (3 matters most), not `low|medium|high`.
- One item can be for several exams: send `exam_slugs` (1 to 10, no repeats), not `exam_slug`. The list route still filters by one `exam_slug`.
- The text is a `translations` array of `{language: "en"|"hi", headline, summary}`: English is required, Hindi optional, a language at most once. `headline` is 1 to 200, `summary` 1 to 600. There is no `title`.
- One optional `topic_id`, not `topic_ids`. It must be in the syllabus of one of the exams chosen (409 `topic_not_in_exam`; 404 `topic_not_found`). Unknown exam is 404 `exam_not_found`; a future `published_on` is 400 `published_on_in_future`.
- The body for create and edit is the same: `{exam_slugs, importance, source_name, source_url, published_on, topic_id?, translations}`. Unknown fields are refused (422).
- An item answers `{id, exam_slugs, importance, topic: {id, name}|null, source_name, source_url, published_on, status, translations[], created_by (email), published_at, updated_at}`.
- Publishing needs English text (409 `english_required`). The `note` on a move is optional.
- Student route `GET /current-affairs` needs a signed-in student, `exam_slug` is required, `from` is an India date (included), `importance` is exact. It answers `{items, next_cursor, has_more}`, newest news first, each item in the student's language when it has it, else English.

Open owner decision: who writes these every day (D4 in the plan). Built on the default: editors write and send for review, administrators publish and retire.

### 5. Daily quiz schedule

Staff routes (the student route is `GET /exams/{slug}/daily-quiz`, returning today's test id and whether the student attempted it):

| Route | Purpose |
|---|---|
| `GET /admin/exams/{slug}/daily-quizzes?from&to` | Days in the range that have a quiz: `[{date, test_id, test_title}]`. |
| `PUT /admin/exams/{slug}/daily-quizzes/{date}` `{test_id}` | Set or replace the quiz of a day. |
| `DELETE /admin/exams/{slug}/daily-quizzes/{date}` | Remove a future day's quiz. |

Rules: the test must be published and belong to the exam; a day in the past cannot be set (`date_in_past`); the same test cannot be the quiz of two days (`test_already_scheduled`, details name the other day); today's and earlier days cannot be removed (`date_locked`). The attempt runs through the normal test routes; the backend credits the streak (rule D2 in the plan). Audit: `daily_quiz.scheduled|cleared`.

### 6. AI tutor review (admin only, built in backend phase 20a, no console screen yet)

Students chat with an AI tutor on the website. Administrators can review conversations; the console needs a screen for it. Routes (all `/admin/ai/tutor`, administrators only, content editors get 403):

| Route | Purpose |
|---|---|
| `GET /sessions?flagged&thumbs_down&reviewed&exam_slug&limit&cursor` | Newest first. Row: `{id, user_email, exam_slug, title, message_count, blocked_replies, thumbs_down, created_at, reviewed_at, reviewed_by}`. `flagged=true` means a reply was refused by the safety checks. |
| `GET /sessions/{id}` | The row plus `messages: [{id, role, text, created_at, was_helpful}]`. Opening one is written to the action log (`ai_tutor.session_viewed`), so say so on the screen. |
| `POST /sessions/{id}/review` `{note?}` | Marks it read: `{id, reviewed_at, reviewed_by}` (`ai_tutor.session_reviewed`). |

Add `ai_tutor_session` to the action-log "On" filter (it comes from `GET /admin/action-log/entity-types`, so it appears once a conversation has been opened). The AI controls screen also gains four policy values: `tutor_free_daily_units` (0 makes the tutor paid-only), `tutor_exam_daily_units`, `tutor_max_output_tokens`, `tutor_history_messages`.

## Part 2. Smaller gaps found while building the console

### Closed by backend phase 15 (branch `phase/15-fixes-and-small-gaps`): the console still has to use them

| Was | Now | What the console changes |
|---|---|---|
| Commerce admin routes allowed editors | Admin only (403 `permission_denied` for editors) | Nothing; the menu already hides them. |
| No exam UUID for the AI policy | `exam_slug` accepted on `GET` and `PUT /admin/ai/policy`; the answer carries `exam_slug` | Offer a per-exam policy on the AI controls screen (an exam picker, "in force for: this exam / all exams"). |
| Admin test detail had no question list | `questions: [{position, question_id, section_id, status, preview, marks, negative_marks}]` on one test (null in the list) | Show the slots in the test view and let staff pick the slot to replace from it. |
| No lecture delete | `DELETE /admin/lectures/{id}`: draft or archived only, and only if no student has progress, notes or bookmarks (409 `lecture_published`, `lecture_has_student_data` with counts) | A "Delete lecture" button on the lecture page, with the two refusals explained and "Archive instead". |
| A rejected refund was stored as `failed` | Its own state, `rejected` (`GET /admin/refunds?status=rejected`) | Add `rejected: "Turned down"` to `REFUND_STATUS_LABEL`, a filter entry, and show the note. |
| Catalog reads cached 60 s for staff | A request with a staff token gets `private, no-store` | The `cache: "no-cache"` workaround in `src/lib/api/catalog.ts` can go once the new backend is deployed. |
| Inactive exams could not be listed | `GET /admin/exam-categories`, `GET /admin/exams`, `GET /admin/exams/{slug}` with `is_active` and `display_order` | Use them on the Exams tab and add a "Show to students" switch (`PATCH /admin/exams/{slug}` with `is_active`). |
| Blueprint sections could not be read back | `GET .../blueprints/{version}` and the create answer return default marks and every section | "Start from this version" on the Blueprints tab. |
| Taxonomy read lacked Hindi names and descriptions | `localized_names` on all three levels, `description` on topics; a description sent for a subject or subtopic is refused (`unsupported_field`) | Show and edit Hindi names; offer a description only for topics. The new-subject and new-subtopic dialogs must stop sending one. |
| Syllabus order lost on read | Each topic carries `position` and `display_name` | Sort by `position`; stop inferring a shown-as name by comparing names. |

### Still open

| Gap | Where it shows | Suggested fix |
|---|---|---|
| No delete routes in the catalog | Categories, exams, stages, subjects, topics and subtopics cannot be deleted, so test and mistaken entries stay for good | Delete or archive for nodes nothing refers to. |
| No upload progress or resumable upload | A 200 MB video upload is one request with no progress bar. | Presigned direct-to-S3 upload with multipart (planned with the AWS staging work). |
| No video encoding | The MP4 itself plays. | HLS transcoding (planned with AWS). |
| Staff dashboard numbers | The Today screen has no counts of new students, revenue, or open reports. | `GET /admin/dashboard/stats` (phase 18). |
| AI tutor moderation | No screen: no route to list or review tutor conversations. | Add with the AI tutor (phase 20). |
| Streak rule setting | Owner decision D2 is open; nothing to configure yet. | A setting once the rule is decided (phase 16). |

## Part 3. Still to build on the console side

- Nothing else is planned for the console: A0 to A8 and the catalog editor are all built.
- Real-backend replay of `e2e/a8.spec.ts` once Part 1 ships.
