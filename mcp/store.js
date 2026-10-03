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
  assertName(name) { if (!NAME.test(String(name))) throw new Error(`invalid list name "${name}" (letters, digits, . _ -; max 64)`); return name; }
  exists(name) { return fs.existsSync(this.file(name)); }
  assertExists(name) { this.assertName(name); if (!this.exists(name)) throw new Error(`no list named "${name}"`); return name; }

  listLists() {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir).filter(f => f.endsWith('.md') && !f.endsWith('.done.md')).sort().map(f => {
      const name = f.slice(0, -3); const items = L.parseList(readLines(this.file(name)));
      const tasks = items.filter(i => i.kind === 'task');
      const onDone = (readLines(this.file(name)).find(l => /^onDone:/i.test(l)) || '').replace(/^onDone:\s*/i, '');
      return { name, open: tasks.filter(t => !t.checked).length, checked: tasks.filter(t => t.checked).length, archived: readLines(this.doneFile(name)).filter(l => L.TASK.test(l)).length, onDone };
    });
  }

  readList(name) {
    this.assertExists(name);
    const lines = readLines(this.file(name));
    const items = lines.map((line, i) => { const m = line.match(L.TASK); return m ? { line: i, checked: m[2] !== ' ', text: m[3] } : null; }).filter(Boolean);
    const archived = readLines(this.doneFile(name)).map((line, i) => { const m = line.match(L.TASK); return m ? { line: i, text: m[3] } : null; }).filter(Boolean);
    const onDone = (lines.find(l => /^onDone:/i.test(l)) || '').replace(/^onDone:\s*/i, '');
    return { name, onDone, items, archived, raw: lines.join('\n') };
  }

  createList(name, onDone, items = []) {
    this.assertName(name);
    if (this.exists(name)) throw new Error(`list "${name}" already exists`);
    if (typeof onDone !== 'string' || !onDone.trim()) throw new Error('onDone is required: agree it with the human first ("nothing" is a valid answer)');
    fs.mkdirSync(this.dir, { recursive: true }); // first list in a fresh workspace: .todo/ does not exist yet
    ops.editList(this.dir, name, lines => { if (lines.length) throw new Error(`list "${name}" already exists`); return [`# ${name}`, `onDone: ${onDone.trim()}`, '', ...items.map(t => `- [ ] ${t}`), '']; }); // re-checked inside the lock
    return this.readList(name);
  }

  addItem(name, text) {
    this.assertExists(name);
    if (typeof text !== 'string' || !text.trim() || /\n/.test(text)) throw new Error('text must be one non-empty line');
    ops.editList(this.dir, name, lines => L.appendRows(lines, name, [`- [ ] ${text.trim()}`]));
    return this.readList(name);
  }

  setChecked(name, line, checked) {
    this.assertExists(name);
    ops.editList(this.dir, name, lines => { const m = (lines[line] || '').match(L.TASK); if (!m) throw new Error(`line ${line} is not a task`); return (m[2] !== ' ') !== checked ? L.toggleLine(lines, line) : null; });
    return this.readList(name);
  }

  markAll(name) {
    this.assertExists(name);
    let changed = 0;
    ops.editList(this.dir, name, lines => { const r = L.markAllDone(lines); changed = r.changed; return r.changed ? r.lines : null; });
    return { changed, ...this.readList(name) };
  }

  archive(name, today = L.formatDate(new Date())) {
    this.assertExists(name);
    const ev = ops.archive(this.dir, name, today);
    return { archivedCount: ev ? ev.items.length : 0, ...this.readList(name) };
  }

  /** Which list the human currently sees in the view (from .todo/.state), or null when unknown. */
  currentList() {
    try { const j = JSON.parse(fs.readFileSync(path.join(this.dir, '.state'), 'utf8')); return { selected: j.selected || null, updatedAt: j.updatedAt || null }; }
    catch (_) { return { selected: null, updatedAt: null }; }
  }

  /** Events after `since` (a seq from a previous call; 0 = all). Each: { seq, at, type: 'archived', list, items, onDone }. */
  events(since = 0) { return readEvents(this.dir, Number(since) || 0); }

  show(name) {
    this.assertExists(name);
    fs.mkdirSync(this.dir, { recursive: true });
    fs.appendFileSync(path.join(this.dir, '.cmd'), `show ${name}\n`);
    return { ok: true, note: 'written to .todo/.cmd; the VS Code view consumes it' };
  }
}

module.exports = { Store, NAME };
