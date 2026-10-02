---
name: todo-lists
description: Keep the human's live TODO lists in <workspace>/.todo/<name>.md, shown by the "TODO Lists for AI Agents" VS Code view. Use when asked to add, update or tick a todo, to create a list for a ticket or topic, at session start to process items the human archived into <name>.done.md (run each list's onDone), or when the human says 'put it on the list'. Do NOT use for your own internal task tracking — these lists are for the human to read and tick.
user-invocable: true
---

# todo-lists — live lists the human reads and ticks

The human sees `.todo/` in a VS Code panel (extension `PavelPerna.todo-for-ai-agents`).
They tick items themselves. You fill the lists and react to what they ticked.

## Data model (`<workspace>/.todo/`, keep it out of version control)

- `<name>.md` — one list. Line 1 `# <name>`, line 2 `onDone: <what you do when an item lands in <name>.done.md>`, then items `- [ ] text` / `- [x] text`. `##` headings and plain text between items are allowed.
- `<name>.done.md` — archive. Written only by the view's "hide done" button, format `- [x] text _(done d. m. yyyy)_`. The view can restore an item back to `<name>.md`.
- Names: a ticket key (`PROJ-123`) or a topic (`standup`, `release`). The view sorts alphabetically and has a filter.
- The view watches the directory and redraws within ~60 ms of a write. No refresh call needed.

## Prefer the MCP tools

If the `todo-for-ai-agents` MCP server is available (tools `list_lists`, `read_list`, `create_list`, `add_item`, `set_checked`, `mark_all_done`, `archive`, `show`), use them instead of editing files: `create_list` enforces the onDone contract, errors come back to you, and `show` brings the list into view. The file format below is still the truth; edit files directly only when the MCP server is not configured.

## Driving the view (fallback without MCP)

Three actions, each available as a VS Code command (argument: list name) or as a line in `.todo/.cmd` for shell-only agents; the file is consumed once applied and may hold several lines:

| Action | Command | `.cmd` line |
| --- | --- | --- |
| bring a list into view | `agentTodo.showList` | `show <name>` |
| tick every open item | `agentTodo.markAllDone` | `markAll <name>` |
| move ticked items to `<name>.done.md` | `agentTodo.archive` | `archive <name>` |

Use `show` when the human asked to see a list or a decision now waits on them, not on every edit. Use `markAll` only when the human said the whole list is done. Use `archive` instead of editing `.done.md` yourself; it keeps order and dates consistent. Shell example: `printf 'markAll PROJ-123\narchive PROJ-123\n' > .todo/.cmd`.

## Procedures

**Create a list.** First agree the `onDone` with the human: what should happen when they tick and hide an item (update a register, draft a ticket comment, nothing). Only then write the file. `onDone: nothing` is a valid answer; a missing onDone is not.

**Update.** On every state change of the work (PR ready, review in, decision taken, blocked, finished) edit the items in the matching list: add, reword, or mark `[x]` when you completed it yourself. Keep items short; this is a status board, not a log. Never un-tick what the human ticked.

**Process `.done` (start of session, then periodically).** Compare `*.done.md` with the last state you know. For every new item run the `onDone` of its list. Anything that leaves the machine (issue tracker, chat, PR comments) goes out as a draft for the human to approve.

**Delete a list.** When `<name>.md` is empty and the archive is no longer needed, remove both files after the human agrees.

## Don'ts

- Don't write `.done.md` by hand; use `archive` (button, command or `.cmd`) so order and dates stay consistent.
- Don't paste paragraphs into items. Markdown links and inline code are fine.
- Don't use these lists as your scratchpad; they are the human's view of the work.
