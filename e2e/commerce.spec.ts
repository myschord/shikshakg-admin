import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { apiAs, createStaff, horizontalOverflow, newSession, sharedStudent, signIn, type Account } from "./helpers";

const EXAM = "bpsc";
let admin: Account;
let student: Account;
const cache = new Map<string, { at: number; session: Account }>();
async function session(a: Account): Promise<Account> {
  const hit = cache.get(a.email);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.session;
  const fresh = await newSession(a);
  cache.set(a.email, { at: Date.now(), session: fresh });
  return fresh;
}

const made: { codes: string[] } = { codes: [] };

test.beforeAll(async () => {
  admin = await createStaff("admin");
  student = await sharedStudent();
});

// Nothing stays on sale.
test.afterAll(async () => {
  const s = await session(admin);
  for (const code of made.codes) await apiAs(s, "PATCH", `/admin/products/${code}`, { status: "retired" }).catch(() => {});
});

test.describe("A6: products, prices and access (real backend)", () => {
  test("create a product, change its price, put it on sale, give and take away access", async ({ page, context }) => {
    test.setTimeout(180_000);
    const tag = Date.now().toString(36).toUpperCase();
    const code = `E2E_${tag}`;
    await signIn(context, await session(admin));

    // 1. A new product, with the form checking its fields first.
    await page.goto("/commerce");
    await page.getByRole("button", { name: "New product" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: "Create product" }).click();
    await expect(dlg.getByText("Enter a title.")).toBeVisible();
    await expect(dlg.getByText(/capital letters and digits/)).toBeVisible();
    await expect(dlg.getByText(/Enter an amount like 499/)).toBeVisible();
    await dlg.getByLabel(/^Exam/).selectOption(EXAM);
    await dlg.getByLabel(/^Product code/).fill(code.toLowerCase()); // typed in lower case, kept in capitals
    await expect(dlg.getByLabel(/^Product code/)).toHaveValue(code);
    await dlg.getByLabel(/^Title/).fill(`E2E product ${tag}`);
    await dlg.getByLabel(/^Days of access/).fill("30");
    await dlg.getByLabel(/^Price/).fill("499.50");
    await dlg.getByLabel(/^Crossed-out price/).fill("100");
    await dlg.getByRole("button", { name: "Create product" }).click();
    await expect(dlg.getByText("The crossed-out price must be at least the price.")).toBeVisible();
    await dlg.getByLabel(/^Crossed-out price/).fill("999");
    await dlg.getByRole("button", { name: "Create product" }).click();
    made.codes.push(code);
    const row = page.locator("tr", { hasText: code });
    await expect(row).toContainText("Draft");
    await expect(row).toContainText("₹499.50");
    await expect(row).toContainText("30 days");

    // 2. A new price; a start before the current one is refused with the server's reason.
    await row.getByRole("button", { name: /^Change price/ }).click();
    const pd = page.getByRole("dialog");
    await pd.getByRole("button", { name: "Set new price" }).click();
    await expect(pd.getByText(/Enter an amount like 499/)).toBeVisible();
    await pd.getByLabel(/^New price/).fill("399");
    await pd.getByLabel(/^Starts at/).fill("2020-01-01T10:00");
    await pd.getByRole("button", { name: "Set new price" }).click();
    await expect(pd.getByText(/must start after the current one/)).toBeVisible();
    await pd.getByLabel(/^Starts at/).fill("");
    await pd.getByRole("button", { name: "Set new price" }).click();
    await expect(row).toContainText("₹399.00");

    // 3. On sale: a student can now see it.
    await row.getByRole("button", { name: /^Put on sale/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Put on sale" }).click();
    await expect(row).toContainText("On sale");
    const st = await newSession(student);
    const seen = await apiAs(st, "GET", `/exams/${EXAM}/products`);
    expect(JSON.stringify(seen)).toContain(code);
    const one = await apiAs(st, "GET", `/products/${code}`);
    expect(Number(one.price)).toBe(399);

    // 4. Give the student access, then take it away.
    await page.getByRole("tab", { name: "Access" }).click();
    await page.getByRole("button", { name: "Give access" }).click();
    const gd = page.getByRole("dialog");
    await gd.getByRole("button", { name: "Give access" }).click();
    await expect(gd.getByText("Enter the student's email address.")).toBeVisible();
    await expect(gd.getByText("Choose what to give.")).toBeVisible();
    await expect(gd.getByText("Say why access is being given.")).toBeVisible();
    await gd.getByLabel(/^Student email/).fill(student.email);
    await gd.getByLabel(/^Give access like buying/).selectOption(code);
    await gd.getByLabel(/^Days of access/).fill("10");
    await gd.getByLabel(/^Reason/).fill("e2e goodwill");
    await gd.getByRole("button", { name: "Give access" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByLabel(/^Student email/).fill(student.email);
    await page.getByRole("button", { name: "Search" }).click();
    const grant = page.locator("tr", { hasText: "Given by staff" }).filter({ hasText: "Active" }).first();
    await expect(grant).toBeVisible();
    const access = await apiAs(st, "GET", `/exams/${EXAM}/access`);
    expect(JSON.stringify(access)).toContain("COURSE_ACCESS");

    await grant.getByRole("button", { name: /^Take away/ }).click();
    const rd = page.getByRole("alertdialog");
    await rd.getByRole("button", { name: "Take away access" }).click();
    await expect(rd.getByText("Say why access is being taken away.")).toBeVisible();
    await rd.getByLabel(/^Reason/).fill("e2e cleanup");
    await rd.getByRole("button", { name: "Take away access" }).click();
    await expect(page.locator("tr", { hasText: "e2e cleanup" })).toContainText("Revoked");
    const after = await apiAs(st, "GET", `/exams/${EXAM}/access`);
    expect(JSON.stringify(after)).not.toContain('"status":"active"');

    // 5. Orders can be searched; an address with no orders says so.
    await page.getByRole("tab", { name: "Orders" }).click();
    await page.getByLabel(/^Student email/).fill("nobody-e2e@example.com");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("No orders match")).toBeVisible();

    // 6. Retire it.
    await page.getByRole("tab", { name: "Products and prices" }).click();
    await page.locator("tr", { hasText: code }).getByRole("button", { name: /^Retire/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Retire", exact: true }).click();
    await expect(page.locator("tr", { hasText: code })).toContainText("Retired");
  });

  test("an editor cannot open Commerce", async ({ page, context }) => {
    const editor = await createStaff("content_editor");
    await signIn(context, await session(editor));
    await page.goto("/commerce");
    await expect(page.getByRole("heading", { name: /role cannot open this page/i })).toBeVisible();
  });
});

// A processed refund moves real money through Razorpay, so these use fixed server answers: they check what the
// screen shows and what it sends, not Razorpay.
test.describe("A6: the refund screen (server answers faked)", () => {
  const refund = { id: "11111111-1111-4111-8111-111111111111", order_id: "22222222-2222-4222-8222-222222222222", payment_id: "33333333-3333-4333-8333-333333333333", initiated_by: "44444444-4444-4444-8444-444444444444", processed_by: null, amount: "399.00", reason: "Bought by mistake", status: "requested", created_at: "2026-10-01T10:00:00Z", processed_at: null, note: null };

  test("process sends the amount and note, reject needs a reason", async ({ page, context }) => {
    await signIn(context, await session(admin));
    const sent: { url: string; body: unknown }[] = [];
    await page.route("**/api/v1/admin/refunds**", async (route) => {
      const req = route.request();
      if (req.method() === "GET") return route.fulfill({ json: { items: [refund], next_cursor: null, has_more: false } });
      sent.push({ url: req.url(), body: req.postDataJSON() });
      return route.fulfill({ json: { ...refund, status: "processed" } });
    });
    await page.goto("/commerce?tab=refunds");
    const row = page.locator("tr", { hasText: "Bought by mistake" });
    await expect(row).toContainText("₹399.00");

    await row.getByRole("button", { name: /^Reject/ }).click();
    const d = page.getByRole("alertdialog");
    await d.getByRole("button", { name: "Turn down" }).click();
    await expect(d.getByText("Tell the student why it was turned down.")).toBeVisible();
    await d.getByRole("button", { name: "Cancel" }).click();

    await row.getByRole("button", { name: /^Refund/ }).click();
    const p = page.getByRole("alertdialog");
    await expect(p).toContainText("cannot be undone");
    await p.getByLabel(/^Amount to refund/).fill("abc");
    await p.getByRole("button", { name: "Send refund" }).click();
    await expect(p.getByText(/Enter an amount like 250/)).toBeVisible();
    await p.getByLabel(/^Amount to refund/).fill("150.50");
    await p.getByLabel(/^Note/).fill("partial");
    await p.getByRole("button", { name: "Send refund" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toContain(`/refunds/${refund.id}/process`);
    expect(sent[0].body).toEqual({ amount: "150.50", note: "partial" });
  });

  test("a refused refund shows the server's reason", async ({ page, context }) => {
    await signIn(context, await session(admin));
    await page.route("**/api/v1/admin/refunds**", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: { items: [refund], next_cursor: null, has_more: false } });
      return route.fulfill({ status: 409, json: { error: { code: "refund_exceeds_captured", message: "That amount exceeds what's left to refund on this payment.", details: {}, request_id: "x" } } });
    });
    await page.goto("/commerce?tab=refunds");
    await page.locator("tr", { hasText: "Bought by mistake" }).getByRole("button", { name: /^Refund/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Send refund" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("exceeds what's left to refund");
  });
});

test.describe("A6 screens at tablet and desktop width", () => {
  for (const tab of ["products", "orders", "refunds", "access"])
    for (const width of [768, 1280])
      test(`${tab} @${width}`, async ({ page, context }) => {
        const csp: string[] = [];
        page.on("console", (m) => /violates the following|Content Security Policy/i.test(m.text()) && csp.push(m.text().slice(0, 160)));
        await signIn(context, await session(admin));
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/commerce?tab=${tab}`);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(800);
        expect(await horizontalOverflow(page), "page scrolls sideways").toBeLessThanOrEqual(0);
        expect(csp).toEqual([]);
        const bad = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
      });
});
