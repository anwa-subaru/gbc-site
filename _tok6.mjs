import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];
const info = await p.evaluate(() => {
  const html = document.body.innerHTML;
  const out = {};
  const i = html.indexOf('Expiration');
  out.附近 = html.slice(i, i + 600).replace(/\s+/g, ' ');
  out.含30days = /30 days/.test(html);
  out.含Never = /No expiration|Never/i.test(html);
  return out;
});
console.log(JSON.stringify(info, null, 1).slice(0, 1100));
process.exit(0);
