  const APP_VERSION = 'v1.4';
  const STORAGE_KEY = 'kanban-personal-board-v1';
  const THEME_STORAGE_KEY = 'kanban-theme-v1';
  const COLS = ['backlog', 'todo', 'doing', 'review', 'done'];
  const DONE_STACK_VISIBLE_COUNT = 4;
  const TRUNCATE_CLAMP_HEIGHT = 190; // px; keep in sync with .card-list-view.clamped max-height below
  const supportsFS = 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;

  // Theme state only reads a DOM attribute already set by the early <head>
  // anti-flash script — safe to declare here, no dependency on anything below.
  let currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function makeProject(name) {
    return {
      id: uid(), name: name,
      todo: [], doing: [], review: [], done: [],
      backlog: [], mode: 'kanban', activeSprint: null, sprints: []
    };
  }

  function migrateItem(item) {
    if (typeof item.text !== 'string') item.text = '';
    if (item.listType === 'checklist' && Array.isArray(item.checked)) {
      const lines = item.text.split('\n');
      let ci = 0;
      const newLines = lines.map(line => {
        if (line.trim() === '') return line;
        const prefix = item.checked[ci] ? '[x] ' : '[] ';
        ci++;
        return prefix + line;
      });
      item.text = newLines.join('\n');
    } else if (item.listType === 'bullet') {
      const lines = item.text.split('\n');
      item.text = lines.map(line => line.trim() === '' ? line : '* ' + line).join('\n');
    }
    delete item.listType;
    delete item.checked;
  }

  function migrateState(parsed) {
    parsed.projects.forEach(p => {
      COLS.forEach(col => {
        (p[col] || []).forEach(migrateItem);
      });
      if (!p.mode) p.mode = 'kanban';
      if (!Array.isArray(p.backlog)) p.backlog = [];
      if (!Array.isArray(p.review)) p.review = [];
      if (!Array.isArray(p.sprints)) p.sprints = [];
      if (p.activeSprint === undefined) p.activeSprint = null;
    });
    if (!parsed.activeProjectId || !parsed.projects.some(p => p.id === parsed.activeProjectId)) {
      parsed.activeProjectId = parsed.projects[0].id;
    }
    return parsed;
  }

  // Returns a parsed+migrated state object if `text` looks like valid kanban
  // board data, or null if it doesn't. Never throws.
  function parseStateFromText(text) {
    if (!text || !text.trim()) return null;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return null;
    }
    if (parsed && Array.isArray(parsed.projects) && parsed.projects.length) {
      return migrateState(parsed);
    }
    if (parsed && Array.isArray(parsed.todo)) {
      const proj = makeProject('My Tasks');
      proj.todo = parsed.todo || [];
      proj.doing = parsed.doing || [];
      proj.done = parsed.done || [];
      COLS.forEach(col => proj[col].forEach(migrateItem));
      return { projects: [proj], activeProjectId: proj.id };
    }
    return null;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const fromLocal = parseStateFromText(raw);
      if (fromLocal) return fromLocal;
    } catch (e) { console.error('Could not read saved board', e); }
    const proj = makeProject('My Tasks');
    return { projects: [proj], activeProjectId: proj.id };
  }

  function save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { console.error('Could not save board', e); }
    queueFileWrite();
  }

  // ---- File System Access (real autosave to a user-chosen file) ----
  // These must be declared before load()/save() are first called below,
  // since save() -> queueFileWrite() reads `fileHandle` immediately.

  const DB_NAME = 'kanban-fs-db';
  const DB_STORE = 'handles';
  const HANDLE_KEY = 'saveFile';

  let fileHandle = null;
  let pendingHandle = null;
  let fileHandleNeedsPermission = false;
  let fileConnectionChecked = false;
  let writeQueue = Promise.resolve();

  let state = load();
  save(state);

  function openHandleDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(DB_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function storeHandle(handle) {
    try {
      const db = await openHandleDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(handle, HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { console.error('Could not remember save file', e); }
  }

  async function getStoredHandle() {
    try {
      const db = await openHandleDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get(HANDLE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    }
  }

  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch (e) {}
    updateThemeToggleButton();
  }

  function updateThemeToggleButton() {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    btn.textContent = currentTheme === 'dark' ? '☀' : '☾';
    btn.title = currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  }

  function toggleTheme() {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }

  function updateSaveFileStatus() {
    const wrap = document.getElementById('save-status');
    const textEl = document.getElementById('save-status-text');
    const btnEl = document.getElementById('save-menu-btn');
    wrap.classList.remove('needs-attention');

    if (!supportsFS) {
      textEl.textContent = 'autosaving in this browser only';
      btnEl.style.display = 'none';
      document.getElementById('save-warning-backdrop').style.display = 'none';
      return;
    }
    if (fileHandle) {
      textEl.textContent = 'autosaving to ' + (fileHandle.name || 'save file');
      btnEl.textContent = 'Change';
      btnEl.style.display = '';
    } else if (fileHandleNeedsPermission) {
      textEl.textContent = 'save file disconnected';
      btnEl.textContent = 'Reconnect';
      btnEl.style.display = '';
      wrap.classList.add('needs-attention');
    } else {
      textEl.textContent = 'autosaving in this browser only';
      btnEl.textContent = 'Connect save file';
      btnEl.style.display = '';
    }

    const backdrop = document.getElementById('save-warning-backdrop');
    const warnBtn = document.getElementById('save-warning-btn');
    const warnText = document.getElementById('save-warning-text');
    const shouldWarn = fileConnectionChecked && !fileHandle;
    backdrop.style.display = shouldWarn ? 'flex' : 'none';
    if (shouldWarn) {
      if (fileHandleNeedsPermission) {
        warnText.textContent = 'Your save file connection needs to be re-confirmed after a browser restart.';
        warnBtn.textContent = 'Reconnect';
        warnBtn.onclick = reconnectSaveFile;
      } else {
        warnText.textContent = 'Your tasks are only saved in this browser. Connect a save file now to avoid losing your data.';
        warnBtn.textContent = 'Load existing file…';
        warnBtn.onclick = loadSaveFile;
      }
    }
  }

  async function writeToFileHandle(data) {
    if (!fileHandle) return;
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
    } catch (e) {
      console.error('Could not write save file', e);
      pendingHandle = fileHandle;
      fileHandle = null;
      fileHandleNeedsPermission = true;
      updateSaveFileStatus();
    }
  }

  function queueFileWrite() {
    if (!fileHandle) return;
    writeQueue = writeQueue.then(() => writeToFileHandle(state)).catch(err => console.error('Save file write failed', err));
  }

  // Reads the currently-connected fileHandle and loads it into `state` if
  // (and only if) its content is recognizable board data, OR if the file is
  // genuinely empty (safe to seed with the current board). If the file has
  // real content that we don't recognize, this REFUSES to touch it and
  // returns false, so the caller can alert the user instead of silently
  // destroying their data.
  async function loadFromFileHandle() {
    try {
      const file = await fileHandle.getFile();
      const text = await file.text();

      if (!text || !text.trim()) {
        await writeToFileHandle(state);
        render();
        return true;
      }

      const parsedState = parseStateFromText(text);
      if (parsedState) {
        state = parsedState;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        render();
        return true;
      }

      console.error('Save file has unrecognized content; refusing to modify it.');
      fileHandle = null;
      return false;
    } catch (e) {
      console.error('Could not read save file', e);
      fileHandle = null;
      return false;
    }
  }

  // Loads an existing save file chosen via the "Open" dialog (guarantees a
  // real read of the file's current bytes, unlike the "Save" dialog).
  async function loadSaveFile() {
    if (!supportsFS) return;
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Kanban save file', accept: { 'application/json': ['.json'] } }],
        multiple: false
      });

      let perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        perm = await handle.requestPermission({ mode: 'readwrite' });
      }
      if (perm !== 'granted') {
        alert('Read-write access is needed so this file can keep autosaving. Please try again and allow access when prompted.');
        return;
      }

      fileHandle = handle;
      fileHandleNeedsPermission = false;
      pendingHandle = null;

      const ok = await loadFromFileHandle();
      if (ok) {
        await storeHandle(handle);
      } else {
        alert('That file doesn\u2019t look like a kanban save file, or its contents couldn\u2019t be read. Nothing was changed \u2014 your board and that file are both untouched.');
      }
      updateSaveFileStatus();
    } catch (e) {
      if (e.name !== 'AbortError') console.error('Could not load save file', e);
    }
  }

  // Creates a brand-new save file via the "Save" dialog. Warns before
  // overwriting if the chosen file already has content.
  async function createNewSaveFile() {
    if (!supportsFS) return;
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'kanban-data.json',
        types: [{ description: 'Kanban save file', accept: { 'application/json': ['.json'] } }]
      });

      try {
        const existingFile = await handle.getFile();
        const existingText = await existingFile.text();
        if (existingText && existingText.trim()) {
          const proceed = confirm('That file already has content. Starting a new save file here will overwrite it with your current board. Continue?');
          if (!proceed) return;
        }
      } catch (e) { /* new/unreadable file - fine to proceed */ }

      fileHandle = handle;
      fileHandleNeedsPermission = false;
      pendingHandle = null;
      await storeHandle(handle);
      await writeToFileHandle(state);
      render();
      updateSaveFileStatus();
    } catch (e) {
      if (e.name !== 'AbortError') console.error('Could not create save file', e);
    }
  }

  async function reconnectSaveFile() {
    if (!pendingHandle) return;
    try {
      const perm = await pendingHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        fileHandle = pendingHandle;
        fileHandleNeedsPermission = false;
        pendingHandle = null;
        const ok = await loadFromFileHandle();
        if (!ok) {
          alert('That save file doesn\u2019t look valid anymore. Use "Load existing file" to pick a different one.');
        }
        updateSaveFileStatus();
      }
    } catch (e) {
      console.error('Could not reconnect save file', e);
    }
  }

  async function initFileConnection() {
    fileConnectionChecked = true;
    if (!supportsFS) { updateSaveFileStatus(); return; }
    const handle = await getStoredHandle();
    if (!handle) { updateSaveFileStatus(); return; }
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        fileHandle = handle;
        await loadFromFileHandle();
      } else {
        pendingHandle = handle;
        fileHandleNeedsPermission = true;
      }
    } catch (e) {
      console.error('Could not verify save file permission', e);
    }
    updateSaveFileStatus();
  }

  // ---- End File System Access ----

  function activeProject() {
    return state.projects.find(p => p.id === state.activeProjectId) || state.projects[0];
  }

  const HISTORY_LIMIT = 50;
  let undoStack = [];
  let redoStack = [];

  // Ephemeral UI-only state — never touches state/save()/pushHistory(), resets on reload.
  let expandedStacks = new Set();
  let expandedCards = new Set();

  // Touch drag-and-drop (mobile). Mirrors desktop HTML5 DnD state but driven by touch events.
  const TOUCH_LONG_PRESS_MS = 450;
  const TOUCH_MOVE_CANCEL_PX = 10;   // pre-arm: finger travel that cancels the long-press (treat as scroll)
  const TOUCH_SCROLL_EDGE_PX = 60;   // distance from viewport top/bottom that triggers auto-scroll
  const TOUCH_SCROLL_MAX_SPEED = 18; // px per animation frame at the edge
  let touchDrag = null;

  function pushHistory() {
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(state));
    state = JSON.parse(undoStack.pop());
    save(state);
    render();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(state));
    state = JSON.parse(redoStack.pop());
    save(state);
    render();
  }
