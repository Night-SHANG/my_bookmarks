const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const read = path => fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';

test('UI styles and typography no longer depend on remote font services', () => {
  const links = html.match(/<link\b[^>]*>/gi) || [];
  const styles = links.filter(link => /rel=["']stylesheet["']/.test(link));
  assert.ok(styles.length > 0);
  for (const link of styles) assert.doesNotMatch(link, /href=["'](?:https?:)?\/\//);
  assert.doesNotMatch(html, /fonts\.googleapis|cdnjs\.cloudflare/);
});

test('local icon and visual layers are linked and exist', () => {
  for (const file of ['icons.css', 'polish.css']) {
    assert.ok(html.includes('href="' + file + '"'), file + ' must be linked');
    assert.ok(read(file).length > 100, file + ' must not be empty');
  }
});

test('all fixed and dynamic UI icons have embedded SVG masks', () => {
  const names = new Set((html + app).match(/fa-[a-z0-9-]+/g));
  for (const name of ['code','book-open','play-circle','folder']) names.add('fa-' + name);
  names.delete('fa-pulse');
  const css = read('icons.css');
  for (const name of names) assert.ok(css.includes('.' + name + ' '), 'missing icon: ' + name);
  const masks = [...css.matchAll(/data:image\/svg\+xml,([^"\s)]+)/g)];
  assert.ok(masks.length >= names.size);
  for (const [, value] of masks) {
    const svg = decodeURIComponent(value);
    assert.match(svg, /<svg[^>]+viewBox=/);
    assert.match(svg, /<path\b/);
    assert.doesNotMatch(svg, /<script|onload=|<foreignObject/i);
  }
  assert.doesNotMatch(css, /@font-face|\.woff|\.ttf/);
});

test('visual layer covers dark mode, keyboard focus and reduced motion', () => {
  const css = read('polish.css');
  for (const token of ['[data-theme="dark"]', ':focus-visible', 'prefers-reduced-motion', '.cat-count', '.favicon', '.modal-content']) {
    assert.ok(css.includes(token), 'missing visual state: ' + token);
  }
  assert.match(css, /system-ui/);
});

test('all event-bound IDs still exist once; search and persistence code are retained', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'duplicate DOM IDs');
  for (const [, id] of app.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) {
    assert.ok(ids.includes(id), 'missing event target: ' + id);
  }
  assert.match(app, /searchInput\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /const STORAGE_KEY = 'my_nav_v2'/);
  assert.match(app, /Math\.max\(4, Math\.min\(10, saved\)\)/);
  const baseCss = read('style.css');
  assert.match(baseCss, /--card-height:\s*94px/);
  assert.match(baseCss, /grid-template-rows:\s*repeat\(var\(--rows, 4\), var\(--card-height\)\)/);
});

test('distributed SVG subset keeps attribution and does not add fonts', () => {
  const license = read('THIRD_PARTY_NOTICES.md');
  assert.match(license, /Font Awesome Free/);
  assert.match(license, /CC BY 4\.0/);
  assert.match(license, /Fonticons/);
});
