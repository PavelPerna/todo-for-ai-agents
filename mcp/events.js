'use strict';
// Append-only event log at <dir>/.events.jsonl. Written by the view (and the MCP server) when something
// "happens" to a list; read by agents that want to react (onDone). One JSON object per line.
const fs = require('fs');
const path = require('path');

const FILE = '.events.jsonl';

function eventsPath(dir) { return path.join(dir, FILE); }

/** Append one event; `at` is set here. Returns the event with its 1-based line number as `seq`. */
function appendEvent(dir, event) {
  fs.mkdirSync(dir, { recursive: true });
  const p = eventsPath(dir);
  let seq = 1;
  try { seq = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).length + 1; } catch (_) {}
  const full = { seq, at: new Date().toISOString(), ...event };
  fs.appendFileSync(p, JSON.stringify(full) + '\n');
  return full;
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

module.exports = { FILE, eventsPath, appendEvent, readEvents };
