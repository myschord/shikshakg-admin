import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { apiAs, createStaff, horizontalOverflow, newSession, signIn, type Account } from "./helpers";

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

let original: { values: Record<string, unknown>; version: number } | null = null;

/** The settings as they stood, minus anything an earlier run of these tests left behind. */
function clean(values: Record<string, unknown>): Record<string, unknown> {
  const pages = { ...((values.grounding_pages as Record<string, string>) ?? {}) };
  delete pages["e2e-topic"];
  return { ...values, grounding_pages: pages, dup_threshold: values.dup_threshold ?? 0.8, pyq_similarity_threshold: values.pyq_similarity_threshold ?? 0.8, paraphrase_threshold: values.paraphrase_threshold ?? 0.8 };
}

test.beforeAll(async () => {
  admin = await createStaff("admin");
  editor = await createStaff("content_editor");
  original = await apiAs(await session(admin), "GET", "/admin/ai/policy");
});

// Saving a policy makes a real new version on the local backend. Put the settings back as they were
// (a new version with the old values), so the stack behaves as before.
test.afterAll(async () => {
  if (original && original.version > 0) await apiAs(await session(admin), "PUT", "/admin/ai/policy", { exam_id: null, values: clean(original.values), note: "e2e restore" }).catch(() => {});
});

test.describe("A7: AI controls (real backend)", () => {
  test("the settings load, are checked, show what changes, and save as a new version", async ({ page, context }) => {
    test.setTimeout(120_000);
    await signIn(context, await session(admin));
    await page.goto("/ai-controls");
    await expect(page.getByRole("heading", { name: "AI controls" })).toBeVisible();
    const before = await apiAs(await session(admin), "GET", "/admin/ai/policy");
    await expect(page.getByLabel("Free requests per month")).toHaveValue(String(before.values.free_monthly_units));

    // Bad values are named per setting, and nothing is sent.
    await page.getByLabel("Free requests per month").fill("-1");
    await page.getByLabel("Creativity (0 to 1)").fill("2");
    await page.getByLabel("Source", { exact: true }).fill("Wiki Pedia");
    await page.getByRole("button", { name: "Review and save" }).click();
    await expect(page.getByText("Enter a value of 0 or more.")).toBeVisible();
    await expect(page.getByText("Enter a value from 0 to 1.").first()).toBeVisible();
    await expect(page.getByText("Use lowercase letters and underscores.")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /need fixing/ })).toBeVisible();

    // Fix them and change two real settings.
    const newFree = Number(before.values.free_monthly_units) + 2;
    await page.getByLabel("Free requests per month").fill(String(newFree));
    await page.getByLabel("Creativity (0 to 1)").fill(String(before.values.generation_temperature));
    await page.getByLabel("Source", { exact: true }).fill(String(before.values.grounding_provider));
    await page.getByLabel("Most questions in one request").fill("25");
    await page.getByRole("button", { name: "Review and save" }).click();
    const dlg = page.getByRole("alertdialog");
    await expect(dlg).toContainText("Free requests per month");
    await expect(dlg).toContainText(`${before.values.free_monthly_units} to ${newFree}`);
    await expect(dlg).toContainText("Most questions in one request");
    await expect(dlg.getByText("Creativity")).toHaveCount(0); // untouched settings are not listed
    await dlg.getByRole("button", { name: "Cancel" }).click();

    await page.getByLabel(/^Note for this version/).fill("e2e change");
    await page.getByRole("button", { name: "Review and save" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Save and use now" }).click();
    await expect(page.getByText(`Version ${before.version + 1}`)).toBeVisible();

    const after = await apiAs(await session(admin), "GET", "/admin/ai/policy");
    expect(after.version).toBe(before.version + 1);
    expect(after.values.free_monthly_units).toBe(newFree);
    expect(after.values.max_questions_per_request).toBe(25);
    expect(after.values.generation_temperature).toBe(before.values.generation_temperature);

    // Nothing changed now: the page says so and offers no dialog.
    await page.getByRole("button", { name: "Review and save" }).click();
    await expect(page.getByText("Nothing is different from the version in force.")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test("an unmeasured similarity limit is saved as unset, and a page for a topic is kept", async ({ page, context }) => {
    test.setTimeout(120_000);
    // Start from the settings as they were, so a rerun behaves the same.
    await apiAs(await session(admin), "PUT", "/admin/ai/policy", { exam_id: null, values: clean(original!.values), note: "e2e reset" });
    await signIn(context, await session(admin));
    await page.goto("/ai-controls");
    await page.getByRole("checkbox", { name: "Not measured yet" }).first().check();
    await page.getByRole("button", { name: "Add a page" }).click();
    await page.getByLabel("Topic code, row 1").fill("e2e-topic");
    await page.getByRole("button", { name: "Review and save" }).click();
    await expect(page.getByText("Fill in both the topic and the page title, or remove the row.")).toBeVisible();
    await page.getByLabel("Page title, row 1").fill("History of India");
    await page.getByRole("button", { name: "Review and save" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Save and use now" }).click();
    await expect(page.getByRole("note")).toContainText("never published automatically");
    const after = await apiAs(await session(admin), "GET", "/admin/ai/policy");
    expect(after.thresholds_calibrated).toBe(false);
    expect(after.values.dup_threshold).toBeNull();
    expect(after.values.grounding_pages).toEqual({ "e2e-topic": "History of India" });
  });

  test("the suspicious-question list loads and an editor cannot open the page", async ({ page, context }) => {
    await signIn(context, await session(admin));
    await page.goto("/ai-controls");
    await expect(page.getByRole("heading", { name: "Questions to double-check" })).toBeVisible();
    await expect(page.getByRole("table", { name: /almost never answer/ }).or(page.getByText("Nothing to check right now"))).toBeVisible();

    const ctx2 = await page.context().browser()!.newContext();
    const p2 = await ctx2.newPage();
    await signIn(ctx2, await session(editor));
    await p2.goto("http://localhost:3100/ai-controls");
    await expect(p2.getByRole("heading", { name: /role cannot open this page/i })).toBeVisible();
    await ctx2.close();
  });
});

test.describe("A7 screen at tablet and desktop width", () => {
  for (const width of [768, 1280])
    test(`ai controls @${width}`, async ({ page, context }) => {
      const csp: string[] = [];
      page.on("console", (m) => /violates the following|Content Security Policy/i.test(m.text()) && csp.push(m.text().slice(0, 160)));
      await signIn(context, await session(admin));
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/ai-controls");
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(800);
      expect(await horizontalOverflow(page), "page scrolls sideways").toBeLessThanOrEqual(0);
      expect(csp).toEqual([]);
      const bad = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    });
});
