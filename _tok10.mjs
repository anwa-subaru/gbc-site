import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
await p.goto('https://github.com/settings/tokens/5806190614', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(2500);
const t = await p.evaluate(() => { const i = document.body.innerHTML.indexOf('Expiration'); return document.body.innerHTML.slice(i, i + 320).replace(/\s+/g, ' '); });
console.log('过期信息:', t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160));
process.exit(0);
