import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
if (!p.url().includes('tokens/new')) await p.goto('https://github.com/settings/tokens/new', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(2500);
await p.fill('#oauth_access_description', 'container-anwa-subaru 全权限（推送 + API）');
// 有效期 90 天
const exp = p.getByRole('button', { name: /30 days|Expiration|days/i }).first();
if (await exp.count()) {
  await exp.click(); await p.waitForTimeout(1200);
  const opt = p.locator('[role=menuitem], [role=option], li').filter({ hasText: /^90 days/ }).first();
  if (await opt.count()) { await opt.click(); await p.waitForTimeout(800); console.log('有效期已设 90 天'); }
  else { console.log('没找到 90 days 选项，保持默认'); await p.keyboard.press('Escape'); }
}
// 全选 scope
const n = await p.evaluate(() => {
  const boxes = [...document.querySelectorAll('input[type=checkbox]')];
  boxes.forEach(c => { if (!c.checked) { c.click(); } });
  return boxes.filter(c => c.checked).length;
});
await p.waitForTimeout(800);
console.log('已勾选 scope 数:', n, '/', await p.evaluate(() => document.querySelectorAll('input[type=checkbox]').length));
await p.getByRole('button', { name: /^Generate token$/ }).first().click();
await p.waitForTimeout(6000);
// sudo 密码
if (await p.locator('#sudo_password, input[name="sudo_password"]').count()) {
  console.log('需要密码确认');
  await p.fill('#sudo_password, input[name="sudo_password"]', process.env.GH_PASS);
  await p.getByRole('button', { name: /Confirm|Verify/i }).first().click();
  await p.waitForTimeout(6000);
}
console.log('URL:', p.url());
const tok = await p.evaluate(() => {
  const el = document.querySelector('#new-oauth-token, code.js-token, [data-testid="new-token"]');
  return el ? el.textContent.trim() : '';
});
if (tok && tok.startsWith('ghp_')) {
  fs.writeFileSync('/root/gh-login/token.txt', tok + '\n', { mode: 0o600 });
  console.log('token 已保存到 /root/gh-login/token.txt，前缀:', tok.slice(0, 8) + '...' + tok.slice(-4), '长度:', tok.length);
} else {
  console.log('没取到 token，页面文案:', (await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 160));
}
process.exit(0);
