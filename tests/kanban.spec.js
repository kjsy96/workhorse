// @ts-check
const { test, expect } = require('@playwright/test');
const { APP_URL, addTask, openCardMenu, acceptAppConfirm, dismissAppConfirm, exitAutoRenameMode } = require('./helpers');

test('adding a task updates the column', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(APP_URL);

  // A fresh browser context has no save file connected, so the persistent
  // save-warning modal covers the board by design (see CLAUDE.md) -- hide it
  // for this CI check the same way manual testing does, since exercising the
  // actual File System Access picker isn't automatable in a headless run.
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  await addTask(page, 'todo', 'CI smoke test task');

  await expect(page.locator('#dropzone-todo .card')).toContainText('CI smoke test task');
  await expect(page.locator('[data-count="todo"]')).toHaveText('1');

  expect(errors, 'no console/page errors while adding a task').toEqual([]);
});

test('Kanban and Scrum are independent pools; the toggle never moves data, kebab-menu sends do', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  // Kanban view by default: Backlog/Review exist in the DOM but stay hidden.
  await expect(page.locator('.column[data-col="backlog"]')).toBeHidden();
  await expect(page.locator('.column[data-col="review"]')).toBeHidden();

  await addTask(page, 'todo', 'Kanban task');
  await expect(page.locator('[data-count="todo"]')).toHaveText('1');

  // Switching views is a pure visibility change -- no confirm, no data move.
  await page.locator('.view-toggle-option', { hasText: 'Scrum' }).click();
  await expect(page.locator('.view-toggle-option', { hasText: 'Scrum' })).toHaveClass(/active/);
  await expect(page.locator('.column[data-col="backlog"]')).toBeVisible();
  await expect(page.locator('.column[data-col="review"]')).toBeVisible();
  await expect(page.locator('[data-count="backlog"]')).toHaveText('0');

  await page.locator('.view-toggle-option', { hasText: 'Kanban' }).click();
  await expect(page.locator('.column[data-col="backlog"]')).toBeHidden();
  await expect(page.locator('[data-count="todo"]')).toHaveText('1'); // untouched by the round trip

  // Send the Kanban task to Scrum via its kebab menu.
  const card = page.locator('.card', { hasText: 'Kanban task' });
  let dropdown = await openCardMenu(page, card);
  await dropdown.locator('.card-menu-item', { hasText: 'Send to Scrum' }).click();
  await expect(page.locator('[data-count="todo"]')).toHaveText('0');

  await page.locator('.view-toggle-option', { hasText: 'Scrum' }).click();
  await expect(page.locator('[data-count="backlog"]')).toHaveText('1');

  // Send it back to Kanban.
  const scrumCard = page.locator('.card', { hasText: 'Kanban task' });
  dropdown = await openCardMenu(page, scrumCard);
  await dropdown.locator('.card-menu-item', { hasText: 'Send to Kanban' }).click();
  await expect(page.locator('[data-count="backlog"]')).toHaveText('0');

  await page.locator('.view-toggle-option', { hasText: 'Kanban' }).click();
  await expect(page.locator('[data-count="todo"]')).toHaveText('1');

  expect(errors, 'no console/page errors across view switching and pool sends').toEqual([]);
});

test('Kanban Done cards now track and show a completion date too, not just Scrum', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  await addTask(page, 'todo', 'Kanban done-date task');

  const card = page.locator('.card', { hasText: 'Kanban done-date task' });
  await expect(card.locator('.card-completed')).toBeHidden();

  // Before reaching Done, the kebab menu has no "Completed on" row at all.
  let dropdown = await openCardMenu(page, card);
  await expect(dropdown.locator('.card-menu-deadline-row', { hasText: 'Completed on' })).toBeHidden();
  await page.keyboard.press('Escape');

  const today = await page.evaluate(() => todayDateStr());
  await page.locator('#dropzone-todo .card', { hasText: 'Kanban done-date task' }).dragTo(page.locator('#dropzone-done'));
  await expect(card.locator('.card-completed')).toBeVisible();
  let completedAt = await page.evaluate(() =>
    activeProject().done.find(i => i.text === 'Kanban done-date task').completedAt);
  expect(completedAt).toBe(today);

  // Backdate it via the now-visible "Completed on" field; the footer badge follows.
  dropdown = await openCardMenu(page, card);
  const completedInput = dropdown.locator('.card-menu-deadline-row', { hasText: 'Completed on' }).locator('input[type="date"]');
  await expect(completedInput).toBeVisible();
  await completedInput.fill('2026-02-14');
  await completedInput.blur();
  await expect(card.locator('.card-completed')).toHaveText('done Feb 14');

  // Leaving Done clears it, mirroring the existing Scrum behavior.
  await page.keyboard.press('Escape');
  await page.locator('#dropzone-done .card', { hasText: 'Kanban done-date task' }).dragTo(page.locator('#dropzone-todo'));
  await expect(card.locator('.card-completed')).toBeHidden();
  completedAt = await page.evaluate(() =>
    activeProject().todo.find(i => i.text === 'Kanban done-date task').completedAt);
  expect(completedAt).toBeNull();

  expect(errors, 'no console/page errors around Kanban completion-date tracking').toEqual([]);
});

test('pre-issue-#32 Kanban Done items with no completedAt get backfilled on load', async ({ page }) => {
  const errors = [];

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const state = {
      projects: [{
        id: 'proj1', name: 'Legacy Kanban Project', mode: 'kanban',
        todo: [], doing: [],
        done: [{ id: 'd1', text: 'Old finished kanban task', created: Date.now(), deadline: null, points: null }],
        backlog: [], activeSprint: null, sprints: []
      }],
      activeProjectId: 'proj1'
    };
    localStorage.setItem('kanban-personal-board-v1', JSON.stringify(state));
  });
  await page.reload();
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  const today = await page.evaluate(() => todayDateStr());
  const backfilled = await page.evaluate(() => activeProject().done[0].completedAt);
  expect(backfilled).toBe(today);

  const card = page.locator('.card', { hasText: 'Old finished kanban task' });
  await expect(card.locator('.card-completed')).toBeVisible();

  expect(errors, 'no console/page errors migrating a legacy Kanban Done item').toEqual([]);
});

test('deleting a project asks via a themed confirm modal (issue #63); canceling keeps it, confirming removes it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  await page.locator('.project-tab-add').click();
  const newTab = page.locator('.project-tab', { hasText: 'New Project' });
  await expect(newTab).toBeVisible();
  await exitAutoRenameMode(page, newTab);

  // Canceling the themed confirm leaves the project untouched.
  await newTab.locator('.project-tab-close').click();
  await expect(page.locator('#app-confirm-modal-text')).toContainText('New Project');
  await dismissAppConfirm(page);
  await expect(newTab).toBeVisible();

  // Confirming removes it.
  await newTab.locator('.project-tab-close').click();
  await acceptAppConfirm(page);
  await expect(page.locator('.project-tab', { hasText: 'New Project' })).toHaveCount(0);

  expect(errors, 'no console/page errors around the themed delete-project confirm').toEqual([]);
});
