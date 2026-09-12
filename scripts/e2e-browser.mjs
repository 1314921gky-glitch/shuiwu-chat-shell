import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import puppeteer from "puppeteer-core";

const root = resolve("scripts/.e2e-workstation");
rmSync(root, { recursive: true, force: true });
for (const name of ["01_待处理任务_INPUT", "02_已完成交付_OUTPUT", "03_历史归档_ARCHIVE"]) {
  mkdirSync(resolve(root, name), { recursive: true });
}
const shotDir = resolve("scripts/.shots");
mkdirSync(shotDir, { recursive: true });

const server = await createServer({
  configFile: resolve("vite.config.ts"),
  server: { host: "127.0.0.1", port: 1423, strictPort: true },
});
await server.listen();
const base = "http://127.0.0.1:1423";

await fetch(`${base}/api/settings`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ workstationRoot: root, operator: "周雨琪", pollMs: 1500 }),
});

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.setDefaultTimeout(20000);
await page.goto(base, { waitUntil: "networkidle0" });

await page.waitForSelector(".empty h2");
const emptyTitle = await page.$eval(".empty h2", (el) => el.textContent || "");
if (!emptyTitle.includes("请选择项目或新建项目")) throw new Error("未选项目时应提示选择或新建");
if (await page.$(".create-card")) throw new Error("未点新建时不应出现创建表单");
await page.screenshot({ path: resolve(shotDir, "01-empty.png") });

await page.click("[data-action='new-project']");
await page.waitForSelector(".create-card textarea");

await page.evaluate(() => {
  const fields = document.querySelectorAll(".create-card .field input");
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  set?.call(fields[0], "乐流泵房美化");
  set?.call(fields[1], "周雨琪");
  fields[0].dispatchEvent(new Event("input", { bubbles: true }));
  fields[1].dispatchEvent(new Event("input", { bubbles: true }));
  const ta = document.querySelector(".create-card textarea");
  const tset = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  tset?.call(ta, "把泵房立面做成夜景，保留原结构。");
  ta?.dispatchEvent(new Event("input", { bubbles: true }));
});

const { execFileSync } = await import("node:child_process");
const tmp = resolve(shotDir, "upload.png");
execFileSync("magick", [
  "-size",
  "240x160",
  "gradient:#163044-#0b1a22",
  "-fill",
  "#C9A84C",
  "-pointsize",
  "22",
  "-gravity",
  "center",
  "-annotate",
  "+0-12",
  "立面",
  "-fill",
  "#5EE0C8",
  "-pointsize",
  "14",
  "-annotate",
  "+0+18",
  "DRAWING",
  tmp,
]);
const fileInput = await page.$("input.hidden-file");
await fileInput.uploadFile(tmp);

await page.waitForFunction(() => {
  const btn = document.querySelector(".create-card .btn-gold");
  return btn instanceof HTMLButtonElement && !btn.disabled;
});
await page.click(".create-card .btn-gold");
await page.waitForFunction(() => document.body.innerText.includes("管道处理中"));
await page.screenshot({ path: resolve(shotDir, "02-waiting.png") });

const tasks = await (await fetch(`${base}/api/tasks?root=${encodeURIComponent(root)}`)).json();
const folder = tasks[0]?.folderName;
if (!folder) throw new Error("UI 发送后未出现任务夹");
const outPng = resolve(root, "02_已完成交付_OUTPUT", folder, "效果图.png");
mkdirSync(resolve(root, "02_已完成交付_OUTPUT", folder), { recursive: true });
execFileSync("magick", [
  "-size",
  "720x420",
  "gradient:#1a3a4a-#0c141c",
  "-fill",
  "#E8D48B",
  "-pointsize",
  "36",
  "-gravity",
  "center",
  "-annotate",
  "0",
  "夜景成品",
  outPng,
]);
writeFileSync(resolve(root, "02_已完成交付_OUTPUT", folder, "交付说明.txt"), "夜景一张。");

await page.waitForFunction(() => document.body.innerText.includes("管道已交付"), { timeout: 12000 });
await page.screenshot({ path: resolve(shotDir, "03-delivered.png") });

const body = await page.evaluate(() => document.body.innerText);
if (!body.includes("乐流泵房美化")) throw new Error("界面未见项目简称");
if (!body.includes("打开 OUTPUT")) throw new Error("界面未见打开 OUTPUT");

await fetch(`${base}/api/settings`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    workstationRoot: resolve("dev-workstation"),
    operator: "周雨琪",
    pollMs: 4000,
    theme: "system",
  }),
});

await browser.close();
await server.close();
console.log("browser e2e ok", folder);
