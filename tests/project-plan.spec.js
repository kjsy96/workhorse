// @ts-check
const { test, expect } = require('@playwright/test');
const { APP_URL } = require('./helpers');

test('project plan path can be set, opens as a file:// link, edited, and cleared (issue #48)', async ({ page, context }) => {
  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  // Shown in Kanban mode by default (not Scrum-only).
  const addBtn = page.locator('.project-plan .save-status-btn', { hasText: 'Project Plan' });
  await expect(addBtn).toBeVisible();
  await addBtn.click();

  await expect(page.locator('#plan-modal-backdrop')).toBeVisible();
  await page.locator('#plan-path-input').fill('C:\\Users\\TestUser\\Documents\\Project X\\Plan.docx');
  await page.locator('#plan-modal-submit').click();
  await expect(page.locator('#plan-modal-backdrop')).toBeHidden();

  const link = page.locator('.project-plan-open');
  await expect(link).toBeVisible();
  await expect(link).toContainText('Plan.docx');
  const href = await link.getAttribute('href');
  expect(href).toBe('file:///C:/Users/TestUser/Documents/Project%20X/Plan.docx');
  await expect(link).toHaveAttribute('target', '_blank');

  // Clicking opens a new tab (target="_blank") rather than navigating the
  // app itself away -- the href assertion above is what actually proves the
  // file:// URL was built correctly; there's no real file at that path to
  // navigate to, so the popup's post-navigation URL isn't meaningful here.
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    link.click(),
  ]);
  await popup.close();

  // Switching to Scrum mode keeps the plan control visible too.
  await page.locator('.view-toggle-option', { hasText: 'Scrum' }).click();
  await expect(page.locator('.project-plan-open')).toBeVisible();
  await page.locator('.view-toggle-option', { hasText: 'Kanban' }).click();

  // Editing via the pencil button pre-fills the existing path.
  await page.locator('.project-plan-edit').click();
  await expect(page.locator('#plan-path-input')).toHaveValue('C:\\Users\\TestUser\\Documents\\Project X\\Plan.docx');
  await page.locator('#plan-path-input').fill('C:\\Users\\TestUser\\Documents\\Project X\\Scope.pdf');
  await page.locator('#plan-modal-submit').click();
  await expect(page.locator('.project-plan-open')).toContainText('Scope.pdf');

  // Undo/redo cover it like any other project-level edit.
  await page.locator('#undo-btn').click();
  await expect(page.locator('.project-plan-open')).toContainText('Plan.docx');
  await page.locator('#redo-btn').click();
  await expect(page.locator('.project-plan-open')).toContainText('Scope.pdf');

  // Clear returns to the "add" affordance.
  await page.locator('.project-plan-edit').click();
  await page.locator('#plan-modal-clear').click();
  await expect(page.locator('.project-plan .save-status-btn', { hasText: 'Project Plan' })).toBeVisible();
  await expect(page.locator('.project-plan-open')).toHaveCount(0);
});

test('a project with no planPath field (pre-issue-#48 save file) loads without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const state = {
      projects: [{
        id: 'p1', name: 'Legacy Project',
        todo: [], doing: [], done: [], backlog: [], mode: 'kanban',
        activeSprint: null, sprints: []
        // no planPath field at all -- pre-issue-#48 shape
      }],
      activeProjectId: 'p1'
    };
    localStorage.setItem('kanban-personal-board-v1', JSON.stringify(state));
  });
  await page.reload();
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  await expect(page.locator('.project-plan .save-status-btn', { hasText: 'Project Plan' })).toBeVisible();
  expect(errors, 'no console/page errors loading a pre-#48 project with no planPath').toEqual([]);
});

test('a plan path pasted with surrounding quotes (Explorer "Copy as path") still works (issue #53)', async ({ page }) => {
  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  await page.locator('.project-plan .save-status-btn', { hasText: 'Project Plan' }).click();
  await page.locator('#plan-path-input').fill('"C:\\Users\\TestUser\\Documents\\Project X\\Plan.docx"');
  await page.locator('#plan-modal-submit').click();

  const link = page.locator('.project-plan-open');
  await expect(link).toBeVisible();
  // Quotes should be stripped from the displayed filename too, not just the URL.
  await expect(link).toContainText('Plan.docx');
  await expect(link).not.toContainText('"');
  const href = await link.getAttribute('href');
  expect(href).toBe('file:///C:/Users/TestUser/Documents/Project%20X/Plan.docx');

  // Reopening the edit modal should show the clean, unquoted path too.
  await page.locator('.project-plan-edit').click();
  await expect(page.locator('#plan-path-input')).toHaveValue('C:\\Users\\TestUser\\Documents\\Project X\\Plan.docx');
});
