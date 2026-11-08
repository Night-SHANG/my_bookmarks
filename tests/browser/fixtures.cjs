// 示例仅属于测试夹具，不进入产品运行文件或静态交付包。
const sampleBookmarks = [
 ['百度','www.baidu.com','中文搜索引擎','阅读学习'],['ChatGPT','chatgpt.com','思考、创作与探索','AI 工具'],['通义千问','qwen.ai','你的 AI 助手','AI 工具'],
 ['GitHub','github.com','代码与开源项目','开发工具'],['MDN','developer.mozilla.org','Web 开发文档','开发工具'],['Vercel','vercel.com','让想法上线','开发工具'],
 ['Figma','figma.com','设计与协作','设计灵感'],['Dribbble','dribbble.com','界面与视觉灵感','设计灵感'],['Pinterest','pinterest.com','发现与收集灵感','设计灵感'],
 ['Notion','notion.so','知识与笔记','阅读学习'],['哔哩哔哩','www.bilibili.com','视频与创作','影音娱乐'],['知乎','www.zhihu.com','问答与知识','阅读学习']
].map(([title,domain,desc,category],i)=>({id:'fixture-'+i,title,url:'https://'+domain+'/',desc,category,icon:'favicon.ico'}));
async function seedBookmarks(page,data=sampleBookmarks) {
  // 先打开文档后一次性种数据；刷新不重新覆盖，兼容 file 回归。
  await page.evaluate(values=>localStorage.setItem('my_nav_v2',JSON.stringify(values)),data);
  await page.reload();
}
module.exports={sampleBookmarks,seedBookmarks};
