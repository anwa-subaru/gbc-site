import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
// 点开 Source 下拉
await p.getByRole('button', { name: /Deploy from a branch/ }).first().click();
await p.waitForTimeout(1500);
await p.screenshot({ path: '/root/gh-login/31-source-menu.png' });
console.log('菜单项:', JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('[role=menuitem], [role=menuitemradio], li, button')].filter(e => e.offsetParent !== null)
    .map(e => (e.innerText || '').trim().slice(0, 40)).filter(t => t && t.length < 40).slice(0, 18))));
process.exit(0);
