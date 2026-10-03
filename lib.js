'use strict';
// Pure helpers shared by extension.js and the tests. No vscode dependency.

const TASK = /^(\s*[-*]\s+)\[([ xX])\]\s+(.*)$/;
const HOOKS = ['onDone', 'onArchive', 'onReopen'];
// Typed attribute block right after the checkbox: (onDone="…", onArchive="…", onReopen="…") text
const ATTRS = /^\(\s*((?:\w+\s*=\s*"(?:[^"\\]|\\.)*"\s*,?\s*)+)\)\s*(.*)$/;

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

/** Split `(key="v", …) text` into { hooks, text }; unknown keys are kept in `other`. */
function parseAttrs(raw) {
  const m = String(raw).match(ATTRS);
  if (!m) return { hooks: {}, other: {}, text: String(raw) };
  const hooks = {}, other = {};
  for (const kv of m[1].matchAll(/(\w+)\s*=\s*"((?:[^"\\]|\\.)*)"/g)) {
    const val = kv[2].replace(/\\(["\\])/g, '$1');
    if (HOOKS.includes(kv[1])) hooks[kv[1]] = val; else other[kv[1]] = val;
  }
  return { hooks, other, text: m[2] };
}

/** Inverse of parseAttrs: `(onDone="…") text`, or just text when there are no hooks. */
function formatAttrs(hooks, text) {
  const parts = HOOKS.filter(k => hooks && hooks[k]).map(k => `${k}="${String(hooks[k]).replace(/(["\\])/g, '\\$1')}"`);
  return parts.length ? `(${parts.join(', ')}) ${text}` : text;
}

/** List-level hook defaults from header lines `onDone: …`, `onArchive: …`, `onReopen: …`. */
function listHooks(lines) {
  const out = {};
  for (const l of lines) { const m = l.match(/^(onDone|onArchive|onReopen):\s*(.*)$/i); if (m) out[HOOKS.find(h => h.toLowerCase() === m[1].toLowerCase())] = m[2].trim(); }
  return out;
}

/** Effective hooks for one item: its own attributes over the list defaults. */
function effectiveHooks(itemHooks, defaults) {
  const out = {};
  for (const k of HOOKS) { const v = (itemHooks && itemHooks[k]) || (defaults && defaults[k]); if (v) out[k] = v; }
  return out;
}

function formatDate(d) { return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`; }

function stamp(text) { return text.replace(/\s*_\(hotovo \d+\. \d+\. \d{4}\)_\s*$/, ''); }

/** Decode a text file that may carry a UTF-16 (PowerShell 5.1 `>`) or UTF-8 BOM. */
function decodeText(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(buf.subarray(2)).swap16().toString('utf16le');
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  return buf.toString('utf8');
}

/** The list name a .focus file asks for: first non-empty line, trimmed, quotes stripped. */
function focusName(buf) {
  const line = decodeText(buf).split(/\r?\n/).map(l => l.trim()).find(Boolean) || '';
  return line.replace(/^["']|["']$/g, '');
}

/** Parse .cmd lines: `show <list>`, `markAll <list>`, `archive <list>`; unknown verbs are reported. */
function parseCommands(buf) {
  const ok = [], bad = [];
  for (const raw of decodeText(buf).split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(show|markAll|archive)\s+(.+)$/i);
    if (!m) { bad.push(line); continue; }
    ok.push({ verb: m[1].replace(/^markall$/i, 'markAll').replace(/^show$/i, 'show').replace(/^archive$/i, 'archive'), list: m[2].trim().replace(/^["']|["']$/g, '') });
  }
  return { ok, bad };
}

/** Parse a list body into items the view draws. */
function parseList(lines) {
  const items = [];
  lines.forEach((line, i) => {
    const m = line.match(TASK);
    if (m) { const a = parseAttrs(m[3]); items.push({ kind: 'task', i, checked: m[2] !== ' ', html: inline(a.text), text: a.text, hooks: a.hooks }); return; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { if (i > 0) items.push({ kind: 'head', html: inline(h[2]) }); return; }
    if (/^(onDone|onArchive|onReopen):/i.test(line)) { const mm = line.match(/^(\w+):\s*(.*)$/); items.push({ kind: 'hook', name: mm[1], html: inline(mm[2]) }); return; }
    if (line.trim()) items.push({ kind: 'text', html: inline(line.replace(/^\s*[-*]\s+/, '')) });
  });
  return items;
}

/** Toggle the checkbox on one line; returns the new lines or null when the line is not a task. */
function toggleLine(lines, index) {
  const m = (lines[index] || '').match(TASK);
  if (!m) return null;
  const out = lines.slice();
  out[index] = `${m[1]}[${m[2] === ' ' ? 'x' : ' '}] ${m[3]}`;
  return out;
}

/** Tick every open task; returns the new lines and how many changed. */
function markAllDone(lines) {
  let changed = 0;
  const out = lines.map(line => { const m = line.match(TASK); if (m && m[2] === ' ') { changed++; return `${m[1]}[x] ${m[3]}`; } return line; });
  return { lines: out, changed };
}

/** Split ticked tasks out of a list: { kept, moved } where moved are archive rows. */
function splitDone(lines, today) {
  const moved = [];
  const kept = lines.filter(line => {
    const m = line.match(TASK);
    if (m && m[2] !== ' ') { moved.push(`- [x] ${stamp(m[3])} _(hotovo ${today})_`); return false; }
    return true;
  });
  return { kept, moved };
}

/** Append rows to a list body, creating the title when the body is empty. */
function appendRows(lines, title, rows) {
  const target = lines.slice();
  while (target.length && !target[target.length - 1].trim()) target.pop();
  if (target.length === 0) target.push(`# ${title}`, '');
  target.push(...rows, '');
  return target;
}

/** Take one archived row out of a .done body: { rest, row } or null. */
function takeRow(lines, index) {
  const m = (lines[index] || '').match(TASK);
  if (!m) return null;
  const rest = lines.slice(); rest.splice(index, 1);
  return { rest, row: `- [ ] ${stamp(m[3])}` };
}

module.exports = { TASK, HOOKS, esc, inline, formatDate, stamp, decodeText, focusName, parseAttrs, formatAttrs, listHooks, effectiveHooks, parseCommands, parseList, toggleLine, markAllDone, splitDone, appendRows, takeRow };
