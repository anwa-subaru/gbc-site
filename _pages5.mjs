import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
await p.goto('https://github.com/anwa-subaru/gbc-site/settings/pages', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(3500);
console.log('Source 控件:', JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('button, summary')].filter(e => e.offsetParent !== null)
    .map(e => (e.innerText || '').trim()).filter(t => /GitHub Actions|Deploy from a branch|Save/i.test(t)))));
console.log('页面关键文案:', (await p.locator('main').innerText()).replace(/\s+/g, ' ').trim().slice(0, 400));
await p.screenshot({ path: '/root/gh-login/36-pages-now.png', fullPage: true });
process.exit(0);
