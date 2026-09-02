// @ts-check
const { test, expect } = require('@playwright/test');
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

test('starting and completing a sprint moves items and records history', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  page.on('dialog', (d) => d.accept());
  await page.locator('.view-toggle-option', { hasText: 'Scrum' }).click();

  await addTask(page, 'backlog', 'Sprint task one');
  await addTask(page, 'backlog', 'Sprint task two');
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

  await page.locator('#project-toolbar button', { hasText: 'past sprint' }).click();
  await expect(page.locator('#sprint-history-modal-backdrop')).toBeVisible();
  await expect(page.locator('.sprint-history-row')).toContainText('Sprint 1');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sprint-history-modal-backdrop')).toBeHidden();

  // reload and confirm the sprint history and view both persisted (localStorage)
  await page.reload();
  await expect(page.locator('.view-toggle-option', { hasText: 'Scrum' })).toHaveClass(/active/);
  await expect(page.locator('[data-count="backlog"]')).toHaveText('2');

  expect(errors, 'no console/page errors across the sprint start/complete flow').toEqual([]);
});

test('story point estimates can be set, typed multi-digit, and cleared', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  await addTask(page, 'todo', 'Task with an estimate');
  await addTask(page, 'todo', 'Task with no estimate');

  const card = page.locator('.card', { hasText: 'Task with an estimate' });
  let dropdown = await openCardMenu(page, card);
  const pointsInput = dropdown.locator('.card-menu-date-input[type="number"]');

  // type digit-by-digit (not .fill()) to catch the historical "render() on
  // every keystroke steals focus" bug class this pattern exists to avoid
  await pointsInput.pressSequentially('13');
  await expect(pointsInput).toHaveValue('13');
  await pointsInput.blur();

  await expect(card.locator('.card-points')).toHaveText('13 pts');

  const unpointedCard = page.locator('.card', { hasText: 'Task with no estimate' });
  await expect(unpointedCard.locator('.card-points')).toBeHidden();

  // undo the points edit, then clear via the menu button
  await page.locator('#undo-btn').click();
  await expect(card.locator('.card-points')).toBeHidden();
  await page.locator('#redo-btn').click();
  await expect(card.locator('.card-points')).toHaveText('13 pts');

  dropdown = await openCardMenu(page, card);
  await dropdown.locator('.card-menu-item', { hasText: 'Clear points' }).click();
  await expect(card.locator('.card-points')).toBeHidden();

  expect(errors, 'no console/page errors while setting/clearing points').toEqual([]);
});

test('burndown chart derives from completion dates: leaving Done un-completes an item, and backdating shifts the chart', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  page.on('dialog', (d) => d.accept());
  await page.locator('.view-toggle-option', { hasText: 'Scrum' }).click();

  await addTask(page, 'backlog', 'Three point task');
  await addTask(page, 'backlog', 'Five point task');

  async function setPoints(taskText, value) {
    const card = page.locator('.card', { hasText: taskText });
    const dropdown = await openCardMenu(page, card);
    await dropdown.locator('.card-menu-date-input[type="number"]').fill(String(value));
    await dropdown.locator('.card-menu-date-input[type="number"]').blur();
    await page.keyboard.press('Escape'); // close the kebab menu so it doesn't block the next card
  }
  await setPoints('Three point task', 3);
  await setPoints('Five point task', 5);

  // no active sprint yet -- burndown container stays empty/hidden
  await expect(page.locator('#burndown-container')).toBeEmpty();

  await page.locator('#project-toolbar button', { hasText: 'Start Sprint' }).click();
  await page.locator('#sprint-name-input').fill('Points Sprint');
  await page.locator('#sprint-start-input').fill('2026-08-20');
  await page.locator('#sprint-end-input').fill('2026-09-03');
  const checklist = page.locator('#sprint-modal-checklist');
  await checklist.locator('.checklist-row', { hasText: 'Three point task' }).locator('input[type="checkbox"]').check();
  await checklist.locator('.checklist-row', { hasText: 'Five point task' }).locator('input[type="checkbox"]').check();
  await page.locator('#sprint-modal-submit').click();

  await expect(page.locator('.burndown-unit')).toHaveText('8 points at start');
  // SVG <path> visibility can false-negative on Playwright's bounding-box
  // heuristic for a perfectly horizontal/vertical line (zero-height/width
  // box even with stroke) -- assert the path data exists instead
  await expect(page.locator('.burndown-actual')).toHaveAttribute('d', /^M/);
  await expect(page.locator('.burndown-ideal')).toHaveAttribute('d', /^M/);

  const today = await page.evaluate(() => todayDateStr());
  let remainingToday = await page.evaluate(() => remainingAsOf(activeProject().activeSprint, todayDateStr()));
  expect(remainingToday).toBe(8); // baseline -- nothing done yet

  // Complete one task -- it should pick up today's date automatically, and
  // the chart (recomputed from completedAt, not a stored snapshot) should
  // reflect 5 remaining as of today.
  await page.locator('#dropzone-todo .card', { hasText: 'Three point task' }).dragTo(page.locator('#dropzone-done'));
  remainingToday = await page.evaluate(() => remainingAsOf(activeProject().activeSprint, todayDateStr()));
  expect(remainingToday).toBe(5);
  let completedAt = await page.evaluate(() =>
    activeProject().activeSprint.done.find(i => i.text === 'Three point task').completedAt);
  expect(completedAt).toBe(today);

  // Regression check for the completedAt-clearing fix: dragging a Done task
  // straight out to Backlog (bypassing To do/In progress/Review) must still
  // clear its completedAt -- otherwise a stale date could later ride into a
  // *different* future sprint and make that sprint's chart silently ignore
  // it. Removing a task that was already Done doesn't change "remaining"
  // either way (it wasn't counted as remaining before or after), so only
  // completedAt is asserted here.
  await page.locator('#dropzone-done .card', { hasText: 'Three point task' }).dragTo(page.locator('#dropzone-backlog'));
  completedAt = await page.evaluate(() =>
    activeProject().backlog.find(i => i.text === 'Three point task').completedAt);
  expect(completedAt).toBeNull();

  // Bring it back and re-complete it, restoring the "5 remaining" state.
  await page.locator('#dropzone-backlog .card', { hasText: 'Three point task' }).dragTo(page.locator('#dropzone-done'));
  remainingToday = await page.evaluate(() => remainingAsOf(activeProject().activeSprint, todayDateStr()));
  expect(remainingToday).toBe(5);

  // Bug report: moving a still-*pending* task out of the sprint (here, Five
  // point task, straight to Backlog) must reduce "remaining" -- it's no
  // longer part of the sprint's scope at all, done or not.
  await page.locator('#dropzone-todo .card', { hasText: 'Five point task' }).dragTo(page.locator('#dropzone-backlog'));
  remainingToday = await page.evaluate(() => remainingAsOf(activeProject().activeSprint, todayDateStr()));
  expect(remainingToday).toBe(0); // Three point task is done, Five point task left the sprint entirely

  // Bring it back for the backdating check below.
  await page.locator('#dropzone-backlog .card', { hasText: 'Five point task' }).dragTo(page.locator('#dropzone-todo'));
  remainingToday = await page.evaluate(() => remainingAsOf(activeProject().activeSprint, todayDateStr()));
  expect(remainingToday).toBe(5);

  // Bug report: the user should be able to edit/backdate a completion date
  // (e.g. they forgot to move the card until later) and have the chart
  // treat that earlier day as when it actually burned down, not "today."
  const card = page.locator('.card', { hasText: 'Three point task' });
  const dropdown = await openCardMenu(page, card);
  const completedInput = dropdown.locator('.card-menu-deadline-row', { hasText: 'Completed on' }).locator('input[type="date"]');
  await completedInput.fill('2026-08-21');
  await completedInput.blur();
  await page.keyboard.press('Escape');

  const remainingOnStartDay = await page.evaluate(() => remainingAsOf(activeProject().activeSprint, '2026-08-20'));
  const remainingAfterBackdatedDay = await page.evaluate(() => remainingAsOf(activeProject().activeSprint, '2026-08-21'));
  expect(remainingOnStartDay).toBe(8); // both tasks still pending as of the sprint's first day
  expect(remainingAfterBackdatedDay).toBe(5); // three-point task burned down as of the backdated day

  await page.locator('#theme-toggle-btn').click(); // confirm dark mode doesn't throw
  await expect(page.locator('.burndown-svg')).toBeVisible();

  // complete the sprint, start a fresh empty one -- must not throw on 0 total
  await page.locator('#project-toolbar button', { hasText: 'Complete Sprint' }).click();
  await page.locator('#project-toolbar button', { hasText: 'Start Sprint' }).click();
  await page.locator('#sprint-name-input').fill('Empty Sprint');
  await page.locator('#sprint-start-input').fill('2026-02-01');
  await page.locator('#sprint-end-input').fill('2026-02-05');
  await page.locator('#sprint-modal-submit').click();
  await expect(page.locator('.burndown-empty')).toBeVisible();

  expect(errors, 'no console/page errors across the burndown/completion-date flow').toEqual([]);
});

test('a pre-pool-separation archived sprint (completedItems, no nested arrays) migrates safely, its history is viewable, and starting a new sprint afterward still populates To do', async ({ page }) => {
  const errors = [];

  await page.goto(APP_URL);
  await page.evaluate(() => {
    // Exact original-v1.4 archived-sprint shape: Object.assign({}, activeSprint,
    // { completedAt, completedItems }) -- no todo/doing/review/done nested on
    // the sprint at all (those lived on the project directly back then).
    const oldShapeState = {
      projects: [{
        id: 'proj1', name: 'Legacy Project', mode: 'scrum',
        todo: [], doing: [], done: [],
        backlog: [],
        activeSprint: null,
        sprints: [{
          id: 'old-sprint-1', name: 'Sprint 1', goal: 'The original goal',
          startDate: '2026-01-01', endDate: '2026-01-14',
          unit: 'count', startingTotal: 2, burnHistory: [{ date: '2026-01-10', remaining: 1 }],
          completedAt: Date.now(),
          completedItems: [
            { id: 'old1', text: 'Old finished task one', created: Date.now(), deadline: null, points: null },
            { id: 'old2', text: 'Old finished task two', created: Date.now(), deadline: null, points: null }
          ]
        }]
      }],
      activeProjectId: 'proj1'
    };
    localStorage.setItem('kanban-personal-board-v1', JSON.stringify(oldShapeState));
  });
  await page.reload();
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  // Migration should have moved completedItems -> done, backfilled dates,
  // and given the sprint empty (but present) todo/doing/review arrays.
  const migrated = await page.evaluate(() => {
    const s = activeProject().sprints[0];
    return {
      hasCompletedItems: 'completedItems' in s,
      doneLen: s.done.length,
      doneCompletedAt: s.done[0].completedAt,
      todoIsArray: Array.isArray(s.todo)
    };
  });
  expect(migrated.hasCompletedItems).toBe(false);
  expect(migrated.doneLen).toBe(2);
  expect(migrated.doneCompletedAt).toBeTruthy();
  expect(migrated.todoIsArray).toBe(true);

  // Opening the history modal, then expanding a row's detail, must not
  // throw -- exercises the completedItems -> done migration fix directly
  // (the original bug: an unhandled exception reading `s.done` on the old
  // shape aborted renderProjectToolbar() partway through, wiping the whole
  // toolbar since it has no try/catch).
  await page.locator('#project-toolbar button', { hasText: 'past sprint' }).click();
  await expect(page.locator('#sprint-history-modal-backdrop')).toBeVisible();
  await expect(page.locator('.sprint-history-row')).toBeVisible();
  await page.locator('.sprint-history-row').click();
  await expect(page.locator('#sprint-detail-modal-backdrop')).toBeVisible(); // isolated into its own modal
  await expect(page.locator('.sprint-history-detail-item')).toHaveCount(2);
  await expect(page.locator('.sprint-history-detail-item').first()).toContainText('Old finished task');
  await expect(page.locator('.sprint-history-detail-date').first()).not.toBeEmpty();

  // Escape closes one layer at a time: detail modal first...
  await page.keyboard.press('Escape');
  await expect(page.locator('#sprint-detail-modal-backdrop')).toBeHidden();
  await expect(page.locator('#sprint-history-modal-backdrop')).toBeVisible(); // list still open underneath
  // ...then the list modal on a second press.
  await page.keyboard.press('Escape');
  await expect(page.locator('#sprint-history-modal-backdrop')).toBeHidden();

  // Starting a brand-new sprint afterward must still populate To do -- this
  // reproduces the full reported bug chain: exploring old sprint history
  // first (which leaves the ephemeral expanded-state pointing at the
  // now-expanded old sprint), then starting a new sprint. Before the fix,
  // every render from this point on re-threw inside renderProjectToolbar(),
  // which meant renderBoard() never ran and the new sprint's tasks never
  // visually appeared in To do even though they were correctly in the data.
  await addTask(page, 'backlog', 'Brand new task');
  await page.locator('#project-toolbar button', { hasText: 'Start Sprint' }).click();
  await page.locator('#sprint-name-input').fill('Sprint 2');
  await page.locator('#sprint-start-input').fill('2026-08-24');
  await page.locator('#sprint-end-input').fill('2026-09-07');
  await page.locator('#sprint-modal-checklist .checklist-row', { hasText: 'Brand new task' }).locator('input[type="checkbox"]').check();
  await page.locator('#sprint-modal-submit').click();
  await expect(page.locator('[data-count="todo"]')).toHaveText('1');
  await expect(page.locator('#dropzone-todo .card')).toContainText('Brand new task');

  expect(errors, 'no console/page errors migrating/viewing an old-shaped archived sprint').toEqual([]);
});

test('v1.4-shaped scrum project with an in-progress sprint migrates without data loss', async ({ page }) => {
  const errors = [];

  await page.goto(APP_URL);
  await page.evaluate(() => {
    // Exact v1.4 shape: todo/doing/review/done shared between Kanban and
    // (in scrum mode) the active sprint's board -- no nested arrays yet.
    const v14State = {
      projects: [{
        id: 'proj1', name: 'Real Project', mode: 'scrum',
        todo: [{ id: 't1', text: 'In progress sprint task', created: Date.now(), deadline: null, points: 5 }],
        doing: [{ id: 't2', text: 'Doing something', created: Date.now(), deadline: null, points: 3 }],
        review: [{ id: 't3', text: 'In review', created: Date.now(), deadline: null, points: 2 }],
        done: [{ id: 't4', text: 'Already finished', created: Date.now(), deadline: null, points: 1 }],
        backlog: [{ id: 't5', text: 'Not started yet', created: Date.now(), deadline: null, points: null }],
        activeSprint: {
          id: 's1', name: 'Sprint 7', goal: 'Ship the real thing',
          startDate: '2026-08-10', endDate: '2026-08-24',
          unit: 'points', startingTotal: 11
        },
        sprints: []
      }],
      activeProjectId: 'proj1'
    };
    localStorage.setItem('kanban-personal-board-v1', JSON.stringify(v14State));
  });
  await page.reload();
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  // Should already be in Scrum view (mode carried over) with all 5 items visible
  // in their correct new homes -- nothing silently dropped.
  await expect(page.locator('.view-toggle-option', { hasText: 'Scrum' })).toHaveClass(/active/);
  await expect(page.locator('[data-count="backlog"]')).toHaveText('1');
  await expect(page.locator('[data-count="todo"]')).toHaveText('1');
  await expect(page.locator('[data-count="doing"]')).toHaveText('1');
  await expect(page.locator('[data-count="review"]')).toHaveText('1');
  await expect(page.locator('[data-count="done"]')).toHaveText('1');
  await expect(page.locator('.sprint-info-name')).toHaveText('Sprint 7');
  await expect(page.locator('.sprint-info-goal')).toHaveText('Ship the real thing');

  await expect(page.locator('#dropzone-todo .card')).toContainText('In progress sprint task');
  await expect(page.locator('#dropzone-doing .card')).toContainText('Doing something');
  await expect(page.locator('#dropzone-review .card')).toContainText('In review');
  await expect(page.locator('#dropzone-done .card')).toContainText('Already finished');
  await expect(page.locator('#dropzone-backlog .card')).toContainText('Not started yet');

  // Kanban's own pool must be empty -- it never had this content.
  await page.locator('.view-toggle-option', { hasText: 'Kanban' }).click();
  await expect(page.locator('[data-count="todo"]')).toHaveText('0');
  await expect(page.locator('[data-count="doing"]')).toHaveText('0');
  await expect(page.locator('[data-count="done"]')).toHaveText('0');

  // Confirm the migrated shape is actually nested now, not just visually correct.
  const shape = await page.evaluate(() => {
    const p = activeProject();
    return {
      topLevelReview: p.review,
      activeSprintHasTodo: Array.isArray(p.activeSprint.todo),
      activeSprintTodoLen: p.activeSprint.todo.length,
      activeSprintDoneLen: p.activeSprint.done.length,
      backfilledCompletedAt: p.activeSprint.done[0].completedAt,
      today: todayDateStr()
    };
  });
  expect(shape.topLevelReview).toBeUndefined();
  expect(shape.activeSprintHasTodo).toBe(true);
  expect(shape.activeSprintTodoLen).toBe(1);
  expect(shape.activeSprintDoneLen).toBe(1);
  // PR3 migration: a pre-existing Done item with no completedAt gets
  // backfilled, so the recomputed burndown doesn't treat it as still-pending.
  expect(shape.backfilledCompletedAt).toBe(shape.today);

  expect(errors, 'no console/page errors migrating v1.4 scrum-mode data').toEqual([]);
});

test('sprint can be edited, deleted (returning even Done tasks to Backlog), and history shows what finished', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });
  page.on('dialog', (d) => d.accept());
  await page.locator('.view-toggle-option', { hasText: 'Scrum' }).click();

  async function startSprint(name, startDate, endDate, includeTaskTexts) {
    await page.locator('#project-toolbar button', { hasText: 'Start Sprint' }).click();
    await page.locator('#sprint-name-input').fill(name);
    await page.locator('#sprint-start-input').fill(startDate);
    await page.locator('#sprint-end-input').fill(endDate);
    for (const text of includeTaskTexts || []) {
      await page.locator('#sprint-modal-checklist .checklist-row', { hasText: text }).locator('input[type="checkbox"]').check();
    }
    await page.locator('#sprint-modal-submit').click();
  }

  // --- Edit ---
  await addTask(page, 'backlog', 'Task to delete-test');
  await startSprint('Sprint A', '2026-08-01', '2026-08-14', ['Task to delete-test']);

  await page.locator('#project-toolbar button', { hasText: 'Edit' }).click();
  await expect(page.locator('#sprint-modal-title')).toHaveText('Edit sprint');
  await expect(page.locator('#sprint-modal-checklist-section')).toBeHidden();
  await expect(page.locator('#sprint-name-input')).toHaveValue('Sprint A'); // pre-filled
  await page.locator('#sprint-name-input').fill('Sprint A Renamed');
  await page.locator('#sprint-end-input').fill('2026-08-21');
  await page.locator('#sprint-modal-submit').click();
  await expect(page.locator('.sprint-info-name')).toHaveText('Sprint A Renamed');

  // --- Delete, including an already-Done task ---
  await page.locator('#dropzone-todo .card').dragTo(page.locator('#dropzone-done'));
  await expect(page.locator('[data-count="done"]')).toHaveText('1');

  await page.locator('#project-toolbar button', { hasText: 'Delete Sprint' }).click();
  await expect(page.locator('#project-toolbar button', { hasText: 'Start Sprint' })).toBeVisible();
  await expect(page.locator('[data-count="backlog"]')).toHaveText('1'); // the Done task came back too
  await expect(page.locator('#project-toolbar button', { hasText: 'past sprint' })).toHaveCount(0); // deleted, not archived

  // The returned task's completedAt must be cleared, not carried along --
  // otherwise a future sprint that later picks it back up from Backlog
  // would have its burndown wrongly treat it as already completed.
  const returnedCompletedAt = await page.evaluate(() =>
    activeProject().backlog.find(i => i.text === 'Task to delete-test').completedAt);
  expect(returnedCompletedAt).toBeNull();

  await page.locator('#undo-btn').click();
  await expect(page.locator('.sprint-info-name')).toHaveText('Sprint A Renamed');
  await expect(page.locator('[data-count="done"]')).toHaveText('1');

  // --- History detail: complete a fresh sprint and view what finished ---
  await page.locator('#project-toolbar button', { hasText: 'Complete Sprint' }).click();
  await startSprint('Sprint B', '2026-09-01', '2026-09-14');
  await addTask(page, 'backlog', 'Second sprint task');
  await page.locator('#dropzone-backlog .card', { hasText: 'Second sprint task' }).dragTo(page.locator('#dropzone-done'));
  await page.locator('#project-toolbar button', { hasText: 'Complete Sprint' }).click();

  await page.locator('#project-toolbar button', { hasText: 'past sprint' }).click();
  await expect(page.locator('.sprint-history-row')).toHaveCount(2);
  const sprintBRow = page.locator('.sprint-history-row', { hasText: 'Sprint B' });
  await sprintBRow.click();
  await expect(page.locator('#sprint-detail-modal-title')).toHaveText('Sprint B');
  await expect(page.locator('.sprint-history-detail-item')).toContainText('Second sprint task');
  // closing the detail modal (via its own × button this time) returns to
  // the list modal, which is still open underneath rather than reset.
  await page.locator('#sprint-detail-modal-close').click();
  await expect(page.locator('#sprint-detail-modal-backdrop')).toBeHidden();
  await expect(page.locator('#sprint-history-modal-backdrop')).toBeVisible();

  expect(errors, 'no console/page errors across edit/delete/history-detail').toEqual([]);
});

test('past sprints can be reopened (blocked when one is already active) or deleted, with or without keeping their tasks', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const sprints = [
      {
        id: 'sprint-a', name: 'Sprint A', goal: 'Goal A',
        startDate: '2026-01-01', endDate: '2026-01-14',
        unit: 'count', startingTotal: 2, completedAt: Date.now(),
        todo: [], doing: [], review: [],
        done: [
          { id: 'a1', text: 'Sprint A task one', created: Date.now(), deadline: null, points: null, completedAt: '2026-01-10' },
          { id: 'a2', text: 'Sprint A task two', created: Date.now(), deadline: null, points: null, completedAt: '2026-01-12' }
        ]
      },
      {
        id: 'sprint-b', name: 'Sprint B', goal: 'Goal B',
        startDate: '2026-02-01', endDate: '2026-02-14',
        unit: 'count', startingTotal: 1, completedAt: Date.now(),
        todo: [], doing: [], review: [],
        done: [{ id: 'b1', text: 'Sprint B task', created: Date.now(), deadline: null, points: null, completedAt: '2026-02-10' }]
      },
      {
        id: 'sprint-c', name: 'Sprint C', goal: 'Goal C',
        startDate: '2026-03-01', endDate: '2026-03-14',
        unit: 'count', startingTotal: 1, completedAt: Date.now(),
        todo: [], doing: [], review: [],
        done: [{ id: 'c1', text: 'Sprint C task', created: Date.now(), deadline: null, points: null, completedAt: '2026-03-10' }]
      }
    ];
    const state = {
      projects: [{
        id: 'proj1', name: 'My Tasks', mode: 'scrum',
        todo: [], doing: [], done: [], backlog: [], activeSprint: null,
        sprints
      }],
      activeProjectId: 'proj1'
    };
    localStorage.setItem('kanban-personal-board-v1', JSON.stringify(state));
  });
  await page.reload();
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });

  let lastDialogMessage = '';
  page.on('dialog', (d) => { lastDialogMessage = d.message(); d.accept(); });

  // --- Reopen Sprint A: succeeds since nothing is currently active ---
  await page.locator('#project-toolbar button', { hasText: 'past sprint' }).click();
  await page.locator('.sprint-history-row', { hasText: 'Sprint A' }).click();
  await page.locator('#sprint-detail-modal-actions button', { hasText: 'Reopen Sprint' }).click();

  await expect(page.locator('#sprint-detail-modal-backdrop')).toBeHidden();
  await expect(page.locator('#sprint-history-modal-backdrop')).toBeHidden();
  await expect(page.locator('.sprint-info-name')).toHaveText('Sprint A');
  await expect(page.locator('[data-count="done"]')).toHaveText('2');

  const reopened = await page.evaluate(() => {
    const p = activeProject();
    return {
      activeSprintId: p.activeSprint && p.activeSprint.id,
      hasCompletedAt: p.activeSprint && ('completedAt' in p.activeSprint),
      sprintsCount: p.sprints.length
    };
  });
  expect(reopened.activeSprintId).toBe('sprint-a');
  expect(reopened.hasCompletedAt).toBe(false); // matches a freshly-started sprint's shape
  expect(reopened.sprintsCount).toBe(2); // A moved out of history, leaving B and C

  // --- Reopen Sprint B: blocked because Sprint A is now active ---
  await page.locator('#project-toolbar button', { hasText: 'past sprint' }).click();
  await page.locator('.sprint-history-row', { hasText: 'Sprint B' }).click();
  await page.locator('#sprint-detail-modal-actions button', { hasText: 'Reopen Sprint' }).click();
  expect(lastDialogMessage).toContain('Sprint A'); // explains *why*, naming the blocker

  const stillBlocked = await page.evaluate(() => {
    const p = activeProject();
    return { activeSprintId: p.activeSprint.id, sprintsCount: p.sprints.length };
  });
  expect(stillBlocked.activeSprintId).toBe('sprint-a'); // unchanged
  expect(stillBlocked.sprintsCount).toBe(2); // Sprint B is still archived, nothing silently swapped

  // --- Delete Sprint B (detail modal for it is still open), keeping its task in the Backlog ---
  await page.locator('.sprint-detail-delete-menu > button').click(); // opens the drop-up menu
  await expect(page.locator('.sprint-detail-delete-dropdown')).toHaveClass(/open/);
  // clicking elsewhere closes it without triggering either delete option
  await page.locator('#sprint-detail-modal-title').click();
  await expect(page.locator('.sprint-detail-delete-dropdown')).not.toHaveClass(/open/);
  expect(await page.evaluate(() => activeProject().sprints.length)).toBe(2); // nothing deleted yet

  await page.locator('.sprint-detail-delete-menu > button').click();
  await page.locator('.sprint-detail-delete-dropdown button', { hasText: 'Delete (Keep Tasks)' }).click();
  await expect(page.locator('#sprint-detail-modal-backdrop')).toBeHidden();
  await expect(page.locator('#sprint-history-modal-backdrop')).toBeVisible(); // list stays open, just refreshed
  await expect(page.locator('.sprint-history-row')).toHaveCount(1); // only Sprint C left

  const afterKeepDelete = await page.evaluate(() => {
    const p = activeProject();
    const backlogItem = p.backlog.find(i => i.text === 'Sprint B task');
    return {
      sprintsCount: p.sprints.length,
      backlogHasTask: !!backlogItem,
      backlogTaskCompletedAt: backlogItem ? backlogItem.completedAt : undefined
    };
  });
  expect(afterKeepDelete.sprintsCount).toBe(1);
  expect(afterKeepDelete.backlogHasTask).toBe(true);
  expect(afterKeepDelete.backlogTaskCompletedAt).toBeNull(); // cleared, not carried into a future sprint

  // --- Delete Sprint C, removing its task entirely ---
  await page.locator('.sprint-history-row', { hasText: 'Sprint C' }).click();
  await page.locator('.sprint-detail-delete-menu > button').click();
  await page.locator('.sprint-detail-delete-dropdown button', { hasText: 'Delete (Remove Tasks)' }).click();
  await expect(page.locator('#sprint-history-modal-body .sprint-history-detail-empty')).toHaveText('No past sprints.');

  const afterWipeDelete = await page.evaluate(() => {
    const p = activeProject();
    return {
      sprintsCount: p.sprints.length,
      backlogHasTask: p.backlog.some(i => i.text === 'Sprint C task')
    };
  });
  expect(afterWipeDelete.sprintsCount).toBe(0);
  expect(afterWipeDelete.backlogHasTask).toBe(false); // gone, not returned anywhere

  expect(errors, 'no console/page errors across reopen/blocked-reopen/delete flows').toEqual([]);
});

test('sprint date displays show the year only when it differs from the current year', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });
  await page.locator('.view-toggle-option', { hasText: 'Scrum' }).click();

  // Spans a year boundary but stays well under the long-span warning
  // threshold, so no confirm() dialog is involved here.
  await page.locator('#project-toolbar button', { hasText: 'Start Sprint' }).click();
  await page.locator('#sprint-name-input').fill('Year Boundary Sprint');
  await page.locator('#sprint-start-input').fill('2025-12-28');
  await page.locator('#sprint-end-input').fill('2026-01-04');
  await page.locator('#sprint-modal-submit').click();

  // Current year (2026, per the fixed system clock this app runs under in
  // this repo's dev/test environment) stays year-less; the off-year start
  // date shows its year so a typo like this can't hide in the UI again.
  await expect(page.locator('.sprint-info-dates')).toHaveText('Dec 28, 2025–Jan 4');

  expect(errors, 'no console/page errors checking sprint date year display').toEqual([]);
});

test('starting or editing a sprint with an implausibly long date range warns before proceeding', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });
  await page.locator('.view-toggle-option', { hasText: 'Scrum' }).click();

  await page.locator('#project-toolbar button', { hasText: 'Start Sprint' }).click();
  await page.locator('#sprint-name-input').fill('Way Too Long Sprint');
  await page.locator('#sprint-start-input').fill('2026-01-01');
  await page.locator('#sprint-end-input').fill('2026-06-01'); // 151 days

  // Dismissing the warning leaves the modal open and nothing gets created.
  let dialogMessage = '';
  page.once('dialog', (d) => { dialogMessage = d.message(); d.dismiss(); });
  await page.locator('#sprint-modal-submit').click();
  expect(dialogMessage).toContain('151 days');
  await expect(page.locator('#sprint-modal-backdrop')).toBeVisible();
  await expect(page.locator('#project-toolbar button', { hasText: 'Start Sprint' })).toBeVisible();

  // Accepting it proceeds as normal.
  page.once('dialog', (d) => d.accept());
  await page.locator('#sprint-modal-submit').click();
  await expect(page.locator('#sprint-modal-backdrop')).toBeHidden();
  await expect(page.locator('.sprint-info-name')).toHaveText('Way Too Long Sprint');

  // The same guard applies when editing an active sprint's dates, not just
  // on initial creation.
  await page.locator('#project-toolbar button', { hasText: 'Edit' }).click();
  await page.locator('#sprint-end-input').fill('2027-01-01');
  page.once('dialog', (d) => d.dismiss());
  await page.locator('#sprint-modal-submit').click();
  await expect(page.locator('#sprint-modal-backdrop')).toBeVisible();
  await expect(page.locator('.sprint-info-name')).toHaveText('Way Too Long Sprint'); // unchanged so far
  await page.locator('#sprint-modal-cancel').click();

  expect(errors, 'no console/page errors around the long-sprint-span warning').toEqual([]);
});

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

test('Start Sprint\'s backlog checklist has a working Select all toggle', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });
  await page.locator('.view-toggle-option', { hasText: 'Scrum' }).click();

  // Empty backlog: no Select all control, just the existing empty-state message.
  await page.locator('#project-toolbar button', { hasText: 'Start Sprint' }).click();
  await expect(page.locator('#sprint-modal-select-all')).toBeHidden();
  await expect(page.locator('.sprint-modal-empty')).toBeVisible();
  await page.locator('#sprint-modal-cancel').click();

  for (const text of ['Alpha task', 'Beta task', 'Gamma task']) {
    await addTask(page, 'backlog', text);
  }

  await page.locator('#project-toolbar button', { hasText: 'Start Sprint' }).click();
  const checklist = page.locator('#sprint-modal-checklist');
  const boxes = checklist.locator('input[type="checkbox"]');
  const selectAllBtn = page.locator('#sprint-modal-select-all');
  await expect(selectAllBtn).toBeVisible();
  await expect(selectAllBtn).toHaveText('Select all');
  for (const box of await boxes.all()) await expect(box).not.toBeChecked();

  // Select all: every box checks, label flips to let it also act as "deselect all".
  await selectAllBtn.click();
  for (const box of await boxes.all()) await expect(box).toBeChecked();
  await expect(selectAllBtn).toHaveText('Deselect all');

  // Manually unchecking one afterward isn't fought by anything.
  await checklist.locator('.checklist-row', { hasText: 'Beta task' }).locator('input[type="checkbox"]').uncheck();
  await expect(checklist.locator('.checklist-row', { hasText: 'Beta task' }).locator('input[type="checkbox"]')).not.toBeChecked();

  // Clicking again with a partial selection re-selects everything, including Beta.
  await selectAllBtn.click();
  for (const box of await boxes.all()) await expect(box).toBeChecked();
  await expect(selectAllBtn).toHaveText('Deselect all');

  // Clicking once more with everything checked deselects everything.
  await selectAllBtn.click();
  for (const box of await boxes.all()) await expect(box).not.toBeChecked();
  await expect(selectAllBtn).toHaveText('Select all');

  await page.locator('#sprint-modal-cancel').click();

  expect(errors, 'no console/page errors exercising the Select all toggle').toEqual([]);
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

test('Scrum mode widens the board (and stays aligned with the toolbar), Kanban keeps the narrower width', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });
  await page.setViewportSize({ width: 1600, height: 900 }); // wide enough that both caps are actually reachable

  async function maxWidthOf(selector) {
    return page.evaluate((sel) => parseInt(getComputedStyle(document.querySelector(sel)).maxWidth, 10), selector);
  }

  const kanbanBoardWidth = await maxWidthOf('.board');
  const kanbanToolbarWidth = await maxWidthOf('.project-toolbar');
  expect(kanbanBoardWidth).toBe(1160);
  expect(kanbanToolbarWidth).toBe(1160);

  await page.locator('.view-toggle-option', { hasText: 'Scrum' }).click();
  const scrumBoardWidth = await maxWidthOf('.board');
  const scrumToolbarWidth = await maxWidthOf('.project-toolbar');
  expect(scrumBoardWidth).toBeGreaterThan(kanbanBoardWidth);
  expect(scrumToolbarWidth).toBe(scrumBoardWidth); // stays aligned with the board, not left behind at Kanban's width

  // Switching back to Kanban reverts both.
  await page.locator('.view-toggle-option', { hasText: 'Kanban' }).click();
  expect(await maxWidthOf('.board')).toBe(1160);
  expect(await maxWidthOf('.project-toolbar')).toBe(1160);

  expect(errors, 'no console/page errors checking Scrum/Kanban board width').toEqual([]);
});

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
  page.once('dialog', (d) => d.dismiss());
  await page.locator('#task-modal-submit').click();
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

test('burndown total grows when scope is added to an already-started sprint (issue #46)', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto(APP_URL);
  await page.evaluate(() => {
    const backdrop = document.getElementById('save-warning-backdrop');
    if (backdrop) backdrop.style.display = 'none';
  });
  await page.locator('.view-toggle-option', { hasText: 'Scrum' }).click();

  await addTask(page, 'backlog', 'Task A');
  const cardA = page.locator('.card', { hasText: 'Task A' });
  const dropdownA = await openCardMenu(page, cardA);
  await dropdownA.locator('.card-menu-date-input[type="number"]').fill('5');
  await dropdownA.locator('.card-menu-date-input[type="number"]').blur();
  await page.keyboard.press('Escape');

  await page.locator('#project-toolbar button', { hasText: 'Start Sprint' }).click();
  await page.locator('#sprint-name-input').fill('Sprint 1');
  await page.locator('#sprint-start-input').fill('2026-01-01');
  await page.locator('#sprint-end-input').fill('2026-01-14');
  await page.locator('#sprint-modal-checklist .checklist-row', { hasText: 'Task A' }).locator('input[type="checkbox"]').check();
  await page.locator('#sprint-modal-submit').click();

  await expect(page.locator('.burndown-unit')).toHaveText('5 points at start');

  // Add a new task with points directly into the sprint's To do column --
  // i.e. scope added after the sprint already started.
  await addTask(page, 'todo', 'Task B');
  const cardB = page.locator('.card', { hasText: 'Task B' });
  const dropdownB = await openCardMenu(page, cardB);
  await dropdownB.locator('.card-menu-date-input[type="number"]').fill('8');
  await dropdownB.locator('.card-menu-date-input[type="number"]').blur();
  await page.keyboard.press('Escape');

  // Total scope is now 13 (5 + 8) -- the header should reflect it instead
  // of staying frozen at the sprint's starting total, and the axis top
  // label should have grown to match, so the remaining line never clips.
  await expect(page.locator('.burndown-unit')).toHaveText('13 points now (started with 5)');
  await expect(page.locator('.burndown-svg text').nth(2)).toHaveText('13');
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
  await page.locator('#plan-path-input').fill('C:\\Users\\Kevin\\Documents\\Project X\\Plan.docx');
  await page.locator('#plan-modal-submit').click();
  await expect(page.locator('#plan-modal-backdrop')).toBeHidden();

  const link = page.locator('.project-plan-open');
  await expect(link).toBeVisible();
  await expect(link).toContainText('Plan.docx');
  const href = await link.getAttribute('href');
  expect(href).toBe('file:///C:/Users/Kevin/Documents/Project%20X/Plan.docx');
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
  await expect(page.locator('#plan-path-input')).toHaveValue('C:\\Users\\Kevin\\Documents\\Project X\\Plan.docx');
  await page.locator('#plan-path-input').fill('C:\\Users\\Kevin\\Documents\\Project X\\Scope.pdf');
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
  await page.locator('#plan-path-input').fill('"C:\\Users\\Kevin\\Documents\\Project X\\Plan.docx"');
  await page.locator('#plan-modal-submit').click();

  const link = page.locator('.project-plan-open');
  await expect(link).toBeVisible();
  // Quotes should be stripped from the displayed filename too, not just the URL.
  await expect(link).toContainText('Plan.docx');
  await expect(link).not.toContainText('"');
  const href = await link.getAttribute('href');
  expect(href).toBe('file:///C:/Users/Kevin/Documents/Project%20X/Plan.docx');

  // Reopening the edit modal should show the clean, unquoted path too.
  await page.locator('.project-plan-edit').click();
  await expect(page.locator('#plan-path-input')).toHaveValue('C:\\Users\\Kevin\\Documents\\Project X\\Plan.docx');
});
