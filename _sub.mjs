import { chromium } from 'playwright';
const B = 'http://localhost:8898/gbc-site';
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await c.newPage();
const bad = [], errs = [];
p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().replace(B, '')); });
p.on('pageerror', e => errs.push(String(e).slice(0, 70)));
for (const u of ['/', '/characters/', '/music/', '/gallery/', '/story/']) {
  await p.goto(B + u, { waitUntil: 'load' }); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => ({ 溢出: document.documentElement.scrollWidth > innerWidth + 1, 切换器: [...document.querySelectorAll('.lang')].filter(e => e.offsetParent !== null).length, 图: document.querySelectorAll('img').length }));
  console.log(u.padEnd(13), JSON.stringify(r));
}
// 播放器 + 歌词（KRC 是运行时 fetch，最容易在子路径下挂）
await p.goto(B + '/music/', { waitUntil: 'load' }); await p.waitForTimeout(2000);
await p.locator('[data-track="32"]').first().click(); await p.waitForTimeout(3500);
await p.evaluate(() => document.querySelector('[data-lyrics-open]').click()); await p.waitForTimeout(4000);
const lyr = await p.evaluate(() => {
  const l = document.querySelector('.lyr'); const open = l?.hasAttribute('open');
  const lines = document.querySelectorAll('.lyr__line, .lyr__row, [data-lyr-line]').length;
  return { 面板开: open, 歌词行数: lines, 首行: (document.querySelector('.lyr__line, [data-lyr-line]')?.innerText || '').slice(0, 24) };
});
console.log('歌词面板:', JSON.stringify(lyr));
console.log('404/4xx:', bad.length ? [...new Set(bad)].slice(0, 6) : '无 ✓');
console.log('JS 错误:', errs.length ? [...new Set(errs)].slice(0, 3) : '无 ✓');
await p.screenshot({ path: '/root/gh-login/29-subpath.png' });
await b.close();
