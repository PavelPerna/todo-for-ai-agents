# TODO Lists for AI Agents by Pavel Perna

Panel view rendering live todo lists that your AI coding agent (Claude Code, GitHub Copilot, Cursor, …) writes into `<workspace>/.todo/<name>.md`.
Ticking toggles `[ ]`/`[x]` in the file; "hide done" moves ticked items to `<name>.done.md` with a date;
each list carries an `onDone:` header line the agent acts on when items land in `.done`.

Build & install (WSL): `./check.sh` runs the tests, a smoke load and the build in one go; or step by step:

    python3 build-vsix.py
    ~/.vscode-server/bin/*/bin/remote-cli/code --install-extension todo-for-ai-agents-<v>.vsix
    # VS Code: Developer: Reload Window

Setting `agentTodo.dir` (default `.todo`) points the view at another directory in the first workspace folder.

## Teaching your agent

`agent/skills/todo-lists/SKILL.md` is a ready-made Claude Code skill (copy into `~/.claude/skills/`);
`agent/agent-instructions.md` is the same contract as a snippet for AGENTS.md, Copilot instructions or `.cursorrules`.
Both are deliberately generic: the agent agrees an `onDone` with you per list, keeps items short, and acts on what you tick.

## Driving the view from an agent

Two equivalent interfaces, one for agents that can run VS Code commands, one for agents that only have a shell:

| Action | VS Code command (argument: list name) | Shell: line in `.todo/.cmd` |
| --- | --- | --- |
| show a list | `agentTodo.showList` | `show <name>` |
| tick every open item | `agentTodo.markAllDone` | `markAll <name>` |
| archive ticked items to `<name>.done.md` | `agentTodo.archive` | `archive <name>` |

`.todo/.cmd` may hold several lines; `#` starts a comment. The file is consumed (deleted) once applied, unknown verbs are reported in a warning. `.todo/.focus` with a bare list name still works as a shortcut for `show`. Both files accept UTF-8 or UTF-16 (PowerShell 5.1 `>`).

    printf 'markAll PROJ-123\narchive PROJ-123\n' > .todo/.cmd

## Localization

The view follows VS Code's display language; English and Czech ship in `i18n.js` (add a language by adding a block there). The files themselves stay language-neutral.

## File format

See `.todo.example/`. One list per `<name>.md`:

    # <name>
    onDone: <what Claude does when an item lands in <name>.done.md>

    - [ ] open item (markdown inline: **bold**, `code`, [links](...))
    - [x] ticked item, still visible until "hide done"

`<name>.done.md` is written by the view's "hide done" button: `- [x] text _(hotovo d. m. yyyy)_`.
Lists are shown alphabetically in the left column, grouped into **active** (open items), **done** (ticked, not yet archived) and **archive** (nothing left but `.done`, or empty), the same three groups the right column uses; hovering a list reveals **mark all done** (active) or **archive → .done** (done). The right column shows the selected one with the same groups.

Independent project by Pavel Perna. Not affiliated with Anthropic, GitHub, Microsoft or any AI vendor.
