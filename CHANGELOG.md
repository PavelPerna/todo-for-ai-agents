# Changelog


## 0.9.0
- `show` (command, `.cmd` or `.focus`) on a list that does not exist shows a warning instead of silently doing nothing.
- Agent interface for every action: commands `agentTodo.markAllDone`, `agentTodo.archive` (next to `showList`) and a `.todo/.cmd` file with `show|markAll|archive <name>` lines, consumed once applied. `.focus` stays as a shortcut for `show`.

## 0.8.0
- The selected list uses the same **active / done** grouping as the list column, plus a collapsed **archive** section for `<name>.done.md`.
- UI localized (en, cs) from `vscode.env.language`; strings live in `i18n.js`. The markdown data format is unchanged.
- Left column has the same three groups as the right pane: active, done (ticked, not archived) and archive (only `.done` left, or empty).
- List column hover actions: **mark all done** on an active list, **archive → .done** on a done list; the in-list button now also says "archive".

## 0.7.0
- Left column groups lists into **active** (at least one open item) and a collapsible **done** group (nothing open); a list moves between them as its items change. Default selection prefers an active list.

## 0.6.0
- `.focus` is decoded with UTF-16 or UTF-8 BOM awareness (PowerShell 5.1 `>` writes UTF-16LE).
- Pure list logic moved to `lib.js` with `node --test` coverage; CI builds the .vsix on every PR.
- `agentTodo.showList` command and `.todo/.focus` file: an agent (or you) can focus the panel and select a list; the focus file is consumed once applied.
## 0.5.0
- First Marketplace release. Named "TODO Lists for AI Agents by Pavel Perna"; view container, commands and setting are now `agentTodo.*`.
- Two-column view: list picker with search (collapsible) and the selected list.
- Tick toggles `[ ]`/`[x]` in the file; "hide done" archives ticked items to `<name>.done.md` with a date; items can be restored.
- `onDone:` header line rendered under the list title.
