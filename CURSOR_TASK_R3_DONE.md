# R3 完成报告：聊天时间精确到秒

## 改了哪些文件

- `src/lib/time.ts`：本地时区格式化 `YYYY-MM-DD HH:mm:ss`
- `src/lib/types.ts`：任务增加 `deliveredAt`
- `src/lib/projects.ts`：左侧「最近更新」取发送/交付较晚者
- `src/App.tsx`：用户气泡、等待气泡、交付块、左侧项目列表展示到秒
- `src/styles.css`：深浅色下次要时间文字可读
- `server/node-fs.ts` / `src-tauri/src/workstation.rs`：扫描时写入 `createdAt` / `deliveredAt`（Rust 侧先算 `delivered_at` 再移入 `outputs`，避免 E0382）
- `tests/time.test.ts`、`tests/node-fs.test.ts`、`tests/projects.test.ts`
- `README.md`：补一句「聊天时间精确到秒」

未改 INPUT / OUTPUT / ARCHIVE 目录约定，也未改任务夹命名规则。

## 时间从哪取

| UI | 字段 | 来源 |
| --- | --- | --- |
| 用户消息「发送」 | `createdAt` | `需求.txt` 的 mtime（INPUT，否则 OUTPUT / ARCHIVE），再退回任务夹 mtime |
| 系统等待「写入」 | `createdAt` | 同上，即落入 INPUT 的时间 |
| 交付块「交付」 | `deliveredAt` | OUTPUT/ARCHIVE 中 `交付说明.txt`、成品文件、任务夹的最晚 mtime；没有则回退 `createdAt` |
| 左侧项目最近更新 | `updatedAt` | 该项目各轮 `createdAt` 与 `deliveredAt` 的最大值 |

刷新后重新扫描磁盘，时间仍正确。不接外部时钟服务。

## 如何肉眼验证

1. `npm run dev`，打开已有项目（或新建一单）。
2. 用户气泡右下应有 `发送 2026-… …:…:…`（含秒）。
3. 处理中时，等待气泡有 `写入` 同一时刻（到秒）。
4. 把图放进 `02_已完成交付_OUTPUT` 同名夹，交付块出现 `交付` 时间（到秒），一般晚于发送。
5. 左侧项目第三行是最近更新，精确到秒。
6. 顶栏切换浅色/深色，时间文字仍清楚。

`npm test` 含时间格式单测（`2026-09-10 22:15:33`）以及扫描后 `createdAt` / `deliveredAt` 可格式化到秒。

Windows `tauri build` 的 E0382（`outputs` 移入 `Task` 后又被 `delivery_time_ms` 借用）已改为先计算 `delivered_at` 再移动，行为不变。
