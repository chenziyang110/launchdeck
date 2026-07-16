# sp-map-scan 执行摘要

## 范围
- 扫描集解析: 523 个候选文件
- 深度读取: 41 个文件 (P0: 16 源文件, P1: 25 测试/配置/脚本)
- 采样: 33 个文件 (文档、代理定义、示例)
- 清单仅: 445 个文件 (主要是 .claude/ 和 .codex/ 技能副本)
- 排除: 4 个文件 (.tmp/, .launchdeck/runtime/)

## 扫描包
| 包 | 路径 | 值层 | 接受 |
|---|---|---|---|
| lane-cli-entrypoints | 7 | P0 | pass |
| lane-control-plane | 9 | P0 | pass |
| lane-core-services | 5 | P1 | pass |
| lane-tests | 20 | P1 | pass |

## 关键发现
- **架构**: daemonless, 用户作用域全局控制面板, Node.js ESM, 零外部运行时依赖
- **控制平面**: 7 个子模块 (actions, events, inspect, locks, ownership, runs, state) + 全局/本地运行时
- **所有权模型**: 5 级置信度 (verified/probable/stale/external/unknown)
- **输出**: 稳定 JSON 信封, 紧凑模式用于代理
- **CI**: 3 平台矩阵 (Windows/macOS/Linux) 带内联生命周期烟雾测试
- **安全性**: 永不杀死未认领进程, 停止需要所有权证明, 清理仅卫生

## 输出
- 临时节点: 40 个
- 临时边: 25 个
- 观察: 17 个
- 证据记录: 58 个

## 就绪状态
- [x] 忽略门: 已审查并确认
- [x] 扫描集: 已解析
- [x] 仓库清单: 已写入
- [x] 扫描目标: 已写入
- [x] 扫描队列: 已写入
- [x] 交付账本: 已写入
- [x] 扫描包: 4 个包已写入
- [x] 工作者结果: 4 个交付均已接受
- [x] 证据: 58 个文件已创建
- [x] 临时节点/边/观察: 已写入
- [x] 覆盖率: 已写入
- [ ] 验证扫描: 待运行
