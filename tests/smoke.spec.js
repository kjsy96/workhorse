// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const url = require('url');

const KANBAN_URL = url.pathToFileURL(path.resolve(__dirname, '../kanban.html')).href;

test('loads with no console/page errors and the board renders', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(KANBAN_URL);

  await expect(page.locator('.version-badge')).toBeVisible();
  await expect(page.locator('.column[data-col="todo"]')).toBeVisible();
  await expect(page.locator('.column[data-col="doing"]')).toBeVisible();
  await expect(page.locator('.column[data-col="done"]')).toBeVisible();

  expect(errors, 'no console/page errors during initial load').toEqual([]);
});

test('adding a task updates the column', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(KANBAN_URL);

  // A fresh browser context has no save file connected, so the persistent
  // save-warning modal covers the board by design (see CLAUDE.md) -- hide it
  // for this CI check the same way manual testing does, since exercising the
  // actual File System Access picker isn't automatable in a headless run.
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  const input = page.locator('.add-input[data-col="todo"]');
  await input.fill('CI smoke test task');
  await input.press('Enter');

  await expect(page.locator('#dropzone-todo .card')).toContainText('CI smoke test task');
  await expect(page.locator('[data-count="todo"]')).toHaveText('1');

  expect(errors, 'no console/page errors while adding a task').toEqual([]);
});
