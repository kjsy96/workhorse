// @ts-check
const { test, expect } = require('@playwright/test');
const { APP_URL, addTask, openCardMenu, acceptAppConfirm, exitAutoRenameMode } = require('./helpers');

async function hideSaveWarning(page) {
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });
}

test('archiving a project hides it from the tab bar, keeps its tasks, and it can be reopened from the Archived Projects modal (issue #64)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await hideSaveWarning(page);

  await addTask(page, 'todo', 'Task in My Tasks');

  await page.locator('.project-tab-add').click();
  const sideProjectTab = page.locator('.project-tab', { hasText: 'New Project' });
  await expect(sideProjectTab).toBeVisible();
  await exitAutoRenameMode(page, sideProjectTab);
  await addTask(page, 'todo', 'Task in New Project');

  await expect(page.locator('.project-tabs-archived-btn')).toHaveCount(0); // nothing archived yet

  await sideProjectTab.locator('.project-tab-archive').click();
  await expect(page.locator('#app-confirm-modal-text')).toContainText('New Project');
  await acceptAppConfirm(page);

  await expect(page.locator('.project-tab', { hasText: 'New Project' })).toHaveCount(0); // gone from the tab bar
  await expect(page.locator('.project-tab', { hasText: 'My Tasks' })).toHaveClass(/active/); // switched away automatically

  const archivedBtn = page.locator('.project-tabs-archived-btn');
  await expect(archivedBtn).toHaveText('Archived (1)');
  await archivedBtn.click();

  const row = page.locator('.archived-project-row', { hasText: 'New Project' });
  await expect(row).toBeVisible();
  await expect(row.locator('.archived-project-meta')).toHaveText('1 task'); // its task survived the archive

  await row.locator('button', { hasText: 'Reopen' }).click();
  await expect(page.locator('#archived-projects-modal-backdrop')).toBeHidden(); // modal closes on reopen

  const reopenedTab = page.locator('.project-tab', { hasText: 'New Project' });
  await expect(reopenedTab).toBeVisible();
  await expect(reopenedTab).toHaveClass(/active/); // reopening switches straight to it
  await expect(page.locator('.card', { hasText: 'Task in New Project' })).toBeVisible();
  await expect(page.locator('.project-tabs-archived-btn')).toHaveCount(0); // list is empty again

  expect(errors, 'no console/page errors archiving and reopening a project').toEqual([]);
});

test('archiving is undoable, and a project can be permanently deleted from the Archived Projects list', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await hideSaveWarning(page);

  await page.locator('.project-tab-add').click();
  const sideProjectTab = page.locator('.project-tab', { hasText: 'New Project' });
  await expect(sideProjectTab).toBeVisible();
  await exitAutoRenameMode(page, sideProjectTab);

  await sideProjectTab.locator('.project-tab-archive').click();
  await acceptAppConfirm(page);
  await expect(page.locator('.project-tab', { hasText: 'New Project' })).toHaveCount(0);

  // Undo brings it straight back to the tab bar.
  await page.locator('#undo-btn').click();
  await expect(page.locator('.project-tab', { hasText: 'New Project' })).toBeVisible();
  await expect(page.locator('.project-tabs-archived-btn')).toHaveCount(0);

  // Redo archives it again, then permanently delete it from the archive list.
  await page.locator('#redo-btn').click();
  await page.locator('.project-tabs-archived-btn').click();
  const row = page.locator('.archived-project-row', { hasText: 'New Project' });
  await row.locator('button', { hasText: 'Delete' }).click();
  await acceptAppConfirm(page);

  await expect(page.locator('#archived-projects-modal-body')).toContainText('No archived projects.');
  await page.locator('#archived-projects-modal-close').click();
  await expect(page.locator('.project-tab', { hasText: 'New Project' })).toHaveCount(0); // gone for good

  expect(errors, 'no console/page errors undoing an archive and deleting from the archive list').toEqual([]);
});

test('the archive button on a tab is hidden when it is the only project left visible, and archived projects are excluded from the "Move to" menu', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await hideSaveWarning(page);

  await expect(page.locator('.project-tab', { hasText: 'My Tasks' }).locator('.project-tab-archive')).toHaveCount(0); // only one project total

  await page.locator('.project-tab-add').click();
  const sideProjectTab = page.locator('.project-tab', { hasText: 'New Project' });
  await expect(sideProjectTab).toBeVisible();
  await exitAutoRenameMode(page, sideProjectTab);

  await expect(page.locator('.project-tab', { hasText: 'My Tasks' }).locator('.project-tab-archive')).toBeVisible(); // now there are two

  // addProject() switches to the new project automatically -- switch back to
  // My Tasks so the task below lands there, leaving New Project as a valid
  // (non-active) move target to check for.
  await page.locator('.project-tab', { hasText: 'My Tasks' }).click();
  await addTask(page, 'todo', 'Movable task');
  let dropdown = await openCardMenu(page, page.locator('.card', { hasText: 'Movable task' }));
  await expect(dropdown.locator('.card-menu-item', { hasText: 'New Project' })).toBeVisible();
  await page.keyboard.press('Escape');

  await sideProjectTab.locator('.project-tab-archive').click();
  await acceptAppConfirm(page);

  // With New Project archived, it must not appear as a move target, and
  // My Tasks (now the only visible project) has no archive button of its own.
  await expect(page.locator('.project-tab', { hasText: 'My Tasks' }).locator('.project-tab-archive')).toHaveCount(0);
  dropdown = await openCardMenu(page, page.locator('.card', { hasText: 'Movable task' }));
  await expect(dropdown.locator('.card-menu-section-label', { hasText: 'Move to' })).toHaveCount(0);
  await expect(dropdown.locator('.card-menu-item', { hasText: 'New Project' })).toHaveCount(0);

  expect(errors, 'no console/page errors checking archive-button visibility and Move-to exclusion').toEqual([]);
});
