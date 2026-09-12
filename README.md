# 水务AI聊天壳

给坚果云水务工作站用的 **Windows 双击聊天壳**：同事在窗口里传图纸、打字、点发送；程序把任务写成规范文件夹落入 `01_待处理任务_INPUT`；现有生图管道照旧工作；成品出现在 `02_已完成交付_OUTPUT` 后，聊天里自动展示，并可一键打开成品文件夹。

**不接任何大模型 / 生图 API。** 只做聊天壳、文件夹编排、轮询交付。

---

## 选型结论

采用 **Tauri 2 + React 19 + TypeScript + Vite**。

同事会把程序放到坚果云同步盘根目录。这里体积就是产品问题：Electron 动辄 80–150MB，WPF 自包含运行时也常见 30–80MB，都会拖垮同步；Tauri 走系统 WebView2，发行 EXE 通常约 **8–15MB**，Rust 侧做原子写盘和轮询更稳。Windows 10/11 工作站自带 WebView2，双击即可。

当前仓库在 Linux 上可跑通前端构建、目录编排单测和开发态全链路；**Windows EXE 请在 Windows 上一条龙打包**（见文末）。

---

## 对比过哪些 GitHub 项目，为什么选这个、不选别的

| 项目 | 技术栈 | 大约星标（2026） | 我怎么看 | 为何不直接用 |
| --- | --- | --- | --- | --- |
| [Cherry Studio](https://github.com/CherryHQ/cherry-studio) | Electron + React/TS | ~5.1 万 | 中文桌面 AI 聊天体验最完整的参照：气泡、附件、设置分层都很成熟 | 完整 LLM 客户端；体积大；任务明确禁止接生图 API |
| [Chatbox](https://github.com/Bin-Huang/chatbox) | Electron | ~4.1 万 | 跨端个人聊天壳，附件与本地历史可借鉴 | 同样是模型客户端，且 Electron 包不适合丢进坚果云根目录 |
| [LobeChat](https://github.com/lobehub/lobe-chat) | Next.js 网页 | ~8 万 | UI 完成度最高的开源聊天之一 | 网页/自托管产品，不是「双击 EXE + 本地文件夹」 |
| [NextChat](https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web) | 网页 / 可选 Electron | ~8.8 万 | 轻量 ChatGPT 式布局 | 默认云端模型；桌面只是壳 |
| [Canto](https://github.com/minchenlee/canto) | **Tauri 2 + React 19** | 较新 | 证明「聊天 + 附件 + 本地文件工具」用 Tauri 2 能做得很干净 | 是 Agent/多模型工作区，远超本任务，且会碰本机 shell |
| [Talkio](https://github.com/llt22/talkio) | Tauri 2 + React 19 | 较新 | 本地优先、拖拽附件、SQLite | 多模型群聊，不是文件夹编排 |
| [Ripple IM](https://github.com/fanaujie/ripple-im-app) | Tauri + Vue 3 | 较少 | 即时通讯 + 文件/图片预览的桌面结构可参考 | IM/加密同步，和 INPUT/OUTPUT 管道无关 |
| 各类 WPF 聊天 Demo | WPF / WinUI | — | Windows 原生，企业感强 | 本环境是 Linux，WPF 无法在此验证构建；聊天气泡+拖拽附件+图片灯箱用 XAML 成本高；自包含运行时也不轻 |

**为什么不是 Electron：** Cherry Studio / Chatbox 证明它能做出「高大上」聊天，但发行包会把整份 Chromium 带进坚果云。本程序还要和 `01_待处理任务_INPUT` 当兄妹放在同一层，这个体积不可接受。

**为什么不是 WPF：** 工作站虽是 Windows-only，但 WPF 在本仓库的 Linux 环境里既不能可靠编译，也没有能对标 Cherry Studio 的开源聊天壳可抄；Fluent 要 WinUI 3，工具链更重。

**为什么是 Tauri 2 而不是把上面某个项目改一改：** 产品不是 LLM 客户端。需要的是「看起来像聊天、底下是文件夹」。Canto / Talkio / Ripple 证明 Tauri 2 做聊天+附件成立；业务逻辑（原子落入 INPUT、轮询 OUTPUT）用 Rust 实现，前端只负责中文 UI。

界面借鉴了 Cherry Studio / LobeChat 的「左侧会话、右侧时间线、底部持续输入」，视觉做成两套水务皮肤：深色蓝金控制台、浅色雾青纸面，而不是通用紫调 AI 皮肤。

---

## 同事怎么用

1. 把 `水务AI聊天壳.exe` **放到水务工作站根目录**（和 `01_待处理任务_INPUT` 同一层），双击。
2. 主区先是「请选择项目或新建项目」，**不会**一上来就甩创建表单。
3. 点左侧 **新建项目**，再填 **项目简称**、**操作人**、需求，拖入或选择图纸/原图，点 **发送**（Enter 发送，Shift+Enter 换行）。
4. 窗口进入「已写入 INPUT，管道处理中」。现有管道出图后，同一项目聊天里出现成品图和「交付说明」。**聊天时间精确到秒**（发送 / 写入 INPUT / 交付，本地时区）。
5. 之后在左侧点这个项目，底部继续打字、再附图纸，点 **发送本轮** 即可迭代改图，不用重新建项。
6. 顶栏可在 **跟随系统 / 浅色 / 深色** 之间切换；设置里也能选。偏好写入本地设置，重启仍在。

同事不需要理解 INPUT / OUTPUT 分层。设置里可改根目录和默认操作人。

---

## 目录映射

Windows 工作站根目录（真实机）：

`C:\Users\Administrator\Nutstore\1\我的坚果云\水务AI工作站`

| 工作站目录 | 聊天壳里的含义 |
| --- | --- |
| `01_待处理任务_INPUT/YYYYMMDD[_序号]_简称_操作人/` | 每一轮发送原子写入的任务夹：`需求.txt`（UTF-8 BOM）+ 附件拷贝 |
| `02_已完成交付_OUTPUT/同名任务夹/` | 按轮次轮询；出现图片或 `交付说明.txt` 后挂回**同一项目**聊天 |
| `03_历史归档_ARCHIVE/同名任务夹/` | 归档后仍能在该项目时间线里看到，状态为「已归档」 |

命名规则与工作站说明一致：`YYYYMMDD[_seq]_简称_操作人`。

- 首轮：`20260910_乐流泵房美化_周雨琪`
- 同一项目再发一轮（同日同简称同操作人）：`20260910_2_乐流泵房美化_周雨琪`
- 跨日再发：`20260911_乐流泵房美化_周雨琪`（新日期、新夹，仍归同一项目）
- 禁止在 INPUT **根层**丢散文件；程序也绝不会那样写。

### 项目与迭代如何落盘（方案 B）

UI 里的「项目」= **简称 + 操作人**。每一次发送（新建或追加）都是对该项目的一轮新投递：

- 仍走原管道：每轮生成一个新的 INPUT 任务夹，监测程序按新夹处理，底层逻辑不变。
- 不在旧夹里改 `需求.txt`，避免管道已经在处理或已搬到 OUTPUT 时被覆盖。
- 启动时扫描 INPUT / OUTPUT / ARCHIVE，把同一简称+操作人的多个任务夹排成一条聊天时间线（第 1 轮、第 2 轮…）。成品图挂回对应轮次，而不是另开无关会话。
- 不另建云端库，也不需要额外的 projectId 映射文件：夹名本身就能还原项目。

写入方式：先在根目录 `.shuiwu-tmp/` 写完整页，再 **rename 进 INPUT**。监测程序不会看到半成品夹。

### 主题

- **浅色**：雾青纸面 + 金点，适合白天办公室。
- **深色**：蓝金控制台，适合投影/夜间。
- **跟随系统**：跟操作系统浅色/深色走。
- 顶栏一键循环；设置里可点选。写入本地设置（开发态 `.shuiwu-dev-settings.json`，正式版在应用配置目录 `settings.json`）。

---

## 把 EXE 放到工作站根目录

正确：

```
水务AI工作站\
  水务AI聊天壳.exe
  01_待处理任务_INPUT\
  02_已完成交付_OUTPUT\
  03_历史归档_ARCHIVE\
```

也可以先放子目录，程序会向上找最多 4 层带 `01_待处理任务_INPUT` 的目录。

自动探测顺序：

1. 设置里保存过的根目录
2. EXE 所在目录及向上 4 层
3. 环境变量 `SHUIWU_WORKSTATION`
4. 常见坚果云路径（含 Administrator 与当前用户下的 `Nutstore\1\我的坚果云\水务AI工作站`）

找不到则进入设置页，可指定已有工作站，或选空目录让程序建好三层文件夹。

**不要把整个 `src-tauri/target` 开发目录拷进坚果云。** 只拷那个小 EXE（以及你如果用了 NSIS 安装包，安装到非同步盘也可以，再在设置里指到工作站根目录）。

---

## 本地开发（Linux / macOS / Windows）

```bash
npm install
npm test
npm run dev
```

开发态会在仓库下自动创建 `dev-workstation/` 三层目录，浏览器打开 http://localhost:1420 即可走完「新建项目 → INPUT → 手工往 OUTPUT 放图 → 再对该项目追加需求」。这和正式 EXE 共用同一套命名/写盘规则。

### 如何验证「新建 → 出图 → 再对该项目追加需求」

1. `npm run dev`，打开 http://localhost:1420。确认主区是「请选择项目或新建项目」，没有创建表单。
2. 点 **新建项目**，填简称 `乐流泵房美化`、操作人、需求，可选附件，发送。
3. 在 `dev-workstation/01_待处理任务_INPUT/` 看到 `YYYYMMDD_乐流泵房美化_操作人/`，内有 `需求.txt`。
4. 把效果图（任意 png）和可选的 `交付说明.txt` 放进 `dev-workstation/02_已完成交付_OUTPUT/` 下的**同名夹**。几秒内聊天应出现「管道已交付」。
5. **不要**再点新建。左侧点进该项目，底部输入「再出一张白天」并可再附图，点 **发送本轮**。
6. INPUT 应多出一个 `YYYYMMDD_2_乐流泵房美化_操作人/`。再往这个新夹的 OUTPUT 同名目录放图，同一条聊天会出现第 2 轮交付。
7. 顶栏切换浅色/深色，刷新页面后主题仍在。

```bash
npm run build          # 前端生产构建
npm run tauri:dev      # 本机有 Tauri 依赖时跑桌面调试
```

---

## Windows 一条龙打包

机器需要：

- Windows 10/11 x64
- [Node.js 18+](https://nodejs.org/)
- [Rust](https://rustup.rs)（安装后**重新打开**终端；需要 **rustc 1.88+**，`rustup update` 即可。本 Linux 环境是 1.85，只能验证前端，打不了 Tauri）
- WebView2（Win10/11 通常已带；没有则装 [Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)）

**一条龙：**

```bat
build-windows.bat
```

或手动：

```bat
npm install
npm run icons
npm run tauri:build
```

产物：

| 文件 | 用途 |
| --- | --- |
| `src-tauri\target\release\水务AI聊天壳.exe` | **复制到工作站根目录双击** |
| `src-tauri\target\release\bundle\nsis\*.exe` | 可选安装包 |

本 Linux 构建环境没有 Windows 链接器 / NSIS，**打不出正式 Win EXE**；源码、图标脚本、`build-windows.bat` 和 `npm run tauri:build` 已齐。

本仓库已验证：

- `npm test`：命名规则、原子写入 INPUT、OUTPUT 出图后已交付、同一项目多轮归组、主题持久化
- `npm run build`：前端生产构建通过
- `npm run e2e`：开发服务器上走通 发送 → `需求.txt`+附件落入 INPUT → 写入 OUTPUT → 任务变已交付
- 无头 Chrome 点选输入框、上传附件、点发送，等待「管道处理中」再等到「管道已交付」

---

## 仓库结构

```
src/                 React：项目列表、新建表单、持续聊天、深浅色
src/lib/naming.ts    纯函数：夹名、探测规则
src/lib/projects.ts  任务夹 → 项目线程归组
src/lib/theme.ts     浅色 / 深色 / 跟随系统
server/node-fs.ts    开发态 / 单测用的 Node 写盘实现
src-tauri/           正式 Windows 壳与 Rust 写盘实现
tests/               命名 + 原子写入 + 多轮归组 + 主题
build-windows.bat    Windows 一条龙
```
