const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const start=source.indexOf('function getColumns()');
const end=source.indexOf('function brandIconSvg(');
assert.ok(start>=0&&end>start,'column functions must be defined before brand icon functions');
function setup(saved=null){
 let stored=saved,writable=true;const vars={},attrs={},controls={colsIncrease:{},colsDecrease:{}},errors=[];
 const context=vm.createContext({
  COLUMNS_KEY:'nav_columns',
  colsDisplay:{textContent:'',title:'',setAttribute:(k,v)=>attrs[k]=v},
  document:{documentElement:{style:{setProperty:(k,v)=>vars[k]=String(v)}},getElementById:id=>controls[id]},
  readSetting:(_key,fallback)=>stored??fallback,
  writeSetting:(_key,value)=>{if(!writable)return false;stored=String(value);return true;},
  showToast:message=>errors.push(message)
 });
 vm.runInContext(source.slice(start,end),context);
 return {context,controls,vars,attrs,errors,get:()=>context.getColumns(),set:n=>context.setColumns(n),apply:()=>context.applyColumnPreference(),stored:()=>stored,fail:()=>writable=false};
}
test('default is four columns without writing a preference',()=>{const s=setup();assert.equal(s.get(),4);assert.equal(s.apply(),4);assert.equal(s.stored(),null);assert.equal(s.vars['--columns'],'4');});
for(const value of [1,3,11,16,32,100,1000000000000]){
 test('reads and displays the saved '+value+' column preference without fitting it to width',()=>{
  const s=setup(String(value));assert.equal(s.get(),value);assert.equal(s.apply(),value);
  assert.equal(s.vars['--columns'],String(value));assert.equal(s.context.colsDisplay.textContent,value+'列');
  assert.equal(s.controls.colsDecrease.disabled,value===1);
  assert.equal(s.controls.colsIncrease.disabled,false);
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
test('column preference code does not inspect viewport or grid dimensions',()=>{
 const code=source.slice(start,end);
 assert.doesNotMatch(code,/innerWidth|clientWidth|getBoundingClientRect|getComputedStyle|ResizeObserver/);
});
