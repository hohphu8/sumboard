import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { sampleDocument } from "../../src/model.js";
import { STORAGE_KEY } from "../../src/persistence.js";

test("500 rows retain keyed DOM across sorting and compute edits correctly", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const document = { ...sampleDocument() };
  document.rows = Array.from({ length: 500 }, (_, i) => ({
    ...document.rows[0],
    id: `r_load-${i}`,
    name: `Khoản ${i + 1}`,
    price: i + 1,
    paid: false,
  }));
  await page.addInitScript(
    ({ key, doc }) => localStorage.setItem(key, JSON.stringify(doc)),
    { key: STORAGE_KEY, doc: document },
  );
  const start = performance.now();
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(500);
  await expect(page.getByTestId("total")).toHaveText("125.250 ₫");
  const mountMs = performance.now() - start;
  await expect(
    page.getByRole("button", { name: "Thêm dòng", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    window.__rows = [...document.querySelectorAll("tbody tr")];
    window.__controls = window.__rows.map((row) =>
      row.querySelector("[data-field=name]"),
    );
  });
  const sortedAt = performance.now();
  await page.getByLabel("Sắp xếp", { exact: true }).selectOption("amount-desc");
  await expect(page.locator("tbody tr").first()).toHaveAttribute(
    "data-row",
    "r_load-499",
  );
  const sortMs = performance.now() - sortedAt;
  expect(
    await page.evaluate(() =>
      window.__rows.every(
        (row, i) =>
          row.isConnected &&
          row.querySelector("[data-field=name]") === window.__controls[i],
      ),
    ),
  ).toBe(true);
  const input = page.locator('[data-row="r_load-499"] [data-field=price]');
  const editAt = performance.now();
  await input.fill("1000");
  await input.press("Enter");
  await expect(page.getByTestId("total")).toHaveText("125.750 ₫");
  const editMs = performance.now() - editAt;
  await page.getByLabel("Tìm hạng mục").fill("Khoản 500");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByTestId("filtered-total")).toHaveText("1.000 ₫");
  await page.getByLabel("Tìm hạng mục").fill("");
  await expect(page.locator("tbody tr")).toHaveCount(500);
  await mkdir(".local", { recursive: true });
  await writeFile(
    `.local/workload-${process.env.SUMBOARD_PRODUCTION === "1" ? "prod" : "dev"}-${testInfo.project.name}.json`,
    JSON.stringify(
      {
        browser: testInfo.project.name,
        rows: 500,
        mountMs,
        sortMs,
        editMs,
        note: "Wall-clock Playwright interactions including waits; single run, not an FPS benchmark.",
      },
      null,
      2,
    ),
  );
});

test("capture desktop and mobile product for visual review", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Screenshots reviewed on Chrome; responsive behavior covered on all browsers.",
  );
  await mkdir(".local", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(8);
  await page.screenshot({ path: ".local/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".local/mobile.png", fullPage: true });
});
