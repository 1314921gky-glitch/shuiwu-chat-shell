import { describe, expect, it } from "vitest";
import { groupProjects, projectIdOf, projectStatus } from "../src/lib/projects.ts";
import type { Task } from "../src/lib/types.ts";

function task(partial: Partial<Task> & Pick<Task, "folderName" | "shortName" | "operator">): Task {
  return {
    date: "20260910",
    seq: null,
    demand: "",
    attachments: [],
    outputs: [],
    deliveryNote: "",
    status: "processing",
    createdAt: 1,
    deliveredAt: null,
    inInput: true,
    inOutput: false,
    inArchive: false,
    ...partial,
  };
}

describe("项目归组：同一简称+操作人是一条持续对话", () => {
  it("用简称和操作人生成稳定 projectId", () => {
    expect(projectIdOf({ folderName: "x", shortName: "乐流泵房美化", operator: "周雨琪" })).toBe(
      "乐流泵房美化::周雨琪",
    );
  });

  it("多次任务夹归到同一项目，并按时间排轮次", () => {
    const first = task({
      folderName: "20260910_乐流泵房美化_周雨琪",
      shortName: "乐流泵房美化",
      operator: "周雨琪",
      createdAt: 10,
      status: "delivered",
    });
    const second = task({
      folderName: "20260910_2_乐流泵房美化_周雨琪",
      shortName: "乐流泵房美化",
      operator: "周雨琪",
      createdAt: 20,
      status: "processing",
    });
    const other = task({
      folderName: "20260910_另一项目_周雨琪",
      shortName: "另一项目",
      operator: "周雨琪",
      createdAt: 15,
    });

    const projects = groupProjects([second, other, first]);
    expect(projects).toHaveLength(2);

    const pump = projects.find((p) => p.shortName === "乐流泵房美化");
    expect(pump?.rounds).toBe(2);
    expect(pump?.status).toBe("processing");
    expect(pump?.tasks.map((t) => t.folderName)).toEqual([
      "20260910_乐流泵房美化_周雨琪",
      "20260910_2_乐流泵房美化_周雨琪",
    ]);
  });

  it("项目最近更新取发送与交付时间的较晚者", () => {
    const projects = groupProjects([
      task({
        folderName: "20260910_泵房_甲",
        shortName: "泵房",
        operator: "甲",
        createdAt: 1000,
        deliveredAt: 5000,
        status: "delivered",
      }),
    ]);
    expect(projects[0].updatedAt).toBe(5000);
  });

  it("全部归档才显示已归档，有一轮交付则项目为已交付", () => {
    expect(
      projectStatus([
        task({ folderName: "a", shortName: "泵房", operator: "甲", status: "archived" }),
        task({ folderName: "b", shortName: "泵房", operator: "甲", status: "archived" }),
      ]),
    ).toBe("archived");
    expect(
      projectStatus([
        task({ folderName: "a", shortName: "泵房", operator: "甲", status: "delivered" }),
        task({ folderName: "b", shortName: "泵房", operator: "甲", status: "archived" }),
      ]),
    ).toBe("delivered");
  });
});
