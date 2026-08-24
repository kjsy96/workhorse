  let expandedSprintHistory = new Set();

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

      const completeBtn = document.createElement('button');
      completeBtn.className = 'save-status-btn';
      completeBtn.textContent = 'Complete Sprint';
      completeBtn.addEventListener('click', () => completeSprint(proj));
      toolbar.appendChild(completeBtn);

      upsertTodayBurndownPoint(proj);
      renderBurndownChart(burndownContainer, proj.activeSprint);
    } else {
      const startBtn = document.createElement('button');
      startBtn.className = 'save-status-btn';
      startBtn.textContent = 'Start Sprint';
      startBtn.addEventListener('click', () => openStartSprintModal(proj));
      toolbar.appendChild(startBtn);
    }

    if (proj.sprints.length) {
      if (!expandedSprintHistory.has(proj.id)) {
        const stack = document.createElement('div');
        stack.className = 'done-stack sprint-history-stack';
        stack.textContent = proj.sprints.length + ' past sprint' + (proj.sprints.length === 1 ? '' : 's');
        stack.addEventListener('click', () => {
          expandedSprintHistory.add(proj.id);
          renderProjectToolbar();
        });
        toolbar.appendChild(stack);
      } else {
        const list = document.createElement('div');
        list.className = 'sprint-history-list';
        proj.sprints.slice().reverse().forEach(s => {
          const row = document.createElement('div');
          row.className = 'sprint-history-row';
          row.textContent = s.name + ' (' + formatDeadline(s.startDate) + '–' + formatDeadline(s.endDate) + ')' + (s.goal ? ' — ' + s.goal : '');
          list.appendChild(row);
        });
        const collapseBtn = document.createElement('button');
        collapseBtn.className = 'done-stack-collapse';
        collapseBtn.textContent = 'Show less';
        collapseBtn.addEventListener('click', () => {
          expandedSprintHistory.delete(proj.id);
          renderProjectToolbar();
        });
        list.appendChild(collapseBtn);
        toolbar.appendChild(list);
      }
    }
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
      unit: unit, startingTotal: startingTotal, burnHistory: [],
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

  function openStartSprintModal(proj) {
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
    if (e.key === 'Escape') closeStartSprintModal();
  });

  function todayDateStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function sprintRemaining(proj, sprint) {
    const active = sprint.todo.concat(sprint.doing, sprint.review);
    return sprint.unit === 'points'
      ? active.reduce((sum, i) => sum + (i.points || 0), 0)
      : active.length;
  }

  function upsertTodayBurndownPoint(proj) {
    const sprint = proj.activeSprint;
    const remaining = sprintRemaining(proj, sprint);
    const today = todayDateStr();
    const existing = sprint.burnHistory.find(p => p.date === today);
    if (existing) {
      if (existing.remaining === remaining) return;
      existing.remaining = remaining;
    } else {
      sprint.burnHistory.push({ date: today, remaining: remaining });
    }
    save(state);
  }

  // Normalizes any date to its 0..1 position between a sprint's start/end,
  // clamped -- so a burn-history entry from outside the sprint's own date
  // range (edge case, but possible if dates get edited or a snapshot is old)
  // still plots at a valid, on-chart position instead of producing NaN/
  // off-chart SVG coordinates.
  function dateFraction(dateStr, startDate, endDate) {
    const toDays = (s) => {
      const parts = s.split('-').map(Number);
      return Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000;
    };
    const start = toDays(startDate), end = toDays(endDate), cur = toDays(dateStr);
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

    const actualPoints = [{ date: sprint.startDate, remaining: total }]
      .concat(sprint.burnHistory.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
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
