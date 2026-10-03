'use strict';
// List mutations shared by the view (extension.js) and the MCP server (store.js). Each one is a
// journaled transaction (see events.js): read inside the lock, intent to .journal, atomic writes, event; recoverable.
// Event schema v2: { seq, at, v: 2, type: done|archived|reopened, list, items: string[] (texts, as in v1),
// onDone (list default, as in v1), details: [{ text, hook, hooks }], listHooks }.
const fs = require('fs');
const path = require('path');
const L = require('../lib');
const { transact, mutate, writeAtomic } = require('./events');

function readLines(p) { try { return fs.readFileSync(p, 'utf8').split('\n'); } catch (_) { return []; } }
const join = lines => lines.join('\n');
const listFile = (dir, name) => path.join(dir, `${name}.md`);
const doneFile = (dir, name) => path.join(dir, `${name}.done.md`);

/** Locked read-modify-write of one list without an event: fn(lines) → new lines or null. */
function editList(dir, name, fn) {
  return mutate(dir, () => { const lines = readLines(listFile(dir, name)); const out = fn(lines); if (out) writeAtomic(listFile(dir, name), join(out)); return out; });
}

/** Event payload for `type` over raw task texts (attribute block + optional stamp). */
function event(type, name, rawTexts, listLines) {
  const defaults = L.listHooks(listLines);
  const key = { done: 'onDone', archived: 'onArchive', reopened: 'onReopen' }[type];
  const details = rawTexts.map(raw => { const a = L.parseAttrs(L.stamp(raw)); const hooks = L.effectiveHooks(a.hooks, defaults); return { text: a.text, hook: hooks[key] || null, hooks }; });
  return { v: 2, type, list: name, items: details.map(d => d.text), onDone: defaults.onDone || '', details, listHooks: defaults };
}

/** Tick or untick line `index`; emits done / reopened. Returns the event or null when not a task. */
function toggle(dir, name, index) {
  return transact(dir, () => readLines(listFile(dir, name)), lines => {
    const out = L.toggleLine(lines, index); if (!out) return null;
    const m = out[index].match(L.TASK);
    return { writes: [{ path: listFile(dir, name), text: join(out) }], event: event(m[2] !== ' ' ? 'done' : 'reopened', name, [m[3]], out) };
  });
}

/** Set line `index` to `checked`; no-op (null) when already in that state. */
function setChecked(dir, name, index, checked) {
  return transact(dir, () => readLines(listFile(dir, name)), lines => {
    const m = (lines[index] || '').match(L.TASK); if (!m) throw new Error(`line ${index} is not a task`);
    if ((m[2] !== ' ') === checked) return null;
    const out = L.toggleLine(lines, index);
    return { writes: [{ path: listFile(dir, name), text: join(out) }], event: event(checked ? 'done' : 'reopened', name, [m[3]], out) };
  });
}

/** Tick every open item; one done event naming exactly the items that were open in the same snapshot. */
function markAll(dir, name) {
  return transact(dir, () => readLines(listFile(dir, name)), lines => {
    const r = L.markAllDone(lines); if (!r.changed) return null;
    const rows = lines.filter(l => { const m = l.match(L.TASK); return m && m[2] === ' '; }).map(l => l.match(L.TASK)[3]);
    return { writes: [{ path: listFile(dir, name), text: join(r.lines) }], event: event('done', name, rows, r.lines) };
  });
}

/** Move ticked rows to <name>.done.md stamped with `today`; emits archived. */
function archive(dir, name, today = L.formatDate(new Date())) {
  return transact(dir,
    () => ({ list: readLines(listFile(dir, name)), done: readLines(doneFile(dir, name)) }),
    snap => {
      const { kept, moved } = L.splitDone(snap.list, today); if (!moved.length) return null;
      return {
        writes: [
          { path: listFile(dir, name), text: join(kept) },
          { path: doneFile(dir, name), text: join(L.appendRows(snap.done, `${name} — done`, moved)) },
        ],
        event: event('archived', name, moved.map(r => r.replace(/^- \[x\] /, '')), kept),
      };
    });
}

/** Bring archived row `index` back as an open item; emits reopened. */
function restore(dir, name, index) {
  return transact(dir,
    () => ({ list: readLines(listFile(dir, name)), done: readLines(doneFile(dir, name)) }),
    snap => {
      const taken = L.takeRow(snap.done, index); if (!taken) return null;
      const list = L.appendRows(snap.list, name, [taken.row]);
      return {
        writes: [{ path: doneFile(dir, name), text: join(taken.rest) }, { path: listFile(dir, name), text: join(list) }],
        event: event('reopened', name, [taken.row.replace(/^- \[ \] /, '')], list),
      };
    });
}

module.exports = { editList, toggle, setChecked, markAll, archive, restore, readLines, listFile, doneFile };
