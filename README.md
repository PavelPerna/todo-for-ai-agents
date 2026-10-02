# Claude TODO — VS Code view

Panel view rendering live todo lists that Claude Code writes into `<workspace>/.todo/<name>.md`.
Ticking toggles `[ ]`/`[x]` in the file; "hide done" moves ticked items to `<name>.done.md` with a date;
each list carries an `onDone:` header line Claude acts on when items land in `.done`.

Build & install (WSL):

    python3 build-vsix.py
    ~/.vscode-server/bin/*/bin/remote-cli/code --install-extension claude-todo-view-<v>.vsix
    # VS Code: Developer: Reload Window

Setting `claudeTodo.dir` (default `.todo`) points the view at another directory in the first workspace folder.

## File format

See `.todo.example/`. One list per `<name>.md`:

    # <name>
    onDone: <what Claude does when an item lands in <name>.done.md>

    - [ ] open item (markdown inline: **bold**, `code`, [links](...))
    - [x] ticked item, still visible until "hide done"

`<name>.done.md` is written by the view's "hide done" button: `- [x] text _(hotovo d. m. yyyy)_`.
Lists are shown alphabetically in the left column; the right column shows the selected one.
