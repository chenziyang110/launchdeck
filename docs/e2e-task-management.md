# CLI / Skill / MCP 任务进程管理 E2E 流程

本流程使用仓库内真实示例，而不是只针对 mock 或临时脚本：

- `examples/demo-api`：低风险前台 `check` 任务和带 HTTP 健康检查的托管 `dev` 服务。
- `examples/hands-on-demo`：低风险构建任务、预期失败的前台任务和托管服务。

测试会复制这些示例到临时目录、分配临时端口，并设置独立的 `LAUNCHDECK_HOME`。因此它不会更改本地用户注册表，也不会修改已检出的示例文件。

## 用户旅程：安装、连接并解决真实问题

以下命令在仓库根目录执行，以 `examples/demo-api` 为真实项目。示例把状态放在 `.tmp`，因此不会污染用户的全局 Launchdeck 注册表。先确认 Node.js 版本为 20 或更高。

### 1. 安装并验证 Skill

```powershell
node src/cli.js agent doctor --json --compact
node src/cli.js agent install --agent codex --scope project --target "$PWD\examples\demo-api\.agents\skills" --json --compact
```

第一条命令验证 canonical Skill 和适配器矩阵。第二条将 `launchdeck-agent` 复制到该项目的 Skill 根目录；重复执行会返回 `already_installed`，而不是覆盖不同内容。对于自己的项目，把 `examples\demo-api` 替换为实际项目路径。

### 2. 把本地 MCP 注册到 Codex

```powershell
$env:LAUNCHDECK_HOME = "$PWD\.tmp\launchdeck-user-demo"
New-Item -ItemType Directory -Force $env:LAUNCHDECK_HOME | Out-Null
codex mcp add launchdeck-user-demo --env "LAUNCHDECK_HOME=$env:LAUNCHDECK_HOME" -- node "$PWD\src\mcp\stdio-server.js"
codex mcp get launchdeck-user-demo
```

这是本地 stdio MCP，不会连接远程服务。完成演练后，可用 `codex mcp remove launchdeck-user-demo` 删除这条 Codex 配置；删除 `.tmp\launchdeck-user-demo` 前，先确认其中没有需要保留的运行证据。

也可以构建包含 Skill 与 MCP 定义的 Codex 插件工件：

```powershell
npm run agent:build
```

构建产物位于 `dist\agent-plugins\codex`。Codex 的插件安装来自已配置 marketplace；使用 `codex plugin marketplace add <marketplace-path>`、`codex plugin list` 和 `codex plugin add <plugin>@<marketplace>` 前，请先确认该 marketplace 中暴露的插件名称和版本。直接 MCP 注册是本示例可复现的默认路径。

### 3. 注册真实项目并启动服务

```powershell
node src/cli.js project add examples/demo-api --alias user-demo --json
node src/cli.js capabilities --json --compact
node src/cli.js tasks --json --compact
node src/cli.js run check --json
node src/cli.js start user-demo:dev --json
node src/cli.js inspect task:user-demo:dev --json
```

在 Codex 中打开同一仓库后，可以对 Agent 说：`启动 user-demo 的 dev 服务，并告诉我端口和日志证据。` 已安装的 Skill 应先用 `capabilities.get` 和 `task.status` 观测，再通过 MCP 发出一次 `task.start`。

### 4. 真实故障：服务意外退出后的安全恢复

```powershell
curl.exe http://127.0.0.1:8888/_demo/exit
node src/cli.js reconcile user-demo --json
node src/cli.js inspect task:user-demo:dev --json
node src/cli.js logs user-demo:dev --lines 40 --json
```

`/_demo/exit` 模拟服务在 Launchdeck 之外意外终止。`reconcile` 只把 Launchdeck 的状态与真实 OS 观察重新对齐，不会终止未知进程；`inspect`、日志和事件会显示这个已失效运行的证据。它解决的是“控制面仍把已退出服务当作活跃服务”的真实问题，同时避免误杀或重复启动。因为外部退出会破坏持续的所有权证明，后续启动或停止若被拒绝是预期的安全结果；先处理拒绝中给出的证据和用户确认的下一步，而不是强制重试。

## 运行入口

```bash
npm run check
npm run test:e2e
```

`npm test` 仍会运行完整回归套件，并包含 `test/e2e/`。`test:e2e` 只运行 E2E 文件，适合在改动 CLI、Skill、MCP、进程控制或恢复逻辑时快速复验。

## 测试层次与覆盖范围

| 层次 | 真实入口 | 要验证的结果 |
| --- | --- | --- |
| Skill 路由 | `test/skill/routing-traces.test.js` | 意图先经过 `capabilities.get`，先观测后一次低风险变更；只允许在派发前回退到 CLI。 |
| 安装与 MCP 优先生命周期 | `test/e2e/demo-project-task-management-flow.test.js` | 将 Codex Skill 安装到复制的真实项目；枚举任务、运行前台检查、启动服务、健康检查、读取受限日志/事件、模拟意外退出、CLI reconcile、MCP 重启、停止并释放端口。 |
| CLI 兼容路径 | `test/e2e/demo-project-task-management-flow.test.js` | `--json --compact` 的 capabilities、任务发现和声明的低风险前台任务可用于 MCP 派发前不可用时的兼容回退。 |
| 跨表面与并发 | `test/e2e/agent-surface-us1.test.js` | CLI 与 MCP 复用同一个托管运行；并发启动不会重复 spawn。 |
| 故障与恢复 | `test/e2e/operation-response-loss.test.js`、`test/e2e/operation-recovery.test.js` | 丢失响应后按 operation ID 或受限相关查询恢复，绝不重放原变更。 |
| 进程接管 | `test/e2e/adapter-exit-takeover.test.js`、`test/e2e/cross-runtime-takeover.test.js` | 宿主退出、跨运行时接管和进程所有权边界保持可观察、可恢复。 |

## Skill 驱动的执行顺序

`launchdeck-agent` Skill 的约束是流程的一部分，而不是只写在文档中：

1. 先确认请求是本地项目的生命周期意图，并锁定已配置的项目与任务。
2. 通过 MCP 调用 `capabilities.get`，再用 `task.status`、`task.list`、日志或事件进行最小范围观测。
3. 对当前仍为低风险的声明任务只派发一次：前台任务用 `task.run`，托管服务用 `task.start`、`task.stop` 或 `task.restart`。
4. 仅当 MCP 在派发前不可用或遗漏安全操作时，才用 `launchdeck capabilities --json --compact` 重查能力、重复必要观测，并走一次等价 CLI 操作。
5. 一旦请求可能已派发，不得回退或重试。已知 operation ID 时用 `operation.get`；ID 丢失时只允许一次不超过 15 分钟、最多 20 项的 `operation.list` 相关查询。
6. 风险、所有权、作用域、兼容性、锁或输入拒绝都是最终结果；记录证据并停止，而不是尝试原始 PID/端口操作。

## 失败时的取证

E2E 失败时保留测试输出中的 operation ID、任务和端口。按以下顺序判断：

1. 运行单个场景：`node --test --test-concurrency=1 test/e2e/<文件>.test.js`。
2. 对启动或停止问题，读取受限日志和事件，而不是无限 follow。
3. 对传输中断，先查询原 operation；不要再次执行 `start`、`stop` 或 `run`。
4. 对端口占用和所有权问题，检查 `inspect`/`conflicts`，仅由用户选择下一步的已声明 Launchdeck 任务。

CI 的 `npm test` 会在 Windows、macOS 和 Linux 上执行这些 E2E 测试，并保留单测试 worker，以避免真实子进程和端口之间出现并发污染。
