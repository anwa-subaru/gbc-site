import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
await p.goto('https://github.com/settings/keys', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(2500);
console.log('已有 SSH key:', (await p.locator('body').innerText()).replace(/\s+/g, ' ').match(/container-deploy|No SSH keys/i)?.[0] ?? '(未见)');
await p.goto('https://github.com/new', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(3000);
console.log('URL:', p.url());
console.log('可见输入框:', JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('input, textarea, select')].filter(e => e.offsetParent !== null)
    .map(e => `${e.tagName}[${e.type}] id=${e.id} name=${e.name} ac=${e.autocomplete}`).slice(0, 12))));
console.log('可见按钮:', JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('button, input[type=submit]')].filter(e => e.offsetParent !== null)
    .map(e => (e.innerText || e.value || '').trim().slice(0, 30)).filter(Boolean))));
console.log('页面文案:', (await p.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 220));
await p.screenshot({ path: '/root/gh-login/26-newpage.png' });
process.exit(0);
