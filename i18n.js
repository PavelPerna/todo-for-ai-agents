'use strict';
// UI strings, plain text with {placeholders} so they survive the trip into the webview.
// Data format (markdown, the "hotovo" stamp) stays language-neutral; only the view is localized.
const STRINGS = {
  en: {
    active: 'active', done: 'done', archive: 'archive', search: 'search list…', nothing: 'nothing',
    nothingOpen: 'nothing open', hideDone: 'hide done ({n}) → .done', onDone: 'onDone',
    collapse: 'collapse / expand', tick: 'done', untick: 'untick', restore: 'restore to {name}',
    empty: '{dir} is empty — your agent writes lists there as <name>.md', noWorkspace: 'no workspace',
    pickList: 'List to show',
  },
  cs: {
    active: 'aktivní', done: 'hotové', archive: 'archiv', search: 'hledat list…', nothing: 'nic',
    nothingOpen: 'nic otevřeného', hideDone: 'skrýt hotové ({n}) → .done', onDone: 'onDone',
    collapse: 'sbalit / rozbalit', tick: 'hotovo', untick: 'odškrtnout', restore: 'vrátit do {name}',
    empty: '{dir} je prázdný — agent sem zapisuje listy jako <name>.md', noWorkspace: 'žádný workspace',
    pickList: 'Který list zobrazit',
  },
};
function pick(language) {
  const base = String(language || 'en').toLowerCase().split(/[-_]/)[0];
  return STRINGS[base] ? base : 'en';
}
/** Fill {placeholders}: fmt('restore to {name}', { name: 'x' }). */
function fmt(str, vars) { return String(str).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`)); }
module.exports = { STRINGS, pick, fmt };
