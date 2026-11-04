# CI 后续优化调查与实验

日期：2026-11-04（UTC+08）。状态：两轮最终完整 Test 均成功，较同源码基线缩短 12.4% / 15.3%；快速预检和累计 runner 成本已实测，排队提速尚未得到证实。详见[固定分片输入的最终对照](#固定分片输入的最终对照)。

最终已验证代码提交为 `12a01faf4935c71c46e2a84e5440d5d3d5d92800`，已发布到 `perf/ci-follow-up-20261104`，固定候选引用为 `perf/ci-iteration-candidate-20261104`。本次报告提交只更新调查材料，不改变已验证的 CI 输入。下文保留首轮 `a0ae15626d19431363a6f4a16a7bacf398aad283` 的实验、后续审计和第二轮结果，各轮采用各自基线。

## 首轮已实现的改进

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

## 首轮整轮单测：尚不能宣称加速

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

## 单个 PR 反复迭代的后续审计

用户补充目标：单个 PR 内部的迭代速度同样重要，多 PR 同时运行并不频繁。本节记录实施前的只读调查和实验候选；后续实施与验证见下一节。核对的当时 main 为 `b511ceee93e678cdcbadf9849d687438ab373815`；除本分支已实现的 Test 优化外，相关工作流与 main 一致。

抓取最近 300 条运行记录，去重后选择最新 50 个已结束的 PR 工作流，逐一取得 jobs/steps 响应；其中普通 PR 42 个、release PR 8 个。抽样窗口为 2026-11-03 17:11:38 至 21:05:06 UTC。分位数使用最近秩，不是长期随机样本。

| 普通 PR 工作流 | 样本运行数 | 非取消运行总时间 p50 / 秒 | 已启动 job 等待 p50 / 秒 | 已启动 job 等待 p90 / 秒 |
| --- | --: | --: | --: | --: |
| Test | 8 | 792 | 3 | 121 |
| E2E | 8 | 637 | 3 | 101 |
| Quality | 9 | 187 | 3 | 14 |
| Commitlint | 8 | 163 | 3 | 54 |
| Permission warnings | 9 | 119 | 43 | 195 |

job 等待指 REST `created_at` 至 `started_at`，包含 runner 调度和 concurrency group 等待；不包括最终未启动的取消 job。该窗口还有本任务的手动实验运行，会影响忙时的共享队列，不能据此推断账号并发上限。普通 PR 的主要耗时仍是完整执行及重复验证，忙时启动等待需要作为尾部单独衡量。

两个完整同-head 例子：[PR #1820 的 Test](https://github.com/qixing-jk/all-api-hub/actions/runs/41715899068)及同-head 其他工作流从 20:48:08 至 21:02:12，约 14 分 04 秒；PR #1819 最终 head 的同组约 14 分。普通源码 head 的五个抽样工作流共运行 20 个 runner job，未计标题检查。

当前已有措施已实际核对：Test/E2E/Quality 按 PR 取消旧运行；预览构建是手动触发；E2E 构建有内容指纹缓存。通知工作流在 GitHub 为 `disabled_manually`，当前没有占槽轮询。重复做这些措施不是本轮的主要机会。

按收益对象区分下一轮候选：

1. **缩短早期报错反馈。** 新增或提前执行受影响测试的快速检查，再由全量测试完成最终验证。Vitest `related` 只跟踪可静态解析的导入，对运行时文件读取、非字面量动态导入等需要显式规则或保守回退；相关测试负责早报错，不能未经验证就用于缩减最终验证范围。[Vitest CLI 文档](https://github.com/vitest-dev/vitest/blob/v4.0.7/docs/guide/cli.md)
2. **减轻每轮全量单测成本。** collect 已占历史累计文件成本约 42%，优先剖析最重 UI 文件的导入与共享 setup/MSW，然后逐项实验。当前 E2E 已使用 4 workers；Vitest 未固定 maxWorkers，安装的 4.0.3 默认运行模式为可用 CPU 数减一。标准公开仓库 Ubuntu runner 为 4 CPU/16 GB，但应先记录实际可用 CPU、worker 数和峰值内存，再比较显式 worker 设置，不能把此前本地 2-worker 实验误认为当前 CI 配置。[GitHub runner 规格](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
3. **避免未改变测试输入的重复验证。** PR `paths` 使用整个 PR 的 three-dot diff，不只看最后一次 push；已有源码改动的 PR 后续仅改文档、提交消息或整理提交历史，仍可能重跑全部源码检查。候选是按各层完整测试输入指纹复用同 PR 已成功的报告，在当前 head 重新验证完整性、发布当前 head 的检查和覆盖率，并记录来源。任一测试输入或命令、运行环境变化必须失效；不能直接把旧 SHA 的绿灯当作新 head 证据。该方案目前未实现，也未测量实际命中率。[GitHub diff 与路径过滤](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#git-diff-comparisons)
4. **让提交消息检查只读取所需材料。** Commitlint checkout 中位数为 128 秒、p90 为 264 秒；依赖安装中位数只有 7 秒，lint 本身不是大头。应比较提交元数据及配置的获取方式，减少 `fetch-depth: 0` 加完整工作树的下载，同时验证完整 base/head 提交范围与配置依赖不遗漏。这能缩短提交消息错误的反馈，未必缩短由全量 Test 主导的全绿时间。
5. **复用构建并减少调度轮次。** 权限检查仍有单独的构建调用，虽然通常命中缓存，仍会多一次等待和启动。共享同次 E2E 构建有减少 job 的空间；同时要保留 E2E 跳过场景所要求的权限验证。跨工作流缓存目前已经复用构建内容，不应把共享缓存误认为已经消除了独立 producer job。

本轮没有普通 PR 的失败工作流样本，不能给出快速检查缩短首个报错时间的实测比例。快速反馈、结果复用和测试本体优化均需要下一轮独立实验；优先评估快速反馈与全量单测成本，队列总吞吐作为次要指标。收集已知测试、覆盖率和评审问题后集中一次推送，也能减少整轮 12–14 分钟的重复等待。

### 权限校验的实际执行缺口

九个抽样普通 PR 的独立 `Native permission warnings` job 均被跳过。例如 [PR #1820 的权限工作流](https://github.com/qixing-jk/all-api-hub/actions/runs/41715898991)：`build / build` 成功，`release-changes` 跳过，最终 `Native permission warnings` 跳过。工作流的该下游 job 没有显式覆盖祖先跳过状态的条件，需要在调度调整时修正并做完整场景回归。

`e2e/extensionPermissionWarnings.spec.ts` 仍在默认 E2E 清单内，普通全量 E2E 提供了这部分验证；独立工作流的绿色结论不能证明其单独执行过浏览器校验，也不能把缺失检查当成调度优化的收益。审计时尚未修复该缺口，下节记录修复与验证。

原始 300 条记录、50 份 jobs 响应、一次性分析脚本和统计保留于 `artifacts/queue-audit-20261104/`。其中 `analyze.mjs` 要求所有抽样响应齐全，排除未分配 runner 和负时长的跳过 job；`summary.json` 保存逐工作流阶段、同 head 分组及最长启动等待。复现：`node .scratch/ci-runner-performance/artifacts/queue-audit-20261104/analyze.mjs`。这些本地输入保留用于方案审阅，本节结论保留在 Git。

## 单个 PR 反馈与完整运行的第二轮实验

先正常合并已核对的 main，保留恢复引用。源码一致的 Ubuntu 基线为 `fd7cc1bd115065c38083ebcb3a74b1213462bd7e`，它包含上述 main 和第一轮 CI 优化。此次调整没有修改 `src/`、`public/` 或 `plugins/` 的产品行为。

### 实施范围与本地验收

| 改动 | 可观察行为 | 验证 |
| --- | --- | --- |
| Related unit tests | 与六个完整分片并行，按基准 SHA 和实际测试项目选取有限相关测试，尽早提供失败反馈 | 新 CLI 的 14 项真实 Git/Vitest 回归；调度条件回归 |
| 浅克隆选取 | 仅在需要时取得准确 base commit；计划绑定当前 HEAD，拒绝跨 HEAD 执行 | 浅克隆、改名、删除源码和目录入口、别名、动态导入、循环、glob、超限、全局配置及失败退出回归 |
| Chromium 准备共享 | 快速预检和完整分片消费同一安装、缓存及实际启动探测 | 8 个安装场景及既有浏览器缓存断言 |
| 编译模块缓存 | 按 Node/OS/架构、锁文件/配置、分片和源码输入恢复变换结果，完整测试及覆盖率重新执行 | 三轮同输入对照；同内容重写、源码修改、测试修改后的实际失效验证 |
| 分片报告输出 | 分片输出 JSON 和原始 blob，最终合并阶段生成 HTML/LCOV 等完整报告 | Ubuntu 全量成功合并并上传；前后用例和源码清单核对见下节 |
| 四 worker | 为完整分片设置明确的四 worker 预算，记录 CPU、内存和峰值 RSS | Ubuntu 实际为 4 CPU、约 16 GB；逐分片日志保存资源数据与失败结果 |
| 独立权限检查 | build 成功且 workflow 未取消时实际执行 Native permission warnings | 五种调度结果回归；真实 Chromium 的原有比较用例通过 |

完整六分片不依赖预检结果，覆盖率阈值继续由最终合并检查。预检计划会列出所选文件；全局测试输入变化或相关文件超过 60 个时，仅预检直接修改的测试和必要 CI 断言。静态依赖选择不会替代全量验证。

模块缓存使用 Vitest 与覆盖率插件的同一锁定版本 `4.0.17`。升级后先观察到现有 mock 类型的编译失败，再将受影响的函数 mock 和私有方法 spy 改为明确类型；测试断言与产品源码保持原有语义。最后的受影响 Vitest 检查为 14 个文件、550 个通过用例，CLI 回归 64 项全部通过；私有 spy 类型修正后另跑其原有碰撞用例通过。编译通过。Knip 通过，并沿用既有冗余 `e2e-shard-plan.mjs` 提示。

### 本地对照结果

环境为 Windows、Node `24.14.1`、Vitest `4.0.17`、两个 threads worker。比较固定四个文件的 191 个相同用例，保留覆盖率、隔离与断言，交错运行三轮；所有有效运行的 1,451 个被覆盖源文件清单一致。每个变体使用独立 Vite 缓存，记录输入内容哈希，输入变化立即终止对照。

| 候选 | 同轮对照结果 | 决策 |
| --- | --- | --- |
| 只生成分片 JSON 报告 | 三轮均缩短进程耗时，中位减少 4.18 秒（约 4.9%） | 进入 Ubuntu 全套验证，完整 HTML/LCOV 在合并阶段生成 |
| 编译模块缓存冷启动 | 93.59 秒，对应基线 91.24 秒 | 冷启动没有提速，需计入写缓存成本 |
| 编译模块缓存两次热运行 | 83.10 / 81.93 秒，对应基线 88.23 / 85.96 秒；收集时间 9.99 / 10.04 秒，对应 16.77 / 16.67 秒 | 热运行总耗时约快 5.3%，收集约快 40%；进入 Ubuntu 实测缓存传输后的净收益 |
| lucide-react 预打包 | 旧版出现 V8 session 错误；升级后四文件虽全部通过，被覆盖源文件清单变化 | 排除，未作为有效提速计入结果 |

以上是局部对照，不代表整轮 Test 或全部 PR 检查的提速。尚未把四 worker 的效果纳入本地对照百分比。原始记录见 `artifacts/imports-20261104-cache-report/result.json`；失败的预打包比较保留于 `artifacts/imports-20261104-final/`，未删除或算入收益。

实际缓存失效探测保留于 `artifacts/cache-freshness-20261104/`：相同内容重写后的热运行读取原缓存；源码从返回 1 改为返回 2 时，生成不同缓存条目并使原断言失败；更新测试断言恢复通过；再更新为错误断言时仍正确失败。五次都保留了实际函数覆盖率和 blob。未复用测试结论或覆盖率报告。

复现局部对照：

```powershell
node .scratch/ci-runner-performance/benchmark-test-imports.mjs --rounds 3 --variants baseline,json-report,module-cache --label reproduced-imports
pnpm run test:ci:scripts
```

缓存机制与版本依据为 [Vitest 4.0.17 缓存说明](https://github.com/vitest-dev/vitest/blob/v4.0.17/docs/config/experimental.md)和[该版本修复记录](https://github.com/vitest-dev/vitest/releases/tag/v4.0.17)。Ubuntu 验证单独记录如下，本地局部结果不代替完整运行证据。

### Ubuntu 运行与早期失败反馈

比较引用保留为 `perf/ci-iteration-baseline-20261104` 与 `perf/ci-iteration-candidate-20261104`。基线代码为 `fd7cc1bd115065c38083ebcb3a74b1213462bd7e`；中间候选为 `ab606963cc9cb04ff3ec19d690a168a500d48577`，最终修正代码为 `12a01faf4935c71c46e2a84e5440d5d3d5d92800`。候选完整分片实际 runner 为 4 CPU、约 16 GB 内存，保持覆盖率、测试隔离与全部六个分片。

首个候选冷启动 [41741739666](https://github.com/qixing-jk/all-api-hub/actions/runs/41741739666) 全量运行暴露了 `packageMeta` 测试写死 Vitest `4.0.3` 的断言。生产函数正确返回已升级的 `4.0.17`；改为独立 `^1.2.3` 依赖夹具，继续验证 dev dependency 查询和版本前缀处理。修正后 4 个文件、94 条受影响测试通过，提交和推送钩子的编译、Knip 均通过。该失败运行保留，不作为成功提速样本。

失败运行的六份报告完整性检查通过；合并阶段保留失败结论，同时实际生成并上传覆盖率和 JUnit 至 Codecov。没有通过丢弃失败分片、缩小测试清单或放宽覆盖率阈值取得绿色结果。

冷运行还记录到 runner 预装 Node patch 不同：五个分片为 `24.22.1`，第二分片为 `24.22.2`。基线日志同样有五个 `24.22.1` 和一个 `24.22.2`。模块缓存的精确 Node 版本键正确隔离了两者。为控制后续实验，Test 的手动触发新增可选 `node_version`，经共享 setup action 传递；普通 PR 继续使用 `.nvmrc`。后续两轮最终候选固定为 `24.22.1`；对基线的比较仍包含 Vitest 升级、worker 设置与托管机器差异，不能单独归因为缓存。

受控失败实验 [41745188414](https://github.com/qixing-jk/all-api-hub/actions/runs/41745188414) 使用单独的实验引用 `perf/ci-feedback-probe-20261104`，仅新增一条在该引用启用的错误断言。正常本地钩子通过，并先验证显式开启探针时确实失败。真实 CI 的相关测试计划仅选择该文件，产生一条预期断言失败：workflow 创建于 `00:13:24 UTC`，快速 job 在 `00:14:03 UTC` 结束，即 **39 秒**，其中启动等待 2 秒。失败日志与计划保留，随后主动取消该实验剩余全量工作。探针未进入候选代码。

这个实验验证快速通道确实能独立报告错误；没有同一错误在旧工作流的完整运行对照，不能据此声称所有错误都快到 39 秒或给出普适提速比例。首个候选的 11 个文件、485 条预检单测加 64 项 CI 工具回归在创建后 118 秒通过；修正候选的 3 个文件、91 条预检单测加 64 项工具回归也通过。

独立权限工作流 [41741746061](https://github.com/qixing-jk/all-api-hub/actions/runs/41741746061) 完成并成功：`release-changes` 跳过、build 成功后，`Native permission warnings` 实际启动 Chromium，原有一条 manifest 权限警告比较通过。总时间 345 秒包含 build 等待 80 秒和最终浏览器 job 等待 113 秒；这是补齐实际执行，不能与过去跳过的 job 比较提速。

中间候选的首次完整成功 [41745515632](https://github.com/qixing-jk/all-api-hub/actions/runs/41745515632) 为 591 秒（9 分 51 秒），基线 [41741732909](https://github.com/qixing-jk/all-api-hub/actions/runs/41741732909) 为 701 秒（11 分 41 秒）。累计分片测试执行为 2,165 对 2,988 秒；包含预检和合并的累计 runner 活跃时间为 2,580 对 3,356 秒。该中间候选的模块缓存恢复有五个命中、一个因精确 Node patch 不同而未命中，六个恢复步骤合计 19 秒、保存合计 9 秒。

已比较两次成功运行的 JUnit 与完整 `coverage-final.json`：均为 1,909 个测试文件，原有 29,174 条用例和结果全部保留，增加 10 项 CI 调度回归；候选为 29,183 通过、1 跳过。源码报告同为 3,055 个文件、2,882 个有语句覆盖的文件，语句、分支、函数和行的总数也一致。唯一语句命中差异是 `dailyPlanning.ts` 的第 180、181 行次日窗口调整；没有声称每条语句命中次数完全相同。另以原有五条调度用例关闭缓存、首次开启和复用缓存，三次断言和这些行的覆盖结果一致。

中间候选的同 head 复跑 [41746832313](https://github.com/qixing-jk/all-api-hub/actions/runs/41746832313) 虽恢复六个模块缓存，仍出现两个交互用例失败，保留为失败样本：NanoGPT 复制按钮的 2 秒反馈未被观察到，DoneHub 的请求校验、兼容设置与路由交互长用例达到原有 15 秒预算。最终修正使用受控计时观察复制反馈，恢复真实计时后继续读取 clipboard stub 的 FileReader 结果；拆开编辑器场景，使用粘贴填写完整配置值。原有业务断言保留，没有扩大超时。四文件、96 项相关检查通过，包含原有导出场景；编译与 Knip 通过。

### 固定分片输入的最终对照

手动触发会发布新的耗时权重，中间候选两轮分别恢复 `unit-test-durations-41718342203-1` 与 `unit-test-durations-41745515632-1`，不能把它们视为分片完全相同的冷热对照。普通 PR 不发布权重，反复 push 使用 main 的权重。用六份真实 blob 回放确认 1,909 个文件都匹配权重，分片确实经过成本分配；接近相同的文件数不能证明静默回退。

最终手动实验新增可选 `durations_cache_key`，指定精确缓存后关闭前缀回退并跳过权重发布，使用与基线相同的 main profile。三项实际工作流表达式回归先观察到指定键未生效的失败，再验证指定、空值和未提供参数三种情况。该控制只用于测量，预检与全部完整测试仍照常执行。

最终代码 `12a01faf4935c71c46e2a84e5440d5d3d5d92800` 连续完成两轮成功运行：[41750687908](https://github.com/qixing-jk/all-api-hub/actions/runs/41750687908) 和同输入复跑 [41752095539](https://github.com/qixing-jk/all-api-hub/actions/runs/41752095539)。两轮都固定 Node `24.22.1` 与 `unit-test-durations-41718342203-1`，四个文件、88 条预检单测加 64 项 CI 工具回归分别在创建后 70 秒和 84 秒通过。全部六个完整分片、报告完整性检查、覆盖率合并及 Codecov 的覆盖率/JUnit 上传步骤均成功。

| 指标 | 源码一致的基线 | 最终候选第一轮 | 最终候选同输入复跑 |
| --- | --- | --- | --- |
| 完整 Test 工作流 | 701 秒（11:41） | 614 秒（10:14） | 594 秒（9:54） |
| 最慢分片测试步骤 | 550 秒 | 451 秒 | 449 秒 |
| 六分片测试步骤累计 | 2,988 秒 | 1,822 秒 | 2,089 秒 |
| 所有实际 runner 活跃时间累计，含预检和合并 | 3,356 秒 | 2,254 秒 | 2,570 秒 |
| 已启动 job 等待 p50 | 3 秒 | 3 秒 | 3 秒 |

这两轮相对基线的完整 Test 耗时减少 **12.4% / 15.3%**，累计分片测试时间减少 **39.0% / 30.1%**，计入新增预检后的累计 runner 活跃时间减少 **32.8% / 23.4%**。这些是整组改动的实测结果，包含 Vitest 升级、四 worker、报告输出与模块缓存；托管 runner 的 CPU 型号仍有差异，样本也只有一轮基线和两轮最终候选，不能把全部差值归因于某个单项或承诺固定比例。

第一轮六个模块缓存恢复步骤累计 16 秒、保存 10 秒；复跑六个都恢复当前源码的精确缓存键，累计恢复 21 秒，保存步骤全部跳过。每个分片仍重新运行测试和覆盖率，缓存传输成本已经计入上表。两轮均实际分配 4 CPU、约 16 GB，单个测试进程记录的最大 RSS 分别约 2.78 GiB 和 2.82 GiB，没有为提速关闭测试隔离。

分别比较两轮最终 JUnit 和完整覆盖率：均为 1,909 个测试文件、29,187 通过和 1 跳过。基线原有 29,174 条用例的身份与结果全部保留，新增 13 项 CI 调度回归与一个拆出的 DoneHub 路由场景。覆盖率均保留 3,055 个源码文件及其中 2,882 个有语句覆盖的文件，语句、函数、分支映射和各项总数一致；只有上述次日窗口的两条语句/行覆盖差异。最终语句覆盖率 97.13%、分支 92.89%、函数 98.19%、行 98.30%，原有阈值继续生效。

本轮证明了提早反馈和降低完整单测成本。启动等待 p50 没有变化，因此没有实测证据声称排队已经变快；较少的 runner 占用有助于释放共享容量，但仍需忙时样本验证排队效果。这也只是 Test 工作流的提速，本轮没有重新测量整个 PR 的全部检查或完整 E2E，不能宣称 PR 全绿耗时同比减少。

固定输入复现命令如下；候选引用保留在已测试的代码提交，报告更新单独推送至 `perf/ci-follow-up-20261104`。若该历史权重缓存已过期，须重新建立基线与候选共同使用的 profile，不能把缓存未命中的运行当成同输入对照。

```powershell
gh workflow run test.yml --repo qixing-jk/all-api-hub --ref perf/ci-iteration-candidate-20261104 -f related_base=ab606963cc9cb04ff3ec19d690a168a500d48577 -f node_version=24.22.1 -f durations_cache_key=unit-test-durations-41718342203-1
```

后续更大的测量空间仍是未变输入的验证复用和完整 E2E/构建链路。验证复用需要证明源码、依赖、配置与报告来源一致，并维持当前 head 的检查和覆盖率归属；共享构建需要覆盖 E2E 跳过时的独立权限检查。两者都还没有本轮实测收益，未作为已完成优化计入。当前真实权重分配已经生效，也不依据接近相同的分片文件数再次改写算法。

原始 REST 响应、JUnit、覆盖率、失败样本和日志保留于 `artifacts/ci-iteration-20261104/`。`analyze-current.mjs` 按 job/step 分离启动等待、完整分片执行与合并耗时；`compare-reports.py` 核对原有用例结果及覆盖源码集合；`replay-shards.mjs` 使用真实报告回放权重。失败及主动取消的探针不计入成功对照。

## 复现与保留

Git 保留本报告、[回放脚本](replay.mjs)、[报告对照脚本](benchmark-reports.mjs)、[导入与模块缓存对照脚本](benchmark-test-imports.mjs)及生产回归测试。生成输出由本目录 `.gitignore` 仅忽略 `artifacts/`，未隐藏调查源码。

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

第一轮报告处理与浏览器安装优化没有证明整轮单测的稳定提速，也没有在 Ubuntu 全套中试验 forks、原始未归一化权重或新的浏览器专用 job；对应数据边界保留在上文。第二轮的反馈与完整运行实验单独记录，避免将局部结果当作整体结论。


## 2026-11-04 后续决定：移除相关测试预检

用户优先选择降低完整测试耗时的优化。移除 `Related unit tests` job、`related_base` 手动输入，以及仅服务该通道的选择器和测试。完整六分片直接运行，仍保留模块编译缓存、四 worker、精简分片报告和最终覆盖率合并；Chromium 共享准备及独立权限校验继续使用原有实现。

预检与完整分片并行，失败后没有自动取消完整测试，因此增加一个 runner 和重复执行。39 秒受控失败只证明通道能够提前报错；缺少普通 PR 的失败命中率和收益样本，不足以支持默认支付这项成本。本节以前的实验数据保留为历史证据，包含预检的 12–15% 提速不能作为移除后版本的重新测量结果。

移除后的工作流调度测试先确认多余预检 job 导致失败，再验证仅调度发布检测、完整分片和报告合并。保留普通 push/PR/手动运行、取消、发布豁免及失败分片报告合并的现有场景。本次不再启动远端实验，新的完整工作流耗时尚未测量。已有实验与失败原始数据继续保留在本目录 `artifacts/`，供后续对照使用。


## 2026-11-04 Vitest 5.1.0 大版本升级筛选

npm registry 的 `latest` 同时为 Vitest 和 coverage-v8 的 `5.1.0`，`V4` 为 `4.1.12`。来源：[5.0 官方说明](https://vitest.dev/blog/vitest-5.html)、[5.0 迁移指南](https://vitest.dev/guide/migration.html)、[5.1.0 发布记录](https://github.com/vitest-dev/vitest/releases/tag/v5.1.0)。当前 Node 24.14.1、Vite 7.3.2 满足版本要求。

相关性能机制包括 inline projects 共享 Vite server、暖模块一次通信送达 worker、正式且默认启用的文件系统模块缓存、V8 报告合并和通信优化；5.1 进一步允许覆盖率 provider 在模块缓存存放数据。`--last-failed` / `--since-last-run` 是缩减执行范围，不作为完整 CI 的提速。vm pools 的新预热/编译缓存仍是后续独立候选，没有在本次启用或声称收益。

在 HEAD `02cd472d290275f736368e033f3d51352c3545ca` 上实际安装 Vitest/coverage-v8 5.1.0，保留 threads、两个 worker、测试隔离、四个文件/191 条用例、覆盖率及完整报告。升级版显式设置 `clearMocks: false` 保持 4.x 语义，迁移 fsModuleCache 配置，并显式指定 blob 路径。对照关闭模块缓存，两版使用各自独立 Vite 缓存；这是本地冷模块缓存筛选，不是热缓存或 Ubuntu 全量对照。

| 本地指标 | 4.0.17 两轮 | 5.1.0 两轮 |
| --- | --- | --- |
| 整批进程耗时 | 94.92 / 94.23 秒 | 100.63 / 95.80 秒 |
| collect 累计 | 17.82 / 24.81 秒 | 22.33 / 25.41 秒 |
| 用例通过 | 191 / 191 | 191 / 191 |
| 覆盖率源码清单 | 3,056 / 3,056 | 3,056 / 3,056 |
| 有语句覆盖源码数 | 1,452 / 1,452 | 1,450 / 1,450 |

这两轮未观察到提速。5.x 的 `combobox.tsx` 与 `krill/keyEditor.ts` 不再有语句命中，需要进一步核对覆盖率/模块执行语义，不能把测试通过等同完整验证。测试名称的参数格式也在大版本中变化，跨版本不能只依赖 title 字符串比较身份。

兼容性筛选：76 项调度/浏览器缓存 Vitest 检查通过。CI 工具 50 项中49项通过，真实失败分片报告合并回归失败：默认报告目录从 `.vitest-reports` 改为 `.vitest/blob`；显式固定路径后仍失败，因为 blob 从 `[version, files, errors, moduleGraph, coverage, executionTime]` 改为 `[version, files, errors, coverage, executionTime, environmentModules]`。需要适配统一读取边界并保留缺报告、混版本、worker 错误等拒绝规则，不能放宽 guard。编译筛选还输出旧实验缓存选项类型错误和 `useAccountKeyResourceInventoryWorkflow.ts:48` 的可选参数解构错误；前者属于明确迁移，后者未验证因果，不标为 Vitest 导致。

决策：本次不保留生产升级。已恢复原 package、锁文件、Vitest 配置、workflow 和临时报告测试改动，并重新按 frozen lock 安装4.0.17。仅保留支持两种缓存配置 API 的对照驱动和本节调查结论。5.x 仍有可测试的热缓存、覆盖率缓存及 vm pool 方向，但尚未证明本仓库收益；没有运行新版 Ubuntu 全量或关闭隔离。

两版完整日志/blob/coverage 与 `result.json` 分别保留在 `artifacts/imports-vitest4-before-major/` 和 `artifacts/imports-vitest5-major/`。临时生产迁移补丁保存在后者 `migration-probe.patch`，便于下一次实验；这些是本地审阅证据，不进入 Git。后续升级需先建立5.x blob读取兼容和覆盖率差异解释，再对同源码做热缓存及完整CI对照。
