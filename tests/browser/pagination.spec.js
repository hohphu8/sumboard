import { test, expect } from '@playwright/test';
import { sampleDocument } from '../../src/model.js';
import { STORAGE_KEY } from '../../src/persistence.js';

async function seed(page, count = 101) {
  const doc = { ...sampleDocument() };
  doc.rows = Array.from({ length: count }, (_, i) => ({ ...doc.rows[0], id: `r_page-${i}`,
    name: `Item ${i + 1}`, quantity: 1, price: i + 1, category: i % 2 ? 'Odd' : 'Even' }));
  await page.addInitScript(({ key, doc }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(doc));
  }, { key: STORAGE_KEY, doc });
  await page.goto('/');
}
const cell = (page, id, field = 'name') => page.locator(`[data-row="r_page-${id}"] [data-field="${field}"]`);

test('filter/sort cover all rows; view navigation leaves history and exported data unchanged', async ({ page }) => {
  await seed(page, 151);
  const original = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  await expect(page.getByTestId('total')).toHaveText('11.476 ₫');
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await page.getByLabel('Lọc nhóm').selectOption('Even');
  await expect(page.locator('#page-status')).toHaveText('Trang 1 / 2');
  await expect(page.getByTestId('filtered-total')).toHaveText('5.776 ₫');
  await page.getByLabel('Sắp xếp', { exact: true }).selectOption('amount-desc');
  await expect(page.locator('tbody tr').first()).toHaveAttribute('data-row', 'r_page-150');
  await expect(page.getByTestId('total')).toHaveText('11.476 ₫');
  await expect(page.getByRole('button', { name: 'Hoàn tác', exact: true })).toBeDisabled();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(original);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Xuất JSON/ }).click();
  const stream = await (await download).createReadStream();
  let text = ''; for await (const chunk of stream) text += chunk;
  expect(JSON.parse(text).rows).toHaveLength(151);
});

test('keyboard crosses pages, page clicks commit drafts and view changes do not add history', async ({ page }) => {
  await seed(page);
  await cell(page, 49).fill('Boundary edit');
  await cell(page, 49).press('Enter');
  await expect(page.locator('#page-status')).toHaveText('Trang 2 / 3');
  await expect(cell(page, 50)).toBeFocused();
  await cell(page, 50).press('Shift+Enter');
  await expect(cell(page, 49)).toBeFocused();
  await expect(cell(page, 49)).toHaveValue('Boundary edit');
  await cell(page, 49, 'price').fill('200');
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('5.301 ₫');
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('5.151 ₫');
  await expect(page.locator('#page-status')).toHaveText('Trang 2 / 3');
  await page.getByRole('button', { name: 'Làm lại', exact: true }).click();
  await expect(page.getByTestId('total')).toHaveText('5.301 ₫');
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(page.locator('#page-status')).toBeFocused();
  await page.getByLabel('Số dòng mỗi trang', { exact: true }).selectOption('100');
  await expect(page.locator('#page-status')).toHaveText('Trang 2 / 2');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(cell(page, 100)).toHaveAttribute('aria-label', 'Hạng mục dòng 101');
  await page.getByLabel('Tìm hạng mục').fill('Boundary edit');
  await expect(page.locator('#page-status')).toHaveText('Trang 1 / 1');
  await expect(page.getByTestId('filtered-total')).toHaveText('200 ₫');
  await expect(page.getByTestId('total')).toHaveText('5.301 ₫');
  await page.reload();
  await expect(page.locator('#page-status')).toHaveText('Trang 1 / 3');
  await expect(cell(page, 49, 'price')).toHaveValue('200');
});

test('add/duplicate reveal their page; deleting the last page and import/undo stay usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, 100);
  await page.getByRole('button', { name: 'Thêm dòng', exact: true }).click();
  await expect(page.locator('#page-status')).toHaveText('Trang 3 / 3');
  await expect(page.locator('tbody tr [data-field=name]')).toBeFocused();
  await page.getByRole('button', { name: /^Xóa: Hạng mục mới/ }).click();
  await expect(page.locator('#page-status')).toHaveText('Trang 2 / 2');
  await expect(cell(page, 99)).toBeFocused();
  await page.getByRole('button', { name: 'Nhân đôi: Item 100', exact: true }).click();
  await expect(page.locator('#page-status')).toHaveText('Trang 3 / 3');
  await expect(page.locator('tbody tr [data-field=name]')).toHaveValue('Item 100 (bản sao)');
  await expect(page.locator('tbody tr [data-field=name]')).toBeFocused();
  const imported = sampleDocument();
  await page.locator('input[type=file]').setInputFiles({ name: 'small.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await expect(page.locator('#page-status')).toHaveText('Trang 1 / 1');
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(50);
  await expect(page.locator('#page-status')).toHaveText('Trang 1 / 3');
  await page.getByLabel('Tìm hạng mục').fill('no such row');
  await expect(page.locator('#page-status')).toHaveText('Trang 1 / 1');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Trang sau', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (test.info().project.name === 'chromium') {
    await page.getByRole('button', { name: 'Bỏ bộ lọc', exact: true }).click();
    await page.screenshot({ path: '.local/pagination-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({ path: '.local/pagination-desktop.png', fullPage: true });
  }
});
