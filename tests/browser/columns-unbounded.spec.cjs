const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const entry = i => ({id:'columns-'+i, title:'站点 '+i, url:'https://example.org/'+i, desc:i%2 ? '自定义说明' : '', category:'测试分类', icon:''});
async function setup(page, columns, width=3840, count=256) {
  await page.setViewportSize({width,height:1080});
  await page.route('**/*', route => {
    const u = new URL(route.request().url());
    return ['127.0.0.1','localhost'].includes(u.hostname) ? route.continue() : route.abort();
  });
  await page.goto('/');
  await page.evaluate(({columns,data}) => {
    localStorage.clear();
    localStorage.setItem('my_nav_v2', JSON.stringify(data));
    localStorage.setItem('nav_columns', columns);
  }, {columns:String(columns),data:Array.from({length:count},(_,i)=>entry(i))});
  // 只在第一次加载后种数据；刷新不覆写存档。
  await page.reload();
  await expect(page.locator('.bookmark-card').first()).toBeVisible();
}
async function capture(page, name) {
  fs.mkdirSync('artifacts',{recursive:true});
  await expect(page.locator('.favicon .fa-spinner')).toHaveCount(0,{timeout:30000});
  await page.screenshot({path:'artifacts/columns-'+name+'.png',fullPage:false,animations:'disabled'});
}

test('ten to eleven columns works through the actual button and survives reload',async({page})=>{
  await setup(page,10);
  await expect(page.locator('#colsIncrease')).toBeEnabled();
  await page.locator('#colsIncrease').click();
  await expect(page.locator('#colsDisplay')).toHaveText('11列');
  await page.reload();
  await expect(page.locator('#colsDisplay')).toHaveText('11列');
  const columns=await page.locator('#bookmarksGrid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(11);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await capture(page,'11-wide');
});

test('sixteen-column preference survives narrow, list, wide and refresh transitions',async({page})=>{
  await setup(page,16);
  await expect(page.locator('#colsDisplay')).toHaveText('16列');
  const stored=await page.evaluate(()=>localStorage.getItem('my_nav_v2'));
  await page.setViewportSize({width:1366,height:768});
  await expect(page.locator('#colsDisplay')).toHaveText('5列');
  expect(await page.evaluate(()=>localStorage.getItem('nav_columns'))).toBe('16');
  await page.locator('#listViewBtn').click();
  await expect(page.locator('#colsDisplay')).toHaveText('1列');
  await expect(page.locator('#colsIncrease')).toBeDisabled();
  await page.locator('#gridViewBtn').click();
  await page.setViewportSize({width:3840,height:1080});
  await expect(page.locator('#colsDisplay')).toHaveText('16列');
  await page.reload();
  await expect(page.locator('#colsDisplay')).toHaveText('16列');
  expect(await page.evaluate(()=>localStorage.getItem('my_nav_v2'))).toBe(stored);
  await capture(page,'16-wide');
});

test('simplified copy retains accessible search, form labels and custom descriptions',async({page})=>{
  await setup(page,4,1366,36);
  await expect(page.getByRole('searchbox',{name:'搜索书签、描述或网址'})).toBeFocused();
  await expect(page.locator('.brand p')).toHaveCount(0);
  await expect(page.locator('.header-intro p')).toHaveCount(0);
  await expect(page.locator('.workspace-footer .version')).toHaveCount(0);
  await expect(page.locator('[data-id="columns-0"] .card-desc')).not.toBeVisible();
  await expect(page.locator('[data-id="columns-1"] .card-desc')).toHaveText('自定义说明');
  await expect(page.locator('.bookmark-card').first()).toHaveCSS('height','94px');
  await capture(page,'clean-desktop');
  await page.locator('#themeToggle').click();
  await capture(page,'clean-dark');
  await page.locator('#addBtn').click();
  for(const label of ['网站标题','网站链接','分类','图标（可选）','描述（可选）']) await expect(page.getByLabel(label,{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#addBtn')).toBeFocused();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await capture(page,'clean-mobile');
});

test('large preferences and 10000 bookmarks keep DOM bounded to viewport capacity',async({page})=>{
  await setup(page,1000000000000,1366,10000);
  const metrics=await page.evaluate(()=>{
    const samples=[];
    const input=document.getElementById('searchInput');
    for(const query of ['站点 99','站点 8','站点 1','站点','']) {
      const start=performance.now(); input.value=query; input.dispatchEvent(new Event('input',{bubbles:true}));
      samples.push(performance.now()-start);
    }
    return {samplesMs:samples, userAgent:navigator.userAgent, viewport:[innerWidth,innerHeight],
      records:window.myNav.bookmarks.length, cards:document.querySelectorAll('.bookmark-card').length,
      capacity:Number(document.getElementById('bookmarksGrid').dataset.pageSize),
      savedColumns:localStorage.getItem('nav_columns')};
  });
  expect(metrics.records).toBe(10000);
  expect(metrics.cards).toBe(metrics.capacity);
  expect(metrics.cards).toBeLessThan(100);
  expect(metrics.savedColumns).toBe('1000000000000');
  fs.mkdirSync('artifacts',{recursive:true});
  fs.writeFileSync('artifacts/columns-performance.json',JSON.stringify(metrics,null,2));
});
