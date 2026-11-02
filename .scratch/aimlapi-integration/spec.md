# AI/ML API 账号集成

Status: ready-for-human

截至 2026-11-02；实现核对版本 `9a4a1acd73`。本文描述最终合同，取代早期“仅手动接入”“无机器价格源”“工具不可用”等结论。脱敏历史实测见 [contract-probes.md](evidence/contract-probes.md)，定价取舍见[定价 spec](../aimlapi-pricing/spec.md)。

## 站点与凭据

- 独立的 Account-Only Site Type，不是 New API 派生站点，不提供 managed-site 能力。
- 主凭据 management key 管理普通密钥；可选 regular API key 读取余额/账单。缺少后者时余额不可用，不补零。推理、导出、验证选择 regular key，不使用 management key。
- `aimlapi.com` 是产品入口，`app.aimlapi.com` 提供控制台会话，`api.aimlapi.com` 提供静态密钥接口及推理，`tools.aimlapi.com` 提供公开工具目录。不能将一个主机的 404 推广为整项能力不存在。
- 控制台 JWT 仅用于当次身份提取和显式引导，不保存为账号凭据，也不写入签发 ledger。

## 接入与职责

1. 被动发现只读取站点/会话身份，无签发权限。主动流程独立注册于 `services/accounts/onboarding/`，检测和会话提取不得反向导入它。
2. 显式自动连接可以复用已验证的同账号双凭据，或在已登录控制台获取专用 management/regular pair；手动输入仍有独立校验和失败恢复。
3. 签发前重读会话身份，验证响应 owner、类别和可用性。有 regular key 时需匹配浏览器身份；只有 management key 且无账单身份时保留 credential-scoped 身份，不虚构账号关联。
4. 按用户加锁的本地 ledger 在 POST 前写 pending，成功后先保存一次性明文再继续。取消重开及不确定结果不能盲目重复签发；已验证的保存凭据优先。
5. 表单确认后才持久化。失败保留已发现身份和已取得凭据，显示手动引导，不用 console bearer 代替 management key。
6. 删除账号提交后按保存的 management/regular 密钥及类别精确清理 ledger 中已确认的明文凭据；不能依赖 account_info.id，因为 management-only 恢复账号以密钥前缀为身份，签发 ledger 则按控制台用户 ID 组织。pending 记录继续保留以阻止不确定签发重放。凭据校验明确返回 401 时只清理对应类别、相同密钥的 Ready 项，不能清掉已轮换的新密钥；403、网络失败和清理失败均不扩大失效范围。清理失败不改变已提交的账号删除或原始校验错误。

控制台协议归 `apiService/aimlapi/console.ts`；账号用途、绑定和签发策略归 `apiAdapters/aimlapi/accountOnboarding.ts`。纯会话提取只使用瞬态认证合同。Novita 是主动注册表的另一个消费者，不为单站点另建分派框架。

## 密钥与账号能力

| 能力 | 当前边界 |
| --- | --- |
| 余额/账单 | regular key；管理密钥无此权限 |
| 今日/历史统计 | 复用站点用量接口；无来源的收入等指标明确不可用 |
| 普通密钥清单 | management key；列表只有元信息，不能重新取得明文 |
| 创建/删除 | 创建一次性明文；删除读回确认，不重放不确定写入 |
| 编辑/状态 | 名称、额度、模型/工具/scopes；启停仅提交 disabled |
| 过期时间 | 创建时可写；编辑静态展示，上游 PATCH 忽略该字段 |
| 模型/工具 | 公开目录、搜索多选，最多 15 模型/50 工具；保留目录暂缺的已有值，清除提交 null |
| 限额 | 默认不重置；未知消费/剩余额保持未知，不补零或相减推导 |
| 重置时间 | 依据官方 UTC 日/周/月日历窗口和 window_start，不冒充滚动窗口 |
| 价格 | 公开结构化目录，不表示某把密钥可使用全部模型 |
| 签到/公告/邀请 | 未实现，不以未取到证据宣称上游完全不存在 |

共享 `statusActions` 同时拥有动作资格和零字段命令，factory/collection 派生展示与执行；禁止只声明按钮而遗漏命令。AIMLAPI、PM-API、RelayFor 保留各自原生命令。公开模型/工具显式匿名，避免 transport 补回管理密钥。

## 证据限制与后续条件

- 历史观察到普通 key 在受限路由首次成功、随后稳定 403，只证明被调查部署的当次行为，不授权重放写入或依赖例外。
- 2026-11-02 新建有限额临时密钥的创建、列表、详情、自身读取都返回完整零消费计数；不能证明非零消费或字段永不缺失。未知计数已有回归保护，非零消费现场样本仍缺。
- 官方历史文档示例缺少当前响应字段并沿用 no_reset；不能从示例缺字段推断部署必然省略。
- 未执行付费推理；普通密钥任务通过不表示全部异常、导出/验证或管理密钥 CRUD 已验收。

## 维护验证与本地证据

- `tests/services/apiAdapters/aimlapi/`：身份、引导、凭据范围、保存、密钥动作。
- `tests/services/accountSiteOnboarding/aimlapiTransientAuth.test.ts`、`tests/services/accounts/onboarding/`：被动/主动边界。
- `tests/services/apiService/aimlapi/index.test.ts`：认证、写入、未知额度、UTC 周期与公开目录。
- 账号表单、密钥 editor/controller 测试：可见反馈、字段和动作；`e2e/aimlapiAuthentication.spec.ts` 使用受控网络，不是远端签发证明。
- `pnpm e2e:cdp:aimlapi` 精确绑定当前工作区构建；凭据和写入前提以 runner 为准，只清理本次拥有的资源。

历史浏览器及现场证据保留于本地 `artifacts/`、`parity-artifacts/`。源码或尺寸不一致的截图只作参考，不声称像素回归通过。逐轮文档和报告生成器已移出交付，库外副本位置记录在本地 `artifacts/pr-split-state.json`；原始响应、截图、失败尝试和未完成调查未删除。本次材料整理不代表重新执行全部现场操作。
