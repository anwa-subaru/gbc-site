import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
await p.goto('https://github.com/settings/tokens/5806190614/regenerate', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(3000);
console.log('URL:', p.url());
console.log('select:', JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('select')].map(e => ({ id: e.id, name: e.name, value: e.value, opts: [...e.options].map(o => o.text.trim()) })))));
console.log('按钮:', JSON.stringify(await p.evaluate(() =>
  [...document.querySelectorAll('button, summary')].filter(e => e.offsetParent !== null).map(e => (e.innerText || '').trim().slice(0, 30)).filter(Boolean).slice(0, 12))));
const html = await p.evaluate(() => { const i = document.body.innerHTML.indexOf('Expiration'); return document.body.innerHTML.slice(i, i + 400).replace(/\s+/g, ' '); });
console.log('Expiration 附近:', html);
process.exit(0);
