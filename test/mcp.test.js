'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawn } = require('child_process');
const { Store } = require('../mcp/store');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'todo-')); }

test('Store: create requires onDone, add/tick/markAll/archive round trip', () => {
  const s = new Store(tmp());
  assert.throws(() => s.createList('x', ''), /onDone is required/);
  assert.throws(() => s.createList('bad name!', 'n'), /invalid list name/);
  s.createList('garden', 'nothing', ['water', 'prune']);
  assert.deepEqual(s.listLists().map(l => [l.name, l.open, l.checked, l.archived, l.onDone]), [['garden', 2, 0, 0, 'nothing']]);
  s.addItem('garden', 'repot');
  let r = s.readList('garden'); assert.equal(r.items.length, 3);
  s.setChecked('garden', r.items[0].line, true);
  assert.equal(s.readList('garden').items[0].checked, true);
  assert.equal(s.markAll('garden').changed, 2);
  const a = s.archive('garden', '2. 10. 2026'); assert.equal(a.archivedCount, 3); assert.equal(a.items.length, 0); assert.equal(a.archived.length, 3);
  assert.equal(s.listLists()[0].archived, 3);
  assert.throws(() => s.readList('nope'), /no list named/);
});

test('Store.createList creates .todo/ in a fresh workspace (Copilot review on PR #6)', () => {
  const dir = path.join(tmp(), 'nested', '.todo');
  assert.equal(fs.existsSync(dir), false);
  const s = new Store(dir); s.createList('first', 'nothing', ['hello']);
  assert.ok(fs.existsSync(path.join(dir, 'first.md')));
  assert.equal(s.listLists()[0].open, 1);
});

test('Store.currentList reads .state and tolerates its absence', () => {
  const s = new Store(tmp()); assert.deepEqual(s.currentList(), { selected: null, updatedAt: null });
  fs.writeFileSync(path.join(s.dir, '.state'), JSON.stringify({ selected: 'PR6', updatedAt: '2026-10-02T20:00:00.000Z' }));
  assert.equal(s.currentList().selected, 'PR6');
});

test('Store.show appends to .cmd', () => {
  const s = new Store(tmp()); s.createList('a', 'nothing'); s.show('a');
  assert.equal(fs.readFileSync(path.join(s.dir, '.cmd'), 'utf8'), 'show a\n');
});

test('MCP server answers initialize, tools/list and tools/call over stdio', async () => {
  const dir = tmp();
  const node = process.execPath;
  const child = spawn(node, [path.join(__dirname, '..', 'mcp', 'server.js'), '--dir', dir]);
  const out = []; child.stdout.on('data', d => out.push(d.toString()));
  const send = o => child.stdin.write(JSON.stringify(o) + '\n');
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'create_list', arguments: { name: 'trip', onDone: 'nothing', items: ['book cabin'] } } });
  send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'read_list', arguments: { name: 'missing' } } });
  await new Promise(r => setTimeout(r, 400)); child.stdin.end(); await new Promise(r => child.on('close', r));
  const msgs = out.join('').trim().split('\n').map(JSON.parse);
  assert.equal(msgs.length, 4);
  assert.equal(msgs[0].result.serverInfo.name, 'todo-for-ai-agents');
  assert.equal(msgs[1].result.tools.length, 9);
  assert.equal(msgs[2].result.structuredContent.items[0].text, 'book cabin');
  assert.equal(msgs[3].result.isError, true); assert.match(msgs[3].result.content[0].text, /no list named/);
  assert.ok(fs.existsSync(path.join(dir, 'trip.md')));
});
