import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { apiAs, createStaff, firstTopic, horizontalOverflow, newSession, sharedStudent, signIn, type Account } from "./helpers";

const EXAM = "bpsc";
const STAGE = "prelims";
let editor: Account;
let student: Account;
const cache = new Map<string, { at: number; session: Account }>();
async function session(a: Account): Promise<Account> {
  const hit = cache.get(a.email);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.session;
  const fresh = await newSession(a);
  cache.set(a.email, { at: Date.now(), session: fresh });
  return fresh;
}

const made: { questions: string[]; tests: string[]; papers: string[]; testId?: string } = { questions: [], tests: [], papers: [] };

test.beforeAll(async () => {
  editor = await createStaff("content_editor");
  student = await sharedStudent();
});

// Leave nothing live: archive tests, unpublish papers, retire the questions.
test.afterAll(async () => {
  const s = await session(editor);
  for (const id of made.tests) await apiAs(s, "POST", `/admin/tests/${id}/archive`).catch(() => {});
  for (const code of made.papers) await apiAs(s, "POST", `/admin/papers/${code}/unpublish`).catch(() => {});
  for (const id of made.questions) await apiAs(s, "POST", `/admin/questions/${id}/status`, { status: "retired", note: "e2e cleanup" }).catch(() => {});
});

/** Imports published questions through the API and waits for the job to finish. */
async function importPublished(tag: string, paperCode: string | null, count: number) {
  const s = await session(editor);
  const t = await firstTopic(EXAM, STAGE);
  const records = Array.from({ length: count }, (_, i) => ({
    question_id: `e2e-${tag}-${i + 1}`,
    content: { question: `[E2E] ${tag} number ${i + 1}: which option is right?`, options: { A: "Wrong", B: "Right", C: "Also wrong", D: "Still wrong" }, answer: "B", explanation: "B." },
    metadata: {
      source_type: paperCode ? "PYQ" : "ADMIN_CREATED",
      exam_id: EXAM,
      exam_stage: STAGE,
      ...(paperCode ? { paper_id: paperCode, year: 2022, question_number: i + 1 } : {}),
      subject_id: t.subject,
      topic_id: t.topic,
      language: "en",
      difficulty: "easy",
      question_type: "direct_fact",
    },
  }));
  const res = await fetch(`http://localhost:8020/api/v1/admin/question-imports?filename=e2e-${tag}.json&publish=true`, { method: "POST", headers: { authorization: `Bearer ${s.access}`, "content-type": "application/json" }, body: JSON.stringify(records) });
  const job = await res.json();
  if (!res.ok) throw new Error(`import failed: ${JSON.stringify(job)}`);
  for (let i = 0; i < 40; i++) {
    const j = await apiAs(s, "GET", `/admin/question-imports/${job.id}`);
    if (j.status === "completed") {
      expect(j.failed_count).toBe(0);
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  const q = await apiAs(s, "GET", `/admin/questions?exam=${EXAM}&status=published&limit=100`);
  const ids = q.items.filter((i: { preview: string }) => i.preview.includes(`[E2E] ${tag}`)).map((i: { id: string }) => i.id);
  made.questions.push(...ids);
  return ids as string[];
}

test.describe("A4: from a paper to a test a student can attempt", () => {
  test("create, publish, build a test, student attempts it, it locks, a new version replaces it", async ({ page, context }) => {
    test.setTimeout(240_000);
    const tag = Date.now().toString(36);
    const code = `E2E_P_${tag.toUpperCase()}`;
    await signIn(context, await session(editor));

    // 1. Create the paper in the console.
    await page.goto(`/papers?exam=${EXAM}`);
    await page.getByRole("button", { name: "New paper" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: "Create paper" }).click();
    await expect(dlg.getByText("Enter a title.")).toBeVisible();
    await dlg.getByLabel(/^Stage/).selectOption(STAGE);
    await dlg.getByLabel(/^Paper code/).fill(code);
    await dlg.getByLabel(/^Year/).fill("2022");
    await dlg.getByLabel(/^Title/).fill(`E2E paper ${tag}`);
    await dlg.getByLabel(/^Marks for a correct answer/).fill("1");
    await dlg.getByLabel(/^Marks lost for a wrong answer/).fill("0.25");
    await dlg.getByLabel(/Free preview/).check();
    await dlg.getByRole("button", { name: "Create paper" }).click();
    made.papers.push(code);
    const row = page.locator("tr", { hasText: code });
    await expect(row).toContainText("Draft");

    // 2. Questions arrive for the paper (an import, as the PDF flow would do), then the paper can be published.
    const ids = await importPublished(`${tag}-pyq`, code, 3);
    expect(ids.length).toBe(3);
    await page.reload();
    await expect(page.locator("tr", { hasText: code })).toContainText("3 published of 3");
    await page.locator("tr", { hasText: code }).getByRole("button", { name: /^Publish/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.locator("tr", { hasText: code })).toContainText("Published");

    // 3. A series, then a test from the paper, published at once.
    await page.goto("/tests?tab=series");
    await page.getByRole("button", { name: "New series" }).click();
    const sd = page.getByRole("dialog");
    await sd.getByLabel(/^Exam/).selectOption(EXAM);
    await sd.getByLabel(/^Title/).fill(`E2E series ${tag}`);
    await sd.getByLabel(/^Short code/).fill("Bad Code");
    await sd.getByRole("button", { name: "Create series" }).click();
    await expect(sd.getByText(/lowercase letters, digits and single dashes/)).toBeVisible();
    await sd.getByLabel(/^Short code/).fill(`e2e-series-${tag}`);
    await sd.getByRole("button", { name: "Create series" }).click();
    const srow = page.locator("tr", { hasText: `e2e-series-${tag}` });
    await expect(srow).toContainText("Draft");
    await srow.getByRole("button", { name: /^Edit/ }).click();
    await page.getByRole("dialog").getByLabel(/^State/).selectOption("published");
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    await expect(srow).toContainText("Published");

    await page.goto(`/papers?exam=${EXAM}`);
    await page.locator("tr", { hasText: code }).getByRole("link", { name: /Make a test/ }).click();
    const cd = page.getByRole("dialog");
    await expect(cd.getByLabel(/^Paper/)).toHaveValue(code);
    await cd.getByLabel(/^Test series/).selectOption({ label: `E2E series ${tag}` });
    await cd.getByLabel(/Free preview/).check();
    await cd.getByLabel(/Publish straight away/).check();
    await cd.getByRole("button", { name: "Create test" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`E2E paper ${tag}`);
    await expect(page.getByText("Published").first()).toBeVisible();
    await expect(page.getByText(/3 questions/).first()).toBeVisible();
    const testId = new URL(page.url()).searchParams.get("id")!;
    made.tests.push(testId);
    made.testId = testId;
    const admin = await apiAs(await session(editor), "GET", `/admin/tests/${testId}`);
    expect(admin.total_questions).toBe(3);
    expect(Number(admin.total_marks)).toBe(3);

    // 4. A student can see and start it.
    const st = await newSession(student);
    const detail = await apiAs(st, "GET", `/tests/${testId}`);
    expect(detail.total_questions).toBe(3);
    const attempt = await apiAs(st, "POST", `/tests/${testId}/attempts`, {});
    expect(attempt.questions?.length ?? attempt.total_questions).toBe(3);
    const listed = await apiAs(st, "GET", `/exams/${EXAM}/test-series`);
    expect(JSON.stringify(listed)).toContain(testId);

    const spare = await importPublished(`${tag}-spare`, null, 1);

    // 5. The test is now locked: the console says so and refuses to change its questions.
    await page.reload();
    await expect(page.getByText("Students have attempted this test")).toBeVisible();
    await expect(page.getByRole("button", { name: "Replace the question" })).toBeDisabled();

    // 6. A new version is a draft copy that can be edited; publishing it archives the old one.
    await page.getByRole("button", { name: "Make a new version" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Make a copy to edit" }).click();
    await expect(page.getByText("Version 2")).toBeVisible();
    await expect(page.getByText("Students have attempted this test")).toHaveCount(0);
    const v2 = new URL(page.url()).searchParams.get("id")!;
    made.tests.push(v2);
    expect(v2).not.toBe(testId);

    await page.getByLabel(/^Position to replace/).fill("1");
    await page.getByLabel(/^Find the new question/).fill(`${tag}-spare`);
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: "Replace the question" }).click();
    await expect(page.getByText("Question 1 replaced.")).toBeVisible();

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Published").first()).toBeVisible();
    const s = await session(editor);
    expect((await apiAs(s, "GET", `/admin/tests/${v2}`)).status).toBe("published");
    expect((await apiAs(s, "GET", `/admin/tests/${testId}`)).status).toBe("archived");
    void spare;
  });

  test("a locked test refuses a question swap with a clear message", async () => {
    test.skip(!made.testId, "needs the test made above");
    const s = await session(editor);
    const spare = await importPublished(`${Date.now().toString(36)}-lock`, null, 1);
    await expect(apiAs(s, "PUT", `/admin/tests/${made.testId}/questions/1`, { question_id: spare[0] })).rejects.toThrow(/test_locked|already has attempts/);
  });
});

test.describe("A4 screens at tablet and desktop width", () => {
  for (const key of ["papers", "tests", "series", "test-view"])
    for (const width of [768, 1280])
      test(`${key} @${width}`, async ({ page, context }) => {
        const path = key === "papers" ? `/papers?exam=${EXAM}` : key === "tests" ? "/tests" : key === "series" ? "/tests?tab=series" : made.testId ? `/tests/view?id=${made.testId}` : null;
        test.skip(!path, "needs the test made above");
        const csp: string[] = [];
        page.on("console", (m) => /violates the following|Content Security Policy/i.test(m.text()) && csp.push(m.text().slice(0, 160)));
        await signIn(context, await session(editor));
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path!);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(800);
        expect(await horizontalOverflow(page), "page scrolls sideways").toBeLessThanOrEqual(0);
        expect(csp).toEqual([]);
        const bad = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
      });
});
