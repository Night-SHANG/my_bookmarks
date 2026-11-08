const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {seedBookmarks,sampleBookmarks}=require('./fixtures.cjs');
async function settle(page){await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});}
async function setup(page,width=1366,fileMode=false){
 await page.setViewportSize({width,height:width<=700?844:768});
 await page.route('**/*',route=>{const url=new URL(route.request().url());return url.protocol==='file:'||['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();});
 await page.goto(fileMode?pathToFileURL(path.join(process.cwd(),'index.html')).href:'/');
 await seedBookmarks(page);await settle(page);
}
async function capture(page,name){await settle(page);await expect(page.locator('.favicon .fa-spinner')).toHaveCount(0);fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/ui-'+name+'.png',fullPage:true,animations:'disabled'});}
async function layout(page){return page.evaluate(()=>Object.fromEntries(['.header','.search-section','#categoryBar','#bookmarksGrid','#pagination','#appearanceBtn','#dataPanelBtn'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return[selector,{x:r.x,y:r.y,width:r.width,height:r.height}];})));}
function unchanged(before,after){for(const selector of Object.keys(before))for(const key of ['x','y','width','height'])expect(Math.abs(before[selector][key]-after[selector][key]),selector+' '+key).toBeLessThan(.75);}
for(const width of [1366,390,320]){
 test('utility panels never move existing controls at '+width,async({page})=>{
  await setup(page,width);const before=await layout(page);const data=await page.evaluate(()=>localStorage.getItem('my_nav_v2'));
  for(const [button,panel,name]of [['appearanceBtn','appearancePanel','appearance'],['dataPanelBtn','dataPanel','data']]){
   await page.locator('#'+button).click();await expect(page.locator('#'+panel)).toBeVisible();await settle(page);unchanged(before,await layout(page));
   const box=await page.locator('#'+panel).boundingBox();expect(box.x).toBeGreaterThanOrEqual(11);expect(box.x+box.width).toBeLessThanOrEqual(width-11);expect(box.y).toBeGreaterThanOrEqual(11);expect(box.y+box.height).toBeLessThanOrEqual((width<=700?844:768)-11);
   await capture(page,name+'-'+width);await page.keyboard.press('Escape');await expect(page.locator('#'+button)).toBeFocused();unchanged(before,await layout(page));
  }
  expect(await page.evaluate(()=>localStorage.getItem('my_nav_v2'))).toBe(data);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}
test('switching, outside click and keyboard dismissal keep one consistent open state',async({page})=>{
 await setup(page);await page.locator('#appearanceBtn').click();await expect(page.locator('#appearanceBtn')).toHaveAttribute('aria-expanded','true');
 await page.locator('#dataPanelBtn').click();await expect(page.locator('#appearancePanel')).toBeHidden();await expect(page.locator('#appearanceBtn')).toHaveAttribute('aria-expanded','false');await expect(page.locator('#dataPanel')).toBeVisible();
 await page.locator('#searchInput').click();await expect(page.locator('#dataPanel')).toBeHidden();await expect(page.locator('#searchInput')).toBeFocused();
 await page.locator('#appearanceBtn').click();await page.locator('#resetAccent').focus();await page.keyboard.press('Tab');await expect(page.locator('#appearancePanel')).toBeHidden();
 await page.locator('#dataPanelBtn').click();await page.keyboard.press('Escape');await expect(page.locator('#dataPanelBtn')).toBeFocused();
 await page.locator('#appearanceBtn').click();await page.locator('#addBtn').click();await expect(page.locator('#appearancePanel')).toBeHidden();await expect(page.locator('#siteTitle')).toBeFocused();
});
for(const mode of ['light','dark']){
 test('accent reset restores '+mode+' defaults without changing view, columns or bookmarks',async({page})=>{
  await setup(page);if(mode==='dark')await page.locator('#themeToggle').click();await page.locator('#listViewBtn').click();
  const initial=await page.evaluate(()=>({data:localStorage.getItem('my_nav_v2'),columns:localStorage.getItem('nav_columns'),accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()}));
  await page.locator('#appearanceBtn').click();await page.locator('.color-dot[data-color="#0284c7"]').click();expect(await page.evaluate(()=>localStorage.getItem('nav_accent'))).toBe('#0284c7');
  await page.reload();await page.locator('#appearanceBtn').click();await expect(page.locator('.color-dot[data-color="#0284c7"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('#resetAccent').click();await expect(page.locator('#customColor')).toHaveValue('#367454');
  expect(await page.evaluate(()=>localStorage.getItem('nav_accent'))).toBe(null);expect(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--accent'))).toBe('');
  await page.reload();expect(await page.evaluate(()=>({data:localStorage.getItem('my_nav_v2'),columns:localStorage.getItem('nav_columns'),accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()}))).toEqual(initial);
  await expect(page.locator('html')).toHaveAttribute('data-theme',mode);await expect(page.locator('#bookmarksGrid')).toHaveClass(/list-view/);await capture(page,'list-'+mode);
 });
}
test('list aligns names and URLs, separates metadata, preserves editing and pagination',async({page})=>{
 await setup(page);await page.locator('#listViewBtn').click();const first=page.locator('.bookmark-card').first();
 const title=await first.locator('.card-title').boundingBox(),url=await first.locator('.card-url').boundingBox(),desc=await first.locator('.card-desc').boundingBox(),category=await first.locator('.card-category').boundingBox();
 expect(Math.abs(title.x-url.x)).toBeLessThan(1);expect(url.y).toBeGreaterThan(title.y);expect(desc.x).toBeGreaterThan(title.x+title.width);expect(category.x).toBeGreaterThan(desc.x);expect((await first.boundingBox()).height).toBe(68);
 await first.locator('[aria-expanded]').click();await first.locator('.edit-btn').click();await expect(page.locator('#siteTitle')).toBeFocused();await page.locator('#modalCancelBtn').click();await expect(first.locator('[aria-expanded]')).toBeFocused();
 const seen=[];for(;;){seen.push(...await page.locator('.bookmark-card').evaluateAll(items=>items.map(item=>item.dataset.id)));if(await page.locator('#nextPage').isDisabled())break;await page.locator('#nextPage').click();}
 expect(seen).toEqual(sampleBookmarks.map(item=>item.id));expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
});
test('mobile list keeps primary text and actions readable without horizontal overflow',async({page})=>{
 await setup(page,390);await page.locator('#listViewBtn').click();
 const first=page.locator('.bookmark-card').first();await expect(first.locator('.card-title')).toBeVisible();await expect(first.locator('.card-url')).toBeVisible();await expect(first.locator('.card-category')).toBeHidden();await expect(first.locator('.card-desc')).toBeHidden();
 await first.locator('[aria-expanded]').click();await expect(first.locator('.edit-btn')).toBeInViewport();await capture(page,'list-mobile');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('file-mode popovers and reset do not reload or modify bookmarks',async({page})=>{
 await setup(page,1366,true);const before=await layout(page);const saved=await page.evaluate(()=>localStorage.getItem('my_nav_v2'));
 await page.locator('#appearanceBtn').click();await page.locator('.color-dot[data-color="#0284c7"]').click();await page.locator('#resetAccent').click();unchanged(before,await layout(page));await page.keyboard.press('Escape');
 await page.reload();expect(await page.evaluate(()=>localStorage.getItem('my_nav_v2'))).toBe(saved);expect(await page.evaluate(()=>localStorage.getItem('nav_accent'))).toBe(null);await expect(page.locator('#demoBtn')).toHaveCount(0);await expect(page.locator('#restoreBtn')).toHaveCount(0);
});
test('large libraries do not rerender the grid when utility panels toggle',async({page})=>{
 await setup(page);const data=Array.from({length:5000},(_,i)=>({...sampleBookmarks[i%sampleBookmarks.length],id:'bulk-'+i}));await seedBookmarks(page,data);await settle(page);
 const metrics=await page.evaluate(()=>{
  const grid=document.getElementById('bookmarksGrid'),samples=[];const observer=new MutationObserver(()=>{});observer.observe(grid,{childList:true});
  for(let i=0;i<30;i++){const start=performance.now();document.getElementById('appearanceBtn').click();document.getElementById('dataPanelBtn').click();document.getElementById('dataPanelBtn').click();samples.push(performance.now()-start);}
  const mutations=observer.takeRecords().length;observer.disconnect();return{samplesMs:samples,gridChildMutations:mutations,renderedCards:grid.querySelectorAll('.bookmark-card').length,records:window.myNav.bookmarks.length,userAgent:navigator.userAgent};
 });
 expect(metrics.records).toBe(5000);expect(metrics.renderedCards).toBeLessThan(100);expect(metrics.gridChildMutations).toBe(0);const sorted=[...metrics.samplesMs].sort((a,b)=>a-b);expect(sorted[Math.floor(sorted.length*.95)]).toBeLessThan(200);
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/ui-panel-performance.json',JSON.stringify(metrics,null,2));
});
