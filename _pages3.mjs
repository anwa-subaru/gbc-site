import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
await p.getByText('GitHub Actions', { exact: true }).first().click();
await p.waitForTimeout(1200);
await p.screenshot({ path: '/root/gh-login/32-selected.png' });
const save = p.getByRole('button', { name: /^Save$/ }).first();
console.log('Save 按钮:', await save.count());
if (await save.count()) { await save.click(); await p.waitForTimeout(5000); }
await p.screenshot({ path: '/root/gh-login/33-saved.png' });
console.log('保存后 URL:', p.url());
console.log('保存后文案:', (await p.locator('main').innerText()).replace(/\s+/g, ' ').trim().slice(0, 300));
process.exit(0);
