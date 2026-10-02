Build + install:
  python3 build-vsix.py
  ~/.vscode-server/bin/*/bin/remote-cli/code --install-extension claude-todo-view-<v>.vsix
  Developer: Reload Window
