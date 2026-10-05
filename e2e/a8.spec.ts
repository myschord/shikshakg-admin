import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { apiAs, createStaff, firstTopic, freshStudent, horizontalOverflow, newSession, signIn, type Account } from "./helpers";

// These screens run on the real backend. Every test makes its own records (names carry a unique tag), so reruns
// against the same database do not collide; the daily quiz screen shares one calendar, so its test only touches
// days after today.
const EXAM = "bpsc";
const tag = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
let admin: Account;
let editor: Account;
const cache = new Map<string, { at: number; session: Account }>();
async function session(a: Account): Promise<Account> {
  const hit = cache.get(a.email);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.session;
  const fresh = await newSession(a);
  cache.set(a.email, { at: Date.now(), session: fresh });
  return fresh;
}

test.beforeAll(async () => {
  admin = await createStaff("admin");
  editor = await createStaff("content_editor");
});

const row = (page: Page, text: string | RegExp) => page.locator("tr", { hasText: text });

test.describe("A8: users and roles, and the action log", () => {
  test("search, change a role, suspend and restore an account, add staff; each change is logged", async ({ page, context }) => {
    test.setTimeout(120_000);
    const person = await freshStudent();
    await signIn(context, await session(admin));
    await page.goto("/users");
    await expect(page.getByText(/sample data/i)).toHaveCount(0);
    await expect(row(page, admin.email)).toContainText("You");
    await expect(row(page, admin.email).getByRole("button")).toHaveCount(0);

    await page.getByLabel("Name or email").fill(person.email);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(row(page, person.email)).toContainText("Student");
    await expect(row(page, person.email)).toContainText("Active");
    await row(page, person.email).getByRole("button", { name: /^Change role/ }).click();
    const d = page.getByRole("alertdialog");
    await d.getByLabel("New role").selectOption("content_editor");
    await d.getByRole("button", { name: "Change role" }).click();
    await expect(d.getByText("Say why. It is kept in the action log.")).toBeVisible();
    await d.getByLabel(/^Reason/).fill("joins the content team");
    await d.getByRole("button", { name: "Change role" }).click();
    await expect(row(page, person.email)).toContainText("Content editor");

    await row(page, person.email).getByRole("button", { name: /^Suspend/ }).click();
    await page.getByRole("alertdialog").getByLabel(/^Reason/).fill("asked to pause the account");
    await page.getByRole("alertdialog").getByRole("button", { name: "Suspend" }).click();
    await expect(row(page, person.email)).toContainText("Suspended");
    await row(page, person.email).getByRole("button", { name: /^Restore/ }).click();
    await page.getByRole("alertdialog").getByLabel(/^Reason/).fill("back from leave");
    await page.getByRole("alertdialog").getByRole("button", { name: "Restore" }).click();
    await expect(row(page, person.email)).toContainText("Active");

    const name = `Tara ${tag()}`;
    const fresh = `tara-${tag()}@example.com`;
    await page.getByLabel("Name or email").fill("");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: "Add staff" }).click();
    const inv = page.getByRole("dialog");
    await inv.getByRole("button", { name: "Create account" }).click();
    await expect(inv.getByText("Enter their name.")).toBeVisible();
    await expect(inv.getByText("Enter a valid email address.")).toBeVisible();
    await inv.getByLabel(/^Full name/).fill(name);
    await inv.getByLabel(/^Email/).fill(editor.email);
    await inv.getByRole("button", { name: "Create account" }).click();
    await expect(inv.getByText(/already exists/)).toBeVisible();
    await inv.getByLabel(/^Email/).fill(fresh);
    await inv.getByRole("button", { name: "Create account" }).click();
    await page.getByLabel("Name or email").fill(fresh);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(row(page, fresh)).toContainText("Content editor");
    await expect(row(page, fresh)).toContainText("Not activated yet");
    await expect(row(page, fresh).getByRole("button", { name: /^Suspend|^Restore/ })).toHaveCount(0); // not a staff decision yet

    // The log, on another screen, shows the changes with before and after.
    await page.goto("/action-log");
    await page.getByLabel("What starts with").fill("users.");
    await page.getByLabel("Who (email)").fill(admin.email);
    await page.getByRole("button", { name: "Filter" }).click();
    for (const what of ["Users: role changed", "Users: suspended", "Users: reactivated", "Users: staff invited"]) await expect(row(page, what).first()).toBeVisible();
    await row(page, "Users: role changed").first().getByRole("button", { name: /^Open/ }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByRole("region", { name: "Before" })).toContainText("student");
    await expect(dlg.getByRole("region", { name: "After" })).toContainText("content_editor");
    await expect(dlg.getByRole("region", { name: "After" })).toContainText("joins the content team");
    await dlg.getByRole("button", { name: "Close", exact: true }).last().click();
  });

  test("the log filters by person, by what it starts with and by kind of record", async ({ page, context }) => {
    await apiAs(await session(admin), "POST", "/admin/staff", { email: `log-${tag()}@example.com`, full_name: `Log ${tag()}`, role: "content_editor" });
    await signIn(context, await session(admin));
    await page.goto("/action-log");
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await expect(page.getByText(/sample data/i)).toHaveCount(0);

    await page.getByLabel("Who (email)").fill(admin.email);
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.locator("tbody tr").first()).toContainText(admin.email);
    for (const t of await page.locator("tbody tr").allInnerTexts()) expect(t).toContain(admin.email);

    await page.getByLabel("Who (email)").fill("");
    await page.getByLabel("On").selectOption("user"); // the kinds offered are the ones that exist
    await page.getByRole("button", { name: "Filter" }).click();
    for (const t of await page.locator("tbody tr").allInnerTexts()) expect(t.toLowerCase()).toContain("user");

    await page.getByLabel("On").selectOption("");
    await page.getByLabel("What starts with").fill("users.");
    await page.getByRole("button", { name: "Filter" }).click();
    for (const t of await page.locator("tbody tr").allInnerTexts()) expect(t.toLowerCase()).toContain("users");
    await page.getByLabel("What starts with").fill("nothing-like-this");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByText("Nothing matches")).toBeVisible();
  });

  test("an editor cannot open the admin-only pages but can open the content ones", async ({ page, context }) => {
    await signIn(context, await session(editor));
    for (const path of ["/users", "/action-log", "/announcements"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: /role cannot open this page/i })).toBeVisible();
    }
    for (const [path, title] of [["/current-affairs", "Current affairs"], ["/daily-quiz", "Daily quiz"]]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    }
  });
});

test.describe("A8: announcements", () => {
  test("write, check, send, schedule and cancel", async ({ page, context }) => {
    test.setTimeout(120_000);
    const t = tag();
    const title = `E2E new batch ${t}`;
    const later = `E2E maintenance ${t}`;
    await signIn(context, await session(admin));
    await page.goto("/announcements");
    await expect(page.getByText(/sample data/i)).toHaveCount(0);

    await page.getByRole("button", { name: "New announcement" }).click();
    const d = page.getByRole("dialog");
    await d.getByRole("button", { name: "Save draft" }).click();
    await expect(d.getByText("Enter a title.")).toBeVisible();
    await expect(d.getByText("Write the message.")).toBeVisible();
    await d.getByLabel(/^Title/).fill(title);
    await d.getByLabel(/^Message/).fill("A new batch starts on Monday.");
    await d.getByLabel(/^Where tapping it goes/).fill("not a link");
    await d.getByLabel(/^Send at/).fill("2020-01-01T10:00");
    await d.getByRole("button", { name: "Schedule" }).click();
    await expect(d.getByText(/Use a path that starts with \//)).toBeVisible();
    await expect(d.getByText("Choose a time at least a minute from now.")).toBeVisible();
    await d.getByLabel(/^Where tapping it goes/).fill("/exams/bpsc/tests");
    await d.getByLabel(/^Send at/).fill("");
    await d.getByLabel("Send to").selectOption(EXAM);
    await d.getByRole("checkbox", { name: /push notification/ }).check();
    await d.getByRole("button", { name: "Save draft" }).click();
    await expect(row(page, title)).toContainText("Draft");
    await expect(row(page, title)).toContainText("Push too");
    await expect(row(page, title)).toContainText(`Students of ${EXAM}`);

    await row(page, title).getByRole("button", { name: /^Send now/ }).click();
    await expect(page.getByRole("alertdialog")).toContainText("cannot be taken back");
    await page.getByRole("alertdialog").getByRole("button", { name: "Send now" }).click();
    await expect(row(page, title)).toContainText("Sent");
    await expect(row(page, title).getByRole("button")).toHaveCount(0);

    // A scheduled one can be cancelled before it goes.
    await page.getByRole("button", { name: "New announcement" }).click();
    const d2 = page.getByRole("dialog");
    await d2.getByLabel(/^Title/).fill(later);
    await d2.getByLabel(/^Message/).fill("Maintenance on Sunday morning.");
    const when = new Date(Date.now() + 2 * 24 * 3600_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    await d2.getByLabel(/^Send at/).fill(`${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T10:00`);
    await d2.getByRole("button", { name: "Schedule" }).click();
    await expect(row(page, later)).toContainText("Scheduled");
    await row(page, later).getByRole("button", { name: /^Cancel/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel announcement" }).click();
    await expect(row(page, later)).toContainText("Cancelled");

    await page.goto("/action-log");
    await page.getByLabel("What starts with").fill("announcements.");
    await page.getByLabel("Who (email)").fill(admin.email);
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(row(page, "Announcements: sent").first()).toBeVisible();
    await expect(row(page, "Announcements: cancelled").first()).toBeVisible();
  });
});

test.describe("A8: current affairs", () => {
  test("write, send for review, publish and retire; an editor cannot publish or retire", async ({ page, context, browser }) => {
    test.setTimeout(120_000);
    const t = tag();
    const headline = `E2E state announces new scheme ${t}`;
    await signIn(context, await session(admin));
    await page.goto("/current-affairs");
    await expect(page.getByText(/sample data/i)).toHaveCount(0);
    await page.getByRole("button", { name: "New item" }).click();
    const d = page.getByRole("dialog");
    await d.getByRole("button", { name: "Save draft" }).click();
    await expect(d.getByText("Write the headline.")).toBeVisible();
    await expect(d.getByText("Write a short summary.")).toBeVisible();
    await expect(d.getByText("Name the source, for example PIB.")).toBeVisible();
    await expect(d.getByText("Enter the source link, starting with https://.")).toBeVisible();
    await d.getByLabel("Exam", { exact: true }).selectOption(EXAM);
    await d.getByLabel(/^Headline/).fill(headline);
    await d.getByLabel(/^Summary/).fill("The state announced a scheme for aspirants.");
    await d.getByLabel(/^Source name/).fill("PIB");
    await d.getByLabel(/^Source link/).fill("http://insecure.example");
    await d.getByRole("button", { name: "Save draft" }).click();
    await expect(d.getByText("Enter the source link, starting with https://.")).toBeVisible();
    await d.getByLabel(/^Source link/).fill("https://pib.gov.in/x");
    await d.getByLabel("Importance").selectOption("3");
    await d.getByRole("group", { name: /also for these exams/i }).getByRole("checkbox").first().check();
    // A Hindi version needs both its headline and its summary.
    await d.getByText("Hindi version (optional)").click();
    await d.getByLabel("Hindi headline").fill("राज्य ने नई योजना घोषित की");
    await d.getByRole("button", { name: "Save draft" }).click();
    await expect(d.getByText("Write both the Hindi headline and summary, or leave both empty.")).toBeVisible();
    await d.getByLabel("Hindi summary").fill("राज्य ने अभ्यर्थियों के लिए एक योजना घोषित की।");
    await d.getByRole("button", { name: "Save draft" }).click();
    const r = row(page, headline);
    await expect(r).toContainText("Draft");
    await expect(r).toContainText("Must know");
    await expect(r).toContainText("Hindi added");
    await expect(r.getByRole("button", { name: /^Publish/ })).toHaveCount(0); // a draft goes to review first

    await r.getByRole("button", { name: /^Send for review/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Send for review" }).click();
    await expect(r).toContainText("In review");
    await expect(r.getByRole("button", { name: /^Edit/ })).toBeVisible();
    await r.getByRole("button", { name: /^Publish/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish" }).click();
    await expect(r).toContainText("Published");
    await expect(r.getByRole("button", { name: /^Edit/ })).toHaveCount(0); // live items are not edited in place
    await r.getByRole("button", { name: /^Retire/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Retire" }).click();
    await expect(r).toContainText("Retired");

    // An editor writes and sends for review, but sees no Publish and no Retire.
    const mine = `E2E editor draft ${t}`;
    const item = await apiAs(await session(editor), "POST", "/admin/current-affairs", {
      exam_slugs: [EXAM],
      importance: 2,
      source_name: "PIB",
      source_url: "https://pib.gov.in/y",
      published_on: new Date().toISOString().slice(0, 10),
      translations: [{ language: "en", headline: mine, summary: "Written by an editor." }],
    });
    await apiAs(await session(editor), "POST", `/admin/current-affairs/${item.id}/status`, { status: "in_review" });
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await signIn(ctx2, await session(editor));
    await p2.goto("/current-affairs");
    const seeded = row(p2, mine);
    await expect(seeded).toContainText("In review");
    await expect(seeded.getByRole("button", { name: /^Publish/ })).toHaveCount(0);
    await expect(seeded.getByRole("button", { name: /^Back to draft/ })).toBeVisible();
    await ctx2.close();
  });
});

// A published test the picker can offer, made through the real API and cleaned up afterwards.
const made: { questions: string[]; tests: string[]; papers: string[] } = { questions: [], tests: [], papers: [] };
async function publishedTest(tag: string): Promise<{ id: string; title: string }> {
  const s = await session(editor);
  const code = `E2E_Q_${tag.toUpperCase()}`;
  await apiAs(s, "POST", "/admin/papers", { exam_slug: EXAM, stage_slug: "prelims", paper_code: code, title: `E2E quiz paper ${tag}`, year: 2022, marking: { correct: 1, negative: 0 }, is_free_preview: true, is_partial: false });
  made.papers.push(code);
  const t = await firstTopic(EXAM, "prelims");
  const records = [1, 2].map((i) => ({
    question_id: `e2e-${tag}-${i}`,
    content: { question: `[E2E] ${tag} quiz question ${i}: which is right?`, options: { A: "No", B: "Yes", C: "Maybe", D: "Never" }, answer: "B", explanation: "B." },
    metadata: { source_type: "PYQ", exam_id: EXAM, exam_stage: "prelims", paper_id: code, year: 2022, question_number: i, subject_id: t.subject, topic_id: t.topic, language: "en", difficulty: "easy", question_type: "direct_fact" },
  }));
  const res = await fetch(`http://localhost:8020/api/v1/admin/question-imports?filename=e2e-${tag}.json&publish=true`, { method: "POST", headers: { authorization: `Bearer ${s.access}`, "content-type": "application/json" }, body: JSON.stringify(records) });
  const job = await res.json();
  for (let i = 0; i < 40; i++) {
    if ((await apiAs(s, "GET", `/admin/question-imports/${job.id}`)).status === "completed") break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const q = await apiAs(s, "GET", `/admin/questions?exam=${EXAM}&status=published&limit=100`);
  made.questions.push(...q.items.filter((i: { preview: string }) => i.preview.includes(`[E2E] ${tag}`)).map((i: { id: string }) => i.id));
  await apiAs(s, "POST", `/admin/papers/${code}/publish`);
  const test = await apiAs(s, "POST", "/admin/tests/from-paper", { paper_code: code, title: `E2E quiz test ${tag}`, is_free_preview: true, publish: true, position: 1 });
  made.tests.push(test.id);
  return { id: test.id, title: test.title };
}

test.afterAll(async () => {
  const s = await session(editor);
  for (const id of made.tests) await apiAs(s, "POST", `/admin/tests/${id}/archive`).catch(() => {});
  for (const code of made.papers) await apiAs(s, "POST", `/admin/papers/${code}/unpublish`).catch(() => {});
  for (const id of made.questions) await apiAs(s, "POST", `/admin/questions/${id}/status`, { status: "retired", note: "e2e cleanup" }).catch(() => {});
});

test.describe("A8: daily quiz", () => {
  test("choose a published test for a day, change it, and the rules are explained", async ({ page, context }) => {
    test.setTimeout(180_000);
    const tag = Date.now().toString(36);
    const test1 = await publishedTest(`${tag}a`);
    const test2 = await publishedTest(`${tag}b`);
    await signIn(context, await session(editor));
    await page.goto("/daily-quiz");
    await page.getByLabel("Exam").selectOption(EXAM);
    await expect(page.getByText(/sample data/i)).toHaveCount(0);

    // Today's quiz can be set once and then is locked (the backend refuses to remove it), so this test only
    // changes the two days after today, which it can set and remove again.
    const rows = page.locator("tbody tr");
    const todayIndex = await rows.evaluateAll((els) => els.findIndex((e) => e.textContent?.includes("Today")));
    const tomorrow = rows.nth(todayIndex + 1);
    const dayAfter = rows.nth(todayIndex + 2);
    for (const r of [tomorrow, dayAfter]) {
      if (await r.getByRole("button", { name: /^Remove/ }).count()) {
        await r.getByRole("button", { name: /^Remove/ }).click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
        await expect(r).toContainText("Not set");
      }
    }
    await tomorrow.getByRole("button", { name: /^Choose a test/ }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Find a test").fill(test1.title);
    await d.getByRole("radio").first().check();
    await d.getByRole("button", { name: "Set as the quiz" }).click();
    await expect(tomorrow).toContainText(test1.title);

    // The same test cannot be the quiz on a second day; another test is accepted.
    await dayAfter.getByRole("button", { name: /^Choose a test/ }).click();
    await page.getByRole("dialog").getByLabel("Find a test").fill(test1.title);
    await page.getByRole("dialog").getByRole("radio").first().check();
    await page.getByRole("dialog").getByRole("button", { name: "Set as the quiz" }).click();
    await expect(page.getByRole("dialog")).toContainText(/already the quiz for/);
    await page.getByRole("dialog").getByLabel("Find a test").fill(test2.title);
    await page.getByRole("dialog").getByRole("radio").first().check();
    await page.getByRole("dialog").getByRole("button", { name: "Set as the quiz" }).click();
    await expect(dayAfter).toContainText(test2.title);
    for (const r of [tomorrow, dayAfter]) {
      await r.getByRole("button", { name: /^Remove/ }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
      await expect(r).toContainText("Not set");
    }

    // Days that have passed cannot be changed.
    const past = rows.first();
    await expect(past.getByRole("button")).toHaveCount(0);
  });
});

test.describe("A8 screens at tablet and desktop width", () => {
  for (const [name, path] of [["users", "/users"], ["action log", "/action-log"], ["announcements", "/announcements"], ["current affairs", "/current-affairs"], ["daily quiz", "/daily-quiz"]])
    for (const width of [768, 1280])
      test(`${name} @${width}`, async ({ page, context }) => {
        const csp: string[] = [];
        page.on("console", (m) => /violates the following|Content Security Policy/i.test(m.text()) && csp.push(m.text().slice(0, 160)));
        await signIn(context, await session(admin));
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(900);
        expect(await horizontalOverflow(page), "page scrolls sideways").toBeLessThanOrEqual(0);
        expect(csp).toEqual([]);
        const bad = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
      });
});
