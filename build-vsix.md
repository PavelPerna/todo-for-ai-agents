Build + install:
  python3 build-vsix.py
  ~/.vscode-server/bin/*/bin/remote-cli/code --install-extension todo-for-ai-agents-<v>.vsix
  Developer: Reload Window

Marketplace: upload the same .vsix at https://marketplace.visualstudio.com/manage (publisher PavelPerna).
