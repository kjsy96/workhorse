  function formatDate(ts) {
    const d = new Date(ts);
    const opts = { month: 'short', day: 'numeric' };
    return d.toLocaleDateString(undefined, opts);
  }

  // Converts a creation timestamp to the 'YYYY-MM-DD' shape a date <input>
  // needs, using local date parts (matches formatDate()/todayDateStr()'s own
  // local-time reading of a timestamp, so the value shown in the picker
  // always agrees with the value already shown in the footer).
  function dateStrFromTimestamp(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function formatDeadline(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function isOverdue(dateStr, col) {
    if (col === 'done') return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const deadlineDate = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return deadlineDate < today;
  }

  function closeAllCardMenus() {
    document.querySelectorAll('.card-menu.open').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('.card.menu-open').forEach(c => c.classList.remove('menu-open'));
    document.querySelectorAll('.card-menu-dropdown.open').forEach(d => d.classList.remove('open'));
  }

  // The dropdown is `position: fixed` (see workhorse.css) specifically so it
  // can never be clipped by a card/column/dropzone ancestor and always
  // layers above everything else -- but that means its position has to be
  // computed in viewport coordinates here, rather than left to CSS, and
  // reflows if the button is near an edge (flips above instead of below,
  // clamps horizontally) so the whole menu always stays on-screen no matter
  // where in the board it's opened from.
  function positionCardMenuDropdown(menuBtn, dropdown) {
    const margin = 8;
    const btnRect = menuBtn.getBoundingClientRect();
    // offsetWidth/offsetHeight rather than getBoundingClientRect(): a fixed
    // element with no top/left set yet renders at a browser-chosen "static
    // position" that has nothing to do with where we're about to place it,
    // so reading its rect at that point would measure the wrong spot. The
    // offset* dimensions only reflect the laid-out box size, not position,
    // so they're accurate regardless of what top/left currently are.
    const dropWidth = dropdown.offsetWidth;
    const dropHeight = dropdown.offsetHeight;

    let top = btnRect.bottom + 4;
    if (top + dropHeight > window.innerHeight - margin) {
      const above = btnRect.top - dropHeight - 4;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - dropHeight - margin);
    }

    let left = btnRect.right - dropWidth;
    left = Math.max(margin, Math.min(left, window.innerWidth - dropWidth - margin));

    dropdown.style.top = top + 'px';
    dropdown.style.left = left + 'px';
  }

  function render() {
    renderTabs();
    renderProjectToolbar();
    renderBoard();
    updateHistoryButtons();
  }

  function renderTabs() {
    const tabsEl = document.getElementById('project-tabs');
    tabsEl.innerHTML = '';

    state.projects.forEach(p => {
      const tab = document.createElement('div');
      tab.className = 'project-tab' + (p.id === state.activeProjectId ? ' active' : '');
      tab.dataset.id = p.id;
      tab.draggable = true;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'project-tab-name';
      nameSpan.textContent = p.name;
      nameSpan.contentEditable = 'false';
      tab.appendChild(nameSpan);

      if (state.projects.length > 1) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'project-tab-close';
        closeBtn.textContent = '\u00D7';
        closeBtn.title = 'Delete project';
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteProject(p.id);
        });
        tab.appendChild(closeBtn);
      }

      tab.addEventListener('click', (e) => {
        if (e.target.isContentEditable) return;
        if (state.activeProjectId !== p.id) {
          state.activeProjectId = p.id;
          save(state);
          render();
        }
      });

      nameSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startRenameProject(p, nameSpan);
      });

      tab.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/x-project-tab', p.id);
        e.dataTransfer.effectAllowed = 'move';
        tab.classList.add('tab-dragging');
      });
      tab.addEventListener('dragend', () => {
        tab.classList.remove('tab-dragging');
      });

      tab.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('application/x-project-tab')) {
          if (tab.classList.contains('tab-dragging')) return;
          e.preventDefault();
          const rect = tab.getBoundingClientRect();
          const before = e.clientX < rect.left + rect.width / 2;
          tab.classList.toggle('tab-insert-before', before);
          tab.classList.toggle('tab-insert-after', !before);
          e.dataTransfer.dropEffect = 'move';
        } else if (p.id !== state.activeProjectId) {
          e.preventDefault();
          tab.classList.add('drag-over');
          e.dataTransfer.dropEffect = 'move';
        }
      });
      tab.addEventListener('dragleave', () => {
        tab.classList.remove('drag-over', 'tab-insert-before', 'tab-insert-after');
      });
      tab.addEventListener('drop', (e) => {
        e.preventDefault();
        const insertBefore = tab.classList.contains('tab-insert-before');
        tab.classList.remove('drag-over', 'tab-insert-before', 'tab-insert-after');

        const draggedTabId = e.dataTransfer.getData('application/x-project-tab');
        if (draggedTabId) {
          if (draggedTabId === p.id) return;
          const targetIndex = state.projects.findIndex(pr => pr.id === p.id) + (insertBefore ? 0 : 1);
          reorderProject(draggedTabId, targetIndex);
          render();
          return;
        }

        if (p.id !== state.activeProjectId) {
          const id = e.dataTransfer.getData('text/plain');
          moveItemToProject(id, p.id);
          render();
        }
      });

      tabsEl.appendChild(tab);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'project-tab-add';
    addBtn.textContent = '+';
    addBtn.title = 'New project';
    addBtn.addEventListener('click', addProject);
    tabsEl.appendChild(addBtn);
  }

  function startRenameProject(project, nameSpan) {
    const original = project.name;
    nameSpan.contentEditable = 'true';
    nameSpan.spellcheck = false;
    nameSpan.focus();
    document.execCommand('selectAll', false, null);

    function finish(shouldSave) {
      nameSpan.removeEventListener('blur', onBlur);
      nameSpan.removeEventListener('keydown', onKeydown);
      if (shouldSave) {
        const newName = nameSpan.textContent.trim() || original;
        if (newName !== project.name) {
          pushHistory();
          project.name = newName;
          save(state);
        }
      }
      render();
    }

    function onBlur() { finish(true); }
    function onKeydown(e) {
      if (e.key === 'Enter') { e.preventDefault(); nameSpan.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    }

    nameSpan.addEventListener('blur', onBlur);
    nameSpan.addEventListener('keydown', onKeydown);
  }

  function addProject() {
    pushHistory();
    const p = makeProject('New Project');
    state.projects.push(p);
    state.activeProjectId = p.id;
    save(state);
    render();
    requestAnimationFrame(() => {
      const nameSpan = document.querySelector('.project-tab[data-id="' + p.id + '"] .project-tab-name');
      if (nameSpan) startRenameProject(p, nameSpan);
    });
  }

  function deleteProject(id) {
    if (state.projects.length <= 1) return;
    const proj = state.projects.find(p => p.id === id);
    if (!proj) return;
    const confirmed = confirm('Delete project "' + proj.name + '" and all its tasks? You can undo this with Ctrl+Z.');
    if (!confirmed) return;
    pushHistory();
    const idx = state.projects.findIndex(p => p.id === id);
    state.projects.splice(idx, 1);
    if (state.activeProjectId === id) {
      const newIdx = Math.min(idx, state.projects.length - 1);
      state.activeProjectId = state.projects[newIdx].id;
    }
    save(state);
    render();
  }

  function renderBoard() {
    const proj = activeProject();
    // Card menu dropdowns live in document.body, not nested under their
    // card (see workhorse.css) -- zone.innerHTML = '' below discards each
    // rebuilt card's old DOM, but that doesn't touch a body-level dropdown,
    // so any left over from the previous render have to be swept up here or
    // they'd silently accumulate on every re-render.
    document.querySelectorAll('.card-menu-dropdown').forEach(d => d.remove());
    COLS.forEach(col => {
      const zone = document.getElementById('dropzone-' + col);
      zone.innerHTML = '';
      const container = resolveContainer(proj, col);
      const items = (container && container[col]) || [];
      document.querySelector('[data-count="' + col + '"]').textContent = items.length;

      const stackActive = col === 'done' && items.length > DONE_STACK_VISIBLE_COUNT;
      const isStackExpanded = stackActive && expandedStacks.has(proj.id);
      const visibleItems = (stackActive && !isStackExpanded) ? items.slice(0, DONE_STACK_VISIBLE_COUNT) : items;

      visibleItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card' + (col === 'done' ? ' done-state' : '');
        card.draggable = true;
        card.dataset.id = item.id;

        const pin = document.createElement('div');
        pin.className = 'pin';
        card.appendChild(pin);

        const listView = document.createElement('div');
        listView.className = 'card-list-view';
        card.appendChild(listView);

        function parseLine(line) {
          const bulletMatch = line.match(/^(\s*)[*-]\s+(.*)$/);
          if (bulletMatch) return { type: 'bullet', content: bulletMatch[2] };
          const checkMatch = line.match(/^(\s*)\[( |x|X)?\]\s+(.*)$/);
          if (checkMatch) return { type: 'checkbox', checked: (checkMatch[2] || '').toLowerCase() === 'x', content: checkMatch[3] };
          return { type: 'text', content: line };
        }

        function toggleCheckboxLine(lineIdx, checked) {
          const lines = item.text.split('\n');
          const line = lines[lineIdx];
          const match = line.match(/^(\s*)\[( |x|X)?\](\s+.*)$/);
          if (match) {
            lines[lineIdx] = match[1] + '[' + (checked ? 'x' : ' ') + ']' + match[3];
            item.text = lines.join('\n');
          }
        }

        // Appends parsed content for `subset` (a slice of the card's full
        // line array) into `container`. `offset` is subset's starting index
        // within the *full* array, so checkbox toggling still writes back to
        // the right line no matter which container (title vs description) a
        // checkbox line ends up rendered into.
        function renderLines(container, subset, offset) {
          let currentList = null;
          subset.forEach((rawLine, i) => {
            const idx = offset + i;
            if (rawLine.trim() === '') {
              currentList = null;
              const spacer = document.createElement('div');
              spacer.className = 'card-line-text';
              spacer.innerHTML = '&nbsp;';
              container.appendChild(spacer);
              return;
            }
            const parsed = parseLine(rawLine);
            if (parsed.type === 'bullet') {
              if (!currentList) {
                currentList = document.createElement('ul');
                currentList.className = 'card-bullet-list';
                container.appendChild(currentList);
              }
              const li = document.createElement('li');
              li.textContent = parsed.content;
              currentList.appendChild(li);
            } else if (parsed.type === 'checkbox') {
              currentList = null;
              const row = document.createElement('label');
              row.className = 'checklist-row' + (parsed.checked ? ' checked' : '');
              row.addEventListener('mousedown', (e) => e.stopPropagation());
              row.addEventListener('click', (e) => e.stopPropagation());
              const cb = document.createElement('input');
              cb.type = 'checkbox';
              cb.checked = parsed.checked;
              cb.addEventListener('change', () => {
                pushHistory();
                toggleCheckboxLine(idx, cb.checked);
                save(state);
                row.classList.toggle('checked', cb.checked);
              });
              const span = document.createElement('span');
              span.textContent = parsed.content;
              row.appendChild(cb);
              row.appendChild(span);
              container.appendChild(row);
            } else {
              currentList = null;
              const p = document.createElement('div');
              p.className = 'card-line-text';
              p.textContent = parsed.content;
              container.appendChild(p);
            }
          });
        }

        // Line 1 is the card's title -- always shown, parsed the same as any
        // other line (so a single-line checkbox/bullet "title" -- the common
        // shape for a quick-captured task -- stays a fully interactive
        // checkbox/bullet, not plain text). Lines 2+ are its description,
        // hidden by default behind a "Show details" toggle so a lengthy task
        // doesn't dominate the column; expandedCards (ephemeral, keyed by
        // item id) tracks which cards currently have it open.
        function renderView() {
          listView.innerHTML = '';
          const existingDesc = card.querySelector('.card-description-view');
          if (existingDesc) existingDesc.remove();
          const existingToggle = card.querySelector('.card-details-toggle');
          if (existingToggle) existingToggle.remove();

          const lines = item.text.split('\n');
          const descLines = lines.slice(1);
          const hasDescription = descLines.some(l => l.trim() !== '');

          renderLines(listView, lines.slice(0, 1), 0);

          if (hasDescription) {
            const isExpanded = expandedCards.has(item.id);

            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'card-details-toggle';
            toggleBtn.textContent = isExpanded ? 'Hide details' : 'Show details';
            toggleBtn.addEventListener('mousedown', (e) => e.stopPropagation());
            toggleBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              if (isExpanded) expandedCards.delete(item.id); else expandedCards.add(item.id);
              renderView();
            });
            listView.insertAdjacentElement('afterend', toggleBtn);

            if (isExpanded) {
              const descView = document.createElement('div');
              descView.className = 'card-list-view card-description-view';
              toggleBtn.insertAdjacentElement('afterend', descView);
              renderLines(descView, descLines, 1);
            }
          }
        }

        renderView();

        const menuWrap = document.createElement('div');
        menuWrap.className = 'card-menu';

        const menuBtn = document.createElement('button');
        menuBtn.className = 'card-menu-btn';
        menuBtn.textContent = '\u22EE';
        menuBtn.title = 'Task options';
        menuWrap.appendChild(menuBtn);

        const dropdown = document.createElement('div');
        dropdown.className = 'card-menu-dropdown';

        const editItem = document.createElement('button');
        editItem.className = 'card-menu-item';
        editItem.textContent = 'Edit task';
        editItem.addEventListener('click', (e) => {
          e.stopPropagation();
          menuWrap.classList.remove('open');
          card.classList.remove('menu-open');
          openEditTaskModal(item);
        });
        dropdown.appendChild(editItem);

        const createdDivider = document.createElement('div');
        createdDivider.className = 'card-menu-divider';
        dropdown.appendChild(createdDivider);

        const createdRow = document.createElement('div');
        createdRow.className = 'card-menu-deadline-row';
        const createdLabel = document.createElement('span');
        createdLabel.className = 'card-menu-label';
        createdLabel.textContent = 'Created on';
        createdRow.appendChild(createdLabel);
        const createdInput = document.createElement('input');
        createdInput.type = 'date';
        createdInput.className = 'card-menu-date-input';
        createdInput.value = dateStrFromTimestamp(item.created);
        createdInput.addEventListener('click', (e) => e.stopPropagation());
        createdInput.addEventListener('mousedown', (e) => e.stopPropagation());
        createdRow.appendChild(createdInput);
        dropdown.appendChild(createdRow);

        const deadlineDivider = document.createElement('div');
        deadlineDivider.className = 'card-menu-divider';
        dropdown.appendChild(deadlineDivider);

        const deadlineRow = document.createElement('div');
        deadlineRow.className = 'card-menu-deadline-row';
        const deadlineLabel = document.createElement('span');
        deadlineLabel.className = 'card-menu-label';
        deadlineLabel.textContent = 'Deadline';
        deadlineRow.appendChild(deadlineLabel);
        const deadlineInput = document.createElement('input');
        deadlineInput.type = 'date';
        deadlineInput.className = 'card-menu-date-input';
        if (item.deadline) deadlineInput.value = item.deadline;
        deadlineInput.addEventListener('click', (e) => e.stopPropagation());
        deadlineInput.addEventListener('mousedown', (e) => e.stopPropagation());
        deadlineRow.appendChild(deadlineInput);
        dropdown.appendChild(deadlineRow);

        const clearDeadlineBtn = document.createElement('button');
        clearDeadlineBtn.className = 'card-menu-item';
        clearDeadlineBtn.textContent = 'Clear deadline';
        clearDeadlineBtn.style.display = item.deadline ? '' : 'none';
        clearDeadlineBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          pushHistory();
          item.deadline = null;
          deadlineInput.value = '';
          refreshDeadlineUI();
          save(state);
        });
        dropdown.appendChild(clearDeadlineBtn);

        const pointsDivider = document.createElement('div');
        pointsDivider.className = 'card-menu-divider';
        dropdown.appendChild(pointsDivider);

        const pointsRow = document.createElement('div');
        pointsRow.className = 'card-menu-deadline-row';
        const pointsLabel = document.createElement('span');
        pointsLabel.className = 'card-menu-label';
        pointsLabel.textContent = 'Points';
        pointsRow.appendChild(pointsLabel);
        const pointsInput = document.createElement('input');
        pointsInput.type = 'number';
        pointsInput.min = '0';
        pointsInput.className = 'card-menu-date-input';
        if (item.points != null) pointsInput.value = item.points;
        pointsInput.addEventListener('click', (e) => e.stopPropagation());
        pointsInput.addEventListener('mousedown', (e) => e.stopPropagation());
        pointsRow.appendChild(pointsInput);
        dropdown.appendChild(pointsRow);

        const clearPointsBtn = document.createElement('button');
        clearPointsBtn.className = 'card-menu-item';
        clearPointsBtn.textContent = 'Clear points';
        clearPointsBtn.style.display = item.points != null ? '' : 'none';
        clearPointsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          pushHistory();
          item.points = null;
          pointsInput.value = '';
          refreshPointsUI();
          save(state);
          refreshBurndown();
        });
        dropdown.appendChild(clearPointsBtn);

        // Only meaningful for a task currently sitting in a Done column --
        // Kanban's own, or a sprint's -- lets the user see/backdate when it
        // actually finished. completedAt itself is kept in sync
        // automatically elsewhere (dragging in/out of Done, sendToOtherPool,
        // moveItemToProject); this field only ever edits the date, never
        // clears it, since "in Done with no completion date" would break
        // the invariant (relied on by the Scrum burndown formula, and now
        // also by the completion-date footer badge below) that completedAt
        // is set iff the item is in a Done column.
        const isDone = isDoneContainer(proj, container, col);

        const completedDivider = document.createElement('div');
        completedDivider.className = 'card-menu-divider';
        completedDivider.style.display = isDone ? '' : 'none';
        dropdown.appendChild(completedDivider);

        const completedRow = document.createElement('div');
        completedRow.className = 'card-menu-deadline-row';
        completedRow.style.display = isDone ? '' : 'none';
        const completedLabel = document.createElement('span');
        completedLabel.className = 'card-menu-label';
        completedLabel.textContent = 'Completed on';
        completedRow.appendChild(completedLabel);
        const completedInput = document.createElement('input');
        completedInput.type = 'date';
        completedInput.className = 'card-menu-date-input';
        if (item.completedAt) completedInput.value = item.completedAt;
        completedInput.addEventListener('click', (e) => e.stopPropagation());
        completedInput.addEventListener('mousedown', (e) => e.stopPropagation());
        completedRow.appendChild(completedInput);
        dropdown.appendChild(completedRow);

        let completedHistoryPushed = false;
        completedInput.addEventListener('focus', () => {
          completedHistoryPushed = false;
        });
        completedInput.addEventListener('change', (e) => {
          if (!completedHistoryPushed) {
            pushHistory();
            completedHistoryPushed = true;
          }
          item.completedAt = e.target.value || todayDateStr();
          refreshCompletedUI();
          save(state);
          refreshBurndown();
        });

        const sendDivider = document.createElement('div');
        sendDivider.className = 'card-menu-divider';
        dropdown.appendChild(sendDivider);

        const inKanbanPool = col !== 'backlog' && resolveContainer(proj, col) === proj;
        const sendBtn = document.createElement('button');
        sendBtn.className = 'card-menu-item';
        sendBtn.textContent = inKanbanPool ? 'Send to Scrum' : 'Send to Kanban';
        sendBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          sendToOtherPool(item.id);
        });
        dropdown.appendChild(sendBtn);

        if (state.projects.length > 1) {
          const divider1 = document.createElement('div');
          divider1.className = 'card-menu-divider';
          dropdown.appendChild(divider1);

          const moveLabel = document.createElement('div');
          moveLabel.className = 'card-menu-section-label';
          moveLabel.textContent = 'Move to';
          dropdown.appendChild(moveLabel);

          state.projects.forEach(p => {
            if (p.id === state.activeProjectId) return;
            const moveBtn = document.createElement('button');
            moveBtn.className = 'card-menu-item';
            moveBtn.textContent = p.name;
            moveBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              moveItemToProject(item.id, p.id);
              render();
            });
            dropdown.appendChild(moveBtn);
          });
        }

        const divider2 = document.createElement('div');
        divider2.className = 'card-menu-divider';
        dropdown.appendChild(divider2);

        const deleteItem = document.createElement('button');
        deleteItem.className = 'card-menu-item card-menu-delete';
        deleteItem.textContent = 'Delete task';
        deleteItem.addEventListener('click', (e) => {
          e.stopPropagation();
          removeItem(item.id);
          render();
        });
        dropdown.appendChild(deleteItem);

        // Appended to <body>, not menuWrap -- see the .card-menu-dropdown
        // comment in workhorse.css for why it can't stay nested under the
        // card and still use position: fixed reliably. Stashing menuBtn
        // directly on the node (a plain JS property, not an HTML attribute)
        // is how repositionOpenCardMenu finds the right anchor on scroll/
        // resize, since dropdown and menuBtn are no longer DOM relatives.
        dropdown._menuBtn = menuBtn;
        document.body.appendChild(dropdown);

        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = dropdown.classList.contains('open');
          closeAllCardMenus();
          if (!isOpen) {
            menuWrap.classList.add('open');
            card.classList.add('menu-open');
            dropdown.classList.add('open');
            positionCardMenuDropdown(menuBtn, dropdown);
          }
        });
        menuBtn.addEventListener('mousedown', (e) => e.stopPropagation());

        card.appendChild(menuWrap);

        const footerRow = document.createElement('div');
        footerRow.className = 'card-footer';

        const dateWrap = document.createElement('div');
        dateWrap.className = 'card-dates';

        const date = document.createElement('span');
        date.className = 'card-date';
        date.textContent = formatDate(item.created);
        dateWrap.appendChild(date);

        const deadlineBadge = document.createElement('span');
        deadlineBadge.className = 'card-deadline';
        deadlineBadge.style.display = 'none';
        dateWrap.appendChild(deadlineBadge);

        const pointsBadge = document.createElement('span');
        pointsBadge.className = 'card-points';
        pointsBadge.style.display = 'none';
        dateWrap.appendChild(pointsBadge);

        // A sibling of dateWrap (not a child of it) so .card-footer's
        // existing justify-content: space-between pushes it to the opposite
        // corner from creation date/deadline/points, instead of just
        // trailing after them in the same left-aligned group.
        const completedBadge = document.createElement('span');
        completedBadge.className = 'card-completed';
        completedBadge.style.display = 'none';

        function refreshCompletedUI() {
          if (item.completedAt) {
            completedBadge.style.display = '';
            completedBadge.textContent = 'done ' + formatDeadline(item.completedAt);
          } else {
            completedBadge.style.display = 'none';
          }
        }
        refreshCompletedUI();

        function refreshDeadlineUI() {
          if (item.deadline) {
            deadlineBadge.style.display = '';
            deadlineBadge.className = 'card-deadline' + (isOverdue(item.deadline, col) ? ' overdue' : '');
            deadlineBadge.textContent = 'due ' + formatDeadline(item.deadline);
            clearDeadlineBtn.style.display = '';
          } else {
            deadlineBadge.style.display = 'none';
            clearDeadlineBtn.style.display = 'none';
          }
        }
        refreshDeadlineUI();

        function refreshPointsUI() {
          if (item.points != null) {
            pointsBadge.style.display = '';
            pointsBadge.textContent = item.points + ' pt' + (item.points === 1 ? '' : 's');
            clearPointsBtn.style.display = '';
          } else {
            pointsBadge.style.display = 'none';
            clearPointsBtn.style.display = 'none';
          }
        }
        refreshPointsUI();

        let createdHistoryPushed = false;
        createdInput.addEventListener('focus', () => {
          createdHistoryPushed = false;
        });
        createdInput.addEventListener('change', (e) => {
          const val = e.target.value;
          if (!val) { createdInput.value = dateStrFromTimestamp(item.created); return; } // never allow clearing -- every item has a creation date
          if (!createdHistoryPushed) {
            pushHistory();
            createdHistoryPushed = true;
          }
          // item.created is a timestamp, but only ever read back out through
          // formatDate()/dateStrFromTimestamp(), both local-time -- build the
          // new timestamp from local date parts too (not `new Date(val)`,
          // which parses a bare 'YYYY-MM-DD' as UTC midnight and would
          // silently shift a day in negative-UTC timezones).
          const [y, m, d] = val.split('-').map(Number);
          item.created = new Date(y, m - 1, d).getTime();
          date.textContent = formatDate(item.created);
          save(state);
        });

        let deadlineHistoryPushed = false;
        deadlineInput.addEventListener('focus', () => {
          deadlineHistoryPushed = false;
        });
        deadlineInput.addEventListener('change', (e) => {
          if (!deadlineHistoryPushed) {
            pushHistory();
            deadlineHistoryPushed = true;
          }
          item.deadline = e.target.value || null;
          refreshDeadlineUI();
          save(state);
        });

        let pointsHistoryPushed = false;
        pointsInput.addEventListener('focus', () => {
          pointsHistoryPushed = false;
        });
        pointsInput.addEventListener('change', (e) => {
          if (!pointsHistoryPushed) {
            pushHistory();
            pointsHistoryPushed = true;
          }
          const val = e.target.value;
          item.points = val === '' ? null : Math.max(0, Math.round(Number(val)));
          refreshPointsUI();
          save(state);
          refreshBurndown();
        });

        footerRow.appendChild(dateWrap);
        footerRow.appendChild(completedBadge);
        card.appendChild(footerRow);

        card.addEventListener('dragstart', (e) => {
          card.classList.add('dragging');
          e.dataTransfer.setData('text/plain', item.id);
          e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', () => {
          card.classList.remove('dragging');
        });

        card.addEventListener('touchstart', (e) => {
          if (e.target.closest('.card-menu, .checklist-row, .card-details-toggle')) return;
          const touch = e.touches[0];
          touchDrag = {
            itemId: item.id,
            originCard: card,
            startX: touch.clientX,
            startY: touch.clientY,
            armed: false,
            ghost: null,
            ghostOffsetX: 0,
            ghostOffsetY: 0,
            currentDropEl: null,
            scrollSpeed: 0,
            rafId: null,
            longPressTimer: null
          };
          touchDrag.longPressTimer = setTimeout(armTouchDrag, TOUCH_LONG_PRESS_MS);
        }, { passive: true });

        card.addEventListener('touchmove', (e) => {
          if (!touchDrag || touchDrag.originCard !== card) return;
          const touch = e.touches[0];
          if (!touchDrag.armed) {
            const dx = touch.clientX - touchDrag.startX;
            const dy = touch.clientY - touchDrag.startY;
            if (Math.hypot(dx, dy) > TOUCH_MOVE_CANCEL_PX) {
              cleanupTouchDrag();
            }
            return;
          }
          e.preventDefault();
          updateTouchDragPosition(touch.clientX, touch.clientY);
        }, { passive: false });

        card.addEventListener('touchend', () => {
          if (!touchDrag || touchDrag.originCard !== card) return;
          if (touchDrag.armed) {
            finishTouchDrag();
          } else {
            cleanupTouchDrag();
          }
        }, { passive: true });

        card.addEventListener('touchcancel', () => {
          if (!touchDrag || touchDrag.originCard !== card) return;
          cleanupTouchDrag();
        }, { passive: true });

        zone.appendChild(card);
      });

      if (stackActive) {
        if (isStackExpanded) {
          const collapseBtn = document.createElement('button');
          collapseBtn.className = 'done-stack-collapse';
          collapseBtn.textContent = 'Show less';
          collapseBtn.addEventListener('click', () => {
            expandedStacks.delete(proj.id);
            render();
          });
          zone.appendChild(collapseBtn);
        } else {
          const hiddenCount = items.length - visibleItems.length;
          const stackEl = document.createElement('div');
          stackEl.className = 'done-stack';
          stackEl.textContent = '+' + hiddenCount + ' more done';
          stackEl.addEventListener('click', () => {
            expandedStacks.add(proj.id);
            render();
          });
          zone.appendChild(stackEl);
        }
      }
    });
  }

  // Kanban's todo/doing/done and Scrum's backlog live directly on the
  // project; Scrum's own todo/doing/review/done live nested under its
  // activeSprint instead, so the two pools never share storage. This is
  // the one place that distinction is resolved, so findItem/moveItem/
  // renderBoard/the add-task handler don't each need their own copy of it.
  function resolveContainer(proj, col) {
    if (col === 'backlog') return proj;
    if (proj.mode === 'scrum') return proj.activeSprint || null;
    return proj;
  }

  // True for "the Done column that actually belongs to `container`" --
  // Kanban's own proj.done, or (in Scrum) the active sprint's done. Shared
  // by syncCompletedAt below and by the kebab menu / add-task paths, so
  // there's exactly one definition of "is this a Done column" to keep in
  // sync as the pool/sprint data model evolves.
  function isDoneContainer(proj, container, col) {
    return col === 'done' && (container === proj || container === proj.activeSprint);
  }

  // Keeps item.completedAt in sync with "currently sitting in a Done
  // column" -- Kanban's own, or a sprint's -- called from every function
  // that relocates an item (moveItem, sendToOtherPool, moveItemToProject),
  // so the invariant holds no matter which path an item travels. Without
  // this, an item could leave a Done column via a project-move or pool-send
  // (both bypass moveItem) carrying a stale completedAt with it; if later
  // pulled into a *different* sprint's To do, that stale date would make
  // the burndown formula wrongly treat it as already-old-news and silently
  // exclude it from that sprint's remaining count while it visibly sits in
  // To do.
  function syncCompletedAt(loc, toContainer, toCol, item) {
    const wasInDone = isDoneContainer(loc.proj, loc.container, loc.col);
    const entersDone = isDoneContainer(loc.proj, toContainer, toCol);
    if (entersDone) {
      item.completedAt = wasInDone ? item.completedAt : todayDateStr();
    } else if (wasInDone) {
      item.completedAt = null;
    }
  }

  function findItem(id) {
    for (const proj of state.projects) {
      for (const col of ['todo', 'doing', 'done']) {
        const idx = proj[col].findIndex(i => i.id === id);
        if (idx !== -1) return { proj, container: proj, col, idx };
      }
      let idx = proj.backlog.findIndex(i => i.id === id);
      if (idx !== -1) return { proj, container: proj, col: 'backlog', idx };
      if (proj.activeSprint) {
        for (const col of ['todo', 'doing', 'review', 'done']) {
          idx = proj.activeSprint[col].findIndex(i => i.id === id);
          if (idx !== -1) return { proj, container: proj.activeSprint, col, idx };
        }
      }
    }
    return null;
  }

  function removeItem(id) {
    const loc = findItem(id);
    if (loc) {
      pushHistory();
      loc.container[loc.col].splice(loc.idx, 1);
      save(state);
    }
  }

  function moveItem(id, targetCol, targetIndex) {
    const loc = findItem(id);
    if (!loc) return;
    const targetContainer = resolveContainer(loc.proj, targetCol);
    if (!targetContainer) return; // e.g. scrum view with no active sprint -- nowhere to drop
    pushHistory();
    const [item] = loc.container[loc.col].splice(loc.idx, 1);
    syncCompletedAt(loc, targetContainer, targetCol, item);
    if (targetIndex === undefined || targetIndex > targetContainer[targetCol].length) {
      targetContainer[targetCol].push(item);
    } else {
      targetContainer[targetCol].splice(targetIndex, 0, item);
    }
    save(state);
  }

  function moveItemToProject(id, targetProjectId) {
    const loc = findItem(id);
    if (!loc) return;
    const targetProj = state.projects.find(p => p.id === targetProjectId);
    if (!targetProj) return;
    pushHistory();
    const [item] = loc.container[loc.col].splice(loc.idx, 1);
    // Preserve pool: a Kanban item lands in the target's todo; anything
    // from the Scrum side (backlog or an active sprint's columns) lands in
    // the target's backlog -- simplest safe default rather than guessing
    // at an equivalent sprint column in a different, possibly sprint-less
    // project.
    if (loc.container === loc.proj && loc.col !== 'backlog') {
      syncCompletedAt(loc, targetProj, 'todo', item);
      targetProj.todo.push(item);
    } else {
      syncCompletedAt(loc, targetProj, 'backlog', item);
      targetProj.backlog.push(item);
    }
    save(state);
  }

  // Moves a card to the other pool within the same project (Kanban <->
  // Scrum), via the kebab menu's "Send to Scrum"/"Send to Kanban" action.
  function sendToOtherPool(id) {
    const loc = findItem(id);
    if (!loc) return;
    pushHistory();
    const [item] = loc.container[loc.col].splice(loc.idx, 1);
    if (loc.container === loc.proj && loc.col !== 'backlog') {
      syncCompletedAt(loc, loc.proj, 'backlog', item);
      loc.proj.backlog.push(item); // kanban -> scrum backlog
    } else {
      syncCompletedAt(loc, loc.proj, 'todo', item);
      loc.proj.todo.push(item); // scrum (backlog or in-sprint) -> kanban todo
    }
    save(state);
    render();
  }

  // targetIndex is the position within the current (pre-removal) projects
  // array to insert at; adjusted below to account for the array shrinking
  // by one once the dragged project is spliced out ahead of that point.
  function reorderProject(id, targetIndex) {
    const fromIndex = state.projects.findIndex(p => p.id === id);
    if (fromIndex === -1) return;
    pushHistory();
    const [proj] = state.projects.splice(fromIndex, 1);
    let insertAt = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
    insertAt = Math.max(0, Math.min(insertAt, state.projects.length));
    state.projects.splice(insertAt, 0, proj);
    save(state);
  }

  // Shared by desktop drop and touch-drag drop: finds the index to insert at
  // within `zone` based on a vertical coordinate, using the midpoint of each
  // existing (non-dragging) card.
  function computeTargetIndex(zone, clientY) {
    const after = [...zone.querySelectorAll('.card:not(.dragging)')].find(card => {
      const rect = card.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    return after ? [...zone.children].indexOf(after) : undefined;
  }

  COLS.forEach(col => {
    const zone = document.getElementById('dropzone-' + col);

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
      e.dataTransfer.dropEffect = 'move';
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      const targetIndex = computeTargetIndex(zone, e.clientY);
      moveItem(id, col, targetIndex);
      render();
    });
  });

  // Catches a tab drag dropped in empty space after the last tab (not on any
  // specific tab) -- appends the dragged project to the end. Set up once
  // here since #project-tabs itself persists across renders, unlike the
  // individual .project-tab children which are rebuilt every renderTabs().
  const projectTabsEl = document.getElementById('project-tabs');
  projectTabsEl.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('application/x-project-tab')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  });
  projectTabsEl.addEventListener('drop', (e) => {
    if (e.target !== projectTabsEl) return;
    const draggedTabId = e.dataTransfer.getData('application/x-project-tab');
    if (draggedTabId) {
      reorderProject(draggedTabId, state.projects.length);
      render();
    }
  });

  // ---- Touch drag-and-drop (mobile long-press-to-drag) ----

  function armTouchDrag() {
    if (!touchDrag) return;
    touchDrag.armed = true;
    touchDrag.originCard.classList.add('dragging');
    const rect = touchDrag.originCard.getBoundingClientRect();
    const ghost = touchDrag.originCard.cloneNode(true);
    ghost.classList.remove('dragging');
    ghost.classList.add('card-ghost');
    ghost.style.width = rect.width + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    document.body.appendChild(ghost);
    touchDrag.ghost = ghost;
    touchDrag.ghostOffsetX = touchDrag.startX - rect.left;
    touchDrag.ghostOffsetY = touchDrag.startY - rect.top;
  }

  function findDropTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const tab = el.closest('.project-tab');
    if (tab) return { type: 'tab', el: tab };
    const zone = el.closest('.dropzone');
    if (zone) return { type: 'zone', el: zone };
    return null;
  }

  function updateTouchDragAutoScroll(clientY) {
    const vh = window.innerHeight;
    let speed = 0;
    if (clientY < TOUCH_SCROLL_EDGE_PX) {
      speed = -TOUCH_SCROLL_MAX_SPEED * (1 - clientY / TOUCH_SCROLL_EDGE_PX);
    } else if (clientY > vh - TOUCH_SCROLL_EDGE_PX) {
      speed = TOUCH_SCROLL_MAX_SPEED * (1 - (vh - clientY) / TOUCH_SCROLL_EDGE_PX);
    }
    touchDrag.scrollSpeed = speed;
    if (speed !== 0 && touchDrag.rafId === null) {
      const step = () => {
        if (!touchDrag || touchDrag.scrollSpeed === 0) {
          if (touchDrag) touchDrag.rafId = null;
          return;
        }
        window.scrollBy(0, touchDrag.scrollSpeed);
        touchDrag.rafId = requestAnimationFrame(step);
      };
      touchDrag.rafId = requestAnimationFrame(step);
    } else if (speed === 0 && touchDrag.rafId !== null) {
      cancelAnimationFrame(touchDrag.rafId);
      touchDrag.rafId = null;
    }
  }

  function updateTouchDragPosition(clientX, clientY) {
    if (!touchDrag.ghost) return;
    touchDrag.ghost.style.left = (clientX - touchDrag.ghostOffsetX) + 'px';
    touchDrag.ghost.style.top = (clientY - touchDrag.ghostOffsetY) + 'px';

    const target = findDropTarget(clientX, clientY);
    const targetEl = target ? target.el : null;
    if (targetEl !== touchDrag.currentDropEl) {
      if (touchDrag.currentDropEl) touchDrag.currentDropEl.classList.remove('drag-over');
      if (targetEl && !(target.type === 'tab' && targetEl.dataset.id === state.activeProjectId)) {
        targetEl.classList.add('drag-over');
        touchDrag.currentDropEl = targetEl;
      } else {
        touchDrag.currentDropEl = null;
      }
    }

    updateTouchDragAutoScroll(clientY);
  }

  function finishTouchDrag() {
    const lastX = touchDrag.ghost ? parseFloat(touchDrag.ghost.style.left) + touchDrag.ghostOffsetX : touchDrag.startX;
    const lastY = touchDrag.ghost ? parseFloat(touchDrag.ghost.style.top) + touchDrag.ghostOffsetY : touchDrag.startY;
    const target = findDropTarget(lastX, lastY);
    if (target && target.type === 'tab' && target.el.dataset.id !== state.activeProjectId) {
      moveItemToProject(touchDrag.itemId, target.el.dataset.id);
      render();
    } else if (target && target.type === 'zone') {
      const targetCol = target.el.dataset.col;
      const targetIndex = computeTargetIndex(target.el, lastY);
      moveItem(touchDrag.itemId, targetCol, targetIndex);
      render();
    }
    cleanupTouchDrag();
  }

  function cleanupTouchDrag() {
    if (!touchDrag) return;
    if (touchDrag.longPressTimer) clearTimeout(touchDrag.longPressTimer);
    if (touchDrag.rafId) cancelAnimationFrame(touchDrag.rafId);
    if (touchDrag.ghost) touchDrag.ghost.remove();
    if (touchDrag.originCard) touchDrag.originCard.classList.remove('dragging');
    if (touchDrag.currentDropEl) touchDrag.currentDropEl.classList.remove('drag-over');
    touchDrag = null;
  }

  // The only way to create a task -- called from the add-task modal's submit
  // below. Returns false (and creates nothing) if the column has nowhere to
  // go right now -- e.g. a Scrum column other than Backlog with no active
  // sprint.
  function createTask(col, text, opts) {
    const proj = activeProject();
    const container = resolveContainer(proj, col);
    if (!container) return false;
    pushHistory();
    const completedAt = isDoneContainer(proj, container, col) ? todayDateStr() : null;
    container[col].push({
      id: uid(), text: text, created: Date.now(),
      deadline: (opts && opts.deadline) || null,
      points: (opts && opts.points != null) ? opts.points : null,
      completedAt: completedAt
    });
    save(state);
    return true;
  }

  // Add/edit-task modal -- title/description (stored as line 1 + the rest
  // of item.text, same convention renderView() already uses to decide
  // what's always-visible vs. hidden behind "Show details") plus optional
  // deadline/points. Doubles as the task's only editing surface (see issue
  // #45): taskModalEditId is null while adding a new task (taskModalCol
  // says which column it'll land in) and holds an existing item's id while
  // editing one (found fresh via findItem() at submit time, rather than
  // captured up front, in case something else moved it meanwhile).
  let taskModalCol = null;
  let taskModalEditId = null;

  function openTaskModal(col) {
    taskModalCol = col;
    taskModalEditId = null;
    document.getElementById('task-modal-heading').textContent = 'Add a task';
    document.getElementById('task-modal-submit').textContent = 'Add Task';
    document.getElementById('task-modal-title-input').value = '';
    document.getElementById('task-modal-description-input').value = '';
    document.getElementById('task-modal-deadline-input').value = '';
    document.getElementById('task-modal-points-input').value = '';
    document.getElementById('task-modal-backdrop').style.display = 'flex';
    document.getElementById('task-modal-title-input').focus();
  }

  function openEditTaskModal(item) {
    taskModalCol = null;
    taskModalEditId = item.id;
    document.getElementById('task-modal-heading').textContent = 'Edit task';
    document.getElementById('task-modal-submit').textContent = 'Save Changes';
    const lines = item.text.split('\n');
    document.getElementById('task-modal-title-input').value = lines[0];
    document.getElementById('task-modal-description-input').value = lines.slice(1).join('\n');
    document.getElementById('task-modal-deadline-input').value = item.deadline || '';
    document.getElementById('task-modal-points-input').value = item.points != null ? item.points : '';
    document.getElementById('task-modal-backdrop').style.display = 'flex';
    document.getElementById('task-modal-title-input').focus();
  }

  function closeTaskModal() {
    document.getElementById('task-modal-backdrop').style.display = 'none';
    taskModalCol = null;
    taskModalEditId = null;
  }

  function submitTaskModal() {
    const title = document.getElementById('task-modal-title-input').value.trim();
    if (!title) { alert('Give the task a title first.'); return; }
    const description = document.getElementById('task-modal-description-input').value.trim();
    const text = description ? title + '\n' + description : title;
    const deadline = document.getElementById('task-modal-deadline-input').value || null;
    const pointsVal = document.getElementById('task-modal-points-input').value;
    const points = pointsVal === '' ? null : Math.max(0, Math.round(Number(pointsVal)));

    if (taskModalEditId) {
      const loc = findItem(taskModalEditId);
      if (loc) {
        const item = loc.container[loc.col][loc.idx];
        if (text !== item.text || deadline !== item.deadline || points !== item.points) {
          pushHistory();
          item.text = text;
          item.deadline = deadline;
          item.points = points;
          save(state);
        }
      }
    } else if (!createTask(taskModalCol, text, { deadline: deadline, points: points })) {
      alert('Start a sprint before adding tasks here.');
      return;
    }
    closeTaskModal();
    render();
  }

  document.querySelectorAll('.add-task-btn').forEach(btn => {
    btn.addEventListener('click', () => openTaskModal(btn.dataset.col));
  });

  document.getElementById('task-modal-cancel').addEventListener('click', closeTaskModal);
  document.getElementById('task-modal-submit').addEventListener('click', submitTaskModal);
  document.getElementById('task-modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'task-modal-backdrop') closeTaskModal();
  });
  // Only the Title field submits on Enter -- the Description field is for
  // multi-line detail, so Enter there is a plain newline, same as
  // everywhere else multi-line task text is edited.
  document.getElementById('task-modal-title-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitTaskModal();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('task-modal-backdrop').style.display === 'flex') {
      closeTaskModal();
    }
  });

  document.getElementById('undo-btn').addEventListener('click', undo);
  document.getElementById('redo-btn').addEventListener('click', redo);
  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
  updateThemeToggleButton();

  const saveMenuBtn = document.getElementById('save-menu-btn');
  const saveMenuDropdown = document.getElementById('save-menu-dropdown');

  saveMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (fileHandleNeedsPermission) {
      reconnectSaveFile();
      return;
    }
    saveMenuDropdown.classList.toggle('open');
  });

  document.getElementById('load-save-file-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    saveMenuDropdown.classList.remove('open');
    loadSaveFile();
  });

  document.getElementById('new-save-file-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    saveMenuDropdown.classList.remove('open');
    createNewSaveFile();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.card-menu') && !e.target.closest('.card-menu-dropdown')) {
      closeAllCardMenus();
    }
    if (!e.target.closest('.save-menu')) {
      saveMenuDropdown.classList.remove('open');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllCardMenus();
      saveMenuDropdown.classList.remove('open');
    }
  });

  // The dropdown's fixed position is computed at open time (see
  // positionCardMenuDropdown) rather than re-tracked continuously, so a
  // scroll or resize would otherwise leave it visually stranded away from
  // its button -- recompute it on both instead of just closing the menu,
  // since closing on every scroll (including a scroll a click itself
  // triggers to bring an element into view) is more disruptive than
  // keeping the menu open and correctly anchored.
  function repositionOpenCardMenu() {
    const dropdown = document.querySelector('.card-menu-dropdown.open');
    if (dropdown && dropdown._menuBtn) positionCardMenuDropdown(dropdown._menuBtn, dropdown);
  }
  window.addEventListener('scroll', repositionOpenCardMenu, true);
  window.addEventListener('resize', repositionOpenCardMenu);

  document.addEventListener('keydown', (e) => {
    const modifier = e.metaKey || e.ctrlKey;
    if (!modifier) return;
    const activeEl = document.activeElement;
    const isEditingField = activeEl && (activeEl.isContentEditable || activeEl.tagName === 'TEXTAREA');
    if (isEditingField) return;

    const key = e.key.toLowerCase();
    if (key === 'z' && e.shiftKey) {
      e.preventDefault();
      redo();
    } else if (key === 'z') {
      e.preventDefault();
      undo();
    } else if (key === 'y') {
      e.preventDefault();
      redo();
    }
  });
