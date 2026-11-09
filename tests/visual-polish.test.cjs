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
  assert.match(app, /Number\.isSafeInteger\(saved\)/);
  assert.doesNotMatch(app, /Math\.min\(10, saved\)/);
  const baseCss = read('style.css');
  assert.match(baseCss, /--card-height:\s*var\(--size-grid-row\)/);
  assert.match(read('polish.css'), /--size-grid-row:\s*6\.2666666667rem/);
  assert.match(baseCss, /grid-template-rows:\s*repeat\(var\(--rows, 4\), var\(--card-height\)\)/);
});
test('distributed SVG subset keeps attribution and does not add fonts', () => {
  const license = read('THIRD_PARTY_NOTICES.md');
  assert.match(license, /Font Awesome Free/);
  assert.match(license, /CC BY 4\.0/);
  assert.match(license, /Fonticons/);
});

test('brand compass and favicon fallbacks exist and are included in the static build', () => {
  const svg = read('favicon.svg');
  assert.match(svg, /<svg[^>]+viewBox="0 0 128 128"/);
  assert.match(svg, /fill="#73d548"/);
  assert.match(html, /id="dynamicFavicon"[^>]+favicon\.svg/);
  assert.match(html, /id="brandMark"[^>]*class="brand-mark"/);
  assert.match(app, /function updateBrandAccentIcon/);
  assert.match(app, /encodeURIComponent\(brandIconSvg\(safeColor\)\)/);
  assert.match(app, /browserThemeColor\.content = safeColor\.toUpperCase\(\)/);
  const images = {'favicon-16x16.png':16,'favicon-32x32.png':32,'apple-touch-icon.png':180,'android-chrome-192x192.png':192,'android-chrome-512x512.png':512};
  for (const [file,size] of Object.entries(images)) {
    const bytes=fs.readFileSync(file);
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',file+' PNG signature');
    assert.equal(bytes.readUInt32BE(16),size,file+' width');
    assert.equal(bytes.readUInt32BE(20),size,file+' height');
    assert.ok(html.includes(file),file+' is referenced');
  }
  const ico=fs.readFileSync('favicon.ico');
  assert.equal(ico.readUInt16LE(0),0);assert.equal(ico.readUInt16LE(2),1);assert.ok(ico.readUInt16LE(4)>=3);
  const build=read('scripts/build.cjs');
  for(const file of ['favicon.svg','favicon.ico',...Object.keys(images)])assert.ok(build.includes(file),file+' is included');
});
