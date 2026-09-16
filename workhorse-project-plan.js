  // Project Plan & Scope (issue #48) -- a plain local file path stored
  // directly on the project (proj.planPath), same as proj.name, so it
  // travels with the save file and participates in undo/redo like any
  // other project edit. Opened as a file:// link rather than through a
  // File System Access picker/handle specifically so editing the plan in
  // its native app (Word, etc.) never requires reconnecting it here --
  // a picker's permission can lapse the same way the save file's does, and
  // the whole point of a stored path is to avoid that friction.
  //
  // Lives in its own file, separate from workhorse-scrum.js, since this
  // control is shown in both Kanban and Scrum mode (see renderProjectToolbar
  // in workhorse-scrum.js) and isn't Scrum-specific at all -- it only used
  // to live there because both are rendered from the same call site (issue
  // #58). Loads after workhorse-core.js (needs pushHistory/save/state) and
  // before workhorse-scrum.js (whose renderProjectToolbar calls
  // renderProjectPlanControl, and whose final render() call is the first
  // point anything here actually executes).
  function projectPlanFileName(path) {
    const clean = path.replace(/[\\/]+$/, '');
    const parts = clean.split(/[\\/]/);
    return parts[parts.length - 1] || clean;
  }

  // Converts a raw local path (as pasted from Explorer's "Copy as path",
  // typically with backslashes and no scheme) into a file:// URL. Segments
  // are percent-encoded individually so spaces/#/? etc. in a filename don't
  // break URL parsing, but a Windows drive letter's colon (e.g. "C:") is
  // deliberately left un-encoded -- it has to stay literal for the URL to
  // resolve to that drive at all.
  // Explorer's right-click "Copy as path" wraps its result in straight
  // double quotes (e.g. "C:\Users\...\Plan.docx") -- exactly the paste
  // workflow this feature is built around, so a quoted path has to just
  // work rather than requiring the user to manually edit them out first.
  function stripSurroundingQuotes(str) {
    const trimmed = str.trim();
    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  }

  function pathToFileUrl(rawPath) {
    const path = stripSurroundingQuotes(rawPath).replace(/\\/g, '/');
    const driveMatch = path.match(/^([a-zA-Z]:)\/(.*)$/);
    if (driveMatch) {
      return 'file:///' + driveMatch[1] + '/' + driveMatch[2].split('/').map(encodeURIComponent).join('/');
    }
    if (path.startsWith('//')) { // UNC path: \\server\share\...
      return 'file://' + path.slice(2).split('/').map(encodeURIComponent).join('/');
    }
    if (path.startsWith('/')) { // POSIX absolute path
      return 'file://' + path.split('/').map(encodeURIComponent).join('/');
    }
    return 'file:///' + path.split('/').map(encodeURIComponent).join('/'); // best-effort fallback
  }

  function renderProjectPlanControl(proj, toolbar) {
    const wrap = document.createElement('div');
    wrap.className = 'project-plan';

    if (proj.planPath) {
      const link = document.createElement('a');
      link.className = 'save-status-btn project-plan-open';
      link.href = pathToFileUrl(proj.planPath);
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = proj.planPath;
      link.textContent = '\uD83D\uDCC4 ' + projectPlanFileName(proj.planPath);
      wrap.appendChild(link);

      const editBtn = document.createElement('button');
      editBtn.className = 'project-plan-edit';
      editBtn.type = 'button';
      editBtn.title = 'Change the project plan link';
      editBtn.textContent = '\u270E';
      editBtn.addEventListener('click', () => openPlanModal(proj));
      wrap.appendChild(editBtn);
    } else {
      const addBtn = document.createElement('button');
      addBtn.className = 'save-status-btn';
      addBtn.type = 'button';
      addBtn.textContent = '+ Project Plan';
      addBtn.addEventListener('click', () => openPlanModal(proj));
      wrap.appendChild(addBtn);
    }

    toolbar.appendChild(wrap);
  }

  let planModalProj = null;

  function openPlanModal(proj) {
    planModalProj = proj;
    document.getElementById('plan-path-input').value = proj.planPath || '';
    document.getElementById('plan-modal-backdrop').style.display = 'flex';
    document.getElementById('plan-path-input').focus();
  }

  function closePlanModal() {
    document.getElementById('plan-modal-backdrop').style.display = 'none';
    planModalProj = null;
  }

  function savePlanPath(newPath) {
    if (!planModalProj) return;
    const normalized = stripSurroundingQuotes(newPath || '') || null;
    if (normalized !== planModalProj.planPath) {
      pushHistory();
      planModalProj.planPath = normalized;
      save(state);
      render();
    }
    closePlanModal();
  }

  document.getElementById('plan-modal-submit').addEventListener('click', () => {
    savePlanPath(document.getElementById('plan-path-input').value);
  });
  document.getElementById('plan-modal-clear').addEventListener('click', () => savePlanPath(''));
  document.getElementById('plan-modal-cancel').addEventListener('click', closePlanModal);
  document.getElementById('plan-modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'plan-modal-backdrop') closePlanModal();
  });
  document.getElementById('plan-path-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      savePlanPath(document.getElementById('plan-path-input').value);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('plan-modal-backdrop').style.display === 'flex') {
      closePlanModal();
    }
  });
