const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fixture=count=>Array.from({length:count},(_,i)=>({id:'standard-'+i,title:'收藏 '+i,url:'https://example.org/site/'+i,desc:i%2?'':'这是保留的站点描述',category:i%2?'开发':'学习',icon:'favicon.ico'}));
async function ready(page,count=36,file=false){
 await page.route('https://**/*',route=>route.abort());
 await page.goto(file?pathToFileURL(path.resolve('index.html')).href:'/');
 await page.evaluate(items=>{localStorage.clear();localStorage.setItem('my_nav_v2',JSON.stringify(items));localStorage.setItem('nav_theme','light');},fixture(count));
 await page.reload();await expect(page.locator('.bookmark-card').first()).toBeVisible();
 await expect(page.locator('.favicon .fa-spinner')).toHaveCount(0);
}
async function capture(page,name){fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/standard-'+name+'.png',fullPage:true,animations:'disabled'});}
async function stored(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('my_nav_v2')));}
async function ratio(locator){return locator.evaluate(el=>{
 const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
 const lum=s=>{const c=rgb(s).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2];};
 let bg=el;while(bg.parentElement&&getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)')bg=bg.parentElement;
 const a=lum(getComputedStyle(el).color),b=lum(getComputedStyle(bg).backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
});}

test('field errors are durable, associated and leave the draft intact',async({page})=>{
 await ready(page);await page.locator('#addBtn').click();await page.locator('#siteDesc').fill('不要丢失这段输入');await page.locator('#modalSave').click();
 await expect(page.locator('#siteTitle')).toHaveAttribute('aria-invalid','true');await expect(page.locator('#siteUrl')).toHaveAttribute('aria-invalid','true');
 await expect(page.locator('#siteTitle')).toBeFocused();await expect(page.locator('#siteUrlError')).toBeVisible();
 await page.waitForTimeout(3400); // The previous error vanished after about three seconds.
 await expect(page.locator('#siteUrlError')).toBeVisible();await expect(page.locator('#siteDesc')).toHaveValue('不要丢失这段输入');
 await page.locator('#siteTitle').fill('新收藏');await page.locator('#siteUrl').fill('javascript:alert(1)');await page.locator('#modalSave').click();
 await expect(page.locator('#siteUrl')).toBeFocused();await expect(page.locator('#siteUrlError')).toContainText('http');
 await capture(page,'field-errors');
 await page.locator('#siteUrl').fill('example.com:8080/path');await page.locator('#modalSave').click();await expect(page.locator('#modal')).not.toHaveClass(/show/);
 expect((await stored(page)).at(-1)).toMatchObject({title:'新收藏',url:'https://example.com:8080/path',desc:'不要丢失这段输入'});
});

test('modal blocks background shortcuts and focus, and restores the triggering control',async({page})=>{
 await ready(page);await page.locator('#addBtn').click();await page.locator('#modalSave').focus();await page.keyboard.press('/');
 await expect(page.locator('#modalSave')).toBeFocused();expect(await page.locator('.app').evaluate(el=>el.inert)).toBe(true);
 await page.locator('#searchInput').evaluate(el=>el.focus());
 expect(await page.evaluate(()=>document.getElementById('modal').contains(document.activeElement))).toBe(true);
 for(let i=0;i<12;i++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.getElementById('modal').contains(document.activeElement))).toBe(true);}
 await page.keyboard.press('Escape');await expect(page.locator('#addBtn')).toBeFocused();expect(await page.locator('.app').evaluate(el=>el.inert)).toBe(false);
 const card=page.locator('.bookmark-card').first();await card.locator('.more-btn').click();await card.locator('.edit-btn').click();await page.locator('#modalCancelBtn').click();await expect(card.locator('.more-btn')).toBeFocused();
});

test('links and commands are separate; expanded state, Escape and outside focus agree',async({page})=>{
 await ready(page);await expect(page.locator('.bookmark-link button')).toHaveCount(0);
 const cards=page.locator('.bookmark-card'),first=cards.nth(0),second=cards.nth(1);
 await first.locator('.more-btn').click();await expect(first.locator('.edit-btn')).toBeFocused();
 await second.locator('.more-btn').click();await expect(first.locator('.more-btn')).toHaveAttribute('aria-expanded','false');await expect(first.locator('.card-action-panel')).toBeHidden();
 await expect(second.locator('.more-btn')).toHaveAttribute('aria-expanded','true');await page.keyboard.press('Escape');await expect(second.locator('.more-btn')).toBeFocused();await expect(second.locator('.card-action-panel')).toBeHidden();
 await first.locator('.more-btn').click();await page.locator('#searchInput').click();await expect(page.locator('#searchInput')).toBeFocused();await expect(first.locator('.more-btn')).toHaveAttribute('aria-expanded','false');
 await expect(first.locator('.bookmark-link')).toHaveAttribute('href','https://example.org/site/0');
});

test('bookmark and category reordering work without dragging and persist',async({page})=>{
 await ready(page);const second=page.locator('[data-id="standard-1"]');await second.locator('.more-btn').click();await second.locator('.move-up-btn').click();
 expect((await stored(page)).slice(0,3).map(x=>x.id)).toEqual(['standard-1','standard-0','standard-2']);await expect(page.locator('[data-id="standard-1"] .more-btn')).toBeFocused();
 await page.locator('#categoryOrderBtn').click();await page.locator('#categoryOrderSelect').selectOption('开发');await page.locator('#categoryUpBtn').click();
 const order=await page.evaluate(()=>JSON.parse(localStorage.getItem('category_order')));expect(order.indexOf('开发')).toBeLessThan(order.length-1);
 await page.reload();expect((await stored(page))[0].id).toBe('standard-1');expect(await page.locator('.cat-chip').evaluateAll(nodes=>nodes.map(n=>n.dataset.category))).toEqual(order);
});

test('filtered cross-page move keeps unrelated items and search context',async({page})=>{
 await ready(page,80);await page.locator('#searchInput').fill('开发');
 const size=Number(await page.locator('#bookmarksGrid').getAttribute('data-page-size'));const last=page.locator('.bookmark-card').last();const id=await last.getAttribute('data-id');
 const before=await stored(page);await last.locator('.more-btn').click();await last.locator('.move-down-btn').click();
 await expect(page.locator('#bookmarksGrid')).toHaveAttribute('data-page','2');await expect(page.locator('#searchInput')).toHaveValue('开发');await expect(page.locator(`[data-id="${id}"] .more-btn`)).toBeFocused();
 const after=await stored(page);expect(after.filter(x=>x.category==='学习')).toEqual(before.filter(x=>x.category==='学习'));expect(after.filter(x=>x.category==='开发')[size].id).toBe(id);
});

for(const theme of ['light','dark'])test('accent text, selected counts and hover contrast in '+theme,async({page})=>{
 await ready(page);if(theme==='dark')await page.locator('#themeToggle').click();
 for(const color of ['#d97706','#808080','#ffffff','#000000','#367454']){
  await page.locator('#appearanceBtn').click();
  // Test the color input event; this does not claim to test the OS color-picker UI.
  await page.locator('#customColor').evaluate((el,color)=>{el.value=color;el.dispatchEvent(new Event('input',{bubbles:true}));},color);
  await page.keyboard.press('Escape');
  for(const selector of ['.cat-chip.active','.cat-chip.active .cat-count','.engine-tab.active','#addBtn'])expect(await ratio(page.locator(selector).first()),selector+' '+color).toBeGreaterThanOrEqual(4.5);
  await page.locator('#addBtn').hover();expect(await ratio(page.locator('#addBtn'))).toBeGreaterThanOrEqual(4.5);await page.mouse.move(0,0);
 }
 await page.locator('#appearanceBtn').click();await page.locator('#resetAccent').click();await page.keyboard.press('Escape');
 expect(await page.evaluate(()=>localStorage.getItem('nav_accent'))).toBeNull();await capture(page,'contrast-'+theme);
});

test('failed saves preserve form input, theme and columns with persistent task errors',async({page})=>{
 await ready(page);const before=await stored(page);
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('blocked','QuotaExceededError');};});
 await page.locator('#themeToggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(page.locator('#operationError')).toBeVisible();
 await expect(page.locator('#listViewBtn,#gridViewBtn')).toHaveCount(0);
 await page.locator('#addBtn').click();await page.locator('#siteTitle').fill('未保存');await page.locator('#siteUrl').fill('example.com');await page.locator('#modalSave').click();
 await expect(page.locator('#formError')).toBeVisible();await expect(page.locator('#siteTitle')).toHaveValue('未保存');await expect(page.locator('#modal')).toHaveClass(/show/);expect(await stored(page)).toEqual(before);
});

test('failed JSON import keeps a persistent error and later retry clears it',async({page})=>{
 await ready(page);const before=await stored(page);
 await page.locator('#importFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});await expect(page.locator('#operationError')).toBeVisible();expect(await stored(page)).toEqual(before);
 page.once('dialog',d=>d.accept());await page.locator('#importFile').setInputFiles({name:'good.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture(2)))});
 await expect(page.locator('.bookmark-card')).toHaveCount(2);await expect(page.locator('#operationError')).toBeHidden();await expect(page.locator('#dataError')).toBeHidden();
});

for(const width of [1366,320])test('text growth, long values and popovers remain usable at '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await ready(page,20);
 await page.evaluate(()=>document.documentElement.style.fontSize='200%');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 const anchor=page.locator('#appearanceBtn');await anchor.scrollIntoViewIfNeeded();const before=await page.locator('#searchInput').boundingBox();await anchor.click();const after=await page.locator('#searchInput').boundingBox();
 expect(after.x).toBeCloseTo(before.x,1);expect(after.y).toBeCloseTo(before.y,1);
 const panel=await page.locator('#appearancePanel').boundingBox();expect(panel.x).toBeGreaterThanOrEqual(0);expect(panel.x+panel.width).toBeLessThanOrEqual(width+1);await page.keyboard.press('Escape');
 await page.locator('#addBtn').click();await page.locator('#siteTitle').fill('长标题'.repeat(30));await page.locator('#siteUrl').fill('wrong://地址');await page.locator('#modalSave').click();
 await expect(page.locator('#siteUrlError')).toBeVisible();await page.locator('#modalCancelBtn').scrollIntoViewIfNeeded();await expect(page.locator('#modalCancelBtn')).toBeInViewport();await capture(page,'text-growth-'+width);
});

test('file entry keeps modal and sorting semantics without demo or recovery controls',async({page})=>{
 await ready(page,10,true);await expect(page.locator('#demoBtn,#restoreBtn')).toHaveCount(0);
 await page.locator('.bookmark-card').first().locator('.more-btn').click();await page.locator('.card-action-panel:not([hidden]) .move-down-btn').click();expect((await stored(page))[1].id).toBe('standard-0');
 await page.locator('#addBtn').click();await page.locator('#modalSave').focus();await page.keyboard.press('/');await expect(page.locator('#modalSave')).toBeFocused();await page.keyboard.press('Escape');await capture(page,'file');
});
