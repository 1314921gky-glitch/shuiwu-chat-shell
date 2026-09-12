import { describe, expect, it } from "vitest";
import {
  buildTaskFolderName,
  nextTaskFolderName,
  parseTaskFolderName,
  sanitizeSegment,
} from "../src/lib/naming.ts";

describe("任务文件夹命名 YYYYMMDD[_seq]_简称_操作人", () => {
  it("首单不加序号，对齐 乐流泵房美化_周雨琪", () => {
    expect(nextTaskFolderName([], "乐流泵房美化", "周雨琪", "20260910")).toBe(
      "20260910_乐流泵房美化_周雨琪",
    );
  });

  it("重名后从 2 起序号", () => {
    const existing = ["20260910_乐流泵房美化_周雨琪"];
    expect(nextTaskFolderName(existing, "乐流泵房美化", "周雨琪", "20260910")).toBe(
      "20260910_2_乐流泵房美化_周雨琪",
    );
  });

  it("能解析带序号的历史夹名", () => {
    const parsed = parseTaskFolderName("20260910_1_龚魁彦_示例项目");
    expect(parsed).toEqual({
      date: "20260910",
      seq: 1,
      shortName: "龚魁彦",
      operator: "示例项目",
    });
  });

  it("简称允许内部下划线", () => {
    const name = buildTaskFolderName("20260910", null, "一期_泵房", "张三");
    expect(name).toBe("20260910_一期_泵房_张三");
    expect(parseTaskFolderName(name)).toEqual({
      date: "20260910",
      seq: null,
      shortName: "一期_泵房",
      operator: "张三",
    });
  });

  it("去掉非法路径字符", () => {
    expect(sanitizeSegment("泵房/A:*?")).toBe("泵房A");
  });
});
