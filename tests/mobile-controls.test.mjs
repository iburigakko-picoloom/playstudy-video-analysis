import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const app = readFileSync(new URL('../public/playstudy/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../public/playstudy/styles.css', import.meta.url), 'utf8');

test('tag colors use in-page choices, including an existing custom color', () => {
  const start = app.indexOf('const TAG_COLOR_CHOICES=');
  const end = app.indexOf('\nbindSettings=function', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    state: { tagDefs: [{ id: 'tag-1', name: '打点', color: '#123abc' }], settings: { doubleTapSkip: 5, fitMode: 'fit', theme: 'light' }, themes: [] },
    esc: value => String(value),
  };
  runInNewContext(`${app.slice(start, end)}\nglobalThis.renderSettings=settings;`, context);
  const html = context.renderSettings();
  assert.match(html, /<select class="tag-color-select" id="settings-tag-color"/);
  assert.match(html, /<select class="tag-color-select" data-tag-color="tag-1"/);
  assert.match(html, /<option value="#123abc" selected>現在の色<\/option>/);
  assert.doesNotMatch(html, /type="color"/);
});

test('delete undo is a tappable action and does not pass through the list', () => {
  const start = app.indexOf('function offerUndo(');
  const end = app.indexOf('\nfunction addUnifiedTag', start);
  assert.ok(start >= 0 && end > start);
  const classes = new Set();
  const element = {
    classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)) },
    replaceChildren(child) { this.children = [child]; },
    appendChild(child) { this.children.push(child); },
  };
  let restored = 0;
  let rerenders = 0;
  let prevented = 0;
  const context = {
    $: () => element,
    document: { createElement: () => ({}) },
    toast: () => {},
    render: () => rerenders++,
    clearTimeout: () => {},
    setTimeout: () => 1,
  };
  runInNewContext(`${app.slice(start, end)}\nglobalThis.runUndo=offerUndo;`, context);
  context.runUndo('一覧から削除しました', () => { restored++; return true; });
  assert.ok(classes.has('has-undo'));
  assert.equal(element.children[1].textContent, '取り消す');
  element.children[1].onclick({ preventDefault() { prevented++; }, stopPropagation() { prevented++; } });
  assert.equal(restored, 1);
  assert.equal(rerenders, 1);
  assert.equal(prevented, 2);
  assert.match(styles, /\.toast\.has-undo\{[^}]*pointer-events:auto/);
});
