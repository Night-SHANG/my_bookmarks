const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const start=source.indexOf('function getColumns()');
const end=source.indexOf('function brandIconSvg(');
assert.ok(start>=0&&end>start,'column functions must be defined before brand icon functions');
function setup(saved=null){
 let stored=saved,writable=true;const vars={},attrs={},button=()=>({disabled:false,addEventListener(type,fn){this[type]=fn;},click(){if(!this.disabled)this.clickHandler?.();}}),controls={colsIncrease:button(),colsDecrease:button(),densityCompactBtn:button(),densityComfortableBtn:button()},errors=[];
 controls.colsIncrease.addEventListener=(type,fn)=>{controls.colsIncrease.clickHandler=fn;};
 controls.colsDecrease.addEventListener=(type,fn)=>{controls.colsDecrease.clickHandler=fn;};
 const context=vm.createContext({
  COLUMNS_KEY:'nav_columns',
  colsDisplay:{textContent:'',title:'',setAttribute:(k,v)=>attrs[k]=v},
  window:{innerWidth:1800,addEventListener(){}},
  bookmarksGrid:{clientWidth:1800},
  getComputedStyle:()=>({columnGap:'10px'}),
  document:{documentElement:{style:{setProperty:(k,v)=>vars[k]=String(v)},dataset:{}},getElementById:id=>controls[id]},
  readSetting:(_key,fallback)=>stored??fallback,
  writeSetting:(_key,value)=>{if(!writable)return false;stored=String(value);return true;},
  showToast:message=>errors.push(message)
 });
 vm.runInContext(source.slice(start,end),context);
 return {context,controls,vars,attrs,errors,get:()=>context.getColumns(),set:n=>context.setColumns(n),apply:()=>context.applyColumnPreference(),stored:()=>stored,fail:()=>writable=false};
}
test('default is four columns without writing a preference',()=>{const s=setup();assert.equal(s.get(),4);assert.equal(s.apply(),4);assert.equal(s.stored(),null);assert.equal(s.vars['--columns'],'4');});
for(const value of [1,3,7,9,11,16,32,100,1000000000000]){
 test('preserves saved '+value+' column preference and fits the visible grid to width',()=>{
  const s=setup(String(value));assert.equal(s.get(),value);
  const visible=Math.min(value,9);
  assert.equal(s.apply(),visible);
  assert.equal(s.vars['--columns'],String(visible));
  assert.equal(s.context.colsDisplay.textContent,visible+'列');
  assert.equal(s.controls.colsDecrease.disabled,visible===1);
  assert.equal(s.controls.colsIncrease.disabled,visible===9);
  assert.equal(s.stored(),String(value));
 });
}
test('increments and decrements the user preference rather than a measured column count',()=>{
 const s=setup('8');assert.equal(s.set(9),true);assert.equal(s.stored(),'9');assert.equal(s.vars['--columns'],'9');
 assert.equal(s.set(8),true);assert.equal(s.stored(),'8');assert.equal(s.vars['--columns'],'8');
});
test('one is the minimum and safe integers remain the only technical limit',()=>{
 const s=setup('1');assert.equal(s.set(0),false);assert.equal(s.stored(),'1');
 assert.equal(s.set(Number.MAX_SAFE_INTEGER),true);assert.equal(s.stored(),String(Number.MAX_SAFE_INTEGER));
 assert.equal(s.controls.colsIncrease.disabled,true);
});
test('invalid values never persist or update the CSS preference',()=>{
 for(const value of [NaN,Infinity,4.5,'16',Number.MAX_SAFE_INTEGER+1]){
  const s=setup('8');assert.equal(s.set(value),false);assert.equal(s.stored(),'8');assert.equal(s.vars['--columns'],undefined);assert.equal(s.errors.length,1);
 }
});
test('storage failure leaves the saved preference and CSS unchanged',()=>{
 const s=setup('8');s.apply();s.fail();assert.equal(s.set(9),false);assert.equal(s.stored(),'8');assert.equal(s.vars['--columns'],'8');
});
test('effective columns adapt to available width while saved preference remains unchanged',()=>{
 const s=setup('8');
 assert.equal(s.get(),8);
 assert.equal(s.apply(),8);
 assert.equal(s.vars['--columns'],'8');
 s.context.bookmarksGrid.clientWidth=1200;
 assert.equal(s.apply(),6);
 assert.equal(s.get(),8);
 assert.equal(s.stored(),'8');
});

test('column buttons operate on the visible count and cannot accumulate hidden increments',()=>{
 const s=setup('100');
 assert.equal(s.apply(),9);
 assert.equal(s.controls.colsIncrease.disabled,true);
 s.controls.colsIncrease.click();
 assert.equal(s.stored(),'100');
 s.controls.colsDecrease.click();
 assert.equal(s.stored(),'8');
 assert.equal(s.apply(),8);
 s.controls.colsIncrease.click();
 assert.equal(s.stored(),'9');
 assert.equal(s.apply(),9);
 assert.equal(s.controls.colsIncrease.disabled,true);
 s.controls.colsIncrease.click();
 assert.equal(s.stored(),'9');
 s.controls.colsDecrease.click();
 assert.equal(s.stored(),'8');
 assert.equal(s.apply(),8);
});
