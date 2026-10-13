# 我的导航

个人网址导航，原生 HTML / CSS / JavaScript，数据保存在当前浏览器。

## 方案一预览

暖白与森林绿、分类侧栏、收藏卡片 / 列表视图；保留搜索、增删改、拖动排序、主题色和密度、JSON 导入导出。

底部“体验演示数据”只使用内存中的示例，不写入你的收藏；退出或刷新恢复自己的数据。

## 本地运行与验证

Node.js 24：

```sh
npm ci
npm run dev -- --host 0.0.0.0 --port 4173
npm test
npm run preflight
npm run build
```

打开本机 http://localhost:4173/。`dist/` 是可部署的静态产物，`manifest.json` 记录文件大小与 SHA256。

## 数据与恢复

原有 `my_nav_v2` 书签、`category_order` 排序、`favicon_cache_v1`、`nav_theme`、`nav_columns`、`nav_accent` 继续兼容。新 `nav_view` 只记录网格/列表偏好。

导入 JSON 会要求确认，验证整批结构和 HTTP(S) 地址后替换当前收藏，并将旧数据保留为 `my_nav_backup`。导入/导出菜单可以恢复上次备份。损坏的原数据不会静默覆盖，可先导出原始文件用于修复。浏览器禁用存储或空间不足时，页面不会报告保存成功。

本地存储不等于云同步；不同域名、端口和浏览器的数据相互独立。测试分支不会自动取得线上收藏，请在旧页面导出后，在预览中导入。清理浏览器数据前请导出备份。

## 外部资源与许可

沿用 Font Awesome Free 6.4.0：字体 SIL OFL 1.1，代码 MIT，图标 CC BY 4.0，见 https://fontawesome.com/license/free 。字体使用 Google Fonts 的 Outfit / Noto Sans SC；站点图标请求站点自身或 DuckDuckGo favicon 服务。离线或第三方资源失败时使用系统字体和图标回退，不影响本地收藏数据。

测试开发依赖 jsdom 26.1.0（MIT），不随运行时静态包发布。原仓库未声明项目整体开源许可证，本次不代替作者授予新许可。

设计与验证范围见 `docs/design-and-validation.md`，视觉验收状态见 `design-qa.md`。

## Chromium 运行时回归

开发依赖固定 `@playwright/test` 1.56.1（Apache-2.0）。在支持 Chromium 的环境运行：

```sh
npx playwright install --with-deps chromium
npm run test:browser
```

开发分支 GitHub Actions 自动运行 24 项快速回归与 5 组真实浏览器用例，并上传桌面、手机、弹窗、长分类与深色截图。浏览器测试只使用内置演示/测试数据，不需要账户或额外 Secrets，也不部署线上。
