import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
await p.goto('https://github.com/anwa-subaru/gbc-site/settings/pages', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(3500);
await p.getByRole('button', { name: /Deploy from a branch/ }).first().click();
await p.waitForTimeout(1500);
// 菜单项：GitHub Actions
const opt = p.locator('[role=menuitem], [role=menuitemradio]').filter({ hasText: 'GitHub Actions' }).first();
console.log('选项数:', await opt.count());
await opt.click();
await p.waitForTimeout(1500);
await p.screenshot({ path: '/root/gh-login/34-selected.png' });
console.log('当前 Source:', await p.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find(e => /GitHub Actions|Deploy from a branch/.test(e.innerText));
  return el ? el.innerText.trim() : '?';
}));
const save = p.getByRole('button', { name: /^Save$/ }).first();
if (await save.count()) { await save.click(); await p.waitForTimeout(5000); console.log('已点 Save'); }
await p.screenshot({ path: '/root/gh-login/35-saved.png' });
console.log('保存后文案:', (await p.locator('main').innerText()).replace(/\s+/g, ' ').trim().slice(0, 260));
process.exit(0);
