# byeapi.top 每日签到：现场证据（issue #1746）

调查日期：2026-11-03（Asia/Shanghai）。范围：用户授权的日用 Edge 登录态（`byeapi.top`，账号 id 2843，`role: user`，注册于 2026-11-01）、站点发布的前端资源、未认证与认证后的只读请求。目标部署：`https://byeapi.top`（品牌「柏API / Bye 柏API」）。查询参数与凭据未写入本文件。

## 站点与身份

- 站点类型 `sub2api`（issue 报表中的 site type 也相同），认证为 `access_token`（浏览器 `localStorage.auth_token`，请求以 `Authorization: Bearer` 发送）。
- 前端为 Vite/Vue SPA，`/` 重定向到 `/sub2api-home/index.html#panel-home`，登录后 `/dashboard` 为控制台。未登录访问 `/login` 会重定向回 `/dashboard`（已登录）。
- 未认证探测：`GET /api/v1/<任意已注册路由>` 返回 `401 {"code":"UNAUTHORIZED","message":"Authorization header is required"}`；未知路由返回 Go 默认 `404 page not found`（`text/plain`）。`/api/v1` 之外一律 SPA 兜底（`/checkin/api/status` 实测 200 HTML），与既有小白Code 判据一致。
- 上游：`Wei-Shaw/sub2api` 上游 `main`（2026-11-02 推送）不含 daily-rewards 实现（文件树与 code search 均无 `daily-rewards`/`DailyReward`），因此签到是本站运营方加的功能。

## 签到入口与协议

侧栏顶部常驻控件（`data-test="header-checkin-button"`），文案「▸ 每日签到 / 点击签到 / [ 签到 ]」。前端 API 模块（`/assets/index-BEosptW9.js`）声明：

| 操作 | 协议 |
| --- | --- |
| 读取状态 | `GET /api/v1/daily-rewards/checkin/status` |
| 执行签到 | `POST /api/v1/daily-rewards/checkin`（前端 `n.post(url)` 无 body） |
| 历史 | `GET /api/v1/daily-rewards/checkin/history?month=YYYY-MM` |
| 补签 | `POST /api/v1/daily-rewards/checkin/makeup {date}` |
| 配置（公开读、需登录） | `GET /api/v1/daily-rewards/config` |

所有 GET 请求的 axios 拦截器都会附加 `?timezone=<浏览器 IANA 时区>`；`checked_today` 的日界以该时区为准。

### 状态响应（已脱敏；账号 id、邮箱、历史已移除）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "attendance_start_date": "2026-09-05",
    "makeup_cards": 0,
    "attendance_cycle_day": 0,
    "attendance_rewards": [],
    "registered_date": "2026-11-01",
    "checked_today": false,
    "checkin_date": "2026-11-02",
    "streak_days": 0,
    "next_checkin_streak_days": 1,
    "history": [
      { "date": "2026-11-02", "checked": false, "streak_days": 0, "cycle_day": 0, "reward_level": 0, "cash_amount_usd": 0, "is_today": true }
    ]
  }
}
```

成功信封是 `{ code: 0, message: "success", data }`（与 FreeAPI/Clawhud 同族）；未认证为 `401 {"code":"UNAUTHORIZED","message":"Authorization header is required"}`。

### 提交响应（依据前端消费逻辑，未现场触发）

前端提交后把**同一份状态**重新读入，并把 POST 返回对象当作 `today_result` 消费：

```
streak_days, reward_level, cash_amount_usd, draw: { id, cash_amount_usd }, checkin_date,
next_upgrade_date, next_upgrade_level, next_upgrade_streak_days, qualification_id
```

- 「领奖结果」卡片读取 `draw.cash_amount_usd ?? cash_amount_usd`；两者都没有时按 0 显示。
- 失败路径（抛错或非 2xx）会立刻重新读一次状态；若 `checked_today === true` 则视为成功并刷新用户余额，否则显示后端 `message`。这说明服务端对重复/并发提交不会双发，但**今天已签到时直接再 POST 是否返回成功信封尚未实测**。
- 因此本次不把本方法标记为「可重复安全」：一次真实的首次领取在用户账号上不可回滚，且该问题属于 issue #1746 的核心（重复执行会否双发）。重试/重放沿用统一状态门禁。

## 与既有方法的冲突

同一 origin 上已注册方法的表现（未认证，只读）：

| 方法 | 路径 | 结果 |
| --- | --- | --- |
| Sub2API Pro | `/api/v1/redeem/checkin/status` | 404 `404 page not found` |
| 天才程序员 / Clawhud | `/api/v1/user/checkin/status` | 404 |
| Denxio | `/api/v1/tbe-sponsor-checkin/status` | 404 |
| 小白Code | `/checkin/api/status` | 200 SPA HTML |
| 本站 | `/api/v1/daily-rewards/checkin/status` | 401 JSON（带令牌为 200 JSON） |

以同族既有部署（`freeapi.site`、`toolcode.top`、`api.clawhud.com`、`asia.nexavlinks.com`、`free.hiyo.top`、`api.denxio.top`）请求新路径均返回 404（denxio 为 502 网关错误），说明该路径不是随 Sub2API 自动扩散的。仍未确认其他运营方部署是否也有同名协议，因此**不写死 origin**；由状态 DTO 结构判别可用性，非本站部署落入 unsupported。

## 服务端行为缺口

issue #1746 的现象是「网页可以签到，但拓展不能收到」：4.6.0 版本对该站点的所有已注册方法都是 `unsupported`，`discovery: unsupported`、`selection status: none`；报告里的 `GET /checkin/api/status = 200` 即上述 SPA 兜底，属于误报线索，不能作为协议依据。

## 未验证项

- 一次真实首次领取（奖励金额、`draw` 字段是否存在、余额变化）。
- 已签到时 POST 的响应（成功信封还是业务错误码）。
- `config.enabled` 之外的停用状态（该部署的 `/daily-rewards/config` 只返回排行榜与盲盒档位，无 `checkin_enabled`；前端也没有「签到关闭」分支）。
- 跨时区日界（前端用浏览器 IANA 时区，扩展同样传本机时区）。
