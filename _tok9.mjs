import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
console.log('当前 URL:', p.url());
const found = await p.evaluate(() => {
  const html = document.body.innerHTML;
  const m = html.match(/ghp_[A-Za-z0-9]{30,}/g);
  const el = document.querySelector('#new-oauth-token, code, .js-token');
  return { 正则命中: m ? [...new Set(m)] : [], 元素文本: el ? el.textContent.trim().slice(0, 50) : '' };
});
console.log('页面里的 token:', JSON.stringify({ 个数: found.正则命中.length, 前缀: found.正则命中[0]?.slice(0, 8), 元素: found.元素文本 }));
if (found.正则命中.length) {
  const tok = found.正则命中[0];
  fs.writeFileSync('/root/gh-login/token.txt', tok + '\n', { mode: 0o600 });
  fs.writeFileSync('/root/gh-login/git-credentials', `https://anwa-subaru:${tok}@github.com\n`, { mode: 0o600 });
  console.log('✓ 新 token 已保存到 /root/gh-login/token.txt 并更新 git 凭据');
  // 验证新 token
} else {
  console.log('页面里没有 ghp_ 字符串（可能已被 GitHub 隐藏）');
}
process.exit(0);
