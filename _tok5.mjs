import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
if (!p.url().includes('tokens/5806190614')) await p.goto('https://github.com/settings/tokens/5806190614', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(2500);
const info = await p.evaluate(() => {
  const lbl = [...document.querySelectorAll('label, dt, span, div')].filter(e => e.children.length === 0 && (e.innerText || '').trim() === 'Expiration')[0];
  if (!lbl) return { found: false };
  let box = lbl.parentElement;
  for (let i = 0; i < 3 && box; i++) box = box.parentElement;
  return { found: true, html: (box?.innerHTML || '').replace(/\s+/g, ' ').slice(0, 700) };
});
console.log(JSON.stringify(info, null, 1).slice(0, 900));
process.exit(0);
