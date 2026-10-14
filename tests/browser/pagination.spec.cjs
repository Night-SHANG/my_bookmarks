const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const gridSelector = '#bookmarksGrid';
const fileEntry = pathToFileURL(path.resolve(__dirname, '../../index.html')).href;
const fixture = count => Array.from({ length: count }, (_, index) => ({
  id: `pagination-${String(index + 1).padStart(3, '0')}`,
  title: `分页收藏 ${String(index + 1).padStart(3, '0')}`,
  url: `https://example.org/bookmark/${index + 1}`,
  desc: '仅用于分页回归的本地测试收藏',
  category: ['开发测试', '设计测试', '阅读测试'][index % 3],
  // A bundled icon keeps fixtures deterministic without replacing the real UI.
  icon: 'favicon.ico'
}));

async function seed(page, bookmarks, settings = {}) {
  await page.addInitScript(({ bookmarks, settings }) => {
    // addInitScript also runs on reload. Seed only once so persistence tests do
    // not accidentally restore their input and conceal failed writes.
    if (localStorage.getItem('__pagination_fixture_seeded') === 'yes') return;
    localStorage.clear();
    localStorage.setItem('my_nav_v2', JSON.stringify(bookmarks));
    for (const [key, value] of Object.entries(settings)) localStorage.setItem(key, value);
    localStorage.setItem('__pagination_fixture_seeded', 'yes');
  }, { bookmarks, settings });
}

async function settled(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const animations = document.getAnimations().filter(animation => {
      const timing = animation.effect?.getComputedTiming();
      return timing && Number.isFinite(timing.endTime);
    });
    await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function ready(page) {
  await expect(page.locator(gridSelector)).toHaveAttribute('data-page', /^\d+$/);
  await expect(page.locator(gridSelector)).toHaveAttribute('data-page-size', /^[1-9]\d*$/);
  await expect(page.locator(gridSelector)).toHaveAttribute('data-total-pages', /^[1-9]\d*$/);
  await settled(page);
}

async function paginationState(page) {
  return page.locator(gridSelector).evaluate(grid => ({
    page: Number(grid.dataset.page),
    pageSize: Number(grid.dataset.pageSize),
    totalPages: Number(grid.dataset.totalPages)
  }));
}

async function visibleIds(page) {
  return page.locator(`${gridSelector} .bookmark-card`).evaluateAll(cards => cards.map(card => card.dataset.id));
}

async function storedBookmarks(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('my_nav_v2')));
}

async function firstPage(page) {
  let state = await paginationState(page);
  while (state.page > 1) {
    await page.locator('#prevPage').click();
    await expect(page.locator(gridSelector)).toHaveAttribute('data-page', String(state.page - 1));
    state = await paginationState(page);
  }
  await settled(page);
}

async function lastPage(page) {
  let state = await paginationState(page);
  while (state.page < state.totalPages) {
    await page.locator('#nextPage').click();
    await expect(page.locator(gridSelector)).toHaveAttribute('data-page', String(state.page + 1));
    state = await paginationState(page);
  }
  await settled(page);
}

async function screenshot(page, name) {
  await page.mouse.move(0, 0);
  await settled(page);
  await expect(page.locator('.favicon .fa-spinner')).toHaveCount(0);
  fs.mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: `artifacts/${name}.png`, fullPage: false, animations: 'disabled' });
}

async function desktopFits(page) {
  // Hover lifts cards by 2px; measure their resting layout consistently.
  await page.mouse.move(0, 0);
  await settled(page);
  const layout = await page.evaluate(() => {
    const grid = document.getElementById('bookmarksGrid');
    const style = getComputedStyle(grid);
    const cards = [...grid.querySelectorAll('.bookmark-card')];
    const box = grid.getBoundingClientRect();
    const cardHeight = cards[0]?.getBoundingClientRect().height || 0;
    const gap = parseFloat(style.rowGap) || 0;
    const columns = style.gridTemplateColumns.trim().split(/\s+/).length;
    const contentHeight = grid.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const rows = Math.max(1, Math.floor((contentHeight + gap + 0.5) / (cardHeight + gap)));
    const pager = document.getElementById('pagination').getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      body: { width: document.body.scrollWidth, height: document.body.scrollHeight },
      grid: { width: grid.clientWidth, height: grid.clientHeight, scrollWidth: grid.scrollWidth, scrollHeight: grid.scrollHeight, top: box.top, bottom: box.bottom },
      cards: cards.map(card => {
        const rect = card.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
      }),
      pager: { top: pager.top, bottom: pager.bottom },
      measuredCapacity: rows * columns
    };
  });
  expect(layout.document.width, 'document must not overflow horizontally').toBeLessThanOrEqual(layout.viewport.width + 1);
  expect(layout.document.height, 'desktop must fit one screen').toBeLessThanOrEqual(layout.viewport.height + 1);
  expect(layout.body.width).toBeLessThanOrEqual(layout.viewport.width + 1);
  expect(layout.body.height).toBeLessThanOrEqual(layout.viewport.height + 1);
  expect(layout.grid.scrollWidth, 'the grid must not hide horizontal overflow').toBeLessThanOrEqual(layout.grid.width + 1);
  expect(layout.grid.scrollHeight, 'the grid must not require a vertical scrollbar').toBeLessThanOrEqual(layout.grid.height + 1);
  expect(layout.pager.bottom, 'pagination must remain inside the viewport').toBeLessThanOrEqual(layout.viewport.height + 1);
  for (const card of layout.cards) {
    expect(card.top).toBeGreaterThanOrEqual(layout.grid.top - 1);
    expect(card.bottom, 'no card may be clipped under pagination').toBeLessThanOrEqual(layout.pager.top + 1);
    expect(card.bottom).toBeLessThanOrEqual(layout.grid.bottom + 1);
    expect(card.left).toBeGreaterThanOrEqual(-1);
    expect(card.right).toBeLessThanOrEqual(layout.viewport.width + 1);
  }
  await expect(page.locator('#colsDisplay')).toHaveText(`${await page.locator(gridSelector).evaluate(grid=>getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length)}列`);
  expect((await paginationState(page)).pageSize, 'capacity must come from the actual rendered grid and card height').toBe(layout.measuredCapacity);
}

async function assertPage(page, expectedBookmarks, { desktop = false } = {}) {
  await settled(page);
  const state = await paginationState(page);
  expect(state.page).toBeGreaterThanOrEqual(1);
  expect(state.totalPages).toBe(Math.max(1, Math.ceil(expectedBookmarks.length / state.pageSize)));
  expect(state.page).toBeLessThanOrEqual(state.totalPages);
  const start = (state.page - 1) * state.pageSize;
  expect(await visibleIds(page)).toEqual(expectedBookmarks.slice(start, start + state.pageSize).map(bookmark => bookmark.id));
  await expect(page.locator('#pagination')).toBeVisible();
  await expect(page.locator('#pageSummary')).toContainText(String(expectedBookmarks.length));
  await expect(page.locator('#pageNumbers [aria-current="page"]')).toHaveText(String(state.page));
  if (state.page === 1) await expect(page.locator('#prevPage')).toBeDisabled();
  else await expect(page.locator('#prevPage')).toBeEnabled();
  if (state.page === state.totalPages) await expect(page.locator('#nextPage')).toBeDisabled();
  else await expect(page.locator('#nextPage')).toBeEnabled();
  if (desktop) await desktopFits(page);
  return state;
}

async function visitEveryPage(page, expectedBookmarks, options) {
  await firstPage(page);
  const seen = [];
  let state;
  do {
    state = await assertPage(page, expectedBookmarks, options);
    seen.push(...await visibleIds(page));
    if (state.page === state.totalPages) break;
    await page.locator('#nextPage').click();
    await expect(page.locator(gridSelector)).toHaveAttribute('data-page', String(state.page + 1));
  } while (seen.length <= expectedBookmarks.length);
  expect(seen).toEqual(expectedBookmarks.map(bookmark => bookmark.id));
  expect(new Set(seen).size, 'each bookmark must appear exactly once across pages').toBe(expectedBookmarks.length);
}

async function managementReachable(page, { mayScroll = false } = {}) {
  for (const selector of ['#addBtn', '#dataPanelBtn', '#appearanceBtn', '#colsDecrease', '#colsIncrease', '#gridViewBtn', '#listViewBtn']) {
    const control = page.locator(selector);
    if (mayScroll) await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport();
    if (await control.isEnabled()) await control.click({ trial: true });
  }
  const card = page.locator('.bookmark-card').last();
  if (mayScroll) await card.scrollIntoViewIfNeeded();
  await card.hover();
  const more = card.locator('[aria-expanded]');
  await expect(more).toBeInViewport();
  await more.click();
  await expect(card.locator('.edit-btn')).toBeInViewport();
  await expect(card.locator('.delete-btn')).toBeInViewport();
  await card.locator('.delete-btn').click({ trial: true });
  await card.locator('.edit-btn').click();
  await expect(page.locator('#siteTitle')).toBeVisible();
  await page.locator('#modalCancelBtn').click();
  await expect(page.locator('#modal')).not.toHaveClass(/show/);
  await expect(more).toBeFocused();
}

for (const desktop of [
  { width: 1366, height: 768, count: 36, screenshot: 'pagination-desktop1366' },
  { width: 1920, height: 1080, count: 45, screenshot: 'pagination-desktop1920' }
]) {
  test(`one-screen pagination at ${desktop.width}×${desktop.height} exposes every fixture exactly once`, async ({ page }) => {
    const bookmarks = fixture(desktop.count);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: desktop.width, height: desktop.height });
    await seed(page, bookmarks);
    await page.goto('/');
    await ready(page);
    await expect(page.locator('#colsDisplay')).toHaveText('4列');
    expect(await page.locator('#colsIncrease').evaluate(element => Boolean(element.closest('header, .collection-heading')))).toBe(true);
    expect(await page.locator('#appearancePanel #colsIncrease').count()).toBe(0);
    expect((await paginationState(page)).totalPages).toBeGreaterThan(1);
    await assertPage(page, bookmarks, { desktop: true });
    await screenshot(page, desktop.screenshot);
    await managementReachable(page);
    await page.locator('#pageNumbers button').filter({ hasText: /^2$/ }).click();
    await expect(page.locator(gridSelector)).toHaveAttribute('data-page', '2');
    await visitEveryPage(page, bookmarks, { desktop: true });
    await managementReachable(page);
    expect(await storedBookmarks(page)).toEqual(bookmarks);
    expect(errors).toEqual([]);
  });
}

test('search, cleared search, and category changes reset to the first result page', async ({ page }) => {
  const bookmarks = fixture(45);
  await page.setViewportSize({ width: 1366, height: 768 });
  await seed(page, bookmarks);
  await page.goto('/');
  await ready(page);
  await lastPage(page);
  await page.locator('#searchInput').fill('分页收藏');
  await expect(page.locator(gridSelector)).toHaveAttribute('data-page', '1');
  await assertPage(page, bookmarks, { desktop: true });
  await lastPage(page);
  await page.locator('#searchInput').fill('');
  await expect(page.locator(gridSelector)).toHaveAttribute('data-page', '1');
  await lastPage(page);
  await page.locator('.cat-chip[data-category="开发测试"]').click();
  await expect(page.locator(gridSelector)).toHaveAttribute('data-page', '1');
  await visitEveryPage(page, bookmarks.filter(bookmark => bookmark.category === '开发测试'), { desktop: true });
  await page.locator('.cat-chip[data-category="全部"]').click();
  await expect(page.locator(gridSelector)).toHaveAttribute('data-page', '1');
  await page.locator('#searchInput').fill('分页收藏 045');
  await assertPage(page, [bookmarks[44]], { desktop: true });
  await page.locator('#searchInput').fill('不存在的分页测试收藏');
  await expect(page.locator('.bookmark-card')).toHaveCount(0);
  await expect(page.locator('.no-results')).toBeVisible();
  await page.locator('#searchInput').fill('');
  await expect(page.locator(gridSelector)).toHaveAttribute('data-page', '1');
  await assertPage(page, bookmarks, { desktop: true });
  expect(await storedBookmarks(page)).toEqual(bookmarks);
});

test('deleting the last item on the last page clamps to the preceding page', async ({ page }) => {
  let bookmarks = fixture(45);
  await page.setViewportSize({ width: 1366, height: 768 });
  await seed(page, bookmarks);
  await page.goto('/');
  await ready(page);
  await lastPage(page);
  const last = await paginationState(page);
  expect(last.totalPages).toBeGreaterThan(1);
  // Reduce the final page to one item using the real management UI. Capacity is
  // measured at runtime rather than assuming a fixed number of cards per page.
  while ((await visibleIds(page)).length > 1) {
    const card = page.locator('.bookmark-card').first();
    const id = await card.getAttribute('data-id');
    await card.locator('[aria-expanded]').click();
    page.once('dialog', dialog => dialog.accept());
    await card.locator('.delete-btn').click();
    bookmarks = bookmarks.filter(bookmark => bookmark.id !== id);
    await expect.poll(async () => (await storedBookmarks(page)).length).toBe(bookmarks.length);
    await assertPage(page, bookmarks, { desktop: true });
  }
  const remainingId = (await visibleIds(page))[0];
  const card = page.locator('.bookmark-card');
  await card.locator('[aria-expanded]').click();
  page.once('dialog', dialog => dialog.accept());
  await card.locator('.delete-btn').click();
  bookmarks = bookmarks.filter(bookmark => bookmark.id !== remainingId);
  await expect(page.locator(gridSelector)).toHaveAttribute('data-page', String(last.totalPages - 1));
  await assertPage(page, bookmarks, { desktop: true });
  expect(await storedBookmarks(page)).toEqual(bookmarks);
  await page.reload();
  await ready(page);
  await visitEveryPage(page, bookmarks, { desktop: true });
});

test('resize and column preference changes clamp the current page without losing bookmarks', async ({ page }) => {
  const bookmarks = fixture(45);
  await page.setViewportSize({ width: 1366, height: 768 });
  await seed(page, bookmarks, { nav_columns: '3' });
  await page.goto('/');
  await ready(page);
  await expect(page.locator('#colsDisplay')).toHaveText('4列');
  await lastPage(page);
  let previous = await paginationState(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(async () => (await paginationState(page)).pageSize).toBeGreaterThan(previous.pageSize);
  let current = await assertPage(page, bookmarks, { desktop: true });
  expect(current.page).toBe(Math.min(previous.page, current.totalPages));
  for (let columns = 5; columns <= 8; columns += 1) {
    const before = await paginationState(page);
    await page.locator('#colsIncrease').click();
    await expect(page.locator('#colsDisplay')).toHaveText(`${columns}列`);
    current = await assertPage(page, bookmarks, { desktop: true });
    expect(current.pageSize).toBeGreaterThan(before.pageSize);
  }
  await expect(page.locator('#colsIncrease')).toBeDisabled();
  await page.setViewportSize({ width: 2400, height: 1080 });
  await ready(page);
  for (let columns = 9; columns <= 10; columns += 1) {
    previous = current;
    await page.locator('#colsIncrease').click();
    await expect(page.locator('#colsDisplay')).toHaveText(`${columns}列`);
    current = await assertPage(page, bookmarks, { desktop: true });
    expect(current.page).toBe(Math.min(previous.page, current.totalPages));
  }
  if (await page.locator('#colsIncrease').isEnabled()) await page.locator('#colsIncrease').click();
  await expect(page.locator('#colsDisplay')).toHaveText('10列');
  expect(await page.evaluate(() => localStorage.getItem('nav_columns'))).toBe('10');
  await page.reload();
  await ready(page);
  await expect(page.locator('#colsDisplay')).toHaveText('10列');
  for (let columns = 9; columns >= 4; columns -= 1) {
    await page.locator('#colsDecrease').click();
    await expect(page.locator('#colsDisplay')).toHaveText(`${columns}列`);
    await assertPage(page, bookmarks, { desktop: true });
  }
  if (await page.locator('#colsDecrease').isEnabled()) await page.locator('#colsDecrease').click();
  await expect(page.locator('#colsDisplay')).toHaveText('4列');
  expect(await page.evaluate(() => localStorage.getItem('nav_columns'))).toBe('4');
  await page.setViewportSize({ width: 1366, height: 768 });
  await ready(page);
  await visitEveryPage(page, bookmarks, { desktop: true });
  expect(await storedBookmarks(page)).toEqual(bookmarks);
});

test('list view is independently paginated and remains one screen high', async ({ page }) => {
  const bookmarks = fixture(45);
  await page.setViewportSize({ width: 1366, height: 768 });
  await seed(page, bookmarks);
  await page.goto('/');
  await ready(page);
  await page.locator('#listViewBtn').click();
  await expect(page.locator(gridSelector)).toHaveClass(/list-view/);
  expect((await paginationState(page)).totalPages).toBeGreaterThan(1);
  await assertPage(page, bookmarks, { desktop: true });
  await screenshot(page, 'pagination-desktop-list');
  await visitEveryPage(page, bookmarks, { desktop: true });
  await managementReachable(page);
  await page.reload();
  await ready(page);
  await expect(page.locator(gridSelector)).toHaveClass(/list-view/);
  await assertPage(page, bookmarks, { desktop: true });
  expect(await storedBookmarks(page)).toEqual(bookmarks);
});

test('double-click file mode preserves add, edit, delete, custom accent, and saved columns across refresh', async ({ page }) => {
  const bookmarks = fixture(36);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await seed(page, bookmarks, { nav_columns: '6', nav_accent: '#4f46e5' });
  await page.goto(fileEntry);
  expect(new URL(page.url()).protocol).toBe('file:');
  await ready(page);
  const settingsPersist = async () => {
    await expect(page.locator('#colsDisplay')).toHaveText('5列');
    await expect(page.locator('#colsDisplay')).toHaveAttribute('title', /偏好6列/);
    await expect(page.locator('#colsIncrease')).toBeDisabled();
    expect(await page.evaluate(() => ({
      columns: localStorage.getItem('nav_columns'),
      accent: localStorage.getItem('nav_accent'),
      appliedAccent: document.documentElement.style.getPropertyValue('--accent').trim()
    }))).toEqual({ columns: '6', accent: '#4f46e5', appliedAccent: '#4f46e5' });
  };
  await settingsPersist();
  await assertPage(page, bookmarks, { desktop: true });
  await screenshot(page, 'pagination-file');
  await visitEveryPage(page, bookmarks, { desktop: true });
  await page.locator('#addBtn').click();
  await page.locator('#siteTitle').fill('本地文件新增收藏');
  await page.locator('#siteUrl').fill('https://example.org/file-mode-added');
  await page.locator('#siteCategory').fill('本地文件测试');
  await page.locator('#siteIcon').fill('');
  await page.locator('#siteDesc').fill('刷新后仍然保留');
  await page.locator('#modalSave').click();
  await expect(page.locator('#modal')).not.toHaveClass(/show/);
  await page.reload();
  await ready(page);
  await settingsPersist();
  let saved = await storedBookmarks(page);
  const added = saved.find(bookmark => bookmark.title === '本地文件新增收藏');
  expect(added).toBeTruthy();
  expect(saved.filter(bookmark => bookmark.id !== added.id)).toEqual(bookmarks);
  await page.locator('#searchInput').fill('本地文件新增收藏');
  const addedCard = page.locator(`.bookmark-card[data-id="${added.id}"]`);
  await expect(addedCard).toHaveCount(1);
  await addedCard.locator('[aria-expanded]').click();
  await addedCard.locator('.edit-btn').click();
  await page.locator('#siteTitle').fill('本地文件已修改收藏');
  await page.locator('#siteDesc').fill('修改也必须持久保存');
  await page.locator('#modalSave').click();
  await page.reload();
  await ready(page);
  await settingsPersist();
  saved = await storedBookmarks(page);
  expect(saved.find(bookmark => bookmark.id === added.id)).toMatchObject({ title: '本地文件已修改收藏', desc: '修改也必须持久保存' });
  expect(saved.filter(bookmark => bookmark.id !== added.id)).toEqual(bookmarks);
  await page.locator('#searchInput').fill('本地文件已修改收藏');
  await expect(addedCard).toHaveCount(1);
  await addedCard.locator('[aria-expanded]').click();
  page.once('dialog', dialog => dialog.accept());
  await addedCard.locator('.delete-btn').click();
  await page.reload();
  await ready(page);
  await settingsPersist();
  expect(await storedBookmarks(page)).toEqual(bookmarks);
  await visitEveryPage(page, bookmarks, { desktop: true });
  await page.locator('#colsDecrease').click();
  await expect(page.locator('#colsDisplay')).toHaveText('4列');
  expect(await page.evaluate(() => localStorage.getItem('nav_columns'))).toBe('4');
  await page.reload(); await ready(page);
  await expect(page.locator('#colsDisplay')).toHaveText('4列');
  await assertPage(page, bookmarks, { desktop: true });
  await screenshot(page, 'pagination-file-columns-adjusted');
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 1366, height: 320 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}×${viewport.height} fallback keeps every bookmark and management control reachable`, async ({ page }) => {
    const bookmarks = fixture(36);
    await page.setViewportSize(viewport);
    await seed(page, bookmarks);
    await page.goto('/');
    await ready(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
    if (viewport.width > 700) await expect(page.locator('.app')).toHaveClass(/compact-fallback/);
    // Short screens and phones may scroll naturally; they may not trap controls
    // in a clipped desktop-height container or lose off-page bookmarks.
    await visitEveryPage(page, bookmarks);
    await managementReachable(page, { mayScroll: true });
    await page.locator('#nextPage').scrollIntoViewIfNeeded();
    await expect(page.locator('#nextPage')).toBeInViewport();
    await page.locator('#prevPage').click();
    await assertPage(page, bookmarks);
    await page.locator('#addBtn').click();
    await expect(page.locator('#siteTitle')).toBeVisible();
    await page.locator('#modalCancelBtn').scrollIntoViewIfNeeded();
    await page.locator('#modalCancelBtn').click();
    await expect(page.locator('#modal')).not.toHaveClass(/show/);
    expect(await storedBookmarks(page)).toEqual(bookmarks);
  });
}
