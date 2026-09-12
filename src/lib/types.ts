export type TaskStatus = "processing" | "delivered" | "archived";

export type FileKind = "image" | "file";

export type FileItem = {
  name: string;
  path: string;
  kind: FileKind;
};

export type Task = {
  folderName: string;
  date: string;
  seq: number | null;
  shortName: string;
  operator: string;
  demand: string;
  attachments: FileItem[];
  outputs: FileItem[];
  deliveryNote: string;
  status: TaskStatus;
  createdAt: number;
  deliveredAt: number | null;
  inInput: boolean;
  inOutput: boolean;
  inArchive: boolean;
};

export type ThemePref = "system" | "light" | "dark";

export type AppSettings = {
  workstationRoot: string;
  operator: string;
  pollMs: number;
  theme: ThemePref;
};

export type DetectResult = {
  ok: boolean;
  root: string | null;
  source: string;
  candidates: string[];
};

export type SubmitPayload = {
  text: string;
  shortName: string;
  operator: string;
  date?: string;
  files: Array<{
    name: string;
    path?: string;
    base64?: string;
  }>;
};

export type OpenTarget = {
  kind: "input" | "output" | "archive" | "task-output" | "path";
  folderName?: string;
  path?: string;
};
