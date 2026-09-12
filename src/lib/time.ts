export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 本地时区，精确到秒：2026-09-10 22:15:33 */
export function formatLocalDateTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function toDateTimeAttr(ms: number | null | undefined): string | undefined {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return undefined;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}
