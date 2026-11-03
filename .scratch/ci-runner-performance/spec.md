# CI 后续优化调查

调查日期：2026-11-04（UTC+08）。本轮完成测量、报告回放和方案评估。

建议优先隔离真实浏览器单测，然后复用报告解析结果。E2E 时长缓存已经发布，先观察后续自然运行的命中和耗时；单测权重公式需要更多受控数据后再决定是否调整。

## 样本和比较边界

| 样本 | 源码版本 | 单测运行 | E2E 运行 |
| --- | --- | --- | --- |
| 同日合并前 main | c8adaecf7f16b8d6ba45031e42769c67bf6a7adc | [41656791026](https://github.com/qixing-jk/all-api-hub/actions/runs/41656791026) | [41656790941](https://github.com/qixing-jk/all-api-hub/actions/runs/41656790941) |
| PR #1817 最终提交 | ef3f01ee2aea15b1a2289225ca5302ac5fd58354 | [41685357437](https://github.com/qixing-jk/all-api-hub/actions/runs/41685357437) | [41685357408](https://github.com/qixing-jk/all-api-hub/actions/runs/41685357408) |
| 合并后 main | 6f6f6116691c4619e812de9c003281dbaadf87eb | [41690970748](https://github.com/qixing-jk/all-api-hub/actions/runs/41690970748) | [41690970780](https://github.com/qixing-jk/all-api-hub/actions/runs/41690970780) |

PR 最终提交与合并提交的 Git tree 均为 194927895f98aa8a5de2949dd64a267aa145aa18，源码一致。PR 和合并后 main 的六个单测分片均恢复 unit-test-durations-41656791026-1，1907 个文件的分片归属也逐一核对一致。

合并后两个工作流均成功。单测工作流从创建至最终更新约 14 分 34 秒，E2E 约 13 分 07 秒。这些时间包含排队、准备和报告发布，不能单独归因于测试算法。单测分片 1 的 checkout 就耗时 76 秒；该轮还有完整性检查、覆盖率合并和时长发布的串行尾部。

下载并解码了三组共 18 份 Vitest blob，以及合并后六份 Playwright JSON 报告。本地回放使用 Node 24.14.1；blob 声明的 Vitest 版本为 4.0.3。

## 1. 浏览器安装拖尾可以与主单测分片隔离

PR 分片 5 的浏览器二进制缓存 Linux-playwright-1.64.1 命中，但 playwright install --with-deps chromium 仍耗时 160 秒；其他分片该步骤为 9–12 秒。[分片 5 日志](https://github.com/qixing-jk/all-api-hub/actions/runs/41685357437/job/126090218004)

其中 apt 下载 21.9 MB 用了 2 分 32 秒，吞吐约 144 kB/s。下载内容都是字体和 X 字体工具，包括 fonts-ipafont-gothic、fonts-freefont-ttf、fonts-unifont 和 fonts-wqy-zenhei；多数浏览器运行库已安装。相同包量在分片 2 的下载记录为不到一秒。

因此，这次 2.5 分钟拖尾来自系统包下载。Playwright 官方也说明，浏览器二进制缓存不会覆盖 Linux 系统依赖安装。[Playwright CI 文档](https://playwright.dev/docs/ci#caching-browsers)

当前直接启动真实 Chromium 的单测文件为：

- tests/scripts/accountOnboardingFlow.test.ts
- tests/scripts/aiRouterUi.test.ts
- tests/scripts/modelCatalogBrowser.test.ts
- tests/scripts/nativeKeyEditorFlow.test.ts
- tests/scripts/providerDetectionContinuity.test.ts

其他 Playwright 引用检索结果为类型引用或 mock。PR/main 的上述文件分布在分片 2、5、6，而六个分片都进行了浏览器恢复及系统依赖安装。

建议把这些测试声明到专门的 Node 测试项目，由独立浏览器测试 job 运行，使主 jsdom/Node 分片不依赖 apt。专门项目的文件选择应成为共同来源，避免配置和工作流各维护一份名单。仅按分片名单条件安装也能减少三个分片的重复安装，但仍不能隔离本次发生在必需浏览器的分片 5 上的拖尾。

这项改动的验证要求：

- 原有所有文件和用例仍运行，五个真实浏览器文件实际启动 Chromium 并通过。
- 完整性检查、blob 下载和覆盖率合并纳入浏览器项目的报告；所有实际分片/项目均计入预期输入。
- 故意缺失浏览器报告时，覆盖率发布必须失败；断言失败但报告有效的既有规则仍成立。
- 比较准备时间、最慢测试 job 和总 runner 分钟。额外 job 的准备及覆盖率成本需要计入，不能预先声称平均每轮节省 2.5 分钟。

## 2. main 可以少解析一次完整 blob

合并后单测报告 job 的阶段耗时：

| 阶段 | 秒 |
| --- | ---: |
| 检查六份报告完整性 | 25 |
| Vitest 合并测试及覆盖率报告 | 37 |
| 生成下一轮单测时长 | 26 |

[报告 job](https://github.com/qixing-jk/all-api-hub/actions/runs/41690970748/job/126115559159)

check-unit-test-reports.mjs 和 write-unit-test-durations.mjs 都分别调用 flatted.parse 读取同样的六份完整报告；当前原始数据合计约 377 MB。PR 已经跳过不会发布的时长生成，重复解析主要发生在 main/push。

建议完整性检查在同一次解析中提取精简的文件耗时字段，再调用已有 unitTestDurations.mjs 生成 manifest。保留独立生成 CLI 供离线回放。这样可减少一次大报告解析，现有样本给出的可避免预算约 25–26 秒；实际收益需要新 CI 确认。

验证要求是完整数据下生成的权重与现有生成器一致，缺失/空报告、混合 Vitest 版本、worker 错误、缺失覆盖率等输入继续被拒绝。无需为此改动权重公式或 Vitest 的内部合并接口。

## 3. E2E 缓存已经发布，速度收益仍待消费验证

合并后默认六个分片都是首轮缓存缺失，使用 Playwright --shard。六份报告均完整，发布 job 成功写出 146 个 spec 时长，并保存：

e2e-spec-durations-41690970780-1，scope 为 refs/heads/main。

[发布 job](https://github.com/qixing-jk/all-api-hub/actions/runs/41690970780/job/126116296179)

实际 smoke 阶段的步骤时间为 438、213、426、483、282、235 秒。分片 4、5 各有一个重试后通过的用例；工作流最终通过，性能比较应计入重试波动。

使用现有生成器和现有 planner 回放：

- 清单覆盖全部 146 个当前可分片文件，未知权重为零。
- 六个计划合计仍为 146 个唯一文件，没有遗漏或重复。
- 此批报告不存在一个 spec 横跨不同分片的情况，当前 max 聚合与各文件完整用例时间相符。
- 原 count 分片累计最后一次尝试的用例时间为 1521、722、1467、1697、992、786 秒。
- 新计划的同一指标为 1197.09、1197.07、1198.15、1197.27、1198.06、1197.34 秒，最重累计工作量下降约 29.4%。

累计用例时间会在多个 worker 上重叠，并且不包含先前失败尝试的所有成本。以上 29.4% 是固定测量数据的分配回放，不能当作实际工作流加速比例。首份缓存截至本轮检查没有后续消费记录。

下一次自然触发的源码 CI 应核对恢复 key、Duration-balanced shard 日志、完整测试数量和总耗时，再判断是否需要继续改 E2E 分配。单独的绿色 release-only 工作流不能替代这项验证。

## 4. 单测差距不能直接归因于缺少初始化权重

measureFileCost 已包含测试体、setup、prepare、collect 和 environmentLoad。合并后 collect 占累计文件成本约 42%，初始化成本已经参与分配。现有算法从 baseline manifest 预测六个 PR 分片都约 1276 秒的单 worker 工作量，逐文件回放与 CI 实际归属完全一致。

| 分片 | PR 测试步骤 / 秒 | main 测试步骤 / 秒 | PR Chromium 安装 / 秒 | main Chromium 安装 / 秒 |
| --- | ---: | ---: | ---: | ---: |
| 1 | 535 | 550 | 10 | 15 |
| 2 | 387 | 510 | 9 | 31 |
| 3 | 546 | 532 | 10 | 10 |
| 4 | 534 | 494 | 10 | 20 |
| 5 | 531 | 309 | 160 | 9 |
| 6 | 384 | 509 | 12 | 11 |

同样的 1907 文件、相同源码和相同权重下，最快分片从 2/6 变为 5。分片 5 的 Vitest 内部时长也从 524.59 秒变成 305.05 秒；collect 从 608.63 秒降到 360.46 秒。运行环境波动明显，不只是安装阶段影响总耗时。

日志记录了不同 Azure 区域。多数 job 使用相同 Ubuntu 镜像 20261025.179.1，PR 分片 5 是 20261101.186.1；同一镜像版本内也出现明显差异，现有数据无法把 CPU 型号、宿主负载和镜像影响分别归因。

将 baseline 原始权重与当前按来源分片总成本归一化的权重做静态回放，原始权重在两个后续样本中的最大负载相对均值偏差约为 5%/3%，归一化权重约为 12%/14%。这是值得检验的信号，但文件移位也会改变模块缓存与并发竞争，不能据此直接宣布移除归一化会加速 CI。

建议后续记录 CPU/可用并行度、实际 worker 数、镜像和区域，积累多轮可比较样本后再验证权重稳定性。若进一步优化测试本体，应先调查 collect 和最重 UI 测试的导入/渲染成本，按受影响行为做回归验证。

## 复现与保留

[回放脚本](replay.mjs)复用当前仓库的真实分配和时长函数；不包含另一份分片算法。它检查样本中的六个单测/E2E 分片是否齐全、缓存到实际单测分配的一致性、PR/main 文件归属一致性，以及 E2E 清单的完整分配。

原始报告、日志和精简字段快照保留在：

C:\Users\THINK\AppData\Local\Temp\ci-1817-analysis

PR 分片 5 的原始日志另在 C:\Users\THINK\AppData\Local\Temp\ci-1817-unit5.log。这些本地样本用于后续方案对照；报告和脚本保留在 Git，生成的 manifest/回放输出在本目录 artifacts/ 下并由局部规则忽略。

在对应源码版本和已安装依赖的 Node 24 环境中运行：

~~~powershell
$ciDataRoot = Join-Path $env:TEMP "ci-1817-analysis"
node .scratch/ci-runner-performance/replay.mjs --input-root "$ciDataRoot"
~~~

优先读取 unit-all-lean-records.json 精简快照；没有快照时读取三个目录中的原始 blob。若在另一台机器复现，且远程 artifact 尚未到期，下载布局如下；一日保留期的 E2E 输入到期后需使用保留的本地样本。

~~~powershell
gh run download 41656791026 --repo qixing-jk/all-api-hub --pattern "vitest-blob-report-*" --dir "$ciDataRoot/baseline"
gh run download 41685357437 --repo qixing-jk/all-api-hub --pattern "vitest-blob-report-*" --dir "$ciDataRoot/final-pr"
gh run download 41690970748 --repo qixing-jk/all-api-hub --pattern "vitest-blob-report-*" --dir "$ciDataRoot/merged-main"
gh run download 41690970780 --repo qixing-jk/all-api-hub --pattern "e2e-spec-durations-*" --dir "$ciDataRoot/e2e-main"
node .scratch/ci-runner-performance/replay.mjs --input-root "$ciDataRoot"
~~~

验收：真实数据回放通过，回放脚本的语法和格式检查通过；删除精简快照中的一个 main 文件后，回放非零退出并拒绝这组不完整比较。调查中的方案尚未实施，E2E 后续缓存消费和实际速度收益属于待关闭的测量条件。
