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

// ========== 工具函数 ==========

function genId() {
    return 'b_' + Math.random().toString(36).slice(2, 9);
}

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

function load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_BOOKMARKS.slice();
        return JSON.parse(raw);
    } catch (e) {
        console.error('数据加载错误:', e);
        return DEFAULT_BOOKMARKS.slice();
    }
}

// ========== 列数控制（最少3列，最多10列） ==========

function getColumns() {
    const saved = localStorage.getItem(COLUMNS_KEY);
    return saved ? parseInt(saved, 10) : 4;
}

function setColumns(n) {
    n = Math.max(3, Math.min(10, n));
    localStorage.setItem(COLUMNS_KEY, n);
    colsDisplay.textContent = n + '列';
    applyEffectiveColumns();
}

// 响应式：根据窗口宽度自动调整实际列数（卡片最小180px宽）
function applyEffectiveColumns() {
    const userCols = getColumns();
    const gridWidth = bookmarksGrid.clientWidth || window.innerWidth - 56;
    const minCardWidth = 180;
    const gap = 10;
    const maxFit = Math.floor((gridWidth + gap) / (minCardWidth + gap));
    const actual = Math.min(userCols, Math.max(1, maxFit));
    document.documentElement.style.setProperty('--columns', actual);
}

window.addEventListener('resize', applyEffectiveColumns);

document.getElementById('colsIncrease').addEventListener('click', () => setColumns(getColumns() + 1));
document.getElementById('colsDecrease').addEventListener('click', () => setColumns(getColumns() - 1));

// ========== 主题色自定义 ==========

const DEFAULT_ACCENT = '#c9553d';

function initAccent() {
    const saved = localStorage.getItem(ACCENT_KEY);
    if (saved) applyAccent(saved);
    else updateColorDots(DEFAULT_ACCENT);
}

function applyAccent(color) {
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-hover', adjustBrightness(color, -20));
    document.documentElement.style.setProperty('--accent-dim', hexToRgba(color, 0.08));
    localStorage.setItem(ACCENT_KEY, color);
    updateColorDots(color);

    // 更新自定义颜色输入
    const customInput = document.getElementById('customColor');
    if (customInput) customInput.value = color;
}

function updateColorDots(activeColor) {
    document.querySelectorAll('.color-dot').forEach(dot => {
        dot.classList.toggle('active', dot.dataset.color === activeColor);
    });
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

// 颜色选择器交互
document.getElementById('colorPickerBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('colorPanel').classList.toggle('show');
});

document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => applyAccent(dot.dataset.color));
});

document.getElementById('customColor').addEventListener('input', (e) => {
    applyAccent(e.target.value);
});

// 点击外部关闭颜色面板
document.addEventListener('click', (e) => {
    const panel = document.getElementById('colorPanel');
    if (!e.target.closest('.color-picker-wrapper') && panel.classList.contains('show')) {
        panel.classList.remove('show');
    }
});

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
    const defaultCategories = ['全部', ...Array.from(set).sort()];
    const storedOrder = JSON.parse(localStorage.getItem(CATEGORY_ORDER_KEY) || '[]');
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
        chip.textContent = cat;
        chip.draggable = true;

        chip.addEventListener('click', () => { currentCategory = cat; renderAll(); });

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

    list.forEach(b => {
        const card = document.createElement('a');
        card.href = b.url;
        card.target = '_blank';
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

        img.onload = function () {
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
            else fav.innerHTML = '<i class="fas fa-globe"></i>';
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
        desc.textContent = b.desc || ('分类：' + (b.category || '未分类'));

        meta.appendChild(title);
        meta.appendChild(url);
        meta.appendChild(desc);

        // 操作按钮
        const actions = document.createElement('div');
        actions.className = 'card-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn';
        editBtn.title = '编辑';
        editBtn.innerHTML = '<i class="fas fa-edit"></i>';
        editBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            openModal('edit', b);
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'action-btn delete-btn';
        delBtn.title = '删除';
        delBtn.innerHTML = '<i class="fas fa-trash"></i>';
        delBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (confirm('确认删除【' + b.title + '】？')) {
                bookmarks = bookmarks.filter(x => x.id !== b.id);
                save();
                renderAll();
                showToast('已删除 ' + b.title, 'success');
            }
        });

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
    renderBookmarks();
});

function performSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    openSearchOrUrl(q);
}

function openSearchOrUrl(q) {
    if (/^https?:\/\//i.test(q) || (/^([\w-]+\.)+[\w-]+(\/.*)?$/.test(q) && q.includes('.'))) {
        window.open(/^https?:\/\//i.test(q) ? q : 'https://' + q, '_blank');
    } else {
        window.open((engines[currentEngine] || engines.baidu)(q), '_blank');
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
        searchInput.focus();
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

    let finalUrl = url;
    if (!/^https?:\/\//i.test(url)) finalUrl = 'https://' + url;
    try { new URL(finalUrl); } catch (e) { showToast('链接格式不正确', 'error'); return; }

    saveEntry({
        id: modalMode === 'edit' ? editingId : genId(),
        title, url: finalUrl, desc, category: cat, icon
    });
    closeModal();
    showToast(modalMode === 'edit' ? '已更新 ' + title : '已添加 ' + title, 'success');
});

function openModal(mode, entry) {
    modalMode = mode;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    if (mode === 'add') {
        modalTitle.textContent = '添加站点';
        siteTitle.value = ''; siteUrl.value = ''; siteDesc.value = '';
        siteCategory.value = ''; siteIcon.value = '';
        editingId = null;
        setTimeout(() => siteTitle.focus(), 100);
    } else {
        modalTitle.textContent = '编辑站点';
        siteTitle.value = entry.title || '';
        siteUrl.value = entry.url || '';
        siteDesc.value = entry.desc || '';
        siteCategory.value = entry.category || '';
        siteIcon.value = entry.icon || '';
        editingId = entry.id;
    }
}

function closeModal() {
    modal.classList.remove('show');
    document.body.style.overflow = '';
}

function saveEntry(obj) {
    const exists = bookmarks.find(b => b.id === obj.id);
    if (exists) Object.assign(exists, obj);
    else bookmarks.push(obj);
    save();
    renderAll();
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
        const draggedBookmark = bookmarks.find(b => b.url === draggedElement.href);
        const targetBookmark = bookmarks.find(b => b.url === this.href);

        if (draggedBookmark && targetBookmark) {
            const draggedPos = bookmarks.findIndex(b => b.id === draggedBookmark.id);
            const targetPos = bookmarks.findIndex(b => b.id === targetBookmark.id);
            [bookmarks[draggedPos], bookmarks[targetPos]] = [bookmarks[targetPos], bookmarks[draggedPos]];
            save();

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
    e.dataTransfer.setData('text/plain', this.textContent);
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
        const draggedName = draggedCategory.textContent;
        const targetName = this.textContent;
        const draggedIndex = categories.indexOf(draggedName);
        const targetIndex = categories.indexOf(targetName);

        if (draggedIndex !== -1 && targetIndex !== -1) {
            const newCats = [...categories];
            const [moved] = newCats.splice(draggedIndex, 1);
            newCats.splice(targetIndex, 0, moved);
            localStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(newCats));

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
    const blob = new Blob([JSON.stringify(bookmarks, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'bookmarks.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('数据已导出', 'success');
});

const importFile = document.getElementById('importFile');
document.getElementById('importBtn').addEventListener('click', () => importFile.click());

importFile.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            if (Array.isArray(data)) {
                bookmarks = data;
                save();
                renderAll();
                showToast(`导入成功，共 ${data.length} 个书签`, 'success');
            } else {
                showToast('格式错误：需为书签数组', 'error');
            }
        } catch (err) { showToast('JSON 解析错误', 'error'); }
    };
    reader.readAsText(f);
    importFile.value = '';
});

// ========== 深色模式 ==========

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    applyTheme(saved || 'light');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('themeIcon').className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    localStorage.setItem(THEME_KEY, theme);
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
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}

// ========== 键盘快捷键 ==========

document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !isInputFocused()) {
        e.preventDefault();
        searchInput.focus();
    }
    if (e.key === 'Escape') {
        if (modal.classList.contains('show')) {
            closeModal();
        } else {
            // 关闭颜色面板
            const panel = document.getElementById('colorPanel');
            if (panel.classList.contains('show')) {
                panel.classList.remove('show');
            } else if (document.activeElement === searchInput) {
                searchInput.blur();
                searchInput.value = '';
                searchQuery = '';
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
setColumns(getColumns());

if (!localStorage.getItem(CATEGORY_ORDER_KEY)) {
    localStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(getCategories()));
}

renderAll();

// 自动聚焦搜索框
searchInput.focus();

window.myNav = { bookmarks, save, load, getCategories };
console.log('网址导航已加载 ✓');
