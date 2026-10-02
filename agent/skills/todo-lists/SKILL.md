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

## Pointing the human at a list

After adding or changing items, you may bring the list into view: run the VS Code command `agentTodo.showList` with the list name, or from a shell `echo <name> > .todo/.focus` (the file is consumed). Do it when the human asked to see it or when a decision now waits on them; do not do it on every edit.

## Procedures

**Create a list.** First agree the `onDone` with the human: what should happen when they tick and hide an item (update a register, draft a ticket comment, nothing). Only then write the file. `onDone: nothing` is a valid answer; a missing onDone is not.

**Update.** On every state change of the work (PR ready, review in, decision taken, blocked, finished) edit the items in the matching list: add, reword, or mark `[x]` when you completed it yourself. Keep items short; this is a status board, not a log. Never un-tick what the human ticked.

**Process `.done` (start of session, then periodically).** Compare `*.done.md` with the last state you know. For every new item run the `onDone` of its list. Anything that leaves the machine (issue tracker, chat, PR comments) goes out as a draft for the human to approve.

**Delete a list.** When `<name>.md` is empty and the archive is no longer needed, remove both files after the human agrees.

## Don'ts

- Don't write `.done.md` by hand; the button keeps order and dates consistent.
- Don't paste paragraphs into items. Markdown links and inline code are fine.
- Don't use these lists as your scratchpad; they are the human's view of the work.
