import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const BASE='https://gbc.misakamikoto.xyz';
const OUT='/tmp/verify-shots'; fs.mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch();
// PC 1440
const pc=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const pp=await pc.newPage();
for(const p of ['','characters/','story/','gallery/','music/']){
  const n=p===''?'index':p.replace('/','');
  await pp.goto(BASE+'/'+p,{waitUntil:'networkidle',timeout:60000});
  await pp.waitForTimeout(1000);
  // 滚动触发懒加载和reveal
  await pp.evaluate(async()=>{await new Promise(r=>{let y=0;const t=setInterval(()=>{y+=600;window.scrollTo(0,y);if(y>=document.body.scrollHeight){clearInterval(t);r();}},80);});});
  await pp.evaluate(()=>window.scrollTo(0,0)); await pp.waitForTimeout(600);
  await pp.screenshot({path:`${OUT}/pc-${n}-fold.png`});
  // hero标题诊断(仅首页)
  if(n==='index'){
    const d=await pp.evaluate(()=>{const t=document.querySelector('.hero__title');const r=t.getBoundingClientRect();const cs=getComputedStyle(t);return{lines:Math.round(r.height/parseFloat(cs.lineHeight)||1),w:Math.round(r.width),fs:cs.fontSize};});
    console.log(`PC index hero标题: ${JSON.stringify(d)}`);
  }
}
// 手机 iPhone
const mob=await browser.newContext({...devices['iPhone 13']});
const mp=await mob.newPage();
for(const p of ['','gallery/','music/']){
  const n=p===''?'index':p.replace('/','');
  await mp.goto(BASE+'/'+p,{waitUntil:'networkidle',timeout:60000});
  await mp.waitForTimeout(1000);
  await mp.evaluate(async()=>{await new Promise(r=>{let y=0;const t=setInterval(()=>{y+=500;window.scrollTo(0,y);if(y>=document.body.scrollHeight){clearInterval(t);r();}},80);});});
  await mp.evaluate(()=>window.scrollTo(0,0)); await mp.waitForTimeout(600);
  await mp.screenshot({path:`${OUT}/mob-${n}-fold.png`});
}
await browser.close();
console.log('DONE');
