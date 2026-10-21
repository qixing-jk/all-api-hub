# 原生密码登录：版本兼容依据

已合并：[PR #1724](https://github.com/qixing-jk/all-api-hub/pull/1724)、[兼容性修复 #1725](https://github.com/qixing-jk/all-api-hub/pull/1725)。本记录提炼当时的上游源码调查，供以后扩展原生页面识别时复用；版本表不代表这些部署均已完成真实账号登录。

## 已核实的原生页面差异

| 页面族 | 调查版本或修订 | 对识别逻辑有影响的事实 |
| --- | --- | --- |
| New API Semi | v0.8.0、v0.9.0、v0.10.0；`9f8a4ec05010da20704c1b55aa8b9af5630df72e` | 启用 OAuth 的部署可能先显示密码登录入口；核实过七种翻译。协议 checkbox 与法律链接关联，未同意时可能禁用提交。v0.8.0 使用 `LoginForm.js`，不能把不存在的 `.jsx` 下载错误页当源码。 |
| New API v1 | v1.0.0-rc.45；`55bb6b903c63fcddbf71740d7267b653fe1dbd47` | `web/src/features/auth/sign-in/components/user-auth-form.tsx`；协议控件是 `button#legal-consent[role=checkbox]`。提交按钮可用不代表协议已被接纳。 |
| Sub2API | v0.1.136、v0.1.185、v0.2.17；`b0a02a3304a0a78cdd003ddda1dd23ba02c03084` | `frontend/src/views/auth/LoginView.vue` 的 email/password 输入可以没有 name；显示密码、Passkey、OAuth 是普通 button。checkbox 使用 `#login-agreement-consent`；弹窗协议是另一条流程。 |
| AgentRouter | 当时保留的公开部署前端 | 采用旧式密码入口和原生请求，包括站点自己的验证 token。只有访客态表单预检，没有用真实密码证明完整登录。 |

上游导航：[New API](https://github.com/QuantumNous/new-api)、[Sub2API](https://github.com/Wei-Shaw/sub2api)。后续支持新版本时应重新核实对应修订的页面与请求，不能只扩大通用按钮匹配范围。

## 为什么保持原生流程

已存在但不认识、被禁用或有歧义的登录界面应交给用户，不能因识别失败改走 API 绕过它。识别已知入口后只点击一次；填入输入框通过原生事件通知 React/Vue。协议控件点击后须等待站点提交 checked/aria-checked 状态；调用 click 返回或按钮看起来可用，都不能代替协议接纳。

只处理核实的登录协议控件。营销、记住我、已勾选选项不随登录自动改变；未知或弹窗协议、CAPTCHA、2FA 留在原生页面处理。原生登录已经提交后不补发 API 登录；成功还需要核实目标账号身份，不能仅依据页面跳转。

维护入口：[表单与协议识别](../../src/services/accountLogin/passwordForm.ts)、[识别回归](../../tests/services/accountLogin/passwordForm.test.ts)、[浏览器流程](../../e2e/passwordLoginUi.spec.ts)。历史浏览器场景使用真实扩展和模拟站点页面；公开 AgentRouter 只验证空表单进入与零登录写入。它们不能证明各线上版本、Firefox 或隐私窗口都已用真实账号验证。
