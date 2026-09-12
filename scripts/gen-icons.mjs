import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../src-tauri/icons");
mkdirSync(dir, { recursive: true });

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#12202C"/>
      <stop offset="100%" stop-color="#070C12"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>
  <rect x="48" y="48" width="928" height="928" rx="186" fill="none" stroke="#C9A84C" stroke-width="18" opacity="0.7"/>
  <path d="M180 640 C280 500 380 450 500 450 C620 450 680 590 790 590 C860 590 910 540 860 500" fill="none" stroke="#C9A84C" stroke-width="36" stroke-linecap="round"/>
  <path d="M180 730 C300 590 410 540 530 540 C650 540 710 680 820 680 C890 680 940 630 890 590" fill="none" stroke="#5EE0C8" stroke-width="28" stroke-linecap="round" opacity="0.9"/>
  <circle cx="512" cy="320" r="46" fill="#C9A84C"/>
</svg>`;

const svgPath = resolve(dir, "icon.svg");
writeFileSync(svgPath, svg);

const magick = process.platform === "win32" ? "magick" : "magick";
const png = (size, name) => {
  execFileSync(magick, [
    "-background",
    "none",
    svgPath,
    "-resize",
    `${size}x${size}`,
    resolve(dir, name),
  ]);
};

png(1024, "icon-1024.png");
png(256, "128x128@2x.png");
png(128, "128x128.png");
png(32, "32x32.png");
execFileSync(magick, [
  resolve(dir, "icon-1024.png"),
  "-define",
  "icon:auto-resize=256,128,64,48,32,16",
  resolve(dir, "icon.ico"),
]);

console.log("icons written to", dir);
