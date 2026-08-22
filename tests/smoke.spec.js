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

test('switching a project to Scrum mode reveals Backlog/Review and moves existing tasks there', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(KANBAN_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  // Kanban mode by default: Backlog/Review exist in the DOM but stay hidden.
  await expect(page.locator('.column[data-col="backlog"]')).toBeHidden();
  await expect(page.locator('.column[data-col="review"]')).toBeHidden();

  const input = page.locator('.add-input[data-col="todo"]');
  await input.fill('Pre-existing task');
  await input.press('Enter');
  await expect(page.locator('[data-count="todo"]')).toHaveText('1');

  page.once('dialog', (d) => d.accept());
  await page.locator('.toolbar-mode-btn').click();

  await expect(page.locator('.toolbar-mode-btn')).toHaveText('Scrum mode');
  await expect(page.locator('.column[data-col="backlog"]')).toBeVisible();
  await expect(page.locator('.column[data-col="review"]')).toBeVisible();
  await expect(page.locator('[data-count="backlog"]')).toHaveText('1');
  await expect(page.locator('[data-count="todo"]')).toHaveText('0');

  // Switching back to Kanban is a pure visibility change -- no data moves.
  await page.locator('.toolbar-mode-btn').click();
  await expect(page.locator('.toolbar-mode-btn')).toHaveText('Kanban mode');
  await expect(page.locator('.column[data-col="backlog"]')).toBeHidden();
  await expect(page.locator('[data-count="backlog"]')).toHaveText('1');

  expect(errors, 'no console/page errors while toggling Scrum mode').toEqual([]);
});

test('starting and completing a sprint moves items and records history', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(KANBAN_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  page.on('dialog', (d) => d.accept());
  await page.locator('.toolbar-mode-btn').click();
  await expect(page.locator('.toolbar-mode-btn')).toHaveText('Scrum mode');

  const backlogInput = page.locator('.add-input[data-col="backlog"]');
  await backlogInput.fill('Sprint task one');
  await backlogInput.press('Enter');
  await backlogInput.fill('Sprint task two');
  await backlogInput.press('Enter');
  await expect(page.locator('[data-count="backlog"]')).toHaveText('2');

  await page.locator('#project-toolbar button', { hasText: 'Start Sprint' }).click();
  await expect(page.locator('#sprint-modal-backdrop')).toBeVisible();

  await page.locator('#sprint-name-input').fill('Sprint 1');
  await page.locator('#sprint-goal-input').fill('Ship the thing');
  await page.locator('#sprint-start-input').fill('2026-01-01');
  await page.locator('#sprint-end-input').fill('2026-01-14');
  await page.locator('#sprint-modal-checklist .checklist-row', { hasText: 'Sprint task one' }).locator('input[type="checkbox"]').check();
  await page.locator('#sprint-modal-submit').click();

  await expect(page.locator('#sprint-modal-backdrop')).toBeHidden();
  await expect(page.locator('.sprint-info-name')).toHaveText('Sprint 1');
  await expect(page.locator('.sprint-info-goal')).toHaveText('Ship the thing');
  await expect(page.locator('[data-count="todo"]')).toHaveText('1');
  await expect(page.locator('[data-count="backlog"]')).toHaveText('1'); // task two stayed behind

  // drag the sprint's one task through In progress and Review before completing
  await page.locator('#dropzone-todo .card').dragTo(page.locator('#dropzone-review'));
  await expect(page.locator('[data-count="review"]')).toHaveText('1');

  await page.locator('#project-toolbar button', { hasText: 'Complete Sprint' }).click();

  await expect(page.locator('#project-toolbar button', { hasText: 'Start Sprint' })).toBeVisible();
  await expect(page.locator('[data-count="review"]')).toHaveText('0');
  await expect(page.locator('[data-count="backlog"]')).toHaveText('2'); // unfinished task returned

  await page.locator('.sprint-history-stack').click();
  await expect(page.locator('.sprint-history-row')).toContainText('Sprint 1');

  // reload and confirm the sprint history and mode both persisted (localStorage)
  await page.reload();
  await expect(page.locator('.toolbar-mode-btn')).toHaveText('Scrum mode');
  await expect(page.locator('[data-count="backlog"]')).toHaveText('2');

  expect(errors, 'no console/page errors across the sprint start/complete flow').toEqual([]);
});
