'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib');

test('focusName decodes UTF-16LE with BOM as PowerShell 5.1 writes it', () => {
  const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('standup\r\n', 'utf16le')]);
  assert.equal(L.focusName(buf), 'standup');
});
test('focusName decodes UTF-8 with and without BOM, trims and strips quotes', () => {
  assert.equal(L.focusName(Buffer.from('﻿"PROJ-123"\n')), 'PROJ-123');
  assert.equal(L.focusName(Buffer.from('  garden  \n')), 'garden');
  assert.equal(L.focusName(Buffer.from('\n\nweekend-trip')), 'weekend-trip');
  assert.equal(L.focusName(Buffer.alloc(0)), '');
});
test('focusName decodes UTF-16BE with BOM', () => {
  const be = Buffer.from('abc', 'utf16le').swap16();
  assert.equal(L.focusName(Buffer.concat([Buffer.from([0xfe, 0xff]), be])), 'abc');
});

test('parseList classifies tasks, headings, onDone and text; title line is skipped', () => {
  const items = L.parseList(['# garden', 'onDone: log it', '', '- [ ] water', '- [x] prune', '## notes', 'plain', '- bullet']);
  assert.deepEqual(items.map(i => i.kind), ['hook', 'task', 'task', 'head', 'text', 'text']);
  assert.equal(items[1].checked, false); assert.equal(items[1].i, 3);
  assert.equal(items[2].checked, true);
  assert.equal(items[0].html, 'log it');
});

test('toggleLine flips the box and leaves non-tasks alone', () => {
  assert.deepEqual(L.toggleLine(['- [ ] a'], 0), ['- [x] a']);
  assert.deepEqual(L.toggleLine(['  * [X] a'], 0), ['  * [ ] a']);
  assert.equal(L.toggleLine(['# title'], 0), null);
  assert.equal(L.toggleLine([], 5), null);
});

test('splitDone moves ticked rows with a date stamp and keeps the rest in order', () => {
  const { kept, moved } = L.splitDone(['# l', 'onDone: x', '- [ ] a', '- [x] b', 'text', '- [x] c _(hotovo 1. 1. 2020)_'], '2. 10. 2026');
  assert.deepEqual(kept, ['# l', 'onDone: x', '- [ ] a', 'text']);
  assert.deepEqual(moved, ['- [x] b _(hotovo 2. 10. 2026)_', '- [x] c _(hotovo 2. 10. 2026)_']);
});

test('appendRows creates a title on an empty body and trims trailing blanks', () => {
  assert.deepEqual(L.appendRows([], 'l — done', ['- [x] a']), ['# l — done', '', '- [x] a', '']);
  assert.deepEqual(L.appendRows(['# l', '', '- [ ] a', '', ''], 'l', ['- [ ] b']), ['# l', '', '- [ ] a', '- [ ] b', '']);
});

test('takeRow restores an archived row as an open task without the stamp', () => {
  const r = L.takeRow(['# d', '', '- [x] a _(hotovo 2. 10. 2026)_'], 2);
  assert.deepEqual(r, { rest: ['# d', ''], row: '- [ ] a' });
  assert.equal(L.takeRow(['# d'], 0), null);
});

test('inline escapes HTML and renders code, bold, italics and links', () => {
  assert.equal(L.inline('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
  assert.equal(L.inline('`c` **b** *i* _u_ [t](https://x)'), '<code>c</code> <strong>b</strong> <em>i</em> <em>u</em> <a href="https://x">t</a>');
});

const I = require('../i18n');
test('i18n picks the base language and falls back to en', () => {
  assert.equal(I.pick('cs'), 'cs'); assert.equal(I.pick('cs-CZ'), 'cs'); assert.equal(I.pick('en-US'), 'en');
  assert.equal(I.pick('de'), 'en'); assert.equal(I.pick(undefined), 'en');
});
test('i18n: every key exists in every language, all plain strings, same placeholders', () => {
  const langs = Object.keys(I.STRINGS); const ref = I.STRINGS.en;
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
  for (const l of langs) for (const k of Object.keys(ref)) { assert.equal(typeof I.STRINGS[l][k], 'string', `${l}.${k}`); assert.equal(ph(I.STRINGS[l][k]), ph(ref[k]), `${l}.${k} placeholders`); }
  assert.equal(I.fmt(I.STRINGS.cs.hideDone, { n: 3 }), 'archivovat hotové (3) → .done');
  assert.equal(I.fmt(I.STRINGS.en.restore, { name: 'x' }), 'restore to x');
  assert.equal(I.fmt('{a} {b}', { a: 1 }), '1 {b}');
});

test('markAllDone ticks every open task and reports the count', () => {
  const r = L.markAllDone(['# l', '- [ ] a', '- [x] b', 'text', '  * [ ] c']);
  assert.deepEqual(r.lines, ['# l', '- [x] a', '- [x] b', 'text', '  * [x] c']);
  assert.equal(r.changed, 2);
  assert.equal(L.markAllDone(['- [x] a']).changed, 0);
});

test('parseCommands reads show/markAll/archive lines, skips comments, reports unknown verbs', () => {
  const buf = Buffer.from('# agent commands\nshow standup\nmarkall "PROJ-123"\narchive garden\nfrobnicate x\n\n');
  const r = L.parseCommands(buf);
  assert.deepEqual(r.ok, [{ verb: 'show', list: 'standup' }, { verb: 'markAll', list: 'PROJ-123' }, { verb: 'archive', list: 'garden' }]);
  assert.deepEqual(r.bad, ['frobnicate x']);
});
test('parseCommands accepts a UTF-16LE file like .focus does', () => {
  const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('archive standup\r\n', 'utf16le')]);
  assert.deepEqual(L.parseCommands(buf).ok, [{ verb: 'archive', list: 'standup' }]);
});

test('parseAttrs/formatAttrs: typed hook block before the text, escapes, unknown keys kept aside', () => {
  const a = L.parseAttrs('(onDone="notify", onArchive="check PRs", foo="x") Do a task 1');
  assert.deepEqual(a.hooks, { onDone: 'notify', onArchive: 'check PRs' }); assert.deepEqual(a.other, { foo: 'x' }); assert.equal(a.text, 'Do a task 1');
  assert.equal(L.formatAttrs({ onReopen: 'say "hi"' }, 'T'), '(onReopen="say \\"hi\\"") T');
  assert.equal(L.parseAttrs(L.formatAttrs({ onReopen: 'say "hi"' }, 'T')).hooks.onReopen, 'say "hi"');
  assert.deepEqual(L.parseAttrs('plain text (not attrs)'), { hooks: {}, other: {}, text: 'plain text (not attrs)' });
  assert.equal(L.formatAttrs({}, 'T'), 'T');
});
test('listHooks + effectiveHooks: item overrides list default per key', () => {
  const d = L.listHooks(['# l', 'onDone: list done', 'onarchive: list archive', '- [ ] x']);
  assert.deepEqual(d, { onDone: 'list done', onArchive: 'list archive' });
  assert.deepEqual(L.effectiveHooks({ onDone: 'mine' }, d), { onDone: 'mine', onArchive: 'list archive' });
  assert.deepEqual(L.effectiveHooks({}, {}), {});
});
test('parseList strips the attribute block from the rendered text and exposes hooks; header hook lines are kind hook', () => {
  const items = L.parseList(['# l', 'onDone: a', 'onReopen: r', '- [ ] (onDone="b") task']);
  assert.deepEqual(items.map(i => i.kind), ['hook', 'hook', 'task']);
  assert.equal(items[2].html, 'task'); assert.deepEqual(items[2].hooks, { onDone: 'b' });
});
