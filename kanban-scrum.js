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

  // render()'s first call has to happen after every script has loaded (it
  // calls renderProjectToolbar, defined above), so it lives in whichever
  // file loads last rather than in kanban-render.js itself.
  render();
  updateSaveFileStatus();
  initFileConnection().catch(err => console.error('File connection init failed', err));
