import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
if (!p.url().includes('regenerate')) await p.goto('https://github.com/settings/tokens/5806190614/regenerate', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(2500);
await p.getByRole('button', { name: /days \(/ }).first().click();
await p.waitForTimeout(1500);
await p.screenshot({ path: '/root/gh-login/39-exp-menu.png' });
console.log('菜单选项:', JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('[role=menuitem], [role=option], li, div')].filter(e => e.offsetParent !== null && e.children.length === 0)
    .map(e => (e.innerText || '').trim()).filter(t => t && t.length < 30 && /expir|day|Never|No /i.test(t)).slice(0, 8))));
const opt = p.getByText(/No expiration|Never/i).first();
console.log('No expiration 可点:', await opt.count());
if (await opt.count()) { await opt.click(); await p.waitForTimeout(1200); console.log('已选 No expiration'); }
await p.screenshot({ path: '/root/gh-login/40-exp-set.png' });
const gen = p.getByRole('button', { name: /^Regenerate token$/ }).first();
await gen.click();
await p.waitForTimeout(6000);
if (await p.locator('#sudo_password, input[name="sudo_password"]').count()) {
  console.log('需要密码确认');
  await p.fill('#sudo_password, input[name="sudo_password"]', process.env.GH_PASS);
  await p.getByRole('button', { name: /Confirm|Verify/i }).first().click();
  await p.waitForTimeout(6000);
}
console.log('URL:', p.url());
const tok = await p.evaluate(() => {
  const el = document.querySelector('#new-oauth-token, code.js-token');
  return el ? el.textContent.trim() : '';
});
if (tok && tok.startsWith('ghp_')) {
  fs.writeFileSync('/root/gh-login/token.txt', tok + '\n', { mode: 0o600 });
  fs.writeFileSync('/root/gh-login/git-credentials', `https://anwa-subaru:${tok}@github.com\n`, { mode: 0o600 });
  console.log('新 token 已保存，前缀:', tok.slice(0, 8) + '...' + tok.slice(-4));
} else {
  console.log('未取到新 token，页面:', (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 160));
}
process.exit(0);
