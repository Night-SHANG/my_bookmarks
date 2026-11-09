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
const DENSITY_KEY = 'nav_density';
const pendingFaviconFallbacks = new Set();
let faviconFallbackTimer = null;
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
let modalReturnBookmark = null;
let bodyOverflowBeforeModal = null;
const modalBackgroundState = new Map();
let activeCardActions = null;
let activeUtilityPanel = null;
const utilityPanels = new Map([
    ['appearanceBtn', {button: document.getElementById('appearanceBtn'), panel: document.getElementById('appearancePanel')}],
    ['dataPanelBtn', {button: document.getElementById('dataPanelBtn'), panel: document.getElementById('dataPanel')}],
    ['categoryOrderBtn', {button: document.getElementById('categoryOrderBtn'), panel: document.getElementById('categoryOrderPanel')}]
]);
let importReadVersion = 0;
let activeImportReader = null;

// ========== 工具函数 ==========

function scheduleFaviconFallback(favicon) {
    pendingFaviconFallbacks.add(favicon);
    if (faviconFallbackTimer !== null) return;
    // One shared timeout serves every pending icon; avoids thousands of timers.
    faviconFallbackTimer = setTimeout(() => {
        // The globe placeholder is visible throughout loading; only clear bookkeeping here.
        pendingFaviconFallbacks.clear();
        faviconFallbackTimer = null;
    }, 8000);
}

function clearFaviconFallback(favicon) {
    pendingFaviconFallbacks.delete(favicon);
    if (pendingFaviconFallbacks.size === 0 && faviconFallbackTimer !== null) {
        clearTimeout(faviconFallbackTimer);
        faviconFallbackTimer = null;
    }
}

function clearAllFaviconFallbacks() {
    pendingFaviconFallbacks.clear();
    if (faviconFallbackTimer !== null) {
        clearTimeout(faviconFallbackTimer);
        faviconFallbackTimer = null;
    }
}

function genId() {
    return 'b_' + Math.random().toString(36).slice(2, 9);
}

function save(next = bookmarks, errorScope = 'global') {
    clearTaskError(errorScope);
    if (storageDamaged) { showTaskError('原数据无法读取，请先导出原始数据后再导入修复文件', errorScope); return false; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); bookmarks = next; return true; }
    catch (e) { showTaskError('保存失败：浏览器存储不可用或空间不足。输入与原收藏已保留，请释放空间或检查存储权限后重试。', errorScope); return false; }
}
function readSetting(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch (e) { return fallback; }
}
function writeSetting(key, value, scope = 'global') {
    clearTaskError(scope);
    try { localStorage.setItem(key, value); return true; }
    catch (e) { showTaskError('设置未保存。请检查浏览器存储权限或释放空间后重试。', scope); return false; }
}
function showTaskError(message, scope = 'global') {
    const target = document.getElementById(scope === 'global' ? 'operationError' : scope + 'Error');
    if (!target) return;
    const text = target.querySelector('[data-error-text]') || target;
    text.textContent = message;
    target.hidden = false;
    // A completed asynchronous task may no longer have its panel open.
    // Keep its local message and surface a persistent, dismissible notification.
    if (scope !== 'global' && target.closest('.utility-panel[hidden]')) {
        showTaskError(message, 'global');
        document.getElementById('operationError').dataset.errorScope = scope;
    } else if (scope === 'global') target.dataset.errorScope = 'global';
}

function clearTaskError(scope = 'global') {
    const target = document.getElementById(scope === 'global' ? 'operationError' : scope + 'Error');
    if (target) target.hidden = true;
    const globalError = document.getElementById('operationError');
    if (globalError?.dataset.errorScope === scope) globalError.hidden = true;
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

// ========== 布局偏好：桌面列数与卡片密度相互独立 ==========

function getColumns() {
    const saved = Number(readSetting(COLUMNS_KEY, '4'));
    return Number.isSafeInteger(saved) && saved >= 1 ? saved : 4;
}

function applyColumnPreference() {
    const preference = getColumns();
    const gridWidth = bookmarksGrid.clientWidth || window.innerWidth - 220 - 56;
    const gap = parseFloat(getComputedStyle(bookmarksGrid).columnGap) || 10;
    const maxFit = Math.max(1, Math.floor((gridWidth + gap) / (180 + gap)));
    const actual = Math.min(preference, maxFit);

    document.documentElement.style.setProperty('--columns', String(actual));
    document.documentElement.dataset.columnLayout = 'wide';
    colsDisplay.textContent = actual + '列';
    colsDisplay.title = actual < preference ? `当前窗口最多显示 ${actual} 列` : `当前显示 ${actual} 列`;
    document.getElementById('colsDecrease').disabled = actual <= 1;
    document.getElementById('colsIncrease').disabled = actual >= maxFit;
    return actual;
}

function setColumns(n) {
    if (!Number.isSafeInteger(n) || n < 1) {
        showToast('列数必须是大于零的有效整数', 'error');
        return false;
    }
    if (!writeSetting(COLUMNS_KEY, n)) return false;
    applyColumnPreference();
    return true;
}

function getDensity() {
    return readSetting(DENSITY_KEY, 'compact') === 'comfortable' ? 'comfortable' : 'compact';
}

function applyDensity() {
    const density = getDensity();
    document.documentElement.dataset.density = density;
    document.getElementById('densityCompactBtn').setAttribute('aria-pressed', String(density === 'compact'));
    document.getElementById('densityComfortableBtn').setAttribute('aria-pressed', String(density === 'comfortable'));
    return density;
}

function setDensity(density) {
    if (!['compact', 'comfortable'].includes(density)) return false;
    if (!writeSetting(DENSITY_KEY, density, 'appearance')) return false;
    applyDensity();
    return true;
}

document.getElementById('colsIncrease').addEventListener('click', () => setColumns(applyColumnPreference() + 1));
document.getElementById('colsDecrease').addEventListener('click', () => setColumns(applyColumnPreference() - 1));
document.getElementById('densityCompactBtn').addEventListener('click', () => setDensity('compact'));
document.getElementById('densityComfortableBtn').addEventListener('click', () => setDensity('comfortable'));

// ========== 主题色自定义 ==========

const DEFAULT_ACCENT = '#73d548';

function initAccent() {
    const saved = readSetting(ACCENT_KEY, '');
    renderAccent(/^#[0-9a-f]{6}$/i.test(saved) ? saved : null);
}

// 读取只绘制；用户修改先保存，成功后才更新界面。
function brandIconSvg(color) {
    const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_ACCENT;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <rect x="2" y="2" width="124" height="124" rx="30" fill="${safeColor}"/>
      <path d="M39 19h50c7 0 12 5 12 12v75c0 8-8 13-15 9L64 99 42 115c-7 4-15-1-15-9V31c0-7 5-12 12-12Z" fill="#fff"/>
      <path d="M41 65a25 25 0 0 1 40-19" fill="none" stroke="${safeColor}" stroke-width="6" stroke-linecap="round"/>
      <path d="M87 63a25 25 0 0 1-40 19" fill="none" stroke="${safeColor}" stroke-width="6" stroke-linecap="round"/>
      <path d="M82 35 68 67 43 93 57 59Z" fill="${safeColor}"/>
      <path d="M82 35 68 67 57 59Z" fill="${safeColor}" opacity=".58"/>
      <circle cx="64" cy="64" r="6" fill="#fff"/>
    </svg>`;
}
function updateBrandAccentIcon(color) {
    const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_ACCENT;
    const brand = document.getElementById('brandMark');
    if (brand) {
        brand.querySelectorAll('[data-brand-fill]').forEach(node => node.setAttribute('fill', safeColor));
        brand.querySelectorAll('[data-brand-stroke]').forEach(node => node.setAttribute('stroke', safeColor));
    }
    const favicon = document.getElementById('dynamicFavicon');
    if (favicon) favicon.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(brandIconSvg(safeColor));
    const browserThemeColor = document.getElementById('browserThemeColor');
    if (browserThemeColor) browserThemeColor.content = safeColor.toUpperCase();
}
function renderAccent(color) {
    const style = document.documentElement.style;
    const keys = ['--accent', '--accent-hover', '--accent-dim', '--accent-text', '--text-on-accent', '--text-on-accent-hover', '--text-on-accent-soft', '--focus-color', '--focus-ring'];
    keys.forEach(key => style.removeProperty(key));
    if (color) {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        const palette = createAccentPalette(color, dark ? '#202b25' : '#ffffff');
        Object.entries(palette).forEach(([key, value]) => style.setProperty(key, value));
    }
    const active = color || DEFAULT_ACCENT;
    updateColorDots(active);
    document.getElementById('customColor').value = active;
    updateBrandAccentIcon(active);
}

function applyAccent(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return false;
    if (!writeSetting(ACCENT_KEY, color, 'appearance')) { initAccent(); return false; }
    renderAccent(color);
    return true;
}

function resetAccent() {
    clearTaskError('appearance');
    try { localStorage.removeItem(ACCENT_KEY); }
    catch (e) { showTaskError('主题色未重置。请检查浏览器存储权限后重试。', 'appearance'); return false; }
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
    // Choose the strongest readable foreground for this exact opaque sRGB surface.
    return ['#263a32', '#1e3028', '#000000', '#ffffff']
        .reduce((best, candidate) => contrastRatio(candidate, hex) > contrastRatio(best, hex) ? candidate : best);
}

function contrastRatio(a, b) {
    const luminance = hex => {
        const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
            .map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
        return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
    };
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function mixHex(a, b, weight) {
    return '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * weight + parseInt(b.slice(i, i + 2), 16) * (1 - weight)).toString(16).padStart(2, '0')).join('');
}

function readableAccent(color, background) {
    const fallback = accentTextColor(background);
    for (let step = 0; step <= 100; step++) {
        const candidate = mixHex(color, fallback, 1 - step / 100);
        if (contrastRatio(candidate, background) >= 4.8) return candidate;
    }
    return fallback;
}

function focusAccent(color, background) {
    const dark = background === '#202b25';
    const surfaces = dark ? [background, '#151c19', '#25332b'] : [background, '#f5f6f3'];
    const target = dark ? '#ffffff' : '#263a32';
    // The ring touches both the input and the page, so test both surfaces.
    for (let step = 0; step <= 100; step++) {
        const candidate = mixHex(color, target, 1 - step / 100);
        if (surfaces.every(surface => contrastRatio(candidate, surface) >= 3.2)) return candidate;
    }
    return target;
}

function createAccentPalette(color, background) {
    const hover = adjustBrightness(color, -35);
    const soft = mixHex(color, background, 0.12);
    const focus = focusAccent(color, background);
    return {
        '--accent': color, '--accent-hover': hover, '--accent-dim': soft,
        '--accent-text': readableAccent(color, background === '#202b25' ? '#26332c' : '#edf1ec'),
        '--text-on-accent': accentTextColor(color),
        '--text-on-accent-hover': accentTextColor(hover),
        '--text-on-accent-soft': accentTextColor(soft),
        '--focus-color': focus,
        '--focus-ring': hexToRgba(focus, background === '#202b25' ? 0.20 : 0.14)
    };
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
    (entry.panel.querySelector('.color-dot, #importBtn, #categoryOrderSelect') || entry.panel.querySelector('button:not([disabled]), input:not([disabled])'))?.focus({preventScroll: true});
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
    const items = [...entry.panel.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled])')];
    if ((event.shiftKey && document.activeElement === items[0]) || (!event.shiftKey && document.activeElement === items.at(-1))) {
        // 非模态浮层不困住键盘：返回触发器后继续原页面的Tab顺序。
        closeUtilityPanel(true);
        if (event.shiftKey) event.preventDefault();
    }
}

for (const [id, entry] of utilityPanels) entry.button.addEventListener('click', () => {
    if (id === 'categoryOrderBtn') updateCategoryOrderControls();
    toggleUtilityPanel(id);
});
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
    if (cached && typeof cached.url === 'string' && Date.now() - cached.timestamp < 7 * 24 * 60 * 60 * 1000) return cached.url;
    if (cached) { delete faviconCache[domain]; saveFaviconCache(); }
    return null;
}

function clearCachedFavicon(domain, failedUrl) {
    const cached = faviconCache[domain];
    if (!cached || typeof cached.url !== 'string') return;
    let cachedUrl = cached.url;
    try { cachedUrl = new URL(cachedUrl, location.href).href; } catch (e) { /* 忽略无效缓存地址 */ }
    if (cachedUrl === failedUrl) {
        delete faviconCache[domain];
        saveFaviconCache();
    }
}

// ========== 图标候选地址 ==========

function faviconUrlsFor(url) {
    try {
        const u = new URL(url);
        const domain = u.hostname;
        const cached = getCachedFavicon(domain);
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

        const candidates = [...specificUrls];
        paths.forEach(path => candidates.push(`${domainUrl.replace(/\/$/, '')}${path}`));
        candidates.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
        return [...new Set([cached, ...candidates].filter(Boolean))];
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

function updateCategoryOrderControls(selected) {
    const select = document.getElementById('categoryOrderSelect');
    const name = selected || select.value || currentCategory;
    const categories = getCategories();
    select.replaceChildren();
    categories.forEach(category => {
        const option = document.createElement('option'); option.value = category;
        option.textContent = category === '全部' ? '全部书签' : category;
        select.appendChild(option);
    });
    select.value = categories.includes(name) ? name : categories[0];
    const index = categories.indexOf(select.value);
    document.getElementById('categoryUpBtn').disabled = index <= 0;
    document.getElementById('categoryDownBtn').disabled = index >= categories.length - 1;
}

function moveCategory(direction) {
    const trigger = document.activeElement;
    const select = document.getElementById('categoryOrderSelect');
    const categories = getCategories();
    const index = categories.indexOf(select.value), target = index + direction;
    if (![-1, 1].includes(direction) || index < 0 || target < 0 || target >= categories.length) return false;
    [categories[index], categories[target]] = [categories[target], categories[index]];
    if (!writeSetting(CATEGORY_ORDER_KEY, JSON.stringify(categories), 'categoryOrder')) return false;
    renderCategories(); updateCategoryOrderControls(select.value);
    document.getElementById('categoryOrderStatus').textContent = `已移动到第 ${target + 1} 位`;
    if (trigger?.disabled) select.focus({preventScroll: true});
    return true;
}
document.getElementById('categoryOrderSelect').addEventListener('change', () => updateCategoryOrderControls());
document.getElementById('categoryUpBtn').addEventListener('click', () => moveCategory(-1));
document.getElementById('categoryDownBtn').addEventListener('click', () => moveCategory(1));

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

        chip.addEventListener('click', () => {
            currentCategory = cat; renderAll();
            [...categoryBar.children].find(el => el.dataset.category === cat)?.focus({preventScroll: true});
        });
        chip.title = cat === '全部' ? '全部书签' : cat;

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

function getFilteredBookmarks() {
    return bookmarks.filter(b => {
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
}

function renderBookmarks() {
    const focusedCard = document.activeElement?.closest?.('.bookmark-card');
    const focusedId = focusedCard?.dataset.id;
    const focusedLink = document.activeElement?.classList.contains('bookmark-link');
    closeCardActions(false);
    clearAllFaviconFallbacks();
    bookmarksGrid.innerHTML = '';
    bookmarksGrid.style.display = 'grid';

    const list = getFilteredBookmarks();

    // Render the complete filtered collection; scrolling belongs to the document.

    document.getElementById('collectionTitle').textContent = currentCategory === '全部' ? '全部书签' : currentCategory;
    document.getElementById('bookmarkCount').textContent = `${list.length} 个站点${searchQuery ? ' · 搜索结果' : ''}`;
    if (bookmarks.length === 0) {
        emptyState.querySelector('h3').textContent = storageDamaged ? '收藏数据暂不可用' : '收藏你的第一个网站';
        emptyState.querySelector('p').textContent = storageDamaged ? '原始数据未被覆盖。请导出原文件，再导入修复后的 JSON。' : '点击「添加站点」，把常用网站放在这里。';
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

    const fragment = document.createDocumentFragment();
    list.forEach((b, visibleIndex) => {
        const card = document.createElement('article');
        const link = document.createElement('a');
        link.className = 'bookmark-link';
        link.href = b.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.draggable = false;
        link.title = [b.title, b.url, b.desc].filter(Boolean).join(' — ');
        card.dataset.id = b.id;
        card.className = 'bookmark-card';
        card.draggable = true;

        // 图标
        const fav = document.createElement('div');
        fav.className = 'favicon';
        fav.innerHTML = '<i class="fas fa-globe" aria-label="网站图标加载中"></i>';

        const img = document.createElement('img');
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        fav.setAttribute('aria-hidden', 'true');
        img.style.display = 'block';
        img.style.opacity = '0';
        const customCandidates = [];
        if (b.icon && b.icon.trim()) {
            const savedIcon = b.icon.trim();
            // Preserve the historical rule: relative icon paths resolve from the
            // navigation page. Also try the bookmark origin for site-relative paths.
            for (const base of [document.baseURI, b.url]) {
                try {
                    const resolved = new URL(savedIcon, base).href;
                    if (!customCandidates.includes(resolved)) customCandidates.push(resolved);
                } catch (e) { /* 忽略无效候选，后续继续回退 */ }
            }
            if (customCandidates.length === 0 && /^https?:\/\//i.test(savedIcon)) customCandidates.push(savedIcon);
        }
        // Defer domain discovery until all saved custom-icon interpretations fail.
        const candidates = customCandidates.length ? customCandidates : faviconUrlsFor(b.url);
        let fallbackCandidatesLoaded = customCandidates.length === 0;
        img.src = candidates[0];
        fav.appendChild(img);
        let idx = 0;
        scheduleFaviconFallback(fav);
        img.onload = function () {
            clearFaviconFallback(fav);
            fav.querySelector('.fa-globe')?.remove();
            img.style.opacity = '1';
            if (!b.icon || !b.icon.trim()) {
                try {
                    const domain = new URL(b.url).hostname;
                    if (candidates.includes(img.src)) setCachedFavicon(domain, img.src);
                } catch (e) { /* 忽略 */ }
            }
        };

        img.onerror = function () {
            const failedUrl = img.currentSrc || img.src;
            try { clearCachedFavicon(new URL(b.url).hostname, failedUrl); } catch (e) { /* 忽略 */ }
            if (customCandidates.length && !fallbackCandidatesLoaded) {
                fallbackCandidatesLoaded = true;
                const existing = new Set(candidates);
                candidates.push(...faviconUrlsFor(b.url).filter(candidate => !existing.has(candidate)));
            }
            idx++;
            if (idx < candidates.length) {
                img.src = candidates[idx];
            } else {
                clearFaviconFallback(fav);
                img.remove();
            }
        };

        // 信息区
        const meta = document.createElement('div');
        meta.className = 'meta';

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

        // Standard link and native action buttons are siblings, never nested.
        const actions = document.createElement('div');
        actions.className = 'card-actions';
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button'; moreBtn.className = 'action-btn more-btn';
        moreBtn.title = '管理 ' + b.title; moreBtn.setAttribute('aria-label', moreBtn.title);
        moreBtn.setAttribute('aria-expanded', 'false');
        moreBtn.innerHTML = '<i class="fas fa-ellipsis-h" aria-hidden="true"></i>';
        const actionPanel = document.createElement('div');
        actionPanel.className = 'card-action-panel'; actionPanel.hidden = true;
        actionPanel.id = 'bookmark-actions-' + visibleIndex;
        actionPanel.setAttribute('role', 'group'); actionPanel.setAttribute('aria-label', b.title + '的操作');
        moreBtn.setAttribute('aria-controls', actionPanel.id);
        const actionButton = (name, className, action) => {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'action-btn ' + className;
            button.dataset.action = action;
            button.textContent = name; button.title = name;
            button.setAttribute('aria-label', name + ' ' + b.title);
            actionPanel.appendChild(button); return button;
        };
        actionButton('编辑', 'edit-btn', 'edit');
        actionButton('删除', 'delete-btn', 'delete');
        const index = visibleIndex;
        actionButton('上移', 'move-up-btn', 'move-up').disabled = index <= 0;
        actionButton('下移', 'move-down-btn', 'move-down').disabled = index >= list.length - 1;
        actions.append(moreBtn, actionPanel);

        link.append(fav, meta);
        card.appendChild(link);
        card.appendChild(actions);
        fragment.appendChild(card);
    });
    bookmarksGrid.appendChild(fragment);
    if (focusedId) {
        const card = findBookmarkCard(focusedId);
        (card?.querySelector(focusedLink ? '.bookmark-link' : '.more-btn'))?.focus({preventScroll: true});
    }
}

function findBookmarkCard(id) {
    return [...bookmarksGrid.querySelectorAll('.bookmark-card')].find(card => card.dataset.id === String(id));
}

function focusBookmark(id) {
    const button = findBookmarkCard(id)?.querySelector('.more-btn');
    (button || document.getElementById('addBtn')).focus({preventScroll: true});
}

function setCardActionsOpen(actions, open) {
    actions.classList.toggle('open', open);
    actions.querySelector('[aria-expanded]').setAttribute('aria-expanded', String(open));
    actions.querySelector('.card-action-panel').hidden = !open;
}

function closeCardActions(restoreFocus = false) {
    const previous = activeCardActions;
    activeCardActions = null;
    if (!previous) return;
    setCardActionsOpen(previous, false);
    const button = previous.querySelector('[aria-expanded]');
    if (restoreFocus && button.isConnected) button.focus({preventScroll: true});
}

function positionCardActions() {
    if (!activeCardActions) return;
    const button = activeCardActions.querySelector('[aria-expanded]');
    const panel = activeCardActions.querySelector('.card-action-panel');
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || document.documentElement.clientWidth;
    const height = viewport?.height || window.innerHeight;
    const anchor = button.getBoundingClientRect(), margin = 12, gap = 6;
    if (!button.isConnected || anchor.bottom < top || anchor.top > top + height) { closeCardActions(false); return; }
    panel.style.maxHeight = Math.max(0, height - margin * 2) + 'px';
    panel.style.maxWidth = Math.max(0, width - margin * 2) + 'px';
    const bounds = panel.getBoundingClientRect();
    const y = anchor.bottom + gap + bounds.height <= top + height - margin ? anchor.bottom + gap : anchor.top - bounds.height - gap;
    panel.style.left = Math.max(left + margin, Math.min(anchor.right - bounds.width, left + width - bounds.width - margin)) + 'px';
    panel.style.top = Math.max(top + margin, Math.min(y, top + height - bounds.height - margin)) + 'px';
}

function updateBookmarkMoveControls(actions) {
    const id = actions.closest('.bookmark-card').dataset.id;
    const list = getFilteredBookmarks();
    const index = list.findIndex(item => String(item.id) === id);
    actions.querySelector('.move-up-btn').disabled = index <= 0;
    actions.querySelector('.move-down-btn').disabled = index < 0 || index >= list.length - 1;
}

function toggleCardActions(actions) {
    const wasOpen = activeCardActions === actions;
    closeCardActions(false); closeUtilityPanel(false);
    if (wasOpen) return;
    updateBookmarkMoveControls(actions);
    activeCardActions = actions; setCardActionsOpen(actions, true);
    positionCardActions();
    actions.querySelector('.card-action-panel button:not([disabled])')?.focus({preventScroll: true});
}

function dismissCardActions(event) {
    if (activeCardActions && !activeCardActions.contains(event.target)) closeCardActions(false);
}
document.addEventListener('click', dismissCardActions);
document.addEventListener('focusin', dismissCardActions);
document.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || !activeCardActions) return;
    const actions = activeCardActions;
    const items = [...actions.querySelectorAll('.card-action-panel button:not([disabled])')];
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); closeCardActions(true); }
    else if (!event.shiftKey && document.activeElement === items.at(-1)) closeCardActions(true);
});
window.addEventListener('resize', positionCardActions);
window.addEventListener('scroll', positionCardActions, {capture: true, passive: true});
window.visualViewport?.addEventListener('resize', positionCardActions);
window.visualViewport?.addEventListener('scroll', positionCardActions);

function moveBookmark(id, direction) {
    const list = getFilteredBookmarks();
    const index = list.findIndex(item => String(item.id) === String(id)), target = index + direction;
    if (![-1, 1].includes(direction) || index < 0 || target < 0 || target >= list.length) return false;
    const from = bookmarks.findIndex(item => item.id === list[index].id);
    const to = bookmarks.findIndex(item => item.id === list[target].id);
    const next = bookmarks.slice();
    [next[from], next[to]] = [next[to], next[from]];
    if (!save(next)) return false;
    renderBookmarks(); focusBookmark(id);
    showToast(direction < 0 ? '已上移' : '已下移', 'success');
    return true;
}

function syncSidebarPin() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    const desktop = window.matchMedia?.('(min-width: 701px)').matches ?? window.innerWidth > 700;
    // Pin only when every category and management action fits; otherwise the whole
    // document scrolls naturally, with no clipped or nested category viewport.
    const fits = desktop && sidebar.scrollHeight <= window.innerHeight + 1;
    sidebar.classList.toggle('sidebar-pinned', fits);
}
window.addEventListener('resize', syncSidebarPin, {passive: true});

function renderAll() {
    renderCategories();
    renderBookmarks();
    syncSidebarPin();
}

// ========== 搜索 ==========

const engines = {
    'baidu': q => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`,
    'google': q => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    'bing': q => `https://www.bing.com/search?q=${encodeURIComponent(q)}`
};

searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
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
    if (e.key === 'Enter' && !e.isComposing) performSearch();
});

document.querySelectorAll('.engine-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.engine-tab').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        currentEngine = btn.dataset.engine;
        if (searchInput.value.trim()) performSearch();
        else searchInput.focus();
    });
});

// ========== 模态框 ==========

document.getElementById('addBtn').addEventListener('click', () => openModal('add'));
document.getElementById('modalCancel').addEventListener('click', closeModal);
document.getElementById('modalCancelBtn').addEventListener('click', closeModal);

function validateSiteEntry(draft) {
    const title = (draft.title || '').trim(), rawUrl = (draft.url || '').trim();
    const icon = (draft.icon || '').trim(), errors = {};
    if (!title) errors.siteTitle = '请输入网站标题。';
    let url = rawUrl;
    if (!rawUrl) errors.siteUrl = '请输入网站链接，例如 https://example.com。';
    else {
        const unsupported = /^[a-z][a-z0-9+.-]*:/i.test(rawUrl) && !/^https?:/i.test(rawUrl) && !/^[a-z0-9.-]+:\d+(?:[/?#]|$)/i.test(rawUrl);
        if (!/^https?:\/\//i.test(rawUrl)) url = 'https://' + rawUrl;
        if (unsupported || !isSafeUrl(url)) errors.siteUrl = '请输入有效的 http 或 https 链接；也可填写域名或 localhost:端口。';
    }
    if (icon && !isSafeUrl(icon)) errors.siteIcon = '请输入 http 或 https 图标地址，或留空自动获取。';
    return {errors, entry: {title, url, icon, desc: (draft.desc || '').trim(), category: (draft.category || '').trim() || '未分类'}};
}

function setFieldError(id, message) {
    const input = document.getElementById(id), error = document.getElementById(id + 'Error');
    error.textContent = message; error.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
}

function clearFormErrors() {
    ['siteTitle', 'siteUrl', 'siteIcon'].forEach(id => setFieldError(id, ''));
    clearTaskError('form');
}

document.getElementById('siteForm').addEventListener('submit', event => {
    event.preventDefault();
    clearFormErrors();
    const result = validateSiteEntry({title: siteTitle.value, url: siteUrl.value, desc: siteDesc.value, category: siteCategory.value, icon: siteIcon.value});
    Object.entries(result.errors).forEach(([id, message]) => setFieldError(id, message));
    const firstError = Object.keys(result.errors)[0];
    if (firstError) { document.getElementById(firstError).focus(); return; }
    if (!saveEntry({...result.entry, id: modalMode === 'edit' ? editingId : genId()})) return;
    closeModal();
    showToast(modalMode === 'edit' ? '已更新 ' + result.entry.title : '已添加 ' + result.entry.title, 'success');
});

function setModalBackground(inert) {
    if (inert) {
        document.querySelectorAll('.app, .skip-link, .utility-panel, #operationError').forEach(element => {
            if (!modalBackgroundState.has(element)) modalBackgroundState.set(element, element.inert);
            element.inert = true;
        });
    } else {
        for (const [element, previous] of modalBackgroundState) element.inert = previous;
        modalBackgroundState.clear();
    }
}

function openModal(mode, entry) {
    modalReturnFocus = document.activeElement;
    modalReturnBookmark = entry ? String(entry.id) : null;
    closeUtilityPanel(false); closeCardActions(false);
    modalMode = mode;
    clearFormErrors();
    modal.classList.add('show');
    document.body.classList.add('modal-open');
    bodyOverflowBeforeModal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setModalBackground(true);
    modalTitle.textContent = mode === 'edit' ? '编辑站点' : '添加站点';
    siteTitle.value = entry?.title || ''; siteUrl.value = entry?.url || '';
    siteDesc.value = entry?.desc || ''; siteCategory.value = entry?.category || '';
    siteIcon.value = entry?.icon || ''; editingId = entry?.id ?? null;
    siteTitle.focus();
}

function closeModal() {
    if (!modal.classList.contains('show')) return;
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');
    setModalBackground(false);
    document.body.style.overflow = bodyOverflowBeforeModal ?? '';
    bodyOverflowBeforeModal = null;
    const currentButton = modalReturnBookmark ? findBookmarkCard(modalReturnBookmark)?.querySelector('.more-btn') : null;
    (currentButton || (modalReturnFocus?.isConnected ? modalReturnFocus : document.getElementById('addBtn'))).focus({preventScroll: true});
}

document.addEventListener('focusin', event => {
    if (modal.classList.contains('show') && !modal.contains(event.target)) siteTitle.focus({preventScroll: true});
}, true);

function saveEntry(obj) {
    const next = bookmarks.some(b => b.id === obj.id) ? bookmarks.map(b => b.id === obj.id ? {...b, ...obj} : b) : [...bookmarks, obj];
    if (!save(next, 'form')) return false;
    renderAll(); return true;
}

// Backdrop clicks do not silently discard a form; use Cancel, Close or Escape.

// ========== 拖拽排序：书签（DOM直接交换，不闪烁） ==========

let draggedElement = null;

function handleDragStart(e) {
    if (e.target.closest?.('button')) { e.preventDefault(); return; }
    closeCardActions(false);
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

function swapBookmarkNodes(first, second) {
    const parent = first.parentNode;
    if (!parent || parent !== second.parentNode || first === second) return;
    const placeholder = parent.ownerDocument.createComment('bookmark position');
    parent.replaceChild(placeholder, first);
    parent.replaceChild(first, second);
    parent.replaceChild(second, placeholder);
}

function handleDrop(e) {
    e.preventDefault(); e.stopPropagation();
    this.classList.remove('drag-over');

    if (this !== draggedElement && draggedElement && draggedElement.parentNode === bookmarksGrid && this.parentNode === bookmarksGrid) {
        const draggedBookmark = bookmarks.find(b => String(b.id) === draggedElement.dataset.id);
        const targetBookmark = bookmarks.find(b => String(b.id) === this.dataset.id);

        if (draggedBookmark && targetBookmark) {
            const draggedPos = bookmarks.findIndex(b => b.id === draggedBookmark.id);
            const targetPos = bookmarks.findIndex(b => b.id === targetBookmark.id);
            const next = bookmarks.slice();
            [next[draggedPos], next[targetPos]] = [next[targetPos], next[draggedPos]];
            if (!save(next)) return;

            swapBookmarkNodes(draggedElement, this);
        }
    }
}


// Delegate card actions and drag interactions once on the grid. This keeps large
// continuous collections from allocating dozens of listeners per bookmark.
bookmarksGrid.addEventListener('click', e => {
    const button = e.target.closest?.('.card-actions button');
    if (!button || !bookmarksGrid.contains(button)) return;
    e.stopPropagation();
    const card = button.closest('.bookmark-card');
    const bookmark = bookmarks.find(item => String(item.id) === card?.dataset.id);
    if (!card || !bookmark) return;
    if (button.classList.contains('more-btn')) {
        toggleCardActions(card.querySelector('.card-actions'));
        return;
    }
    switch (button.dataset.action) {
        case 'edit': {
            openModal('edit', bookmark);
            modalReturnFocus = card.querySelector('.more-btn');
            modalReturnBookmark = String(bookmark.id);
            break;
        }
        case 'delete': {
            if (!confirm('确认删除【' + bookmark.title + '】？')) return;
            const currentList = getFilteredBookmarks();
            const index = currentList.findIndex(item => String(item.id) === String(bookmark.id));
            const nextId = currentList[index + 1]?.id ?? currentList[index - 1]?.id;
            if (!save(bookmarks.filter(item => String(item.id) !== String(bookmark.id)))) return;
            renderAll();
            if (nextId !== undefined) focusBookmark(nextId); else document.getElementById('addBtn').focus();
            showToast('已删除 ' + bookmark.title, 'success');
            break;
        }
        case 'move-up': moveBookmark(bookmark.id, -1); break;
        case 'move-down': moveBookmark(bookmark.id, 1); break;
    }
});
const cardForDragEvent = e => {
    const card = e.target.closest?.('.bookmark-card');
    return card && card.parentNode === bookmarksGrid ? card : null;
};
bookmarksGrid.addEventListener('dragstart', e => { const card = cardForDragEvent(e); if (card) handleDragStart.call(card, e); });
bookmarksGrid.addEventListener('dragend', e => { const card = cardForDragEvent(e); if (card) handleDragEnd.call(card, e); });
bookmarksGrid.addEventListener('dragover', e => { if (cardForDragEvent(e)) handleDragOver(e); });
bookmarksGrid.addEventListener('dragenter', e => { const card = cardForDragEvent(e); if (card) handleDragEnter.call(card, e); });
bookmarksGrid.addEventListener('dragleave', e => { const card = cardForDragEvent(e); if (card) handleDragLeave.call(card, e); });
bookmarksGrid.addEventListener('drop', e => { const card = cardForDragEvent(e); if (card) handleDrop.call(card, e); });

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
    e.preventDefault(); e.stopPropagation();
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
    showToast('已请求下载 JSON 文件', 'success');
});

const importFile = document.getElementById('importFile');
document.getElementById('importBtn').addEventListener('click', () => { closeUtilityPanel(true); importFile.click(); });

function setImportReading(reading) {
    document.getElementById('dataPanel').setAttribute('aria-busy', String(reading));
    const status = document.getElementById('importStatus');
    status.hidden = !reading; status.textContent = reading ? '正在读取 JSON…' : '';
}

function readImportFile(file) {
    if (!file) return;
    clearTaskError('data');
    setImportReading(true);
    const version = ++importReadVersion;
    if (activeImportReader?.readyState === 1) activeImportReader.abort();
    const reader = new FileReader();
    activeImportReader = reader;
    reader.onload = () => {
        if (version !== importReadVersion) return;
        activeImportReader = null;
        setImportReading(false);
        let data;
        try { data = JSON.parse(reader.result); }
        catch (error) { showTaskError('JSON 解析错误。请选择有效的书签 JSON 文件；当前收藏未改变。', 'data'); return; }
        importBookmarks(data);
    };
    reader.onerror = () => {
        if (version !== importReadVersion) return;
        activeImportReader = null;
        setImportReading(false);
        showTaskError('文件读取失败。请重新选择可读取的 JSON 文件；当前收藏未改变。', 'data');
    };
    try { reader.readAsText(file); }
    catch (error) {
        activeImportReader = null; setImportReading(false);
        showTaskError('文件无法读取。请重新选择 JSON 文件；当前收藏未改变。', 'data');
    }
}

importFile.addEventListener('change', e => {
    readImportFile(e.target.files[0]);
    importFile.value = '';
});

// ========== 深色模式 ==========

function initTheme() {
    const saved = readSetting(THEME_KEY, '');
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    applyTheme(saved === 'dark' || saved === 'light' ? saved : systemDark ? 'dark' : 'light', false);
}

function applyTheme(theme, persist = true) {
    theme = theme === 'dark' ? 'dark' : 'light';
    if (persist && !writeSetting(THEME_KEY, theme)) return false;
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('themeIcon').className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    const button = document.getElementById('themeToggle');
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    button.title = theme === 'dark' ? '切换为浅色模式' : '切换为深色模式';
    initAccent();
    return true;
}

document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ========== Toast 通知 ==========

function showToast(message, type = 'info') {
    if (type === 'error') { showTaskError(message); return; }
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

function handleGlobalKeydown(e) {
    if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    // Modal scope takes priority even when a button, rather than an input, has focus.
    if (modal.classList.contains('show')) {
        if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
        return;
    }
    if (activeCardActions && e.key === 'Escape') { e.preventDefault(); closeCardActions(true); return; }
    if (activeUtilityPanel) return;
    if (e.key === '/' && !isInputFocused()) { e.preventDefault(); searchInput.focus(); }
    if (e.key === 'Escape' && document.activeElement === searchInput) {
        searchInput.blur(); searchInput.value = ''; searchQuery = ''; renderBookmarks();
    }
}
document.addEventListener('keydown', handleGlobalKeydown);

function isInputFocused() {
    const tag = document.activeElement.tagName.toLowerCase();
    return document.activeElement.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
}

// ========== 初始化 ==========

initTheme();
initAccent();
applyColumnPreference();
applyDensity();
renderAll();

// 自动聚焦搜索框
// Focus once on initial load; re-rendering must not interrupt forms or IME.
searchInput.focus({ preventScroll: true });

window.myNav = { get bookmarks() { return bookmarks; }, save, load, getCategories, importBookmarks };
console.log('网址导航已加载 ✓');


function importBookmarks(data) {
    clearTaskError('data');
    if (!validBookmarks(data)) { showTaskError('导入失败：请使用包含有效标题和 http / https 链接的书签数组。', 'data'); return false; }
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
    catch (error) { showTaskError('导入失败：浏览器存储不可用或空间不足。当前收藏未改变，请检查权限或释放空间后重试。', 'data'); return false; }
    bookmarks = next; storageDamaged = false; currentCategory = '全部';
    document.getElementById('storageWarning').hidden = true;
    renderAll(); showToast(`导入成功，共 ${next.length} 个书签`, 'success'); return true;
}
if (storageDamaged) { const warning = document.getElementById('storageWarning'); warning.hidden = false; warning.textContent = '原收藏数据无法读取或已经损坏。原始数据未被覆盖，请先从「导入 / 导出」导出原文件，再导入修复后的 JSON。'; }
document.getElementById('dismissOperationError').addEventListener('click', () => clearTaskError());
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (!['light', 'dark'].includes(readSetting(THEME_KEY, ''))) initTheme();
});
modal.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const items = [...modal.querySelectorAll('button,input')].filter(x => !x.disabled);
    const first = items[0], last = items[items.length-1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// Recalculate the visible column count when the available width changes.
window.addEventListener('resize', applyColumnPreference);
