# CI 后续优化调查与实验

日期：2026-11-04（UTC+08）。状态：三处优化已实现并验证，额外候选已测量；整轮单测提速尚未得到证实。

代码提交为 `a0ae15626d19431363a6f4a16a7bacf398aad283`，已发布到 `perf/ci-follow-up-20261104`。本报告的后续提交只更新调查材料，不改变已验证的 CI 输入。

## 已实现的改进

1. 完整性检查在同一次 blob 解析中提取精简文件耗时，再调用现有权重函数写出 manifest。保留独立生成 CLI；PR 继续跳过时长发布。
2. 对规范 flatted 表使用 `JSON.parse` 后解析引用，避免逐个字符串装箱和 reviver 遍历。完整图内容、循环和共享引用均保留；非规范输入退回官方解析器。只供两个仓库 CI 脚本使用，不修改 Vitest 或第三方库。
3. 单测先安装完整 Chromium 二进制，再实际启动 headless shell。可启动时跳过系统依赖安装；只有缺少运行库时才执行 `install-deps` 并再次验证。其他启动错误直接失败。

单测与 E2E 共用不可覆盖的浏览器缓存 key，因此二进制安装保留完整 Chromium。仅安装 `--only-shell` 会使新版本缓存缺少 E2E 所需的有头浏览器，迫使 E2E 反复下载；该方案已用失败回归测试发现并撤回。E2E 保留原有系统依赖安装。

补齐了时长生成器、权重工具、blob 解析器和 sequencer 的 Test 工作流路径触发，并把新 CI 脚本回归测试纳入分片 1。

## 实验样本和比较边界

| 样本 | 源码版本 | Test | E2E |
| --- | --- | --- | --- |
| 同日合并前 main | `c8adaecf7f16b8d6ba45031e42769c67bf6a7adc` | [41656791026](https://github.com/qixing-jk/all-api-hub/actions/runs/41656791026) | [41656790941](https://github.com/qixing-jk/all-api-hub/actions/runs/41656790941) |
| PR #1817 最终提交 | `ef3f01ee2aea15b1a2289225ca5302ac5fd58354` | [41685357437](https://github.com/qixing-jk/all-api-hub/actions/runs/41685357437) | [41685357408](https://github.com/qixing-jk/all-api-hub/actions/runs/41685357408) |
| 合并后 main 首轮 | `6f6f6116691c4619e812de9c003281dbaadf87eb` | [41690970748](https://github.com/qixing-jk/all-api-hub/actions/runs/41690970748) | [41690970780](https://github.com/qixing-jk/all-api-hub/actions/runs/41690970780) |
| 同源码 main 对照，手动触发 | `6f6f6116691c4619e812de9c003281dbaadf87eb` | [41707334131](https://github.com/qixing-jk/all-api-hub/actions/runs/41707334131) | [41702374063](https://github.com/qixing-jk/all-api-hub/actions/runs/41702374063) |
| 本轮优化代码，手动触发 | `a0ae15626d19431363a6f4a16a7bacf398aad283` | [41710341091](https://github.com/qixing-jk/all-api-hub/actions/runs/41710341091) | 不另跑；E2E 工作流及测试源码未改 |

本轮手动触发的 main Test 对照、暖缓存 E2E 和优化代码 Test 均成功，均为 attempt 1。PR 最终提交与合并提交的 Git tree 均为 `194927895f98aa8a5de2949dd64a267aa145aa18`。初始三组单测下载并解码共 18 份 Vitest blob；PR/main 的 1907 个文件归属逐一一致，均使用 `unit-test-durations-41656791026-1`。

时间比较采用 GitHub 步骤起止时间。工作流总时间为创建至最后更新，包含排队、准备和发布。本地重复实验交替执行对照/候选，保留原始输入及代码 SHA-256；不同实验组的基线不能交叉拼接。

## 报告处理：本地对照及 Ubuntu 验证

本地输入为 main 首轮的六份 blob，共 375,643,959 字节，1907 个文件；blob 版本为 Vitest 4.0.3。环境为 Windows、Node 24.14.1、Intel Core Ultra 9 275HX。

先只复用解析结果，保留 `flatted.parse`，三轮交替实验的中位数从 47.306 秒降到 16.265 秒。该组记录在 `artifacts/report-benchmark-0c7MbX/result.json`。

加入完整图兼容解码后的最终实验如下。最终四个 CLI/工具文件的哈希与提交后工作区一致。

| 轮次   | 原完整性检查 + 独立时长生成 / 秒 | 最终合并命令 / 秒 |
| ------ | -------------------------------: | ----------------: |
| 1      |                           29.899 |             3.167 |
| 2      |                           29.627 |             3.053 |
| 3      |                           32.654 |             3.241 |
| 中位数 |                           29.899 |             3.167 |

最终同组节省 26.732 秒，报告阶段减少 89.4%。每轮都验证 `complete=true`，除 `generatedAt` 外 manifest 的 schema、版本、排序和全部 1907 个权重与旧生成器完全相同。计时前还将六份 blob 的完整解码图逐份与官方解析器深比较，全部字段与循环/共享引用均一致。记录在 `artifacts/report-benchmark-JH31GD/result.json`；89.4% 仅指这两个脚本的处理阶段。

| Ubuntu 报告阶段                  | main 对照 / 秒 | 优化代码 / 秒 |
| -------------------------------- | -------------: | ------------: |
| 完整性检查及下一轮时长生成       |   16 + 16 = 32 |             6 |
| Vitest 内部合并、LCOV/JUnit 输出 |             23 |            36 |
| 整个报告 job                     |            141 |           132 |

[原报告 job](https://github.com/qixing-jk/all-api-hub/actions/runs/41707334131/job/126171512683)、[最终报告 job](https://github.com/qixing-jk/all-api-hub/actions/runs/41710341091/job/126182169102)。优化代码成功写出 1907 个权重并保存 `unit-test-durations-41710341091-1`，LCOV 和 JUnit 的 Codecov 上传均成功；[该代码提交的 Codecov 状态](https://app.codecov.io/gh/qixing-jk/all-api-hub/commit/a0ae15626d19431363a6f4a16a7bacf398aad283)为成功。

脚本部分实测节省 26 秒，但报告 job 只短了 9 秒：Vitest 内部合并增加 13 秒，checkout 从 18 秒增加到 37 秒，Node/pnpm 准备从 36 秒降到 25 秒。没有把脚本收益等同于整段发布收益。

## 浏览器准备：避免无必要的 apt

最初问题来自 [PR 分片 5](https://github.com/qixing-jk/all-api-hub/actions/runs/41685357437/job/126090218004)：浏览器缓存 `Linux-playwright-1.64.1` 命中，但 `install --with-deps chromium` 花了 160 秒，其中 21.9 MB 的 apt 字体包下载耗时 152 秒。二进制缓存不会覆盖系统依赖安装，符合 [Playwright CI 文档](https://playwright.dev/docs/ci#caching-browsers)。这是单次拖尾，不能当作每轮固定可节省时间。

| 分片 | main 浏览器准备 / 秒 | 优化后 / 秒 | main 测试执行 / 秒 | 优化后 / 秒 |
| ---- | -------------------: | ----------: | -----------------: | ----------: |
| 1    |                    9 |           5 |                386 |         509 |
| 2    |                   28 |           3 |                538 |         399 |
| 3    |                   10 |           2 |                527 |         534 |
| 4    |                   13 |           2 |                531 |         527 |
| 5    |                   12 |           1 |                382 |         508 |
| 6    |                   11 |           2 |                520 |         538 |
| 合计 |                   83 |          15 |               2884 |        3015 |

六个最终分片均实际打印 `Chromium headless shell starts with existing host libraries.`，无 apt 回退。五个真实浏览器文件共 37 个用例在 Ubuntu 全部通过，已从合并 JUnit 再核对零失败、零错误、零跳过：

- `accountOnboardingFlow.test.ts`：7 个。
- `aiRouterUi.test.ts`：3 个。
- `modelCatalogBrowser.test.ts`：4 个。
- `nativeKeyEditorFlow.test.ts`：12 个。
- `providerDetectionContinuity.test.ts`：11 个。

没有新增浏览器专用 job：这五个文件的历史累计成本约 26–27 秒，额外 runner 的 checkout、安装及报告成本尚无净收益证据。当前启动验证能直接避免已观察到的无必要字体下载，且保留缺库恢复和完整 Chromium 缓存。

## 整轮单测：尚不能宣称加速

main 对照为 12 分 42 秒，最终代码为 12 分 56 秒，增加 14 秒；最慢测试执行步骤均为 538 秒。因此已确认的是准备和脚本阶段提速，整轮效果仍受测试执行、缓存分配和 runner 波动影响。

本次 main 恢复 `unit-test-durations-41690970748-1`；优化代码恢复刚发布的 `unit-test-durations-41707334131-1`。两轮使用不同测量生成的分配，不能将总时间差纯归因于三项代码改动。最终工作流仍执行全部 1907 个 Vitest 文件，29151 个用例通过、1 个既有用例跳过；比 main 多出的 2 个用例是新增工作流路径回归。Node CI 工具测试另有 50 个，全部通过。

## E2E 时长缓存：已实际消费并核对完整性

main 首轮六个分片缓存缺失，发布了 `e2e-spec-durations-41690970780-1`。随后在完全相同 main SHA 上手动触发 E2E，六个分片均命中该 key 并打印 `Duration-balanced shard`。

| 同源码 E2E 指标 | 首轮冷时长缓存 | 后续暖时长缓存 |
| --- | --: | --: |
| smoke 步骤耗时，分片 1–6 / 秒 | 438, 213, 426, 483, 282, 235 | 272, 393, 365, 417, 352, 361 |
| 最慢 smoke 步骤 / 秒 | 483 | 417 |
| 工作流创建至完成 | 13 分 07 秒 | 10 分 05 秒 |
| 重试后通过用例 | 2 | 0 |

最终核对六份暖缓存报告：146 个文件均按生成计划执行；622 个 Chromium 用例的 ID、project 和 repeat 键与冷缓存完全一致，跨分片没有重复或遗漏。依赖项目重复出现的 build 用例不计入该 Chromium 清单。Firefox、bookmarks、DNR 和独立 performance 步骤也全部成功。

最慢 smoke 观察下降 13.7%，整轮少了 3 分 02 秒；构建缓存、runner 差异和重试减少均可能参与，不能把全部差值归因于分配算法。固定旧数据回放的最重累计用例工作量下降 29.4%，也不能代替实际步骤时间。

[冷缓存运行](https://github.com/qixing-jk/all-api-hub/actions/runs/41690970780)、[暖缓存运行](https://github.com/qixing-jk/all-api-hub/actions/runs/41702374063)。新增回放断言及统计保存在 [replay.mjs](replay.mjs)，结果为 `artifacts/replay-with-warm-e2e.json`。

## 其他候选的实验结果

### 测试进程池：不采用

从真实 main 文件成本中选择最重的两个 DOM 文件和 `tests/services/` 中最重的两个 Node 文件，共 191 个用例。实际 Vitest CLI 比较 `threads` 与 `forks`，保持两个 worker 和测试隔离，关闭 coverage；两轮交替顺序，报告确认每个文件的 pool 与指定值一致、文件和用例结果完全相同。

| 轮次 | threads / 秒 | forks / 秒 | threads collect / 秒 | forks collect / 秒 |
| ---- | -----------: | ---------: | -------------------: | -----------------: |
| 1    |       71.702 |     72.631 |               19.166 |             45.937 |
| 2    |       58.847 |     74.490 |               16.137 |             36.427 |

Windows 局部筛选没有观察到切换到 forks 的收益，保留现有 threads。该实验不是 Ubuntu 全套带覆盖率的结论。选中文件、命令、完整用例报告和日志保留在 `artifacts/benchmark-pools.mjs` 与 `artifacts/pools-pFwXpd/`；该驱动标记为一次性本地实验。[Vitest 官方性能文档](https://github.com/vitest-dev/vitest/blob/v4.0.7/docs/guide/improving-performance.md)也说明进程与线程存在兼容性和速度取舍。

### 分配权重及其他准备成本：证据不足，不修改

`measureFileCost` 已包含 tests、setup、prepare、collect、environmentLoad。初始 main 的 collect 占累计文件成本约 42%；最终 main 对照及优化代码的 collect 累计分别为 3229 秒和 3433 秒，仍是大头。缺少初始化权重不是已证实的问题。

初始相同源码、相同权重、相同文件分配的 PR/main 中，分片 5 的 Vitest 时长从 524.59 秒变为 305.05 秒，collect 从 608.63 秒变为 360.46 秒。不同 Azure 区域和同镜像内均出现明显波动，现有数据无法分别确定 CPU、宿主负载和镜像影响。

旧数据静态回放中，原始权重相对均值的最大负载偏差约 5%/3%，来源分片归一化权重约 12%/14%。这是进一步受控实验的候选，但更换文件分配会改变导入缓存和并发竞争；本轮未根据该回放改权重，也未降低隔离或减少 coverage。

暖缓存 E2E 的 performance 步骤仅比最慢功能分片晚约 20 秒完成。新增独立 runner 会引入准备成本，没有足够净收益支持继续拆 job。Vitest 内部报告合并仍耗时 23–36 秒；本轮没有替换其覆盖率合并语义。

更大的下一步收益候选是最重 UI 文件的模块收集和测试体成本，需要逐个定位后用行为回归和相同条件的 Ubuntu 对照验证。

## 行为验收与限制

| 行为 | 自动断言及结果 | 证据 |
| --- | --- | --- |
| 一次解析生成时长；独立 CLI 兼容；权重公式不变 | 1907 个权重逐轮一致，Node CLI 测试通过 | [报告守卫测试](../../tests/scripts/check-unit-test-reports.test.mjs)、[最终对照驱动](benchmark-reports.mjs) |
| 报告缺失、空覆盖率、版本混合、worker 错误、损坏引用 | 拒绝输入，`complete=false`，不发布 manifest | [报告守卫测试](../../tests/scripts/check-unit-test-reports.test.mjs) |
| 断言失败但数据完整 | 保留失败状态，仍生成可用 LCOV/JUnit | 报告守卫测试运行真实失败 Vitest 分片并合并 |
| manifest 写入失败 | 步骤失败但报告 `complete=true`，保留覆盖率发布资格 | 报告守卫测试的不可写目标场景 |
| flatted 全图兼容、循环/共享引用、数字字符串、特殊键 | 官方解码对照、64 组图及非规范回退均通过 | [blob 解码测试](../../tests/scripts/vitest-blob.test.mjs)、六份真实图对照 |
| 浏览器可启动、缺库、其他错误、安装及二次启动失败 | 8 个公共工作流命令场景通过；Ubuntu 六个真实探针成功 | [浏览器安装测试](../../tests/scripts/unit-test-browser-install.test.mjs) |
| 共用浏览器缓存保留有头二进制 | `--only-shell` 回归先失败，保留完整安装后通过 | 浏览器安装测试；E2E 工作流未改 |
| push/dispatch 发布时长，PR 跳过；路径改动触发 Test | 执行实际 YAML 命令的断言通过，Vitest 调度测试 58 个通过 | 报告守卫测试、[调度测试](../../tests/scripts/ciScheduling.test.ts) |
| 实际浏览器单测保持完整 | 五个文件的 37 个用例在最终 Ubuntu CI 全部通过 | 最终分片日志和下载的合并 JUnit |
| E2E 暖缓存实际消费且清单完整 | 146 个文件、622 个 Chromium 用例及六个分片归属逐项一致 | [暖缓存回放](replay.mjs)、暖缓存运行 |

已按 TDD 验证新增 CLI/工作流行为的失败回归，再实现为通过；解码重构先锁定官方解析行为。最后一次生产代码改动后，完整 Ubuntu Test 工作流及 Codecov 均成功。

本地受影响 Vitest 检查共 9 个文件、124 个不同用例。首轮两 worker 并行时，`nativeKeyEditorFlow` 的 Chromium 启动及 `aiRouterUi` 的 shell 场景遇到既有 15 秒超时；保留日志，这两个文件用一个 worker 重跑的 15 个用例通过。没有扩大超时、更新预期或修改 UI 来掩盖失败。最终 Ubuntu 全套的五个浏览器文件全部通过，关闭本次安装策略的实际环境验证。

`pnpm compile`、`pnpm knip`、相关格式和差异检查均通过；提交及推送钩子正常执行。knip 仍提示既有冗余 `scripts/e2e-shard-plan.mjs` entry，本轮不涉及。CI 调整没有产品 UI 变化，无截图验收项。

## 复现与保留

Git 保留本报告、[回放脚本](replay.mjs)、[报告对照脚本](benchmark-reports.mjs)及生产回归测试。生成输出由本目录 `.gitignore` 仅忽略 `artifacts/`，未隐藏调查源码。

原始单测/E2E 报告、精简快照、最终 CI 日志/JUnit 保留在 `C:\Users\THINK\AppData\Local\Temp\ci-1817-analysis`；原 PR 分片 5 日志为 `C:\Users\THINK\AppData\Local\Temp\ci-1817-unit5.log`。本地 `artifacts/` 保留各阶段 benchmark、pool 筛选、完整性回放和旧 CLI 副本，供对照审阅；未清理原始失败或前后样本。

复现需要仓库依赖已安装、Node 24、Git 和 PowerShell，以及保留的六份报告。原始 blob 在 `flat-main/blob-1-6.json` 至 `blob-6-6.json`；基线三个脚本副本位于 `artifacts/baseline/scripts/`，来自 `6f6f6116691c4619e812de9c003281dbaadf87eb`。在新 checkout 可按下列方式重建副本，工具从当前仓库解析相同已锁定依赖。

```powershell
node -e 'const fs=require("fs"),path=require("path"),cp=require("child_process");const base=".scratch/ci-runner-performance/artifacts/baseline";for(const file of ["scripts/check-unit-test-reports.mjs","scripts/write-unit-test-durations.mjs","scripts/utils/unitTestDurations.mjs"]){const target=path.join(base,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,cp.execFileSync("git",["show","6f6f6116691c4619e812de9c003281dbaadf87eb:"+file]));}'
$ciDataRoot = Join-Path $env:TEMP "ci-1817-analysis"
node .scratch/ci-runner-performance/benchmark-reports.mjs --reports-dir "$ciDataRoot/flat-main" --rounds 3 --label reproduced
node .scratch/ci-runner-performance/replay.mjs --input-root "$ciDataRoot" --output .scratch/ci-runner-performance/artifacts/replay-with-warm-e2e.json
```

对照驱动先验证完整图一致，再执行旧两命令/新一命令并检查输出；计时包含子进程启动、文件读写与完整处理。回放优先读取 `unit-all-lean-records.json`；没有快照时读取三个原始单测目录。若 `e2e-warm-reports/` 存在，会强制核对六份暖缓存报告和完整用例清单。缺失分片或精简快照中的 main 文件已验证会非零退出，拒绝不完整比较。

需要重新下载时，各 run 的 artifact 保留期有限；到期后应使用已保留本地数据，或在相同源码重新触发并注明新的测量条件。

```powershell
gh run download 41656791026 --repo qixing-jk/all-api-hub --pattern "vitest-blob-report-*" --dir "$ciDataRoot/baseline"
gh run download 41685357437 --repo qixing-jk/all-api-hub --pattern "vitest-blob-report-*" --dir "$ciDataRoot/final-pr"
gh run download 41690970748 --repo qixing-jk/all-api-hub --pattern "vitest-blob-report-*" --dir "$ciDataRoot/merged-main"
gh run download 41690970780 --repo qixing-jk/all-api-hub --pattern "e2e-spec-durations-*" --dir "$ciDataRoot/e2e-main"
gh run download 41702374063 --repo qixing-jk/all-api-hub --pattern "e2e-spec-durations-*" --dir "$ciDataRoot/e2e-warm-reports"
```

本轮没有证明整轮单测的稳定提速，也没有在 Ubuntu 全套中试验 forks、原始未归一化权重或新的浏览器专用 job；相应数据边界保留在上文，避免将局部结果当作整体结论。
