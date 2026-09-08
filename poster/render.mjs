import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', '.qa', 'poster');
import fs from 'fs';
fs.mkdirSync(outDir, {recursive:true});

const browser = await chromium.launch({headless:true});

async function shot(htmlFile, outFile, viewport, zoom){
  const ctx = await browser.newContext({viewport});
  const page = await ctx.newPage();
  const fileUrl = 'file://' + path.join(__dirname, htmlFile).replace(/\\/g,'/');
  await page.goto(fileUrl, {waitUntil:'networkidle'});
  if(zoom && zoom!==1){
    await page.evaluate((z)=>{ document.body.style.zoom = String(z); }, zoom);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(800);
  await page.screenshot({path: path.join(outDir, outFile), fullPage:false});
  console.log(`saved ${outFile} ${viewport.width}x${viewport.height}`);
  await ctx.close();
}

await shot('poster-en-4k.html', 'cude-new-launch-en-4k.png', {width:3840,height:2160}, 1);
await shot('poster-tr-4k.html', 'cude-new-launch-tr-4k.png', {width:3840,height:2160}, 1);
await shot('poster-en-4k.html', 'cude-new-launch-en-github.png', {width:1920,height:1080}, 0.5);
await shot('poster-tr-4k.html', 'cude-new-launch-tr-github.png', {width:1920,height:1080}, 0.5);

await browser.close();
console.log('all done', fs.readdirSync(outDir));
