import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
await p.goto('https://github.com/settings/tokens', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(3000);
const links = await p.evaluate(() => [...document.querySelectorAll('a')].filter(a => /\/settings\/tokens\/\d+/.test(a.getAttribute('href') || '')).map(a => ({ t: a.innerText.trim().slice(0, 40), h: a.getAttribute('href') })));
console.log('token 链接:', JSON.stringify(links));
console.log('列表文案:', (await p.locator('main').innerText()).replace(/\s+/g, ' ').trim().slice(0, 200));
if (links.length) {
  await p.goto('https://github.com' + links[0].h, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(3000);
  console.log('token 页按钮:', JSON.stringify(await p.evaluate(() =>
    [...document.querySelectorAll('button, summary, a')].filter(e => e.offsetParent !== null).map(e => (e.innerText || '').trim().slice(0, 28)).filter(t => /Regenerate|Edit|expir|Delete|Update|Save/i.test(t)).slice(0, 10))));
  console.log('token 页文案:', (await p.locator('main').innerText()).replace(/\s+/g, ' ').trim().slice(0, 300));
  await p.screenshot({ path: '/root/gh-login/38-tokenpage.png', fullPage: true });
}
process.exit(0);
