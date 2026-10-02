const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const { TASK, esc, inline, formatDate, focusName, parseList, toggleLine, splitDone, appendRows, takeRow } = require('./lib');

function today() { return formatDate(new Date()); }

function dir() {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!folder) return null;
  return path.join(folder.uri.fsPath, vscode.workspace.getConfiguration('agentTodo').get('dir', '.todo'));
}
function lists() {
  const d = dir();
  if (!d || !fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => f.endsWith('.md') && !f.endsWith('.done.md')).sort()
    .map(f => ({ name: f.slice(0, -3), file: path.join(d, f), done: path.join(d, f.slice(0, -3) + '.done.md') }));
}
function readLines(p) { try { return fs.readFileSync(p, 'utf8').split('\n'); } catch (_) { return []; } }

function listData(list) {
  const items = parseList(readLines(list.file));
  const done = [];
  readLines(list.done).forEach((line, i) => { const m = line.match(TASK); if (m) done.push({ i, html: inline(m[3]) }); });
  return { name: list.name, items, done: done.reverse(), open: items.filter(x => x.kind === 'task' && !x.checked).length, checked: items.filter(x => x.kind === 'task' && x.checked).length };
}

function html(webview, data, emptyNote) {
  const nonce = String(Math.random()).slice(2);
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
 html,body{height:100%;margin:0} body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);display:flex;overflow:hidden}
 #left{width:190px;flex:none;border-right:1px solid var(--vscode-panel-border);display:flex;flex-direction:column;overflow:hidden}
 body.collapsed #left{width:26px} body.collapsed #left .only-open{display:none}
 #left header{display:flex;align-items:center;gap:4px;padding:4px}
 #search{flex:1;min-width:0;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,transparent);border-radius:3px;padding:2px 6px;font:inherit}
 #collapse{all:unset;cursor:pointer;opacity:.6;padding:0 3px} #collapse:hover{opacity:1}
 #lists{overflow:auto;flex:1} .lst{display:flex;justify-content:space-between;gap:6px;padding:3px 8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .lst:hover{background:var(--vscode-list-hoverBackground)} .lst.sel{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}
 .lst .n{opacity:.6;font-size:.85em} .lst .n.zero{opacity:.3}
 #right{flex:1;overflow:auto;padding:4px 12px;line-height:1.45}
 h2{font-size:1em;margin:6px 0 4px;color:var(--vscode-textLink-foreground)} h3{font-size:.9em;margin:6px 0 2px;opacity:.8}
 .ondone{font-size:.85em;opacity:.6;margin:0 0 6px;border-left:2px solid var(--vscode-panel-border);padding-left:6px}
 .task{display:flex;gap:6px;align-items:flex-start;margin:2px 0} .task.checked{opacity:.55;text-decoration:line-through}
 .box{all:unset;cursor:pointer;width:1.3em;flex:none;color:var(--vscode-textLink-foreground)} .box:hover{color:var(--vscode-textLink-activeForeground)}
 .hide{all:unset;cursor:pointer;font-size:.85em;opacity:.7;margin:4px 0 2px 1.9em;color:var(--vscode-textLink-foreground)} .hide:hover{opacity:1}
 code{font-family:var(--vscode-editor-font-family);background:var(--vscode-textCodeBlock-background);padding:0 3px;border-radius:3px}
 p{margin:2px 0} .empty{opacity:.5;font-style:italic} em{opacity:.75} a{color:var(--vscode-textLink-foreground)}
 details{margin-top:6px} summary{cursor:pointer;opacity:.6;font-size:.85em}
</style></head><body>
<div id="left"><header><button id="collapse" title="sbalit / rozbalit">◀</button><input id="search" class="only-open" placeholder="hledat list…"></header><div id="lists" class="only-open"></div></div>
<div id="right"></div>
<script nonce="${nonce}">
 const vscode = acquireVsCodeApi();
 const DATA = ${JSON.stringify(data)};
 const EMPTY = ${JSON.stringify(emptyNote)};
 let st = Object.assign({ sel: null, collapsed: false, q: '' }, vscode.getState() || {});
 const $ = id => document.getElementById(id);
 function save() { vscode.setState(st); }
 function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
 function drawLeft() {
   document.body.classList.toggle('collapsed', st.collapsed); $('collapse').textContent = st.collapsed ? '▶' : '◀';
   const q = st.q.toLowerCase();
   $('lists').innerHTML = DATA.filter(l => l.name.toLowerCase().includes(q)).map(l =>
     \`<div class="lst\${l.name === st.sel ? ' sel' : ''}" data-name="\${esc(l.name)}"><span>\${esc(l.name)}</span><span class="n\${l.open ? '' : ' zero'}">\${l.open}</span></div>\`).join('') || '<div class="lst"><span class="empty">nic</span></div>';
 }
 function drawRight() {
   const l = DATA.find(x => x.name === st.sel);
   if (!l) { $('right').innerHTML = '<p class="empty">' + esc(EMPTY) + '</p>'; return; }
   const out = ['<h2>' + esc(l.name) + '</h2>'];
   for (const it of l.items) {
     if (it.kind === 'task') out.push('<div class="task' + (it.checked ? ' checked' : '') + '"><button class="box" data-act="toggle" data-line="' + it.i + '">' + (it.checked ? '☑' : '☐') + '</button><span>' + it.html + '</span></div>');
     else if (it.kind === 'head') out.push('<h3>' + it.html + '</h3>');
     else if (it.kind === 'ondone') out.push('<p class="ondone">onDone: ' + it.html + '</p>');
     else out.push('<p>' + it.html + '</p>');
   }
   if (!l.open && !l.checked) out.push('<p class="empty">nic otevřeného</p>');
   if (l.checked) out.push('<button class="hide" data-act="hide">hide done (' + l.checked + ') → .done</button>');
   if (l.done.length) { out.push('<details><summary>.done (' + l.done.length + ')</summary>'); for (const d of l.done) out.push('<div class="task checked"><button class="box" data-act="undo" data-line="' + d.i + '">☑</button><span>' + d.html + '</span></div>'); out.push('</details>'); }
   $('right').innerHTML = out.join('');
 }
 if (!DATA.some(l => l.name === st.sel)) st.sel = DATA.length ? DATA[0].name : null;
 $('search').value = st.q; drawLeft(); drawRight();
 $('search').addEventListener('input', e => { st.q = e.target.value; save(); drawLeft(); });
 $('search').addEventListener('keydown', e => { if (e.key === 'Enter') { const f = DATA.find(l => l.name.toLowerCase().includes(st.q.toLowerCase())); if (f) { st.sel = f.name; save(); drawLeft(); drawRight(); } } });
 $('collapse').addEventListener('click', () => { st.collapsed = !st.collapsed; save(); drawLeft(); });
 $('lists').addEventListener('click', e => { const d = e.target.closest('.lst[data-name]'); if (!d) return; st.sel = d.dataset.name; save(); drawLeft(); drawRight(); });
 window.addEventListener('message', e => { const m = e.data || {}; if (m.type === 'select' && DATA.some(l => l.name === m.name)) { st.sel = m.name; st.q = ''; $('search').value = ''; save(); drawLeft(); drawRight(); } });
 $('right').addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (!b) return; vscode.postMessage({ act: b.dataset.act, list: st.sel, line: Number(b.dataset.line) }); });
</script></body></html>`;
}

function writeLines(p, lines) { fs.writeFileSync(p, lines.join('\n')); }
function toggle(list, lineIndex) {
  const out = toggleLine(readLines(list.file), lineIndex);
  if (out) writeLines(list.file, out);
}
function hideDone(list) {
  const { kept, moved } = splitDone(readLines(list.file), today());
  if (!moved.length) return;
  writeLines(list.file, kept);
  writeLines(list.done, appendRows(readLines(list.done), `${list.name} — done`, moved));
}
function undo(list, lineIndex) {
  const taken = takeRow(readLines(list.done), lineIndex);
  if (!taken) return;
  writeLines(list.done, taken.rest);
  writeLines(list.file, appendRows(readLines(list.file), list.name, [taken.row]));
}

function activate(context) {
  let view;
  const refresh = () => {
    if (!view) return;
    const all = lists();
    const d = dir();
    view.webview.html = html(view.webview, all.map(listData), `${d || 'no workspace'} is empty — Claude writes lists there as <name>.md`);
  };
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('agentTodo.view', {
    resolveWebviewView(webviewView) {
      view = webviewView;
      webviewView.webview.options = { enableScripts: true };
      webviewView.webview.onDidReceiveMessage(msg => {
        const list = lists().find(l => l.name === msg.list);
        if (!list) return;
        if (msg.act === 'toggle') toggle(list, msg.line);
        else if (msg.act === 'hide') hideDone(list);
        else if (msg.act === 'undo') undo(list, msg.line);
        refresh();
      });
      webviewView.onDidChangeVisibility(refresh);
      refresh();
    },
  }, { webviewOptions: { retainContextWhenHidden: true } }));

  const d = dir();
  if (d) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(d, '*.md'));
    watcher.onDidChange(refresh); watcher.onDidCreate(refresh); watcher.onDidDelete(refresh);
    context.subscriptions.push(watcher);
    try { if (fs.existsSync(d)) { const w = fs.watch(d, { persistent: false }, () => setTimeout(refresh, 60)); context.subscriptions.push({ dispose: () => w.close() }); } } catch (_) {}
  }
  const showList = async (name) => {
    if (!name) { name = await vscode.window.showQuickPick(lists().map(l => l.name), { placeHolder: 'List to show' }); if (!name) return; }
    await vscode.commands.executeCommand('agentTodo.view.focus');
    if (view) { refresh(); setTimeout(() => view.webview.postMessage({ type: 'select', name }), 50); }
  };
  const focusFile = () => { const d = dir(); return d ? path.join(d, '.focus') : null; };
  const consumeFocus = () => {
    const f = focusFile(); if (!f) return;
    let name; try { name = focusName(fs.readFileSync(f)); } catch (_) { return; }
    try { fs.unlinkSync(f); } catch (_) {}
    if (name) showList(name);
  };
  if (d) {
    const fw = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(d, '.focus'));
    fw.onDidCreate(consumeFocus); fw.onDidChange(consumeFocus);
    context.subscriptions.push(fw);
    consumeFocus();
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('agentTodo.showList', showList),
    vscode.commands.registerCommand('agentTodo.refresh', refresh),
    vscode.commands.registerCommand('agentTodo.open', async () => {
      const all = lists(); if (!all.length) return;
      const pick = all.length === 1 ? all[0].name : await vscode.window.showQuickPick(all.map(l => l.name));
      const l = all.find(x => x.name === pick); if (l) vscode.window.showTextDocument(vscode.Uri.file(l.file));
    }),
  );
}
function deactivate() {}
module.exports = { activate, deactivate };
