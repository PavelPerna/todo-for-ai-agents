# Snippet for AGENTS.md / .github/copilot-instructions.md / .cursorrules

Paste this into whatever file your agent reads at session start. Replace `.todo` if you changed the `agentTodo.dir` setting.

```markdown
## Live TODO lists (.todo/)
- The human watches `.todo/<name>.md` in a VS Code panel and ticks items there. You maintain the lists; they tick.
- A list = `# <name>`, then `onDone: <what to do when an item is archived>`, then `- [ ]` / `- [x]` items. Agree the onDone with the human before creating a list.
- On every state change of the work, update the matching list. Keep items short. Never un-tick a human's tick.
- At session start, compare `.todo/*.done.md` with your last known state and perform the onDone of every new archived item. Outward actions (tickets, chat, PR comments) go out as drafts for approval.
- Never write `.done.md` yourself; the view's "hide done" button does that.
```

For Claude Code, you can instead copy `skills/todo-lists/` into `~/.claude/skills/` (personal) or `.claude/skills/` (project) and it becomes `/todo-lists`.
