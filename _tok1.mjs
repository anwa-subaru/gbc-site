import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
await p.goto('https://github.com/settings/tokens/new', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(3000);
console.log('URL:', p.url());
console.log('输入框:', JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('input, select')].filter(e => e.offsetParent !== null)
    .map(e => `${e.tagName}[${e.type}] id=${e.id} name=${e.name}`).slice(0, 10))));
console.log('scope 复选框数:', await p.evaluate(() => document.querySelectorAll('input[type=checkbox]').length));
console.log('scope 名称:', JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('input[type=checkbox]')].map(e => e.name).slice(0, 20))));
console.log('按钮:', JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('button, input[type=submit]')].filter(e => e.offsetParent !== null).map(e => (e.innerText || e.value || '').trim().slice(0, 24)).filter(Boolean).slice(0, 8))));
process.exit(0);
