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

// Themed replacements for window.alert()/window.confirm() (issue #63) --
// these drive the shared #app-alert-modal-backdrop/#app-confirm-modal-backdrop
// instead of Playwright's page.on('dialog', ...) native-dialog API.
async function acceptAppConfirm(page) {
  await expect(page.locator('#app-confirm-modal-backdrop')).toBeVisible();
  await page.locator('#app-confirm-modal-ok').click();
  await expect(page.locator('#app-confirm-modal-backdrop')).toBeHidden();
}

async function dismissAppConfirm(page) {
  await expect(page.locator('#app-confirm-modal-backdrop')).toBeVisible();
  await page.locator('#app-confirm-modal-cancel').click();
  await expect(page.locator('#app-confirm-modal-backdrop')).toBeHidden();
}

async function dismissAppAlert(page) {
  await expect(page.locator('#app-alert-modal-backdrop')).toBeVisible();
  await page.locator('#app-alert-modal-ok').click();
  await expect(page.locator('#app-alert-modal-backdrop')).toBeHidden();
}

// addProject() arms rename mode on the new tab's name via requestAnimationFrame,
// *after* the tab itself is already visible -- under load, pressing Escape
// before that RAF callback actually runs misses rename mode's own Escape
// listener (which hasn't been attached yet), and a later click can then
// collide with rename mode's blur-triggered render() mid-click instead
// (render() replaces every .project-tab element, including the one a click
// was just dispatched to). Wait for contenteditable to actually flip before
// backing out of it.
async function exitAutoRenameMode(page, tab) {
  await expect(tab.locator('.project-tab-name')).toHaveAttribute('contenteditable', 'true');
  await page.keyboard.press('Escape');
  await expect(tab.locator('.project-tab-name')).toHaveAttribute('contenteditable', 'false');
}

module.exports = { APP_URL, addTask, openCardMenu, acceptAppConfirm, dismissAppConfirm, dismissAppAlert, exitAutoRenameMode };
