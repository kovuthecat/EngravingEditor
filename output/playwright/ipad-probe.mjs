import { chromium, devices } from "../../../../.tooling/playwright-audit/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const output = new URL("./", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["iPad Pro 11"],
  viewport: { width: 1194, height: 834 },
  screen: { width: 1194, height: 834 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const events = { consoleErrors: [], pageErrors: [], failedRequests: [] };
page.on("console", m => { if (m.type() === "error") events.consoleErrors.push(m.text()); });
page.on("pageerror", e => events.pageErrors.push(e.message));
page.on("requestfailed", r => events.failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
const response = await page.goto("https://engraving-editor.vercel.app/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);
const data = await page.evaluate(() => {
  const rect = el => { const r = el.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom }; };
  const viewportWidth = document.documentElement.clientWidth;
  const overflow = [...document.querySelectorAll("body *")].map(el => ({ tag:el.tagName,id:el.id,cls:typeof el.className === "string" ? el.className.slice(0,100) : "",...rect(el) })).filter(x => x.x < -1 || x.right > viewportWidth + 1).slice(0,100);
  const buttons = [...document.querySelectorAll("button,.btn")].filter(el => el.offsetParent !== null).map(el => ({ id:el.id,text:el.textContent.trim().replace(/\s+/g," ").slice(0,100),...rect(el) }));
  const cards = [...document.querySelectorAll("#library-perso > *,#library-symbole > *,#library-decor > *")].slice(0,12).map(el => ({ tag:el.tagName,cls:el.className,text:el.textContent.trim().replace(/\s+/g," ").slice(0,100),html:el.outerHTML.slice(0,500),...rect(el) }));
  return {
    title: document.title,
    viewport: { innerWidth,innerHeight,dpr:devicePixelRatio,clientWidth:viewportWidth,scrollWidth:document.documentElement.scrollWidth },
    ua:navigator.userAgent,
    counts:{ perso:document.querySelector("#count-perso")?.textContent, symbole:document.querySelector("#count-symbole")?.textContent, decor:document.querySelectorAll("#library-decor > *").length },
    sidebar:rect(document.querySelector("#sidebar")), stageWrap:rect(document.querySelector("#stage-wrap")), stage:rect(document.querySelector("#stage")),
    overflow, buttons, cards,
    touchAction:getComputedStyle(document.querySelector("#stage-wrap")).touchAction,
  };
});
data.httpStatus = response?.status();
data.events = events;
await page.screenshot({ path: fileURLToPath(new URL("ipad-initial.png", output)), fullPage: true });
await writeFile(new URL("ipad-probe.json", output), JSON.stringify(data,null,2));
console.log(JSON.stringify(data,null,2));
await browser.close();


