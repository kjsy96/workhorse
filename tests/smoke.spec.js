// @ts-check
const { test, expect } = require('@playwright/test');
const { APP_URL } = require('./helpers');

test('loads with no console/page errors and the board renders', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(APP_URL);

  await expect(page.locator('.version-badge')).toBeVisible();
  await expect(page.locator('.column[data-col="todo"]')).toBeVisible();
  await expect(page.locator('.column[data-col="doing"]')).toBeVisible();
  await expect(page.locator('.column[data-col="done"]')).toBeVisible();

  expect(errors, 'no console/page errors during initial load').toEqual([]);
});
