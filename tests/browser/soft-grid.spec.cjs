const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const entries=Array.from({length:45},(_,i)=>({id:`soft-${i}`,title:`收藏 ${i}`,url:`https://example.org/${i}`,desc:'保留的描述',category:i%2?'开发':'阅读',icon:'favicon.ico'}));
async function prepare(page,{file=false,legacy=true}={}){
 await page.route('https://**/*',r=>r.abort());
 await page.goto(file?pathToFileURL(path.resolve('index.html')).href:'/');
 await page.evaluate(({entries,legacy})=>{
  localStorage.clear();localStorage.setItem('my_nav_v2',JSON.stringify(entries));
  localStorage.setItem('nav_theme','light');localStorage.setItem('nav_columns','6');
  if(legacy)localStorage.setItem('nav_view','list');
 },{entries,legacy});
 await page.reload();await expect(page.locator('.bookmark-card').first()).toBeVisible();
}
async function capture(page,name){fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:`artifacts/soft-grid-${name}.png`,fullPage:true,animations:'disabled'});}
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('my_nav_v2')));
function contrast(a,b){const lum=x=>{const v=x.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return .2126*v[0]+.7152*v[1]+.0722*v[2];};const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
for(const file of [false,true])test(`legacy list preference becomes grid without altering data: ${file?'file':'HTTP'}`,async({page})=>{
 await page.setViewportSize({width:1366,height:768});await prepare(page,{file});
 await expect(page.locator('#gridViewBtn,#listViewBtn,.view-switch')).toHaveCount(0);
 await expect(page.locator('#bookmarksGrid')).not.toHaveClass(/list-view/);
 expect(await stored(page)).toEqual(entries);
 expect(await page.evaluate(()=>localStorage.getItem('nav_columns'))).toBe('6');
 expect(await page.evaluate(()=>localStorage.getItem('nav_view'))).toBe('list'); // Historical key is ignored, not deleted.
 await expect(page.locator('.bookmark-card')).toHaveCount(entries.length);
 await expect(page.locator('#pagination')).toHaveCount(0);
 await page.locator('#appearanceBtn').click();await page.locator('#densityComfortableBtn').click();
 await expect(page.locator('#densityComfortableBtn')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.bookmark-card').first().locator('.card-desc')).toBeVisible();
 await page.reload();await expect(page.locator('#bookmarksGrid')).not.toHaveClass(/list-view/);
 expect(await stored(page)).toEqual(entries);await capture(page,file?'file':'desktop');
});
for(const theme of ['light','dark'])test(`soft palette selection, reset, contrast and persistence: ${theme}`,async({page})=>{
 await prepare(page);if(theme==='dark')await page.locator('#themeToggle').click();
 await page.locator('#appearanceBtn').click();await expect(page.locator('.color-dot')).toHaveCount(9);
 await page.getByRole('button',{name:'晴空蓝',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('nav_accent'))).toBe('#5db9df');
 await page.keyboard.press('Escape');await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
 for(const selector of ['.cat-chip.active','.cat-chip.active .cat-count','.engine-tab.active','#addBtn']){
  const pair=await page.locator(selector).first().evaluate(el=>{const s=getComputedStyle(el);const parent=getComputedStyle(el.parentElement);return [s.color,s.backgroundColor==='rgba(0, 0, 0, 0)'?parent.backgroundColor:s.backgroundColor];});
  expect(contrast(...pair)).toBeGreaterThanOrEqual(4.5);
 }
 await page.locator('#appearanceBtn').click();await page.locator('#resetAccent').click();
 await expect(page.getByRole('button',{name:'鲜叶绿',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>localStorage.getItem('nav_accent'))).toBeNull();
 expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#73d548');
 expect(await stored(page)).toEqual(entries);await capture(page,'appearance-'+theme);
});
for(const width of [1366,320])test(`search focus keeps geometry and a visible rounded theme ring at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await prepare(page);
 const input=page.locator('#searchInput');await page.locator('#addBtn').focus();const before=await input.boundingBox();
 await input.click();const after=await input.boundingBox();expect(after).toEqual(before);
 const styles=await input.evaluate(el=>{const s=getComputedStyle(el);return {outline:s.outlineStyle,shadow:s.boxShadow,radius:parseFloat(s.borderRadius),border:s.borderColor,bg:s.backgroundColor};});
 expect(styles.outline).toBe('none');expect(styles.shadow).not.toBe('none');expect(styles.radius).toBeGreaterThan(0);expect(contrast(styles.border,styles.bg)).toBeGreaterThanOrEqual(3);
 await page.locator('#addBtn').focus();await page.keyboard.press('Tab');await expect(input).toBeFocused();
 await input.fill('收藏 44');await expect(page.locator('.bookmark-card')).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await capture(page,'search-'+width);
});
test('high-contrast mode retains a native visible search indicator',async({page})=>{
 await page.emulateMedia({forcedColors:'active'});await prepare(page);await page.locator('#searchInput').focus();
 expect(await page.locator('#searchInput').evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
});
