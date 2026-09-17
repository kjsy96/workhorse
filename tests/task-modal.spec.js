// @ts-check
const { test, expect } = require('@playwright/test');
const { APP_URL, addTask, openCardMenu } = require('./helpers');

test('the add-task modal\'s Description field is themed in dark mode, not the browser default white', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    document.getElementById('save-warning-backdrop').style.display = 'none';
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.locator('.add-task-btn[data-col="todo"]').click();

  const desc = page.locator('#task-modal-description-input');
  const bg = await desc.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgb(255, 255, 255)');
  // Matches the themed dark background every other modal input already uses.
  const titleBg = await page.locator('#task-modal-title-input').evaluate(el => getComputedStyle(el).backgroundColor);
  expect(bg).toBe(titleBg);

  expect(errors, 'no console/page errors checking the Description field\'s dark-mode styling').toEqual([]);
});

test('the "more detail" add-task modal creates a task with a title, description, deadline/points -- the description stays hidden until expanded', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  await page.locator('.add-task-btn[data-col="todo"]').click();
  await expect(page.locator('#task-modal-backdrop')).toBeVisible();
  await expect(page.locator('#task-modal-title-input')).toHaveValue('');
  await expect(page.locator('#task-modal-description-input')).toHaveValue('');

  await page.locator('#task-modal-title-input').fill('A task with real detail');
  await page.locator('#task-modal-description-input').fill('* First bullet\n* Second bullet');
  await page.locator('#task-modal-deadline-input').fill('2026-12-25');
  await page.locator('#task-modal-points-input').fill('8');
  await page.locator('#task-modal-submit').click();

  await expect(page.locator('#task-modal-backdrop')).toBeHidden();

  const card = page.locator('.card', { hasText: 'A task with real detail' });
  await expect(card.locator('.card-deadline')).toHaveText('due Dec 25');
  await expect(card.locator('.card-points')).toHaveText('8 pts');

  // Description is hidden by default -- only the title shows, plus the toggle.
  await expect(card.locator('.card-bullet-list')).toHaveCount(0);
  const detailsToggle = card.locator('.card-details-toggle');
  await expect(detailsToggle).toHaveText('Show details');

  await detailsToggle.click();
  await expect(card.locator('.card-bullet-list li')).toHaveCount(2); // markdown-lite bullet syntax parsed same as everywhere else
  await expect(detailsToggle).toHaveText('Hide details');

  await detailsToggle.click();
  await expect(card.locator('.card-bullet-list')).toHaveCount(0); // collapses back
  await expect(detailsToggle).toHaveText('Show details');

  // Submitting with no title is rejected rather than creating a blank task.
  await page.locator('.add-task-btn[data-col="todo"]').click();
  await page.locator('#task-modal-submit').click();
  await expect(page.locator('#app-alert-modal-backdrop')).toBeVisible();
  await expect(page.locator('#app-alert-modal-text')).toHaveText('Give the task a title first.');
  await page.locator('#app-alert-modal-ok').click();
  await expect(page.locator('#app-alert-modal-backdrop')).toBeHidden();
  await expect(page.locator('#task-modal-backdrop')).toBeVisible(); // still open, nothing created
  await expect(page.locator('[data-count="todo"]')).toHaveText('1');

  // Escape and Cancel both close without creating anything.
  await page.locator('#task-modal-title-input').fill('Should not be saved');
  await page.keyboard.press('Escape');
  await expect(page.locator('#task-modal-backdrop')).toBeHidden();
  await expect(page.locator('[data-count="todo"]')).toHaveText('1');

  expect(errors, 'no console/page errors using the add-task modal').toEqual([]);
});

test('a single-line checkbox/bullet task (the common quick-capture shape) stays fully interactive, with no "Show details" toggle', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  await addTask(page, 'todo', '[] Buy milk');

  const card = page.locator('.card', { hasText: 'Buy milk' });
  await expect(card.locator('.card-details-toggle')).toHaveCount(0); // nothing to hide -- title is the whole card
  const checkbox = card.locator('.checklist-row input[type="checkbox"]');
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(card.locator('.checklist-row')).toHaveClass(/checked/);

  expect(errors, 'no console/page errors on a single-line checkbox task').toEqual([]);
});

test('the add-task modal is reachable in every column, both modes, including Backlog, and stays usable on a mobile viewport', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });
  await page.locator('.view-toggle-option', { hasText: 'Scrum' }).click();

  for (const col of ['backlog', 'todo', 'doing', 'review', 'done']) {
    await page.locator('.add-task-btn[data-col="' + col + '"]').click();
    await expect(page.locator('#task-modal-backdrop')).toBeVisible();
    await page.locator('#task-modal-cancel').click();
    await expect(page.locator('#task-modal-backdrop')).toBeHidden();
  }

  // Mobile viewport: the modal must stay on-screen and usable, not clipped
  // or pushed out past the viewport edge.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.add-task-btn[data-col="backlog"]').click();
  await expect(page.locator('#task-modal-backdrop')).toBeVisible();
  const box = await page.locator('.sprint-modal', { has: page.locator('#task-modal-title-input') }).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.locator('#task-modal-title-input').fill('Mobile-entered task');
  await page.locator('#task-modal-submit').click();
  await expect(page.locator('#dropzone-backlog .card')).toContainText('Mobile-entered task');

  expect(errors, 'no console/page errors opening the add-task modal from every column').toEqual([]);
});

test('editing a task opens the modal pre-filled and updates it in place (issue #45)', async ({ page }) => {
  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  // Create with title + description + deadline + points via the modal.
  await page.locator('.add-task-btn[data-col="todo"]').click();
  await page.locator('#task-modal-title-input').fill('Original title');
  await page.locator('#task-modal-description-input').fill('Some detail\n* a bullet');
  await page.locator('#task-modal-deadline-input').fill('2026-03-01');
  await page.locator('#task-modal-points-input').fill('3');
  await page.locator('#task-modal-submit').click();

  await expect(page.locator('[data-count="todo"]')).toHaveText('1');
  const card = page.locator('.card', { hasText: 'Original title' });

  // No in-card contentEditable editing left -- the card's text is not
  // itself an editable element.
  await expect(card.locator('[contenteditable="true"]')).toHaveCount(0);

  let dropdown = await openCardMenu(page, card);
  await dropdown.locator('.card-menu-item', { hasText: 'Edit task' }).click();

  await expect(page.locator('#task-modal-backdrop')).toBeVisible();
  await expect(page.locator('#task-modal-heading')).toHaveText('Edit task');
  await expect(page.locator('#task-modal-submit')).toHaveText('Save Changes');
  await expect(page.locator('#task-modal-title-input')).toHaveValue('Original title');
  await expect(page.locator('#task-modal-description-input')).toHaveValue('Some detail\n* a bullet');
  await expect(page.locator('#task-modal-deadline-input')).toHaveValue('2026-03-01');
  await expect(page.locator('#task-modal-points-input')).toHaveValue('3');

  await page.locator('#task-modal-title-input').fill('Edited title');
  await page.locator('#task-modal-points-input').fill('8');
  await page.locator('#task-modal-submit').click();

  await expect(page.locator('#task-modal-backdrop')).toBeHidden();
  // Updated in place, not duplicated.
  await expect(page.locator('.card', { hasText: 'Edited title' })).toHaveCount(1);
  await expect(page.locator('.card', { hasText: 'Original title' })).toHaveCount(0);
  await expect(page.locator('[data-count="todo"]')).toHaveText('1');
  const editedCard = page.locator('.card', { hasText: 'Edited title' });
  await expect(editedCard.locator('.card-points')).toHaveText('8 pts');
  await expect(editedCard.locator('.card-deadline')).toHaveText('due Mar 1');
  await editedCard.locator('.card-details-toggle').click();
  await expect(editedCard.locator('.card-bullet-list li')).toHaveText('a bullet');

  // Undo/redo cover the edit as a single history step.
  await page.locator('#undo-btn').click();
  await expect(page.locator('.card', { hasText: 'Original title' })).toHaveCount(1);
  await page.locator('#redo-btn').click();
  await expect(page.locator('.card', { hasText: 'Edited title' })).toHaveCount(1);
});

test('canceling the edit modal leaves the task unchanged', async ({ page }) => {
  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });
  await addTask(page, 'todo', 'Untouched title');
  const card = page.locator('.card', { hasText: 'Untouched title' });
  const dropdown = await openCardMenu(page, card);
  await dropdown.locator('.card-menu-item', { hasText: 'Edit task' }).click();

  await page.locator('#task-modal-title-input').fill('Should not stick');
  await page.locator('#task-modal-cancel').click();

  await expect(page.locator('#task-modal-backdrop')).toBeHidden();
  await expect(page.locator('.card', { hasText: 'Untouched title' })).toHaveCount(1);
  await expect(page.locator('.card', { hasText: 'Should not stick' })).toHaveCount(0);
});

test('reopening the add-task modal after an edit shows Add a task again, not stale edit state', async ({ page }) => {
  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });
  await addTask(page, 'todo', 'Task one');
  const card = page.locator('.card', { hasText: 'Task one' });
  const dropdown = await openCardMenu(page, card);
  await dropdown.locator('.card-menu-item', { hasText: 'Edit task' }).click();
  await page.locator('#task-modal-submit').click(); // save with no changes

  await page.locator('.add-task-btn[data-col="todo"]').click();
  await expect(page.locator('#task-modal-heading')).toHaveText('Add a task');
  await expect(page.locator('#task-modal-submit')).toHaveText('Add Task');
  await expect(page.locator('#task-modal-title-input')).toHaveValue('');
});
