# Kanban Board

A single-file, zero-dependency kanban board — drag-and-drop tasks across To Do / In Progress / Done, organized into multiple named projects, with real autosave to a file on disk.

This started as a hands-on project for building fluency with Claude: the first several versions were built conversationally in the Claude.ai chat interface, then the project moved to Claude Code once it needed real version control, a proper git workflow, and more structured, file-aware development. The commit history and `CLAUDE.md` in this repo reflect that transition — `CLAUDE.md` is the handoff document written for Claude Code itself, capturing the bugs, architecture decisions, and conventions from the chat-based sessions so that context wasn't lost when switching tools.

Open `kanban-v1.2.html` in Chrome or Edge — no install, no build step, no server. Load `kanban-example-data.json` from the app's save-file menu to try it out with sample data.

## Features

- **Multi-project boards** — switch between separate named projects via tabs, each with its own To Do / In Progress / Done columns
- **Deadlines** — optional due dates per task, with a badge that turns red when overdue
- **Inline bullets and checkboxes** — lightweight markdown-style syntax (`* item`, `[] item`, `[x] item`) parsed and rendered live, no separate "formatting mode" required
- **Undo/redo** — full history stack with keyboard shortcuts, that correctly ignores native text-field undo so you don't fight the browser while typing
- **Real autosave to disk** — connects to a `.json` file on disk via the File System Access API and keeps it in sync on every change, not just `localStorage`
- **Done-column stacking** — once a column has more than a handful of finished tasks, the extras collapse into an expandable stack so completed work doesn't crowd the board
- **Card truncation** — long cards clamp to a fixed height with a "Show more" toggle, measured by actual rendered height rather than counting newlines
- **Dark mode** — follows your OS preference on first visit, remembered after that

## Notable bugs I found and fixed

### Silent data loss on save-file connect

Connecting to an existing save file could silently overwrite it with a blank board, destroying real task data. The root cause was two-fold: the "connect" button used the browser's **save**-file picker (`showSaveFilePicker`) even when the intent was to *load* an existing file, and that API doesn't guarantee a faithful read of the file's prior contents. Separately, the load logic treated any unparseable file content as "must be a new, empty file" and happily wrote the blank in-memory board over it. Fixed by switching to the read-oriented `showOpenFilePicker` for loading, and by making the load path refuse to touch a file with real content it can't parse instead of guessing it's safe to overwrite.

### Startup crash from a temporal dead zone

Right after release, the app would get stuck on "checking save file…" forever with no board rendered at all. The cause was a `let`-declared variable (`fileHandle`) being read by code that ran *before* its declaration line executed — legal-looking but invalid in JavaScript, since `let`/`const` bindings aren't accessible until their declaration is reached ("temporal dead zone"). That threw an uncaught `ReferenceError` early in the script, which silently killed everything after it, including the call to `render()`. Fixed by moving the declarations ahead of the code that reads them, and verified with a small script harness that actually executes the file rather than just eyeballing the diff.

### A dropdown menu hiding behind other cards

The task card's ⋮ options menu would sometimes render visually behind a neighboring card instead of on top of it. The root cause was that hovering a card applied a CSS `transform`, which creates a new stacking context — and since sibling cards had no explicit `z-index`, a card later in the DOM order could still paint over an earlier card's entire stacking context, dropdown included. A first fix (giving cards a baseline `z-index` that bumps on hover) helped but wasn't complete: the menu could stay open after the mouse moved away, at which point hover state (and its z-index boost) was gone while the menu was still visually open. The real fix was an explicit "menu is open" class, independent of `:hover`, so an open menu stays on top regardless of where the mouse currently is.

## Browser support

Chrome and Edge only. The autosave-to-disk feature depends on the File System Access API, which Firefox and Safari don't implement — without it, the app would fall back to `localStorage`-only persistence, which was an earlier, less capable version of this project.

## Versioning

Each meaningful change ships as a new versioned file (`kanban-v1.0.html`, `kanban-v1.1.html`, `kanban-v1.2.html`, …) rather than being edited in place, so every prior version stays around and diffable in `Archive/`. See the [Releases](../../releases) page for what changed in each version.
