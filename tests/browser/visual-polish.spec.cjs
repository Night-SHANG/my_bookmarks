const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const entries = Array.from({length: 36}, (_, i) => ({
  id:'polish-'+i,title:i===0?'常用网站与开发资料':'收藏站点 '+i,
  url:'https://example.org/bookmark/'+i,desc:'独立测试数据，不读取真实收藏',
  category:['AI 工具','开发工具','阅读学习','设计灵感'][i%4],icon:'https://example.org/favicon.ico'
}));
async function prepare(page, viewport, fileMode=false) {
  await page.setViewportSize(viewport);
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    return url.protocol==='file:'||['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();
  });
  await page.goto(fileMode?pathToFileURL(path.join(process.cwd(),'index.html')).href:'/');
  await page.evaluate(data=>{localStorage.clear();localStorage.setItem('my_nav_v2',JSON.stringify(data));},entries);
  await page.reload();
  await expect(page.locator('.bookmark-card').first()).toBeVisible();
  await expect(page.locator('.favicon .fa-spinner')).toHaveCount(0);
  await page.evaluate(()=>document.fonts.ready);
}
async function capture(page,name){fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/polish-'+name+'.png',fullPage:true,animations:'disabled'});}
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
async function hasGlyph(locator){expect(await locator.evaluate(el=>getComputedStyle(el,'::before').maskImage)).toContain('data:image/svg+xml');}
for(const viewport of [{width:1366,height:768},{width:1920,height:1080}]){
 test('polish keeps fixed desktop slots at '+viewport.width,async({page})=>{
  await prepare(page,viewport);await expect(page.locator('#searchInput')).toBeFocused();await expect(page.locator('#colsDisplay')).toHaveText('4列');
  const grid=page.locator('#bookmarksGrid');expect(Number(await grid.getAttribute('data-page-size'))).toBeGreaterThanOrEqual(16);
  const before=await page.locator('.bookmark-card').first().boundingBox();expect(before.height).toBe(94);
  await page.locator('#searchInput').fill('常用网站与开发资料');await expect(page.locator('.bookmark-card')).toHaveCount(1);
  const after=await page.locator('.bookmark-card').first().boundingBox();expect(after.width).toBeCloseTo(before.width,1);expect(after.height).toBe(before.height);
  await page.locator('#searchInput').fill('');await noOverflow(page);expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
  await capture(page,'desktop-'+viewport.width+'-offline');
 });
}
test('offline UI has local icons including dynamic category and theme glyphs',async({page})=>{
 const remoteStyles=[];page.on('request',request=>{if(['stylesheet','font'].includes(request.resourceType())&&/^https:/.test(request.url()))remoteStyles.push(request.url());});
 await prepare(page,{width:1440,height:900});
 for(const selector of ['.brand > i','.search-icon','#colsIncrease i','#addBtn i','#categoryOrderBtn i','[data-category="开发工具"] i','.favicon .fa-globe'])await hasGlyph(page.locator(selector).first());
 await page.locator('#themeToggle').click();await hasGlyph(page.locator('#themeIcon'));await expect(page.locator('html')).toHaveAttribute('data-theme','dark');expect(remoteStyles).toEqual([]);await capture(page,'dark-offline');
});
test('dark selection remains readable and modal keeps focus behavior',async({page})=>{
 await prepare(page,{width:1366,height:768});await page.locator('#themeToggle').click();
 const contrast=await page.locator('.cat-chip.active').evaluate(el=>{const cs=getComputedStyle(el);const lum=value=>{const channels=value.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{const v=x/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};const a=lum(cs.color),b=lum(cs.backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
 expect(contrast).toBeGreaterThanOrEqual(4.5);const saved=await page.evaluate(()=>localStorage.getItem('my_nav_v2'));
 await page.locator('#addBtn').click();await expect(page.locator('#siteTitle')).toBeFocused();await page.locator('#siteTitle').fill('未保存的测试');await capture(page,'dark-dialog-offline');
 await page.keyboard.press('Escape');await expect(page.locator('#addBtn')).toBeFocused();expect(await page.evaluate(()=>localStorage.getItem('my_nav_v2'))).toBe(saved);
});
for(const width of [390,320]){
 test('narrow controls and panels remain accessible at '+width,async({page})=>{
  await prepare(page,{width,height:844});await noOverflow(page);
  await page.locator('#appearanceBtn').click();await expect(page.locator('#resetAccent')).toBeVisible();
  const panel=await page.locator('#appearancePanel').boundingBox();expect(panel.x).toBeGreaterThanOrEqual(0);expect(panel.x+panel.width).toBeLessThanOrEqual(width+1);
  await capture(page,'mobile-'+width+'-appearance-offline');
  await page.keyboard.press('Escape');await expect(page.locator('#appearancePanel')).toBeHidden();
  await page.locator('#dataPanelBtn').click();await expect(page.locator('#importBtn')).toBeVisible();await expect(page.locator('#exportBtn')).toBeVisible();await noOverflow(page);
  await page.keyboard.press('Escape');await page.locator('#addBtn').click();await expect(page.locator('#modalSave')).toBeInViewport();await expect(page.locator('#modalCancelBtn')).toBeInViewport();await capture(page,'mobile-'+width+'-dialog-offline');
 });
}
test('file preview keeps local glyphs, focus and reduced-motion support',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await prepare(page,{width:1366,height:768},true);
 await expect(page.locator('#searchInput')).toBeFocused();await hasGlyph(page.locator('#addBtn i'));
 expect(await page.locator('.bookmark-card').first().evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThanOrEqual(.01);
 await page.keyboard.type('bookmark/35');await expect(page.locator('.bookmark-card')).toHaveCount(1);await capture(page,'file-offline');
});
