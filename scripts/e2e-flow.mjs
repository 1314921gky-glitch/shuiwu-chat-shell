import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";

const root = resolve("scripts/.e2e-workstation");
rmSync(root, { recursive: true, force: true });
for (const name of ["01_待处理任务_INPUT", "02_已完成交付_OUTPUT", "03_历史归档_ARCHIVE"]) {
  mkdirSync(resolve(root, name), { recursive: true });
}
const shotDir = resolve("scripts/.shots");
mkdirSync(shotDir, { recursive: true });

const server = await createServer({
  configFile: resolve("vite.config.ts"),
  server: { host: "127.0.0.1", port: 1422, strictPort: true },
});
await server.listen();
const addr = server.httpServer?.address();
console.log("listen", addr);
const port = typeof addr === "object" && addr ? addr.port : 1422;
const base = `http://127.0.0.1:${port}`;
console.log("server", base);

await fetch(`${base}/api/settings`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ workstationRoot: root, operator: "周雨琪", pollMs: 4000 }),
});
const detect = await (await fetch(`${base}/api/detect`)).json();
const settings = await (await fetch(`${base}/api/settings`)).json();
console.log("detect", detect.source, detect.root);
console.log("settings", settings.workstationRoot);

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const srcPng = resolve(root, "sample-src.png");
writeFileSync(srcPng, png);

const submitted = await (
  await fetch(`${base}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      root,
      text: "泵房夜景，保留结构线，金属栏杆偏冷色。",
      shortName: "乐流泵房美化",
      operator: "周雨琪",
      files: [{ name: "立面.png", base64: `data:image/png;base64,${png.toString("base64")}` }],
    }),
  })
).json();
if (submitted.error) throw new Error(submitted.error);
console.log("submitted", submitted.folderName);

const demandPath = resolve(root, "01_待处理任务_INPUT", submitted.folderName, "需求.txt");
if (!existsSync(demandPath)) throw new Error("INPUT 缺少 需求.txt");
const demand = readFileSync(demandPath);
if (demand[0] !== 0xef) throw new Error("需求.txt 缺少 UTF-8 BOM");

const waiting = await (await fetch(`${base}/api/tasks?root=${encodeURIComponent(root)}`)).json();
const pending = waiting.find((t) => t.folderName === submitted.folderName);
if (pending?.status !== "processing") throw new Error("发送后应为处理中");

const outDir = resolve(root, "02_已完成交付_OUTPUT", submitted.folderName);
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "效果图.png"), png);
writeFileSync(resolve(outDir, "交付说明.txt"), "夜景一张，已按图纸比例。", "utf8");

const delivered = await (await fetch(`${base}/api/tasks?root=${encodeURIComponent(root)}`)).json();
const last = delivered.find((t) => t.folderName === submitted.folderName);
if (last?.status !== "delivered") throw new Error("OUTPUT 出图后应为已交付");
if (!last.outputs.some((f) => f.name === "效果图.png")) throw new Error("聊天数据缺少成品图");
console.log("delivered", last.status, last.outputs.map((f) => f.name).join(","));

await fetch(`${base}/api/ensure`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ root }),
});

function screenshot(name) {
  return new Promise((resolveP, reject) => {
    const out = resolve(shotDir, name);
    const profile = resolve(shotDir, "chrome-profile");
    mkdirSync(profile, { recursive: true });
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-setuid-sandbox",
      `--user-data-dir=${profile}`,
      "--window-size=1440,900",
      `--screenshot=${out}`,
      "--hide-scrollbars",
      `${base}/`,
    ];
    const child = spawn("google-chrome", args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("exit", (code) =>
      code === 0 ? resolveP(out) : reject(new Error(`chrome ${code}: ${err.slice(-800)}`)),
    );
  });
}

const shot = await screenshot("chat-after-delivery.png");
console.log("screenshot", shot);

const html = await (await fetch(base)).text();
if (!html.includes("水务AI")) throw new Error("首页未包含品牌文案");

await server.close();
console.log("e2e ok");
