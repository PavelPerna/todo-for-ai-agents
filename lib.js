'use strict';
// Pure helpers shared by extension.js and the tests. No vscode dependency.

const TASK = /^(\s*[-*]\s+)\[([ xX])\]\s+(.*)$/;

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

/** Parse a list body into items the view draws. */
function parseList(lines) {
  const items = [];
  lines.forEach((line, i) => {
    const m = line.match(TASK);
    if (m) { items.push({ kind: 'task', i, checked: m[2] !== ' ', html: inline(m[3]) }); return; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { if (i > 0) items.push({ kind: 'head', html: inline(h[2]) }); return; }
    if (/^onDone:/i.test(line)) { items.push({ kind: 'ondone', html: inline(line.replace(/^onDone:\s*/i, '')) }); return; }
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

module.exports = { TASK, esc, inline, formatDate, stamp, decodeText, focusName, parseList, toggleLine, markAllDone, splitDone, appendRows, takeRow };
