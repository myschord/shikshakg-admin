import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { apiAs, createStaff, horizontalOverflow, newSession, signIn, type Account } from "./helpers";

// The catalog has no delete route, so these tests keep one fixed e2e-only category, exam and subject (listed last
// with order 9000) and create them through the screens only when they are missing. Reruns reuse them.
const CAT = "e2e-cat";
const EXAM = "e2e-exam";
const SUBJECT = "e2e-subject";
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
  editor = await createStaff("content_editor");
});

const pub = async (path: string) => (await fetch(`http://localhost:8020/api/v1${path}`)).json();
const hasCategory = async () => (await pub("/exam-categories")).some((c: { slug: string }) => c.slug === CAT);
const hasExam = async () => (await pub("/exam-categories")).some((c: { exams: { slug: string }[] }) => c.exams.some((e) => e.slug === EXAM));
const taxonomy = async () => apiAs(await session(editor), "GET", "/admin/subjects") as Promise<{ id: string; slug: string; name: string; topics: { id: string; slug: string; name: string; subtopics: { id: string; slug: string }[] }[] }[]>;

const go = async (page: Page, tab: string) => {
  await page.goto(`/catalog?tab=${tab}`);
  await expect(page.getByRole("heading", { level: 1, name: "Catalog" })).toBeVisible();
};

test.describe("A1: the catalog editor (real backend)", () => {
  test.describe.configure({ mode: "serial" });

  test("categories, exams and stages: checked, created once, edited", async ({ page, context }) => {
    test.setTimeout(150_000);
    await signIn(context, await session(editor));
    await go(page, "exams");

    // The forms check their fields first (this part runs every time).
    await page.getByRole("button", { name: "New category" }).click();
    const d = page.getByRole("dialog");
    await d.getByRole("button", { name: "Create category" }).click();
    await expect(d.getByText(/lowercase letters, digits and single dashes/)).toBeVisible();
    await expect(d.getByText("Enter a name.")).toBeVisible();
    if (!(await hasCategory())) {
      await d.getByLabel(/^Short code/).fill(CAT);
      await d.getByLabel(/^Name$|^Name \*/).first().fill("E2E category");
      await d.getByLabel(/^Order in the list/).fill("9000");
      await d.getByRole("button", { name: "Create category" }).click();
      await expect(page.getByRole("heading", { name: "E2E category" })).toBeVisible();
    } else {
      await d.getByRole("button", { name: "Cancel" }).click();
    }

    if (!(await hasExam())) {
      await page.getByRole("button", { name: "New exam" }).click();
      const e = page.getByRole("dialog");
      await e.getByRole("button", { name: "Create exam" }).click();
      await expect(e.getByText("Enter a name.")).toBeVisible();
      await e.getByLabel(/^Category/).selectOption(CAT);
      await e.getByLabel(/^Short code/).fill(EXAM);
      await e.getByLabel(/^Name \*/).fill("E2E exam");
      await e.getByLabel(/^Order in the list/).fill("9000");
      await e.getByRole("button", { name: "Create exam" }).click();
      await expect(page.getByText(EXAM, { exact: true })).toBeVisible();
    }

    // Stages: both are made through the screen when missing; a bad position is refused first.
    const section = page.getByRole("region", { name: "Category E2E category" });
    await section.getByRole("button", { name: /^E2E exam/ }).first().click();
    const have = (await pub(`/exams/${EXAM}`)).stages.map((s: { slug: string }) => s.slug);
    for (const [slug, name, seq] of [["prelims", "Prelims", "1"], ["mains", "Mains", "2"]]) {
      if (have.includes(slug)) continue;
      await section.getByRole("button", { name: /^Add a stage/ }).click();
      const s = page.getByRole("dialog");
      await s.getByLabel(/^Short code/).fill(slug);
      await s.getByLabel(/^Name \*/).fill(name);
      await s.getByLabel(/^Position in the exam/).fill("0");
      await s.getByRole("button", { name: "Add stage" }).click();
      await expect(s.getByText("Enter the position, starting at 1.")).toBeVisible();
      await s.getByLabel(/^Position in the exam/).fill(seq);
      await s.getByRole("button", { name: "Add stage" }).click();
      await expect(section.getByText(`${seq}. ${name}`)).toBeVisible();
    }

    // Edit the exam: short name and Hindi name round-trip through the public catalog.
    const tag = Date.now().toString(36);
    await section.getByRole("button", { name: /^Edit exam E2E exam/ }).click();
    const ed = page.getByRole("dialog");
    await ed.getByLabel(/^Short name/).fill(`E2E${tag}`);
    await ed.getByLabel(/^Name in Hindi/).fill("ई2ई परीक्षा");
    await ed.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const exam = await pub(`/exams/${EXAM}`);
    expect(exam.short_name).toBe(`E2E${tag}`);
    expect(exam.localized_names.hi).toBe("ई2ई परीक्षा");
    expect(exam.stages.map((s: { slug: string }) => s.slug)).toEqual(expect.arrayContaining(["prelims", "mains"]));

    await section.getByRole("button", { name: /^Edit stage Prelims/ }).click();
    await page.getByRole("dialog").getByLabel(/^Description/).fill(`First stage ${tag}`);
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    await expect(section.getByText(`First stage ${tag}`)).toBeVisible();
  });

  test("subjects and topics: added once, renamed, prerequisites with the loop refused", async ({ page, context }) => {
    test.setTimeout(150_000);
    await signIn(context, await session(editor));
    await go(page, "topics");
    const s0 = (await taxonomy()).find((s) => s.slug === SUBJECT);
    if (!s0) {
      await page.getByRole("button", { name: "New subject" }).click();
      const d = page.getByRole("dialog");
      await d.getByRole("button", { name: "Add", exact: true }).click();
      await expect(d.getByText(/lowercase letters, digits and single dashes/)).toBeVisible();
      await d.getByLabel(/^Short code/).fill(SUBJECT);
      await d.getByLabel(/^Name/).fill("E2E subject");
      await d.getByRole("button", { name: "Add", exact: true }).click();
    }
    await expect(page.getByRole("button", { name: /^E2E subject/ })).toBeVisible();
    await page.getByRole("button", { name: /^E2E subject/ }).click();
    const have = (await taxonomy()).find((s) => s.slug === SUBJECT)!.topics.map((t) => t.slug);
    for (const [slug, name] of [["e2e-topic-a", "E2E topic A"], ["e2e-topic-b", "E2E topic B"]]) {
      if (have.includes(slug)) continue;
      await page.getByRole("button", { name: /^Add a topic to E2E subject/ }).click();
      await page.getByRole("dialog").getByLabel(/^Short code/).fill(slug);
      await page.getByRole("dialog").getByLabel(/^Name/).fill(name);
      await page.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.getByText(name).first()).toBeVisible();
    }
    const topicA = (await taxonomy()).find((s) => s.slug === SUBJECT)!.topics.find((t) => t.slug === "e2e-topic-a")!;
    const topicB = (await taxonomy()).find((s) => s.slug === SUBJECT)!.topics.find((t) => t.slug === "e2e-topic-b")!;
    if (topicA.subtopics.length === 0) {
      await page.getByRole("button", { name: /^Add a subtopic to .*topic A/ }).click();
      await page.getByRole("dialog").getByLabel(/^Short code/).fill("e2e-sub-a1");
      await page.getByRole("dialog").getByLabel(/^Name/).fill("E2E sub A1");
      await page.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.getByText("E2E sub A1").first()).toBeVisible();
    }

    // Rename: the new name is what the server holds; the code stays.
    const tag = Date.now().toString(36);
    await page.getByRole("button", { name: /^Rename topic E2E topic A/ }).click();
    await page.getByRole("dialog").getByLabel(/^Name/).fill("");
    await page.getByRole("dialog").getByRole("button", { name: "Save name" }).click();
    await expect(page.getByRole("dialog").getByText("Enter a name.")).toBeVisible();
    await page.getByRole("dialog").getByLabel(/^Name/).fill(`E2E topic A ${tag}`);
    await page.getByRole("dialog").getByRole("button", { name: "Save name" }).click();
    await expect(page.getByText(`E2E topic A ${tag}`, { exact: true })).toBeVisible();
    const renamed = (await taxonomy()).find((s) => s.slug === SUBJECT)!.topics.find((t) => t.slug === "e2e-topic-a")!;
    expect(renamed.name).toBe(`E2E topic A ${tag}`);
    expect(renamed.id).toBe(topicA.id);

    // Prerequisites: B needs A is saved; A needing B would be a loop and is refused with the server's reason.
    await page.getByRole("button", { name: /^Prerequisites of E2E topic B/ }).click();
    const p = page.getByRole("dialog");
    await p.getByLabel("Find a topic").fill(`topic A ${tag}`);
    await p.getByRole("checkbox").first().check();
    await p.getByRole("button", { name: "Save prerequisites" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const pre = await apiAs(await session(editor), "GET", `/topics/${topicB.id}/prerequisites`);
    expect(pre.prerequisites.map((x: { topic_id: string }) => x.topic_id)).toEqual([topicA.id]);

    await page.getByRole("button", { name: new RegExp(`^Prerequisites of E2E topic A ${tag}`) }).click();
    const q = page.getByRole("dialog");
    await expect(q).toContainText("unlocks");
    await q.getByLabel("Find a topic").fill("topic B");
    await q.getByRole("checkbox").first().check();
    await q.getByRole("button", { name: "Save prerequisites" }).click();
    await expect(q.getByRole("alert")).toBeVisible();
    await q.getByRole("button", { name: "Cancel" }).click();

    // Leave it clean: B needs nothing.
    await page.getByRole("button", { name: /^Prerequisites of E2E topic B/ }).click();
    await page.getByRole("dialog").getByRole("checkbox", { checked: true }).first().uncheck();
    await page.getByRole("dialog").getByRole("button", { name: "Save prerequisites" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await apiAs(await session(editor), "GET", `/topics/${topicB.id}/prerequisites`)).prerequisites).toEqual([]);
  });

  test("syllabus: weightages are checked, order is kept, a shown-as name survives a round trip", async ({ page, context }) => {
    test.setTimeout(150_000);
    // Start empty so a rerun behaves the same.
    await apiAs(await session(editor), "PUT", `/admin/exams/${EXAM}/stages/prelims/syllabus`, { topics: [] });
    await signIn(context, await session(editor));
    await go(page, "syllabus");
    await page.getByLabel("Exam").selectOption(EXAM);
    await page.getByLabel("Stage").selectOption("prelims");
    await expect(page.getByText("No topics yet. Add some below.")).toBeVisible();

    await page.getByLabel("Find a topic").fill("E2E topic");
    const group = page.getByRole("group", { name: "Topics not in the syllabus" });
    await group.getByRole("checkbox").nth(0).check();
    await group.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: /^Add 2 chosen topics/ }).click();
    await expect(page.getByRole("heading", { name: "In this syllabus (2)" })).toBeVisible();

    const rows = page.locator("ol > li");
    const names = await rows.locator("p.font-semibold").allTextContents();
    await rows.nth(0).getByLabel(/^Weightage/).fill("60");
    await page.getByRole("button", { name: "Review and save" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "every topic, or for none" })).toBeVisible();
    await rows.nth(1).getByLabel(/^Weightage/).fill("30");
    await page.getByRole("button", { name: "Review and save" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "add up to 100" })).toBeVisible();
    await rows.nth(1).getByLabel(/^Weightage/).fill("40");
    await rows.nth(0).getByLabel(/^Shown as/).fill("Custom A name");
    await page.getByRole("button", { name: "Review and save" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("2 topics in all. 2 added, 0 removed.");
    await page.getByRole("alertdialog").getByRole("button", { name: "Save syllabus" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    let syl = await pub(`/exams/${EXAM}/syllabus?stage=prelims`);
    let topics = syl.subjects.flatMap((s: { topics: { name: string; weightage: string }[] }) => s.topics);
    expect(topics.map((t: { weightage: string }) => Number(t.weightage)).sort()).toEqual([40, 60]);
    expect(topics.map((t: { name: string }) => t.name)).toContain("Custom A name");

    // The round trip keeps the shown-as name (it is not turned into the topic's own name on the next save).
    await page.reload();
    await page.getByLabel("Exam").selectOption(EXAM);
    await page.getByLabel("Stage").selectOption("prelims");
    await expect(page.getByLabel(/^Shown as/).first()).toBeVisible();
    const shownValues = await page.getByLabel(/^Shown as/).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(shownValues).toContain("Custom A name");

    // Move the second up and save: the order the server returns follows.
    const first = (await rows.locator("p.font-semibold").allTextContents())[0];
    await page.getByRole("button", { name: new RegExp(`^Move ${(await rows.locator("p.font-semibold").allTextContents())[1]} up`) }).click();
    expect((await rows.locator("p.font-semibold").allTextContents())[1]).toBe(first);
    await page.getByRole("button", { name: "Review and save" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Save syllabus" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    syl = await pub(`/exams/${EXAM}/syllabus?stage=prelims`);
    topics = syl.subjects.flatMap((s: { topics: { name: string }[] }) => s.topics);
    expect(topics).toHaveLength(2);
    void names;
  });

  test("blueprints: checked, saved as a new version, then put in use", async ({ page, context }) => {
    test.setTimeout(150_000);
    await signIn(context, await session(editor));
    await go(page, "blueprints");
    await page.getByLabel("Exam").selectOption(EXAM);
    await page.getByLabel("Stage").selectOption("prelims");
    const before = await apiAs(await session(editor), "GET", `/admin/exams/${EXAM}/stages/prelims/blueprints`);

    await page.getByRole("button", { name: "New version" }).click();
    const d = page.getByRole("dialog");
    await d.getByRole("button", { name: "Save version" }).click();
    await expect(d.getByText("Enter a name.").first()).toBeVisible();
    await expect(d.getByText("Enter whole minutes, from 1 to 360.")).toBeVisible();
    await d.getByLabel(/^Name \*/).first().fill(`E2E blueprint ${Date.now().toString(36)}`);
    await d.getByLabel(/^Total time/).fill("90");
    await d.getByLabel(/^Name, section 1/).fill("General studies");
    await d.getByLabel(/^Questions, section 1/).fill("20");
    await d.getByLabel(/^Marks per question, section 1/).fill("2");
    await d.getByLabel(/^Marks lost per wrong answer, section 1/).fill("0.5");
    await d.getByLabel(/^Easy, section 1/).fill("50");
    await d.getByLabel(/^Medium, section 1/).fill("30");
    await d.getByRole("button", { name: "Save version" }).click();
    await expect(d.getByText(/add up to 80\. They must add up to 100/)).toBeVisible();
    await d.getByLabel(/^Hard, section 1/).fill("20");
    await d.getByRole("button", { name: "Add a section" }).click();
    await d.getByLabel(/^Name, section 2/).fill("Aptitude");
    await d.getByLabel(/^Questions, section 2/).fill("10");
    await d.getByLabel(/^Marks per question, section 2/).fill("2");
    await d.getByLabel(/^Marks lost per wrong answer, section 2/).fill("0.5");
    await expect(d.getByRole("status")).toContainText("30 questions, 60 marks");
    await d.getByRole("button", { name: "Save version" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const after = await apiAs(await session(editor), "GET", `/admin/exams/${EXAM}/stages/prelims/blueprints`);
    expect(after.length).toBe(before.length + 1);
    const created = after.find((b: { version: number }) => !before.some((o: { version: number }) => o.version === b.version));
    expect(created.total_questions).toBe(30);
    expect(Number(created.total_marks)).toBe(60);
    expect(created.duration_seconds).toBe(5400);

    const row = page.locator("tr", { hasText: created.name });
    await expect(row).toContainText("Not in use");
    await row.getByRole("button", { name: /^Use this version/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Use this version" }).click();
    await expect(row).toContainText("In use");
    const now = await apiAs(await session(editor), "GET", `/admin/exams/${EXAM}/stages/prelims/blueprints`);
    expect(now.filter((b: { is_active: boolean }) => b.is_active).map((b: { version: number }) => b.version)).toEqual([created.version]);
  });
});

test.describe("A1 screens at tablet and desktop width", () => {
  for (const tab of ["exams", "syllabus", "topics", "blueprints"])
    for (const width of [768, 1280])
      test(`catalog ${tab} @${width}`, async ({ page, context }) => {
        const csp: string[] = [];
        page.on("console", (m) => /violates the following|Content Security Policy/i.test(m.text()) && csp.push(m.text().slice(0, 160)));
        await signIn(context, await session(editor));
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/catalog?tab=${tab}`);
        if (tab === "topics") await page.getByRole("button", { name: /^E2E subject/ }).click().catch(() => {});
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(900);
        expect(await horizontalOverflow(page), "page scrolls sideways").toBeLessThanOrEqual(0);
        expect(csp).toEqual([]);
        const bad = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
      });
});
