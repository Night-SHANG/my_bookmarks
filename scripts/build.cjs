const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// 只复制运行所需静态文件和第三方资源说明，不捆绑字体或开发依赖。
const files = [
  'index.html', 'style.css', 'polish.css', 'icons.css', 'app.js',
  'favicon.svg', 'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png',
  'apple-touch-icon.png', 'android-chrome-192x192.png', 'android-chrome-512x512.png',
  'THIRD_PARTY_NOTICES.md'
];
fs.mkdirSync('dist', {recursive: true});
const manifest = files.map(file => {
  const bytes = fs.readFileSync(file);
  fs.writeFileSync(path.join('dist', file), bytes);
  return {file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
});
fs.writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
console.log('Static package verified:', manifest.length, 'files');
