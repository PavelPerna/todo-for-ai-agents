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

test('archive: when the event cannot be appended the journal survives and the next writer completes it once', () => {
  const E = require('../mcp/events');
  const s = new Store(tmp()); s.createList('g', 'n', ['a']); s.markAll('g');
  if (process.getuid && process.getuid() === 0) return; // root ignores file modes
  const evp = path.join(s.dir, '.events.jsonl'); fs.writeFileSync(evp, ''); fs.chmodSync(evp, 0o444); // append will fail
  assert.throws(() => s.archive('g', '2. 10. 2026'), /EACCES|EPERM/);
  assert.equal(fs.existsSync(E.journalPath(s.dir)), true); // intent kept
  assert.equal(s.events(0).length, 0);
  fs.chmodSync(evp, 0o644);
  s.addItem('g', 'b'); // next locked writer recovers: event appended, journal gone
  assert.equal(fs.existsSync(E.journalPath(s.dir)), false);
  const ev = s.events(0); assert.equal(ev.length, 1); assert.equal(ev[0].type, 'archived'); assert.deepEqual(ev[0].items, ['a']);
  assert.equal(s.readList('g').archived.length, 1);
  assert.equal(s.archive('g', '2. 10. 2026').archivedCount, 0); // nothing left to move, no second event
  assert.equal(s.events(0).length, 1);
});

test('archive: two processes archiving the same list concurrently move the rows once and emit one event', async () => {
  const s = new Store(tmp()); s.createList('g', 'n', ['a', 'b']); s.markAll('g');
  const script = `const {Store}=require(${JSON.stringify(path.join(__dirname, '..', 'mcp', 'store.js'))});new Store(${JSON.stringify(s.dir)}).archive('g','2. 10. 2026');`;
  const run = () => new Promise((res, rej) => { const c = spawn(process.execPath, ['-e', script]); c.on('close', code => (code === 0 ? res() : rej(new Error('exit ' + code)))); });
  await Promise.all([run(), run(), run()]);
  const r = s.readList('g'); assert.equal(r.items.length, 0); assert.equal(r.archived.length, 2);
  const ev = s.events(0).filter(e => e.type === 'archived'); assert.equal(ev.length, 1); assert.deepEqual(ev[0].items, ['a', 'b']);
});

test('lock: a dead owner is reclaimed, a live owner is waited for, a damaged log tail is isolated', () => {
  const { withLock, LOCK } = require('../mcp/lock');
  const dir = tmp(); const lock = path.join(dir, LOCK);
  fs.mkdirSync(lock); fs.writeFileSync(path.join(lock, 'owner'), JSON.stringify({ pid: 999999, token: 'x' })); // no such process
  assert.equal(withLock(dir, () => 'ok'), 'ok'); assert.equal(fs.existsSync(lock), false);
  fs.mkdirSync(lock); fs.writeFileSync(path.join(lock, 'owner'), JSON.stringify({ pid: process.pid, token: 'other' })); // live owner (us), never released
  assert.throws(() => withLock(dir, () => 'no', 200), /locked/); assert.equal(fs.existsSync(lock), true); fs.rmSync(lock, { recursive: true });
  const st = new Store(dir); st.createList('g', 'n', ['a']);
  fs.appendFileSync(path.join(dir, '.events.jsonl'), '{"seq":1,"type":"done","list":"g","ite'); // interrupted write, no newline
  st.markAll('g'); st.archive('g', '2. 10. 2026');
  const ev = st.events(0); assert.equal(ev.length, 1); assert.equal(ev[0].seq, 2); assert.equal(ev[0].type, 'archived');
});

test('a crash between journal and completion is repaired by the next writer (files + event, once)', () => {
  const E = require('../mcp/events');
  const s = new Store(tmp()); s.createList('g', 'n', ['a']); s.markAll('g');
  // simulate: intent journaled, process died before any write
  const j = { id: 'j1', writes: [{ path: path.join(s.dir, 'g.md'), text: '# g\nonDone: n\n' }, { path: path.join(s.dir, 'g.done.md'), text: '# g — done\n\n- [x] a _(hotovo 2. 10. 2026)_\n' }], event: { id: 'e1', type: 'archived', list: 'g', items: ['a'], onDone: 'n' } };
  fs.writeFileSync(E.journalPath(s.dir), JSON.stringify(j));
  assert.equal(s.readList('g').items.length, 1); // nothing applied yet
  s.addItem('g', 'b'); // any locked writer recovers first
  const r = s.readList('g'); assert.equal(r.archived.length, 1); assert.deepEqual(r.items.map(i => i.text), ['b']);
  assert.deepEqual(s.events(0).map(e => [e.id, e.type]), [['e1', 'archived']]);
  assert.equal(fs.existsSync(E.journalPath(s.dir)), false);
  // re-running the same journal is a no-op (idempotent event by id)
  fs.writeFileSync(E.journalPath(s.dir), JSON.stringify(j)); s.addItem('g', 'c');
  assert.equal(s.events(0).length, 1);
});

test('lock: stale directories without an owner are reclaimed exactly once and the winner proceeds', async () => {
  const { withLock, LOCK } = require('../mcp/lock');
  const dir = tmp(); fs.mkdirSync(path.join(dir, LOCK)); // foreign lock dir with no owner record
  const script = `const {withLock}=require(${JSON.stringify(path.join(__dirname, '..', 'mcp', 'lock.js'))});withLock(${JSON.stringify(dir)},()=>{require('fs').appendFileSync(${JSON.stringify(path.join(dir, 'hits'))},'x');});`;
  const run = () => new Promise((res, rej) => { const c = spawn(process.execPath, ['-e', script]); c.on('close', code => (code === 0 ? res() : rej(new Error('exit ' + code)))); });
  await Promise.all([run(), run(), run(), run()]);
  assert.equal(fs.readFileSync(path.join(dir, 'hits'), 'utf8'), 'xxxx');
  assert.equal(fs.existsSync(path.join(dir, LOCK)), false);
  assert.deepEqual(fs.readdirSync(dir).filter(f => f.startsWith('.lock')), []);
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
