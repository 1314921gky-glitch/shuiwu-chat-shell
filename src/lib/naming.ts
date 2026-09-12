export const INPUT_DIR = "01_待处理任务_INPUT";
export const OUTPUT_DIR = "02_已完成交付_OUTPUT";
export const ARCHIVE_DIR = "03_历史归档_ARCHIVE";
export const STAGING_DIR = ".shuiwu-tmp";

export const DEMAND_FILE = "需求.txt";
export const DELIVERY_NOTE_FILE = "交付说明.txt";

const ILLEGAL = /[\\/:*?"<>|\n\r\t]/g;

export const IMAGE_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
]);

export function sanitizeSegment(raw: string): string {
  return raw
    .replace(ILLEGAL, "")
    .replace(/^\.+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDate(d = new Date()): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

export function buildTaskFolderName(
  date: string,
  seq: number | null,
  shortName: string,
  operator: string,
): string {
  const s = sanitizeSegment(shortName);
  const o = sanitizeSegment(operator);
  if (!s) throw new Error("简称不能为空");
  if (!o) throw new Error("操作人不能为空");
  if (!/^\d{8}$/.test(date)) throw new Error("日期格式应为 YYYYMMDD");
  if (seq == null || seq <= 1) return `${date}_${s}_${o}`;
  return `${date}_${seq}_${s}_${o}`;
}

export type ParsedFolder = {
  date: string;
  seq: number | null;
  shortName: string;
  operator: string;
};

/** YYYYMMDD[_seq]_简称_操作人 —— 操作人取最后一段，简称可含下划线 */
export function parseTaskFolderName(name: string): ParsedFolder | null {
  const m = name.match(/^(\d{8})(?:_(\d+))?_(.+)_([^_]+)$/);
  if (!m) return null;
  return {
    date: m[1],
    seq: m[2] ? Number(m[2]) : null,
    shortName: m[3],
    operator: m[4],
  };
}

export function nextTaskFolderName(
  existing: string[],
  shortName: string,
  operator: string,
  date = formatDate(),
): string {
  const set = new Set(existing);
  const base = buildTaskFolderName(date, null, shortName, operator);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(buildTaskFolderName(date, n, shortName, operator))) n += 1;
  return buildTaskFolderName(date, n, shortName, operator);
}

export function isImageName(name: string): boolean {
  const i = name.lastIndexOf(".");
  if (i < 0) return false;
  return IMAGE_EXTS.has(name.slice(i).toLowerCase());
}

export function isSkippableEntry(name: string): boolean {
  if (!name || name === "." || name === "..") return true;
  if (name.startsWith(".")) return true;
  const lower = name.toLowerCase();
  return lower === "thumbs.db" || lower === "desktop.ini" || lower === ".ds_store";
}

export function isStagingName(name: string): boolean {
  return name.startsWith(".shuiwu") || name.startsWith(".staging");
}

export function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}
