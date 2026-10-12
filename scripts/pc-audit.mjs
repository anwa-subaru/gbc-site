// PC 端适配审计截图：1440px 桌面视口 + 布局诊断
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'https://gbc.misakamikoto.xyz';
const PAGES = ['', 'characters/', 'story/', 'gallery/', 'music/'];
const OUT = '/workspace/gbc-site/pc-shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

const report = [];
for (const p of PAGES) {
  const url = BASE + '/' + p;
  const name = p === '' ? 'index' : p.replace('/', '');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);

  const diag = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const overflowX = document.documentElement.scrollWidth - vw;
    // 超宽元素
    const wide = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > vw + 1 && el.offsetParent !== null) {
        wide.push(`${el.tagName.toLowerCase()} w=${Math.round(r.width)}`);
      }
    });
    // 主体内容最大宽度（判断超宽屏下是否拉得太宽）
    const main = document.querySelector('main') || document.body;
    const mainW = Math.round(main.getBoundingClientRect().width);
    // 过小的文字
    const tinyText = [];
    document.querySelectorAll('p,span,a,li,td,dd,dt').forEach(el => {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const t = (el.textContent || '').trim();
      if (t && fs < 12 && el.children.length === 0) {
        tinyText.push(`"${t.slice(0,10)}" ${fs}px`);
      }
    });
    return {
      viewportW: vw, scrollW: document.documentElement.scrollWidth, overflowX,
      mainW, wideCount: wide.length, wide: wide.slice(0, 8),
      tinyTextCount: tinyText.length, tinyText: tinyText.slice(0, 10),
    };
  });

  await page.screenshot({ path: `${OUT}/${name}-fold.png` });
  await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });
  report.push({ page: name, url, ...diag });
  console.log(`✓ ${name}  overflowX=${diag.overflowX}  mainW=${diag.mainW}  wide=${diag.wideCount}  tiny=${diag.tinyTextCount}`);
}

fs.writeFileSync(`${OUT}/diagnostics.json`, JSON.stringify(report, null, 2));
await browser.close();
console.log('DONE →', OUT);
