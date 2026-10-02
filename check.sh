#!/usr/bin/env bash
# Tests, smoke load, build. Exits non-zero on the first failure so a push never carries a red test.
set -euo pipefail
cd "$(dirname "$0")"
NODE="${NODE:-$(ls ~/.vscode-server/bin/*/node 2>/dev/null | head -1 || command -v node)}"
"$NODE" --test test/lib.test.js
"$NODE" -e "const m=require('module');const o=m._load;m._load=(r,...a)=>r==='vscode'?{env:{language:'en'}}:o(r,...a);require('./extension.js')"
rm -f ./*.vsix
python3 build-vsix.py
