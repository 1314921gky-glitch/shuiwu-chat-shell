import { formatDate } from "./naming";
import type {
  AppSettings,
  DetectResult,
  OpenTarget,
  SubmitPayload,
  Task,
} from "./types";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const api = {
  async detect(): Promise<DetectResult> {
    if (isTauri()) return invokeTauri("detect_root");
    return jsonFetch("/api/detect");
  },

  async getSettings(): Promise<AppSettings> {
    if (isTauri()) return invokeTauri("get_settings");
    return jsonFetch("/api/settings");
  },

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    if (isTauri()) return invokeTauri("save_settings", { settings });
    return jsonFetch("/api/settings", {
      method: "POST",
      body: JSON.stringify(settings),
    });
  },

  async ensureRoot(root: string): Promise<{ root: string }> {
    if (isTauri()) return invokeTauri("ensure_root", { root });
    return jsonFetch("/api/ensure", {
      method: "POST",
      body: JSON.stringify({ root }),
    });
  },

  async listTasks(root: string): Promise<Task[]> {
    if (isTauri()) return invokeTauri("list_tasks", { root });
    return jsonFetch(`/api/tasks?root=${encodeURIComponent(root)}`);
  },

  async submitTask(root: string, payload: SubmitPayload): Promise<Task> {
    if (isTauri()) {
      return invokeTauri("submit_task", {
        root,
        text: payload.text,
        shortName: payload.shortName,
        operator: payload.operator,
        files: payload.files.map((f) => ({ name: f.name, path: f.path ?? "" })),
        date: formatDate(),
      });
    }
    return jsonFetch("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ root, ...payload, date: payload.date || formatDate() }),
    });
  },

  async openFolder(root: string, target: OpenTarget): Promise<void> {
    if (isTauri()) {
      await invokeTauri("open_folder", { root, target });
      return;
    }
    await jsonFetch("/api/open", {
      method: "POST",
      body: JSON.stringify({ root, target }),
    });
  },

  async pickFiles(): Promise<Array<{ name: string; path: string }>> {
    if (isTauri()) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        title: "选择图纸或原图",
      });
      if (!selected) return [];
      const paths = Array.isArray(selected) ? selected : [selected];
      return paths.map((p) => ({
        name: p.replace(/\\/g, "/").split("/").pop() || p,
        path: p,
      }));
    }
    return [];
  },

  async pickDirectory(): Promise<string | null> {
    if (isTauri()) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        title: "选择水务AI工作站根目录",
      });
      return typeof selected === "string" ? selected : null;
    }
    return null;
  },

  async fileUrl(filePath: string): Promise<string> {
    if (isTauri()) {
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      return convertFileSrc(filePath);
    }
    return `/api/file?path=${encodeURIComponent(filePath)}`;
  },
};
