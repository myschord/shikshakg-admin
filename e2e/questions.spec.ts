import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { apiAs, createStaff, horizontalOverflow, newSession, questionStatus, seedQuestion, sharedStudent, signIn, type Account } from "./helpers";

// BPSC has a syllabus and no questions locally, so its review queue holds only what these tests put there.
const EXAM = "bpsc";
const STAGE = "prelims";
let editor: Account;
let student: Account;
const created: string[] = [];

// The backend rate-limits logins, so each account logs in once and reuses the session for a few minutes.
const cache = new Map<string, { at: number; session: Account }>();
async function session(a: Account): Promise<Account> {
  const hit = cache.get(a.email);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.session;
  const fresh = await newSession(a);
  cache.set(a.email, { at: Date.now(), session: fresh });
  return fresh;
}

test.beforeAll(async () => {
  editor = await createStaff("content_editor");
  student = await sharedStudent();
});

// Leave nothing visible to students or waiting in the queue.
test.afterAll(async () => {
  const s = await session(editor);
  for (const id of created) {
    const st = await questionStatus(s, id).catch(() => "");
    if (st === "published") await apiAs(s, "POST", `/admin/questions/${id}/status`, { status: "retired", note: "e2e cleanup" }).catch(() => {});
    else if (st === "in_review" || st === "draft") await apiAs(s, "POST", `/admin/questions/${id}/status`, { status: "rejected", note: "e2e cleanup" }).catch(() => {});
  }
});

// Anything still in review from an earlier test is rejected first.
test.beforeEach(async () => {
  const s = await session(editor);
  const list = await apiAs(s, "GET", `/admin/questions?exam=${EXAM}&status=in_review&limit=100`);
  for (const it of list.items) await apiAs(s, "POST", `/admin/questions/${it.id}/status`, { status: "rejected", note: "e2e reset" });
});

async function seed(tag: string, opts: { topic?: boolean; review?: boolean } = {}) {
  const q = await seedQuestion(await session(editor), { exam: EXAM, stage: STAGE, tag, ...opts });
  created.push(q.id);
  return q;
}

const TAGS = ["approve-me", "send-me-back", "reject-me", "first-q", "second-q", "no-topic"];
const onScreen = async (page: Page) => {
  await expect(page.getByLabel("Question under review")).toContainText("[E2E]");
  const t = await page.getByLabel("Question under review").innerText();
  return TAGS.find((x) => t.includes(x)) ?? "";
};

async function openQueue(page: Page) {
  await signIn(page.context(), await session(editor));
  await page.goto("/questions/review");
  await page.getByLabel(/^Exam/).selectOption(EXAM);
}

test.describe("A2: review queue", () => {
  test("an editor clears the queue with the keyboard only", async ({ page }) => {
    const ids: Record<string, string> = {};
    for (const tag of ["approve-me", "send-me-back", "reject-me"]) ids[tag] = (await seed(tag)).id;
    await openQueue(page);
    const live = page.getByRole("status").first();
    await expect(page.getByText(/3 left/)).toBeVisible();

    const done: Record<string, string> = {};
    let lastTag = "";
    for (let step = 0; step < 3; step++) {
      const tag = await onScreen(page);
      done[tag] = "seen";
      lastTag = tag;
      if (tag === "approve-me") {
        await page.keyboard.press("a");
        await expect(live).toContainText(`Approved. ${2 - step} left`);
      } else if (tag === "send-me-back") {
        // R opens the note box with focus in it; an empty note is refused; Enter saves.
        await page.keyboard.press("r");
        await expect(page.getByLabel(/What needs to change/)).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.getByText("Write a short note so the author knows what to fix.")).toBeVisible();
        await page.keyboard.type("Option C is ambiguous");
        await page.keyboard.press("Enter");
        await expect(live).toContainText(`Sent back. ${2 - step} left`);
      } else {
        // Escape cancels a note without deciding anything.
        await page.keyboard.press("x");
        await expect(page.getByLabel(/Why is it rejected/)).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.getByLabel("Question under review")).toContainText("reject-me");
        await page.keyboard.press("x");
        await page.keyboard.type("Not a real exam topic");
        await page.keyboard.press("Enter");
        await expect(live).toContainText(`Rejected. ${2 - step} left`);
      }
    }
    expect(Object.keys(done).sort()).toEqual(["approve-me", "reject-me", "send-me-back"]);
    await expect(page.getByRole("heading", { name: "The review queue is clear" })).toBeVisible();

    const s = await session(editor);
    expect(await questionStatus(s, ids["approve-me"])).toBe("published");
    expect(await questionStatus(s, ids["send-me-back"])).toBe("draft");
    expect(await questionStatus(s, ids["reject-me"])).toBe("rejected");

    // U undoes the last decision, and that question is back in the queue.
    await page.keyboard.press("u");
    await expect(page.getByLabel("Question under review")).toContainText(lastTag);
    expect(await questionStatus(await session(editor), ids[lastTag])).toBe("in_review");
  });

  test("skipping moves a question to the end, and ? shows the shortcuts", async ({ page }) => {
    await seed("first-q");
    await seed("second-q");
    await openQueue(page);
    const first = await onScreen(page);
    await page.keyboard.press("s");
    const second = await onScreen(page);
    expect(second).not.toBe(first);
    await expect(page.getByText(/1 skipped, shown last/)).toBeVisible();
    await page.keyboard.press("?");
    await expect(page.getByRole("region", { name: "Keyboard shortcuts" })).toContainText("Approve and publish");
    // Typing in a field never triggers a shortcut.
    await page.keyboard.press("r");
    await page.keyboard.type("approve a skip");
    expect(await onScreen(page)).toBe(second);
    await page.keyboard.press("Escape");
  });

  test("a question without a topic cannot be published and says why", async ({ page }) => {
    const q = await seed("no-topic", { topic: false });
    await openQueue(page);
    expect(await onScreen(page)).toBe("no-topic");
    await page.keyboard.press("a");
    await expect(page.getByRole("alert").filter({ hasText: /Classify the question/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /add the topic/i })).toBeVisible();
    expect(await questionStatus(await session(editor), q.id)).toBe("in_review");
  });
});

test.describe("A2: question bank and editor", () => {
  test("edit a question, and a stale save is refused with a clear message", async ({ page, context }) => {
    const q = await seed("edit-me", { review: false });
    await signIn(context, await session(editor));
    await page.goto(`/questions/view?id=${q.id}&edit=1`);
    await page.getByLabel("Question (English)").fill("[E2E] edit-me rewritten, which is right?");

    // Someone else saves first.
    const other = await session(editor);
    await apiAs(other, "PATCH", `/admin/questions/${q.id}`, { expected_version: q.version, difficulty: "hard" });

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/Someone changed this question/)).toBeVisible();

    // Reload to get the new version, then the same edit saves.
    await page.reload();
    await page.getByLabel("Question (English)").fill("[E2E] edit-me rewritten, which is right?");
    await page.getByRole("button", { name: "Save changes" }).click();
    // The editor closing is the signal that the save finished (the field text alone is visible before it does).
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    await expect(page.getByText("Saved.").first()).toBeVisible();
    const saved = await apiAs(await session(editor), "GET", `/admin/questions/${q.id}`);
    expect(saved.translations.find((t: any) => t.language === "en").stem).toContain("rewritten");
    expect(saved.difficulty).toBe("hard");
  });

  test("the editor refuses missing fields before asking the server", async ({ page, context }) => {
    await signIn(context, await session(editor));
    await page.goto("/questions/new");
    await page.getByLabel(/^Exam/).selectOption(EXAM);
    await page.getByRole("button", { name: "Save as draft" }).click();
    await expect(page.getByText("Choose a subject.")).toBeVisible();
    await expect(page.getByText("Mark the correct answer.")).toBeVisible();
    await expect(page.getByText("Write the question.").first()).toBeVisible();
  });

  test("bulk actions change only what is allowed", async ({ page, context }) => {
    const a = await seed("bulk-a");
    const b = await seed("bulk-b");
    await signIn(context, await session(editor));
    await page.goto("/questions");
    await page.getByLabel(/^Exam/).selectOption(EXAM);
    await page.getByLabel(/^Status/).selectOption("in_review");
    await page.getByLabel(/Select question.*bulk-a/).check();
    await page.getByLabel(/Select question.*bulk-b/).check();
    await page.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: "Publish" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText(/2 changed/)).toBeVisible();
    const s = await session(editor);
    expect(await questionStatus(s, a.id)).toBe("published");
    expect(await questionStatus(s, b.id)).toBe("published");
  });
});

test.describe("A2: student reports", () => {
  test("a student's report reaches staff, and resolving it sends the question back to review", async ({ page, context }) => {
    const q = await seed("report-me");
    const details = `I think A is right ${Date.now().toString(36)}`;
    const s = await session(editor);
    await apiAs(s, "POST", `/admin/questions/${q.id}/status`, { status: "published", note: "e2e" });
    const st = await session(student);
    await apiAs(st, "POST", `/questions/${q.id}/report`, { reason: "wrong_answer", details });

    await signIn(context, await session(editor));
    await page.goto("/reports");
    const card = page.locator("li.rounded-2xl", { hasText: details });
    await expect(card).toContainText("Wrong answer");
    await card.getByRole("button", { name: "Resolve and send back to review" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Resolve", exact: true }).click();
    await expect(page.getByText(/Say what you found or changed/)).toBeVisible();
    await page.getByLabel(/What did you find or change/).fill("Checked the source: B is right");
    await page.getByRole("dialog").getByRole("button", { name: "Resolve", exact: true }).click();
    await expect(card).toHaveCount(0);
    expect(await questionStatus(await session(editor), q.id)).toBe("in_review");
  });
});

test.describe("A2: pools and aliases", () => {
  test("create a pool, set its exams, deactivate it; add and remove an alias", async ({ page, context }) => {
    const tag = Date.now().toString(36);
    await signIn(context, await session(editor));
    await page.goto("/pools");
    await page.getByRole("button", { name: "New pool" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel(/^Short code/).fill("Bad Slug");
    await dlg.getByLabel(/^Name/).fill(`E2E pool ${tag}`);
    await dlg.getByRole("button", { name: "Create pool" }).click();
    await expect(page.getByText(/lowercase letters, digits and single dashes/)).toBeVisible();
    await dlg.getByLabel(/^Short code/).fill(`e2e-${tag}`);
    await dlg.getByRole("button", { name: "Create pool" }).click();
    const card = page.locator("li.rounded-2xl", { hasText: `E2E pool ${tag}` });
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: /Edit exams/ }).click();
    await page.getByRole("dialog").getByLabel("BPSC").check();
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(card).toContainText("BPSC");
    await card.getByRole("button", { name: /Deactivate/ }).click();
    await expect(card).toContainText("Inactive");

    const alias = `E2E Alias ${tag}`;
    await page.getByLabel(/^Name on the paper/).fill(alias);
    await page.getByLabel(/^Our exam/).selectOption(EXAM);
    await page.getByRole("button", { name: "Add alias" }).click();
    const row = page.locator("tr", { hasText: alias });
    await expect(row).toContainText("BPSC");
    await row.getByRole("button", { name: /Remove/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
    await expect(row).toHaveCount(0);
  });
});

test.describe("A2 screens at tablet and desktop width", () => {
  for (const path of ["/questions", "/questions/review", "/questions/new", "/reports", "/pools"])
    for (const width of [768, 1280])
      test(`${path} @${width}`, async ({ page, context }) => {
        const csp: string[] = [];
        page.on("console", (m) => /violates the following|Content Security Policy/i.test(m.text()) && csp.push(m.text().slice(0, 160)));
        await signIn(context, await session(editor));
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(600);
        expect(await horizontalOverflow(page), "page scrolls sideways").toBeLessThanOrEqual(0);
        expect(csp).toEqual([]);
        const bad = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
      });
});
