'use strict';
// Append-only event log at <dir>/.events.jsonl, one JSON object per line, `seq` unique and ordered.
// Writers (the view, the MCP server) are separate processes. Every list mutation and the event that
// announces it run as one journaled transaction inside the directory lock:
//   1. the intent (writes + event, with a unique id) is written to <dir>/.journal, atomically;
//   2. the files are replaced, atomically each;
//   3. the event is appended;
//   4. the journal is removed.
// Whoever next takes the lock finds a leftover journal and completes it (steps 2–4 are idempotent: the
// writes carry full file contents and the event carries its id), so a crash at any point leaves the
// files and the log consistent once the next writer runs. The list is read inside the lock, so a
// concurrent second archive of the same rows finds nothing to move.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { withLock } = require('./lock');

const FILE = '.events.jsonl';
const JOURNAL = '.journal';

function eventsPath(dir) { return path.join(dir, FILE); }
function journalPath(dir) { return path.join(dir, JOURNAL); }

/** Atomic file replace: write a temp file in the same directory, then rename over the target. */
function writeAtomic(p, text) {
  const tmp = `${p}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, text); fs.renameSync(tmp, p);
}

function readLog(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return ''; } }

/** Lines of the log; a damaged unterminated tail is isolated so it cannot swallow the next record. */
function repairTail(p) {
  const text = readLog(p);
  if (text.length && !text.endsWith('\n')) fs.appendFileSync(p, '\n');
  return text.split('\n').filter(Boolean);
}

/** Append one event (with id) unless an event with that id is already in the log; caller holds the lock. */
function appendUnlocked(dir, event) {
  const p = eventsPath(dir);
  const lines = repairTail(p);
  if (event.id && lines.some(l => l.includes(`"id":"${event.id}"`))) return JSON.parse(lines.find(l => l.includes(`"id":"${event.id}"`)));
  const full = { seq: lines.length + 1, at: new Date().toISOString(), id: event.id || crypto.randomUUID(), ...event };
  fs.appendFileSync(p, JSON.stringify(full) + '\n');
  return full;
}

/** Complete a journaled transaction (idempotent). */
function complete(dir, j) {
  for (const w of j.writes) writeAtomic(w.path, w.text);
  const stored = appendUnlocked(dir, j.event);
  try { fs.unlinkSync(journalPath(dir)); } catch (_) {}
  return stored;
}

/** Finish a transaction a previous writer left behind, if any; caller holds the lock. */
function recoverUnlocked(dir) {
  let j; try { j = JSON.parse(fs.readFileSync(journalPath(dir), 'utf8')); } catch (_) { return null; }
  return complete(dir, j);
}

/** Append one event under the lock (for callers that do not mutate list files). */
function appendEvent(dir, event) {
  fs.mkdirSync(dir, { recursive: true });
  return withLock(dir, () => { recoverUnlocked(dir); return appendUnlocked(dir, event); });
}

/** Run `fn` under the lock after recovering any pending transaction; for read-modify-write without an event. */
function mutate(dir, fn) {
  fs.mkdirSync(dir, { recursive: true });
  return withLock(dir, () => { recoverUnlocked(dir); return fn(); });
}

/**
 * One list mutation + its event, atomic with respect to other writers and recoverable across crashes:
 *   read()  → snapshot, taken inside the lock
 *   plan(snapshot) → { writes: [{path, text}], event } or null when there is nothing to do
 */
function transact(dir, read, plan) {
  fs.mkdirSync(dir, { recursive: true });
  return withLock(dir, () => {
    recoverUnlocked(dir);
    const snapshot = read();
    const op = plan(snapshot);
    if (!op) return null;
    const j = { id: crypto.randomUUID(), writes: op.writes, event: { id: crypto.randomUUID(), ...op.event } };
    writeAtomic(journalPath(dir), JSON.stringify(j)); // intent is durable before anything changes
    return complete(dir, j);
  });
}

/** Events with seq > since (default 0), oldest first; malformed lines are skipped. */
function readEvents(dir, since = 0) {
  const text = readLog(eventsPath(dir));
  if (!text) return [];
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); if ((e.seq || 0) > since) out.push(e); } catch (_) {}
  }
  return out;
}

module.exports = { FILE, JOURNAL, eventsPath, journalPath, appendEvent, mutate, transact, readEvents, writeAtomic };
