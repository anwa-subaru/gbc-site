import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
if (!p.url().includes('tokens/5806190614')) await p.goto('https://github.com/settings/tokens/5806190614', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(3000);
console.log('select:', JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('select')].map(e => ({ id: e.id, name: e.name, value: e.value, opts: [...e.options].map(o => o.text.trim()).slice(0, 8) })))));
console.log('text/date 输入:', JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('input')].filter(e => e.offsetParent !== null).map(e => `${e.type} id=${e.id} name=${e.name} value=${(e.value || '').slice(0, 24)}`).slice(0, 6))));
console.log('含 expire 的元素:', JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /expir/i.test(e.innerText || '')).map(e => (e.innerText || '').trim().slice(0, 40)).slice(0, 6))));
process.exit(0);
