# 小白Code 签到：现场调查

调查日期：2026-09-26（Asia/Shanghai）。范围：用户授权连接的 Edge 登录态、站点发布的前端资源、Sub2API 上游源码、当前仓库。结论：已实现适配 `xiaobai-code:daily-checkin`——按 Sub2API 账户类型，探测站点自有 origin 上的固定路径，再做只读协议探测。

现场样本是 `https://token.dialoguedui.com`（品牌「小白Code」）。取舍见 [仓库接入说明](repo-compatibility.md)。

## 站点与身份

`小白Code` 是白牌 Sub2API 部署：无认证访问 `GET /api/v1/auth/me` 返回 HTTP 401 `{"code":"UNAUTHORIZED",...}`（字符串 `code`），命中 [detectSiteType.ts](../../src/services/siteDetection/detectSiteType.ts) 既有的白牌识别，账户进入 `SUB2API` 站点类型。页脚与 README 指向 `https://github.com/Wei-Shaw/sub2api`。`dialoguedui.com`、`www.dialoguedui.com`、`api.dialoguedui.com` 均无法解析，实际只有 `token.dialoguedui.com` 一个源。

## 签到入口与协议

侧栏存在自定义菜单项「每日签到」，指向 `/custom/checkin_bonus_user`。该页面在 DOM 中嵌入同源 iframe：

```
https://token.dialoguedui.com/checkin/?user_id=3874&token=<Sub2API 会话 JWT>&theme=light&lang=en&ui_mode=embedded&src_host=...&src_url=...
```

`token` 就是 Sub2API 的会话访问令牌（JWT 载荷含 `user_id`/`email`/`role`/`token_version`/`sid`/`bnd`）。iframe 内是站点自有的静态应用 `checkin/index.html` + `checkin.js?v=20260515-baijing` + `checkin.css`，版本后缀带本站货币名「白晶」，因此不是上游 Sub2API 代码：上游 `backend/internal/server/routes/user.go` 只注册 `/redeem`，没有签到路由。

应用调用两条相对路径（`apiFetch` 共用 `Authorization: Bearer <token>`）：

| 操作 | 协议 |
| --- | --- |
| 读取状态 | `GET /checkin/api/status` |
| 执行签到 | `POST /checkin/api/checkin`，请求体 `{}` |

状态响应（脱敏摘录，`data.user`、`data.records` 仅说明结构）：

```json
{
  "ok": true,
  "data": {
    "config": { "enabled": true, "timezone": "Asia/Shanghai", "dailyReward": "0.25",
                "streakIntervalDays": 4, "milestoneDays": 16 },
    "user": { "id": "3874", "email": "...", "balance": 1.5, "role": "user" },
    "today": "2026-09-26", "signedToday": false, "currentStreak": 0,
    "previewReward": { "total": "0.25" }, "records": []
  }
}
```

首次提交返回 HTTP 200：

```json
{
  "ok": true,
  "data": {
    "alreadyChecked": false,
    "record": { "checkin_date": "2026-09-26", "reward_amount": "0.25", "streak_days": 1, "status": "success" },
    "status": { "...与状态接口同结构..." }
  }
}
```

本次真实领取使余额由 `1.5` 变为 `1.75`，随后 `signedToday` 变为 `true`。再次提交返回 HTTP 200、`alreadyChecked: true`，`record` 仍为首次那条（`id` 相同、`created_at` 未变），余额仍为 `1.75`——服务端按「用户 + 日期」幂等。无 `Authorization` 时两条接口均返回 HTTP 401 `{"ok": false, "code": "LOGIN_REQUIRED", "message": "请先登录后再签到"}`。

数值字段类型不稳定：`user.balance` 在首次响应中是数字 `1.5`，提交后再次读取变成字符串 `"1.75000000"`；`reward_amount` 始终是字符串。解析同时接受有限数字与十进制字符串。

## 与既有方法的关系

本部署不实现任何已注册的 Sub2API 签到协议，全部返回 Go 默认的 404：

| 路径 | 结果 |
| --- | --- |
| `/api/v1/redeem/checkin/status`（Sub2API Pro） | 404 `404 page not found` |
| `/api/v1/user/checkin/status`（天才程序员中转站） | 404 `404 page not found` |
| `/api/v1/tbe-sponsor-checkin/status`（登仙公益站） | 404 `404 page not found` |

签到只存在于站点自有的 `/checkin/api/*`，因此需要新增方法。

## 为什么用固定路径，而不是读宿主声明的自定义页面

Sub2API 有宿主级的**自定义页面**功能：管理员配置侧栏菜单项与 URL，前端用 `buildEmbeddedUrl()`（`frontend/src/utils/embedded-url.ts`）构造 iframe 地址。该配置**无需登录即可读取**（`GET /api/v1/settings/public` 的 `custom_menu_items`），本部署实测返回 `https://token.dialoguedui.com/checkin/`。

我曾据此实现「读公开设置 → 取同源菜单 URL → 推出应用目录 → 探 `{base}api/status`」，理由是要避开一个坑：**该平台在 `/api/v1` 之外对未知路径从不返回 404，一律 200 HTML**（`/nonexistent-path-xyz/api/status`、`/docs/api/status`、`/custom/checkin_bonus_user/api/status` 实测均如此；只有 `/api/v1/nonexistent-route-xyz` 返回 404 `text/plain`）。当时的解析把 200 HTML 判为 unknown，而按 [domain.ts](../../src/services/checkin/autoCheckin/domain.ts)「一个 matched + 任一 unknown 得出 unknown」，在未部署该应用的站点上无限定地注册会拖住自动选择。

这个方案被撤销，因为它带来的约束比解决的问题更实际：**菜单项是部署配置，不是协议的一部分**。运营者完全可以把签到应用留在站点上而不放进侧栏，那时 API 明明可用却永远探不到。而当初要绕的那个坑其实已经由另一条规则解掉了——为了让「声明的页面不是本应用」可判定，「200 + 非 JSON」被定为 absent。同一条规则作用在固定路径上就是：其他 Sub2API 站点对 `/checkin/api/status` 返回 SPA 的 200 HTML → absent，不污染决策。

实测依据（只读，无令牌）：

| 探测 | 结果 | 判定 |
| --- | --- | --- |
| `token.dialoguedui.com/checkin/api/status` | 401 JSON `LOGIN_REQUIRED`；带令牌时为 200 JSON | 无令牌 unknown；带令牌 matched |
| `codexcli.club/checkin/api/status`（未部署该应用） | 200 `text/html`（SPA 索引） | absent |
| `token.dialoguedui.com/api/v1/redeem/checkin/status` 等 | 404 `text/plain` | absent |

因此固定路径不需要 origin 限定，也不需要维护任何域名清单。代价是：如果该部署将来把应用挪到别的路径，本方法会探不到——那时要改一个常量。

## 测试边界

已用真实登录态完成只读状态查询、真实首次领取、重复提交、无凭据 401 四项验证，并在真实部署与 `codexcli.club` 上验证了固定路径在不同站点上的判定。未验证：`config.enabled: false` 的禁用响应、会话过期后的刷新链路、应用换路径后的行为。真实领取发生在本调查使用的账号上，属于用户明确授权的操作。

## 实施与验证（2026-09-26）

见 [仓库接入说明](repo-compatibility.md)。
