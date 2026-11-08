/* ============================================
   网址导航 — 应用逻辑
   保持 localStorage 完全兼容旧版
   ============================================ */

// ========== 存储键名（与旧版完全一致） ==========
const STORAGE_KEY = 'my_nav_v2';
const CATEGORY_ORDER_KEY = 'category_order';
const FAVICON_CACHE_KEY = 'favicon_cache_v1';
const THEME_KEY = 'nav_theme';
const COLUMNS_KEY = 'nav_columns';
const ACCENT_KEY = 'nav_accent';

// ========== 默认数据 ==========
const DEFAULT_BOOKMARKS = [
    { id: genId(), title: '百度', url: 'https://www.baidu.com/', desc: '搜索引擎', category: '全部', icon: 'https://www.baidu.com/favicon.ico' }
];

// ========== 状态 ==========
let storageDamaged = false;
let bookmarks = load();
let currentCategory = '全部';
let currentEngine = 'baidu';
let searchQuery = '';
let currentPage = 1;
let totalPages = 1;
let pageSize = 1;
let initialized = false;

// ========== DOM 引用 ==========
const bookmarksGrid = document.getElementById('bookmarksGrid');
const categoryBar = document.getElementById('categoryBar');
const searchInput = document.getElementById('searchInput');
const emptyState = document.getElementById('emptyState');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const toastContainer = document.getElementById('toastContainer');
const colsDisplay = document.getElementById('colsDisplay');

const siteTitle = document.getElementById('siteTitle');
const siteUrl = document.getElementById('siteUrl');
const siteDesc = document.getElementById('siteDesc');
const siteCategory = document.getElementById('siteCategory');
const siteIcon = document.getElementById('siteIcon');

let modalMode = 'add';
let editingId = null;
let modalReturnFocus = null;
let activeUtilityPanel = null;
const utilityPanels = new Map([
    ['appearanceBtn', {button: document.getElementById('appearanceBtn'), panel: document.getElementById('appearancePanel')}],
    ['dataPanelBtn', {button: document.getElementById('dataPanelBtn'), panel: document.getElementById('dataPanel')}]
]);
let importReadVersion = 0;
let activeImportReader = null;

// ========== 工具函数 ==========

function genId() {
    return 'b_' + Math.random().toString(36).slice(2, 9);
}

function save(next = bookmarks) {
    if (storageDamaged) { showToast('原数据无法读取，请先导出原始数据后再导入修复文件', 'error'); return false; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); bookmarks = next; return true; }
    catch (e) { showToast('保存失败：浏览器存储不可用或空间不足，原收藏未改变', 'error'); return false; }
}
function readSetting(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch (e) { return fallback; }
}
function writeSetting(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) { showToast('设置无法保存，请检查浏览器存储权限', 'error'); return false; }
}
function isSafeUrl(value) {
    try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch (e) { return false; }
}
function validBookmarks(data) {
    return Array.isArray(data) && data.every(b => b && typeof b === 'object' && typeof b.title === 'string' && b.title.trim() && typeof b.url === 'string' && isSafeUrl(b.url) && ['desc','category','icon'].every(k => b[k] === undefined || typeof b[k] === 'string'));
}
function load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return DEFAULT_BOOKMARKS.slice();
        const parsed = JSON.parse(raw);
        if (!validBookmarks(parsed)) throw new Error('invalid data');
        return parsed.map(b => ({...b, id: b.id || genId()}));
    } catch (e) { storageDamaged = true; return []; }
}

// ========== 列数控制（最低偏好4列，无固定上限；窄屏按宽度适配） ==========

function getColumns() {
    const saved = Number(readSetting(COLUMNS_KEY, '4'));
    // 仅验证整数可精确表示，不把合法的大列数截断为产品预设上限。
    return Number.isSafeInteger(saved) && saved > 0 ? Math.max(4, saved) : 4;
}

function setColumns(n) {
    if (!Number.isSafeInteger(n)) {
        showToast('列数必须是有效整数', 'error');
        return false;
    }
    n = Math.max(4, n);
    // 先保存成功，再更新布局；失败时不改变界面与原偏好。
    if (!writeSetting(COLUMNS_KEY, n)) return false;
    applyEffectiveColumns();
    if (initialized) renderBookmarks();
    return true;
}

// Keep the saved preference; narrow windows may display fewer columns.
function applyEffectiveColumns() {
    const gridWidth = bookmarksGrid.clientWidth || window.innerWidth - 56;
    const style = getComputedStyle(bookmarksGrid);
    const gap = parseFloat(style.columnGap) || 12;
    const minCardWidth = window.innerWidth <= 700 ? 165 : 180;
    const maxFit = Math.floor((gridWidth + gap) / (minCardWidth + gap));
    const preference = getColumns();
    const listView = bookmarksGrid.classList.contains('list-view');
    const actual = listView ? 1 : Math.min(preference, Math.max(1, maxFit));
    document.documentElement.style.setProperty('--columns', actual);
    colsDisplay.textContent = actual + '列';
    const explanation = listView ? `列表固定1列；网格偏好${preference}列` : actual < preference ? `窗口宽度限制为${actual}列；保存偏好${preference}列，放宽窗口后恢复` : `当前${actual}列`;
    colsDisplay.title = explanation;
    colsDisplay.setAttribute('aria-label', explanation);
    document.getElementById('colsDecrease').disabled = listView || actual <= 4;
    document.getElementById('colsIncrease').disabled = listView || actual >= Math.max(1, maxFit);
    return actual;
}

function measurePageSize() {
    const columns = applyEffectiveColumns();
    const style = getComputedStyle(bookmarksGrid);
    const cardHeight = parseFloat(style.getPropertyValue('--card-height')) || (bookmarksGrid.classList.contains('list-view') ? 68 : 94);
    const gap = parseFloat(style.rowGap) || 12;
    // Reserve the viewport's row slots even for one result or a sparse last
    // page. Keep these tracks independent of the number of rendered cards.
    let rows = 1;
    // Natural-height fallback still paginates, one row at a time. Never derive
    // capacity from a grid whose own rendered content determines its height.
    const app = document.querySelector('.app');
    if (window.innerWidth > 700 && !app.classList.contains('compact-fallback')) {
        const height = bookmarksGrid.clientHeight;
        if (bookmarksGrid.clientWidth > 0 && height < cardHeight) {
            app.classList.add('compact-fallback');
        } else {
            const available = height || Math.max(cardHeight, window.innerHeight - 300);
            rows = Math.max(1, Math.floor((available + gap) / (cardHeight + gap)));
        }
    }
    bookmarksGrid.style.setProperty('--rows', rows);
    return columns * rows;
}

function renderPagination(total) {
    const nav = document.getElementById('pagination');
    if (!nav) return;
    nav.hidden = total === 0;
    document.getElementById('prevPage').disabled = currentPage <= 1;
    document.getElementById('nextPage').disabled = currentPage >= totalPages;
    document.getElementById('pageSummary').textContent = `共 ${total} 个站点 · 第 ${currentPage}/${totalPages} 页`;
    const numbers = document.getElementById('pageNumbers');
    numbers.replaceChildren();
    // Keep page navigation bounded even with thousands of bookmarks.
    const pages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])].filter(n => n >= 1 && n <= totalPages).sort((a,b) => a-b);
    let previous = 0;
    for (const page of pages) {
        if (previous && page > previous + 1) { const dots = document.createElement('span'); dots.textContent = '…'; dots.setAttribute('aria-hidden','true'); numbers.appendChild(dots); }
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = page; button.setAttribute('aria-label', `第 ${page} 页`);
        if (page === currentPage) { button.className = 'active'; button.setAttribute('aria-current','page'); }
        button.addEventListener('click', () => { currentPage = page; renderBookmarks(); numbers.querySelector('[aria-current="page"]')?.focus(); });
        numbers.appendChild(button); previous = page;
    }
    const status = document.getElementById('paginationStatus');
    if (status) status.textContent = `第 ${currentPage} 页，共 ${totalPages} 页，本页 ${Math.min(pageSize, Math.max(0, total - (currentPage - 1) * pageSize))} 项`;
}

function refreshPageLayout() {
    document.querySelector('.app').classList.remove('compact-fallback');
    applyEffectiveColumns();
    renderBookmarks();
}
window.addEventListener('resize', refreshPageLayout);

document.getElementById('colsIncrease').addEventListener('click', () => setColumns(applyEffectiveColumns() + 1));
document.getElementById('colsDecrease').addEventListener('click', () => setColumns(applyEffectiveColumns() - 1));

// ========== 主题色自定义 ==========

const DEFAULT_ACCENT = '#367454';

function initAccent() {
    const saved = readSetting(ACCENT_KEY, '');
    renderAccent(/^#[0-9a-f]{6}$/i.test(saved) ? saved : null);
}

// 读取只绘制；用户修改先保存，成功后才更新界面。
function renderAccent(color) {
    const style = document.documentElement.style;
    if (color) {
        style.setProperty('--accent', color);
        style.setProperty('--accent-hover', adjustBrightness(color, -20));
        style.setProperty('--accent-dim', hexToRgba(color, 0.08));
        style.setProperty('--text-on-accent', accentTextColor(color));
    } else {
        // 移除覆盖而不是写死浅色值，让深浅主题各自恢复默认。
        ['--accent', '--accent-hover', '--accent-dim', '--text-on-accent'].forEach(key => style.removeProperty(key));
    }
    const active = color || DEFAULT_ACCENT;
    updateColorDots(active);
    document.getElementById('customColor').value = active;
}

function applyAccent(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return false;
    if (!writeSetting(ACCENT_KEY, color)) { initAccent(); return false; }
    renderAccent(color);
    return true;
}

function resetAccent() {
    try { localStorage.removeItem(ACCENT_KEY); }
    catch (e) { showToast('主题色无法重置，请检查浏览器存储权限', 'error'); return false; }
    renderAccent(null);
    return true;
}

function updateColorDots(activeColor) {
    document.querySelectorAll('.color-dot').forEach(dot => {
        const active = dot.dataset.color.toLowerCase() === activeColor.toLowerCase();
        dot.classList.toggle('active', active);
        dot.setAttribute('aria-pressed', String(active));
    });
}

function accentTextColor(hex) {
    const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    return luminance > 0.179 ? '#000000' : '#ffffff';
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function adjustBrightness(hex, amount) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.max(0, Math.min(255, r + amount));
    g = Math.max(0, Math.min(255, g + amount));
    b = Math.max(0, Math.min(255, b + amount));
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

// 颜色选择器交互：外观面板直接展示色板，不再嵌套第二层开关。
document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => applyAccent(dot.dataset.color));
});
document.getElementById('customColor').addEventListener('input', e => applyAccent(e.target.value));
document.getElementById('resetAccent').addEventListener('click', resetAccent);

// ========== 辅助浮层 ==========

function positionUtilityPanel() {
    const entry = utilityPanels.get(activeUtilityPanel);
    if (!entry) return;
    const viewport = window.visualViewport;
    const width = viewport?.width || document.documentElement.clientWidth || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    const offsetX = viewport?.offsetLeft || 0;
    const offsetY = viewport?.offsetTop || 0;
    const margin = 12, gap = 10;
    const {button, panel} = entry;
    const anchor = button.getBoundingClientRect();
    if (anchor.bottom < offsetY || anchor.top > offsetY + height) { closeUtilityPanel(false); return; }
    panel.style.maxWidth = Math.max(0, width - margin * 2) + 'px';
    panel.style.maxHeight = Math.max(0, height - margin * 2) + 'px';
    const bounds = panel.getBoundingClientRect();
    let left = width > 700 ? anchor.right + gap : anchor.left;
    if (width > 700 && left + bounds.width > offsetX + width - margin) left = anchor.left - bounds.width - gap;
    let top = width > 700 ? anchor.bottom - bounds.height : anchor.bottom + gap;
    if (top + bounds.height > offsetY + height - margin) top = anchor.top - bounds.height - gap;
    panel.style.left = Math.max(offsetX + margin, Math.min(left, offsetX + width - bounds.width - margin)) + 'px';
    panel.style.top = Math.max(offsetY + margin, Math.min(top, offsetY + height - bounds.height - margin)) + 'px';
}

function closeUtilityPanel(restoreFocus = false) {
    const entry = utilityPanels.get(activeUtilityPanel);
    activeUtilityPanel = null;
    if (!entry) return;
    entry.panel.hidden = true;
    entry.button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) entry.button.focus({preventScroll: true});
}

function toggleUtilityPanel(buttonId) {
    const entry = utilityPanels.get(buttonId);
    if (!entry) return;
    if (activeUtilityPanel === buttonId) { closeUtilityPanel(true); return; }
    closeUtilityPanel(false);
    activeUtilityPanel = buttonId;
    entry.panel.hidden = false;
    entry.button.setAttribute('aria-expanded', 'true');
    positionUtilityPanel();
    (entry.panel.querySelector('.color-dot, #importBtn') || entry.panel.querySelector('button:not([disabled]), input:not([disabled])'))?.focus({preventScroll: true});
}

function handleUtilityDismiss(event) {
    const entry = utilityPanels.get(activeUtilityPanel);
    if (!entry || entry.panel.contains(event.target)) return;
    // 由触发器自身完成切换，避免外部关闭后又误判为重新打开。
    if ([...utilityPanels.values()].some(item => item.button.contains(event.target))) return;
    closeUtilityPanel(false);
}

function handleUtilityFocus(event) {
    handleUtilityDismiss(event);
}

function handleUtilityKeydown(event) {
    const entry = utilityPanels.get(activeUtilityPanel);
    if (!entry) return;
    if (event.key === 'Escape') { event.preventDefault(); closeUtilityPanel(true); return; }
    if (event.key !== 'Tab') return;
    const items = [...entry.panel.querySelectorAll('button:not([disabled]), input:not([disabled])')];
    if ((event.shiftKey && document.activeElement === items[0]) || (!event.shiftKey && document.activeElement === items.at(-1))) {
        // 非模态浮层不困住键盘：返回触发器后继续原页面的Tab顺序。
        closeUtilityPanel(true);
        if (event.shiftKey) event.preventDefault();
    }
}

for (const [id, entry] of utilityPanels) entry.button.addEventListener('click', () => toggleUtilityPanel(id));
document.querySelectorAll('[data-close-panel]').forEach(button => button.addEventListener('click', () => closeUtilityPanel(true)));
document.addEventListener('click', handleUtilityDismiss);
document.addEventListener('focusin', handleUtilityFocus);
document.addEventListener('keydown', handleUtilityKeydown);
window.addEventListener('resize', positionUtilityPanel);
window.addEventListener('scroll', positionUtilityPanel, {capture: true, passive: true});
window.visualViewport?.addEventListener('resize', positionUtilityPanel);
window.visualViewport?.addEventListener('scroll', positionUtilityPanel);

// ========== 图标缓存 ==========

let faviconCache = loadFaviconCache();

function loadFaviconCache() {
    try {
        const raw = localStorage.getItem(FAVICON_CACHE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}

function saveFaviconCache() {
    try { localStorage.setItem(FAVICON_CACHE_KEY, JSON.stringify(faviconCache)); }
    catch (e) { /* 忽略 */ }
}

function setCachedFavicon(domain, url) {
    faviconCache[domain] = { url, timestamp: Date.now() };
    saveFaviconCache();
}

function getCachedFavicon(domain) {
    const cached = faviconCache[domain];
    if (cached && (Date.now() - cached.timestamp < 7 * 24 * 60 * 60 * 1000)) return cached.url;
    if (cached) { delete faviconCache[domain]; saveFaviconCache(); }
    return null;
}

// ========== 图标候选地址 ==========

function faviconUrlsFor(url) {
    try {
        const u = new URL(url);
        const domain = u.hostname;
        const cached = getCachedFavicon(domain);
        if (cached) return [cached];

        const domainUrl = u.origin;
        const paths = [
            '/favicon.ico', '/favicon.png', '/favicon.svg',
            '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png',
            '/static/favicon.png', '/static/favicon.ico',
            '/assets/favicon.png', '/assets/favicon.ico',
            '/img/favicon.png', '/img/favicon.ico'
        ];

        let specificUrls = [];
        if (domain.includes('alicdn.com')) {
            specificUrls = [
                'https://g.alicdn.com/sail-web/maas/2.9.86/favicon/128.ico',
                'https://assets.alicdn.com/g/qwenweb/qwen-webui-fe/0.0.219/static/favicon.png'
            ];
        } else if (domain.includes('doubao.com')) {
            specificUrls = [
                'https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/doubao/web/logo-icon.png'
            ];
        }

        let candidates = [...specificUrls];
        paths.forEach(path => candidates.push(`${domainUrl.replace(/\/$/, '')}${path}`));
        candidates.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
        return candidates;
    } catch (e) {
        return ['favicon.ico'];
    }
}

// ========== 分类 ==========

function getCategories() {
    const set = new Set(bookmarks.map(b => b.category || '未分类'));
    set.delete('全部');
    const defaultCategories = ['全部', ...Array.from(set).sort()];
    let storedOrder = [];
    try { const value = JSON.parse(readSetting(CATEGORY_ORDER_KEY, '[]')); if (Array.isArray(value)) storedOrder = [...new Set(value)]; } catch (e) {}
    if (storedOrder.length === 0) return defaultCategories;

    const currentSet = new Set(defaultCategories);
    const valid = storedOrder.filter(cat => currentSet.has(cat));
    const remaining = defaultCategories.filter(cat => !storedOrder.includes(cat));
    return [...valid, ...remaining];
}

// ========== 渲染：分类 ==========

function renderCategories() {
    categoryBar.innerHTML = '';
    const cats = getCategories();

    cats.forEach(cat => {
        const chip = document.createElement('button');
        chip.className = 'cat-chip' + (cat === currentCategory ? ' active' : '');
        chip.dataset.category = cat;
        const categoryIcon = document.createElement('i');
        categoryIcon.className = 'fas fa-' + (cat === '全部' ? 'th-large' : /开发/.test(cat) ? 'code' : /设计/.test(cat) ? 'palette' : /阅读/.test(cat) ? 'book-open' : /影音/.test(cat) ? 'play-circle' : 'folder');
        categoryIcon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span'); label.className = 'cat-name'; label.textContent = cat === '全部' ? '全部书签' : cat;
        const count = document.createElement('span'); count.className = 'cat-count'; count.textContent = cat === '全部' ? bookmarks.length : bookmarks.filter(b => (b.category || '未分类') === cat).length;
        chip.append(categoryIcon, label, count);
        chip.setAttribute('aria-pressed', cat === currentCategory);
        chip.draggable = true;

        chip.addEventListener('click', () => { currentCategory = cat; currentPage = 1; renderAll(); });

        chip.addEventListener('dragstart', handleCategoryDragStart);
        chip.addEventListener('dragend', handleCategoryDragEnd);
        chip.addEventListener('dragover', handleCategoryDragOver);
        chip.addEventListener('dragenter', handleCategoryDragEnter);
        chip.addEventListener('dragleave', handleCategoryDragLeave);
        chip.addEventListener('drop', handleCategoryDrop);

        categoryBar.appendChild(chip);
    });
}

// ========== 渲染：书签 ==========

function renderBookmarks() {
    bookmarksGrid.innerHTML = '';
    bookmarksGrid.style.display = 'grid';

    const list = bookmarks.filter(b => {
        if (currentCategory && currentCategory !== '全部' && (b.category || '未分类') !== currentCategory) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (b.title || '').toLowerCase().includes(q)
                || (b.url || '').toLowerCase().includes(q)
                || (b.desc || '').toLowerCase().includes(q)
                || (b.category || '').toLowerCase().includes(q);
        }
        return true;
    });

    pageSize = measurePageSize();
    totalPages = Math.max(1, Math.ceil(list.length / pageSize));
    currentPage = Math.max(1, Math.min(currentPage, totalPages));
    bookmarksGrid.dataset.page = currentPage;
    bookmarksGrid.dataset.pageSize = pageSize;
    bookmarksGrid.dataset.totalPages = totalPages;
    renderPagination(list.length);

    document.getElementById('collectionTitle').textContent = currentCategory === '全部' ? '全部书签' : currentCategory;
    document.getElementById('bookmarkCount').textContent = `${list.length} 个站点${searchQuery ? ' · 搜索结果' : ''}`;
    if (bookmarks.length === 0) {
        emptyState.style.display = 'flex';
        bookmarksGrid.style.display = 'none';
        return;
    } else {
        emptyState.style.display = 'none';
        bookmarksGrid.style.display = 'grid';
    }

    if (list.length === 0) {
        bookmarksGrid.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <p>没有找到匹配的书签</p>
            </div>`;
        return;
    }

    list.slice((currentPage - 1) * pageSize, currentPage * pageSize).forEach(b => {
        const card = document.createElement('a');
        card.href = b.url;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.dataset.id = b.id;
        card.title = b.title + ' — ' + b.url;
        card.className = 'bookmark-card';
        card.draggable = true;

        // 图标
        const fav = document.createElement('div');
        fav.className = 'favicon';
        fav.innerHTML = '<i class="fas fa-spinner fa-pulse"></i>';

        const img = document.createElement('img');
        img.style.display = 'none';
        const candidates = (b.icon && b.icon.trim()) ? [b.icon.trim()] : faviconUrlsFor(b.url);
        img.src = candidates[0];
        let idx = 0;
        const iconTimeout = setTimeout(() => {
            if (fav.querySelector('.fa-spinner')) fav.innerHTML = '<i class="fas fa-globe" aria-label="网站图标暂不可用"></i>';
        }, 8000);

        img.onload = function () {
            clearTimeout(iconTimeout);
            fav.innerHTML = '';
            fav.appendChild(img);
            img.style.display = 'block';
            if (!b.icon || !b.icon.trim()) {
                try {
                    const domain = new URL(b.url).hostname;
                    if (candidates.includes(img.src)) setCachedFavicon(domain, img.src);
                } catch (e) { /* 忽略 */ }
            }
        };

        img.onerror = function () {
            idx++;
            if (idx < candidates.length) img.src = candidates[idx];
            else { clearTimeout(iconTimeout); fav.innerHTML = '<i class="fas fa-globe" aria-label="网站图标暂不可用"></i>'; }
        };

        // 信息区
        const meta = document.createElement('div');
        meta.className = 'meta' + (b.desc?.trim() ? ' has-description' : '');

        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = b.title || b.url;

        const url = document.createElement('div');
        url.className = 'card-url';
        url.textContent = b.url.replace(/^https?:\/\//, '');

        const desc = document.createElement('div');
        desc.className = 'card-desc';
        desc.textContent = b.desc || '';

        meta.appendChild(title);
        meta.appendChild(desc);
        meta.appendChild(url);

        const category = document.createElement('span');
        category.className = 'card-category';
        category.textContent = b.category && b.category !== '全部' ? b.category : '';
        category.title = category.textContent;

        // 操作按钮
        const actions = document.createElement('div');
        actions.className = 'card-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn edit-btn';
        editBtn.title = '编辑';
        editBtn.innerHTML = '<i class="fas fa-edit"></i>';
        editBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            openModal('edit', b);
            modalReturnFocus = actions.querySelector('[aria-expanded]');
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'action-btn delete-btn';
        delBtn.title = '删除';
        delBtn.innerHTML = '<i class="fas fa-trash"></i>';
        delBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (confirm('确认删除【' + b.title + '】？')) {
                if (!save(bookmarks.filter(x => x.id !== b.id))) return;
                renderAll();
                showToast('已删除 ' + b.title, 'success');
            }
        });

        const moreBtn = document.createElement('button'); moreBtn.className = 'action-btn'; moreBtn.title = '管理 ' + b.title; moreBtn.setAttribute('aria-label', moreBtn.title); moreBtn.setAttribute('aria-expanded', 'false'); moreBtn.innerHTML = '<i class="fas fa-ellipsis-h" aria-hidden="true"></i>';
        moreBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); const open = !actions.classList.contains('open'); document.querySelectorAll('.card-actions.open').forEach(x => x.classList.remove('open')); actions.classList.toggle('open', open); moreBtn.setAttribute('aria-expanded', open); });
        actions.appendChild(moreBtn);
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        // 拖拽事件
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('dragenter', handleDragEnter);
        card.addEventListener('dragleave', handleDragLeave);
        card.addEventListener('drop', handleDrop);

        card.appendChild(fav);
        card.appendChild(meta);
        card.appendChild(category);
        card.appendChild(actions);
        bookmarksGrid.appendChild(card);
    });
}

function renderAll() {
    renderCategories();
    renderBookmarks();
}

// ========== 搜索 ==========

const engines = {
    'baidu': q => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`,
    'google': q => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    'bing': q => `https://www.bing.com/search?q=${encodeURIComponent(q)}`
};

searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    currentPage = 1;
    renderBookmarks();
});

function performSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    openSearchOrUrl(q);
}

function openSearchOrUrl(q) {
    if (/^https?:\/\//i.test(q) || (/^([\w-]+\.)+[\w-]+(\/.*)?$/.test(q) && q.includes('.'))) {
        window.open(/^https?:\/\//i.test(q) ? q : 'https://' + q, '_blank', 'noopener,noreferrer');
    } else {
        window.open((engines[currentEngine] || engines.baidu)(q), '_blank', 'noopener,noreferrer');
    }
}

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
});

document.querySelectorAll('.engine-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.engine-tab').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        currentEngine = btn.dataset.engine;
        if (searchInput.value.trim()) performSearch();
        else searchInput.focus();
    });
});

// ========== 模态框 ==========

document.getElementById('addBtn').addEventListener('click', () => openModal('add'));
document.getElementById('modalCancel').addEventListener('click', closeModal);
document.getElementById('modalCancelBtn').addEventListener('click', closeModal);

document.getElementById('modalSave').addEventListener('click', () => {
    const title = siteTitle.value.trim();
    const url = siteUrl.value.trim();
    const desc = siteDesc.value.trim();
    const cat = siteCategory.value.trim() || '未分类';
    const icon = siteIcon.value.trim();

    if (!title || !url) { showToast('请填写标题和链接', 'error'); return; }

    if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:/i.test(url) && !/^[a-z0-9.-]+:\d+(?:[/?#]|$)/i.test(url)) { showToast('仅支持 http / https 网站链接', 'error'); return; }
    let finalUrl = url;
    if (!/^https?:\/\//i.test(url)) finalUrl = 'https://' + url;
    if (!isSafeUrl(finalUrl)) { showToast('链接格式不正确', 'error'); return; }
    if (icon && !isSafeUrl(icon)) { showToast('图标请使用 http / https 地址，或留空自动获取', 'error'); return; }

    if (!saveEntry({
        id: modalMode === 'edit' ? editingId : genId(),
        title, url: finalUrl, desc, category: cat, icon
    })) return;
    closeModal();
    showToast(modalMode === 'edit' ? '已更新 ' + title : '已添加 ' + title, 'success');
});

function openModal(mode, entry) {
    closeUtilityPanel(false);
    modalReturnFocus = document.activeElement;
    modalMode = mode;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    if (mode === 'add') {
        modalTitle.textContent = '添加站点';
        siteTitle.value = ''; siteUrl.value = ''; siteDesc.value = '';
        siteCategory.value = ''; siteIcon.value = '';
        editingId = null;

    } else {
        modalTitle.textContent = '编辑站点';
        siteTitle.value = entry.title || '';
        siteUrl.value = entry.url || '';
        siteDesc.value = entry.desc || '';
        siteCategory.value = entry.category || '';
        siteIcon.value = entry.icon || '';
        editingId = entry.id;
    }
    siteTitle.focus();
}

function closeModal() {
    modal.classList.remove('show');
    document.body.style.overflow = '';
    (modalReturnFocus?.isConnected ? modalReturnFocus : document.getElementById('addBtn')).focus();
}

function saveEntry(obj) {
    const next = bookmarks.some(b => b.id === obj.id) ? bookmarks.map(b => b.id === obj.id ? {...b, ...obj} : b) : [...bookmarks, obj];
    if (!save(next)) return false;
    renderAll(); return true;
}

modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

// ========== 拖拽排序：书签（DOM直接交换，不闪烁） ==========

let draggedElement = null;

function handleDragStart(e) {
    draggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
}

function handleDragEnd() {
    this.classList.remove('dragging');
    draggedElement = null;
    document.querySelectorAll('.bookmark-card.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter() {
    if (this !== draggedElement) this.classList.add('drag-over');
}

function handleDragLeave() {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.stopPropagation();
    this.classList.remove('drag-over');

    if (this !== draggedElement && draggedElement) {
        const draggedBookmark = bookmarks.find(b => String(b.id) === draggedElement.dataset.id);
        const targetBookmark = bookmarks.find(b => String(b.id) === this.dataset.id);

        if (draggedBookmark && targetBookmark) {
            const draggedPos = bookmarks.findIndex(b => b.id === draggedBookmark.id);
            const targetPos = bookmarks.findIndex(b => b.id === targetBookmark.id);
            const next = bookmarks.slice();
            [next[draggedPos], next[targetPos]] = [next[targetPos], next[draggedPos]];
            if (!save(next)) return;

            // DOM 直接交换，不重新渲染
            const parent = bookmarksGrid;
            const allCards = Array.from(parent.children);
            const dragIdx = allCards.indexOf(draggedElement);
            const targetIdx = allCards.indexOf(this);

            if (dragIdx < targetIdx) {
                parent.insertBefore(draggedElement, this.nextSibling);
                parent.insertBefore(this, allCards[dragIdx] || parent.children[dragIdx]);
            } else {
                parent.insertBefore(draggedElement, this);
                parent.insertBefore(this, allCards[dragIdx] ? allCards[dragIdx].nextSibling : null);
            }
        }
    }
}

// ========== 拖拽排序：分类 ==========

let draggedCategory = null;

function handleCategoryDragStart(e) {
    draggedCategory = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.category);
}

function handleCategoryDragEnd() {
    this.classList.remove('dragging');
    draggedCategory = null;
    document.querySelectorAll('.cat-chip.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function handleCategoryDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleCategoryDragEnter() {
    if (this !== draggedCategory) this.classList.add('drag-over');
}

function handleCategoryDragLeave() {
    this.classList.remove('drag-over');
}

function handleCategoryDrop(e) {
    e.stopPropagation();
    this.classList.remove('drag-over');

    if (this !== draggedCategory && draggedCategory) {
        const categories = getCategories();
        const draggedName = draggedCategory.dataset.category;
        const targetName = this.dataset.category;
        const draggedIndex = categories.indexOf(draggedName);
        const targetIndex = categories.indexOf(targetName);

        if (draggedIndex !== -1 && targetIndex !== -1) {
            const newCats = [...categories];
            const [moved] = newCats.splice(draggedIndex, 1);
            newCats.splice(targetIndex, 0, moved);
            if (!writeSetting(CATEGORY_ORDER_KEY, JSON.stringify(newCats))) return;

            // DOM 直接交换
            if (draggedIndex < targetIndex) {
                categoryBar.insertBefore(draggedCategory, this.nextSibling);
            } else {
                categoryBar.insertBefore(draggedCategory, this);
            }
        }
    }
}

// ========== 导入/导出 ==========

document.getElementById('exportBtn').addEventListener('click', () => {
    closeUtilityPanel(true);
    const blob = new Blob([storageDamaged ? readSetting(STORAGE_KEY, '[]') : JSON.stringify(bookmarks, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'bookmarks.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('数据已导出', 'success');
});

const importFile = document.getElementById('importFile');
document.getElementById('importBtn').addEventListener('click', () => { closeUtilityPanel(true); importFile.click(); });

function readImportFile(file) {
    if (!file) return;
    const version = ++importReadVersion;
    if (activeImportReader?.readyState === 1) activeImportReader.abort();
    const reader = new FileReader();
    activeImportReader = reader;
    reader.onload = () => {
        if (version !== importReadVersion) return;
        activeImportReader = null;
        let data;
        try { data = JSON.parse(reader.result); }
        catch (error) { showToast('JSON 解析错误，当前收藏未改变', 'error'); return; }
        importBookmarks(data);
    };
    reader.onerror = () => {
        if (version !== importReadVersion) return;
        activeImportReader = null;
        showToast('文件读取失败，当前收藏未改变', 'error');
    };
    reader.readAsText(file);
}

importFile.addEventListener('change', e => {
    readImportFile(e.target.files[0]);
    importFile.value = '';
});

// ========== 深色模式 ==========

function initTheme() {
    const saved = readSetting(THEME_KEY, 'light');
    applyTheme(saved || 'light');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('themeIcon').className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    writeSetting(THEME_KEY, theme);
}

document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ========== Toast 通知 ==========

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    const icon = document.createElement('i'); icon.className = 'fas ' + (icons[type] || icons.info);
    const text = document.createElement('span'); text.textContent = message; toast.append(icon, text);
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}

// ========== 键盘快捷键 ==========

document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    if (e.key === '/' && !isInputFocused()) {
        e.preventDefault();
        searchInput.focus();
    }
    if (e.key === 'Escape') {
        if (modal.classList.contains('show')) {
            closeModal();
        } else {
            if (document.activeElement === searchInput) {
                searchInput.blur();
                searchInput.value = '';
                searchQuery = ''; currentPage = 1;
                renderBookmarks();
            }
        }
    }
});

function isInputFocused() {
    const tag = document.activeElement.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
}

// ========== 初始化 ==========

initTheme();
initAccent();
applyEffectiveColumns();
applyView(readSetting('nav_view', 'grid'));
initialized = true;
renderAll();

// 自动聚焦搜索框
// Focus once on initial load; re-rendering must not interrupt forms or IME.
searchInput.focus({ preventScroll: true });

window.myNav = { get bookmarks() { return bookmarks; }, save, load, getCategories, importBookmarks };
console.log('网址导航已加载 ✓');


function importBookmarks(data) {
    if (!validBookmarks(data)) { showToast('导入失败：请使用包含有效标题和 http / https 链接的书签数组', 'error'); return false; }
    if (!confirm(`导入 ${data.length} 个站点将替换当前收藏。请先导出 JSON 保存副本。继续导入？`)) return false;
    const ids = new Set();
    const next = data.map(b => {
        let id = typeof b.id === 'string' && b.id ? b.id : genId();
        while (ids.has(id)) id = genId();
        ids.add(id);
        return {...b, id};
    });
    // 单键同步写入成功后才更新内存；不创建或删除历史快照。
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch (error) { showToast('导入失败：浏览器存储不可用或空间不足，当前收藏未改变', 'error'); return false; }
    bookmarks = next; storageDamaged = false; currentCategory = '全部'; currentPage = 1;
    document.getElementById('storageWarning').hidden = true;
    renderAll(); showToast(`导入成功，共 ${next.length} 个书签`, 'success'); return true;
}
function applyView(view) {
    view = view === 'list' ? 'list' : 'grid';
    bookmarksGrid.classList.toggle('list-view', view === 'list');
    ['grid','list'].forEach(name => { const button = document.getElementById(name + 'ViewBtn'); button.classList.toggle('active', name === view); button.setAttribute('aria-pressed', name === view); });
    writeSetting('nav_view', view);
    currentPage = 1; if (initialized) refreshPageLayout();
}
document.getElementById('gridViewBtn').addEventListener('click', () => applyView('grid'));
document.getElementById('listViewBtn').addEventListener('click', () => applyView('list'));
if (storageDamaged) { const warning = document.getElementById('storageWarning'); warning.hidden = false; warning.textContent = '原收藏数据无法读取或已经损坏。原始数据未被覆盖，请先从「导入 / 导出」导出原文件，再导入修复后的 JSON。'; }
document.addEventListener('click', () => document.querySelectorAll('.card-actions.open').forEach(x => { x.classList.remove('open'); x.querySelector('[aria-expanded]')?.setAttribute('aria-expanded','false'); }));
modal.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const items = [...modal.querySelectorAll('button,input')].filter(x => !x.disabled);
    const first = items[0], last = items[items.length-1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// Page controls never modify bookmark data or persisted column preferences.
document.getElementById('prevPage').addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderBookmarks(); } });
document.getElementById('nextPage').addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; renderBookmarks(); } });
if (document.fonts?.ready) document.fonts.ready.then(refreshPageLayout);
if (typeof ResizeObserver !== 'undefined') {
    let previousSize = '';
    new ResizeObserver(() => {
        const size = `${bookmarksGrid.clientWidth}:${bookmarksGrid.clientHeight}`;
        if (size !== previousSize) { previousSize = size; renderBookmarks(); }
    }).observe(bookmarksGrid);
}
