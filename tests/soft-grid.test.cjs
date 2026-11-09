// Focused production-function and stylesheet tests; not a browser compliance claim.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('style.css','utf8')+'\n'+fs.readFileSync('polish.css','utf8');
function functions(names){return names.map(name=>{
 const result=source.match(new RegExp('^function '+name+'\\([^]*?^\\}','m'));
 assert.ok(result, 'missing '+name);return result[0];
}).join('\n');}
function paletteContext(){const c=vm.createContext({});vm.runInContext(functions(['accentTextColor','contrastRatio','mixHex','readableAccent','adjustBrightness','hexToRgba','focusAccent','createAccentPalette']),c);return c;}
const presets=[...html.matchAll(/class="color-dot"[^>]*data-color="(#[0-9a-f]{6})"/g)].map(x=>x[1]);
const defaultColor=source.match(/const DEFAULT_ACCENT = '(#[0-9a-f]{6})'/)?.[1];
function hsl(hex){const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),hi=Math.max(r,g,b),lo=Math.min(r,g,b),l=(hi+lo)/2;return {s:hi===lo?0:(hi-lo)/(1-Math.abs(2*l-1)),l};}
test('only the bookmark grid remains; no hidden list toggle or list state machine',()=>{
 assert.doesNotMatch(html,/gridViewBtn|listViewBtn|view-switch/);
 assert.doesNotMatch(source,/applyView|nav_view|list-view/);
 assert.doesNotMatch(css,/list-view|view-switch|--size-list-row/);
});
test('retired pagination state is removed; columns and density are independent preferences',()=>{
 assert.doesNotMatch(source,/currentPage|totalPages|pageSize|measurePageSize|renderPagination|ResizeObserver/);
 assert.doesNotMatch(html,/id="pagination"|id="nextPage"|id="prevPage"/);
 assert.match(functions(['applyColumnPreference']),/clientWidth/);
 assert.match(functions(['applyColumnPreference']),/180/);
 assert.match(source,/window\.addEventListener\('resize', applyColumnPreference\)/);
 assert.match(source,/const DENSITY_KEY = 'nav_density'/);
 assert.match(source,/function getDensity\(\)/);
 assert.match(source,/function setDensity\(/);
 assert.match(html,/id="densityCompactBtn"/);assert.match(html,/id="densityComfortableBtn"/);
 assert.match(css,/data-density="comfortable"/);
});
test('nine fresh presets follow the bright reference palette',()=>{
 assert.equal(presets.length,9);assert.equal(new Set(presets).size,9);
 for(const hex of presets){const {s,l}=hsl(hex);assert.ok(s>=.40 && s<=.76,hex+' saturation');assert.ok(l>=.50&&l<=.75,hex+' lightness');}
 assert.equal(defaultColor,presets[0]);assert.equal(defaultColor,'#73d548');assert.match(html,/鲜叶绿/);assert.match(html,/晴空蓝/);
});
test('search uses the rounded theme-colored ring instead of the black outline',()=>{
 assert.doesNotMatch(css,/\.search-input:focus[^{}]*\{[^}]*outline:\s*2px solid var\(--text-primary\)/s);
 assert.match(css,/\.search-input:focus\s*\{[^}]*outline:\s*none/s);
 assert.match(css,/\.search-input:focus\s*\{[^}]*box-shadow:[^}]*var\(--focus-color\)[^}]*var\(--focus-ring\)/s);
 assert.match(css,/@media\s*\(forced-colors:\s*active\)\s*\{[^]*?\.search-input:focus[^{}]*\{[^}]*outline:\s*2px solid Highlight/s);
});
test('new focus and text pairs stay readable for every preset in both themes',()=>{
 const c=paletteContext();
 for(const bg of ['#ffffff','#202b25'])for(const color of presets){
  const p=c.createAccentPalette(color,bg);
  for(const [fg,back]of [['--text-on-accent','--accent'],['--text-on-accent-hover','--accent-hover'],['--text-on-accent-soft','--accent-dim']])assert.ok(c.contrastRatio(p[fg],p[back])>=4.5,color+fg);
  for(const back of bg==='#ffffff'?['#ffffff','#f5f6f3']:['#202b25','#151c19','#25332b'])assert.ok(c.contrastRatio(p['--focus-color'],back)>=3,color+' focus '+back);
  assert.match(p['--focus-ring'],/^rgba\(/);
 }
});
test('custom black, white and bright colors keep a visible focus indicator',()=>{
 const c=paletteContext();
 for(const color of ['#ffffff','#000000','#808080','#ffff00','#00ff00','#ff0000'])for(const bg of ['#ffffff','#202b25']){
  const p=c.createAccentPalette(color,bg);assert.equal(p['--accent'],color);
  assert.ok(c.contrastRatio(p['--focus-color'],bg)>=3);
 }
});
test('soft category selection is a tint rather than a solid accent slab',()=>{
 const polish=fs.readFileSync('polish.css','utf8');
 assert.match(polish,/\.cat-chip\.active,\s*\.cat-chip\.active:hover,[^]*?\{\s*background:\s*var\(--accent-dim\)/);
 assert.match(polish,/\.cat-chip\.active \.cat-count\s*\{[^}]*color:\s*var\(--text-on-accent-soft\)/);
});
test('search keeps its name, initial focus, and the non-modal settings panel',()=>{
 assert.match(html,/id="searchInput"[^>]*aria-label="[^"]+"/);
 assert.match(source,/searchInput\.focus\(\{ preventScroll: true \}\)/);
 assert.match(css,/\.utility-panel\s*\{[^}]*position:\s*fixed/s);
 assert.match(html,/id="resetAccent"/);
});
test('reset CSS tokens agree with the generated default palette in light and dark',()=>{
 const c=paletteContext(),polish=fs.readFileSync('polish.css','utf8');
 for(const [selector,bg]of [[':root','#ffffff'],['[data-theme="dark"]','#202b25']]){
  const start=polish.indexOf(selector+' {'),end=polish.indexOf('}',start);
  assert.ok(start>=0);const block=polish.slice(start,end);
  for(const [key,value]of Object.entries(c.createAccentPalette(defaultColor,bg))){
   const actual=block.match(new RegExp(key+':\\s*([^;\\n]+)'))?.[1].trim();
   assert.equal(actual,value,selector+' '+key);
  }
 }
});
