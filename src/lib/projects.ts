import type { Task, TaskStatus } from "./types";

export type Project = {
  id: string;
  shortName: string;
  operator: string;
  tasks: Task[];
  rounds: number;
  status: TaskStatus;
  updatedAt: number;
};

export function projectIdOf(task: Pick<Task, "folderName" | "shortName" | "operator">): string {
  const shortName = task.shortName.trim();
  const operator = task.operator.trim();
  if (shortName && operator) return `${shortName}::${operator}`;
  return `folder::${task.folderName}`;
}

export function projectStatus(tasks: Task[]): TaskStatus {
  if (tasks.some((task) => task.status === "processing")) return "processing";
  if (tasks.length > 0 && tasks.every((task) => task.status === "archived")) return "archived";
  if (tasks.some((task) => task.status === "delivered")) return "delivered";
  return "processing";
}

export function groupProjects(tasks: Task[]): Project[] {
  const buckets = new Map<string, Task[]>();
  for (const task of tasks) {
    const id = projectIdOf(task);
    const list = buckets.get(id);
    if (list) list.push(task);
    else buckets.set(id, [task]);
  }

  const projects: Project[] = [];
  for (const [id, list] of buckets) {
    const ordered = [...list].sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.seq ?? 1) - (b.seq ?? 1) || a.folderName.localeCompare(b.folderName, "zh");
    });
    const last = ordered[ordered.length - 1];
    projects.push({
      id,
      shortName: last.shortName,
      operator: last.operator,
      tasks: ordered,
      rounds: ordered.length,
      status: projectStatus(ordered),
      updatedAt: Math.max(...ordered.map((task) => Math.max(task.createdAt, task.deliveredAt ?? 0))),
    });
  }

  projects.sort((a, b) => b.updatedAt - a.updatedAt || a.shortName.localeCompare(b.shortName, "zh"));
  return projects;
}
