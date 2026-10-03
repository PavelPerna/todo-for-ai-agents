'use strict';
// List mutations shared by the view (extension.js) and the MCP server (store.js). Every writer goes
// through here, so all of them hold the directory lock. Moves between files (archive, restore) are
// journaled transactions (see events.js) and recover after a crash; single-file edits (editList: add
// item, tick, mark all, create) are one locked atomic replacement and have no journal.
const fs = require('fs');
const path = require('path');
const L = require('../lib');
const { transact, mutate, writeAtomic } = require('./events');

function readLines(p) { try { return fs.readFileSync(p, 'utf8').split('\n'); } catch (_) { return []; } }
const join = lines => lines.join('\n');
const listFile = (dir, name) => path.join(dir, `${name}.md`);
const doneFile = (dir, name) => path.join(dir, `${name}.done.md`);
const listOnDone = lines => (lines.find(l => /^onDone:/i.test(l)) || '').replace(/^onDone:\s*/i, '');

/** Locked read-modify-write of one list without an event: fn(lines) → new lines or null. */
function editList(dir, name, fn) {
  return mutate(dir, () => { const lines = readLines(listFile(dir, name)); const out = fn(lines); if (out) writeAtomic(listFile(dir, name), join(out)); return out; });
}

/** Move ticked rows of `name` to <name>.done.md stamped with `today`; returns the event or null. */
function archive(dir, name, today = L.formatDate(new Date())) {
  return transact(dir,
    () => ({ list: readLines(listFile(dir, name)), done: readLines(doneFile(dir, name)) }),
    snap => {
      const { kept, moved } = L.splitDone(snap.list, today);
      if (!moved.length) return null;
      return {
        writes: [
          { path: listFile(dir, name), text: join(kept) },
          { path: doneFile(dir, name), text: join(L.appendRows(snap.done, `${name} — done`, moved)) },
        ],
        event: { type: 'archived', list: name, items: moved.map(r => L.stamp(r.replace(/^- \[x\] /, ''))), onDone: listOnDone(kept) },
      };
    });
}

/** Bring archived row `index` back as an open item: a journaled two-file move with no event in this version. */
function restore(dir, name, index) {
  return transact(dir,
    () => ({ list: readLines(listFile(dir, name)), done: readLines(doneFile(dir, name)) }),
    snap => {
      const taken = L.takeRow(snap.done, index); if (!taken) return null;
      return { writes: [{ path: doneFile(dir, name), text: join(taken.rest) }, { path: listFile(dir, name), text: join(L.appendRows(snap.list, name, [taken.row])) }], event: null };
    });
}

module.exports = { editList, archive, restore, readLines, listFile, doneFile };
