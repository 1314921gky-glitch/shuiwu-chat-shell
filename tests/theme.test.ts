import { describe, expect, it } from "vitest";
import { nextTheme, parseTheme, themeLabel } from "../src/lib/theme.ts";

describe("主题偏好", () => {
  it("只接受 system / light / dark，其它回落到跟随系统", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme("")).toBe("system");
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("blue")).toBe("system");
  });

  it("顶栏按 跟随系统 → 浅色 → 深色 循环", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });

  it("中文标签", () => {
    expect(themeLabel("light")).toBe("浅色");
    expect(themeLabel("dark")).toBe("深色");
    expect(themeLabel("system")).toBe("跟随系统");
  });
});
