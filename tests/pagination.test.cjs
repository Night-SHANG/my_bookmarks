const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const entry=i=>({id:'b'+i,title:'站点'+i,url:'https://example.org/'+i,desc:'说明',category:i%2?'奇数':'偶数',icon:'favicon.svg'});
function setup(count=36,settings={}){
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://example.test',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document;w.confirm=()=>true;
 w.localStorage.setItem('my_nav_v2',JSON.stringify(Array.from({length:count},(_,i)=>entry(i))));
 for(const [key,value] of Object.entries(settings))w.localStorage.setItem(key,value);
 w.eval(fs.readFileSync('app.js','utf8'));
 return {w,d,grid:d.querySelector('#bookmarksGrid'),close:()=>w.close(),ids:()=>[...d.querySelectorAll('.bookmark-card')].map(x=>x.dataset.id)};
}
test('renders every bookmark in one continuous grid without pager or page state',()=>{
 const a=setup(36);try{
  assert.equal(a.ids().length,36);assert.equal(a.d.querySelector('#pagination'),null);
  assert.equal(a.d.querySelector('#nextPage'),null);assert.equal(a.d.querySelector('#prevPage'),null);
  for(const key of ['data-page','data-page-size','data-total-pages'])assert.equal(a.grid.hasAttribute(key),false);
 }finally{a.close();}
});
test('saved desktop columns remain unchanged through viewport resize events',()=>{
 const a=setup(36,{nav_columns:'8'});try{
  assert.equal(a.d.querySelector('#colsDisplay').textContent,'8列');
  assert.equal(a.d.documentElement.style.getPropertyValue('--columns'),'8');
  a.w.dispatchEvent(new a.w.Event('resize'));
  assert.equal(a.d.querySelector('#colsDisplay').textContent,'8列');
  assert.equal(a.d.documentElement.style.getPropertyValue('--columns'),'8');
  assert.equal(a.w.localStorage.getItem('nav_columns'),'8');
  assert.equal(a.ids().length,36);
 }finally{a.close();}
});
test('column controls change the saved preference itself, with a minimum of one and no product ceiling',()=>{
 const a=setup(3,{nav_columns:'8'});try{
  a.d.querySelector('#colsDecrease').click();assert.equal(a.d.querySelector('#colsDisplay').textContent,'7列');
  assert.equal(a.w.localStorage.getItem('nav_columns'),'7');
 }finally{a.close();}
 const b=setup(1,{nav_columns:'1'});try{
  assert.equal(b.d.querySelector('#colsDecrease').disabled,true);
  b.d.querySelector('#colsIncrease').click();assert.equal(b.d.querySelector('#colsDisplay').textContent,'2列');
 }finally{b.close();}
});
test('search and category filtering show every matching result without page transitions',()=>{
 const a=setup(80);try{
  const input=a.d.querySelector('#searchInput');input.value='站点';input.dispatchEvent(new a.w.Event('input'));
  assert.equal(a.ids().length,80);
  a.d.querySelector('[data-category="奇数"]').click();assert.equal(a.ids().length,40);
  input.value='站点 79';input.dispatchEvent(new a.w.Event('input'));assert.deepEqual(a.ids(),['b79']);
  assert.equal(a.d.querySelector('#pagination'),null);
 }finally{a.close();}
});
test('density defaults to compact and persists the comfortable choice independently',()=>{
 const a=setup(12,{nav_columns:'8'});try{
  assert.equal(a.d.documentElement.getAttribute('data-density'),'compact');
  assert.equal(a.w.localStorage.getItem('nav_density'),null);
  assert.equal(a.d.querySelector('#densityCompactBtn').getAttribute('aria-pressed'),'true');
  a.d.querySelector('#densityComfortableBtn').click();
  assert.equal(a.d.documentElement.getAttribute('data-density'),'comfortable');
  assert.equal(a.w.localStorage.getItem('nav_density'),'comfortable');
  assert.equal(a.d.querySelector('#densityComfortableBtn').getAttribute('aria-pressed'),'true');
  assert.equal(a.d.querySelector('#colsDisplay').textContent,'8列');
  assert.equal(a.ids().length,12);
 }finally{a.close();}
});
test('sidebar category list has natural height and no nested scrolling rule',()=>{
 const css=fs.readFileSync('polish.css','utf8')+'\n'+fs.readFileSync('style.css','utf8');
 assert.doesNotMatch(css,/\\.category-bar\\s*\\{[^}]*overflow-y:\\s*auto/s);
 assert.doesNotMatch(css,/\\.category-bar\\s*\\{[^}]*flex:\\s*1 1 0/s);
});
