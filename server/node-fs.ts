import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  ARCHIVE_DIR,
  DELIVERY_NOTE_FILE,
  DEMAND_FILE,
  INPUT_DIR,
  OUTPUT_DIR,
  STAGING_DIR,
  formatDate,
  isImageName,
  isSkippableEntry,
  isStagingName,
  nextTaskFolderName,
  parseTaskFolderName,
  sanitizeSegment,
  stripBom,
} from "../src/lib/naming.ts";
import { parseTheme } from "../src/lib/theme.ts";
import type {
  AppSettings,
  DetectResult,
  FileItem,
  OpenTarget,
  SubmitPayload,
  Task,
  TaskStatus,
} from "../src/lib/types.ts";

export const DEFAULT_SETTINGS: AppSettings = {
  workstationRoot: "",
  operator: "",
  pollMs: 4000,
  theme: "system",
};

const WELL_KNOWN = [
  "C:\\Users\\Administrator\\Nutstore\\1\\我的坚果云\\水务AI工作站",
  "C:/Users/Administrator/Nutstore/1/我的坚果云/水务AI工作站",
];

export function looksLikeWorkstation(root: string): boolean {
  try {
    return fs.existsSync(path.join(root, INPUT_DIR));
  } catch {
    return false;
  }
}

function walkUp(start: string, levels = 4): string[] {
  const out: string[] = [];
  let cur = path.resolve(start);
  for (let i = 0; i < levels; i += 1) {
    out.push(cur);
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return out;
}

function unique(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of paths) {
    if (!raw) continue;
    const resolved = path.resolve(raw);
    const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
}

export function collectCandidates(exeDir?: string, extra: string[] = []): string[] {
  const home = os.homedir();
  const user = (() => {
    try {
      return os.userInfo().username;
    } catch {
      return process.env.USERNAME || process.env.USER || "";
    }
  })();

  const list: string[] = [];
  if (exeDir) list.push(...walkUp(exeDir, 4));
  if (process.env.SHUIWU_WORKSTATION) list.push(process.env.SHUIWU_WORKSTATION);
  list.push(path.resolve(process.cwd(), "dev-workstation"));
  list.push(...WELL_KNOWN);
  if (home) {
    list.push(path.join(home, "Nutstore", "1", "我的坚果云", "水务AI工作站"));
    list.push(path.join(home, "坚果云", "水务AI工作站"));
    list.push(path.join(home, "Nutstore", "水务AI工作站"));
  }
  if (user) {
    list.push(`C:\\Users\\${user}\\Nutstore\\1\\我的坚果云\\水务AI工作站`);
  }
  list.push("D:\\Nutstore\\1\\我的坚果云\\水务AI工作站");
  list.push(...extra);
  return unique(list);
}

export function detectWorkstationRoot(
  exeDir?: string,
  extra: string[] = [],
  preferred?: string,
): DetectResult {
  const candidates = collectCandidates(exeDir, extra);
  if (preferred && looksLikeWorkstation(preferred)) {
    return { ok: true, root: path.resolve(preferred), source: "settings", candidates };
  }
  for (const item of candidates) {
    if (looksLikeWorkstation(item)) {
      const source = exeDir && item.startsWith(path.resolve(exeDir)) ? "exe-adjacent" : "well-known";
      return { ok: true, root: item, source, candidates };
    }
  }
  if (preferred && fs.existsSync(preferred)) {
    return { ok: true, root: path.resolve(preferred), source: "settings-empty", candidates };
  }
  return { ok: false, root: null, source: "unset", candidates };
}

export function ensureWorkstation(root: string): string {
  const resolved = path.resolve(root);
  fs.mkdirSync(path.join(resolved, INPUT_DIR), { recursive: true });
  fs.mkdirSync(path.join(resolved, OUTPUT_DIR), { recursive: true });
  fs.mkdirSync(path.join(resolved, ARCHIVE_DIR), { recursive: true });
  return resolved;
}

function listSubdirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !isSkippableEntry(d.name) && !isStagingName(d.name))
    .map((d) => d.name);
}

function readTextIfExists(file: string): string {
  if (!fs.existsSync(file)) return "";
  return stripBom(fs.readFileSync(file, "utf8")).trim();
}

function listFiles(dir: string, skipNames: Set<string>): FileItem[] {
  if (!fs.existsSync(dir)) return [];
  const items: FileItem[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || isSkippableEntry(entry.name) || skipNames.has(entry.name)) continue;
    items.push({
      name: entry.name,
      path: path.join(dir, entry.name),
      kind: isImageName(entry.name) ? "image" : "file",
    });
  }
  items.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  return items;
}

function mtimeMs(p: string): number {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function latestMtime(paths: string[]): number {
  let latest = 0;
  for (const p of paths) {
    const t = mtimeMs(p);
    if (t > latest) latest = t;
  }
  return latest;
}

function deliveryTimeMs(outputDir: string, archiveDir: string, outputs: FileItem[], delivered: boolean): number | null {
  if (!delivered) return null;
  const t = latestMtime([
    path.join(outputDir, DELIVERY_NOTE_FILE),
    path.join(archiveDir, DELIVERY_NOTE_FILE),
    outputDir,
    archiveDir,
    ...outputs.map((item) => item.path),
  ]);
  return t > 0 ? t : null;
}

function statusOf(inInput: boolean, inOutput: boolean, inArchive: boolean, delivered: boolean): TaskStatus {
  if (inArchive && !inInput && !inOutput) return "archived";
  if (delivered) return "delivered";
  return "processing";
}

export function listTasks(root: string): Task[] {
  const input = path.join(root, INPUT_DIR);
  const output = path.join(root, OUTPUT_DIR);
  const archive = path.join(root, ARCHIVE_DIR);

  const inputNames = listSubdirs(input);
  const outputNames = listSubdirs(output);
  const archiveNames = listSubdirs(archive);
  const names = [...new Set([...inputNames, ...outputNames, ...archiveNames])];

  const tasks: Task[] = [];
  for (const folderName of names) {
    const parsed = parseTaskFolderName(folderName);
    const inInput = inputNames.includes(folderName);
    const inOutput = outputNames.includes(folderName);
    const inArchive = archiveNames.includes(folderName);
    const inputDir = path.join(input, folderName);
    const outputDir = path.join(output, folderName);
    const archiveDir = path.join(archive, folderName);
    const homeDir = inInput ? inputDir : inOutput ? outputDir : archiveDir;

    const demand =
      readTextIfExists(path.join(inputDir, DEMAND_FILE)) ||
      readTextIfExists(path.join(outputDir, DEMAND_FILE)) ||
      readTextIfExists(path.join(archiveDir, DEMAND_FILE));

    const skip = new Set([DEMAND_FILE, DELIVERY_NOTE_FILE]);
    const attachments = listFiles(inputDir, skip);
    const outputs = inOutput ? listFiles(outputDir, skip) : listFiles(archiveDir, skip);
    const deliveryNote =
      readTextIfExists(path.join(outputDir, DELIVERY_NOTE_FILE)) ||
      readTextIfExists(path.join(archiveDir, DELIVERY_NOTE_FILE));
    const delivered = outputs.some((f) => f.kind === "image") || Boolean(deliveryNote);

    tasks.push({
      folderName,
      date: parsed?.date ?? "",
      seq: parsed?.seq ?? null,
      shortName: parsed?.shortName ?? folderName,
      operator: parsed?.operator ?? "",
      demand,
      attachments: inInput ? attachments : attachments.filter((f) => f.kind !== "image" || !outputs.some((o) => o.name === f.name)),
      outputs,
      deliveryNote,
      status: statusOf(inInput, inOutput, inArchive, delivered),
      createdAt:
        latestMtime([
          path.join(inputDir, DEMAND_FILE),
          path.join(outputDir, DEMAND_FILE),
          path.join(archiveDir, DEMAND_FILE),
          homeDir,
        ]) || Date.now(),
      deliveredAt: deliveryTimeMs(outputDir, archiveDir, outputs, delivered),
      inInput,
      inOutput,
      inArchive,
    });
  }

  tasks.sort((a, b) => a.createdAt - b.createdAt || a.folderName.localeCompare(b.folderName, "zh"));
  return tasks;
}

function uniqueFileName(dir: string, name: string): string {
  const safe = path.basename(name).replace(/[\\/:*?"<>|]/g, "_");
  if (!fs.existsSync(path.join(dir, safe))) return safe;
  const ext = path.extname(safe);
  const stem = safe.slice(0, safe.length - ext.length);
  let i = 2;
  while (fs.existsSync(path.join(dir, `${stem}_${i}${ext}`))) i += 1;
  return `${stem}_${i}${ext}`;
}

function copyDirSync(src: string, dest: string) {
  fs.cpSync(src, dest, { recursive: true, errorOnExist: true });
}

export function submitTask(root: string, payload: SubmitPayload): Task {
  const text = payload.text.replace(/^\uFEFF/, "").trim();
  const shortName = sanitizeSegment(payload.shortName);
  const operator = sanitizeSegment(payload.operator);
  if (!text) throw new Error("请先填写需求");
  if (!shortName) throw new Error("请填写项目简称");
  if (!operator) throw new Error("请填写操作人");

  const resolved = ensureWorkstation(root);
  const input = path.join(resolved, INPUT_DIR);
  const existing = listSubdirs(input).concat(listSubdirs(path.join(resolved, OUTPUT_DIR)), listSubdirs(path.join(resolved, ARCHIVE_DIR)));

  const date =
    payload.date && /^\d{8}$/.test(payload.date) ? payload.date : formatDate();
  let folderName = nextTaskFolderName(existing, shortName, operator, date);
  const stagingRoot = path.join(resolved, STAGING_DIR);
  fs.mkdirSync(stagingRoot, { recursive: true });
  const staging = path.join(stagingRoot, crypto.randomUUID());
  fs.mkdirSync(staging, { recursive: true });

  try {
    const demandBytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(text.replace(/^\uFEFF/, ""), "utf8"),
    ]);
    fs.writeFileSync(path.join(staging, DEMAND_FILE), demandBytes);

    for (const file of payload.files) {
      if (!file.name) continue;
      const destName = uniqueFileName(staging, file.name);
      const dest = path.join(staging, destName);
      if (file.path) {
        const src = path.resolve(file.path);
        if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
          throw new Error(`附件不存在：${file.name}`);
        }
        fs.copyFileSync(src, dest);
      } else if (file.base64) {
        const raw = file.base64.includes(",") ? file.base64.split(",")[1] : file.base64;
        fs.writeFileSync(dest, Buffer.from(raw, "base64"));
      }
    }

    let dest = path.join(input, folderName);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (fs.existsSync(dest)) {
        folderName = nextTaskFolderName(
          listSubdirs(input).concat(folderName),
          shortName,
          operator,
          date,
        );
        dest = path.join(input, folderName);
        continue;
      }
      try {
        fs.renameSync(staging, dest);
        break;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "EXDEV") {
          copyDirSync(staging, dest);
          fs.rmSync(staging, { recursive: true, force: true });
          break;
        }
        if (code === "EEXIST") {
          folderName = nextTaskFolderName(listSubdirs(input), shortName, operator, date);
          dest = path.join(input, folderName);
          continue;
        }
        throw err;
      }
    }
    if (!fs.existsSync(dest)) throw new Error("写入 INPUT 失败");
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw err;
  } finally {
    try {
      const leftover = fs.readdirSync(stagingRoot);
      if (leftover.length === 0) fs.rmdirSync(stagingRoot);
    } catch {
      /* ignore */
    }
  }

  const tasks = listTasks(resolved);
  const created = tasks.find((t) => t.folderName === folderName);
  if (!created) throw new Error("任务已写入，但读取失败");
  return created;
}

export function resolveOpenPath(root: string, target: OpenTarget): string {
  if (target.kind === "path" && target.path) return target.path;
  if (target.kind === "input") return path.join(root, INPUT_DIR);
  if (target.kind === "output") return path.join(root, OUTPUT_DIR);
  if (target.kind === "archive") return path.join(root, ARCHIVE_DIR);
  if (target.kind === "task-output" && target.folderName) {
    const out = path.join(root, OUTPUT_DIR, target.folderName);
    if (fs.existsSync(out)) return out;
    const arch = path.join(root, ARCHIVE_DIR, target.folderName);
    if (fs.existsSync(arch)) return arch;
    return path.join(root, OUTPUT_DIR);
  }
  return root;
}

export function openPath(targetPath: string): void {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`路径不存在：${targetPath}`);
  }
  const platform = process.platform;
  const { spawn } = require("node:child_process") as typeof import("node:child_process");
  if (platform === "win32") {
    spawn("explorer", [targetPath], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (platform === "darwin") {
    spawn("open", [targetPath], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [targetPath], { detached: true, stdio: "ignore" }).unref();
}

export function assertUnderRoot(root: string, filePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(filePath);
  const rel = path.relative(resolvedRoot, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("禁止读取工作站以外的文件");
  }
  return resolved;
}

export function loadSettingsFile(file: string): AppSettings {
  if (!fs.existsSync(file)) return { ...DEFAULT_SETTINGS };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<AppSettings>;
    return {
      workstationRoot: raw.workstationRoot ?? "",
      operator: raw.operator ?? "",
      pollMs: typeof raw.pollMs === "number" && raw.pollMs >= 1500 ? raw.pollMs : 4000,
      theme: parseTheme(raw.theme),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettingsFile(file: string, settings: AppSettings): AppSettings {
  const next: AppSettings = {
    workstationRoot: settings.workstationRoot?.trim() ?? "",
    operator: sanitizeSegment(settings.operator ?? ""),
    pollMs: Math.max(1500, Math.min(30000, settings.pollMs || 4000)),
    theme: parseTheme(settings.theme),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function initDevWorkstation(root = path.resolve(process.cwd(), "dev-workstation")): string {
  return ensureWorkstation(root);
}
