# Changelog


## 0.6.0
- `agentTodo.showList` command and `.todo/.focus` file: an agent (or you) can focus the panel and select a list; the focus file is consumed once applied.
## 0.5.0
- First Marketplace release. Named "TODO Lists for AI Agents by Pavel Perna"; view container, commands and setting are now `agentTodo.*`.
- Two-column view: list picker with search (collapsible) and the selected list.
- Tick toggles `[ ]`/`[x]` in the file; "hide done" archives ticked items to `<name>.done.md` with a date; items can be restored.
- `onDone:` header line rendered under the list title.
