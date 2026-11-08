const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// 执行应用中的真实列数函数；这里只替代布局测量和浏览器存储，不冒充浏览器验收。
const source = fs.readFileSync('app.js', 'utf8');
const start = source.indexOf('function getColumns()');
const end = source.indexOf('function measurePageSize()');
assert.ok(start >= 0 && end > start);
function setup(saved = null, width = 5000) {
  let stored = saved, writable = true, list = false, renderCount = 0;
  const properties = {}, attrs = {}, errors = [];
  const controls = {colsIncrease: {}, colsDecrease: {}};
  const grid = {clientWidth: width, classList: {contains: () => list}};
  const context = vm.createContext({
    COLUMNS_KEY: 'nav_columns', initialized: true, bookmarksGrid: grid,
    colsDisplay: {setAttribute: (k, v) => attrs[k] = v},
    document: {documentElement: {style: {setProperty: (k,v) => properties[k] = v}}, getElementById: id => controls[id]},
    window: {innerWidth: width + 272},
    getComputedStyle: () => ({columnGap: '12px'}),
    readSetting: (_key, fallback) => stored ?? fallback,
    writeSetting: (_key, value) => {if (!writable) return false; stored = String(value); return true;},
    renderBookmarks: () => renderCount++, showToast: message => errors.push(message)
  });
  vm.runInContext(source.slice(start, end), context);
  return {context, controls, attrs, properties, errors,
    get: () => context.getColumns(), set: n => context.setColumns(n), layout: () => context.applyEffectiveColumns(),
    stored: () => stored, renders: () => renderCount,
    resize: w => {grid.clientWidth = w; context.window.innerWidth = w + 272;},
    list: value => list = value, failWrites: () => writable = false};
}

for (const value of [11, 16, 32, 100, 1000000000000]) {
  test('reads and saves ' + value + ' columns without a product ceiling', () => {
    const s = setup(String(value));
    assert.equal(s.get(), value);
    s.set(value + 1);
    assert.equal(s.stored(), String(value + 1));
    assert.equal(s.get(), value + 1);
  });
}

test('increase remains available at ten when the viewport fits more', () => {
  const s = setup('10');
  assert.equal(s.layout(), 10);
  assert.equal(s.controls.colsIncrease.disabled, false);
  s.set(s.layout() + 1);
  assert.equal(s.layout(), 11);
});

test('narrow layout does not overwrite a preference above ten and restores it', () => {
  const s = setup('16');
  assert.equal(s.layout(), 16);
  s.resize(1000);
  assert.equal(s.layout(), 5);
  assert.equal(s.stored(), '16');
  assert.match(s.attrs['aria-label'], /16/);
  s.resize(5000);
  assert.equal(s.layout(), 16);
  assert.equal(s.stored(), '16');
});

test('only real width capacity disables increase, not a constant ceiling', () => {
  const s = setup('16', 1908);
  assert.equal(s.layout(), 10);
  assert.equal(s.controls.colsIncrease.disabled, true);
  assert.equal(s.stored(), '16');
  s.resize(2100);
  assert.equal(s.layout(), 11);
});

test('list mode and returning to grid retain the preference', () => {
  const s = setup('24');
  s.list(true);
  assert.equal(s.layout(), 1);
  assert.equal(s.controls.colsIncrease.disabled, true);
  assert.equal(s.controls.colsDecrease.disabled, true);
  assert.equal(s.stored(), '24');
  s.list(false);
  assert.equal(s.layout(), 24);
});

test('defaults and legacy lower values remain four without writing storage', () => {
  for (const value of [null, '', '0', '-1', '3', 'NaN', 'Infinity']) {
    const s = setup(value);
    assert.equal(s.get(), 4);
    s.layout();
    assert.equal(s.stored(), value);
  }
});

test('partially numeric, fractional and imprecise stored values are not truncated', () => {
  for (const value of ['12x', '12.5', '9007199254740992']) {
    const s = setup(value);
    assert.equal(s.get(), 4);
    assert.equal(s.stored(), value);
  }
});

test('invalid changes never save or render a broken grid', () => {
  for (const value of [NaN, Infinity, 4.5, '16', Number.MAX_SAFE_INTEGER + 1]) {
    const s = setup('16');
    s.set(value);
    assert.equal(s.stored(), '16');
    assert.equal(s.renders(), 0);
    assert.equal(s.errors.length, 1);
  }
});

test('storage failure retains old preference and leaves layout unchanged', () => {
  const s = setup('16');
  s.layout();
  s.failWrites();
  s.set(20);
  assert.equal(s.stored(), '16');
  assert.equal(s.properties['--columns'], 16);
  assert.equal(s.renders(), 0);
});

test('extreme preferences have width-bounded work, not requested-column loops', () => {
  const s = setup(String(Number.MAX_SAFE_INTEGER), 1000);
  for (let i=0; i<10000; i++) assert.equal(s.layout(), 5);
  assert.equal(s.stored(), String(Number.MAX_SAFE_INTEGER));
});

test('remove redundant slogans but retain search and form accessible names', () => {
  const html = fs.readFileSync('index.html','utf8');
  for (const text of ['有序收藏 · 随手打开','常用网站，集中管理与快速访问。','拖动调整顺序','视觉优化预览']) assert.ok(!html.includes(text));
  assert.match(html, /id="searchInput"[^>]*aria-label="[^"]+"/);
  for (const id of ['siteTitle','siteUrl','siteCategory','siteIcon','siteDesc']) assert.ok(html.includes('for="'+id+'"'));
  assert.ok(html.includes('id="storageWarning"'));
  assert.ok(html.includes('恢复上次备份'));
});
