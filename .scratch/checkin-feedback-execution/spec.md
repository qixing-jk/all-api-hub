# 签到反馈收集改进（#1880）

Status: ready-for-human

## 范围

用户明确要求：“我要的只是改善收集部分，和用户这次遇到的无关”。
#1880 仅作为发现收集结果含义不清的背景；用户手写的问题描述不作为已确认
执行错误，也不用于推断具体签到入口或后台通信故障。

本改动只改善反馈对现有数据的读取、来源说明、缺失原因和恢复。此前误加的
快捷签到命令诊断、持久化字段、toast 修改及其专用测试已经移除。快捷签到
与自动签到仍使用原来的最近执行记录，原执行流程和存储结构保持原样。

## 收集语义

- `executionRecord` 区分 available / no_history / read_failed / not_linked /
  invalid_record；实际执行状态只在有效记录存在时报告。
- `executionSource` 区分 saved_history / provided_result / unlinked_draft。
  读取保存历史为空只表明没有可用记录，不能推断从未执行或站点不支持。
- 打开反馈或重载执行记录时直接读取本地 storage；固定结果行使用入口提供
  的那条结果。收集不会派发签到命令，也不会新增执行结果或命令存储。
- 读取失败提供只读重载。重载保留描述、手工线索、账号配置草稿与认证，重新
  生成技术详情；扫描不重启。重复点击合并，再次读取失败可以继续重试。
- 重载前检查原保存账号身份；站点、用户、类型变化或账号删除后，不读取其他
  身份的记录。草稿未关联账号及固定结果行不会重载保存历史。
- 保存历史中的成功徽标采用“签到成功”，避免称为当前操作的成功。继续使用
  共享徽标；结果表默认文案保持原样。收集消息保留原有敏感信息脱敏。
- 无历史或未关联只保留在诊断详情中，不作为主界面提示。读取失败或记录无效
  与收集状态分别显示为图标行：黄色警告图标、相同灰色文字和行高，保留
  “重新读取”链接。提示不增加底色、边框或标题；链接移除多余高度与留白，
  图标和文字的对齐方式与上面一致。只对这些可恢复情况显示重新读取。
- 弹窗和模板统一为“签到反馈”，问题摘要进入标题。普通报告的站点、描述
  分别预填到对应表单字段，诊断正文不重复；描述过长或需复制时保留完整报告，
  避免重复预填站点与摘要。复制内容与本地完整预览仍一致。
- 浏览器版本、操作步骤是选填建议；原反馈正文必填规则保留。收集中说明报告
  完成后会更新，按钮引导去 GitHub 检查报告；不增加等待或补充信息的门槛。
- 浏览器名称和版本自动加入环境诊断及 GitHub 的 browser-info 字段：优先使用
  Firefox runtime 元数据或 Chromium fullVersionList，再回退到产品 UA token。
  缩减版本明确标注 major version only；拿不到则留选填，读取未完成或失败不
  阻塞表单。只保留名称和版本，不复制完整 UA，不新增权限、后台消息或存储。
- 技术详情在记录更新时生成，输入描述和分享时保持稳定，避免复制后报告被
  时间变化误判为已修改。全部 8 个应用语言同步收集侧的 5 个新提示。

## 代码与验证入口

- `src/services/checkin/feedback/{execution,report}.ts`
- `src/services/checkin/autoCheckin/storage.ts`：诊断读取可以选择抛出读取错误，
  其余调用保留原来的 null-on-error 行为；没有写入逻辑变化。
- `src/features/CheckInFeedback/{CheckInFeedbackDialog,FeedbackForm}.tsx`
- `src/utils/browser/userAgent.ts`、`tests/utils/browserVersionInfo.test.ts`
- `tests/features/CheckInFeedback/CheckInFeedbackDialog.test.tsx`
- `tests/services/checkin/feedback/report.test.ts`
- `tests/services/autoCheckin/storage.test.ts`
- `e2e/checkInFeedbackExecution.spec.ts`：无历史、全部有效状态、损坏记录、读取
  失败和重载，另含移动端、英文与深色主题。扩展和 storage 为真实运行，
  站点响应和存储故障为 fixture；所有场景均不触发签到且断言没有 POST。

```powershell
pnpm exec vitest run tests/features/CheckInFeedback tests/services/checkin/feedback tests/services/autoCheckin/storage.test.ts tests/features/AccountManagement/components/AccountDialog.test.tsx tests/features/AccountManagement/components/AccountActionButtons.toggleAndCheckin.test.tsx
pnpm exec playwright test e2e/checkInFeedbackExecution.spec.ts e2e/checkInFeedback.spec.ts e2e/autoCheckinResultActions.spec.ts --project=chromium --workers=2 --output=diagnostics-results/feedback-collection-new-run
pnpm compile
pnpm knip
```

## 留存

实施位置为 G:/Development_Data/WorkSpaces/ensoai/all-api-hub/temp2；temp18 不修改。
起始 base 为 17830de3474e3f0100f23b31943314c1c043539c。只提交本地任务改动。

本 spec 保留收集语义、边界和可维护验证入口。最新本地验收与截图在
`diagnostics-results/issue1880-collection-only/README.md`；原
`diagnostics-results/issue1880-baseline/` 保存 v4.10.1 对照，原
`diagnostics-results/issue1880-final/` 是已被本次范围修正替代的阶段记录。
日志、截图和失败证据均留在忽略目录供审阅，不提交或自动删除。

后续提示、文案与模板衔接改进的验收见
`diagnostics-results/issue1880-refinement/README.md`，使用 collection-only 的
76b48d6eca 构建截图作同场景基线；新增收集中场景保留 after-only。
浏览器版本自动预填的回归日志为 `diagnostics-results/issue1880-browser-info-*.log`。
主预览按用户反馈只展示两组有明显差异的对照，其余已采集截图保留在
`diagnostics-results/issue1880-refinement/all-captures.md`，不重复展示。
失败图标行与对齐的最终验收保留在 `diagnostics-results/issue1880-failure-inline/`，
对应日志为 `diagnostics-results/issue1880-failure-inline-*.log`。其中 red、alignment-red
是阶段回归证据；alignment-red 曾把整个英文段落的高度计入对齐测量，后来
改为比较第一行。run1 是修改对齐前的阶段记录；run2 保存其他六个最终场景，
英文手机场景在 run3 以修正后的断言通过。此前黄色背景条
方案已按用户反馈取消，`diagnostics-results/issue1880-failure-emphasis/` 仅留本地
供对照，不作为最终预览；这些阶段证据不提交或自动删除。

标题预览和站点名称回退重构的[本地验收报告](../../diagnostics-results/checkin-feedback-title-scout/README.md)
记录了分支审查范围、行为检查及 Chromium 对照截图。
