#!/usr/bin/env node
'use strict';
// MCP server (stdio, newline-delimited JSON-RPC 2.0) over a .todo directory. No dependencies.
// Usage: node mcp/server.js --dir /path/to/workspace/.todo   (default: ./.todo)
const readline = require('readline');
const path = require('path');
const { Store } = require('./store');

const args = process.argv.slice(2);
const dirArg = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : path.join(process.cwd(), '.todo');
const store = new Store(path.resolve(dirArg));

const name = { type: 'string', description: 'list name (file name without .md)' };
const TOOLS = [
  { name: 'list_lists', description: 'All TODO lists with open/checked/archived counts and their onDone contract.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'read_list', description: 'One list: onDone, items (line, checked, text), archived items, raw markdown.', inputSchema: { type: 'object', properties: { name }, required: ['name'], additionalProperties: false } },
  { name: 'create_list', description: 'Create a list. onDone is required: agree it with the human first; "nothing" is valid.', inputSchema: { type: 'object', properties: { name, onDone: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } }, required: ['name', 'onDone'], additionalProperties: false } },
  { name: 'add_item', description: 'Append one open item (one line of markdown) to a list.', inputSchema: { type: 'object', properties: { name, text: { type: 'string' } }, required: ['name', 'text'], additionalProperties: false } },
  { name: 'set_checked', description: 'Tick or untick one item by its line number from read_list. Never untick what the human ticked unless asked.', inputSchema: { type: 'object', properties: { name, line: { type: 'integer' }, checked: { type: 'boolean' } }, required: ['name', 'line', 'checked'], additionalProperties: false } },
  { name: 'mark_all_done', description: 'Tick every open item. Only when the human said the whole list is done.', inputSchema: { type: 'object', properties: { name }, required: ['name'], additionalProperties: false } },
  { name: 'archive', description: 'Move ticked items to <name>.done.md with a date. Use this instead of editing .done.md.', inputSchema: { type: 'object', properties: { name }, required: ['name'], additionalProperties: false } },
  { name: 'show', description: 'Bring the list into view in VS Code (writes .todo/.cmd). Use when the human asked or a decision waits on them.', inputSchema: { type: 'object', properties: { name }, required: ['name'], additionalProperties: false } },
];

function call(tool, a) {
  a = a || {};
  switch (tool) {
    case 'list_lists': return store.listLists();
    case 'read_list': return store.readList(a.name);
    case 'create_list': return store.createList(a.name, a.onDone, a.items || []);
    case 'add_item': return store.addItem(a.name, a.text);
    case 'set_checked': return store.setChecked(a.name, a.line, a.checked);
    case 'mark_all_done': return store.markAll(a.name);
    case 'archive': return store.archive(a.name);
    case 'show': return store.show(a.name);
    default: throw new Error(`unknown tool ${tool}`);
  }
}

function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') return { jsonrpc: '2.0', id, result: { protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'todo-for-ai-agents', version: require('../package.json').version } } };
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  if (method === 'tools/call') {
    try { const r = call(params.name, params.arguments); return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], structuredContent: typeof r === 'object' && !Array.isArray(r) ? r : { result: r } } }; }
    catch (e) { return { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: String(e.message || e) }] } }; }
  }
  if (method && method.startsWith('notifications/')) return null;
  if (id === undefined) return null;
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } };
}

if (require.main === module) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', line => {
    if (!line.trim()) return;
    let msg; try { msg = JSON.parse(line); } catch (_) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }) + '\n'); return; }
    const out = handle(msg); if (out) process.stdout.write(JSON.stringify(out) + '\n');
  });
}
module.exports = { handle, TOOLS, call };
