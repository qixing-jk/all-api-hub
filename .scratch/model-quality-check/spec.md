# 进阶验证：绘图测试与可编辑验证提示词（#1739 剩余缺口）

Status: ready-for-human

## 需求演变

[#1739](https://github.com/qixing-jk/all-api-hub/issues/1739) 提三项：采样降智检测、一键鹈鹕测试、自定义替换请求头。第 3 项已由 #1750 交付。

第一轮按 TraceOne 的成对 canary 实现了采样降智检测，评审后放弃：

- 16 题（4/家族）的配对 McNemar 只能发现大幅下降，却又会给出「疑似降智 / 未发现降级」的确定语气，远超样本能承载的结论强度。
- 用户提出 ModelTrace（1911 stars）比 TraceOne（12 stars）更成熟。ModelTrace 是**指纹归因**工具，回答「这是哪个模型」，需要 931KB 的指纹库和 18 个模型的官方基线，且明确声明「待测模型不在库中时任何结果都可能」。它不适合回答「是不是变弱了」，也不适合放进扩展。
- 因此删除 canary / degradation / scoring / session / history 全部模块，只保留鹈鹕绘图测试。

## 交付内容

**共用的「进阶验证」区**（默认折叠），嵌入全部四个验证入口：

| 入口 | 接线方式 |
| --- | --- |
| 账号验证（`VerifyApiDialog`） | 直接调用 provider |
| 凭据档案验证（`VerifyApiCredentialProfileDialog`） | 直接调用 provider |
| CLI 兼容性验证（`VerifyCliSupportDialog`） | 直接调用 provider |
| 网页 API 验证（Web AI API Check） | content script 无法直连 provider，新增 `webAiApiCheck:runPelican` 消息在后台执行 |

绘图测试要求模型画骑自行车的鹈鹕 SVG，内联渲染 + 形状计数；含脚本或外部引用的回答拒绝渲染。

**可编辑验证提示词**：文本生成、结构化输出、工具调用、联网搜索、向量嵌入、图像生成、视频任务共 7 项，逐项编辑、占位符显示内置默认、已自定义项可单项恢复默认；绘图提示词同样可编辑。

- 提示词由 `probes/probePrompts.ts` 单一拥有；各 probe 改为从这里取，所以一次编辑对四个入口和批量测试同时生效，不需要每个调用方透传。
- `runApiVerificationProbe` 是唯一派发点，未显式传入时从 `probePromptStore` 读取已保存值。缓存按 `user_preferences` 的 storage 变更失效，因此另一个扩展上下文里的编辑对下一次运行生效。
- 空值 = 用内置默认；重置是**删除 key**而不是写空串，这样日后默认值更新仍会跟随。

## 行为变更表

| 场景 | 变更前 | 变更后 | 断言 | 结果 |
| --- | --- | --- | --- | --- |
| 四个验证对话框底部 | 无进阶区 | 都有收敛的同名折叠区，默认收起 | `VerificationToolsPanel.test.tsx › is collapsed by default…`；E2E 断言折叠时无「运行绘图测试」按钮 | 通过 |
| 折叠区展开 | — | 展开才出现动作按钮，避免误触 token 消耗 | E2E 断言 `toHaveCount(0)` → 展开后 `toBeVisible` | 通过 |
| 绘图测试（账号/档案/CLI） | — | 直接调用 provider，渲染返回的 SVG | E2E 断言 `img.complete && naturalWidth > 0` | 通过 |
| 绘图测试（网页 API 验证） | — | 经后台消息执行，只有 SVG 分析跨消息边界 | 类型 + 消息路由注册（无 E2E，见缺口） | 部分 |
| 返回脚本/外部引用 | — | 拒绝渲染并提示 | `VerificationToolsPanel.test.tsx › refuses to render unsafe markup` | 通过 |
| 返回无 SVG | — | 显示提示并保留原始回答 | `explains when the answer had no SVG` | 通过 |
| 非文本模型 | — | 绘图测试禁用 | `canRunPelican=false` 断言（账号 + 档案两侧） | 通过 |
| 运行中关闭对话框 | 可直接关闭 | 阻塞关闭 | `runs the drawing test … blocks closing`；`blocks closing the profile dialog while a drawing test runs` | 通过 |
| 编辑提示词 | — | 逐项编辑、占位符显示内置默认、仅已自定义项可单项恢复默认 | `VerificationToolsPanel.test.tsx`；`VerificationPromptEditor` 断言 | 通过 |
| 提示词保存 | — | 停止编辑后自动保存，对所有入口生效；保存失败保留编辑并提示 | `useVerificationTools.test.tsx`；E2E 重载页面后读回 | 通过 |
| 提示词实际送达 | 用内置常量 | 用已保存的提示词 | `aiApiVerification.promptOverrides.http.test.ts`（4 条）；E2E 抓服务端收到的 body | 通过 |
| 空/非法提示词 | — | 回退内置默认（探针必须发出内容） | `probePrompts.test.ts`；`promptOverrides.test.ts` | 通过 |
| 跨上下文编辑 | — | 偏好写入使缓存失效，下一次运行读取新值 | `probePromptStore.test.ts › re-reads after a preferences write` | 通过 |
| 读取失败 | — | 不缓存失败结果，下一次重试 | `probePromptStore.test.ts › does not cache a failed read` | 通过 |

## 执行过的检查

```
npx tsc --noEmit                                # 0 error
npx eslint <changed paths>                      # 0 error / 0 warning
npx i18next-cli extract --dry-run --ci --quiet  # ✅ No files were updated
npx vitest run tests/features/Verification tests/features/ApiCredentialProfiles/verification \
  tests/services/verification tests/services/aiApiVerification tests/services/webAiApiCheck \
  tests/services/verificationResultHistoryStorage.test.ts tests/services/shareSnapshots.test.ts \
  tests/components/VerificationStatusBadge.test.tsx
  → 45 files / 798 tests passed
npx playwright test e2e/verificationTools.spec.ts --project=chromium
  → 5 passed（另含 e2e 构建）
```

以上为合入基线 `origin/main@bbf6ef001` 后在最终树上执行的结果（2026-10-26）。更早一轮记录（67 files / 979 tests）是同一内容在旧基线上的结果。

提交时 `lint-staged` + `i18n:check:staged` + 颜色/排版检查 + e2e 构建与权限警告检查全部通过。

## 视觉检查

`artifacts/verification-tools-full.png`（本地，已 exclude）：浅色主题下实拍展开态，确认模型名标题、绘图区（4 shapes · 3 circles/ellipses · viewBox）、Raw answer 折叠项、Probe prompts 七行（每行一个可折叠编辑器）的层级与间距正常。该截图取自引入自动保存之前的一轮迭代，底部仍带后来移除的「Save prompts / Reset all」一行；最终交互为停止编辑后自动保存、仅已自定义项可单项恢复默认，保存失败在编辑器内提示。绘图预览在截图视口下方时另以 `naturalWidth > 0` 断言真实解码，最终态截图由 E2E 输出（`drawing-result.png`、`drawing-history-restored.png`）。

未做 before 图：该区块为新增表面，无前身，before 标记为不适用。

## 已知缺口

- **网页 API 验证的绘图测试无 E2E**：需要 content-script 场景的浏览器流程，本轮只做了类型检查与消息注册验证。
- **CLI 兼容性对话框的进阶区无 E2E**：同理由，只有单元级 `sharedTools` 断言。
- **入口页面未补交叉引用**：`api-credential-profiles.md` 与 `web-ai-api-check.md` 仍只描述探测套件，没有链接到新的进阶区；本轮只在 `model-list.md`（zh/en/ja）补齐说明。
- 未验证：真实第三方中转站的现场行为（需真实凭据）。
- 未跑全量 vitest（按仓库约定归 CI）。全量单跑中出现 1 个 `CompactTagFilter.test.tsx` 偶发失败，单独复跑通过，与本次改动无关。

## 基础 Agent 测试模式（2026-10-25）

按用户确认，仅增加用于测试的有限工具循环。默认保持单次回复；显式开启 Agent 模式后，使用本次运行独占的虚拟文件和 QuickJS/WASM，同步 JS 可自行生成、检查和修改产物。工具环境独立于鹈鹕任务，后续任务可复用，不引入规划器、长期记忆、终端或完整 Agent 框架。上游方案取舍保留在 [调研笔记](browser-agent-research.md)。

已验证 Chromium、Edge 的流式/非流式实际扩展流程，以及 Firefox MV2 扩展流程（本地合成模型端点，工具在扩展内真实执行）。服务测试覆盖工具反馈、失败修正、JS 事务回滚、目标文件读取、轮数限制、取消、运行隔离和 JS 时间/内存/输出限制。网页入口补充后台取消和请求配置透传，CLI 与账号入口复用同一面板和 hook。

验收表、命令、失败与修复记录、截图路径保留在本地忽略目录 `test-results/agent-acceptance/report.md`。基线图位于 `test-results/agent-baseline/`；首次 Chromium 定位器错误的失败图位于 `test-results/agent-final/`，修正后通过，未删除失败证据。默认模式对比在 `.scratch/visual-comparisons/run-Zhl4At/`，增加模式开关导致面板截图高度不同，状态为 dimension-mismatch，不能作为像素断言通过证据。Agent 模式为新增表面，最终对话框截图单独保留并人工检查。

保留缺口：Safari/移动端、真实第三方模型行为、网页/CLI入口完整浏览器 Agent 流程尚未验证；这些入口已有组件和消息边界覆盖。浏览器兼容性结论限于已执行的样例。日志/文件只保留在本次界面结果中，不增加持久化或遥测字段。

### 放宽环境（用户后续纠正，替代上一版预算设计）

用户指出初版环境过于受限。移除固定模型轮数、工具次数、文件数量、单段代码长度和原先单文件大小限制；运行至模型结束或用户停止。JS 支持顶层 await / Promise，默认预算放宽为 5 秒、128 MiB，模型可用 timeout_ms / memory_mb 调整（最多 60 秒 / 1024 MiB）。文件系统支持虚拟绝对路径、相对路径和 Unicode 名称，仍不能越出虚拟根；仅保留 64 MiB 工作区的浏览器资源保护预算。日志和返回值分别在 64 Ki 字符截断并标记，不因输出较长而失败。JS 同步计算仍由解释器预算中断，Promise 调度间让出事件循环以接收取消。

回归增加 42 轮模型请求 / 41 次工具执行完成、20 个 Unicode 文件、200 KB 文件、超长日志不丢产物、Promise 等待取消；浏览器合成模型响应改为使用真实顶层 await。前一版 8 轮 / 32 次 / 250ms / 16MiB 的验收记录是历史状态，不代表当前实现。本轮记录保留于本地 `test-results/agent-relaxed/report.md`。
