const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const fixtures = count => Array.from({ length: count }, (_, index) => ({
  id: `minimum-${index + 1}`,
  title: `布局测试 ${index + 1}`,
  url: `https://example.org/minimum/${index + 1}`,
  desc: '少量收藏应保持正常卡片尺寸',
  category: '单个分类',
  icon: 'favicon.ico'
}));

async function seed(page, count, settings = {}, fileEntry) {
  const initialize = ({ bookmarks, settings }) => {
    if (localStorage.getItem('__minimum_grid_seeded')) return;
    localStorage.clear();
    localStorage.setItem('my_nav_v2', JSON.stringify(bookmarks));
    for (const [key, value] of Object.entries(settings)) localStorage.setItem(key, value);
    localStorage.setItem('__minimum_grid_seeded', 'yes');
  };
  const data = { bookmarks: fixtures(count), settings };
  if (fileEntry) {
    // Seed a committed file document once; early reload hooks can observe
    // empty file storage and would then overwrite user changes with fixtures.
    await page.goto(fileEntry);
    await page.evaluate(initialize, data);
  } else {
    await page.addInitScript(initialize, data);
  }
}

async function layout(page) {
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(animation =>
      Number.isFinite(animation.effect?.getComputedTiming().endTime)
    ).map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  return page.locator('#bookmarksGrid').evaluate(grid => {
    const style = getComputedStyle(grid);
    const card = grid.querySelector('.bookmark-card').getBoundingClientRect();
    const box = grid.getBoundingClientRect();
    const category = document.querySelector('.cat-chip[data-category="单个分类"]').getBoundingClientRect();
    return {
      columns: style.gridTemplateColumns.split(/\s+/).length,
      rows: style.gridTemplateRows.split(/\s+/).length,
      rowHeights: style.gridTemplateRows.split(/\s+/).map(parseFloat),
      card: { width: card.width, height: card.height, left: card.left, right: card.right, top: card.top, bottom: card.bottom },
      category: { width: category.width, height: category.height },
      grid: { width: box.width, height: box.height, bottom: box.bottom, scrollHeight: grid.scrollHeight },
      viewport: { width: innerWidth, height: innerHeight },
      pageSize: Number(grid.dataset.pageSize),
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      pagerBottom: document.getElementById('pagination').getBoundingClientRect().bottom
    };
  });
}

function assertCompact(snapshot, { desktop = true } = {}) {
  expect(snapshot.card.height).toBe(94);
  expect(snapshot.rowHeights.every(height => height === 94)).toBe(true);
  expect(snapshot.rows * snapshot.columns).toBe(snapshot.pageSize);
  expect(snapshot.documentWidth).toBeLessThanOrEqual(snapshot.viewport.width + 1);
  expect(snapshot.card.right).toBeLessThanOrEqual(snapshot.viewport.width + 1);
  expect(snapshot.category.height).toBeLessThan(60);
  if (desktop) {
    expect(snapshot.columns).toBeGreaterThanOrEqual(4);
    expect(snapshot.rows).toBeGreaterThanOrEqual(4);
    expect(snapshot.card.width).toBeLessThan(snapshot.grid.width / 2);
    expect(snapshot.grid.scrollHeight).toBeLessThanOrEqual(snapshot.grid.height + 1);
    expect(snapshot.documentHeight).toBeLessThanOrEqual(snapshot.viewport.height + 1);
    expect(snapshot.pagerBottom).toBeLessThanOrEqual(snapshot.viewport.height + 1);
  }
}

async function capture(page, name) {
  await expect(page.locator('.favicon .fa-spinner')).toHaveCount(0);
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync(`artifacts/${name}.json`, JSON.stringify(await layout(page), null, 2));
  await page.screenshot({ path: `artifacts/${name}.png`, fullPage: false, animations: 'disabled' });
}

for (const count of [1, 3]) {
  test(`${count} bookmarks keep full desktop grid slots and compact category buttons`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await seed(page, count);
    await page.goto('/');
    await expect(page.locator('.bookmark-card')).toHaveCount(count);
    const before = await layout(page);
    assertCompact(before);
    expect(before.columns).toBe(4);
    await capture(page, `minimum-grid-${count}-bookmarks`);
    await page.locator('.cat-chip[data-category="单个分类"]').click();
    const category = await layout(page);
    expect(category.card.width).toBe(before.card.width);
    expect(category.card.height).toBe(before.card.height);
    expect(category.rows).toBe(before.rows);
  });
}

test('full page, one-item tail and one search result share identical card and track geometry', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await seed(page, 1);
  await page.goto('/');
  const single = await layout(page);
  const count = single.pageSize + 1;
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#importFile').setInputFiles({
    name: 'minimum-grid-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixtures(count)))
  });
  await expect(page.locator('.bookmark-card')).toHaveCount(single.pageSize);
  const full = await layout(page);
  assertCompact(full);
  await capture(page, 'minimum-grid-full-page');
  await page.locator('#nextPage').click();
  await expect(page.locator('.bookmark-card')).toHaveCount(1);
  const tail = await layout(page);
  assertCompact(tail);
  await capture(page, 'minimum-grid-one-item-tail');
  await page.getByRole('searchbox').fill(`https://example.org/minimum/${count}`);
  await expect(page.locator('.bookmark-card')).toHaveCount(1);
  const search = await layout(page);
  assertCompact(search);
  for (const snapshot of [full, tail, search]) {
    expect(snapshot.card.width).toBe(single.card.width);
    expect(snapshot.card.height).toBe(single.card.height);
    expect(snapshot.columns).toBe(single.columns);
    expect(snapshot.rows).toBe(single.rows);
  }
  await page.getByRole('searchbox').fill('');
  await expect(page.locator('.bookmark-card')).toHaveCount(single.pageSize);
});

for (const width of [390, 320]) {
  test(`one bookmark at ${width}px keeps its height without forcing desktop slots or horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page, 1, { nav_columns: '6' });
    await page.goto('/');
    const narrow = await layout(page);
    assertCompact(narrow, { desktop: false });
    expect(narrow.rows).toBe(1);
    expect(narrow.columns).toBe(width === 390 ? 2 : 1);
    await capture(page, `minimum-grid-narrow-${width}`);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const wide = await layout(page);
    assertCompact(wide);
    expect(wide.columns).toBe(6);
    expect(await page.evaluate(() => localStorage.getItem('nav_columns'))).toBe('6');
  });
}

test('file preview keeps single-card geometry and column preference across reload', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const entry = path.resolve(process.env.BOOKMARKS_PREVIEW_DIR || '.', 'index.html');
  const fileEntry = pathToFileURL(entry).href;
  await seed(page, 1, { nav_columns: '3' }, fileEntry);
  await page.goto(fileEntry);
  const before = await layout(page);
  assertCompact(before);
  expect(before.columns).toBe(4);
  await page.locator('#colsIncrease').click();
  await expect(page.locator('#colsDisplay')).toHaveText('5列');
  await page.reload();
  const after = await layout(page);
  assertCompact(after);
  expect(after.columns).toBe(5);
  expect(after.card.height).toBe(before.card.height);
  expect(await page.evaluate(() => localStorage.getItem('nav_columns'))).toBe('5');
  await capture(page, 'minimum-grid-file-preview');
});

for (const mode of ['HTTP', 'file']) {
  test(`${mode} opens ready for direct keyboard search and never steals form focus on resize`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const entry = path.resolve(process.env.BOOKMARKS_PREVIEW_DIR || '.', 'index.html');
    const url = mode === 'file' ? pathToFileURL(entry).href : '/';
    await seed(page, 3, {}, mode === 'file' ? url : undefined);
    await page.goto(url);
    await expect(page.locator('#searchInput')).toBeFocused();
    await page.keyboard.type('minimum/2');
    await expect(page.locator('.bookmark-card')).toHaveCount(1);
    await expect(page.locator('.bookmark-card')).toHaveAttribute('data-id', 'minimum-2');
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await expect(page.locator('.bookmark-card')).toHaveCount(3);
    await page.locator('#addBtn').click();
    await expect(page.locator('#siteTitle')).toBeFocused();
    await page.setViewportSize({ width: 1400, height: 800 });
    await expect(page.locator('#siteTitle')).toBeFocused();
    await page.keyboard.type('form typing stays here');
    await expect(page.locator('#siteTitle')).toHaveValue('form typing stays here');
    await expect(page.locator('#searchInput')).toHaveValue('');
    await page.locator('#modalCancelBtn').click();
    await expect(page.locator('#addBtn')).toBeFocused();
    await page.reload();
    await expect(page.locator('#searchInput')).toBeFocused();
    await page.keyboard.type('minimum/3');
    await expect(page.locator('.bookmark-card')).toHaveCount(1);
    await expect(page.locator('.bookmark-card')).toHaveAttribute('data-id', 'minimum-3');
    await capture(page, `minimum-grid-${mode.toLowerCase()}-direct-search`);
  });
}

test('list row height and empty states remain independent of reserved grid slots', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await seed(page, 3);
  await page.goto('/');
  await page.locator('#listViewBtn').click();
  const list = await layout(page);
  expect(list.columns).toBe(1);
  expect(list.card.height).toBe(68);
  expect(list.rowHeights.every(height => height === 68)).toBe(true);
  expect(list.rows).toBe(list.pageSize);
  await page.getByRole('searchbox').fill('no matching result');
  await expect(page.locator('.bookmark-card')).toHaveCount(0);
  await expect(page.locator('.no-results')).toBeVisible();
  await expect(page.locator('#pagination')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(768);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#importFile').setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from('[]') });
  await expect(page.locator('#bookmarksGrid')).toBeHidden();
  await expect(page.locator('#emptyState')).toBeVisible();
  await expect(page.locator('#pagination')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(768);
});
