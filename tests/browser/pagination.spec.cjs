const {test,expect}=require('@playwright/test');
const make=count=>Array.from({length:count},(_,i)=>({id:'continuous-'+i,title:'收藏 '+i,url:'https://example.org/'+i,desc:'连续列表测试',category:i%3?'开发':'阅读',icon:'favicon.svg'}));
async function ready(page,{width=1366,height=768,count=36,columns=8,density='compact'}={}){
 await page.setViewportSize({width,height});
 await page.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||u.protocol==='file:'?route.continue():route.abort();});
 await page.goto('/');await page.evaluate(({data,columns,density})=>{localStorage.clear();localStorage.setItem('my_nav_v2',JSON.stringify(data));localStorage.setItem('nav_columns',String(columns));localStorage.setItem('nav_density',density);},{data:make(count),columns,density});
 await page.reload();await expect(page.locator('.bookmark-card').first()).toBeVisible();
}
async function gridColumns(page){return page.locator('#bookmarksGrid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);}
test('24 bookmarks fit one compact screen at the saved eight-column preference',async({page})=>{
 await ready(page,{width:1334,height:657,count:24,columns:8});
 await expect(page.locator('.bookmark-card')).toHaveCount(24);
 await expect(page.locator('#colsDisplay')).toHaveText('8列');
 expect(await gridColumns(page)).toBe(8);
 await expect(page.locator('#pagination')).toHaveCount(0);
 const last=await page.locator('.bookmark-card').last().boundingBox();
 expect(last.bottom).toBeLessThanOrEqual(657);
 expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(657);
});
test('desktop resize changes card width but never changes saved or displayed columns',async({page})=>{
 await ready(page,{width:1864,height:874,count:24,columns:8});
 const wide=await page.locator('.bookmark-card').first().boundingBox();
 expect(await gridColumns(page)).toBe(8);
 await page.setViewportSize({width:1334,height:657});
 await expect(page.locator('#colsDisplay')).toHaveText('8列');
 expect(await gridColumns(page)).toBe(8);
 const narrow=await page.locator('.bookmark-card').first().boundingBox();
 expect(narrow.width).toBeLessThan(wide.width);
 expect(await page.evaluate(()=>localStorage.getItem('nav_columns'))).toBe('8');
 await expect(page.locator('.bookmark-card')).toHaveCount(24);
});
test('mobile gets a dedicated two-column layout without overwriting desktop preference',async({page})=>{
 await ready(page,{width:390,height:844,count:24,columns:8});
 expect(await gridColumns(page)).toBe(2);
 expect(await page.evaluate(()=>localStorage.getItem('nav_columns'))).toBe('8');
 await page.setViewportSize({width:1366,height:768});
 expect(await gridColumns(page)).toBe(8);
 await expect(page.locator('#colsDisplay')).toHaveText('8列');
});
test('larger libraries remain continuous document content with no nested grid or category scroller',async({page})=>{
 await ready(page,{width:1366,height:768,count:120,columns:8});
 await expect(page.locator('.bookmark-card')).toHaveCount(120);
 await expect(page.locator('#pagination')).toHaveCount(0);
 const state=await page.evaluate(()=>{
  const grid=document.getElementById('bookmarksGrid'),cats=document.getElementById('categoryBar');
  return {doc:document.documentElement.scrollHeight,viewport:innerHeight,gridOverflow:getComputedStyle(grid).overflowY,categoryOverflow:getComputedStyle(cats).overflowY,categoryHeight:cats.scrollHeight,categoryClient:cats.clientHeight};
 });
 expect(state.doc).toBeGreaterThan(state.viewport);
 expect(state.gridOverflow).not.toMatch(/auto|scroll/);
 expect(state.categoryOverflow).not.toMatch(/auto|scroll/);
 expect(state.categoryHeight).toBeLessThanOrEqual(state.categoryClient+1);
 await page.locator('.bookmark-card').last().scrollIntoViewIfNeeded();
 await expect(page.locator('.bookmark-card').last()).toBeInViewport();
});
test('search and category filters render all matches without page resets',async({page})=>{
 await ready(page,{count:80,columns:8});
 await page.locator('.cat-chip[data-category="开发"]').click();
 await expect(page.locator('.bookmark-card')).toHaveCount(53);
 await page.locator('#searchInput').fill('收藏');
 await expect(page.locator('.bookmark-card')).toHaveCount(53);
 await page.locator('#searchInput').fill('收藏 79');
 await expect(page.locator('.bookmark-card')).toHaveCount(0);
 await expect(page.locator('.no-results')).toBeVisible();
 await expect(page.locator('#pagination')).toHaveCount(0);
});
test('compact and comfortable density toggle persists without changing columns or bookmarks',async({page})=>{
 await ready(page,{count:24,columns:8,density:'compact'});
 await expect(page.locator('#densityCompactBtn')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.bookmark-card').first().locator('.card-url')).toBeHidden();
 const before=await page.locator('.bookmark-card').first().boundingBox();
 await page.locator('#appearanceBtn').click();await page.locator('#densityComfortableBtn').click();
 await expect(page.locator('#densityComfortableBtn')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.bookmark-card').first().locator('.card-url')).toBeVisible();
 const after=await page.locator('.bookmark-card').first().boundingBox();
 expect(after.height).toBeGreaterThan(before.height);
 expect(await page.evaluate(()=>localStorage.getItem('nav_density'))).toBe('comfortable');
 await expect(page.locator('.bookmark-card')).toHaveCount(24);
 await expect(page.locator('#colsDisplay')).toHaveText('8列');
 await page.reload();
 await expect(page.locator('#densityComfortableBtn')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.bookmark-card')).toHaveCount(24);
});
test('sidebar categories expand naturally and stay reachable on a short viewport',async({page})=>{
 await ready(page,{width:1366,height:520,count:24,columns:8});
 await expect(page.locator('.cat-chip')).toHaveCount(3);
 const box=await page.locator('#categoryBar').boundingBox();expect(box.height).toBeGreaterThan(0);
 const state=await page.locator('#categoryBar').evaluate(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight,overflow:getComputedStyle(el).overflowY}));
 expect(state.scrollHeight).toBeLessThanOrEqual(state.height+1);
 expect(state.overflow).not.toMatch(/auto|scroll/);
 expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeGreaterThanOrEqual(520);
});
