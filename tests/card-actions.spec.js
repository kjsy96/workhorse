// @ts-check
const { test, expect } = require('@playwright/test');
const { APP_URL, addTask, openCardMenu } = require('./helpers');

test('a card\'s creation date can be edited from the kebab menu, and can\'t be cleared', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  await addTask(page, 'todo', 'Task for creation date test');

  const card = page.locator('.card', { hasText: 'Task for creation date test' });
  let dropdown = await openCardMenu(page, card);
  const createdInput = dropdown.locator('.card-menu-deadline-row', { hasText: 'Created on' }).locator('input[type="date"]');

  const today = await page.evaluate(() => todayDateStr());
  await expect(createdInput).toHaveValue(today); // freshly created -- defaults to today

  await createdInput.fill('2026-01-05');
  await createdInput.blur();
  await expect(card.locator('.card-date')).toHaveText('Jan 5');

  await page.locator('#undo-btn').click();
  await expect(card.locator('.card-date')).not.toHaveText('Jan 5');
  await page.locator('#redo-btn').click();
  await expect(card.locator('.card-date')).toHaveText('Jan 5');

  // Clearing the field (e.g. an accidental full-select-and-delete) must not
  // leave the card with no creation date -- reverts to the last valid value.
  dropdown = await openCardMenu(page, card);
  const createdInput2 = dropdown.locator('.card-menu-deadline-row', { hasText: 'Created on' }).locator('input[type="date"]');
  await createdInput2.fill('');
  await createdInput2.blur();
  await expect(createdInput2).toHaveValue('2026-01-05');
  await expect(card.locator('.card-date')).toHaveText('Jan 5');

  expect(errors, 'no console/page errors editing/clearing the creation date').toEqual([]);
});

test('kebab menu dropdown stays within the viewport near the bottom edge (issue #47)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 }); // short viewport to force overflow
  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  // Fill the "To do" column with enough cards that the last one sits near
  // (or below) the bottom of a short viewport.
  for (let i = 0; i < 8; i++) {
    await addTask(page, 'todo', 'Task ' + i);
  }

  const lastCard = page.locator('.column[data-col="todo"] .card').last();
  await lastCard.scrollIntoViewIfNeeded();
  const dropdown = await openCardMenu(page, lastCard);

  const box = await dropdown.boundingBox();
  const viewport = page.viewportSize();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
});

test('kebab menu dropdown stays anchored to its button on window scroll instead of drifting', async ({ page }) => {
  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });
  for (let i = 0; i < 15; i++) {
    await addTask(page, 'todo', 'Task ' + i);
  }
  const firstCard = page.locator('.column[data-col="todo"] .card').first();
  const dropdown = await openCardMenu(page, firstCard);

  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(150);

  // Should still be open, repositioned to sit right under its (now
  // scrolled) button rather than drifting away or closing.
  await expect(dropdown).toBeVisible();
  const btnBox = await firstCard.locator('.card-menu-btn').boundingBox();
  const dropBox = await dropdown.boundingBox();
  expect(Math.abs(dropBox.y - (btnBox.y + btnBox.height + 4))).toBeLessThan(2);
});

test('copy button copies the task text to the clipboard and shows confirmation (issue #55)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  await page.locator('.add-task-btn[data-col="todo"]').click();
  await page.locator('#task-modal-title-input').fill('Copy me');
  await page.locator('#task-modal-description-input').fill('Line two\n* a bullet');
  await page.locator('#task-modal-submit').click();

  const card = page.locator('.card', { hasText: 'Copy me' });
  await card.hover();
  const copyBtn = card.locator('.card-copy-btn');
  await expect(copyBtn).toBeVisible();
  await copyBtn.click();

  // Windows' native clipboard always normalizes to CRLF line endings, so
  // \n round-trips as \r\n -- that's platform behavior, not a bug here.
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip.replace(/\r\n/g, '\n')).toBe('Copy me\nLine two\n* a bullet');

  await expect(copyBtn).toHaveClass(/copied/);
  await page.waitForTimeout(1400);
  await expect(copyBtn).not.toHaveClass(/copied/);
});

test('tapping the copy button on a touch device does not arm a drag', async ({ page }) => {
  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });
  await addTask(page, 'todo', 'Touch test task');
  const card = page.locator('.card', { hasText: 'Touch test task' });
  const box = await card.locator('.card-copy-btn').boundingBox();

  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true, cancelable: true }));
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });

  await page.waitForTimeout(600); // longer than TOUCH_LONG_PRESS_MS
  await expect(card).not.toHaveClass(/dragging/);
});
