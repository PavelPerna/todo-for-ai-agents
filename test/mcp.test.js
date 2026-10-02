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

test('archive appends an archived event with items and onDone; events(since) pages by seq', () => {
  const s = new Store(tmp()); s.createList('garden', 'water the log', ['a', 'b']);
  s.markAll('garden'); s.archive('garden', '2. 10. 2026');
  const ev = s.events(0); assert.equal(ev.length, 1);
  assert.equal(ev[0].seq, 1); assert.equal(ev[0].type, 'archived'); assert.equal(ev[0].list, 'garden');
  assert.deepEqual(ev[0].items, ['a', 'b']); assert.equal(ev[0].onDone, 'water the log'); assert.ok(ev[0].at);
  assert.deepEqual(s.events(1), []);
  s.addItem('garden', 'c'); s.markAll('garden'); s.archive('garden', '3. 10. 2026');
  assert.equal(s.events(1).length, 1); assert.equal(s.events(1)[0].seq, 2);
  assert.deepEqual(new Store(tmp()).events(0), []);
});

test('events: two processes appending concurrently get unique, ordered seq', async () => {
  const dir = tmp(); const script = `const {appendEvent}=require(${JSON.stringify(path.join(__dirname, '..', 'mcp', 'events.js'))});for(let i=0;i<25;i++)appendEvent(${JSON.stringify(dir)},{type:'done',list:process.argv[2],items:[]});`;
  const run = tag => new Promise((res, rej) => { const c = spawn(process.execPath, ['-e', script, tag]); c.on('close', code => (code === 0 ? res() : rej(new Error('writer ' + tag + ' exit ' + code)))); });
  await Promise.all([run('a'), run('b')]);
  const seqs = new Store(dir).events(0).map(e => e.seq);
  assert.equal(seqs.length, 50); assert.deepEqual(seqs, [...Array(50)].map((_, i) => i + 1));
});

test('archive: when the event cannot be appended nothing is moved, so a retry works', () => {
  const s = new Store(tmp()); s.createList('g', 'n', ['a']); s.markAll('g');
  fs.mkdirSync(path.join(s.dir, '.events.lock')); // another writer holds the lock forever
  assert.throws(() => s.archive('g', '2. 10. 2026'), /locked/);
  assert.equal(s.readList('g').items.length, 1); assert.equal(s.readList('g').archived.length, 0);
  fs.rmdirSync(path.join(s.dir, '.events.lock'));
  assert.equal(s.archive('g', '2. 10. 2026').archivedCount, 1);
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
  fs.writeFileSync(path.join(dir, '.state'), JSON.stringify({ selected: 'trip', updatedAt: '2026-10-02T20:00:00.000Z' }));
  send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'current_list', arguments: {} } });
  await new Promise(r => setTimeout(r, 400)); child.stdin.end(); await new Promise(r => child.on('close', r));
  const msgs = out.join('').trim().split('\n').map(JSON.parse);
  assert.equal(msgs.length, 5);
  assert.equal(msgs[4].result.structuredContent.selected, 'trip');
  assert.equal(msgs[0].result.serverInfo.name, 'todo-for-ai-agents');
  assert.equal(msgs[1].result.tools.length, 10);
  assert.equal(msgs[2].result.structuredContent.items[0].text, 'book cabin');
  assert.equal(msgs[3].result.isError, true); assert.match(msgs[3].result.content[0].text, /no list named/);
  assert.ok(fs.existsSync(path.join(dir, 'trip.md')));
});
