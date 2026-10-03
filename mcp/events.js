'use strict';
// Append-only event log at <dir>/.events.jsonl, one JSON object per line, `seq` unique and ordered.
// Writers (the view, the MCP server) are separate processes, so every mutation of a list and the event
// that announces it run together inside the directory lock (see transact), with the list read inside
// the lock: a concurrent second archive of the same rows finds nothing to move.
const fs = require('fs');
const path = require('path');
const { withLock } = require('./lock');

const FILE = '.events.jsonl';

function eventsPath(dir) { return path.join(dir, FILE); }

/** Lines of the log; a damaged unterminated tail is isolated so it cannot swallow the next record. */
function repairTail(p) {
  let text = ''; try { text = fs.readFileSync(p, 'utf8'); } catch (_) { return 0; }
  if (text.length && !text.endsWith('\n')) fs.appendFileSync(p, '\n');
  return text.split('\n').filter(Boolean).length;
}

/** Append one event; caller must hold the lock. */
function appendUnlocked(dir, event) {
  const p = eventsPath(dir);
  const seq = repairTail(p) + 1;
  const full = { seq, at: new Date().toISOString(), ...event };
  fs.appendFileSync(p, JSON.stringify(full) + '\n');
  return full;
}

/** Append one event under the lock (for callers that do not mutate list files). */
function appendEvent(dir, event) {
  fs.mkdirSync(dir, { recursive: true });
  return withLock(dir, () => appendUnlocked(dir, event));
}

/** Atomic file replace: write a temp file in the same directory, then rename over the target. */
function writeAtomic(p, text) {
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text); fs.renameSync(tmp, p);
}

/**
 * One list mutation + its event, atomically with respect to other writers:
 *   read()  → snapshot, taken inside the lock
 *   plan(snapshot) → { writes: [{path, text}], event } or null when there is nothing to do
 * The writes are applied (atomic renames), then the event is appended. If the append fails the
 * previous file contents are restored and the error is rethrown, so a retry sees the original state
 * and no event exists for a move that did not commit.
 */
function transact(dir, read, plan) {
  fs.mkdirSync(dir, { recursive: true });
  return withLock(dir, () => {
    const snapshot = read();
    const op = plan(snapshot);
    if (!op) return null;
    const before = op.writes.map(w => { let text = null; try { text = fs.readFileSync(w.path, 'utf8'); } catch (_) {} return { path: w.path, text }; });
    for (const w of op.writes) writeAtomic(w.path, w.text);
    try { return appendUnlocked(dir, op.event); }
    catch (e) {
      for (const b of before) { if (b.text === null) { try { fs.unlinkSync(b.path); } catch (_) {} } else writeAtomic(b.path, b.text); }
      throw e;
    }
  });
}

/** Events with seq > since (default 0), oldest first; malformed lines are skipped. */
function readEvents(dir, since = 0) {
  let text = ''; try { text = fs.readFileSync(eventsPath(dir), 'utf8'); } catch (_) { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); if ((e.seq || 0) > since) out.push(e); } catch (_) {}
  }
  return out;
}

module.exports = { FILE, eventsPath, appendEvent, transact, readEvents, writeAtomic };
