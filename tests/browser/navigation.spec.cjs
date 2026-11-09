const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {seedBookmarks}=require('./fixtures.cjs');
const entry=(i)=>({id:'fixture-'+i,title:'站点 '+i,url:'https://example.org/'+i,desc:'本地测试收藏',category:'分类 '+i,icon:''});
async function ready(page){await page.evaluate(()=>document.fonts.ready);await expect(page.locator('.bookmark-card')).not.toHaveCount(0);}
async function capture(page,name){await expect(page.locator('.favicon .fa-spinner')).toHaveCount(0,{timeout:30000});fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/'+name+'.png',fullPage:true,animations:'disabled'});}
test('desktop approved design, filters, grid and no runtime exceptions',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await seedBookmarks(page);await ready(page);
 await expect(page.locator('.bookmark-card')).toHaveCount(12);
 await capture(page,'desktop-grid');
 await page.locator('.cat-chip').filter({hasText:'AI 工具'}).click();await expect(page.locator('.bookmark-card')).toHaveCount(2);
 await page.locator('.cat-chip').filter({hasText:'全部书签'}).click();await page.getByRole('searchbox').fill('GitHub');await expect(page.locator('.bookmark-card')).toHaveCount(1);
 await page.getByRole('searchbox').fill('');await expect(page.locator('#listViewBtn,#gridViewBtn')).toHaveCount(0);await capture(page,'desktop-grid-cleared');
 await page.getByRole('button',{name:'外观设置',exact:true}).click();await page.locator('#themeToggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await capture(page,'desktop-dark');
 const ratio=await page.locator('.cat-chip.active').evaluate(el=>{const st=getComputedStyle(el);const lum=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return .2126*v[0]+.7152*v[1]+.0722*v[2]};const a=lum(st.color),b=lum(st.backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05)});expect(ratio).toBeGreaterThanOrEqual(4.5);
 await page.locator('#themeToggle').hover();
 const hoverColor=await page.locator('#themeToggle').evaluate(el=>({actual:getComputedStyle(el).color,expected:getComputedStyle(el).getPropertyValue('--text-primary').trim()}));
 expect(hoverColor.actual).toBe('rgb(237, 244, 238)');expect(errors).toEqual([]);
});
test('real add edit cancel delete and persistence',async({page})=>{
 await page.goto('/');await page.locator('#addBtn').click();await page.locator('#siteTitle').fill('测试收藏');await page.locator('#siteUrl').fill('example.com:8080/path');await page.locator('#siteCategory').fill('测试分类');await page.locator('#modalSave').click();await expect(page.locator('#modal')).not.toHaveClass(/show/);
 await page.reload();await expect(page.locator('.bookmark-card').filter({hasText:'测试收藏'})).toHaveCount(1);
 const card=page.locator('.bookmark-card').filter({hasText:'测试收藏'});await card.locator('[aria-expanded]').click();await card.locator('.edit-btn').click();await expect(page.locator('#siteTitle')).toBeFocused();await page.locator('#siteTitle').fill('不保存');await capture(page,'desktop-edit');await page.locator('#modalCancelBtn').click();await expect(card.locator('[aria-expanded]')).toBeFocused();
 await card.locator('[aria-expanded]').click();await card.locator('.edit-btn').click();await page.locator('#siteTitle').fill('已修改');await page.locator('#modalSave').click();
 const edited=page.locator('.bookmark-card').filter({hasText:'已修改'});await expect(edited).toHaveCount(1);await edited.locator('[aria-expanded]').click();page.once('dialog',d=>d.accept());await edited.locator('.delete-btn').click();await expect(page.locator('.bookmark-card').filter({hasText:'已修改'})).toHaveCount(0);
});
test('mobile layout category navigation and management controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await seedBookmarks(page);await ready(page);await capture(page,'mobile-grid');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.locator('.cat-chip').filter({hasText:'开发工具'}).click();await expect(page.locator('#bookmarkCount')).toContainText('3 个站点');await expect(page.locator('.bookmark-card')).toHaveCount(3);await page.locator('#addBtn').click();await expect(page.locator('#siteTitle')).toBeVisible();await capture(page,'mobile-add');await page.locator('#modalCancelBtn').click();await expect(page.locator('#modal')).not.toHaveClass(/show/);
 await page.locator('#appearanceBtn').click();await expect(page.locator('#resetAccent')).toBeVisible();
});
test('import validates before replacing, exports JSON and has no recovery control',async({page})=>{
 await page.goto('/');const initial=await page.evaluate(()=>window.myNav.bookmarks);
 await page.locator('#importFile').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{title:'危险',url:'javascript:alert(1)'}]))});await expect(page.locator('#operationError')).toBeVisible();expect(await page.evaluate(()=>window.myNav.bookmarks)).toEqual(initial);
 page.once('dialog',d=>d.accept());await page.locator('#importFile').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([entry(1),entry(2)]))});await expect(page.locator('.bookmark-card')).toHaveCount(2);expect(await page.evaluate(()=>localStorage.getItem('my_nav_backup'))).toBe(null);
 await expect(page.locator('#restoreBtn')).toHaveCount(0);
 await page.locator('#dataPanelBtn').click();const downloading=page.waitForEvent('download');await page.locator('#exportBtn').click();const download=await downloading;
 const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));expect(exported).toEqual([entry(1),entry(2)]);
 page.once('dialog',d=>d.accept());await page.locator('#importFile').setInputFiles({name:'original.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(initial))});await expect(page.locator('.bookmark-card')).toHaveCount(initial.length);
});
test('long categories expand naturally and management actions remain reachable by document scroll',async({page})=>{
 await page.setViewportSize({width:1200,height:700});await page.addInitScript(data=>localStorage.setItem('my_nav_v2',JSON.stringify(data)),Array.from({length:35},(_,i)=>entry(i)));await page.goto('/');
 const categories=page.locator('#categoryBar');
 const size=await categories.evaluate(x=>({height:x.clientHeight,scrollHeight:x.scrollHeight,overflow:getComputedStyle(x).overflowY}));
 expect(size.height).toBeGreaterThan(700);expect(size.scrollHeight).toBeLessThanOrEqual(size.height+1);
 expect(size.overflow).not.toMatch(/auto|scroll/);
 const footer=page.locator('#appearanceBtn');expect((await footer.boundingBox()).y).toBeGreaterThan(700);
 await footer.scrollIntoViewIfNeeded();await expect(footer).toBeInViewport();
 await capture(page,'desktop-many-categories');
});
