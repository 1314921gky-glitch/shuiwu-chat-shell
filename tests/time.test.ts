import { describe, expect, it } from "vitest";
import { formatLocalDateTime } from "../src/lib/time.ts";

describe("本地时间精确到秒", () => {
  it("格式为 YYYY-MM-DD HH:mm:ss", () => {
    const ms = new Date(2026, 8, 10, 22, 15, 33).getTime();
    expect(formatLocalDateTime(ms)).toBe("2026-09-10 22:15:33");
  });

  it("空值或非法毫秒不展示", () => {
    expect(formatLocalDateTime(0)).toBe("");
    expect(formatLocalDateTime(null)).toBe("");
    expect(formatLocalDateTime(undefined)).toBe("");
    expect(formatLocalDateTime(Number.NaN)).toBe("");
  });
});
