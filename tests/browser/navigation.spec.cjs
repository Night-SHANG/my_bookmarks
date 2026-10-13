const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const entry=(i)=>({id:'fixture-'+i,title:'站点 '+i,url:'https://example.org/'+i,desc:'本地测试收藏',category:'分类 '+i,icon:''});
async function ready(page){await page.evaluate(()=>document.fonts.ready);await expect(page.locator('.bookmark-card')).not.toHaveCount(0);}
async function capture(page,name){fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/'+name+'.png',fullPage:true});}
test('desktop approved design, filters, list and no runtime exceptions',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('button',{name:'体验演示数据',exact:true}).click();await ready(page);
 await expect(page.locator('.bookmark-card')).toHaveCount(12);
 await page.waitForFunction(()=>[...document.querySelectorAll('.favicon img')].every(x=>x.complete),{},{timeout:15000}).catch(()=>{});
 await capture(page,'desktop-grid');
 await page.locator('.cat-chip').filter({hasText:'AI 工具'}).click();await expect(page.locator('.bookmark-card')).toHaveCount(2);
 await page.locator('.cat-chip').filter({hasText:'全部书签'}).click();await page.getByRole('searchbox').fill('GitHub');await expect(page.locator('.bookmark-card')).toHaveCount(1);
 await page.getByRole('searchbox').fill('');await page.getByRole('button',{name:'列表视图',exact:true}).click();await expect(page.locator('#bookmarksGrid')).toHaveClass(/list-view/);await capture(page,'desktop-list');
 await page.getByRole('button',{name:'外观设置',exact:true}).click();await page.locator('#themeToggle').click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await capture(page,'desktop-dark');expect(errors).toEqual([]);
});
test('real add edit cancel delete and persistence',async({page})=>{
 await page.goto('/');await page.locator('#addBtn').click();await page.locator('#siteTitle').fill('测试收藏');await page.locator('#siteUrl').fill('example.com:8080/path');await page.locator('#siteCategory').fill('测试分类');await page.locator('#modalSave').click();await expect(page.locator('#modal')).not.toHaveClass(/show/);
 await page.reload();await expect(page.locator('.bookmark-card').filter({hasText:'测试收藏'})).toHaveCount(1);
 const card=page.locator('.bookmark-card').filter({hasText:'测试收藏'});await card.locator('[aria-expanded]').click();await card.locator('.edit-btn').click();await expect(page.locator('#siteTitle')).toBeFocused();await page.locator('#siteTitle').fill('不保存');await capture(page,'desktop-edit');await page.locator('#modalCancelBtn').click();await expect(card.locator('[aria-expanded]')).toBeFocused();
 await card.locator('[aria-expanded]').click();await card.locator('.edit-btn').click();await page.locator('#siteTitle').fill('已修改');await page.locator('#modalSave').click();
 const edited=page.locator('.bookmark-card').filter({hasText:'已修改'});await expect(edited).toHaveCount(1);await edited.locator('[aria-expanded]').click();page.once('dialog',d=>d.accept());await edited.locator('.delete-btn').click();await expect(page.locator('.bookmark-card').filter({hasText:'已修改'})).toHaveCount(0);
});
test('mobile layout category navigation and management controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.locator('#demoBtn').click();await ready(page);await capture(page,'mobile-grid');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.locator('.cat-chip').filter({hasText:'开发工具'}).click();await expect(page.locator('.bookmark-card')).toHaveCount(3);await page.locator('#addBtn').click();await expect(page.locator('#siteTitle')).toBeVisible();await capture(page,'mobile-add');await page.locator('#modalCancelBtn').click();await expect(page.locator('#modal')).not.toHaveClass(/show/);
 await page.locator('#appearanceBtn').click();await expect(page.locator('#colsIncrease')).toBeVisible();
});
test('import validates before replacing and restore retains old data',async({page})=>{
 await page.goto('/');const initial=await page.evaluate(()=>window.myNav.bookmarks);
 await page.locator('#importFile').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{title:'危险',url:'javascript:alert(1)'}]))});await expect(page.locator('.toast-error')).toBeVisible();expect(await page.evaluate(()=>window.myNav.bookmarks)).toEqual(initial);
 page.once('dialog',d=>d.accept());await page.locator('#importFile').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([entry(1),entry(2)]))});await expect(page.locator('.bookmark-card')).toHaveCount(2);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('my_nav_backup')))).toEqual(initial);
 await page.locator('#dataPanelBtn').click();page.once('dialog',d=>d.accept());await page.locator('#restoreBtn').click();await expect(page.locator('.bookmark-card')).toHaveCount(initial.length);
});
test('long categories keep desktop footer visible and category scrolls',async({page})=>{
 await page.setViewportSize({width:1200,height:700});await page.addInitScript(data=>localStorage.setItem('my_nav_v2',JSON.stringify(data)),Array.from({length:35},(_,i)=>entry(i)));await page.goto('/');
 const footer=await page.locator('#appearanceBtn').boundingBox();expect(footer.y+footer.height).toBeLessThanOrEqual(700);
 expect(await page.locator('#categoryBar').evaluate(x=>x.scrollHeight>x.clientHeight)).toBe(true);await capture(page,'desktop-many-categories');
});
