// Executes production functions with explicit DOM/storage doubles. Not browser evidence.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('style.css','utf8')+'\n'+fs.readFileSync('polish.css','utf8');
function functions(names){return names.map(n=>{const m=source.match(new RegExp('^function '+n+'\\([^]*?^\\}','m'));assert.ok(m,'Missing production function: '+n);return m[0];}).join('\n');}
function context(names,globals={}){const c=vm.createContext({URL, ...globals});vm.runInContext(functions(names),c);return c;}
function node(id='') { const attrs={},classes=new Set();return {id,attrs,hidden:false,textContent:'',value:'',dataset:{},isConnected:true,style:{},disabled:false,
 classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n),toggle:(n,v)=>v?classes.add(n):classes.delete(n)},
 setAttribute:(k,v)=>attrs[k]=String(v),removeAttribute:k=>delete attrs[k],getAttribute:k=>attrs[k]??null,
 focus(){this.focused=true;},contains(n){return n===this;},querySelector(){return null;}}; }

test('the supplied standard and its execution entry are in the project',()=>{
 assert.ok(fs.existsSync('UI_DESIGN_STANDARD.md'));assert.match(fs.readFileSync('AGENTS.md','utf8'),/UI_DESIGN_STANDARD\.md/);
});
test('required inputs have durable, field-associated errors and real labels',()=>{
 for(const id of ['siteTitle','siteUrl','siteIcon']){
  assert.match(html,new RegExp('id="'+id+'"[^>]*aria-describedby="[^"]*'+id+'Error'));
  assert.match(html,new RegExp('id="'+id+'Error"'));assert.match(html,new RegExp('for="'+id+'"'));
 }
 assert.match(html,/id="formError"/);assert.match(html,/id="dataError"/);assert.match(html,/id="appearanceError"/);
});
test('validation returns every missing field without mutating the draft',()=>{
 const c=context(['isSafeUrl','validateSiteEntry']);const draft={title:' ',url:'',desc:'保留我',category:'分类',icon:''};
 const r=c.validateSiteEntry(draft);assert.ok(r.errors.siteTitle);assert.ok(r.errors.siteUrl);assert.equal(draft.desc,'保留我');
});
test('validation accepts hostnames and ports, preserves text and rejects unsafe protocols',()=>{
 const c=context(['isSafeUrl','validateSiteEntry']);
 for(const url of ['example.com','localhost:3000','example.com:8080/path']){const r=c.validateSiteEntry({title:' 网站 ',url,desc:'描述',category:'',icon:''});assert.equal(Object.keys(r.errors).length,0);assert.equal(r.entry.url,'https://'+url);assert.equal(r.entry.title,'网站');}
 for(const url of ['javascript:alert(1)','data:text/html,x','ftp://example.org']){assert.ok(c.validateSiteEntry({title:'x',url}).errors.siteUrl);}
 assert.ok(c.validateSiteEntry({title:'x',url:'https://example.org',icon:'javascript:x'}).errors.siteIcon);
});
test('a field error is named and persists until cleared or resubmitted',()=>{
 const field=node('siteUrl'),error=node('siteUrlError');const c=context(['setFieldError'],{document:{getElementById:id=>id==='siteUrl'?field:error}});
 c.setFieldError('siteUrl','请输入 http 或 https 地址');assert.equal(error.hidden,false);assert.equal(field.attrs['aria-invalid'],'true');assert.match(error.textContent,/https/);
 c.setFieldError('siteUrl','');assert.equal(error.hidden,true);assert.equal(field.attrs['aria-invalid'],undefined);
});
test('modal shortcut priority blocks background search from every non-input target',()=>{
 let focused=0,closed=0;const modal=node();modal.classList.add('show');
 const c=context(['handleGlobalKeydown'],{modal,activeUtilityPanel:null,activeCardActions:null,searchInput:{focus:()=>focused++},closeModal:()=>closed++,isInputFocused:()=>false,document:{activeElement:node()}});
 c.handleGlobalKeydown({key:'/',preventDefault(){}});assert.equal(focused,0);
 c.handleGlobalKeydown({key:'Escape',preventDefault(){}});assert.equal(closed,1);
});
test('browser combinations and IME composition are not hijacked',()=>{
 let calls=0;const c=context(['handleGlobalKeydown'],{modal:node(),activeUtilityPanel:null,activeCardActions:null,searchInput:{focus:()=>calls++},isInputFocused:()=>false});
 for(const flag of ['ctrlKey','metaKey','altKey','isComposing'])c.handleGlobalKeydown({key:'/',[flag]:true,preventDefault(){}});
 assert.equal(calls,0);c.handleGlobalKeydown({key:'/',preventDefault(){}});assert.equal(calls,1);
});
test('modal background is made inert and the old state is restorable',()=>{
 const a=node('app'),b=node('skip');a.inert=false;b.inert=true;
 const c=context(['setModalBackground'],{modalBackgroundState:new Map(),document:{querySelectorAll:()=>[a,b]}});
 c.setModalBackground(true);assert.equal(a.inert,true);assert.equal(b.inert,true);
 c.setModalBackground(false);assert.equal(a.inert,false);assert.equal(b.inert,true);
});
test('runtime cards use separate link and action containers, decorative images have alt',()=>{
 assert.match(source,/createElement\('article'\)/);assert.match(source,/className = 'bookmark-link'/);assert.match(source,/img\.alt = ''/);
 assert.match(source,/card\.appendChild\(link\)/);assert.match(source,/card\.appendChild\(actions\)/);
});
function actionState(){const btn=node(),panel=node(),actions=node();actions.querySelector=s=>s.includes('aria-expanded')?btn:panel;return {btn,panel,actions};}
test('card action visibility and expanded state update together',()=>{
 const s=actionState();const c=context(['setCardActionsOpen']);c.setCardActionsOpen(s.actions,true);assert.equal(s.btn.attrs['aria-expanded'],'true');assert.equal(s.panel.hidden,false);
 c.setCardActionsOpen(s.actions,false);assert.equal(s.btn.attrs['aria-expanded'],'false');assert.equal(s.panel.hidden,true);
});
test('closing card actions restores focus only when explicitly requested',()=>{
 const s=actionState();const c=context(['setCardActionsOpen','closeCardActions'],{activeCardActions:s.actions});
 c.closeCardActions(false);assert.equal(s.btn.focused,undefined);assert.equal(c.activeCardActions,null);
 c.activeCardActions=s.actions;c.closeCardActions(true);assert.equal(s.btn.focused,true);
});
function independentRatio(a,b){const lum=x=>{const v=[1,3,5].map(i=>parseInt(x.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('custom palettes meet text contrast in default, hover and soft states',()=>{
 const c=context(['accentTextColor','adjustBrightness','contrastRatio','mixHex','readableAccent','hexToRgba','focusAccent','createAccentPalette']);
 const colors=['#367454','#d97706','#808080','#ffffff','#000000','#ffff00','#00ff00','#0284c7'];
 for(let n=0;n<128;n++)colors.push('#'+((n*1376317)%16777216).toString(16).padStart(6,'0'));
 for(const bg of ['#ffffff','#202b25'])for(const color of colors){const p=c.createAccentPalette(color,bg);for(const [fg,back]of [['--text-on-accent','--accent'],['--text-on-accent-hover','--accent-hover'],['--text-on-accent-soft','--accent-dim']])assert.ok(independentRatio(p[fg],p[back])>=4.5,`${color} ${bg} ${fg}`);assert.ok(independentRatio(p['--accent-text'],bg)>=4.5);}
});
test('selected counts do not dilute the tested accent background',()=>{
 assert.match(css,/\.cat-chip\.active \.cat-count\s*\{[^}]*background:\s*transparent/s);
 assert.match(css,/--text-on-accent-hover/);assert.match(css,/--text-on-accent-soft/);
});
test('move bookmark swaps the filtered neighbor without page state',()=>{
 const old=[{id:'a'},{id:'b'},{id:'c'}];let saved,focused;
 const c=context(['moveBookmark'],{bookmarks:old,getFilteredBookmarks:()=>old,save:v=>(saved=v,true),renderBookmarks(){},focusBookmark:id=>focused=id,closeCardActions(){},clearTaskError(){},showToast(){}});
 assert.equal(c.moveBookmark('b',1),true);assert.deepEqual(Array.from(saved,x=>x.id),['a','c','b']);assert.equal(focused,'b');assert.deepEqual(old.map(x=>x.id),['a','b','c']);
});
test('sort failure and boundary clicks do not mutate data',()=>{
 const old=[{id:'a'},{id:'b'}];const c=context(['moveBookmark'],{bookmarks:old,getFilteredBookmarks:()=>old,save:()=>false,closeCardActions(){},clearTaskError(){},renderBookmarks(){throw Error('must not render')},focusBookmark(){},showToast(){}});
 assert.equal(c.moveBookmark('a',-1),false);assert.equal(c.moveBookmark('a',1),false);assert.equal(c.bookmarks,old);
});
test('non-drag sorting is exposed for bookmarks and categories',()=>{
 assert.match(source,/move-up-btn/);assert.match(source,/move-down-btn/);assert.match(html,/id="categoryOrderSelect"/);assert.match(html,/id="categoryUpBtn"/);assert.match(html,/id="categoryDownBtn"/);
});
test('search engine selection and theme have programmatic state',()=>{
 assert.match(html,/data-engine="baidu"[^>]*aria-pressed="true"/);assert.match(html,/id="themeToggle"[^>]*aria-pressed/);
 assert.match(source,/btn\.setAttribute\('aria-pressed'/);assert.match(source,/prefers-color-scheme/);
});
test('theme initialization is read-only and the retired view preference is ignored',()=>{
 let call;const c=context(['initTheme'],{THEME_KEY:'nav_theme',readSetting:()=>'',window:{matchMedia:()=>({matches:true})},applyTheme:(...a)=>call=a});
 c.initTheme();assert.equal(call[0],'dark');assert.equal(call[1],false);
 assert.doesNotMatch(source,/applyView|nav_view/);
});
test('errors are persistent task feedback and demo/snapshot features remain removed',()=>{
 assert.match(source,/function showTaskError/);assert.doesNotMatch(functions(['showTaskError']),/setTimeout/);
 assert.doesNotMatch(source+html,/DEMO_BOOKMARKS|demoMode|demoBtn|restoreBtn|my_nav_backup/);
});
test('columns have no product ceiling and the effective grid adapts to available width',()=>{
 assert.doesNotMatch(functions(['getColumns','setColumns']),/Math\.min\(10|>=\s*10/);
 assert.match(functions(['applyColumnPreference']),/clientWidth/);
 assert.match(functions(['applyColumnPreference']),/205/);
 assert.doesNotMatch(source,/function measurePageSize|function renderPagination|ResizeObserver/);
 assert.match(source,/function getDensity/);assert.match(css,/--card-height/);
});

test('drag node swaps match saved order in either direction and for adjacent cards',()=>{
 const c=context(['swapBookmarkNodes']);
 for(const [a,b] of [[0,2],[2,0],[0,1],[1,0]]){
  const nodes=['a','b','c','d'].map(id=>({id}));const order=nodes.slice();
  const parent={ownerDocument:{createComment:()=>({id:'placeholder'})},replaceChild(next,old){const index=order.indexOf(old);assert.ok(index>=0);const existing=order.indexOf(next);if(existing>=0)order.splice(existing,1);order.splice(order.indexOf(old),1,next);next.parentNode=parent;old.parentNode=null;}};
  nodes.forEach(n=>n.parentNode=parent);
  const expected=nodes.map(x=>x.id);[expected[a],expected[b]]=[expected[b],expected[a]];
  c.swapBookmarkNodes(nodes[a],nodes[b]);assert.deepEqual(order.map(x=>x.id),expected);
 }
});

test('reordering command availability is recalculated from current data after a drag swap',()=>{
 const first={id:'first'},second={id:'second'};let list=[first,second];
 const up=node(),down=node();const actions={closest:()=>({dataset:{id:'first'}}),querySelector:s=>s==='.move-up-btn'?up:down};
 const c=context(['updateBookmarkMoveControls'],{getFilteredBookmarks:()=>list});
 c.updateBookmarkMoveControls(actions);assert.equal(up.disabled,true);assert.equal(down.disabled,false);
 list=[second,first];c.updateBookmarkMoveControls(actions);assert.equal(up.disabled,false);assert.equal(down.disabled,true);
});
