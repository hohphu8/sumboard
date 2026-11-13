import { test, expect } from "@playwright/test";
import { sampleDocument } from "../../src/model.js";
import { STORAGE_KEY } from "../../src/persistence.js";
const cell = (page, id, field) =>
  page.locator(`[data-row="${id}"] [data-field="${field}"]`);
const row = (page, id) => page.locator(`[data-row="${id}"]`);
const title = (page) => page.getByLabel("Tên kế hoạch");
async function confirm(page) {
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
}
async function edit(page, id, field, value) {
  await cell(page, id, field).fill(value);
  await cell(page, id, field).press("Enter");
}
async function importJSON(page, value) {
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "plan.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        typeof value === "string" ? value : JSON.stringify(value),
      ),
    });
}

test("edits recalculate totals, undo/redo and reload retain the document", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(8);
  await expect(page.getByTestId("total")).toHaveText("7.025.000 ₫");
  await edit(page, "r_sample-1", "price", "2000000");
  await expect(page.getByTestId("total")).toHaveText("7.225.000 ₫");
  await expect(page.getByTestId("paid")).toHaveText("2.300.000 ₫");
  await expect(cell(page, "r_sample-2", "price")).toBeFocused();
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await expect(cell(page, "r_sample-1", "price")).toHaveValue("1800000");
  await page.getByRole("button", { name: "Làm lại", exact: true }).click();
  await expect(cell(page, "r_sample-1", "price")).toHaveValue("2000000");
  await row(page, "r_sample-1")
    .getByRole("checkbox", { name: /^Tính vào tổng/ })
    .uncheck();
  await expect(page.getByTestId("total")).toHaveText("5.225.000 ₫");
  await expect(page.getByTestId("paid")).toHaveText("300.000 ₫");
  await page.reload();
  await expect(cell(page, "r_sample-1", "price")).toHaveValue("2000000");
  await expect(
    row(page, "r_sample-1").getByRole("checkbox", { name: /^Tính vào tổng/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Hoàn tác", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test("filter and sort preserve keyed controls, total and separate visible subtotal", async ({
  page,
}) => {
  await page.goto("/");
  await cell(page, "r_sample-3", "name").evaluate((el) => {
    window.__originalCell = el;
  });
  await page.getByLabel("Sắp xếp", { exact: true }).selectOption("amount-desc");
  expect(
    await cell(page, "r_sample-3", "name").evaluate(
      (el) => el === window.__originalCell,
    ),
  ).toBe(true);
  await page.getByLabel("Lọc nhóm", { exact: true }).selectOption("Ăn uống");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.getByTestId("filtered-total")).toHaveText("1.875.000 ₫");
  await expect(page.getByTestId("total")).toHaveText("7.025.000 ₫");
  await page.getByLabel("Tìm hạng mục").fill("CA PHE");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Tìm hạng mục").fill("not-found");
  await expect(
    page.getByRole("heading", { name: "Chưa tìm thấy hạng mục." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bỏ bộ lọc" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(8);
  await expect(
    page.getByRole("button", { name: "Hoàn tác", exact: true }),
  ).toBeDisabled();
});

test("add, duplicate, delete and undo restore rows and focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Thêm dòng", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(9);
  const added = page.locator("tbody tr").last();
  await expect(added.locator("[data-field=name]")).toBeFocused();
  await added.locator("[data-field=name]").fill("Áo đồng phục");
  await added.locator("[data-field=name]").press("Enter");
  const id = await added.getAttribute("data-row");
  await edit(page, id, "quantity", "1,5");
  await edit(page, id, "price", "100001");
  await expect(added.locator(".amount-cell")).toHaveText("150.002 ₫");
  await added.getByRole("button", { name: /^Nhân đôi:/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await page
    .locator("tbody tr")
    .last()
    .getByRole("button", { name: /^Xóa:/ })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(9);
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(
    page.locator("tbody tr").last().locator("[data-field=name]"),
  ).toHaveValue("Áo đồng phục (bản sao)");
});

test("invalid edits and Escape preserve state; Enter supports reverse movement", async ({
  page,
}) => {
  await page.goto("/");
  await edit(page, "r_sample-1", "price", "-1");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(cell(page, "r_sample-1", "price")).toHaveValue("1800000");
  await expect(
    page.getByRole("button", { name: "Hoàn tác", exact: true }),
  ).toBeDisabled();
  await cell(page, "r_sample-1", "name").fill("unfinished");
  await cell(page, "r_sample-1", "name").press("Escape");
  await expect(cell(page, "r_sample-1", "name")).toHaveValue(
    "Không gian workshop",
  );
  await cell(page, "r_sample-2", "name").press("Shift+Enter");
  await expect(cell(page, "r_sample-1", "name")).toBeFocused();
  await page.getByLabel("Ngân sách của bạn").fill("6000000");
  await page.getByLabel("Ngân sách của bạn").press("Enter");
  await expect(page.getByTestId("remaining")).toHaveText("1.025.000 ₫");
  await expect(page.locator(".over-budget")).toBeVisible();
});

test("JSON download round-trips through confirmed import; invalid file and cancel preserve plan", async ({
  page,
}) => {
  await page.goto("/");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ Xuất JSON", exact: true }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  let body = "";
  for await (const chunk of stream) body += chunk.toString();
  expect(JSON.parse(body)).toEqual(sampleDocument());
  await importJSON(page, "{bad");
  await expect(page.getByRole("alert")).toContainText("JSON");
  await expect(title(page)).toHaveValue("Workshop cuối tuần");
  await importJSON(page, { ...JSON.parse(body), title: "Kế hoạch nhập" });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(title(page)).toHaveValue("Workshop cuối tuần");
  await importJSON(page, { ...JSON.parse(body), title: "Kế hoạch nhập" });
  await confirm(page);
  await expect(title(page)).toHaveValue("Kế hoạch nhập");
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await expect(title(page)).toHaveValue("Workshop cuối tuần");
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ Xuất CSV" }).click();
  expect((await csvDownload).suggestedFilename()).toMatch(/\.csv$/);
});

test("confirmed reset creates a useful empty state and can be undone", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bảng trống", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("tbody tr")).toHaveCount(8);
  await page.getByRole("button", { name: "Bảng trống", exact: true }).click();
  await confirm(page);
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(page.getByTestId("total")).toHaveText("0 ₫");
  await expect(
    page.getByRole("heading", { name: "Chỗ cho kế hoạch mới." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(8);
});

test("corrupt and quota-blocked storage stay visible and preserve the original", async ({
  page,
}) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "{corrupt"),
    STORAGE_KEY,
  );
  await page.goto("/");
  await expect(page.locator(".recovery")).toBeVisible();
  await edit(page, "r_sample-1", "price", "7");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBe("{corrupt");
  await page
    .getByRole("button", { name: "Ghi bản đang mở", exact: true })
    .click();
  await confirm(page);
  await expect(page.locator(".recovery")).toBeHidden();
  expect(
    JSON.parse(
      await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
    ).rows[0].price,
  ).toBe(7);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await edit(page, "r_sample-1", "price", "8");
  await expect(page.locator(".recovery")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("không lưu");
  await expect(cell(page, "r_sample-1", "price")).toHaveValue("8");
});

test("two tabs detect a newer save and require an explicit recovery choice", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await edit(page, "r_sample-1", "price", "100");
  const other = await context.newPage();
  await other.goto("/");
  await edit(other, "r_sample-1", "price", "200");
  await expect(page.locator(".recovery")).toBeVisible();
  await expect(cell(page, "r_sample-1", "price")).toHaveValue("100");
  await edit(page, "r_sample-1", "price", "300");
  expect(
    JSON.parse(
      await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
    ).rows[0].price,
  ).toBe(200);
  await page.getByRole("button", { name: "Dùng bản lưu", exact: true }).click();
  await confirm(page);
  await expect(cell(page, "r_sample-1", "price")).toHaveValue("200");
  await expect(page.locator(".recovery")).toBeHidden();
  await other.close();
});

test("a file read finishing after another edit cannot replace newer work", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    File.prototype.text = function () {
      return new Promise((resolve) => {
        window.__finishFile = resolve;
      });
    };
  });
  await importJSON(page, sampleDocument());
  await edit(page, "r_sample-1", "price", "999");
  await page.evaluate(
    (content) => window.__finishFile(content),
    JSON.stringify(sampleDocument()),
  );
  await expect(page.getByRole("alert")).toContainText("đã thay đổi");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(cell(page, "r_sample-1", "price")).toHaveValue("999");
});

test("mobile layout, reduced motion, help, CSP and local resources", async ({
  page,
}) => {
  const errors = [],
    remote = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      remote.push(request.url());
  });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      window.__csp.push(event.violatedDirective),
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(8);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Cách dùng" }).click();
  await expect(page.getByRole("dialog")).toContainText("500 dòng");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Cách dùng" })).toBeFocused();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

test("scope disposal cancels pending imports and global listeners", async ({
  page,
}) => {
  test.skip(
    process.env.SUMBOARD_PRODUCTION === "1",
    "Dev-only teardown probe is not shipped.",
  );
  await page.goto("/");
  await page.evaluate(() => {
    File.prototype.text = () =>
      new Promise((resolve) => {
        window.__finishFile = resolve;
      });
  });
  await importJSON(page, sampleDocument());
  await page.evaluate(() => window.__sumboard.dispose());
  await page.evaluate(
    (content) => window.__finishFile(content),
    JSON.stringify(sampleDocument()),
  );
  expect(await page.evaluate(() => document.querySelector("dialog").open)).toBe(
    false,
  );
  expect(
    await page.evaluate(() => {
      const event = new KeyboardEvent("keydown", {
        key: "s",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
  expect(await page.evaluate(() => window.__sumboard)).toBeUndefined();
});
