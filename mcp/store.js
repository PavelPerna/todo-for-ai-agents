'use strict';
// File-backed operations over a .todo directory. Pure w.r.t. VS Code: used by the MCP server and tested directly.
const fs = require('fs');
const path = require('path');
const L = require('../lib');
const { readEvents } = require('./events');
const ops = require('./ops');

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function readLines(p) { try { return fs.readFileSync(p, 'utf8').split('\n'); } catch (_) { return []; } }

class Store {
  constructor(dir) { this.dir = dir; }
  file(name) { return path.join(this.dir, `${name}.md`); }
  doneFile(name) { return path.join(this.dir, `${name}.done.md`); }
  assertLine(value, what) { if (typeof value !== 'string' || /[\r\n]/.test(value)) throw new Error(`${what} must be a single line`); return value; }
  assertHooks(h) { for (const k of L.HOOKS) if (h && h[k] !== undefined && h[k] !== null) this.assertLine(h[k], k); return h || {}; }
  assertName(name) { if (!NAME.test(String(name))) throw new Error(`invalid list name "${name}" (letters, digits, . _ -; max 64)`); return name; }
  exists(name) { return fs.existsSync(this.file(name)); }
  assertExists(name) { this.assertName(name); if (!this.exists(name)) throw new Error(`no list named "${name}"`); return name; }

  listLists() {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir).filter(f => f.endsWith('.md') && !f.endsWith('.done.md')).sort().map(f => {
      const name = f.slice(0, -3); const items = L.parseList(readLines(this.file(name)));
      const tasks = items.filter(i => i.kind === 'task');
      const hooks = L.listHooks(readLines(this.file(name)));
      return { name, open: tasks.filter(t => !t.checked).length, checked: tasks.filter(t => t.checked).length, archived: readLines(this.doneFile(name)).filter(l => L.TASK.test(l)).length, onDone: hooks.onDone || '', hooks };
    });
  }

  readList(name) {
    this.assertExists(name);
    const lines = readLines(this.file(name));
    const hooks = L.listHooks(lines);
    const items = lines.map((line, i) => { const m = line.match(L.TASK); if (!m) return null; const a = L.parseAttrs(m[3]); return { line: i, checked: m[2] !== ' ', text: a.text, hooks: a.hooks, effectiveHooks: L.effectiveHooks(a.hooks, hooks) }; }).filter(Boolean);
    const archived = readLines(this.doneFile(name)).map((line, i) => { const m = line.match(L.TASK); if (!m) return null; const a = L.parseAttrs(L.stamp(m[3])); return { line: i, text: a.text, hooks: a.hooks, effectiveHooks: L.effectiveHooks(a.hooks, hooks) }; }).filter(Boolean);
    return { name, onDone: hooks.onDone || '', hooks, items, archived, raw: lines.join('\n') };
  }

  createList(name, onDone, items = [], extra = {}) {
    this.assertName(name);
    if (this.exists(name)) throw new Error(`list "${name}" already exists`);
    if (typeof onDone !== 'string' || !onDone.trim()) throw new Error('onDone is required: agree it with the human first ("nothing" is a valid answer)');
    this.assertLine(onDone, 'onDone'); this.assertHooks(extra);
    for (const t of items) this.assertLine(t, 'item text');
    fs.mkdirSync(this.dir, { recursive: true }); // first list in a fresh workspace: .todo/ does not exist yet
    const header = [`# ${name}`, `onDone: ${onDone.trim()}`];
    for (const k of ['onArchive', 'onReopen']) if (extra[k] && String(extra[k]).trim()) header.push(`${k}: ${String(extra[k]).trim()}`);
    ops.editList(this.dir, name, lines => { if (lines.length) throw new Error(`list "${name}" already exists`); return [...header, '', ...items.map(t => `- [ ] ${t}`), '']; }); // re-checked inside the lock
    return this.readList(name);
  }

  addItem(name, text, hooks = {}) {
    this.assertExists(name);
    if (typeof text !== 'string' || !text.trim()) throw new Error('text must be one non-empty line');
    this.assertLine(text, 'text'); this.assertHooks(hooks);
    ops.editList(this.dir, name, lines => L.appendRows(lines, name, [`- [ ] ${L.formatAttrs(hooks, text.trim())}`]));
    return this.readList(name);
  }

  setChecked(name, line, checked) {
    this.assertExists(name);
    ops.setChecked(this.dir, name, line, checked);
    return this.readList(name);
  }

  markAll(name) {
    this.assertExists(name);
    const ev = ops.markAll(this.dir, name);
    return { changed: ev ? ev.items.length : 0, ...this.readList(name) };
  }

  archive(name, today = L.formatDate(new Date())) {
    this.assertExists(name);
    const ev = ops.archive(this.dir, name, today);
    return { archivedCount: ev ? ev.items.length : 0, ...this.readList(name) };
  }

  restore(name, line) {
    this.assertExists(name);
    if (!ops.restore(this.dir, name, line)) throw new Error(`line ${line} is not an archived task`);
    return this.readList(name);
  }

  /** Which list the human currently sees in the view (from .todo/.state), or null when unknown. */
  currentList() {
    try { const j = JSON.parse(fs.readFileSync(path.join(this.dir, '.state'), 'utf8')); return { selected: j.selected || null, updatedAt: j.updatedAt || null }; }
    catch (_) { return { selected: null, updatedAt: null }; }
  }

  /** Events after `since` (0 = all). v2: { seq, at, v, type: done|archived|reopened, list, items: string[], onDone, details: [{text, hook, hooks}], listHooks }. */
  events(since = 0) { return readEvents(this.dir, Number(since) || 0); }

  show(name) {
    this.assertExists(name);
    fs.mkdirSync(this.dir, { recursive: true });
    fs.appendFileSync(path.join(this.dir, '.cmd'), `show ${name}\n`);
    return { ok: true, note: 'written to .todo/.cmd; the VS Code view consumes it' };
  }
}

module.exports = { Store, NAME };
