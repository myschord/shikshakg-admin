import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { apiAs, createStaff, firstTopic, horizontalOverflow, newSession, questionStatus, signIn, type Account } from "./helpers";
import { makePdf, sampleQuestions } from "./makePdf";

let editor: Account;
const cache = new Map<string, { at: number; session: Account }>();
async function session(a: Account): Promise<Account> {
  const hit = cache.get(a.email);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.session;
  const fresh = await newSession(a);
  cache.set(a.email, { at: Date.now(), session: fresh });
  return fresh;
}

const seen: { job?: string; doc?: string } = {};
const published: string[] = [];

test.beforeAll(async () => {
  editor = await createStaff("content_editor");
});

// Nothing from these tests may stay in a review queue or in front of students.
async function drain(exam: string) {
  const s = await session(editor);
  const list = await apiAs(s, "GET", `/admin/questions?exam=${exam}&status=in_review&limit=100`);
  for (const it of list.items) await apiAs(s, "POST", `/admin/questions/${it.id}/status`, { status: "rejected", note: "e2e reset" });
}
test.beforeEach(async () => {
  await drain("bpsc");
  await drain("ssc-cgl");
});
test.afterAll(async () => {
  const s = await session(editor);
  for (const id of published) await apiAs(s, "POST", `/admin/questions/${id}/status`, { status: "retired", note: "e2e cleanup" }).catch(() => {});
  await drain("bpsc");
  await drain("ssc-cgl");
});

const json = (obj: unknown) => ({ name: `questions-${Date.now().toString(36)}.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(obj)) });

test.describe("A3: JSON imports", () => {
  test("a bad file is explained before upload; a mixed file imports what it can and explains the rest", async ({ page, context }) => {
    await signIn(context, await session(editor));
    await page.goto("/imports");
    const file = page.locator('input[type="file"]');
    const importBtn = page.getByRole("button", { name: "Import", exact: true });

    await file.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("this is not json") });
    await expect(page.getByText(/not valid JSON/)).toBeVisible();
    await expect(importBtn).toBeDisabled();
    await file.setInputFiles(json([{ question_id: "x", content: { question: "no metadata" } }]));
    await expect(page.getByText(/no "content" or no "metadata"|has no "content"/)).toBeVisible();
    await expect(importBtn).toBeDisabled();

    // Three good records and one with a subject code that does not exist.
    const t = await firstTopic("bpsc", "prelims");
    const tag = Date.now().toString(36);
    const rec = (n: number, subject = t.subject) => ({
      question_id: `e2e-${tag}-${n}`,
      content: { question: `[E2E] import ${n} ${tag} which is right?`, options: { A: "One", B: "Two", C: "Three", D: "Four" }, answer: "B", explanation: "Because two." },
      metadata: { source_type: "ADMIN_CREATED", exam_id: "bpsc", exam_stage: "prelims", subject_id: subject, topic_id: t.topic, language: "en", difficulty: "easy", question_type: "direct_fact" },
    });
    const upload = json([rec(1), rec(2), rec(3), rec(4, "no-such-subject")]);
    await file.setInputFiles(upload);
    await expect(page.getByText("4 questions found in this file.")).toBeVisible();
    await importBtn.click();
    // Open the job just made, found by its own file name; the list also holds jobs of earlier runs.
    const row = page.locator("tr").filter({ hasText: upload.name });
    await expect(row).toBeVisible();
    await row.getByRole("link").click();

    await expect(page.getByText("Finished").first()).toBeVisible({ timeout: 60_000 });
    seen.job = new URL(page.url()).searchParams.get("id") ?? undefined;
    await expect(page.getByText("4 of 4 records done")).toBeVisible();
    const counts = page.getByRole("region", { name: "Progress" });
    await expect(counts.locator("dt", { hasText: "Added" }).locator("xpath=following-sibling::dd")).toHaveText("3");
    await expect(counts.locator("dt", { hasText: "Failed" }).locator("xpath=following-sibling::dd")).toHaveText("1");

    // The failed record is listed with a reason in plain words.
    const failedRows = page.locator("tbody tr");
    await expect(failedRows).toHaveCount(1);
    const bad = failedRows.first();
    await expect(bad).toContainText("Failed");
    await expect(bad).toContainText("4"); // record number 4
    await expect(bad).toContainText(/subject/i);
    // The good ones wait in the review queue, not in front of students.
    const s = await session(editor);
    await expect.poll(async () => (await apiAs(s, "GET", "/admin/questions?exam=bpsc&status=in_review&limit=100")).items.length, { timeout: 15_000 }).toBe(3);
  });

  test("the sample file is offered", async ({ page, context }) => {
    await signIn(context, await session(editor));
    await page.goto("/imports");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download a sample file" }).click()]);
    expect(download.suggestedFilename()).toBe("sample-questions.json");
  });
});

test.describe("A3: PDF extraction, from upload to published questions", () => {
  test("upload, review beside the page, import, then publish from the review queue", async ({ page, context }) => {
    test.setTimeout(420_000);
    await signIn(context, await session(editor));
    await page.goto("/pdf");

    // Upload.
    const code = `E2E_${Date.now().toString(36).toUpperCase()}`;
    await page.locator('input[type="file"]').setInputFiles({ name: `e2e-${code}.pdf`, mimeType: "application/pdf", buffer: makePdf(sampleQuestions(code)) });
    await page.getByLabel(/One question paper/).check();
    await page.getByLabel(/^Exam date/).fill("2022-09-12");
    await page.getByLabel(/^Exam(?! date)/).selectOption("ssc-cgl");
    await page.getByLabel(/^Subject/).selectOption("polity");
    await page.getByLabel("Language of the questions").selectOption("en");
    await page.getByLabel(/Use AI help/).uncheck();
    await page.getByLabel(/^Paper code/).fill(code);
    await page.getByRole("button", { name: "Upload and read" }).click();
    await page.waitForTimeout(4000);
    await page.getByRole("link", { name: `e2e-${code}.pdf` }).click();
    await page.waitForURL(/pdf\/view\?id=/);
    seen.doc = new URL(page.url()).searchParams.get("id") ?? undefined;

    // The reader works in the background; the screen waits and then opens the review.
    await expect(page.getByText("Ready to review").first()).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText("to review", { exact: false }).first()).toBeVisible();

    // The question is outlined on the original page, near the top where it really is.
    const img = page.getByRole("img", { name: /Scan of page 1/ });
    await expect(img).toBeVisible();
    const box = page.getByTestId("question-box").first();
    await expect(box).toBeVisible();
    const [ib, bb] = [await img.boundingBox(), await box.boundingBox()];
    expect(bb!.y - ib!.y).toBeLessThan(ib!.height * 0.2);

    // Approve each real question: set the answer and topic, then Ctrl+Enter from inside a field.
    const answers: Record<string, string> = { "Which city": "B", "Which river": "C", "How many days": "A" };
    const live = page.getByRole("status").filter({ hasText: /Done\./ });
    for (let n = 0; n < 3; n++) {
      const stem = page.getByLabel(/^Question/).first();
      await expect(stem).toBeVisible();
      const text = await stem.inputValue();
      const key = Object.keys(answers).find((k) => text.startsWith(k));
      expect(key, `unexpected question: ${text}`).toBeTruthy();
      await page.getByLabel(/^Correct answer/).selectOption(answers[key!]);
      const topic = page.getByLabel(/^Topic/);
      await topic.selectOption({ index: 1 });
      await stem.click();
      await page.keyboard.press("Control+Enter");
      await expect(live).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(`${n + 1} approved`, { exact: true })).toBeVisible({ timeout: 20_000 });
    }

    // The fourth "question" is the answer key misread as a question. Reject it from the keyboard.
    await expect(page.getByRole("list", { name: "Checks that need attention" }).getByText("An option is missing")).toBeVisible();
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("x");
    await page.keyboard.type("This is the answer key, not a question");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Everything has been decided/)).toBeVisible({ timeout: 20_000 });

    // Import the three approved questions.
    await page.getByRole("button", { name: /Import 3 approved questions/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText(/Import started for 3 questions/).first()).toBeVisible({ timeout: 30_000 });
    // The import runs in the background: follow it to the end before looking in the queue.
    await page.getByRole("link", { name: "Follow the import" }).click();
    await expect(page.getByText("Finished").first()).toBeVisible({ timeout: 60_000 });

    // They are waiting in the review queue, not live. Publish them with the keyboard.
    await page.goto("/questions/review");
    await page.getByLabel(/^Exam/).selectOption("ssc-cgl");
    await expect(page.getByText(/3 left/)).toBeVisible({ timeout: 20_000 });
    const s = await session(editor);
    for (let n = 0; n < 3; n++) {
      await expect(page.getByLabel("Question under review")).toContainText(/Which|How many/);
      await page.keyboard.press("a");
      // Wait for this approval to land (the count drops) before pressing A again; a key pressed mid-save is ignored.
      await expect(page.getByRole("status").filter({ hasText: new RegExp(`Approved\\. ${2 - n} left`) })).toBeVisible({ timeout: 20_000 });
    }
    await expect(page.getByRole("heading", { name: "The review queue is clear" })).toBeVisible();

    const live2 = await apiAs(s, "GET", `/admin/questions?exam=ssc-cgl&status=published&paper=${code}&limit=20`);
    published.push(...live2.items.map((i: { id: string }) => i.id));
    expect(live2.items.length).toBe(3);
    for (const id of published) expect(await questionStatus(s, id)).toBe("published");
  });
});

test.describe("A3 screens at tablet and desktop width", () => {
  const paths = () => ["/imports", "/pdf", ...(seen.job ? [`/imports/view?id=${seen.job}`] : []), ...(seen.doc ? [`/pdf/view?id=${seen.doc}`] : [])];
  for (const key of ["imports", "pdf", "import-view", "pdf-view"])
    for (const width of [768, 1280])
      test(`${key} @${width}`, async ({ page, context }) => {
        const path = key === "imports" ? "/imports" : key === "pdf" ? "/pdf" : key === "import-view" ? (seen.job ? `/imports/view?id=${seen.job}` : null) : seen.doc ? `/pdf/view?id=${seen.doc}` : null;
        test.skip(!path, "needs the earlier tests in this file to have created it");
        const csp: string[] = [];
        page.on("console", (m) => /violates the following|Content Security Policy/i.test(m.text()) && csp.push(m.text().slice(0, 160)));
        await signIn(context, await session(editor));
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path!);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(1200);
        expect(await horizontalOverflow(page), "page scrolls sideways").toBeLessThanOrEqual(0);
        expect(csp).toEqual([]);
        const bad = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
        void paths;
      });
});

export type { Page };
