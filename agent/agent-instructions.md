# Snippet for AGENTS.md / .github/copilot-instructions.md / .cursorrules

Paste this into whatever file your agent reads at session start. Replace `.todo` if you changed the `agentTodo.dir` setting.

```markdown
## Live TODO lists (.todo/)
- Prefer the `todo-for-ai-agents` MCP tools when configured (`list_lists`, `read_list`, `create_list`, `add_item`, `set_checked`, `mark_all_done`, `archive`, `show`, `current_list`, `events`); the rules below describe the files they manage.
- The human watches `.todo/<name>.md` in a VS Code panel and ticks items there. You maintain the lists; they tick.
- A list = `# <name>`, then `onDone: <what to do when an item is archived>`, then `- [ ]` / `- [x]` items. Agree the onDone with the human before creating a list.
- On every state change of the work, update the matching list. Keep items short. Never un-tick a human's tick.
- Done = archived. Archives append events to `.todo/.events.jsonl` (`{seq, list, items, onDone}`; MCP `events({since})`). At session start arm a watcher on the file first (Claude Code: `Monitor` + `tail -n0 -F`), then pull `events({since: cursor})` and perform each list's onDone in order; on every notification pull again from the cursor rather than acting on the notification text. Outward actions (tickets, chat, PR comments) go out as drafts for approval.
- "This list" / "the open one" = `current_list` (MCP) or `selected` in `.todo/.state`; never guess.
- Never write `.done.md` yourself. To act on a whole list write a line into `.todo/.cmd` (consumed once applied): `show <name>`, `markAll <name>`, `archive <name>`; or run the VS Code commands `agentTodo.showList` / `agentTodo.markAllDone` / `agentTodo.archive` with the list name.
```

For Claude Code, you can instead copy `skills/todo-lists/` into `~/.claude/skills/` (personal) or `.claude/skills/` (project) and it becomes `/todo-lists`.
