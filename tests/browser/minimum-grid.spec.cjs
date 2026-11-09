const {test,expect}=require('@playwright/test');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const fixtures=count=>Array.from({length:count},(_,i)=>({id:'minimum-'+i,title:'布局测试 '+i,url:'https://example.org/minimum/'+i,desc:'少量收藏描述',category:'测试',icon:'favicon.svg'}));
async function ready(page,count,settings={},file=false){
 await page.setViewportSize({width:1366,height:768});
 const url=file?pathToFileURL(path.resolve(process.env.BOOKMARKS_PREVIEW_DIR||'.','index.html')).href:'/';
 await page.goto(url);
 await page.evaluate(({items,settings})=>{localStorage.clear();localStorage.setItem('my_nav_v2',JSON.stringify(items));for(const [k,v]of Object.entries(settings))localStorage.setItem(k,v);},{items:fixtures(count),settings});
 await page.reload();await expect(page.locator('.bookmark-card').first()).toBeVisible();
 return url;
}
async function columns(page){return page.locator('#bookmarksGrid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);}
test('one, three and seventeen bookmarks render without empty reserved rows or pagination',async({page})=>{
 for(const count of [1,3,17]){
  await ready(page,count,{nav_columns:'4'});
  await expect(page.locator('.bookmark-card')).toHaveCount(count);
  expect(await columns(page)).toBe(4);
  await expect(page.locator('#pagination')).toHaveCount(0);
  const card=await page.locator('.bookmark-card').first().boundingBox();expect(card.height).toBeGreaterThanOrEqual(68);
 }
});
test('mobile reflow is separate and preserves desktop column preference',async({page})=>{
 await ready(page,3,{nav_columns:'8'});
 await page.setViewportSize({width:390,height:844});
 expect(await columns(page)).toBe(2);
 expect(await page.evaluate(()=>localStorage.getItem('nav_columns'))).toBe('8');
 await page.setViewportSize({width:1366,height:768});
 expect(await columns(page)).toBe(8);
 await expect(page.locator('#colsDisplay')).toHaveText('8列');
});
test('single result, full result and empty state preserve all data',async({page})=>{
 await ready(page,17,{nav_columns:'4'});
 await page.locator('#searchInput').fill('minimum/16');
 await expect(page.locator('.bookmark-card')).toHaveCount(1);
 await page.locator('#searchInput').fill('');
 await expect(page.locator('.bookmark-card')).toHaveCount(17);
 await page.locator('#searchInput').fill('no-match');
 await expect(page.locator('.bookmark-card')).toHaveCount(0);
 await expect(page.locator('.no-results')).toBeVisible();
 await page.locator('#searchInput').fill('');
 await expect(page.locator('.bookmark-card')).toHaveCount(17);
});
test('file entry retains density and columns across reload and direct keyboard search',async({page})=>{
 const url=await ready(page,12,{nav_columns:'6',nav_density:'comfortable'},true);
 await expect(page.locator('#densityComfortableBtn')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#colsDisplay')).toHaveText('6列');
 await page.reload();await expect(page.locator('#bookmarkCount')).toContainText('12 个站点');
 await page.getByRole('searchbox').fill('minimum/5');await expect(page.locator('.bookmark-card')).toHaveCount(1);
 expect(await page.evaluate(()=>localStorage.getItem('nav_columns'))).toBe('6');
 expect(await page.evaluate(()=>localStorage.getItem('nav_density'))).toBe('comfortable');
});
test('short viewport does not clip category navigation or force an inner scroller',async({page})=>{
 await ready(page,24,{nav_columns:'8'});
 await page.setViewportSize({width:1366,height:520});
 const state=await page.locator('#categoryBar').evaluate(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight,overflow:getComputedStyle(el).overflowY}));
 expect(state.scrollHeight).toBeLessThanOrEqual(state.height+1);
 expect(state.overflow).not.toMatch(/auto|scroll/);
});
