# CURSOR_TASK_R4 · 真实发送/交付时间 + 发送后 webhook

模型：Grok 4.6 Extra High（xhigh）

## 背景
`server/node-fs.ts` 里 `createdAt`/`deliveredAt` 用文件夹与 `需求.txt`/成品的 **mtime**。任务归档后 `需求.txt` 拷到 ARCHIVE，mtime 被刷新，界面出现「发送」与「交付」只差 1–2 秒（用户实际等很久）。示例轮次 `20260912_龚魁彦_示例项目`。

另：不要助手 30 秒狂扫 WebDAV。改为壳写入 INPUT 后立刻 webhook；可保留轻量 5 分钟兜底（助手侧，本任务只做壳侧 webhook）。

## A. 真实发送/交付时间
1. `submitTask` 写入 INPUT 时，额外落盘稳定时间戳：`meta.json`（或 `sent_at.txt`），ISO 或 epoch，**写入后不再改**。
2. `listTasks` 的 `createdAt`：**优先读该时间戳**；禁止再用归档后的 `需求.txt` mtime 冒充发送时间。
3. `deliveredAt`：优先成品 / `交付说明.txt` 的首次可见时间；若管道可写 `delivered_at` 更好；不要用「壳轮询发现时刻」或「归档拷贝时刻」当发送时间。
4. UI 继续显示到秒（发送 / 交付）。
5. **测试**：模拟归档后 `createdAt` 仍等于发送时刻；`deliveredAt` > `createdAt`。

同步改：`server/node-fs.ts`、`src-tauri/src/workstation.rs`（若 Rust 侧同样扫盘）、相关 types、`tests/node-fs.test.ts`。

## B. 发送后 webhook
1. `submitTask` 原子写入 INPUT（需求+附件）**成功后**，POST 可配置 webhook。
2. 设置项增加：`webhookUrl` + `webhookKey`（或 Authorization）；默认空则跳过并打日志，**不阻断发送**。
3. Body 建议：`{ event:"ready", folderName, root?, sentAt }`；`Authorization: Bearer <key>`。
4. 密钥勿进仓库；走本地 settings（与现有 settings 同路径）。

## C. 文档
更新工作站根目录用的说明（或仓库内 README / 若有 `水务AI聊天壳_使用说明.md` 副本）：时间字段含义、webhook 配置（URL/key 从 Grok Bot routine「水务READY即时出图」复制）。

## 验收
- 同项目再发一轮 → 发送时间固定，不因归档漂移
- 有 webhook 配置时能打到（可探测）
- 无 webhook 配置时发送仍成功
- `npm test` 通过

## 不要
- 不要为展示时间改文件夹命名规则
- 不要把密钥写进 git
