# AnyRouter 浏览器登录与页面签到调研

Status: needs-triage

调查日期为 2026-10-10，目标 `https://anyrouter.top`，公开前端包为 `index-Dultz3N6.js`，后端公开标签为 `v0.0.0`。以下是当时部署的观察，不代表当前部署仍相同。未执行登录或签到写入，浏览器登录适配尚未完成。

## 页面登录与签到不是同一个成功信号

公开 `/api/status` 当时启用了 GitHub 和 Linux DO OAuth。前端 `uu()` 读取 `localStorage.user.id`，没有用户时返回 `-1`；路由组件取得该值后执行以下 effect。关键代码从当时的部署包摘出，省略无关 UI：

```js
async function uD() {
  const e = await be.post("/api/user/sign_in"),
    { success: t, message: r } = e.data
  r && (t ? Ae : ee)(r)
}

// z4e() 内：t = uu()
y.useEffect(() => {
  t > 0 && uD()
}, [t])
```

因此，页面识别到保存的用户后会发签到 POST；OAuth 成功或页面导航成功本身不能证明签到成功。后续浏览器登录接入应核对账号身份并接收签到结果，避免页面已发请求后再盲目补发一次。AgentRouter 当时采用重新 OAuth 登录并消费回调 `checked_in` 的流程，不能直接套用其签到成功判据。

## Cookie 故障尚未定位

当时调查的 [#1663](https://github.com/qixing-jk/all-api-hub/issues/1663)、[#1559](https://github.com/qixing-jk/all-api-hub/issues/1559) 是 Cookie 认证下的 401 报告；[#1570](https://github.com/qixing-jk/all-api-hub/issues/1570) 是页面加载超时。它们不能证明同一个根因，也未区分会话过期、撤销、身份不匹配和 Cookie 注入失败。

已有按账号注入保存会话与获取 WAF Cookie 的机制，不能仅凭多账号相关 issue 标题推断功能缺失。后续实现应保留账号隔离，确认返回身份后再接纳新会话；当前 OAuth 身份不能服务保存账号时，应提供人工恢复路径。认证错误与页面、WAF、网络故障需要分别处理。

## 后续验证条件

需要重新检查部署包与公开配置，再验证真实 OAuth 回调、账号匹配、首次奖励、重复响应和多账号切换。公开源码只能证明页面调用关系，不能替代这些登录态验证。现有 [AnyRouter provider](../../src/services/checkin/autoCheckin/providers/anyrouter.ts) 仍是协议维护入口；没有真正只读状态接口前，签到 POST 不能用于被动发现或结果读回。
