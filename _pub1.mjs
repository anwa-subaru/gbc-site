import { chromium } from 'playwright';
import fs from 'node:fs';
const key = fs.readFileSync('/root/.ssh/id_ed25519.pub', 'utf8').trim();
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];

// ① 加 SSH key
await p.goto('https://github.com/settings/ssh/new', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(2500);
await p.fill('#ssh_key_title', 'container-deploy');
await p.fill('#ssh_key_key', key);
await p.waitForTimeout(400);
await p.getByRole('button', { name: /^Add SSH key$/ }).first().click();
await p.waitForTimeout(5000);
// sudo 模式可能要密码
if (await p.locator('input[name="sudo_password"], #sudo_password').count()) {
  console.log('需要 sudo 密码确认');
  await p.fill('input[name="sudo_password"], #sudo_password', process.env.GH_PASS);
  await p.getByRole('button', { name: /Confirm|Verify/i }).first().click();
  await p.waitForTimeout(5000);
}
console.log('SSH key 页 URL:', p.url());
console.log('SSH key 结果:', (await p.locator('body').innerText()).replace(/\s+/g, ' ').trim().match(/SSH key (added|已添加)|error|already in use|Key is invalid/i)?.[0] ?? '(见截图)');
await p.screenshot({ path: '/root/gh-login/23-sshkey.png' });

// ② 建公开仓库
await p.goto('https://github.com/new', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(2500);
await p.fill('#repository_name', 'gbc-site');
await p.fill('#repository_description', 'Girls Band Cry 粉丝站（Astro 静态站）');
if (await p.locator('#repository_visibility_public').count()) await p.check('#repository_visibility_public');
await p.waitForTimeout(400);
await p.screenshot({ path: '/root/gh-login/24-newrepo.png' });
await p.getByRole('button', { name: /^Create repository$/ }).first().click();
await p.waitForTimeout(6000);
console.log('建仓后 URL:', p.url());
console.log('建仓结果:', (await p.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 200));
await p.screenshot({ path: '/root/gh-login/25-created.png' });
process.exit(0);
