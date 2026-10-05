import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createStaff, horizontalOverflow, newSession, sharedStudent, signIn, studentEvents, type Account } from "./helpers";

let admin: Account;
let editor: Account;
let student: Account;

test.beforeAll(async () => {
  [admin, editor, student] = [await createStaff("admin"), await createStaff("content_editor"), await sharedStudent()];
});

const menu = async (page: Page) => (await page.getByRole("navigation", { name: "Console" }).locator("li").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").replace(/ ?Soon$/, "").trim());

async function loginUi(page: Page, a: Account) {
  await page.goto("/login");
  await page.getByLabel(/^Email/).fill(a.email);
  await page.getByLabel(/^Password/).fill(a.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("A0: sign-in and shell", () => {
  test("a student is refused and keeps no session", async ({ page }) => {
    await loginUi(page, student);
    await expect(page.locator("form").getByRole("alert")).toContainText("for ShikshakG staff");
    await expect(page).toHaveURL(/login/);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sga_")))).toEqual([]);
  });

  test("a student's own token never opens the console", async ({ page, context }) => {
    await signIn(context, await newSession(student));
    await page.goto("/");
    await expect(page).toHaveURL(/login/);
  });

  test("a wrong password shows the backend message", async ({ page }) => {
    await loginUi(page, { ...admin, password: "not-the-password" });
    await expect(page.locator("form").getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/login/);
  });

  test("an editor and an admin see different menus, and the editor is refused on an admin page", async ({ browser }) => {
    const e = await browser.newContext();
    const ep = await e.newPage();
    await loginUi(ep, editor);
    await expect(ep).toHaveURL(/localhost:3100\/$/);
    await expect(ep.locator("header")).toContainText("Content editor");
    const editorMenu = await menu(ep);
    expect(editorMenu).toContain("Exam dates");
    expect(editorMenu).not.toContain("Commerce");
    await ep.goto("/commerce");
    await expect(ep.getByRole("heading", { name: /role cannot open this page/i })).toBeVisible();

    const a = await browser.newContext();
    const ap = await a.newPage();
    await loginUi(ap, admin);
    await expect(ap.locator("header")).toContainText("Administrator");
    const adminMenu = await menu(ap);
    for (const item of ["Commerce", "AI controls", "Users and roles"]) expect(adminMenu).toContain(item);
    await ap.goto("/commerce");
    await expect(ap.getByRole("heading", { name: "Commerce" })).toBeVisible();
    await e.close();
    await a.close();
  });

  test("signing out ends the session and does not remember the page", async ({ page, context }) => {
    await signIn(context, await newSession(editor));
    await page.goto("/exam-dates");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/exam-dates");
    await expect(page).toHaveURL(/login/);
  });
});

test.describe("A1: exam dates", () => {
  test("staff publish a date and it reaches students, a correction replaces it, retiring removes it", async ({ page, context }) => {
    await signIn(context, await newSession(editor));
    const title = `[E2E] Tier 1 examination ${Date.now().toString(36)}`;
    await page.goto("/exam-dates?exam=ssc-cgl");
    await page.getByRole("button", { name: "Add a date" }).click();

    // Validation comes before any request.
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("An official source link is required.")).toBeVisible();
    await page.getByLabel(/^What is this date for/).selectOption("exam_date");
    await page.getByLabel(/^Title/).fill(title);
    await page.getByLabel(/^Date \(IST\)/).fill("2027-03-14");
    await page.getByLabel(/^Official source link/).fill("http://ssc.gov.in/notice");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Use a full link that starts with https://")).toBeVisible();
    await page.getByLabel(/^Official source link/).fill("https://ssc.gov.in/e2e-notice");
    await page.getByRole("button", { name: "Save draft" }).click();

    const row = page.locator("tr", { hasText: title });
    await expect(row).toContainText("Draft");
    expect((await studentEvents(await newSession(student), "ssc-cgl")).map((e) => e.title)).not.toContain(title);

    // Publish, with the confirmation that says who will see it.
    await row.getByRole("button", { name: /^Publish/ }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Students following this exam will see this date");
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish" }).click();
    await expect(row).toContainText("Published");
    const seen = (await studentEvents(await newSession(student), "ssc-cgl")).find((e) => e.title === title);
    expect(seen?.starts_on).toBe("2027-03-14");
    expect(seen?.certainty).toBe("tentative");
    expect(seen?.source_url).toBe("https://ssc.gov.in/e2e-notice");

    // Correct it: the published date stays until the correction is published.
    await row.getByRole("button", { name: /^Correct/ }).click();
    await page.getByLabel(/^Date \(IST\)/).fill("2027-03-21");
    await page.getByLabel(/^How sure is it/).selectOption("confirmed");
    await page.getByRole("button", { name: "Save correction as a draft" }).click();
    await expect(page.locator("tr", { hasText: "Replaces an earlier date" }).filter({ hasText: title })).toContainText("21 Mar 2027");
    expect((await studentEvents(await newSession(student), "ssc-cgl")).find((e) => e.title === title)?.starts_on).toBe("2027-03-14");

    const draft = page.locator("tr", { hasText: "Replaces an earlier date" }).filter({ hasText: title });
    await draft.getByRole("button", { name: /^Publish/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish" }).click();
    await expect(page.locator("tr", { hasText: "21 Mar 2027" }).filter({ hasText: title })).toContainText("Published");
    const after = (await studentEvents(await newSession(student), "ssc-cgl")).filter((e) => e.title === title);
    expect(after).toHaveLength(1);
    expect(after[0].starts_on).toBe("2027-03-21");

    // Clean up: retire it.
    const live = page.locator("tr", { hasText: "21 Mar 2027" }).filter({ hasText: title });
    await live.getByRole("button", { name: /^Retire/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Retire" }).click();
    await expect(live).toContainText("Retired");
    expect((await studentEvents(await newSession(student), "ssc-cgl")).map((e) => e.title)).not.toContain(title);
  });

  test("the stale queue lists dates that need a check", async ({ page, context }) => {
    await signIn(context, await newSession(editor));
    await page.goto("/exam-dates/stale");
    await expect(page.getByRole("heading", { name: "Dates that need a check" })).toBeVisible();
    // Either rows or the all-clear message: both are valid states, and the page must never be blank.
    await expect(page.getByText(/Everything is up to date|I checked it/).first()).toBeVisible();
  });
});

test.describe("every screen at tablet and desktop width", () => {
  const paths = ["/", "/exam-dates", "/exam-dates/stale", "/login"];
  for (const role of ["editor", "admin"] as const)
    for (const path of paths)
      for (const width of [768, 1280])
        test(`${role} ${path} @${width}`, async ({ page, context }) => {
          const csp: string[] = [];
          page.on("console", (m) => /violates the following|Content Security Policy/i.test(m.text()) && csp.push(m.text().slice(0, 160)));
          if (path !== "/login") await signIn(context, await newSession(role === "admin" ? admin : editor));
          await page.setViewportSize({ width, height: 900 });
          await page.goto(path);
          await page.waitForLoadState("networkidle").catch(() => {});
          await page.waitForTimeout(500);
          expect(await horizontalOverflow(page), "page scrolls sideways").toBeLessThanOrEqual(0);
          expect(csp).toEqual([]);
          const bad = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
          expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
        });
});
