const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const entry=(i)=>({id:'b'+i,title:'站点'+i,url:'https://example.org/'+i,desc:'说明',category:i%2?'奇数':'偶数'});
function setup(count=36,settings={}) {
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://example.test',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document;let height=306,width=1000;
 const grid=d.querySelector('#bookmarksGrid');
 Object.defineProperties(grid,{clientHeight:{get:()=>height},clientWidth:{get:()=>width}});
 w.confirm=()=>true;w.localStorage.setItem('my_nav_v2',JSON.stringify(Array.from({length:count},(_,i)=>entry(i))));
 for(const [key,value]of Object.entries(settings))w.localStorage.setItem(key,value);
 w.eval(fs.readFileSync('app.js','utf8'));
 return {w,d,grid,close:()=>w.close(),resize:(h,wd=width)=>{height=h;width=wd;w.dispatchEvent(new w.Event('resize'));},ids:()=>[...grid.querySelectorAll('.bookmark-card')].map(x=>x.dataset.id)};
}
test('renders only a full viewport page and exposes every bookmark through page controls',()=>{const a=setup();try{assert.equal(a.ids().length,12);assert.equal(a.grid.dataset.totalPages,'3');assert.ok(a.d.querySelector('.header #colsIncrease'));const ids=[];for(let i=0;i<3;i++){ids.push(...a.ids());a.d.querySelector('#nextPage').click();}assert.equal(new Set(ids).size,36);assert.equal(a.d.querySelector('#nextPage').disabled,true);assert.equal(a.d.querySelector('#prevPage').disabled,false);}finally{a.close();}});
test('default columns are four; saved column preference remains intact',()=>{for(const value of [null,'6']){const a=setup(36,value?{nav_columns:value}:{});try{assert.equal(a.w.localStorage.getItem('nav_columns'),value);assert.equal(a.d.querySelector('#colsDisplay').textContent,(value?'5':'4')+'列');}finally{a.close();}}});
test('search and category transitions reset to first page',()=>{const a=setup();try{a.d.querySelector('#nextPage').click();const input=a.d.querySelector('#searchInput');input.value='站点';input.dispatchEvent(new a.w.Event('input'));assert.equal(a.grid.dataset.page,'1');a.d.querySelector('#nextPage').click();a.d.querySelector('[data-category="奇数"]').click();assert.equal(a.grid.dataset.page,'1');assert.equal(a.grid.dataset.totalPages,'2');}finally{a.close();}});
test('deleting the last entry of the last page returns to a valid page',()=>{const a=setup(13);try{a.d.querySelector('#nextPage').click();assert.deepEqual(a.ids(),['b12']);a.d.querySelector('.delete-btn').click();assert.equal(a.grid.dataset.page,'1');assert.equal(a.ids().length,12);assert.equal(a.w.myNav.bookmarks.length,12);}finally{a.close();}});
test('viewport capacity changes without dropping data and page stays valid',()=>{const a=setup();try{a.d.querySelector('#nextPage').click();a.d.querySelector('#nextPage').click();a.resize(518);assert.equal(a.grid.dataset.pageSize,'20');assert.equal(a.grid.dataset.page,'2');assert.equal(a.ids().length,16);assert.equal(a.w.myNav.bookmarks.length,36);}finally{a.close();}});
test('list view paginates independently from column preference',()=>{const a=setup();try{a.d.querySelector('#listViewBtn').click();assert.equal(a.grid.dataset.pageSize,'3');assert.equal(a.ids().length,3);assert.equal(a.w.localStorage.getItem('nav_columns'),null);}finally{a.close();}});
test('page two edit and drag target the correct persisted identities',()=>{const a=setup();try{a.d.querySelector('#nextPage').click();a.d.querySelector('.edit-btn').click();a.d.querySelector('#siteTitle').value='已修改';a.d.querySelector('#modalSave').click();assert.equal(a.w.myNav.bookmarks[12].title,'已修改');const cards=a.grid.querySelectorAll('.bookmark-card');const event=new a.w.Event('dragstart',{bubbles:true});event.dataTransfer={setData(){}};cards[0].dispatchEvent(event);cards[1].dispatchEvent(new a.w.Event('drop',{bubbles:true}));assert.equal(a.w.myNav.bookmarks[12].id,'b13');assert.equal(a.w.myNav.bookmarks[13].id,'b12');assert.equal(a.w.myNav.bookmarks[0].id,'b0');}finally{a.close();}});
test('zero-height desktop grid falls back without clipping controls and recovers after resize',()=>{const a=setup();try{a.resize(0);assert.ok(a.d.querySelector('.app').classList.contains('compact-fallback'));assert.equal(a.ids().length,4);a.resize(306);assert.equal(a.d.querySelector('.app').classList.contains('compact-fallback'),false);assert.equal(a.ids().length,12);}finally{a.close();}});
test('toolbar reflects actual columns and decreasing a constrained preference immediately changes layout',()=>{const a=setup(36,{nav_columns:'6'});try{assert.equal(a.d.querySelector('#colsDisplay').textContent,'5列');assert.equal(a.w.localStorage.getItem('nav_columns'),'6');assert.equal(a.d.querySelector('#colsIncrease').disabled,true);assert.match(a.d.querySelector('#colsDisplay').title,/6/);a.d.querySelector('#colsDecrease').click();assert.equal(a.d.querySelector('#colsDisplay').textContent,'4列');assert.equal(a.grid.dataset.pageSize,'12');assert.equal(a.w.localStorage.getItem('nav_columns'),'4');}finally{a.close();}});
test('resizing never rewrites saved preference; wider viewport restores it',()=>{const a=setup(36,{nav_columns:'6'});try{a.resize(306,1500);assert.equal(a.d.querySelector('#colsDisplay').textContent,'6列');a.resize(306,1000);assert.equal(a.d.querySelector('#colsDisplay').textContent,'5列');assert.equal(a.w.localStorage.getItem('nav_columns'),'6');a.resize(306,1500);assert.equal(a.d.querySelector('#colsDisplay').textContent,'6列');}finally{a.close();}});
test('initial default columns do not write a preference until the user changes it',()=>{const a=setup();try{assert.equal(a.d.querySelector('#colsDisplay').textContent,'4列');assert.equal(a.w.localStorage.getItem('nav_columns'),null);a.d.querySelector('#colsIncrease').click();assert.equal(a.w.localStorage.getItem('nav_columns'),'5');}finally{a.close();}});

test('one, few, full and tail pages reserve the same viewport rows and columns',()=>{
 for(const count of [1,3,16,17]){
  const a=setup(count);
  a.resize(412);
  try{
   assert.equal(a.d.documentElement.style.getPropertyValue('--columns'),'4');
   assert.equal(a.grid.style.getPropertyValue('--rows'),'4','empty rows must remain explicit layout slots');
   assert.equal(a.grid.dataset.pageSize,'16');
   assert.equal(a.ids().length,Math.min(count,16));
   if(count===17){
    a.d.querySelector('#nextPage').click();
    assert.equal(a.ids().length,1);
    assert.equal(a.grid.style.getPropertyValue('--rows'),'4');
    assert.equal(a.d.documentElement.style.getPropertyValue('--columns'),'4');
    assert.equal(a.grid.dataset.pageSize,'16');
   }
  }finally{a.close();}
 }
});
test('filtering to a single bookmark does not collapse reserved layout slots',()=>{
 const a=setup(36);
 try{
  const input=a.d.querySelector('#searchInput');input.value='https://example.org/35';input.dispatchEvent(new a.w.Event('input'));
  assert.deepEqual(a.ids(),['b35']);
  assert.equal(a.grid.style.getPropertyValue('--rows'),'3');
  assert.equal(a.grid.dataset.pageSize,'12');
  input.value='';input.dispatchEvent(new a.w.Event('input'));
  assert.equal(a.ids().length,12);
  assert.equal(a.grid.style.getPropertyValue('--rows'),'3');
 }finally{a.close();}
});
test('reserved rows follow viewport capacity instead of forcing blank space to overflow',()=>{
 const a=setup(1);
 try{
  for(const [height,rows]of [[518,5],[306,3],[200,2],[94,1],[0,1],[306,3]]){
   a.resize(height);
   assert.equal(a.grid.style.getPropertyValue('--rows'),String(rows));
   assert.equal(a.grid.dataset.pageSize,String(rows*4));
   assert.equal(a.ids().length,1);
  }
 }finally{a.close();}
});
test('minimum column preference remains four while narrow layouts keep fitting and restore it',()=>{
 const a=setup(1,{nav_columns:'1'});
 try{
  assert.equal(a.d.documentElement.style.getPropertyValue('--columns'),'4');
  assert.equal(a.d.querySelector('#colsDecrease').disabled,true);
  for(const [width,columns]of [[370,1],[500,2],[1000,4]]){
   a.resize(306,width);
   assert.equal(a.d.documentElement.style.getPropertyValue('--columns'),String(columns));
   assert.equal(a.grid.style.getPropertyValue('--rows'),'3');
   assert.equal(a.w.localStorage.getItem('nav_columns'),'1','responsive layout must not rewrite stored data');
  }
 }finally{a.close();}
});
test('explicit row tracks use compact card height rather than stretching fractional rows',()=>{
 const dom=new JSDOM('<style>'+fs.readFileSync('style.css','utf8')+'</style>');
 try{
  const rules=[...dom.window.document.styleSheets[0].cssRules].filter(rule=>rule.selectorText==='.bookmarks-grid');
  const last=rules.at(-1).style;
  assert.equal(last.getPropertyValue('grid-template-rows'),'repeat(var(--rows, 4), var(--card-height))');
  assert.equal(last.getPropertyValue('grid-auto-rows'),'var(--card-height)');
  assert.equal(last.getPropertyValue('align-content'),'start');
 }finally{dom.window.close();}
});

test('list view reserves its own compact rows and returns to the grid without changing the column preference',()=>{
 const a=setup(1,{nav_columns:'6'});
 try{
  a.d.querySelector('#listViewBtn').click();
  assert.equal(a.d.documentElement.style.getPropertyValue('--columns'),'1');
  assert.equal(a.grid.style.getPropertyValue('--rows'),'3');
  assert.equal(a.grid.dataset.pageSize,'3');
  a.resize(518);
  assert.equal(a.grid.style.getPropertyValue('--rows'),'6');
  assert.equal(a.grid.dataset.pageSize,'6');
  a.d.querySelector('#gridViewBtn').click();
  assert.equal(a.grid.style.getPropertyValue('--rows'),'5');
  assert.equal(a.grid.dataset.pageSize,'25');
  assert.equal(a.w.localStorage.getItem('nav_columns'),'6');
 }finally{a.close();}
});
test('empty storage hides the grid and pager; no search matches keep an explicit but card-free grid',()=>{
 for(const count of [0,1]){
  const a=setup(count);
  try{
   if(count){a.d.querySelector('#searchInput').value='no-matching-bookmark';a.d.querySelector('#searchInput').dispatchEvent(new a.w.Event('input'));}
   assert.equal(a.ids().length,0);
   assert.equal(a.d.querySelector('#pagination').hidden,true);
   assert.equal(a.grid.style.getPropertyValue('--rows'),'3');
   assert.equal(a.grid.style.display,count?'grid':'none');
   assert.equal(a.d.querySelector('#emptyState').style.display,count?'none':'flex');
   assert.equal(a.grid.querySelectorAll('.no-results').length,count?1:0);
  }finally{a.close();}
 }
});

test('legacy three-column preference normalizes to four without shrinking sparse cards',()=>{
 const a=setup(1,{nav_columns:'3'});
 try{
  a.resize(412);
  assert.equal(a.d.querySelector('#colsDisplay').textContent,'4列');
  assert.equal(a.grid.style.getPropertyValue('--rows'),'4');
  assert.equal(a.grid.dataset.pageSize,'16');
  assert.equal(a.d.querySelector('#colsDecrease').disabled,true);
  a.d.querySelector('#colsDecrease').click();
  assert.equal(a.d.querySelector('#colsDisplay').textContent,'4列');
  a.d.querySelector('#colsIncrease').click();
  assert.equal(a.d.querySelector('#colsDisplay').textContent,'5列');
  assert.equal(a.w.localStorage.getItem('nav_columns'),'5');
 }finally{a.close();}
});
test('opening the page focuses search once and later rendering does not steal field focus',()=>{
 const a=setup(20);
 try{
  assert.equal(a.d.activeElement,a.d.querySelector('#searchInput'));
  // jsdom click() does not focus buttons as an actual pointer click does.
  a.d.querySelector('#addBtn').focus();
  a.d.querySelector('#addBtn').click();
  const title=a.d.querySelector('#siteTitle');
  assert.equal(a.d.activeElement,title);
  a.resize(412);
  assert.equal(a.d.activeElement,title);
  a.d.querySelector('#modalCancelBtn').click();
  assert.equal(a.d.activeElement,a.d.querySelector('#addBtn'));
  a.d.querySelector('#nextPage').click();
  assert.notEqual(a.d.activeElement,a.d.querySelector('#searchInput'));
 }finally{a.close();}
});
