# 天才程序员中转站 每日签到可行性调查

调查日期：2026-09-14（Asia/Singapore）。范围：用户授权连接的 Edge 登录页面、站点发布的前端代码、当前仓库。结论：已实现独立签到适配 `genius-programmer:daily-checkin`，按 Sub2API 账户类型提供只读协议检测，不限制域名。

## 现场证据

实际打开 [Dashboard](https://codexcli.club/dashboard)，标题为 Dashboard - 天才程序员中转站。Daily Check-in 卡片显示 Checked In、Today's Reward $0.05、Done Today，下一次可用时间为 2026-09-15 00:00:00。进入页面时账号已签到，并非本次测试领取。

页面实际发出 `GET /api/v1/user/checkin/status?timezone=Asia%2FSingapore`，返回 HTTP 200。脱敏摘录：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "enabled": true,
    "today_checked_in": true,
    "checkin_date": "2026-09-14T00:00:00Z",
    "reward_amount": 0.05,
    "next_available_at": "2026-09-14T16:00:00Z"
  }
}
```

来源：[状态接口](https://codexcli.club/api/v1/user/checkin/status?timezone=Asia%2FSingapore)，需登录。原响应还含 recent_records 及内嵌用户资料，记录仅保留协议必要字段。再次只读查询确认 today_checked_in 仍为 true，历史记录数量仍为 2。

## 前端协议

以下来自站点当前发布的第一方脚本，哈希文件名可能随部署改变：

| 操作 | 协议 | 证据级别 |
| --- | --- | --- |
| 读取状态 | `GET /api/v1/user/checkin/status`，页面追加 timezone | 已观察 HTTP 200 和真实响应 |
| 执行签到 | `POST /api/v1/user/checkin`，业务函数未提供请求体 | 前端代码及已签到场景的 HTTP 200 响应确认 |
| 查询历史 | `GET /api/v1/user/checkin/records`，传入查询参数 | 前端代码确认；未调用 |

来源：[user-DMko4IQ8.js](https://codexcli.club/assets/user-DMko4IQ8.js)。其 getCheckinStatus、checkin、getCheckinRecords 分别调用以上三条相对路径，共用 API 客户端。

[DashboardView-XZ5YZwPO.js](https://codexcli.club/assets/DashboardView-XZ5YZwPO.js) 中：

- 卡片显示受公开设置 checkin_enabled 与非 simple mode 控制。
- today_checked_in 为 true 时禁用签到按钮；enabled 为 false 时也禁用。
- 提交成功后按 new_reward 区分新奖励和已经签到，读取 reward_amount，并重新读取状态。
- 该签到处理函数无验证码参数、外部任务、倒计时或多阶段领取过程。这里只能证明观察到的前端流程，不代表后端永远不触发风控。

[index-BiWeqiSZ.js](https://codexcli.club/assets/index-BiWeqiSZ.js) 中 API 客户端从 localStorage 的 auth_token 读取登录令牌，附加 `Authorization: Bearer <token>`；启用 withCredentials，默认 JSON Content-Type；GET 自动追加浏览器 timezone；另有刷新令牌处理。没有导出或保存令牌。客户端还包含按路由条件设置 Idempotency-Key 的通用逻辑，但未确认签到路由是否命中，不能据此声称签到写入可安全重试。

## 测试边界

已在 Edge 验证真实状态查询和重复签到响应。真实首次领取、新奖励响应完整结构、认证过期恢复仍未实测；扩展后台执行已通过模拟接口 E2E，不能当作真实首次发奖证据。

当日奖励 0.05 是现场观察值，不能硬编码为固定奖励。next_available_at 应优先作为重置时间证据；单次响应与历史记录不足以判断所有时区的后台日界线规则。

## 支持方案

当前仓库接入位置和源码证据见 [仓库兼容性调查](repo-compatibility.md)。现有 Sub2API Pro 使用 `/redeem/checkin`，Denxio 使用 `/tbe-sponsor-checkin` 多阶段流程，均不匹配本部署 `/user/checkin` 协议。

适配器以站点品牌“天才程序员中转站”命名：代码使用 `geniusProgrammer`，方法 ID 为 `genius-programmer:daily-checkin`。与登仙一致，所有 Sub2API 账户均可执行只读协议探测，通过接口与响应结构判断兼容性；候选注册本身不证明支持。复用 Sub2API 认证生命周期，不为开发阶段的旧方法 ID 保留兼容别名或迁移。

执行顺序：严格解析状态，enabled 且 today_checked_in 为 false 才发送 POST；将 new_reward 映射为成功或已签到；响应丢失时只回读状态，无法确认则保留 UNCERTAIN。禁止将 401、网络错误或错误结构当作未签到。已有账户需重新检测签到方法。

## 实施与验证（2026-09-14）

- 已新增 `genius-programmer:daily-checkin`，对 Sub2API 账户提供协议检测，沿用统一每日签到文案与认证生命周期。已有开发版账户可重新检测签到方法。
- 严格解析 `enabled`、`today_checked_in`、`new_reward` 和有限非负 `reward_amount`，不保存嵌套用户与历史记录。
- 先读取权威状态再提交。未确认结果只做状态协调；未启用未知结果后的写入重试，也未启用 POST 的 401 自动重放。认证失败后可刷新账户再重试。
- Edge 补测重复签到取得 HTTP 200、`code: 0`、`new_reward: false`、`already_checked_in: true`、`reward_amount: 0.05`，弥补首次调查中未取得响应的缺口。另以 `credentials: omit`、仅 Bearer 登录令牌读取真实状态，HTTP 200 且今日已签到；令牌未导出。
- 相关 Vitest：13 个文件、332 项测试通过；`pnpm compile`、`pnpm knip`、`pnpm build:e2e` 通过。
- `e2e/geniusProgrammerCheckin.spec.ts` 在构建后的扩展中验证正常发奖、已签到不提交、服务端发奖后响应丢失的状态回读，3 个场景通过（另有 1 个构建准备测试）。断言真实扩展发出 Bearer 请求、POST 无请求体，并且每次运行最多提交一次。测试将站点所有请求拦截为模拟响应，不会给真实账号发奖。
- 限制：真实账号当天已签到，未取得真实首次发奖响应；新奖励字段依据站点前端代码实现，并在模拟接口的扩展 E2E 中验证。未将测试版本安装到用户的 Edge 扩展环境。

