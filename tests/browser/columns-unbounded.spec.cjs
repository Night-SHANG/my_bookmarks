const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const entry=i=>({id:'columns-'+i,title:'站点 '+i,url:'https://example.org/'+i,desc:i%2?'自定义说明':'',category:'测试分类',icon:'favicon.svg'});
async function setup(page,columns,width=3840,count=256){
 await page.setViewportSize({width,height:1080});
 await page.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)?route.continue():route.abort();});
 await page.goto('/');
 await page.evaluate(({columns,data})=>{localStorage.clear();localStorage.setItem('my_nav_v2',JSON.stringify(data));localStorage.setItem('nav_columns',String(columns));},{columns,data:Array.from({length:count},(_,i)=>entry(i))});
 await page.reload();await expect(page.locator('.bookmark-card').first()).toBeVisible();
}
test('ten to eleven columns works through the control and survives reload',async({page})=>{
 await setup(page,10);await page.locator('#colsIncrease').click();await expect(page.locator('#colsDisplay')).toHaveText('11列');
 await page.reload();await expect(page.locator('#colsDisplay')).toHaveText('11列');
 const columns=await page.locator('#bookmarksGrid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
 expect(columns).toBe(11);
});
test('sixteen columns stay sixteen across desktop resizing without rewriting preference',async({page})=>{
 await setup(page,16,3840,64);await expect(page.locator('#colsDisplay')).toHaveText('16列');
 await page.setViewportSize({width:1366,height:768});
 await expect(page.locator('#colsDisplay')).toHaveText('16列');
 expect(await page.locator('#bookmarksGrid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length)).toBe(16);
 expect(await page.evaluate(()=>localStorage.getItem('nav_columns'))).toBe('16');
 await page.setViewportSize({width:3840,height:1080});await expect(page.locator('#colsDisplay')).toHaveText('16列');
});
test('mobile grid reflows without overwriting desktop preference',async({page})=>{
 await setup(page,16,1366,24);await page.setViewportSize({width:390,height:844});
 expect(await page.locator('#bookmarksGrid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length)).toBe(2);
 expect(await page.evaluate(()=>localStorage.getItem('nav_columns'))).toBe('16');
 await page.setViewportSize({width:1366,height:768});
 expect(await page.locator('#bookmarksGrid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length)).toBe(16);
});
test('large libraries render every record in continuous flow with lazy favicon requests',async({page})=>{
 test.setTimeout(120000);
 await setup(page,8,1366,10000);
 const metrics=await page.evaluate(()=>{
  const grid=document.getElementById('bookmarksGrid');
  return {records:window.myNav.bookmarks.length,cards:grid.querySelectorAll('.bookmark-card').length,
   lazyImages:[...grid.querySelectorAll('img')].filter(img=>img.loading==='lazy').length,
   contentVisibility:getComputedStyle(grid.querySelector('.bookmark-card')).contentVisibility,
   documentHeight:document.documentElement.scrollHeight,viewport:innerHeight};
 });
 expect(metrics.records).toBe(10000);expect(metrics.cards).toBe(10000);expect(metrics.lazyImages).toBe(10000);
 expect(metrics.contentVisibility).toBe('auto');
 expect(metrics.documentHeight).toBeGreaterThan(metrics.viewport);
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/columns-performance.json',JSON.stringify(metrics,null,2));
});
