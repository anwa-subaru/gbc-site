// 手机端适配审计截图：真实移动设备模拟 + 采集布局诊断数据
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = 'https://gbc.misakamikoto.xyz';
const PAGES = ['', 'characters/', 'story/', 'gallery/', 'music/'];
const OUT = '/workspace/gbc-site/mobile-shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
// iPhone 13 真实设备描述（375×812 DPR3 移动UA 触屏）
const ctx = await browser.newContext({
  ...devices['iPhone 13'],
  // 额外采 390 宽（iPhone 14/15）也常见，但先用 375 基准
});
const page = await ctx.newPage();

const report = [];
for (const p of PAGES) {
  const url = BASE + '/' + p;
  const name = p === '' ? 'index' : p.replace('/', '');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200); // 等动效/懒加载稳定

  // 布局诊断：横向溢出、超宽元素、触控目标过小、横滚
  const diag = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const overflowX = document.documentElement.scrollWidth - vw;
    // 找出比视口宽的具体元素
    const wide = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > vw + 1 && el.offsetParent !== null) {
        wide.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className==='string' ? '.'+el.className.split(' ')[0] : ''} w=${Math.round(r.width)}`);
      }
    });
    // 触控目标 <44px 的可交互元素
    const smallTap = [];
    document.querySelectorAll('a, button, [role=button], input, .gp-tab').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 40)) {
        const t = (el.textContent || '').trim().slice(0, 12);
        smallTap.push(`${el.tagName.toLowerCase()} "${t}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    });
    return {
      viewportW: vw,
      scrollW: document.documentElement.scrollWidth,
      overflowX,
      wideCount: wide.length,
      wide: wide.slice(0, 10),
      smallTapCount: smallTap.length,
      smallTap: smallTap.slice(0, 15),
    };
  });

  // 首屏 + 全页截图
  await page.screenshot({ path: `${OUT}/${name}-fold.png` });
  await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });
  report.push({ page: name, url, ...diag });
  console.log(`✓ ${name}  overflowX=${diag.overflowX}  wide=${diag.wideCount}  smallTap=${diag.smallTapCount}`);
}

fs.writeFileSync(`${OUT}/diagnostics.json`, JSON.stringify(report, null, 2));
await browser.close();
console.log('DONE →', OUT);
