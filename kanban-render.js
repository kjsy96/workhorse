  function formatDate(ts) {
    const d = new Date(ts);
    const opts = { month: 'short', day: 'numeric' };
    return d.toLocaleDateString(undefined, opts);
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
    COLS.forEach(col => {
      const zone = document.getElementById('dropzone-' + col);
      zone.innerHTML = '';
      const items = proj[col] || [];
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

        const text = document.createElement('div');
        text.className = 'card-text';
        text.contentEditable = 'false';
        text.spellcheck = false;
        text.textContent = item.text;
        card.appendChild(text);

        const listView = document.createElement('div');
        listView.className = 'card-list-view';
        card.appendChild(listView);

        let editingNow = false;
        let editStartText = item.text;

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

        function renderView() {
          listView.innerHTML = '';
          const existingToggle = card.querySelector('.card-truncate-toggle');
          if (existingToggle) existingToggle.remove();

          const lines = item.text.split('\n');
          let currentList = null;
          lines.forEach((rawLine, idx) => {
            if (rawLine.trim() === '') {
              currentList = null;
              const spacer = document.createElement('div');
              spacer.className = 'card-line-text';
              spacer.innerHTML = '&nbsp;';
              listView.appendChild(spacer);
              return;
            }
            const parsed = parseLine(rawLine);
            if (parsed.type === 'bullet') {
              if (!currentList) {
                currentList = document.createElement('ul');
                currentList.className = 'card-bullet-list';
                listView.appendChild(currentList);
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
              listView.appendChild(row);
            } else {
              currentList = null;
              const p = document.createElement('div');
              p.className = 'card-line-text';
              p.textContent = parsed.content;
              listView.appendChild(p);
            }
          });

          const isExpanded = expandedCards.has(item.id);

          const applyTruncation = () => {
            if (!listView.isConnected) return;
            const isOverflowing = listView.scrollHeight > TRUNCATE_CLAMP_HEIGHT;
            listView.classList.toggle('clamped', isOverflowing && !isExpanded);
            if (isOverflowing) {
              const toggleBtn = document.createElement('button');
              toggleBtn.className = 'card-truncate-toggle';
              toggleBtn.textContent = isExpanded ? 'Show less' : 'Show more';
              toggleBtn.addEventListener('mousedown', (e) => e.stopPropagation());
              toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isExpanded) expandedCards.delete(item.id); else expandedCards.add(item.id);
                renderView();
              });
              listView.insertAdjacentElement('afterend', toggleBtn);
            }
          };

          if (listView.isConnected) applyTruncation();
          else requestAnimationFrame(applyTruncation);
        }

        function updateBodyVisibility() {
          text.style.display = editingNow ? '' : 'none';
          listView.style.display = editingNow ? 'none' : '';
          if (!editingNow) renderView();
        }
        updateBodyVisibility();

        function enterEdit() {
          editStartText = item.text;
          editingNow = true;
          text.contentEditable = 'true';
          card.draggable = false;
          card.classList.add('editing');
          updateBodyVisibility();
          text.focus();
          const range = document.createRange();
          range.selectNodeContents(text);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }

        function exitEdit() {
          text.contentEditable = 'false';
          card.draggable = true;
          card.classList.remove('editing');
          editingNow = false;
          const newText = extractEditableText(text).trim();
          if (!newText) {
            removeItem(item.id);
            render();
            return;
          }
          if (newText !== item.text) {
            pushHistory();
            item.text = newText;
            save(state);
          }
          updateBodyVisibility();
        }

        text.addEventListener('blur', exitEdit);
        text.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            const inserted = document.execCommand && document.execCommand('insertText', false, '\n');
            if (!inserted) {
              const sel = window.getSelection();
              if (sel && sel.rangeCount) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                const newlineNode = document.createTextNode('\n');
                range.insertNode(newlineNode);
                range.setStartAfter(newlineNode);
                range.setEndAfter(newlineNode);
                sel.removeAllRanges();
                sel.addRange(range);
              }
            }
            return;
          }
          if (e.key === 'Enter') { e.preventDefault(); text.blur(); }
          if (e.key === 'Escape') {
            e.preventDefault();
            text.textContent = editStartText;
            text.blur();
          }
        });

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
          enterEdit();
        });
        dropdown.appendChild(editItem);

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
        });
        dropdown.appendChild(clearPointsBtn);

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

        menuWrap.appendChild(dropdown);

        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = menuWrap.classList.contains('open');
          closeAllCardMenus();
          if (!isOpen) {
            menuWrap.classList.add('open');
            card.classList.add('menu-open');
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
        });

        footerRow.appendChild(dateWrap);
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
          if (editingNow) return;
          if (e.target.closest('.card-menu, .checklist-row, .card-truncate-toggle')) return;
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

  function findItem(id) {
    for (const proj of state.projects) {
      for (const col of COLS) {
        const idx = proj[col].findIndex(i => i.id === id);
        if (idx !== -1) return { proj, col, idx };
      }
    }
    return null;
  }

  function removeItem(id) {
    const loc = findItem(id);
    if (loc) {
      pushHistory();
      loc.proj[loc.col].splice(loc.idx, 1);
      save(state);
    }
  }

  function moveItem(id, targetCol, targetIndex) {
    const loc = findItem(id);
    if (!loc) return;
    pushHistory();
    const [item] = loc.proj[loc.col].splice(loc.idx, 1);
    const targetProj = loc.proj;
    if (targetIndex === undefined || targetIndex > targetProj[targetCol].length) {
      targetProj[targetCol].push(item);
    } else {
      targetProj[targetCol].splice(targetIndex, 0, item);
    }
    save(state);
  }

  function moveItemToProject(id, targetProjectId) {
    const loc = findItem(id);
    if (!loc) return;
    const targetProj = state.projects.find(p => p.id === targetProjectId);
    if (!targetProj) return;
    pushHistory();
    const [item] = loc.proj[loc.col].splice(loc.idx, 1);
    targetProj[loc.col].push(item);
    save(state);
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
  // Reads the plain-text content of an edited card's contentEditable div,
  // reconstructing a '\n' at each block/line boundary. Plain `.textContent`
  // silently drops line breaks: Shift+Enter (via execCommand('insertText'))
  // produces a new <div> (with a lone <br> if the line is still empty), not a
  // literal '\n' character, and .textContent has no separator for those
  // boundaries at all. `.innerText` was tried and rejected — it double-counts
  // a trailing empty <div><br></div> line, since the <br> and the div
  // boundary each independently contribute a break.
  function extractEditableText(root) {
    let text = '';
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.nodeValue;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.tagName === 'BR') {
        text += '\n';
        return;
      }
      if (node.tagName === 'DIV' || node.tagName === 'P') {
        text += '\n';
        const onlyChild = node.childNodes.length === 1 ? node.childNodes[0] : null;
        if (onlyChild && onlyChild.nodeType === Node.ELEMENT_NODE && onlyChild.tagName === 'BR') {
          return; // empty-line placeholder — already accounted for by the '\n' above
        }
        for (const child of node.childNodes) walk(child);
        return;
      }
      for (const child of node.childNodes) walk(child);
    }
    for (const child of root.childNodes) walk(child);
    return text;
  }

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

  document.querySelectorAll('.add-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        const col = input.dataset.col;
        pushHistory();
        activeProject()[col].push({ id: uid(), text: text, created: Date.now(), deadline: null, points: null });
        save(state);
        input.value = '';
        input.style.height = 'auto';
        render();
      }
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = input.scrollHeight + 'px';
    });
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
    if (!e.target.closest('.card-menu')) {
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
