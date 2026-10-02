'use strict';
// File-backed operations over a .todo directory. Pure w.r.t. VS Code: used by the MCP server and tested directly.
const fs = require('fs');
const path = require('path');
const L = require('../lib');

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function readLines(p) { try { return fs.readFileSync(p, 'utf8').split('\n'); } catch (_) { return []; } }
function writeLines(p, lines) { fs.writeFileSync(p, lines.join('\n')); }

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
    writeLines(this.file(name), [`# ${name}`, `onDone: ${onDone.trim()}`, '', ...items.map(t => `- [ ] ${t}`), '']);
    return this.readList(name);
  }

  addItem(name, text) {
    this.assertExists(name);
    if (typeof text !== 'string' || !text.trim() || /\n/.test(text)) throw new Error('text must be one non-empty line');
    writeLines(this.file(name), L.appendRows(readLines(this.file(name)), name, [`- [ ] ${text.trim()}`]));
    return this.readList(name);
  }

  setChecked(name, line, checked) {
    this.assertExists(name);
    const lines = readLines(this.file(name));
    const m = (lines[line] || '').match(L.TASK);
    if (!m) throw new Error(`line ${line} is not a task`);
    if ((m[2] !== ' ') !== checked) writeLines(this.file(name), L.toggleLine(lines, line));
    return this.readList(name);
  }

  markAll(name) {
    this.assertExists(name);
    const r = L.markAllDone(readLines(this.file(name)));
    if (r.changed) writeLines(this.file(name), r.lines);
    return { changed: r.changed, ...this.readList(name) };
  }

  archive(name, today = L.formatDate(new Date())) {
    this.assertExists(name);
    const { kept, moved } = L.splitDone(readLines(this.file(name)), today);
    if (moved.length) { writeLines(this.file(name), kept); writeLines(this.doneFile(name), L.appendRows(readLines(this.doneFile(name)), `${name} — done`, moved)); }
    return { archivedCount: moved.length, ...this.readList(name) };
  }

  show(name) {
    this.assertExists(name);
    fs.mkdirSync(this.dir, { recursive: true });
    fs.appendFileSync(path.join(this.dir, '.cmd'), `show ${name}\n`);
    return { ok: true, note: 'written to .todo/.cmd; the VS Code view consumes it' };
  }
}

module.exports = { Store, NAME };
