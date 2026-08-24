  function renderProjectToolbar() {
    const proj = activeProject();
    const toolbar = document.getElementById('project-toolbar');
    toolbar.innerHTML = '';

    document.getElementById('board').classList.toggle('mode-scrum', proj.mode === 'scrum');

    const toggleWrap = document.createElement('div');
    toggleWrap.className = 'view-toggle';
    ['kanban', 'scrum'].forEach(m => {
      const btn = document.createElement('button');
      btn.className = 'view-toggle-option' + (proj.mode === m ? ' active' : '');
      btn.textContent = m === 'kanban' ? 'Kanban' : 'Scrum';
      btn.addEventListener('click', () => setProjectMode(proj, m));
      toggleWrap.appendChild(btn);
    });
    toolbar.appendChild(toggleWrap);

    const burndownContainer = document.getElementById('burndown-container');
    if (proj.mode !== 'scrum' || !proj.activeSprint) {
      burndownContainer.innerHTML = '';
    }

    if (proj.mode !== 'scrum') return;

    if (proj.activeSprint) {
      const info = document.createElement('div');
      info.className = 'sprint-info';

      const nameEl = document.createElement('span');
      nameEl.className = 'sprint-info-name';
      nameEl.textContent = proj.activeSprint.name;
      info.appendChild(nameEl);

      if (proj.activeSprint.goal) {
        const goalEl = document.createElement('span');
        goalEl.className = 'sprint-info-goal';
        goalEl.textContent = proj.activeSprint.goal;
        info.appendChild(goalEl);
      }

      const datesEl = document.createElement('span');
      datesEl.className = 'sprint-info-dates';
      datesEl.textContent = formatDeadline(proj.activeSprint.startDate) + '–' + formatDeadline(proj.activeSprint.endDate);
      info.appendChild(datesEl);

      toolbar.appendChild(info);

      const editBtn = document.createElement('button');
      editBtn.className = 'save-status-btn';
      editBtn.textContent = 'Edit';
      editBtn.title = 'Edit sprint name, goal, or dates';
      editBtn.addEventListener('click', () => openEditSprintModal(proj));
      toolbar.appendChild(editBtn);

      const completeBtn = document.createElement('button');
      completeBtn.className = 'save-status-btn';
      completeBtn.textContent = 'Complete Sprint';
      completeBtn.addEventListener('click', () => completeSprint(proj));
      toolbar.appendChild(completeBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'save-status-btn';
      deleteBtn.textContent = 'Delete Sprint';
      deleteBtn.addEventListener('click', () => deleteSprint(proj));
      toolbar.appendChild(deleteBtn);

      renderBurndownChart(burndownContainer, proj.activeSprint);
    } else {
      const startBtn = document.createElement('button');
      startBtn.className = 'save-status-btn';
      startBtn.textContent = 'Start Sprint';
      startBtn.addEventListener('click', () => openStartSprintModal(proj));
      toolbar.appendChild(startBtn);
    }

    if (proj.sprints.length) {
      const historyBtn = document.createElement('button');
      historyBtn.className = 'save-status-btn';
      historyBtn.textContent = proj.sprints.length + ' past sprint' + (proj.sprints.length === 1 ? '' : 's');
      historyBtn.addEventListener('click', () => openSprintHistoryModal(proj));
      toolbar.appendChild(historyBtn);
    }
  }

  // Past sprints render in a modal rather than inline in the toolbar --
  // inline worked fine for one or two, but every sprint ever completed
  // would otherwise permanently push the board further down the page.
  // Selecting a row isolates that one sprint in a second modal on top of
  // this one, rather than expanding inline, so a long history list stays
  // scannable instead of growing a detail block per row you've looked at.
  function renderSprintHistoryModalBody(proj) {
    const body = document.getElementById('sprint-history-modal-body');
    body.innerHTML = '';
    if (!proj.sprints.length) {
      const empty = document.createElement('div');
      empty.className = 'sprint-history-detail-empty';
      empty.textContent = 'No past sprints.';
      body.appendChild(empty);
      return;
    }
    proj.sprints.slice().reverse().forEach(s => {
      const row = document.createElement('div');
      row.className = 'sprint-history-row';
      row.textContent = s.name + ' (' + formatDeadline(s.startDate) + '–' + formatDeadline(s.endDate) + ')' + (s.goal ? ' — ' + s.goal : '');
      row.addEventListener('click', () => openSprintDetailModal(proj, s));
      body.appendChild(row);
    });
  }

  function openSprintHistoryModal(proj) {
    renderSprintHistoryModalBody(proj);
    document.getElementById('sprint-history-modal-backdrop').style.display = 'flex';
  }

  function closeSprintHistoryModal() {
    document.getElementById('sprint-history-modal-backdrop').style.display = 'none';
    closeSprintDetailModal(); // defensive -- shouldn't be reachable while open, but never leave it orphaned
  }

  document.getElementById('sprint-history-modal-close').addEventListener('click', closeSprintHistoryModal);
  document.getElementById('sprint-history-modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'sprint-history-modal-backdrop') closeSprintHistoryModal();
  });

  // One isolated sprint's full detail -- opened from a row in the list
  // modal above, layered on top of it (higher z-index backdrop) rather than
  // replacing it, so closing this one returns to the list still open.
  function openSprintDetailModal(proj, sprint) {
    document.getElementById('sprint-detail-modal-title').textContent = sprint.name;
    document.getElementById('sprint-detail-modal-meta').textContent =
      formatDeadline(sprint.startDate) + '–' + formatDeadline(sprint.endDate) + (sprint.goal ? ' — ' + sprint.goal : '');

    const body = document.getElementById('sprint-detail-modal-body');
    body.innerHTML = '';
    if (!sprint.done.length) {
      const empty = document.createElement('div');
      empty.className = 'sprint-history-detail-empty';
      empty.textContent = 'Nothing was completed in this sprint.';
      body.appendChild(empty);
    } else {
      sprint.done.forEach(item => {
        const line = document.createElement('div');
        line.className = 'sprint-history-detail-item';
        const textSpan = document.createElement('span');
        textSpan.textContent = item.text.split('\n')[0].slice(0, 100);
        line.appendChild(textSpan);
        if (item.completedAt) {
          const dateSpan = document.createElement('span');
          dateSpan.className = 'sprint-history-detail-date';
          dateSpan.textContent = formatDeadline(item.completedAt);
          line.appendChild(dateSpan);
        }
        body.appendChild(line);
      });
    }

    const actions = document.getElementById('sprint-detail-modal-actions');
    actions.innerHTML = '';

    const reopenBtn = document.createElement('button');
    reopenBtn.className = 'save-status-btn';
    reopenBtn.textContent = 'Reopen Sprint';
    reopenBtn.title = 'Make this the active sprint again';
    reopenBtn.addEventListener('click', () => reopenSprint(proj, sprint));
    actions.appendChild(reopenBtn);

    // Single Delete button revealing a drop-UP menu (this button sits in the
    // modal's bottom footer, so a dropdown opening downward would spill past
    // the modal's own edge) for the two outcomes -- a plain confirm() can't
    // offer a 3-way choice, so which one fires is decided by which menu item
    // was clicked instead.
    const deleteWrap = document.createElement('div');
    deleteWrap.className = 'sprint-detail-delete-menu';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'save-status-btn';
    deleteBtn.textContent = 'Delete';
    deleteWrap.appendChild(deleteBtn);

    const deleteDropdown = document.createElement('div');
    deleteDropdown.className = 'sprint-detail-delete-dropdown';

    const keepItem = document.createElement('button');
    keepItem.className = 'save-menu-item';
    keepItem.textContent = 'Delete (Keep Tasks)';
    keepItem.title = 'Remove this sprint from history; its completed tasks return to the Backlog';
    keepItem.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDropdown.classList.remove('open');
      deleteArchivedSprint(proj, sprint, true);
    });
    deleteDropdown.appendChild(keepItem);

    const wipeItem = document.createElement('button');
    wipeItem.className = 'save-menu-item';
    wipeItem.textContent = 'Delete (Remove Tasks)';
    wipeItem.title = 'Remove this sprint and its completed tasks entirely';
    wipeItem.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDropdown.classList.remove('open');
      deleteArchivedSprint(proj, sprint, false);
    });
    deleteDropdown.appendChild(wipeItem);

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDropdown.classList.toggle('open');
    });

    deleteWrap.appendChild(deleteDropdown);
    actions.appendChild(deleteWrap);

    document.getElementById('sprint-detail-modal-backdrop').style.display = 'flex';
  }

  function closeSprintDetailModal() {
    document.getElementById('sprint-detail-modal-backdrop').style.display = 'none';
  }

  document.getElementById('sprint-detail-modal-close').addEventListener('click', closeSprintDetailModal);
  document.getElementById('sprint-detail-modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'sprint-detail-modal-backdrop') closeSprintDetailModal();
  });

  // The delete dropdown is rebuilt fresh every time the detail modal opens
  // (see openSprintDetailModal above), so there's at most one on screen at
  // a time -- just look for whichever is currently open rather than needing
  // a reference captured at creation time.
  document.addEventListener('click', (e) => {
    if (e.target.closest('.sprint-detail-delete-menu')) return;
    const openDropdown = document.querySelector('.sprint-detail-delete-dropdown.open');
    if (openDropdown) openDropdown.classList.remove('open');
  });

  // Un-completes a past sprint, making it the active sprint again. Blocked
  // outright if a different sprint is already active -- rather than
  // silently completing or discarding that other sprint's in-progress work
  // to make room, which would be a surprising side effect of an unrelated
  // click, this just explains the conflict and leaves both sprints alone
  // until the user resolves it themselves (mirrors how "Start Sprint"
  // itself is already unavailable while a sprint is active).
  function reopenSprint(proj, sprint) {
    if (proj.activeSprint) {
      alert('Finish or delete your current sprint, "' + proj.activeSprint.name + '," before reopening this one.');
      return;
    }
    const confirmed = confirm('Reopen "' + sprint.name + '"? It will become your active sprint again. You can undo this with Ctrl+Z.');
    if (!confirmed) return;
    pushHistory();
    const idx = proj.sprints.findIndex(s => s.id === sprint.id);
    if (idx === -1) return;
    proj.sprints.splice(idx, 1);
    delete sprint.completedAt; // sprint-level archive timestamp -- matches a freshly-started sprint's shape
    proj.activeSprint = sprint;
    save(state);
    closeSprintDetailModal();
    closeSprintHistoryModal();
    render();
  }

  // Removes a sprint from history permanently. `returnTasksToBacklog`
  // chooses between the sprint's completed tasks coming back to Backlog
  // (recoverable, just not credited to any sprint anymore) or being deleted
  // along with it -- asked up front via which button was clicked, rather
  // than a single confirm() that can't express a 3-way choice.
  function deleteArchivedSprint(proj, sprint, returnTasksToBacklog) {
    const count = sprint.done.length;
    const taskWord = count === 1 ? 'task' : 'tasks';
    const confirmed = returnTasksToBacklog
      ? confirm('Delete "' + sprint.name + '" from history? Its ' + count + ' completed ' + taskWord + ' will be moved to the Backlog. You can undo this with Ctrl+Z.')
      : confirm('Delete "' + sprint.name + '" and its ' + count + ' completed ' + taskWord + '? They will NOT be moved to the Backlog. You can undo this with Ctrl+Z.');
    if (!confirmed) return;
    pushHistory();
    const idx = proj.sprints.findIndex(s => s.id === sprint.id);
    if (idx === -1) return;
    proj.sprints.splice(idx, 1);
    if (returnTasksToBacklog) {
      sprint.done.forEach(item => { item.completedAt = null; }); // no longer meaningful once back in Backlog
      proj.backlog.push(...sprint.done);
    }
    save(state);
    closeSprintDetailModal();
    renderSprintHistoryModalBody(proj); // list modal stays open, refreshed to drop the deleted row
    render();
  }

  // Kanban and Scrum are separate, simultaneously-persistent pools (see
  // sendToOtherPool in workhorse-render.js for how a task actually crosses
  // between them) -- so switching which one is displayed never moves data,
  // and needs no confirm or undo-history entry.
  function setProjectMode(proj, mode) {
    if (proj.mode === mode) return;
    proj.mode = mode;
    save(state);
    render();
  }

  function startSprint(proj, meta, selectedBacklogIds) {
    pushHistory();
    const selected = [];
    proj.backlog = proj.backlog.filter(item => {
      if (selectedBacklogIds.indexOf(item.id) !== -1) {
        selected.push(item);
        return false;
      }
      return true;
    });
    const unit = selected.some(i => i.points != null) ? 'points' : 'count';
    const startingTotal = unit === 'points'
      ? selected.reduce((sum, i) => sum + (i.points || 0), 0)
      : selected.length;
    proj.activeSprint = {
      id: uid(), name: meta.name, goal: meta.goal,
      startDate: meta.startDate, endDate: meta.endDate,
      unit: unit, startingTotal: startingTotal,
      todo: [], doing: [], review: [], done: []
    };
    proj.activeSprint.todo.push(...selected);
    save(state);
    render();
  }

  function completeSprint(proj) {
    if (!proj.activeSprint) return;
    const confirmed = confirm(
      'Complete "' + proj.activeSprint.name + '"? Unfinished tasks (To do/In progress/Review) will ' +
      'return to the Backlog. You can undo this with Ctrl+Z.'
    );
    if (!confirmed) return;
    pushHistory();
    const sprint = proj.activeSprint;
    proj.backlog.push(...sprint.todo, ...sprint.doing, ...sprint.review);
    sprint.todo = [];
    sprint.doing = [];
    sprint.review = [];
    sprint.completedAt = Date.now();
    proj.sprints.push(sprint);
    proj.activeSprint = null;
    save(state);
    render();
  }

  // Distinct from Complete Sprint: nothing is archived to history, and
  // *everything* currently in the sprint -- including tasks already in
  // Done -- returns to the Backlog, since deleting means the sprint itself
  // was a mistake, not that its finished work should be credited anywhere.
  function deleteSprint(proj) {
    if (!proj.activeSprint) return;
    const confirmed = confirm(
      'Delete "' + proj.activeSprint.name + '"? All its tasks, including any already marked Done, will ' +
      'return to the Backlog, and the sprint won’t be kept in history. You can undo this with Ctrl+Z.'
    );
    if (!confirmed) return;
    pushHistory();
    const sprint = proj.activeSprint;
    // Done items carry a completedAt (see workhorse-render.js's
    // syncCompletedAt) that's only meaningful while they sit in a sprint's
    // Done column -- clear it here too, or a stale date could ride along
    // into Backlog and silently make a *future* sprint's burndown treat it
    // as already-old-news the moment it's picked up again.
    sprint.done.forEach(item => { item.completedAt = null; });
    proj.backlog.push(...sprint.todo, ...sprint.doing, ...sprint.review, ...sprint.done);
    proj.activeSprint = null;
    save(state);
    render();
  }

  let sprintModalMode = 'create'; // or 'edit'

  function openStartSprintModal(proj) {
    sprintModalMode = 'create';
    document.getElementById('sprint-modal-title').textContent = 'Start a sprint';
    document.getElementById('sprint-modal-checklist-section').style.display = '';
    document.getElementById('sprint-modal-submit').textContent = 'Start Sprint';

    document.getElementById('sprint-name-input').value = '';
    document.getElementById('sprint-goal-input').value = '';
    document.getElementById('sprint-start-input').value = '';
    document.getElementById('sprint-end-input').value = '';

    const checklist = document.getElementById('sprint-modal-checklist');
    checklist.innerHTML = '';
    if (!proj.backlog.length) {
      const empty = document.createElement('div');
      empty.className = 'sprint-modal-empty';
      empty.textContent = 'Backlog is empty — you can still start a sprint and add tasks to it afterward.';
      checklist.appendChild(empty);
    }
    proj.backlog.forEach(item => {
      const row = document.createElement('label');
      row.className = 'checklist-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.itemId = item.id;
      const span = document.createElement('span');
      span.textContent = item.text.split('\n')[0].slice(0, 80);
      row.appendChild(cb);
      row.appendChild(span);
      checklist.appendChild(row);
    });

    document.getElementById('sprint-modal-backdrop').style.display = 'flex';
    document.getElementById('sprint-name-input').focus();
  }

  function openEditSprintModal(proj) {
    if (!proj.activeSprint) return;
    sprintModalMode = 'edit';
    document.getElementById('sprint-modal-title').textContent = 'Edit sprint';
    document.getElementById('sprint-modal-checklist-section').style.display = 'none';
    document.getElementById('sprint-modal-submit').textContent = 'Save Changes';

    const sprint = proj.activeSprint;
    document.getElementById('sprint-name-input').value = sprint.name;
    document.getElementById('sprint-goal-input').value = sprint.goal || '';
    document.getElementById('sprint-start-input').value = sprint.startDate;
    document.getElementById('sprint-end-input').value = sprint.endDate;

    document.getElementById('sprint-modal-backdrop').style.display = 'flex';
    document.getElementById('sprint-name-input').focus();
  }

  function closeStartSprintModal() {
    document.getElementById('sprint-modal-backdrop').style.display = 'none';
  }

  function submitStartSprint(proj) {
    const name = document.getElementById('sprint-name-input').value.trim();
    const goal = document.getElementById('sprint-goal-input').value.trim();
    const startDate = document.getElementById('sprint-start-input').value;
    const endDate = document.getElementById('sprint-end-input').value;
    if (!name) { alert('Give the sprint a name.'); return; }
    if (!startDate || !endDate) { alert('Pick a start and end date.'); return; }
    if (endDate < startDate) { alert('End date must be on or after the start date.'); return; }

    if (sprintModalMode === 'edit') {
      closeStartSprintModal();
      pushHistory();
      Object.assign(proj.activeSprint, { name: name, goal: goal, startDate: startDate, endDate: endDate });
      save(state);
      render();
      return;
    }

    const selectedIds = Array.prototype.slice
      .call(document.querySelectorAll('#sprint-modal-checklist input[type="checkbox"]:checked'))
      .map(cb => cb.dataset.itemId);
    closeStartSprintModal();
    startSprint(proj, { name: name, goal: goal, startDate: startDate, endDate: endDate }, selectedIds);
  }

  document.getElementById('sprint-modal-cancel').addEventListener('click', closeStartSprintModal);
  document.getElementById('sprint-modal-submit').addEventListener('click', () => submitStartSprint(activeProject()));
  document.getElementById('sprint-modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'sprint-modal-backdrop') closeStartSprintModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Close one layer at a time -- with the detail modal stacked on top of
    // the list modal, Escape should back out a step, not drop both at once.
    if (document.getElementById('sprint-detail-modal-backdrop').style.display === 'flex') {
      closeSprintDetailModal();
    } else if (document.getElementById('sprint-history-modal-backdrop').style.display === 'flex') {
      closeSprintHistoryModal();
    } else {
      closeStartSprintModal();
    }
  });

  function dateToDayNum(dateStr) {
    const parts = dateStr.split('-').map(Number);
    return Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000;
  }

  function dayNumToDateStr(dayNum) {
    const d = new Date(dayNum * 86400000);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  // Every day from startDateStr to endDateStr inclusive. Returns just
  // [startDateStr] if endDateStr falls before it, rather than an empty range
  // -- keeps the chart showing at least the sprint's starting point instead
  // of nothing.
  function dateRange(startDateStr, endDateStr) {
    const start = dateToDayNum(startDateStr);
    const end = Math.max(start, dateToDayNum(endDateStr));
    const days = [];
    for (let d = start; d <= end; d++) days.push(dayNumToDateStr(d));
    return days;
  }

  // Recomputes "remaining" as of a given day directly from each item's
  // completedAt -- no stored per-day history needed. An item counts as
  // remaining on a day if it hadn't been completed by then (completedAt is
  // null, or falls after that day), so editing/backdating a completion date
  // just shifts which day it drops out of the sum and nothing else needs to
  // change. String comparison is safe here since dates are zero-padded
  // 'YYYY-MM-DD'.
  function remainingAsOf(sprint, dayStr) {
    const pending = sprint.todo.concat(sprint.doing, sprint.review, sprint.done)
      .filter(i => !i.completedAt || i.completedAt > dayStr);
    return sprint.unit === 'points'
      ? pending.reduce((sum, i) => sum + (i.points || 0), 0)
      : pending.length;
  }

  // Normalizes any date to its 0..1 position between a sprint's start/end,
  // clamped -- so a plotted point from outside the sprint's own date range
  // (edge case, but possible if dates get edited after the fact) still lands
  // at a valid, on-chart position instead of producing NaN/off-chart SVG
  // coordinates.
  function dateFraction(dateStr, startDate, endDate) {
    const start = dateToDayNum(startDate), end = dateToDayNum(endDate), cur = dateToDayNum(dateStr);
    if (end <= start) return 0;
    return Math.max(0, Math.min(1, (cur - start) / (end - start)));
  }

  function renderBurndownChart(container, sprint) {
    const total = sprint.startingTotal;
    const unitLabel = sprint.unit === 'points' ? 'points' : 'tasks';

    if (total <= 0) {
      container.innerHTML =
        '<div class="burndown-empty">No ' + unitLabel + ' to burn down yet — this sprint started empty.</div>';
      return;
    }

    const W = 640, H = 200, PAD = 32;
    const x = (dateStr) => PAD + dateFraction(dateStr, sprint.startDate, sprint.endDate) * (W - PAD * 2);
    const y = (remaining) => PAD + (1 - Math.max(0, Math.min(1, remaining / total))) * (H - PAD * 2);

    const idealPath = 'M ' + x(sprint.startDate) + ' ' + y(total) + ' L ' + x(sprint.endDate) + ' ' + y(0);

    // One point per day from the sprint's start through today (or its end
    // date, if that's already passed) -- fully recomputed on every render,
    // so there's no stored history to keep in sync as completedAt changes.
    const today = todayDateStr();
    const chartEnd = today < sprint.endDate ? today : sprint.endDate;
    const actualPoints = dateRange(sprint.startDate, chartEnd)
      .map(day => ({ date: day, remaining: remainingAsOf(sprint, day) }));
    const actualPath = actualPoints.map((p, i) => (i === 0 ? 'M ' : 'L ') + x(p.date) + ' ' + y(p.remaining)).join(' ');
    const dots = actualPoints.map(p =>
      '<circle cx="' + x(p.date) + '" cy="' + y(p.remaining) + '" r="3" class="burndown-dot" />'
    ).join('');

    container.innerHTML =
      '<div class="burndown-header">' +
        '<span class="burndown-title">Burndown</span>' +
        '<span class="burndown-unit">' + total + ' ' + unitLabel + ' at start</span>' +
      '</div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="burndown-svg" preserveAspectRatio="none">' +
        '<line x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '" class="burndown-axis" />' +
        '<line x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '" class="burndown-axis" />' +
        '<path d="' + idealPath + '" class="burndown-ideal" />' +
        '<path d="' + actualPath + '" class="burndown-actual" />' +
        dots +
        '<text x="' + PAD + '" y="' + (H - 10) + '" class="burndown-label">' + formatDeadline(sprint.startDate) + '</text>' +
        '<text x="' + (W - PAD) + '" y="' + (H - 10) + '" class="burndown-label" text-anchor="end">' + formatDeadline(sprint.endDate) + '</text>' +
        '<text x="' + (PAD - 8) + '" y="' + (PAD + 4) + '" class="burndown-label" text-anchor="end">' + total + '</text>' +
        '<text x="' + (PAD - 8) + '" y="' + (H - PAD + 4) + '" class="burndown-label" text-anchor="end">0</text>' +
      '</svg>';
  }

  // render()'s first call has to happen after every script has loaded (it
  // calls renderProjectToolbar, defined above), so it lives in whichever
  // file loads last rather than in workhorse-render.js itself.
  render();
  updateSaveFileStatus();
  initFileConnection().catch(err => console.error('File connection init failed', err));
