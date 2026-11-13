import { test, expect } from "@playwright/test";
import { sampleDocument } from "../../src/model.js";

test("touch editing, Tab commits and outside-input keyboard shortcuts work", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Thêm dòng", exact: true }).tap();
  const name = page.locator("tbody tr").last().locator("[data-field=name]");
  await expect(name).toBeFocused();
  await name.fill("Khoản chạm");
  await name.press("Tab");
  await expect(
    page.locator("tbody tr").last().locator("[data-field=category]"),
  ).toBeFocused();
  await page.getByRole("heading", { name: "Bảng chi phí" }).tap();
  await page.keyboard.press("Control+z");
  await expect(
    page.locator("tbody tr").last().locator("[data-field=name]"),
  ).toHaveValue("Hạng mục mới");
  await page.keyboard.press("Control+Shift+z");
  await expect(
    page.locator("tbody tr").last().locator("[data-field=name]"),
  ).toHaveValue("Khoản chạm");
  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await context.close();
});

test("imported markup stays text, duplicate IDs reject atomically, sample restore can undo", async ({
  page,
}) => {
  await page.goto("/");
  const doc = structuredClone(sampleDocument());
  doc.title = "<img src=x onerror=alert(1)>";
  doc.rows[0].name = "<script>window.__injected=1</script>";
  doc.rows[0].category = "__proto__";
  async function upload(value) {
    await page
      .locator("#import-file")
      .setInputFiles({
        name: "plan.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(value)),
      });
  }
  await upload(doc);
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByLabel("Tên kế hoạch")).toHaveValue(doc.title);
  await expect(
    page.locator('[data-row="r_sample-1"] [data-field=name]'),
  ).toHaveValue(doc.rows[0].name);
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  expect(await page.locator("#app img").count()).toBe(0);
  await upload({ ...doc, rows: [doc.rows[0], doc.rows[0]] });
  await expect(page.getByRole("alert")).toContainText("trùng");
  await expect(page.locator("tbody tr")).toHaveCount(8);
  await page.getByRole("button", { name: "Bảng mẫu", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByLabel("Tên kế hoạch")).toHaveValue(
    "Workshop cuối tuần",
  );
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await expect(page.getByLabel("Tên kế hoạch")).toHaveValue(doc.title);
});

test("blocked storage access still allows editing and export; cleanup revokes download resources", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Denied", "SecurityError");
      },
    });
    window.__urls = [];
    window.__revoked = [];
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      window.__urls.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      window.__revoked.push(url);
      revoke(url);
    };
  });
  await page.goto("/");
  await expect(page.locator(".recovery")).toBeVisible();
  const input = page.locator('[data-row="r_sample-1"] [data-field=price]');
  await input.fill("1");
  await input.press("Enter");
  await expect(page.getByTestId("total")).toHaveText("5.225.001 ₫");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ Xuất JSON", exact: true }).click();
  await downloaded;
  if (process.env.SUMBOARD_PRODUCTION !== "1") {
    await page.evaluate(() => window.__sumboard.dispose());
    expect(
      await page.evaluate(() =>
        window.__urls.every((url) => window.__revoked.includes(url)),
      ),
    ).toBe(true);
    await page.evaluate(() =>
      window.dispatchEvent(new StorageEvent("storage", { key: null })),
    );
  }
});
