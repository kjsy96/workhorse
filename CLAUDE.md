# Kanban Board — Project Notes for Claude Code

This is a single-file HTML/CSS/JS kanban board app, built incrementally across a series of chat sessions with Claude (claude.ai). This file exists to hand off full project context to Claude Code, since chat memory doesn't carry over automatically between products. Read this whole file before making changes — several sections document real bugs and their fixes, and repeating them is a real risk if this history isn't taken into account.

## Start here: current state of the folder

The Kanban Board folder (`C:\Users\Kevin\Documents\Claude Projects\Kanban Board\`) currently contains:

| File | What it is |
|---|---|
| `kanban-v1.2.html` | **The current, active version. Open/edit this one.** Adds done-column card stacking (collapses past 4 cards into an expandable "stacked paper" widget), card text truncation (clamps long cards to ~190px with a "Show more"/"Show less" toggle), and a night-mode toggle (defaults to OS preference on first visit, remembered thereafter via a dedicated `kanban-theme-v1` localStorage key, kept fully separate from board data/undo history/the save-file). |
| `kanban-data.json` | Kevin's real save-file data, connected via the app's "Load existing file" flow. Contains his actual tasks. Treat with care — see the v1.1 data-loss bug below for exactly what NOT to do with files like this. |
| `CLAUDE.md` | This file. |
| `Archive/` | Prior versions, kept for history only — do not edit or treat as current. Contains `kanban-v1.1.html`, `kanban-v1.0.html` (has a same-version hotfix, see "v1.0 hotfix" below), `kanban-v1.0-test-empty.html` (disposable test copy, safe to delete), `kanban.html` (original pre-versioning file, lacks most features below), and `kanban-data - Copy.json`. |

## Project basics

- **Nature:** fully self-contained single HTML file per version — no build step, no bundler, no npm dependencies. The only external resource is two Google Fonts loaded via CDN link tags (Fraunces, IBM Plex Sans/Mono). Runs by double-clicking the file and opening it in a browser.
- **Please preserve the zero-build-step, single-file nature** unless Kevin explicitly asks to restructure the project (e.g., into a multi-file setup with a bundler). Don't introduce tooling unprompted.
- **Target browsers:** Chrome and Edge only. The app uses the File System Access API for autosave, which Firefox/Safari don't support. This is called out in the app UI itself ("works in Chrome or Edge only").
- **Owner:** Kevin, building this for personal task management (Windows). He's also shared a copy of the app with a friend for their own independent use (separate file, no shared data).
- **Communication style:** prefer plain English over jargon. Explain *what* you're about to do and *why* in layman's terms before running commands, rather than assuming familiarity with git, npm, or terminal conventions.

## Versioning convention (established, must continue)

Starting at v1.0, **every future update must be saved as a NEW file** (`kanban-v1.1.html`, `kanban-v2.0.html`, etc.) rather than overwritten in place, so old versions stay archived. The version number must be bumped in **both**:
1. The filename
2. The in-app version badge next to the "Kanban" title (`<span class="version-badge">`)

Do not overwrite prior versioned files. This was an explicit, repeated instruction from Kevin.

**One documented exception:** v1.0 received an in-place hotfix (see "v1.0 hotfix" below) for a critical startup-crash bug discovered immediately after release, rather than being bumped to a new version file. This was a judgment call treating it as "fixing v1.0 to actually be v1.0" rather than a feature change — but it does deviate from the stated rule. v1.1 was then used for the *next* real fix (the data-loss bug), correctly following the convention. If in doubt going forward, default to creating a new version file rather than editing in place — that was the intent Kevin expressed.

**Recommendation for Claude Code:** consider replacing this manual file-versioning scheme with real git commits/tags now that real version control is available — it accomplishes the same archival goal more cleanly, with actual diffs and the ability to revert. Discuss with Kevin before changing the convention, since he may still want distinct files for easy sharing with his friend (who doesn't use git).

## Feature history (chronological)

1. **Base kanban board** — three fixed columns (To do / In progress / Done), drag-and-drop cards between columns, add tasks via a textarea per column, localStorage persistence, IBM Plex Mono/Sans + Fraunces serif for headers. Editorial/paper aesthetic (`--paper`, `--ink`, `--line` CSS variables).
2. **Card editing** — hover-activated edit affordance, `contentEditable` text with Shift+Enter for newlines (implemented via `execCommand('insertText')` with manual Range API fallback — plain Range manipulation alone was unreliable), Enter to save, Escape to cancel and revert.
3. **Undo/redo** — in-memory history stacks (50-step limit), header buttons + Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z. `pushHistory()` snapshots `JSON.stringify(state)` before mutations. Native browser text-undo still works while a field is focused (global undo listener explicitly ignores keydowns when `document.activeElement` is a contentEditable or textarea).
4. **Multi-project support** — the board expanded from one flat list to multiple named "projects," each with its own To do/In progress/Done columns, switchable via pill-style tabs at the top. Tabs support: click to switch, double-click to rename (inline contenteditable), `+` to add a new project, `×` to delete (with confirm dialog, undoable). Tasks can be moved between projects via a per-card menu, keeping the same column status across projects.
   - **Data model:** `state = { projects: [{ id, name, todo: [], doing: [], done: [] }], activeProjectId }`.
   - Old single-board localStorage data auto-migrates into a "My Tasks" project on first load.
5. **Deadlines (optional per task)** — native `<input type="date">` inside a per-card menu. Badge shown in the card footer when set; turns red/"overdue" styling if the date has passed and the task isn't in Done.
   - **Bug fixed:** initially, the date input's `change` handler called a full `render()`, which destroyed and rebuilt the DOM on every keystroke (because editing an *existing* date value re-validates to "complete" after every digit typed, firing `change` repeatedly). This yanked focus out of the field mid-type, making it impossible to type a 4-digit year. Fixed by decoupling the data update from any destructive re-render — the change handler now updates state and a small in-place badge directly, with only one `pushHistory()` call per edit *session* (tracked via a `focus`-reset flag), not one per keystroke.
6. **Kebab (⋮) menu** — all per-card actions (Edit, Deadline, Move to project, Delete) were consolidated from separate always-hoverable icons into a single kebab icon in the top-right of each card, visible only on card hover, opening a dropdown panel.
   - **Bug fixed in two passes (same root cause):** the dropdown kept getting visually hidden behind the card below it.
     - *Pass 1:* Root cause identified as `.card:hover` applying a `transform`, which creates a new CSS stacking context; since sibling cards had no explicit `z-index`, a card lower in the DOM order could still paint on top of an earlier card's entire stacking context (including its dropdown). Fixed by giving `.card` an explicit baseline `z-index: 1` and bumping it on `:hover` to `z-index: 5`.
     - *Pass 2:* This wasn't quite enough — the dropdown could stay open after the mouse moved away from the card (e.g., drifting toward the next column), at which point `:hover` no longer applied and the z-index boost disappeared while the menu was still visually open. Fixed by adding a separate `.menu-open` class (toggled in JS, independent of `:hover` state) bumped to `z-index: 6`, so an open menu stays on top regardless of where the mouse currently is.
   - **Lesson for future menu/popover work:** any dismissible UI element that can remain open independent of `:hover` needs its own explicit stacking state — don't rely on `:hover` alone to keep something visually on top.
7. **Inline mixed formatting (bullets + checkboxes)** — rather than a whole-card format toggle (which was the first implementation and was explicitly rejected by Kevin in favor of this), formatting now lives *per line* inside the task's raw text, using a lightweight markdown-like syntax the user types directly:
   - `* text` or `- text` → bullet point (consecutive bullet lines auto-group into one `<ul>`)
   - `[] text` → unchecked checkbox
   - `[x] text` or `[X] text` → checked checkbox
   - any other line → plain text
   - When not editing, the raw text is parsed (`parseLine()`) and rendered as mixed plain/bulleted/checkbox content in a `.card-list-view` container; checkboxes are clickable directly (no need to enter edit mode) and toggling one flips the `[ ]`/`[x]` marker directly in the underlying text (`toggleCheckboxLine()`).
   - When editing (via the kebab menu's "Edit task"), the raw markdown-style text is shown for direct editing in the plain `.card-text` contentEditable box.
   - The earlier whole-card `listType` ('text'/'bullet'/'checklist') + separate `checked` boolean array data shape is auto-migrated into the new inline-syntax format on load (see `migrateItem()`), so old saved boards don't lose data.
8. **File System Access API — real autosave to disk** — the most significant architectural addition. Previously the app only used `localStorage`. Now:
   - A save-file menu in the header (see item 9 below for its current, corrected form) lets the user connect a `.json` file on disk that the app keeps in sync with.
   - The chosen `FileSystemFileHandle` is persisted in **IndexedDB** (`kanban-fs-db` / `handles` object store, key `saveFile`) so the connection survives page reloads.
   - On load, the app checks `handle.queryPermission()` silently (no user gesture needed for a *query*, only for an actual *request*); if permission was already granted, it silently reconnects and loads the file's content, overriding `localStorage`. If permission needs re-confirmation, the UI shows a red "save file disconnected" / "Reconnect" state, since re-granting permission requires a user gesture (a click).
   - All writes are serialized through a simple promise queue (`writeQueue`) to avoid overlapping `createWritable()` calls.
   - `localStorage` is still written on every `save()` call as an instant-loading fallback/cache, but the connected file (when present) is the authoritative source of truth going forward.
9. **v1.0 hotfix — startup ReferenceError (entire app broken, not just the save-status UI)**
   - **Symptom Kevin reported:** opening v1.0 showed "checking save file…" stuck forever in the header, with no button ever appearing. What wasn't immediately obvious: the *entire board* had also failed to render — no cards, no columns populated — because the failure happened before `render()` was ever reached.
   - **Root cause:** `save(state)` was called once synchronously at script startup (`let state = load(); save(state);`), and `save()` calls `queueFileWrite()`, which reads the `fileHandle` variable. But `fileHandle` was declared with `let fileHandle = null;` *textually after* that `save(state)` call. Unlike `var` or function declarations, `let`/`const` bindings are not accessible before their declaration line executes (the "temporal dead zone") — so this threw an uncaught `ReferenceError: Cannot access 'fileHandle' before initialization`, which silently killed the rest of the script, including the later `render()` call at the bottom of the file.
   - **Fix:** moved the File System Access `let`/`const` variable declarations (`fileHandle`, `pendingHandle`, `fileHandleNeedsPermission`, `writeQueue`, and the IndexedDB constants) to *before* the `let state = load(); save(state);` lines.
   - **This was verified**, not just visually inspected — the fix was run through a Node.js DOM-stub harness that executes the actual script and confirms it no longer throws, before being shipped.
   - **General lesson:** when adding new top-level `let`/`const` state that's read by a function called synchronously during script init, declare that state *before* the call site, not after. This bug class (TDZ ordering) is easy to introduce when incrementally adding features to code that already has synchronous init calls near the top of the file.
10. **v1.1 — critical data-loss bug fix.** A real data-loss incident occurred with v1.0: connecting to an existing `kanban-data.json` resulted in the file being silently overwritten with a blank board, destroying the saved data. Kevin had a manual backup, so it was recoverable, but the underlying bug was real and dangerous.
    - **Root cause:** the original single "Connect save file" button used `showSaveFilePicker()` (the "Save As" dialog) even when the intent was to *load* an existing file. This dialog is not guaranteed to hand back a faithful read of an existing file's prior bytes — it's semantically a write-intent dialog. Separately, `loadFromFileHandle()` had a design flaw: if the file's content failed to parse as recognizable board data for *any* reason, it assumed the file must be brand-new/empty and wrote the current (blank) in-memory state over it — destroying whatever was actually there, with no distinction between "genuinely empty" and "has real content I don't understand."
    - **Fix:**
      - `loadFromFileHandle()` now only auto-writes if the file is genuinely empty/whitespace-only. If it has real content that fails to parse, it refuses to touch the file, disconnects, and returns `false` so the caller can alert the user — it never silently destroys data.
      - The single ambiguous button was split into two explicit actions behind a small dropdown menu: **"Load existing file…"** (uses `showOpenFilePicker()`, the correct read-oriented API, then requests readwrite permission afterward for ongoing autosave) and **"Create new file…"** (uses `showSaveFilePicker()`, intended only for brand-new files — and even this now warns/confirms before overwriting if the chosen file unexpectedly already has content).
      - `reconnectSaveFile()` and `initFileConnection()` (the automatic reconnect-on-load path) were updated to use the same safe `loadFromFileHandle()` and handle failure gracefully.
    - **This was verified** with unit tests (not just visual inspection) against three cases: realistic backup data (must load successfully), genuinely empty content (must be treated as safe-to-seed), and garbage/corrupted content (must be refused, never written over). All three behaved correctly before shipping.
    - **This is the current, correct save-file behavior — see item 8 above for the general architecture, and treat this item as the authoritative description of the actual button/menu behavior in the current file.**
11. **v1.2 — done-column stacking, card truncation, night mode.** Three independent UI/UX additions, implemented and verified one at a time.
    - **Done-column card stacking:** once the "done" column has more than `DONE_STACK_VISIBLE_COUNT` (4) cards, cards 5+ collapse into a clickable "stacked paper" widget (`.done-stack`, offset `::before`/`::after` pseudo-elements for the peek effect) reading "+N more done"; clicking it expands to full individual cards plus a "Show less" button. Expand state is ephemeral (in-memory `expandedStacks` Set keyed by project id — never persisted, resets on reload). The widget and collapse button are deliberately non-`.card` elements always appended last in the dropzone, so the existing drag-and-drop index math (which assumes `.card` elements are direct children of the dropzone in array order) is untouched — dropping near a collapsed stack simply appends to the end of the array, which was already `moveItem()`'s existing fallback behavior for an `undefined` target index.
    - **Card text truncation:** long cards clamp to a fixed height (`.card-list-view.clamped`, `max-height: 190px` with a bottom fade gradient) rather than counting raw `\n` characters — an initial version counted newlines only (`item.text.split('\n').length > 8`) and missed cards with just a couple of long *wrapping* paragraphs (few raw newlines, many visual lines); the fix measures actual rendered `scrollHeight` via `requestAnimationFrame` (since a card's list-view isn't attached to the DOM yet at the moment it's first built) and compares against `TRUNCATE_CLAMP_HEIGHT`. The "Show more"/"Show less" toggle button is a sibling of `.card-list-view`, not a child, so it's never clipped by the clamp's `overflow: hidden`. All content is always fully rendered in the DOM (only visually clipped when collapsed), which sidesteps any concern about checkbox line-index alignment.
    - **Night mode toggle:** new header button (next to Undo/Redo) switches `:root` CSS variables via `[data-theme="dark"]`. Defaults to `prefers-color-scheme` on first visit, then remembered via a dedicated `kanban-theme-v1` localStorage key — deliberately **separate** from board `state`/`STORAGE_KEY`/`pushHistory()`, so toggling the theme never enters undo history and never gets written into the user's connected save-file JSON (mirrors how the File System Access handle already lives in its own IndexedDB store alongside board data, rather than inside `state`). A small synchronous script in `<head>` (before the `<style>` block) applies the saved/OS theme before first paint, to avoid a flash of the wrong theme. ~9 previously-hardcoded colors (ink-tinted hover overlays, the red "danger" text/backgrounds for delete actions and overdue deadlines) were converted to new `--overlay`/`--danger`/`--danger-bg`/`--danger-wash` variables so they theme correctly too.
    - **This was verified** by driving the app's real code paths directly via the browser console (dispatching real DOM events against the actual input/checkbox/button elements, not just visual inspection) — boundary cases for both stacking (3/4/5/6+ done cards) and truncation (short cards, many-short-lines, few-long-wrapping-lines, checkbox state past the visible fold) all confirmed correct, plus confirmed theme toggling never touches `undoStack`/`redoStack` or the connected save-file's JSON contents.
    - Superseded `kanban-v1.1.html`, which is now archived (see the file inventory table above) rather than edited in place, per the established versioning convention.

## Important correction: local file:// storage is SHARED, not per-file

Earlier guidance in this project assumed `localStorage` was scoped per exact file path, and that opening a differently-named HTML file would start with a blank slate. **This was wrong and has been empirically disproven.** In Chrome/Edge, local `file://` pages share a single storage origin — `localStorage` AND `IndexedDB` (where the connected save-file handle is stored) are shared across **every** local HTML file opened from disk, regardless of filename or folder. Confirmed by testing: opening a freshly-named test copy (`kanban-v1.0-test-empty.html`) in the same browser showed both the existing task data (from shared `localStorage`) and found the previously-connected file handle (from shared `IndexedDB`, surfaced as a "save file disconnected/Reconnect" prompt needing a fresh permission click).

**Practical implications:**
- Switching between versioned files in the same browser/profile likely carries data over automatically — no manual export/import needed in that case.
- To test anything (like the file-connect flow) against a genuinely blank slate, use an Incognito/InPrivate window, which gets an isolated storage partition. A differently-named file in a normal window will NOT be isolated.
- The manual `localStorage` copy/paste-to-JSON workaround (below) is really only needed as a last resort when moving to a genuinely different computer/browser profile AND there's no existing exported `.json` save file to use instead.

## Migrating to a genuinely new browser/computer (no shared storage)

**Preferred method (if a `.json` save file already exists, e.g. `kanban-data.json`):** just copy that file to the new machine and use "Load existing file…" in the app's save-file menu. This is the safe, tested path (see v1.1 fix above) and requires no console work.

**Fallback method (only if data exists solely in browser localStorage, with no exported `.json` file):**
1. In the source browser, open DevTools Console on any of the kanban HTML files and run `copy(localStorage.getItem('kanban-personal-board-v1'))` to copy the raw JSON state to clipboard.
2. Paste it into a plain text file, save as `kanban-data.json` (with "All Files" type in Notepad to avoid a forced `.txt` extension).
3. On the new machine/browser, open the kanban HTML file and use "Load existing file…" to select that `kanban-data.json`.

## Known limitations / not yet built

These are gaps, not necessarily things Kevin has asked for — just useful context so nothing is assumed to exist that doesn't:
- No search or filtering across tasks/projects.
- No tags/labels beyond the project grouping itself.
- No due-date reminders/notifications (deadlines are visual only — a badge, red if overdue).
- No explicit "export/backup" button independent of the save-file connection itself (the connected `.json` file *is* the backup, but there's no separate one-click "download a copy" action).
- No automated tests beyond the ad hoc Node.js verification scripts used while fixing the two bugs above (not committed anywhere, written fresh each time in the chat sandbox).
- No git history yet — this is the main thing Claude Code is expected to help set up.
- Mobile/touch support is untested; there's a responsive CSS breakpoint (columns stack under 860px) but drag-and-drop interactions haven't been verified on touch devices.

## Design/aesthetic notes

- Warm, editorial "paper" look — off-white background with a subtle dot-grid texture, soft shadows, rounded pill-shaped tabs/badges, a small colored "pin" dot on each card matching its column color (blue/amber/green for todo/doing/done).
- Fonts: Fraunces (serif, headings) + IBM Plex Sans (body) + IBM Plex Mono (labels/metadata/dates), loaded via Google Fonts CDN — so an internet connection is needed on first load for full font rendering (falls back gracefully to system fonts otherwise).

## Sharing with others

- The HTML file was shared with Kevin's friend as a completely separate, empty-slate copy (no data embedded in the file itself — all data lives in whichever save file/localStorage each person connects). Confirmed this is safe: no cross-contamination between users of copies of this file.
- If Kevin wants to give his friend an update, the friend needs to save the new version file directly (not alongside old ones) and reconnect to their own existing save file, same as Kevin would.
- The friend is on a different computer entirely, so the shared-`file://`-origin behavior described above does NOT apply between Kevin and his friend — only between multiple kanban HTML files on the *same* computer/browser.

## Suggested next steps in Claude Code

- Confirm you're working from `kanban-v1.2.html` (see the file inventory table at the top) before making any changes.
- `git init` in the Kanban Board folder and commit the current versioned files, to start real version history going forward. Consider whether to also `.gitignore` or otherwise handle `kanban-data.json` (it's personal task data, not really "project" content — worth asking Kevin how he'd like that handled, e.g. keeping it out of any future remote/shared repo).
- Consider whether the manual `vX.X` file-per-version scheme should be replaced by git tags/commits now that real version control is available — worth discussing with Kevin rather than assuming.
- Consider cleaning up `Archive/kanban-v1.0-test-empty.html` (or confirming with Kevin it's safe to delete) since it's a disposable test artifact, not a real version.
- As of this handoff, v1.2 is the current stable state, with no known open bugs. The bugs documented above (v1.0 startup crash, v1.0→v1.1 data-loss bug, and the v1.2 truncation-by-newline-count-vs-height fix) are all fixed and verified.
