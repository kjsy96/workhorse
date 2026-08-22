  let expandedSprintHistory = new Set();

  function renderProjectToolbar() {
    const proj = activeProject();
    const toolbar = document.getElementById('project-toolbar');
    toolbar.innerHTML = '';

    document.getElementById('board').classList.toggle('mode-scrum', proj.mode === 'scrum');

    const modeBtn = document.createElement('button');
    modeBtn.className = 'save-status-btn toolbar-mode-btn';
    modeBtn.textContent = proj.mode === 'scrum' ? 'Scrum mode' : 'Kanban mode';
    modeBtn.title = proj.mode === 'scrum' ? 'Switch to Kanban mode' : 'Switch to Scrum mode';
    modeBtn.addEventListener('click', () => toggleProjectMode(proj));
    toolbar.appendChild(modeBtn);

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

  function toggleProjectMode(proj) {
    if (proj.mode === 'kanban') {
      const hasItems = proj.todo.length || proj.doing.length || proj.done.length;
      if (hasItems) {
        const confirmed = confirm(
          'Switch "' + proj.name + '" to Scrum mode? Its current tasks will move into the Backlog. ' +
          'You can undo this with Ctrl+Z.'
        );
        if (!confirmed) return;
        pushHistory();
        proj.backlog.push(...proj.todo, ...proj.doing, ...proj.done);
        proj.todo = [];
        proj.doing = [];
        proj.done = [];
      } else {
        pushHistory();
      }
      proj.mode = 'scrum';
    } else {
      pushHistory();
      proj.mode = 'kanban';
    }
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
      unit: unit, startingTotal: startingTotal, burnHistory: []
    };
    proj.todo.push(...selected);
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
    const completedItems = proj.done;
    proj.backlog.push(...proj.todo, ...proj.doing, ...proj.review);
    proj.sprints.push(Object.assign({}, proj.activeSprint, {
      completedAt: Date.now(),
      completedItems: completedItems
    }));
    proj.todo = [];
    proj.doing = [];
    proj.review = [];
    proj.done = [];
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

  // render()'s first call has to happen after every script has loaded (it
  // calls renderProjectToolbar, defined above), so it lives in whichever
  // file loads last rather than in kanban-render.js itself.
  render();
  updateSaveFileStatus();
  initFileConnection().catch(err => console.error('File connection init failed', err));
