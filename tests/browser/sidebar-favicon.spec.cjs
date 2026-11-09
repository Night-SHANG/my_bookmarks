const {test,expect}=require('@playwright/test');
const iconSvg='<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#73d548"/><circle cx="16" cy="16" r="8" fill="#fff"/></svg>';
const entries=(count,categories=10)=>Array.from({length:count},(_,i)=>({id:'sidebar-'+i,title:'网站 '+i,url:'https://site-'+(i%categories)+'.example/',desc:'导航图标测试',category:'分类 '+(i%categories),icon:''}));
async function openSeeded(page,{width=1383,height=690,data=entries(30),extras={}}={}){
 await page.setViewportSize({width,height});
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1'||url.hostname==='localhost'||url.protocol==='file:')return route.continue();
  if(url.pathname==='/favicon.ico')return route.fulfill({status:200,contentType:'image/svg+xml',body:iconSvg});
  return route.fulfill({status:404,body:''});
 });
 await page.goto('/');
 await page.evaluate(({data,extras})=>{localStorage.clear();localStorage.setItem('my_nav_v2',JSON.stringify(data));for(const [key,value]of Object.entries(extras))localStorage.setItem(key,value);},{data,extras});
 await page.reload();
 await expect(page.locator('.bookmark-card').first()).toBeVisible();
}
async function waitForIcon(img){
 await img.scrollIntoViewIfNeeded();
 await expect.poll(()=>img.evaluate(el=>el.naturalWidth)).toBeGreaterThan(0);
 await expect.poll(()=>img.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
}
test('all automatic favicons load from the site origin instead of remaining globe placeholders',async({page})=>{
 const data=entries(10,10);
 await openSeeded(page,{data});
 await expect(page.locator('.bookmark-card')).toHaveCount(10);
 for(let i=0;i<data.length;i++){
  const img=page.locator('.bookmark-card').nth(i).locator('.favicon img');
  await waitForIcon(img);
  expect(await img.evaluate(el=>getComputedStyle(el).display)).not.toBe('none');
  expect(await img.evaluate(el=>new URL(el.currentSrc).pathname)).toBe('/favicon.ico');
 }
 await expect(page.locator('.favicon .fa-globe')).toHaveCount(0);
});
test('failed cached and user-supplied icon URLs fall back to the bookmark domain',async({page})=>{
 const data=[
  {id:'cached',title:'缓存图标',url:'https://cached.example/',desc:'',category:'测试',icon:''},
  {id:'custom',title:'自定义图标',url:'https://custom.example/',desc:'',category:'测试',icon:'https://broken.example/custom.png'}
 ];
 const cache={'cached.example':{url:'https://broken.example/stale.ico',timestamp:Date.now()}};
 await openSeeded(page,{data,extras:{favicon_cache_v1:JSON.stringify(cache)}});
 for(let i=0;i<2;i++){
  const img=page.locator('.bookmark-card').nth(i).locator('.favicon img');
  await waitForIcon(img);
  expect(await img.evaluate(el=>el.currentSrc)).toContain(i===0?'cached.example/favicon.ico':'custom.example/favicon.ico');
 }
 const updated=JSON.parse(await page.evaluate(()=>localStorage.getItem('favicon_cache_v1')));
 expect(updated['cached.example'].url).toContain('cached.example/favicon.ico');
});
test('short desktop viewport keeps the whole sidebar visible and pinned without an inner scroller',async({page})=>{
 const data=entries(30,10);
 await openSeeded(page,{width:1383,height:690,data});
 await expect(page.locator('.cat-chip')).toHaveCount(11);
 const state=await page.evaluate(()=>{
  const sidebar=document.querySelector('.sidebar'),category=document.getElementById('categoryBar'),footer=document.querySelector('.sidebar-footer');
  const side=sidebar.getBoundingClientRect(),foot=footer.getBoundingClientRect();
  return {pinned:sidebar.classList.contains('sidebar-pinned'),position:getComputedStyle(sidebar).position,sideTop:side.top,sideBottom:side.bottom,footerBottom:foot.bottom,scrollHeight:sidebar.scrollHeight,clientHeight:sidebar.clientHeight,categoryOverflow:getComputedStyle(category).overflowY,categoryScrollHeight:category.scrollHeight,categoryClientHeight:category.clientHeight,documentHeight:document.documentElement.scrollHeight,viewport:innerHeight};
 });
 expect(state.pinned).toBe(true);expect(state.position).toBe('sticky');
 expect(state.sideTop).toBeGreaterThanOrEqual(-1);expect(state.sideBottom).toBeLessThanOrEqual(691);
 expect(state.footerBottom).toBeLessThanOrEqual(691);
 expect(state.scrollHeight).toBeLessThanOrEqual(state.clientHeight+1);
 expect(state.categoryOverflow).not.toMatch(/auto|scroll/);
 expect(state.categoryScrollHeight).toBeLessThanOrEqual(state.categoryClientHeight+1);
 expect(state.documentHeight).toBeGreaterThan(state.viewport);
 await page.evaluate(()=>window.scrollTo(0,160));
 const after=await page.locator('.sidebar').boundingBox();
 expect(after.y).toBeCloseTo(0,0);
 await expect(page.locator('#appearanceBtn')).toBeInViewport();
 await expect(page.locator('.brand-mark')).toBeInViewport();
});
test('more categories than fit disables pinning and leaves the full document scrollable',async({page})=>{
 const data=entries(35,35);
 await openSeeded(page,{width:1200,height:700,data});
 const state=await page.evaluate(()=>{
  const sidebar=document.querySelector('.sidebar'),category=document.getElementById('categoryBar');
  return {pinned:sidebar.classList.contains('sidebar-pinned'),sideHeight:sidebar.getBoundingClientRect().height,viewport:innerHeight,categoryOverflow:getComputedStyle(category).overflowY,categoryHeight:category.scrollHeight,categoryClient:category.clientHeight};
 });
 expect(state.pinned).toBe(false);expect(state.sideHeight).toBeGreaterThan(state.viewport);
 expect(state.categoryOverflow).not.toMatch(/auto|scroll/);
 expect(state.categoryHeight).toBeLessThanOrEqual(state.categoryClient+1);
 const footer=page.locator('#appearanceBtn');
 await footer.scrollIntoViewIfNeeded();await expect(footer).toBeInViewport();
});
