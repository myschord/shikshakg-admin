import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { apiAs, createStaff, horizontalOverflow, newSession, sharedStudent, signIn, type Account } from "./helpers";

const EXAM = "bpsc";
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

const made: { courses: string[]; courseId?: string; lectureId?: string } = { courses: [] };

test.beforeAll(async () => {
  editor = await createStaff("content_editor");
  student = await sharedStudent();
});

// Leave nothing live for students.
test.afterAll(async () => {
  const s = await session(editor);
  for (const id of made.courses) await apiAs(s, "PATCH", `/admin/courses/${id}`, { status: "archived" }).catch(() => {});
});

test.describe("A5: build a course and put a lecture in front of a student", () => {
  test("create, structure, upload a video, publish, and a student can watch the free lecture", async ({ page, context }) => {
    test.setTimeout(240_000);
    const tag = Date.now().toString(36);
    const slug = `e2e-course-${tag}`;
    await signIn(context, await session(editor));

    // 1. Create the course; the form checks the short code first.
    await page.goto("/courses");
    await page.getByRole("button", { name: "New course" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: "Create course" }).click();
    await expect(dlg.getByText("Enter a title.")).toBeVisible();
    await dlg.getByLabel(/^Exam/).selectOption(EXAM);
    await dlg.getByLabel(/^Title/).fill(`E2E course ${tag}`);
    await dlg.getByLabel(/^Short code/).fill("Not A Slug");
    await dlg.getByRole("button", { name: "Create course" }).click();
    await expect(dlg.getByText(/lowercase letters, digits and single dashes/)).toBeVisible();
    await dlg.getByLabel(/^Short code/).fill(slug);
    await dlg.getByRole("button", { name: "Create course" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`E2E course ${tag}`);
    const courseId = new URL(page.url()).searchParams.get("id")!;
    made.courses.push(courseId);
    made.courseId = courseId;

    // 2. Structure: a section, a chapter, two lectures; reorder and rename.
    await page.getByLabel("New section", { exact: true }).fill("Basics");
    await page.getByRole("button", { name: "Add section" }).click();
    await expect(page.getByRole("heading", { name: "Basics" })).toBeVisible();
    await page.getByLabel("New chapter in Basics").fill("Introduction");
    await page.getByRole("button", { name: "Add chapter" }).click();
    await expect(page.getByRole("heading", { name: "Introduction" })).toBeVisible();
    await page.getByLabel("New lecture in Introduction").fill("Lecture one");
    await page.getByRole("checkbox", { name: "Free preview" }).check();
    await page.getByRole("button", { name: "Add lecture" }).click();
    await expect(page.getByRole("link", { name: "Lecture one" })).toBeVisible();
    await page.getByLabel("New lecture in Introduction").fill("Lecture two");
    await page.getByRole("button", { name: "Add lecture" }).click();
    await expect(page.getByRole("link", { name: "Lecture two" })).toBeVisible();

    const order = () => page.locator("li a[href^='/courses/lecture']").allTextContents();
    expect(await order()).toEqual(["Lecture one", "Lecture two"]);
    await page.getByRole("button", { name: "Move lecture Lecture two up" }).click();
    await expect.poll(order).toEqual(["Lecture two", "Lecture one"]);
    await expect(page.getByRole("button", { name: "Move lecture Lecture two up" })).toBeDisabled();

    await page.getByRole("button", { name: "Rename section Basics" }).click();
    await page.getByLabel("New name for section Basics").fill("Foundations");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByRole("heading", { name: "Foundations" })).toBeVisible();

    // 3. The server's rules show as messages: a chapter with lectures stays, a course with nothing published cannot go live.
    await page.getByRole("button", { name: "Remove chapter Introduction" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /lectures first/i })).toBeVisible();
    await page.getByRole("button", { name: "Publish course" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText(/Publish at least one lecture/);
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

    // 4. Open "Lecture one": it cannot be published without a video.
    await page.getByRole("link", { name: "Lecture one" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Lecture one");
    const lectureId = new URL(page.url()).searchParams.get("id")!;
    made.lectureId = lectureId;
    await page.getByRole("button", { name: "Publish lecture" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText(/Upload the lecture's video/);
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

    // 5. Upload a video: wrong type is turned away on the page, then an MP4 goes up.
    await page.getByLabel("MP4 file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("no") });
    await expect(page.getByText("Use an MP4 video.")).toBeVisible();
    await page.getByLabel("MP4 file").setInputFiles({ name: "lecture.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(4096, 1) });
    await expect(page.getByRole("button", { name: "Upload video" })).toBeEnabled();
    await page.getByLabel(/^Length in seconds/).fill("90");
    await page.getByRole("button", { name: "Upload video" }).click();
    await expect(page.getByText("Video ready, 2 min")).toBeVisible();

    // 6. Topic, a link and a file.
    await page.getByLabel("Subject").selectOption({ index: 1 });
    await page.getByLabel("Topic", { exact: true }).selectOption({ index: 1 });
    await page.getByRole("button", { name: "Add topic" }).click();
    await expect(page.getByRole("button", { name: /^Remove topic/ })).toBeVisible();

    await page.getByLabel("Link title").fill("Reading list");
    await page.getByLabel("Address").fill("http://insecure.example");
    await page.getByRole("button", { name: "Add link" }).click();
    await expect(page.getByText("Enter an address that starts with https://.")).toBeVisible();
    await page.getByLabel("Address").fill("https://example.org/reading");
    await page.getByRole("button", { name: "Add link" }).click();
    await expect(page.getByText("https://example.org/reading")).toBeVisible();
    await page.getByLabel("File", { exact: true }).setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%e2e\n") });
    await page.getByRole("button", { name: "Upload file" }).click();
    await expect(page.getByText(/PDF, notes\.pdf/)).toBeVisible();
    await page.getByRole("button", { name: "Remove Reading list" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText("https://example.org/reading")).toHaveCount(0);

    // 7. Publish the lecture, then the course.
    await page.getByRole("button", { name: "Publish lecture" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Published").first()).toBeVisible();
    await page.getByRole("link", { name: /^Back to/ }).click();
    await page.getByRole("button", { name: "Publish course" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Published").first()).toBeVisible();
    await expect(page.getByText(/1 published lecture/)).toBeVisible();

    // 8. A student sees the course and can play the free-preview lecture.
    const st = await newSession(student);
    const list = await apiAs(st, "GET", `/exams/${EXAM}/courses`);
    expect(JSON.stringify(list)).toContain(courseId);
    const outline = await apiAs(st, "GET", `/courses/${courseId}`);
    expect(outline.lecture_count).toBe(1);
    const play = await apiAs(st, "GET", `/lectures/${lectureId}/playback`);
    expect(play.url).toBeTruthy();
    expect(play.duration_seconds).toBe(90);
    const lecture = await apiAs(st, "GET", `/lectures/${lectureId}`);
    expect(lecture.topics.length).toBe(1);
    expect(lecture.resources.length).toBe(1);

    // 9. Archiving takes it away from students.
    await page.getByRole("button", { name: "Archive" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.getByText("Archived").first()).toBeVisible();
    const after = await apiAs(st, "GET", `/exams/${EXAM}/courses`);
    expect(JSON.stringify(after)).not.toContain(courseId);
  });

  test("an empty section can be removed and a duplicate short code is explained", async ({ page, context }) => {
    test.skip(!made.courseId, "needs the course made above");
    await signIn(context, await session(editor));
    await page.goto(`/courses/view?id=${made.courseId}`);
    await page.getByLabel("New section", { exact: true }).fill("Temporary");
    await page.getByRole("button", { name: "Add section" }).click();
    await expect(page.getByRole("heading", { name: "Temporary" })).toBeVisible();
    await page.getByRole("button", { name: "Remove section Temporary" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Temporary" })).toHaveCount(0);

    const s = await session(editor);
    const course = await apiAs(s, "GET", `/admin/courses/${made.courseId}`);
    await page.goto("/courses");
    await page.getByRole("button", { name: "New course" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel(/^Exam/).selectOption(EXAM);
    await dlg.getByLabel(/^Title/).fill("Same code");
    await dlg.getByLabel(/^Short code/).fill(course.slug);
    await dlg.getByRole("button", { name: "Create course" }).click();
    await expect(dlg.getByText(/already exists/i)).toBeVisible();
  });
});

test.describe("A5 screens at tablet and desktop width", () => {
  for (const key of ["courses", "course", "lecture"])
    for (const width of [768, 1280])
      test(`${key} @${width}`, async ({ page, context }) => {
        const path = key === "courses" ? "/courses" : key === "course" ? (made.courseId ? `/courses/view?id=${made.courseId}` : null) : made.lectureId ? `/courses/lecture?id=${made.lectureId}` : null;
        test.skip(!path, "needs the course made above");
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

