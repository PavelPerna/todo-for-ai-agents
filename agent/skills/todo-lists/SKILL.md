---
name: todo-lists
description: Keep the human's live TODO lists in <workspace>/.todo/<name>.md, shown by the "TODO Lists for AI Agents" VS Code view. Use when asked to add, update or tick a todo, to create a list for a ticket or topic, at session start and on every event to process state changes (ticked, archived, reopened) by performing each item's effective hook (onDone / onArchive / onReopen), or when the human says 'put it on the list'. Do NOT use for your own internal task tracking — these lists are for the human to read and tick.
user-invocable: true
---

# todo-lists — live lists the human reads and ticks

The human sees `.todo/` in a VS Code panel (extension `PavelPerna.todo-for-ai-agents`).
They tick items themselves. You fill the lists and react to what they ticked.

## Data model (`<workspace>/.todo/`, keep it out of version control)

- `<name>.md` — one list. Line 1 `# <name>`, then hook defaults `onDone: …` (item ticked), optional `onArchive: …` (moved to .done) and `onReopen: …` (unticked/restored), then items `- [ ] text` / `- [x] text`. An item overrides the defaults with a typed block right after the checkbox: `- [ ] (onDone="…", onArchive="…") text`. `##` headings and plain text between items are allowed.
- `<name>.done.md` — archive. Written only by the view's "hide done" button, format `- [x] text _(done d. m. yyyy)_`. The view can restore an item back to `<name>.md`.
- Names: a ticket key (`PROJ-123`) or a topic (`standup`, `release`). The view sorts alphabetically and has a filter.
- The view watches the directory and redraws within ~60 ms of a write. No refresh call needed.

## Prefer the MCP tools

If the `todo-for-ai-agents` MCP server is available (tools `list_lists`, `read_list`, `create_list`, `add_item`, `set_checked`, `mark_all_done`, `archive`, `restore`, `show`, `current_list`, `events`), use them instead of editing files: `create_list` enforces the onDone contract, errors come back to you, and `show` brings the list into view. The file format below is still the truth; edit files directly only when the MCP server is not configured.

## Driving the view (fallback without MCP)

Three actions, each available as a VS Code command (argument: list name) or as a line in `.todo/.cmd` for shell-only agents; the file is consumed once applied and may hold several lines:

| Action | Command | `.cmd` line |
| --- | --- | --- |
| bring a list into view | `agentTodo.showList` | `show <name>` |
| tick every open item | `agentTodo.markAllDone` | `markAll <name>` |
| move ticked items to `<name>.done.md` | `agentTodo.archive` | `archive <name>` |

Use `show` when the human asked to see a list or a decision now waits on them, not on every edit. Use `markAll` only when the human said the whole list is done. Use `archive` instead of editing `.done.md` yourself; it keeps order and dates consistent. Shell example: `printf 'markAll PROJ-123\narchive PROJ-123\n' > .todo/.cmd`.

## "The open list"

When the human says "this list" or "the open one", do not guess: call `current_list` (MCP) or read `.todo/.state` (`selected`). It is written by the view on every selection change.

## Procedures

**Create a list.** First agree the hooks with the human: `onDone` (what happens when they tick an item), and if useful `onArchive` / `onReopen`. Only then write the file. `onDone: nothing` is a valid answer; a missing onDone is not. Per-item hooks go in the attribute block (`add_item` with `onDone`/`onArchive`/`onReopen`).

**Update.** On every state change of the work (PR ready, review in, decision taken, blocked, finished) edit the items in the matching list: add, reword, or mark `[x]` when you completed it yourself. Keep items short; this is a status board, not a log. Never un-tick what the human ticked.

**React to state changes (the hook contract).** Every tick, untick/restore and archive appends an event to `.todo/.events.jsonl` (v2): `{seq, at, v, type: done|reopened|archived, list, items: string[], onDone, details: [{text, hook, hooks}], listHooks}`; `details[].hook` is the effective hook to perform (item over list default). The MCP tool `events({ since })` returns them after a `seq` cursor.
- At session start, and after every re-arm: first arm the watcher (Claude Code: `Monitor` with `tail -n0 -F .todo/.events.jsonl`; other runtimes: a file watcher), **then** call `events({ since: cursor })` and perform each item's `hook` in `seq` order; keep the cursor. Arming first means a change that happens while you start up is caught by the pull.
- A notification is a trigger, not the payload: on each one call `events({ since: cursor })` again and process in order. Do not poll `*.done.md` by hand.
- Which hook: `done` → the item's `onDone`, `archived` → `onArchive`, `reopened` → `onReopen`; the event already resolved item-over-list into `details[].hook`. A missing hook means nothing to do for that item.
- Anything that leaves the machine (issue tracker, chat, PR comments) still goes out as a draft for the human to approve.

**Delete a list.** When `<name>.md` is empty and the archive is no longer needed, remove both files after the human agrees.

## Don'ts

- Don't write `.done.md` by hand; use `archive` (button, command or `.cmd`) so order and dates stay consistent.
- Don't paste paragraphs into items. Markdown links and inline code are fine.
- Don't use these lists as your scratchpad; they are the human's view of the work.
