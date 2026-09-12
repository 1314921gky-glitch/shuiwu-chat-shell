import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { api, isTauri } from "./lib/api";
import { groupProjects, projectIdOf } from "./lib/projects";
import { applyTheme, cacheTheme, nextTheme, parseTheme, themeLabel } from "./lib/theme";
import { formatLocalDateTime, toDateTimeAttr } from "./lib/time";
import type { AppSettings, DetectResult, FileItem, Task, ThemePref } from "./lib/types";
import {
  IconClose,
  IconDesktop,
  IconFolder,
  IconGear,
  IconMark,
  IconMoon,
  IconPaperclip,
  IconPlus,
  IconSend,
  IconSun,
} from "./components/icons";

type DraftFile = {
  id: string;
  name: string;
  path?: string;
  preview?: string;
  base64?: string;
  kind: "image" | "file";
};

type ViewMode = "idle" | "create" | "chat";

const SELECTED_PROJECT_KEY = "shuiwu-selected-project";

const emptySettings: AppSettings = {
  workstationRoot: "",
  operator: "",
  pollMs: 4000,
  theme: "system",
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isImageName(name: string) {
  return /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(name);
}

function statusLabel(status: Task["status"]) {
  if (status === "delivered") return "已交付";
  if (status === "archived") return "已归档";
  return "处理中";
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readStoredProjectId() {
  try {
    return localStorage.getItem(SELECTED_PROJECT_KEY);
  } catch {
    return null;
  }
}

function storeProjectId(id: string | null) {
  try {
    if (id) localStorage.setItem(SELECTED_PROJECT_KEY, id);
    else localStorage.removeItem(SELECTED_PROJECT_KEY);
  } catch {
    /* ignore */
  }
}

function When({ ms, label }: { ms: number | null | undefined; label?: string }) {
  const text = formatLocalDateTime(ms);
  if (!text) return null;
  return (
    <time className="when" dateTime={toDateTimeAttr(ms)}>
      {label ? `${label} ${text}` : text}
    </time>
  );
}

function ThemeGlyph({ pref }: { pref: ThemePref }) {
  if (pref === "light") return <IconSun />;
  if (pref === "dark") return <IconMoon />;
  return <IconDesktop />;
}

function FileThumb({
  item,
  large,
  onOpen,
}: {
  item: FileItem;
  large?: boolean;
  onOpen?: (src: string, name: string) => void;
}) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (item.kind !== "image") return;
    let alive = true;
    void api.fileUrl(item.path).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [item.path, item.kind]);

  if (item.kind !== "image") {
    return <span className="chip">{item.name}</span>;
  }
  if (!src) return <span className="chip">{item.name}</span>;
  return (
    <button
      type="button"
      className={large ? "shot" : "thumb"}
      onClick={() => onOpen?.(src, item.name)}
    >
      <img src={src} alt={item.name} />
    </button>
  );
}

export default function App() {
  const [boot, setBoot] = useState(true);
  const [detect, setDetect] = useState<DetectResult | null>(null);
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [root, setRoot] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mode, setMode] = useState<ViewMode>("idle");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [shortName, setShortName] = useState("");
  const [operator, setOperator] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftRoot, setDraftRoot] = useState("");
  const [dragging, setDragging] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null);
  const [setupRoot, setSetupRoot] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const theme = parseTheme(settings.theme);
  const projects = useMemo(() => groupProjects(tasks), [tasks]);
  const currentProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const pending = useMemo(() => tasks.filter((t) => t.status === "processing").length, [tasks]);

  const refresh = useCallback(async (nextRoot = root) => {
    if (!nextRoot) return;
    const list = await api.listTasks(nextRoot);
    setTasks(list);
  }, [root]);

  useEffect(() => {
    applyTheme(theme);
    cacheTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  useEffect(() => {
    void (async () => {
      try {
        const [detected, saved] = await Promise.all([api.detect(), api.getSettings()]);
        const nextSettings: AppSettings = { ...emptySettings, ...saved, theme: parseTheme(saved.theme) };
        setDetect(detected);
        setSettings(nextSettings);
        setOperator(nextSettings.operator);
        applyTheme(nextSettings.theme);
        cacheTheme(nextSettings.theme);
        const resolved = nextSettings.workstationRoot || detected.root || "";
        setRoot(resolved);
        setDraftRoot(resolved);
        setSetupRoot(resolved);
        if (resolved) {
          const list = await api.listTasks(resolved);
          setTasks(list);
          const stored = readStoredProjectId();
          if (stored && groupProjects(list).some((p) => p.id === stored)) {
            setSelectedProjectId(stored);
            setMode("chat");
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBoot(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const stop = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === "over") setDragging(true);
        if (event.payload.type === "leave") setDragging(false);
        if (event.payload.type === "drop") {
          setDragging(false);
          addDrafts(
            event.payload.paths.map((p) => ({
              id: uid(),
              name: p.replace(/\\/g, "/").split("/").pop() || p,
              path: p,
              kind: isImageName(p) ? "image" : "file",
            })),
          );
        }
      });
      if (disposed) stop();
      else unlisten = stop;
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!root) return;
    const ms = Math.max(1500, settings.pollMs || 4000);
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, ms);
    return () => window.clearInterval(timer);
  }, [root, settings.pollMs, refresh]);

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [currentProject?.tasks.length, currentProject?.tasks.map((t) => t.status + t.outputs.length).join("|")]);

  useEffect(() => {
    if (busy || mode !== "chat" || !selectedProjectId || tasks.length === 0) return;
    if (!projects.some((project) => project.id === selectedProjectId)) {
      setMode("idle");
      setSelectedProjectId(null);
      storeProjectId(null);
    }
  }, [busy, mode, selectedProjectId, tasks.length, projects]);

  async function persistSettings(next: AppSettings) {
    const saved = await api.saveSettings(next);
    const normalized: AppSettings = { ...emptySettings, ...saved, theme: parseTheme(saved.theme) };
    setSettings(normalized);
    applyTheme(normalized.theme);
    cacheTheme(normalized.theme);
    return normalized;
  }

  async function useRoot(next: string) {
    const ensured = await api.ensureRoot(next);
    await persistSettings({ ...settings, workstationRoot: ensured.root, operator });
    setRoot(ensured.root);
    setDraftRoot(ensured.root);
    setSetupRoot(ensured.root);
    await refresh(ensured.root);
    const again = await api.detect();
    setDetect(again);
  }

  function addDrafts(items: DraftFile[]) {
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name + (f.path || "")));
      return [...prev, ...items.filter((f) => !names.has(f.name + (f.path || "")))];
    });
  }

  async function onWebFiles(list: FileList | File[]) {
    const next: DraftFile[] = [];
    for (const file of Array.from(list)) {
      const data = await readAsDataUrl(file);
      next.push({
        id: uid(),
        name: file.name,
        preview: isImageName(file.name) ? data : undefined,
        base64: data,
        kind: isImageName(file.name) ? "image" : "file",
      });
    }
    addDrafts(next);
  }

  async function onPickFiles() {
    setError("");
    if (isTauri()) {
      const picked = await api.pickFiles();
      addDrafts(
        picked.map((f) => ({
          id: uid(),
          name: f.name,
          path: f.path,
          kind: isImageName(f.name) ? "image" : "file",
        })),
      );
      return;
    }
    fileRef.current?.click();
  }

  function startCreate() {
    setMode("create");
    setSelectedProjectId(null);
    storeProjectId(null);
    setShortName("");
    setOperator(settings.operator);
    setText("");
    setFiles([]);
    setError("");
  }

  function openProject(id: string) {
    setMode("chat");
    setSelectedProjectId(id);
    storeProjectId(id);
    setText("");
    setFiles([]);
    setError("");
  }

  function cancelCreate() {
    setMode("idle");
    setText("");
    setFiles([]);
    setError("");
  }

  async function onThemeChange(pref: ThemePref) {
    await persistSettings({ ...settings, theme: pref, workstationRoot: root || settings.workstationRoot });
  }

  async function onSend() {
    if (!root) {
      setError("请先设定工作站根目录");
      return;
    }
    const sendName = mode === "create" ? shortName : currentProject?.shortName ?? "";
    const sendOperator = mode === "create" ? operator : currentProject?.operator ?? "";
    setError("");
    setBusy(true);
    try {
      const task = await api.submitTask(root, {
        text,
        shortName: sendName,
        operator: sendOperator,
        files: files.map((f) => ({ name: f.name, path: f.path, base64: f.base64 })),
      });
      setText("");
      setFiles([]);
      const id = projectIdOf(task);
      setTasks((prev) => {
        if (prev.some((item) => item.folderName === task.folderName)) {
          return prev.map((item) => (item.folderName === task.folderName ? task : item));
        }
        return [...prev, task];
      });
      setSelectedProjectId(id);
      storeProjectId(id);
      setMode("chat");
      if (sendOperator && sendOperator !== settings.operator) {
        await persistSettings({ ...settings, operator: sendOperator, workstationRoot: root });
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function canSend() {
    if (busy || !text.trim()) return false;
    if (mode === "create") return Boolean(shortName.trim() && operator.trim());
    return mode === "chat" && Boolean(currentProject);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend()) void onSend();
    }
  }

  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (mode === "idle") return;
    if (e.dataTransfer.files?.length) {
      await onWebFiles(e.dataTransfer.files);
    }
  }

  function renderAttachBar(showHint: boolean) {
    return (
      <div className="attach-list">
        <button type="button" className="btn btn-ghost" onClick={() => void onPickFiles()}>
          <IconPaperclip /> 附件
        </button>
        {files.map((f) => (
          <span className="attach-item" key={f.id}>
            {f.preview ? <img src={f.preview} alt="" /> : null}
            {f.name}
            <button type="button" onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}>
              <IconClose />
            </button>
          </span>
        ))}
        {files.length === 0 && showHint && <span className="hint">可附图纸或原图</span>}
      </div>
    );
  }

  if (boot) {
    return <div className="app-boot">水务工作站</div>;
  }

  if (!root) {
    return (
      <div className="setup">
        <div className="setup-card">
          <IconMark className="mark" />
          <div className="setup-kicker">WATERWORKS ATELIER</div>
          <h1>水务AI · 聊天生图</h1>
          <p>
            未找到工作站根目录。请选择包含「01_待处理任务_INPUT」的文件夹，或指定一个空目录由程序自动建好三层结构。
          </p>
          <div className="setup-row">
            <input
              value={setupRoot}
              onChange={(e) => setSetupRoot(e.target.value)}
              placeholder="例如 C:\Users\Administrator\Nutstore\1\我的坚果云\水务AI工作站"
            />
            {isTauri() && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void api.pickDirectory().then((p) => p && setSetupRoot(p))}
              >
                浏览
              </button>
            )}
            <button
              type="button"
              className="btn btn-gold"
              disabled={!setupRoot.trim()}
              onClick={() => void useRoot(setupRoot.trim()).catch((err) => setError(String(err)))}
            >
              进入工作站
            </button>
          </div>
          {error && <p className="err">{error}</p>}
          {detect?.candidates?.length ? (
            <ul className="candidates">
              {detect.candidates.slice(0, 8).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="shell"
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={(e) => void onDrop(e)}
    >
      {dragging && mode !== "idle" && <div className="dropmask">松开，附到这次需求</div>}

      <aside className="sidebar">
        <div className="brand">
          <IconMark className="mark" />
          <div>
            <h1>水务AI</h1>
            <small>CHAT TO RENDER</small>
          </div>
        </div>
        <div className="side-actions">
          <button
            type="button"
            className={`btn btn-gold new-project ${mode === "create" ? "active" : ""}`}
            data-action="new-project"
            onClick={startCreate}
          >
            <IconPlus /> 新建项目
          </button>
        </div>
        <div className="side-meta">
          今日管道 <b>{pending}</b> 单处理中 · {projects.length} 个项目
        </div>
        <div className="task-list">
          {projects.length === 0 ? (
            <div className="side-empty">还没有项目。点上方「新建项目」开始。</div>
          ) : (
            projects.map((project) => (
              <button
                type="button"
                key={project.id}
                className={`task-item ${mode === "chat" && selectedProjectId === project.id ? "active" : ""}`}
                onClick={() => openProject(project.id)}
              >
                <div className="t1">
                  <span>{project.shortName}</span>
                  <span className={`status ${project.status}`}>{statusLabel(project.status)}</span>
                </div>
                <div className="t2">
                  {project.operator} · {project.rounds} 轮
                </div>
                <div className="t3">
                  <When ms={project.updatedAt} />
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div className="path" title={root}>
            {mode === "chat" && currentProject
              ? `${currentProject.shortName} · ${currentProject.operator}`
              : `工作站 · ${root}`}
          </div>
          <div className="top-actions">
            <button
              type="button"
              className="btn btn-ghost"
              data-action="theme"
              title={`当前：${themeLabel(theme)}，点击切换`}
              onClick={() => void onThemeChange(nextTheme(theme))}
            >
              <ThemeGlyph pref={theme} /> {themeLabel(theme)}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void api.openFolder(root, { kind: "output" })}
            >
              <IconFolder /> 打开 OUTPUT
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>
              <IconGear /> 设置
            </button>
          </div>
        </header>

        <div className="chat" ref={chatRef}>
          {mode === "idle" && (
            <div className="empty">
              <IconMark className="mark" />
              <h2>请选择项目或新建项目</h2>
              <p>左侧点已有项目可以继续用聊天和附件改图；点「新建项目」才会出现简称、操作人、需求这些创建字段。</p>
            </div>
          )}

          {mode === "create" && (
            <div className="create-card">
              <div className="setup-kicker">NEW PROJECT</div>
              <h2>新建项目</h2>
              <p>第一次发送会写入坚果云 INPUT。之后这个项目会出现在左侧，可以继续追加调整。</p>
              <div className="fields">
                <label className="field">
                  <span>项目简称</span>
                  <input
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value)}
                    placeholder="例如 乐流泵房美化"
                  />
                </label>
                <label className="field">
                  <span>操作人</span>
                  <input
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    placeholder="例如 周雨琪"
                  />
                </label>
              </div>
              <label className="field">
                <span>需求</span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="描述出图要求。附件可拖进来，或点回形针选择图纸 / 原图。"
                />
              </label>
              <div className="composer-bar">
                {renderAttachBar(true)}
                <div className="create-actions">
                  {error && <div className="err">{error}</div>}
                  <button type="button" className="btn btn-ghost" onClick={cancelCreate}>
                    取消
                  </button>
                  <button
                    type="button"
                    className="btn btn-gold"
                    disabled={!canSend()}
                    onClick={() => void onSend()}
                  >
                    <IconSend /> {busy ? "写入中" : "发送"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {mode === "chat" && currentProject && (
            <div className="thread">
              {currentProject.tasks.map((task, index) => (
                <article key={task.folderName} id={`task-${task.folderName}`} className="block">
                  <div className="bubble user">
                    <div className="who">
                      第 {index + 1} 轮 · {task.operator} · {task.shortName}
                    </div>
                    {task.demand || "（无文字需求）"}
                    {task.attachments.length > 0 && (
                      <div className="thumbs">
                        {task.attachments.map((f) => (
                          <FileThumb key={f.path} item={f} onOpen={(src, name) => setLightbox({ src, name })} />
                        ))}
                      </div>
                    )}
                    <div className="bubble-meta">
                      <When ms={task.createdAt} label="发送" />
                      <span className="folder-name">{task.folderName}</span>
                    </div>
                  </div>

                  {task.status === "processing" && (
                    <div className="bubble sys">
                      <div className="waiting">
                        <span className="dots">
                          <i />
                          <i />
                          <i />
                        </span>
                        已写入 INPUT，管道处理中
                      </div>
                      <When ms={task.createdAt} label="写入" />
                    </div>
                  )}

                  {task.status !== "processing" && (
                    <div className="delivery">
                      <div className="delivery-head">
                        <h3>
                          {task.status === "archived" ? "归档成品" : "管道已交付"}
                          <small>第 {index + 1} 轮</small>
                        </h3>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            void api.openFolder(root, { kind: "task-output", folderName: task.folderName })
                          }
                        >
                          <IconFolder /> 打开成品文件夹
                        </button>
                      </div>
                      <div className="gallery">
                        {task.outputs
                          .filter((f) => f.kind === "image")
                          .map((f) => (
                            <FileThumb
                              key={f.path}
                              item={f}
                              large
                              onOpen={(src, name) => setLightbox({ src, name })}
                            />
                          ))}
                        {task.outputs
                          .filter((f) => f.kind === "file")
                          .map((f) => (
                            <span className="chip" key={f.path}>
                              {f.name}
                            </span>
                          ))}
                      </div>
                      {task.deliveryNote ? <div className="note">{task.deliveryNote}</div> : null}
                      <When ms={task.deliveredAt ?? task.createdAt} label="交付" />
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>

        {mode === "chat" && currentProject && (
          <div className="composer-wrap">
            <div className="composer">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="继续提调整需求，可再附图纸。每次发送都是这个项目的新一轮投递。"
              />
              <div className="composer-bar">
                {renderAttachBar(true)}
                <div>
                  {error && <div className="err">{error}</div>}
                  <button
                    type="button"
                    className="btn btn-gold"
                    disabled={!canSend()}
                    onClick={() => void onSend()}
                  >
                    <IconSend /> {busy ? "写入中" : "发送本轮"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <input
        ref={fileRef}
        className="hidden-file"
        type="file"
        multiple
        onChange={(e) => {
          if (e.target.files) void onWebFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {settingsOpen && (
        <div className="modal-bg" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>工作站设置</h2>
            <label className="field">
              <span>外观</span>
              <div className="theme-switch" role="radiogroup" aria-label="主题">
                {(["system", "light", "dark"] as const).map((pref) => (
                  <button
                    key={pref}
                    type="button"
                    role="radio"
                    aria-checked={theme === pref}
                    className={`theme-opt ${theme === pref ? "active" : ""}`}
                    onClick={() => void onThemeChange(pref)}
                  >
                    <ThemeGlyph pref={pref} /> {themeLabel(pref)}
                  </button>
                ))}
              </div>
            </label>
            <label className="field" style={{ marginTop: 14 }}>
              <span>根目录</span>
              <input value={draftRoot} onChange={(e) => setDraftRoot(e.target.value)} />
            </label>
            <div className="setup-row" style={{ marginTop: 10 }}>
              {isTauri() && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void api.pickDirectory().then((p) => p && setDraftRoot(p))}
                >
                  浏览文件夹
                </button>
              )}
            </div>
            <label className="field" style={{ marginTop: 12 }}>
              <span>默认操作人</span>
              <input value={operator} onChange={(e) => setOperator(e.target.value)} />
            </label>
            <p className="hint" style={{ marginTop: 14 }}>
              探测来源：{detect?.source || "—"}。EXE 若放在含 INPUT
              的根目录旁，下次会自动识别，无需再填。主题会写入本地设置，重启后保持。
            </p>
            <div className="actions">
              <button type="button" className="btn btn-ghost" onClick={() => setSettingsOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-gold"
                onClick={() => {
                  void (async () => {
                    await useRoot(draftRoot.trim());
                    setSettingsOpen(false);
                  })().catch((err) => setError(String(err)));
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox.src} alt={lightbox.name} />
        </div>
      )}
    </div>
  );
}
