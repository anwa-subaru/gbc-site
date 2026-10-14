import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
await p.goto('https://github.com/anwa-subaru/gbc-site/settings/pages', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(3500);
console.log('URL:', p.url());
console.log('下拉框:', JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('select')].map(e => ({ id: e.id, name: e.name, value: e.value, opts: [...e.options].map(o => o.text.trim()) })))));
console.log('可见按钮:', JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('button, summary')].filter(e => e.offsetParent !== null).map(e => (e.innerText || '').trim().slice(0, 34)).filter(Boolean).slice(0, 14))));
console.log('页面文案:', (await p.locator('main').innerText()).replace(/\s+/g, ' ').trim().slice(0, 320));
await p.screenshot({ path: '/root/gh-login/30-pages-settings.png', fullPage: true });
process.exit(0);
