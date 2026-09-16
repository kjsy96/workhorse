// @ts-check
const { expect } = require('@playwright/test');
const path = require('path');
const url = require('url');

const APP_URL = url.pathToFileURL(path.resolve(__dirname, '../workhorse.html')).href;

// Tasks are only ever created through the add-task modal now (issue #42) --
// this is the one place every test goes through to create one.
async function addTask(page, col, title) {
  await page.locator('.add-task-btn[data-col="' + col + '"]').click();
  await page.locator('#task-modal-title-input').fill(title);
  await page.locator('#task-modal-submit').click();
}

// Opens `card`'s kebab menu and returns its dropdown -- the dropdown lives
// in <body>, not nested under the card (issue #47, so it can't be clipped
// by a card/column ancestor), so it has to be located via `page`, not
// `card.locator(...)`. Safe to assume exactly one .open dropdown at a time,
// since opening any menu closes every other one first.
async function openCardMenu(page, card) {
  await card.hover();
  await card.locator('.card-menu-btn').click();
  const dropdown = page.locator('.card-menu-dropdown.open');
  await expect(dropdown).toBeVisible();
  return dropdown;
}

module.exports = { APP_URL, addTask, openCardMenu };
