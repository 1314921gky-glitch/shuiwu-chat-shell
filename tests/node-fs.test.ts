import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { INPUT_DIR, OUTPUT_DIR } from "../src/lib/naming.ts";
import { groupProjects } from "../src/lib/projects.ts";
import { formatLocalDateTime } from "../src/lib/time.ts";
import {
  detectWorkstationRoot,
  ensureWorkstation,
  listTasks,
  loadSettingsFile,
  looksLikeWorkstation,
  saveSettingsFile,
  submitTask,
} from "../server/node-fs.ts";

const temps: string[] = [];

function tmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shuiwu-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("工作站探测与原子写入", () => {
  it("只在存在 INPUT 时认定为工作站", () => {
    const root = tmpRoot();
    expect(looksLikeWorkstation(root)).toBe(false);
    ensureWorkstation(root);
    expect(looksLikeWorkstation(root)).toBe(true);
    const detected = detectWorkstationRoot(root);
    expect(detected.root).toBe(path.resolve(root));
  });

  it("发送后 INPUT 出现规范任务夹，且不在 INPUT 根层落散文件", () => {
    const root = ensureWorkstation(tmpRoot());
    const attachment = path.join(root, "src.png");
    fs.writeFileSync(attachment, "fake-png");

    const task = submitTask(root, {
      text: "把泵房立面做成夜景，保留原结构。",
      shortName: "乐流泵房美化",
      operator: "周雨琪",
      files: [{ name: "立面.png", path: attachment }],
    });

    expect(task.folderName).toMatch(/^\d{8}_乐流泵房美化_周雨琪$/);
    const folder = path.join(root, INPUT_DIR, task.folderName);
    expect(fs.existsSync(path.join(folder, "需求.txt"))).toBe(true);
    expect(fs.existsSync(path.join(folder, "立面.png"))).toBe(true);
    const demand = fs.readFileSync(path.join(folder, "需求.txt"));
    expect(demand[0]).toBe(0xef);
    expect(demand.toString("utf8")).toContain("夜景");

    const loose = fs
      .readdirSync(path.join(root, INPUT_DIR), { withFileTypes: true })
      .filter((e) => e.isFile());
    expect(loose).toHaveLength(0);

    const second = submitTask(root, {
      text: "再出一张白天效果",
      shortName: "乐流泵房美化",
      operator: "周雨琪",
      files: [],
    });
    expect(second.folderName).toMatch(/_2_乐流泵房美化_周雨琪$/);
  });

  it("OUTPUT 出图后任务变为已交付", () => {
    const root = ensureWorkstation(tmpRoot());
    const task = submitTask(root, {
      text: "出图",
      shortName: "示例项目",
      operator: "龚魁彦",
      files: [],
    });
    expect(listTasks(root)[0].status).toBe("processing");
    expect(listTasks(root)[0].createdAt).toBeGreaterThan(0);
    expect(listTasks(root)[0].deliveredAt).toBeNull();
    expect(formatLocalDateTime(listTasks(root)[0].createdAt)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    const out = path.join(root, OUTPUT_DIR, task.folderName);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "效果图.png"), "img");
    fs.writeFileSync(path.join(out, "交付说明.txt"), "夜景一张，已按图纸比例。");

    const delivered = listTasks(root)[0];
    expect(delivered.status).toBe("delivered");
    expect(delivered.outputs.some((f) => f.name === "效果图.png")).toBe(true);
    expect(delivered.deliveryNote).toContain("夜景");
    expect(delivered.deliveredAt).toBeGreaterThan(0);
    expect(formatLocalDateTime(delivered.deliveredAt)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("同一项目再次发送会新开任务夹，扫描后归到同一项目线程", () => {
    const root = ensureWorkstation(tmpRoot());
    const first = submitTask(root, {
      text: "先出夜景",
      shortName: "乐流泵房美化",
      operator: "周雨琪",
      files: [],
    });
    const second = submitTask(root, {
      text: "再改成白天，栏杆更亮",
      shortName: "乐流泵房美化",
      operator: "周雨琪",
      files: [],
    });
    expect(second.folderName).not.toBe(first.folderName);
    expect(second.folderName).toMatch(/_2_乐流泵房美化_周雨琪$/);

    const projects = groupProjects(listTasks(root));
    expect(projects).toHaveLength(1);
    expect(projects[0].rounds).toBe(2);
    expect(projects[0].tasks.map((t) => t.demand)).toEqual(["先出夜景", "再改成白天，栏杆更亮"]);
  });

  it("主题写入本地设置并可回读，缺省字段回落跟随系统", () => {
    const file = path.join(tmpRoot(), "settings.json");
    const saved = saveSettingsFile(file, {
      workstationRoot: "/tmp/ws",
      operator: "周雨琪",
      pollMs: 4000,
      theme: "light",
    });
    expect(saved.theme).toBe("light");
    expect(loadSettingsFile(file).theme).toBe("light");

    fs.writeFileSync(file, JSON.stringify({ workstationRoot: "/tmp/ws", operator: "甲" }), "utf8");
    expect(loadSettingsFile(file).theme).toBe("system");
  });
});
