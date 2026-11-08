const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('style.css', 'utf8') + '\n' + fs.readFileSync('polish.css', 'utf8');
function functions(names) {
  return names.map(name => source.match(new RegExp('^function ' + name + '\\([^]*?^\\}', 'm'))?.[0] || '').join('\n');
}
function node(id, rect={left:20,right:180,top:650,bottom:686,width:160,height:36}) {
  const props = {}, attrs = {}, children = [];
  return {id, hidden: true, style: {setProperty:(k,v)=>props[k]=v, removeProperty:k=>delete props[k]},
    props, attrs, children, value:'', disabled:false,
    classList:{toggle(){}}, setAttribute:(k,v)=>attrs[k]=String(v),
    getBoundingClientRect:()=>rect,
    contains(target){return target===this || children.includes(target);},
    querySelector(){return children[0] || null;}, querySelectorAll(){return children;},
    focus(){this.focused=true;}, closest(){return null;}
  };
}
function panels(width=1366,height=768) {
  const appearanceBtn=node('appearanceBtn'), dataPanelBtn=node('dataPanelBtn');
  const appearancePanel=node('appearancePanel',{width:Math.min(304,width-24),height:240}), dataPanel=node('dataPanel',{width:Math.min(304,width-24),height:166});
  const first=node('first'); appearancePanel.children.push(first); dataPanel.children.push(node('importBtn'));
  const map = new Map([['appearanceBtn',{button:appearanceBtn,panel:appearancePanel}],['dataPanelBtn',{button:dataPanelBtn,panel:dataPanel}]]);
  const context=vm.createContext({utilityPanels:map,activeUtilityPanel:null,window:{innerWidth:width,innerHeight:height},document:{documentElement:{clientWidth:width,clientHeight:height},activeElement:first},Math});
  vm.runInContext(functions(['positionUtilityPanel','closeUtilityPanel','toggleUtilityPanel','handleUtilityDismiss','handleUtilityFocus','handleUtilityKeydown']),context);
  return {context,map,appearanceBtn,dataPanelBtn,appearancePanel,dataPanel,first};
}
function requireFunction(context,name){assert.equal(typeof context[name],'function',name+' must exist');return context[name];}

test('utility panels are outside the sidebar and fixed, never in normal flow',()=>{
  const sidebar=html.slice(html.indexOf('<aside'),html.indexOf('</aside>'));
  assert.doesNotMatch(sidebar,/id="(?:appearancePanel|dataPanel)"/);
  assert.match(css,/\.utility-panel\s*\{[^}]*position:\s*fixed/s);
  for(const name of ['appearance','data']) assert.match(html,new RegExp('id="'+name+'Panel"[^>]*role="dialog"'));
});
test('only one utility panel opens and the trigger state follows switching',()=>{
  const s=panels(),toggle=requireFunction(s.context,'toggleUtilityPanel');
  toggle('appearanceBtn');assert.equal(s.appearancePanel.hidden,false);assert.equal(s.appearanceBtn.attrs['aria-expanded'],'true');
  toggle('dataPanelBtn');assert.equal(s.appearancePanel.hidden,true);assert.equal(s.appearanceBtn.attrs['aria-expanded'],'false');assert.equal(s.dataPanel.hidden,false);
  toggle('dataPanelBtn');assert.equal(s.dataPanel.hidden,true);assert.equal(s.dataPanelBtn.attrs['aria-expanded'],'false');
});
test('Escape closes the panel and restores trigger focus',()=>{
  const s=panels();requireFunction(s.context,'toggleUtilityPanel')('appearanceBtn');
  let prevented=false;requireFunction(s.context,'handleUtilityKeydown')({key:'Escape',preventDefault:()=>prevented=true});
  assert.equal(s.appearancePanel.hidden,true);assert.equal(s.appearanceBtn.focused,true);assert.equal(prevented,true);
});
test('outside dismissal does not steal focus and inside clicks do not dismiss',()=>{
  const s=panels();requireFunction(s.context,'toggleUtilityPanel')('appearanceBtn');
  const dismiss=requireFunction(s.context,'handleUtilityDismiss');
  dismiss({target:s.first});assert.equal(s.appearancePanel.hidden,false);
  dismiss({target:s.dataPanelBtn});assert.equal(s.appearancePanel.hidden,false,'the other trigger performs switching');
  dismiss({target:node('searchInput')});assert.equal(s.appearancePanel.hidden,true);assert.notEqual(s.appearanceBtn.focused,true);
});
test('focus leaving the panel closes it without pulling focus back',()=>{
  const s=panels();requireFunction(s.context,'toggleUtilityPanel')('appearanceBtn');
  requireFunction(s.context,'handleUtilityFocus')({target:node('searchInput')});
  assert.equal(s.appearancePanel.hidden,true);assert.notEqual(s.appearanceBtn.focused,true);
});
test('positioning clamps both desktop and narrow windows',()=>{
  for(const width of [320,390,1366]){
    const s=panels(width);requireFunction(s.context,'toggleUtilityPanel')('appearanceBtn');
    const style=s.appearancePanel.style; const left=parseFloat(style.left),top=parseFloat(style.top);
    assert.ok(left>=12 && left+Math.min(304,width-24)<=width-12);
    assert.ok(top>=12 && top+240<=756);
  }
});
test('closing a closed panel is harmless',()=>{
  const s=panels();requireFunction(s.context,'closeUtilityPanel')(true);assert.equal(s.appearancePanel.hidden,true);
});

function accent(saved=null) {
  const values=new Map([['nav_theme','dark'],['nav_columns','16']]);if(saved!==null)values.set('nav_accent',saved);
  let writable=true, writes=0;const root=node('root'),custom=node('customColor'),dots=[node('green'),node('blue')];dots[0].dataset={color:'#367454'};dots[1].dataset={color:'#0284c7'};
  const errors=[];
  const ctx=vm.createContext({DEFAULT_ACCENT:'#367454',ACCENT_KEY:'nav_accent',document:{documentElement:root,getElementById:id=>id==='customColor'?custom:node(id),querySelectorAll:()=>dots},
    readSetting:(key,fb)=>values.get(key)??fb,writeSetting:(key,value)=>{if(!writable)return false;writes++;values.set(key,value);return true;},
    localStorage:{removeItem:key=>{if(!writable)throw Error('blocked');writes++;values.delete(key);}},showToast:message=>errors.push(message)});
  vm.runInContext(functions(['initAccent','renderAccent','applyAccent','resetAccent','updateColorDots','hexToRgba','adjustBrightness','accentTextColor']),ctx);
  return {ctx,values,root,custom,dots,errors,writes:()=>writes,fail:()=>writable=false};
}
test('loading accent is read-only',()=>{
 const s=accent('#0284c7');s.ctx.initAccent();assert.equal(s.writes(),0);assert.equal(s.root.props['--accent'],'#0284c7');
});
test('reset clears only the accent preference and theme-dependent inline overrides',()=>{
 const s=accent('#0284c7');s.ctx.initAccent();requireFunction(s.ctx,'resetAccent')();
 assert.equal(s.values.has('nav_accent'),false);assert.equal(s.values.get('nav_theme'),'dark');assert.equal(s.values.get('nav_columns'),'16');
 for(const key of ['--accent','--accent-hover','--accent-dim','--text-on-accent'])assert.equal(key in s.root.props,false);
 assert.equal(s.custom.value,'#367454');
});
test('failed reset and failed accent save keep visible and persisted state aligned',()=>{
 const s=accent('#0284c7');s.ctx.initAccent();s.fail();
 requireFunction(s.ctx,'resetAccent')();assert.equal(s.values.get('nav_accent'),'#0284c7');assert.equal(s.root.props['--accent'],'#0284c7');
 s.custom.value='#e11d48';s.ctx.applyAccent('#e11d48');assert.equal(s.root.props['--accent'],'#0284c7');assert.equal(s.custom.value,'#0284c7');
});
test('preset buttons and custom color input keep accessible labels and selection state',()=>{
 assert.match(html,/id="resetAccent"[^>]*>恢复默认/);
 assert.match(html,/for="customColor"/);assert.doesNotMatch(html,/id="colorPickerBtn"/);
 const s=accent();s.ctx.initAccent();assert.equal(s.dots[0].attrs['aria-pressed'],'true');
});
test('demo and automatic recovery are retired from runtime',()=>{
 assert.doesNotMatch(html,/id="(?:demoBtn|restoreBtn)"/);assert.doesNotMatch(source,/DEMO_BOOKMARKS|demoMode|demoOriginal|my_nav_backup/);
});
function importer() {
 const old=[{id:'old',title:'旧',url:'https://old.example',category:'开发'}];let writable=true,confirmed=true;const values=new Map([['my_nav_v2',JSON.stringify(old)],['my_nav_backup','historic']]);const writes=[];
 const ctx=vm.createContext({STORAGE_KEY:'my_nav_v2',bookmarks:old,storageDamaged:false,currentCategory:'开发',currentPage:2,URL,confirm:()=>confirmed,
  localStorage:{setItem:(k,v)=>{if(!writable)throw Error('quota');writes.push(k);values.set(k,v);},getItem:k=>values.get(k)??null},
  document:{getElementById:()=>node('warning')},renderAll(){},showToast(){}});
 vm.runInContext(functions(['isSafeUrl','validBookmarks','genId','importBookmarks']),ctx);
 return {ctx,values,writes,fail:()=>writable=false,cancel:()=>confirmed=false};
}
test('JSON import replaces only after validation and creates no automatic snapshots',()=>{
 const s=importer();assert.equal(s.ctx.importBookmarks([{title:'新',url:'https://new.example'}]),true);
 assert.deepEqual(s.writes,['my_nav_v2']);assert.equal(s.values.get('my_nav_backup'),'historic');
 assert.equal(JSON.parse(s.values.get('my_nav_v2'))[0].title,'新');
});
test('cancelled, invalid and quota-failed imports preserve stored and visible bookmarks',()=>{
 for(const mode of ['cancel','invalid','quota']){
  const s=importer();if(mode==='cancel')s.cancel();if(mode==='quota')s.fail();
  const before=s.values.get('my_nav_v2');
  assert.equal(s.ctx.importBookmarks([{title:'新',url:mode==='invalid'?'javascript:alert(1)':'https://new.example'}]),false);
  assert.equal(s.values.get('my_nav_v2'),before);assert.equal(s.ctx.bookmarks[0].id,'old');
 }
});
test('list has named text areas and a separate category instead of three equal text columns',()=>{
 assert.match(css,/\.list-view \.meta\s*\{[^}]*grid-template-areas:\s*["']title description["']\s*["']url description["']/s);
 assert.match(source,/className = 'card-category'/);
 assert.match(css,/\.list-view \.card-title\s*\{[^}]*grid-area:\s*title/s);
});

test('Tab boundaries leave the non-modal panel instead of trapping focus',()=>{
 const s=panels();requireFunction(s.context,'toggleUtilityPanel')('appearanceBtn');
 let prevented=false;s.context.handleUtilityKeydown({key:'Tab',shiftKey:true,preventDefault:()=>prevented=true});
 assert.equal(s.appearancePanel.hidden,true);assert.equal(prevented,true);assert.equal(s.appearanceBtn.focused,true);
});
test('scrolling the trigger fully out of view dismisses a detached panel',()=>{
 const s=panels();requireFunction(s.context,'toggleUtilityPanel')('appearanceBtn');
 s.appearanceBtn.getBoundingClientRect=()=>({top:-80,bottom:-44,left:12,right:172});
 s.context.positionUtilityPanel();assert.equal(s.appearancePanel.hidden,true);assert.equal(s.appearanceBtn.attrs['aria-expanded'],'false');
});
test('theme reset remains safe after switching and repeated closure',()=>{
 const s=accent('#0284c7');s.ctx.initAccent();s.ctx.resetAccent();s.ctx.resetAccent();
 assert.equal(s.values.has('nav_accent'),false);assert.equal(s.custom.value,'#367454');assert.equal(s.values.get('nav_theme'),'dark');
});
function fileReaderHarness() {
 const readers=[], imported=[],errors=[];
 class Reader {constructor(){readers.push(this);this.readyState=0;}readAsText(){this.readyState=1;}abort(){this.readyState=2;} }
 const ctx=vm.createContext({FileReader:Reader,activeImportReader:null,importReadVersion:0,importBookmarks:data=>imported.push(data),showToast:message=>errors.push(message)});
 vm.runInContext(functions(['readImportFile']),ctx);return {ctx,readers,imported,errors};
}
test('a stale async file read cannot replace the latest selection',()=>{
 const s=fileReaderHarness();requireFunction(s.ctx,'readImportFile')({name:'first.json'});s.ctx.readImportFile({name:'second.json'});
 s.readers[1].result='[2]';s.readers[1].onload();s.readers[0].result='[1]';s.readers[0].onload();
 assert.equal(s.readers[0].readyState,2);assert.equal(JSON.stringify(s.imported),'[[2]]');
});
test('file errors and invalid JSON never reach the import commit',()=>{
 const s=fileReaderHarness();requireFunction(s.ctx,'readImportFile')({name:'bad.json'});s.readers[0].result='bad';s.readers[0].onload();
 s.ctx.readImportFile({name:'unreadable.json'});s.readers[1].onerror();
 assert.equal(s.imported.length,0);assert.equal(s.errors.length,2);
});
test('grid row geometry is preserved while list layout changes',()=>{
 assert.match(css,/\.bookmarks-grid:not\(\.list-view\)\s*\{\s*row-gap:\s*10px/);
 assert.match(css,/\.bookmarks-grid\.list-view\s*\{[^}]*--card-height:\s*68px/);
});
