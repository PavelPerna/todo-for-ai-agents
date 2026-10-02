'use strict';
// Append-only event log at <dir>/.events.jsonl. Written by the view and the MCP server (separate processes)
// when something happens to a list; read by agents that want to react. One JSON object per line.
// Sequence allocation and the append happen under a cross-process lock (atomic mkdir), so `seq` is
// unique and follows append order even when both writers race.
const fs = require('fs');
const path = require('path');

const FILE = '.events.jsonl';
const LOCK = '.events.lock';

function eventsPath(dir) { return path.join(dir, FILE); }

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

/** Take the lock (atomic mkdir), retrying for up to `timeoutMs`; a stale lock older than 5 s is broken. */
function withLock(dir, fn, timeoutMs = 2000) {
  const lock = path.join(dir, LOCK);
  const start = Date.now();
  for (;;) {
    try { fs.mkdirSync(lock); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 5000) { fs.rmdirSync(lock); continue; } } catch (_) {}
      if (Date.now() - start > timeoutMs) throw new Error('events log is locked by another writer');
      sleepSync(15);
    }
  }
  try { return fn(); } finally { try { fs.rmdirSync(lock); } catch (_) {} }
}

function countLines(p) { try { return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).length; } catch (_) { return 0; } }

/** Append one event; `seq` and `at` are set here under the lock. Returns the stored event. */
function appendEvent(dir, event) {
  fs.mkdirSync(dir, { recursive: true });
  return withLock(dir, () => {
    const p = eventsPath(dir);
    const full = { seq: countLines(p) + 1, at: new Date().toISOString(), ...event };
    fs.appendFileSync(p, JSON.stringify(full) + '\n');
    return full;
  });
}

/**
 * Run `mutate` only after the event was durably appended: the event is the commit record.
 * If the append fails nothing has changed and the caller may retry; if `mutate` then fails,
 * the event already says what was intended, so a consumer can reconcile instead of losing it.
 */
function appendThen(dir, event, mutate) {
  const stored = appendEvent(dir, event);
  mutate();
  return stored;
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

module.exports = { FILE, LOCK, eventsPath, appendEvent, appendThen, readEvents };
