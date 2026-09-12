import { createReadStream, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import {
  DEFAULT_SETTINGS,
  assertUnderRoot,
  detectWorkstationRoot,
  ensureWorkstation,
  initDevWorkstation,
  listTasks,
  loadSettingsFile,
  openPath,
  resolveOpenPath,
  saveSettingsFile,
  submitTask,
} from "./server/node-fs.ts";
import type { AppSettings, OpenTarget, SubmitPayload } from "./src/lib/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const settingsFile = resolve(here, ".shuiwu-dev-settings.json");

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function guessMime(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function currentRoot(settings: AppSettings, extra?: string): string | null {
  const detect = detectWorkstationRoot(undefined, extra ? [extra] : [], settings.workstationRoot);
  return detect.root;
}

function workstationPlugin() {
  return {
    name: "shuiwu-dev-api",
    configureServer(server: {
      middlewares: {
        use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void;
      };
    }) {
      initDevWorkstation();
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/")) {
          next();
          return;
        }

        void (async () => {
          try {
            const u = new URL(url, "http://127.0.0.1");
            const settings = loadSettingsFile(settingsFile);

            if (u.pathname === "/api/detect" && req.method === "GET") {
              sendJson(res, 200, detectWorkstationRoot(undefined, [], settings.workstationRoot));
              return;
            }

            if (u.pathname === "/api/settings" && req.method === "GET") {
              const detect = detectWorkstationRoot(undefined, [], settings.workstationRoot);
              sendJson(res, 200, {
                ...DEFAULT_SETTINGS,
                ...settings,
                workstationRoot: settings.workstationRoot || detect.root || resolve(here, "dev-workstation"),
              });
              return;
            }

            if (u.pathname === "/api/settings" && req.method === "POST") {
              const body = JSON.parse(await readBody(req)) as AppSettings;
              sendJson(res, 200, saveSettingsFile(settingsFile, body));
              return;
            }

            if (u.pathname === "/api/ensure" && req.method === "POST") {
              const body = JSON.parse(await readBody(req)) as { root: string };
              const root = ensureWorkstation(body.root);
              saveSettingsFile(settingsFile, { ...settings, workstationRoot: root });
              sendJson(res, 200, { root });
              return;
            }

            if (u.pathname === "/api/tasks" && req.method === "GET") {
              const root = u.searchParams.get("root") || currentRoot(settings);
              if (!root) {
                sendJson(res, 400, { error: "未找到工作站根目录" });
                return;
              }
              sendJson(res, 200, listTasks(root));
              return;
            }

            if (u.pathname === "/api/tasks" && req.method === "POST") {
              const body = JSON.parse(await readBody(req)) as SubmitPayload & { root?: string };
              const root = body.root || currentRoot(settings);
              if (!root) {
                sendJson(res, 400, { error: "未找到工作站根目录" });
                return;
              }
              sendJson(res, 200, submitTask(root, body));
              return;
            }

            if (u.pathname === "/api/open" && req.method === "POST") {
              const body = JSON.parse(await readBody(req)) as { root: string; target: OpenTarget };
              const openAt = resolveOpenPath(body.root, body.target);
              try {
                openPath(openAt);
              } catch {
                /* headless 环境可能没有文件管理器 */
              }
              sendJson(res, 200, { ok: true, path: openAt });
              return;
            }

            if (u.pathname === "/api/file" && req.method === "GET") {
              const filePath = u.searchParams.get("path") || "";
              const root = settings.workstationRoot || currentRoot(settings);
              if (!root) {
                sendJson(res, 400, { error: "未找到工作站根目录" });
                return;
              }
              const safe = assertUnderRoot(root, filePath);
              if (!existsSync(safe)) {
                sendJson(res, 404, { error: "文件不存在" });
                return;
              }
              res.statusCode = 200;
              res.setHeader("Content-Type", guessMime(safe));
              res.setHeader("Cache-Control", "no-cache");
              createReadStream(safe).pipe(res);
              return;
            }

            sendJson(res, 404, { error: "unknown api" });
          } catch (err) {
            sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
          }
        })();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), workstationPlugin()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  preview: {
    port: 1420,
    strictPort: true,
  },
});
