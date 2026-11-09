# 方案一视觉验收

记录：2026-10-13 19:27 北京时间（UTC+08:00）。

final result: passed（开发预览；非线上发布）

## 来源与实际截图
- 已确认图片：bookmarks-visual-1.png，Library libfile_ab51f2c84ec08191b3923870f7d38bea，1487×1058。
- 产品代码：99fbf2b0100299e68d26a3e37c13020a6231c4ca，分支 feat/bookmarks-visual-redesign。
- 真实 Chromium CI：https://github.com/Night-SHANG/my_bookmarks/actions/runs/38390027076 。24项快速回归和5组浏览器测试通过。
- browser-evidence 产物11808421927中的 artifacts/desktop-grid.png、desktop-list.png、desktop-dark.png、desktop-edit.png、mobile-grid.png、mobile-add.png、desktop-many-categories.png 为浏览器原始截图。
- 桌面 viewport1487×1058，手机390×844，长分类1200×700，deviceScaleFactor1；全页截图高度可超出viewport。桌面浅色网格使用12条显式演示收藏，与参考状态一致，不是用户数据。
- 桌面Library libfile_4529f56bfaa08191a0adf178c98b1dab；手机Library libfile_41c8b61428208191b276cfad081c10ea。

## 对照与结论
已看实际像素，完成桌面全图和第一张卡片局部并排对照。原图与实现在信息层级、暖白底、森林绿、左分类栏、宽搜索框、三列圆角卡片和底部管理入口上保持一致。
- 字体：中文清晰；实现正文稍紧凑、主标题略小于模型图，卡片保留足够留白。长网址截断不挤压标题。
- 布局：桌面主内容起点316px（参考约329px），左栏264px（参考约274px），属响应式实现尺度差异。分类顺序和数量来自真实演示数据。
- 色彩：小字加深至#67716b，深色选中项使用高对比文字；浏览器断言选中项对比度至少4.5。
- 图标：使用真实网站favicon，不能保证与模型想象图标一致；本次桌面12个图标均成功加载。外站慢请求8秒后显示地球回退，迟到图标仍可替换，测试截图最多等待30秒，不隐藏缺陷。
- 手机：双列收藏、横向分类，无页面横向溢出；添加弹窗字段及取消/保存全部可见。标题平衡换行。物理手机软键盘未覆盖。
- 深色/列表：导航与条目均可读，黑色logo保留浅色底；编辑弹窗焦点清晰，取消回到可见更多按钮。长分类可滚动，底部管理入口仍可用。

## 发现与修复历史
1. 本地云浏览器不能访问隔离HTTP服务；不绕过file或socket限制，改用开发分支GitHub Actions正规Chromium。
2. 首次浏览器测试发现默认数据首次导入未备份，新增失败测试并修复。
3. 手机标题孤行、低对比度小字/深色选中态、截图落在动画中间，已修复并重拍。
4. 图标等待条件最初未覆盖尚未插入DOM的图片，新增可见spinner等待及产品8秒回退。最终CI成功且截图完整。

## 验证范围与限制
真实浏览器覆盖分类、搜索、列表/深色、添加、编辑、取消、删除、刷新持久化、无效导入保护、合法导入与恢复、手机布局、长分类。24项单测另覆盖旧数据、数字ID拖动逻辑、存储损坏/配额失败、备份回滚、图标超时。
不将单测当作真实拖拽或实体手机验证：实体触屏拖动、软键盘、Safari/Firefox、屏幕阅读器尚未专项检查；未自动遍历外部站点。尚未部署，因此用户原域名数据保持原样。

## v1.1.1-preview：最低4×4与自动搜索焦点（局部验收）
记录：2026-10-14 19:27 北京时间（UTC+08:00）。基线204f9d8，本地未提交修订。

本轮真实截图为 tests/browser/minimum-grid.spec.cjs 生成的 artifacts/minimum-grid-*.png；对应同名JSON记录真实尺寸。1366×768中，单项、满页16项、尾页1项均为4列×4行，首卡264.5×94px，左侧分类按钮187×42px，文档1366×768。390px实际2列、320px实际1列，无横向溢出；更大列数偏好保持。HTTP与file打开后直接键盘输入即可过滤，弹窗输入及窗口resize不抢焦点。

已查看1项、满页、尾页、390px真实截图：卡片尺寸与定位稳定，尾页留白，底部分页可见。桌面行间距从12微调10px，卡高、列间距、配色与其余组件保留。

限制：当前云端测试环境Font Awesome字体未加载，截图中部分纯图标字形缺失；这是未隐藏的实际状态。本轮证明布局与交互，不能标为所有外部资源完整的全面视觉验收。实体手机软键盘/中文输入法、Safari/Firefox仍未专项验证。

2026-10-14 19:28 北京时间（UTC+08:00）：最终23/23 Chromium套件通过；交付路径preview/index.html额外2/2 file测试通过。截图中的最低4×4、少量/满页/尾页稳定尺寸、小屏降级与自动搜索焦点局部验收通过；外部图标字体与实体设备限制如上保留。


## 连续网格与双密度方案验收（2026-11-09，北京时间）

- 代码基线：`32e623aac29b455e454e2442fd6f6654a9500a87`，开发分支 `fix/continuous-grid-density`。
- GitHub Actions：<https://github.com/Night-SHANG/my_bookmarks/actions/runs/42587730453>。Preflight 103项单测与静态构建通过；Chromium 59/59通过。
- 截图证据来自 Actions `browser-evidence` artifact（ID `13660440555`）：`polish-desktop-1366-offline.png`、`polish-desktop-1920-offline.png`、`mobile-grid.png`、`polish-mobile-320-appearance-offline.png`、`polish-mobile-390-appearance-offline.png`、`desktop-many-categories.png`、`ui-appearance-1366.png`、`ui-data-1366.png`、`polish-dark-offline.png`、`polish-dark-dialog-offline.png` 等。
- 桌面固定列数由用户偏好控制，resize不覆盖；24书签在8列、1334×657视口一屏显示；移动390 CSS px两列、320 CSS px极窄布局；手机布局不覆盖桌面列数。
- 所有收藏连续显示，不分页；分类导航自然高度展开，不建立内部滚动区；长分类底部操作可通过文档滚动访问。
- 紧凑/舒适密度切换独立持久化。紧凑保留图标、标题和网址，舒适额外显示描述。主题色、深浅主题、搜索、数据面板、添加/编辑弹窗及字段错误状态均通过浏览器回归。
- 性能证据：10,000条记录均生成卡片与懒加载图片节点，`content-visibility:auto`生效；CI runner初次挂载约60秒，属于压力测试且存在明显成本。5,000条收藏下工具面板30次操作P95约0.8ms，网格子节点变更0次。不可把该压力结果外推为实体设备性能。
- 限制：此次真实浏览器覆盖为 GitHub Actions 的 Chromium；Safari、Firefox、实体手机触控/软键盘、屏幕阅读器尚未专项验证。自动化通过不等于完成全部 WCAG 2.2 AA 人工审计。


## 正式部署结果（2026-11-09，北京时间）

- PR #2 已合并，main SHA：`4d46dc43e426727742e8067334343f3bb2937668`。
- GitHub Pages workflow [42591253656](https://github.com/Night-SHANG/my_bookmarks/actions/runs/42591253656) success，部署 payload SHA 与 main 一致。
- Pages artifact ID `13661680449` 已下载检查，包含最终页面、脚本、样式、manifest、favicon 和各尺寸安装图标。最终 HTML 没有分页控件，JS 没有分页状态或基于窗口宽度改写列数的函数。
- 正式站点：<https://night-shang.github.io/my_bookmarks/>。
- 旧生产备份 `backup/production-live-20261109` 保持 `927079d` 不变。
- Web 读取工具无法直接加载 Pages 域名；线上核验限于 GitHub Pages 部署成功日志和部署 artifact 文件检查，实体浏览器与其他浏览器引擎仍未专项验证。
