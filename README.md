# TODO Lists for AI Agents by Pavel Perna

Panel view rendering live todo lists that your AI coding agent (Claude Code, GitHub Copilot, Cursor, …) writes into `<workspace>/.todo/<name>.md`.
Ticking toggles `[ ]`/`[x]` in the file; "archive" moves ticked items to `<name>.done.md` with a date.
Every state change (ticked, archived, reopened) appends an event the agent reacts to through three hooks: `onDone`, `onArchive`, `onReopen` (list defaults in the header, per-item overrides after the checkbox).

Build & install (WSL): `./check.sh` runs the tests, a smoke load and the build in one go; or step by step:

    python3 build-vsix.py
    ~/.vscode-server/bin/*/bin/remote-cli/code --install-extension todo-for-ai-agents-<v>.vsix
    # VS Code: Developer: Reload Window

Setting `agentTodo.dir` (default `.todo`) points the view at another directory in the first workspace folder.

## Teaching your agent

`agent/skills/todo-lists/SKILL.md` is a ready-made Claude Code skill (copy into `~/.claude/skills/`);
`agent/agent-instructions.md` is the same contract as a snippet for AGENTS.md, Copilot instructions or `.cursorrules`.
Both are deliberately generic: the agent agrees an `onDone` with you per list, keeps items short, and acts on what you tick.

## MCP server (preferred agent interface)

`mcp/server.js` is a dependency-free MCP server (stdio) over the same `.todo/` files. Tools: `list_lists`, `read_list`, `create_list` (refuses without an `onDone`), `add_item`, `set_checked`, `mark_all_done`, `archive`, `restore`, `show`, `current_list`, `events`. Errors come back to the agent as tool errors instead of warnings to the human.

- **VS Code (Copilot agent mode):** the extension registers the server automatically; it appears under MCP servers as "TODO Lists for AI Agents".
- **Claude Code:** `claude mcp add todo -- node <extension dir>/mcp/server.js --dir <workspace>/.todo` (the extension dir is `~/.vscode-server/extensions/pavelperna.todo-for-ai-agents-<v>` or a clone of this repo).
- **Anything else:** run `node mcp/server.js --dir <workspace>/.todo` as a stdio server.

## Hooks and events: onDone, onArchive, onReopen

An item has three state changes and each has a hook:

| Event `type` | When | Hook |
| --- | --- | --- |
| `done` | item ticked (view, `set_checked`, `mark_all_done`) | `onDone` |
| `archived` | ticked items moved to `<name>.done.md` | `onArchive` |
| `reopened` | item unticked, or restored from the archive | `onReopen` |

Hooks are free text for the agent, never interpreted by the extension. The list sets defaults in its header (`onDone: …`, `onArchive: …`, `onReopen: …`); an item overrides them with a typed block right after the checkbox, which the view hides behind a ⚙ badge:

    - [ ] (onDone="tell the agent it is done", onArchive="check that the related PRs are merged") Do a task 1

Every state change appends one line to `.todo/.events.jsonl` (schema `v: 2`; `items` and `onDone` keep their 1.3 shape, the hook detail is in `details`):

    {"seq":7,"at":"…","v":2,"type":"done","list":"PR6","items":["Pavel: merge PR #6"],"onDone":"list default","details":[{"text":"Pavel: merge PR #6","hook":"tick the PR6 item in list pavel","hooks":{"onDone":"…","onArchive":"…"}}],"listHooks":{"onDone":"…"}}

`details[].hook` is the effective hook for that event type (item over list). An agent performs it. Two ways to see events:

- **Pull:** MCP tool `events({ since })` with the last `seq` you handled (0 = everything).
- **Push (be woken up):** watch the file. Claude Code can arm its `Monitor` tool on `tail -n0 -F .todo/.events.jsonl`; other agents use any file watcher.

Use them together, in this order, so nothing falls between the cracks: **arm the watcher first, then pull from your cursor** (anything archived before the watcher started is in that pull). Treat each notification as a trigger only: on every notification call `events({ since: cursor })` and process the result in `seq` order, then advance the cursor. Re-arm on expiry or after a restart and pull again right after re-arming. The log is append-only and `seq` is unique and ordered across writers. Every mutation is a journaled transaction under a cross-process lock (`.todo/.lock`, `.todo/.journal`): intent first, then the files, then the event; a transaction a crashed writer left half-done is completed by whoever takes the lock next, exactly once. Events carry an `id` for that reason. So an archive that happened always has its event, and an event never describes a move that did not happen. Nothing in the extension interprets `onDone`; that is the agent's job by design.

## Driving the view from an agent (fallback without MCP)

Two equivalent interfaces, one for agents that can run VS Code commands, one for agents that only have a shell:

| Action | VS Code command (argument: list name) | Shell: line in `.todo/.cmd` |
| --- | --- | --- |
| show a list | `agentTodo.showList` | `show <name>` |
| tick every open item | `agentTodo.markAllDone` | `markAll <name>` |
| archive ticked items to `<name>.done.md` | `agentTodo.archive` | `archive <name>` |

The view also writes `.todo/.state` (`{"selected": "<name>", "updatedAt": ...}`) whenever the selected list changes, so an agent can tell which list the human means by "the open one" (MCP: `current_list`).

`.todo/.cmd` may hold several lines; `#` starts a comment. The file is consumed (deleted) once applied, unknown verbs are reported in a warning. `.todo/.focus` with a bare list name still works as a shortcut for `show`. Both files accept UTF-8 or UTF-16 (PowerShell 5.1 `>`).

    printf 'markAll PROJ-123\narchive PROJ-123\n' > .todo/.cmd

## Localization

The view follows VS Code's display language; English and Czech ship in `i18n.js` (add a language by adding a block there). The files themselves stay language-neutral.

## File format

See `.todo.example/`. One list per `<name>.md`:

    # <name>
    onDone: <default hook when an item is ticked>
    onArchive: <default hook when ticked items are archived>   (optional)
    onReopen: <default hook when an item is unticked or restored>  (optional)

    - [ ] open item (markdown inline: **bold**, `code`, [links](...))
    - [ ] (onDone="per-item hook", onArchive="…") item with its own hooks
    - [x] ticked item, still visible until archived

`<name>.done.md` is written by the view's "hide done" button: `- [x] text _(hotovo d. m. yyyy)_`.
Lists are shown alphabetically in the left column, grouped into **active** (open items), **done** (ticked, not yet archived) and **archive** (nothing left but `.done`, or empty), the same three groups the right column uses (badges count open, ticked and archived items respectively); hovering a list reveals **mark all done** (active) or **archive → .done** (done). The right column shows the selected one with the same groups.

Independent project by Pavel Perna. Not affiliated with Anthropic, GitHub, Microsoft or any AI vendor.
