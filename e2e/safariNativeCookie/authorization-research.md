# Safari 原生 Cookie 请求：授权、撤权与既有产品经验

调研日期：2026-10-11。只读官方文档、上游实现与维护者说明；没有操作 Safari、读取凭据文件或修改产品代码。父任务的 proto3 本机隔离结果与 websiteDeny 失败是本轮实测输入，不把下列源码当成本机 Safari 二进制的证明。WebKit 固定提交 `9b61fb4887c1382b9f7918b6bed67d2a5e241ea2`；wBlock 固定 3.2.0 提交 `a57ee911dcaf063e4209e26dd256203dffa072b7`。不复制第三方实现源码。

## 1. Safari 网站 Deny 不能用 permissions.contains 代替

WebKit `permissionsContains` 调用 `hasPermissions`，后者检查 granted 集合/模式；具体 URL 的 `hasPermission(URL)` 则调用 `permissionState(URL)`，先检查具体域名 deny，再具体 grant，最后通配 deny/grant。因此广泛 grant 与具体网站 deny 并存时，contains=true 不代表该 URL 获准。[permissionsContains](https://github.com/WebKit/WebKit/blob/9b61fb4887c1382b9f7918b6bed67d2a5e241ea2/Source/WebKit/UIProcess/Extensions/Cocoa/API/WebExtensionContextAPIPermissionsCocoa.mm#L89)、[hasPermissions 与 URL permissionState](https://github.com/WebKit/WebKit/blob/9b61fb4887c1382b9f7918b6bed67d2a5e241ea2/Source/WebKit/UIProcess/Extensions/WebExtensionContext.cpp#L771)

新增 denied-pattern 不一定触发 JavaScript `permissions.onRemoved`：上游仅在 granted-pattern 移除时发该事件；其他模式变化会重新计算内容注入，并通知匹配标签页 URL/title 变化。可把 `tabs.onUpdated` 当作唤醒重检的信号，但它不是独立授权证明，也不覆盖没有打开标签页的目标。[权限变化事件实现](https://github.com/WebKit/WebKit/blob/9b61fb4887c1382b9f7918b6bed67d2a5e241ea2/Source/WebKit/UIProcess/Extensions/Cocoa/WebExtensionContextCocoa.mm#L675)

## 2. 没有找到 SafariWebExtensionHandler 可直接查询 Safari URL 授权的公开 API

Apple 确有 `WKWebExtensionContext.permissionStatus(for: URL)`，明确检查 denied/granted/requested；但此 context 是 WebKit 宿主加载的运行环境。Safari 18.4 发布说明把 WKWebExtension/WKWebExtensionContext/WKWebExtensionController 定位为在 WebKit-based browsers 集成扩展的 API。[WKWebExtensionContext](https://developer.apple.com/documentation/webkit/wkwebextensioncontext)、[Safari 18.4 发布说明](https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes)

没有找到从 Safari 所属 native handler 取得 Safari 已运行扩展 context 的公开入口；自行创建同资源的 WK context 不会自动连接 Safari 的授权数据库。SafariServices 的 `SFSafariExtensionManager` 返回 extension state，公开 `SFSafariExtensionState` 只包含 isEnabled，不是按 URL 的授权查询。本机 Xcode 27 SDK SafariServices 公开 headers 也未发现上述入口。结论是“本轮未找到”，不是证明 Apple 所有私有实现都不存在。[ExtensionManager](https://developer.apple.com/documentation/safariservices/sfsafariextensionmanager)、[isEnabled](https://developer.apple.com/documentation/safariservices/sfsafariextensionstate/isenabled)

Native messaging 官方提供 message 与 Safari 17+ 的 profileIdentifier；文档未提供可信目标 URL 授权票据。Cookie/URL/允许布尔值放入 JS 消息本身，不会让 Foundation 自动与 Safari 网站授权绑定。[官方 native messaging](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension)

## 3. 无 HTTP 授权探针：get 随机不存在 Cookie 有歧义，remove 更值得实测

`cookies.get({url, name:随机不存在名字})` **不能区分 Deny 与无 Cookie**：上游 fetchCookies 在无 URL 权限时成功返回空数组，cookiesGet 再返回 null；获准但名字不存在也返回 null。仅 Promise resolved/null 不是授权。[fetchCookies 与 cookiesGet](https://github.com/WebKit/WebKit/blob/9b61fb4887c1382b9f7918b6bed67d2a5e241ea2/Source/WebKit/UIProcess/Extensions/Cocoa/API/WebExtensionContextAPICookiesCocoa.mm#L79)

更合适的候选是 `cookies.remove({url:具体目标URL, name:扩展独有前缀+新UUID})`：上游先检查 `hasPermission(url)`，无权明确返回 host permission 错误；获准且不存在该名字则成功返回 null。不会发送 HTTP，也不用读真实 session Cookie。UUID 名字若碰巧真实存在仍可能删除它，必须独有命名、每次新 UUID，不应固定名字或删除真实 Cookie。[cookiesRemove 的显式权限检查](https://github.com/WebKit/WebKit/blob/9b61fb4887c1382b9f7918b6bed67d2a5e241ea2/Source/WebKit/UIProcess/Extensions/Cocoa/API/WebExtensionContextAPICookiesCocoa.mm#L185)

两者都需要 optional cookies；上游 IPC 检查该权限。Cookie API 还可能发起请求网站授权的流程，Ask 是否弹 UI、如何结束、实际 Safari 的 remove 返回语义均需本机验证；不能把源码上的成功/拒绝当作实机结果。[Cookie IPC gate](https://github.com/WebKit/WebKit/blob/9b61fb4887c1382b9f7918b6bed67d2a5e241ea2/Source/WebKit/UIProcess/Extensions/Cocoa/API/WebExtensionContextAPICookiesCocoa.mm#L74)、[requestPermissionToAccessURLs](https://github.com/WebKit/WebKit/blob/9b61fb4887c1382b9f7918b6bed67d2a5e241ea2/Source/WebKit/UIProcess/Extensions/Cocoa/WebExtensionContextCocoa.mm#L773)

## 4. 成熟产品分别管理 native 请求许可，不等于自动遵守 Safari Deny

Tampermonkey 官方 `@connect` 定义域名白名单、用户确认对话框及每脚本用户白名单；初始与最终 URL 都检查。维护者 derjanb 在 #2253 描述 Safari 自有 Swift 请求后备路径，`fetch:false` 当时启用；#2252 记录系统 HttpOnly Cookie 导入限制。这支持“原生传输 + 自有请求授权”的已有实践，没有证明它会同步 Safari websiteDeny 或立即取消所有在途 native 请求。[官方 @connect](https://www.tampermonkey.net/documentation.php?q=connect)、[维护者 #2253](https://github.com/Tampermonkey/tampermonkey/issues/2253)、[维护者 #2252](https://github.com/Tampermonkey/tampermonkey/issues/2252)

wBlock 3.2.0 原生请求会从持久脚本配置重新读取脚本是否允许、是否在页面启用和 `@connect`；JS 背景页使用 browser message 的 sender.url，不接受内容脚本随意提供 pageURL。原生层再次验证，redirect 按 connect 策略，跨 origin 去掉认证头。此处的 policy 是产品/脚本自己的规则；已读请求路径未调用 Safari 网站 URL 授权查询，也没有证明实时同步 Safari Deny。默认网页 Cookie 路径仍用浏览器 fetch credentials=include，特殊头才走 Cookie storage=nil 的 native 请求，不能推断两条路径行为相同。[wBlock JS 请求入口](https://github.com/0xCUB3/wBlock/blob/a57ee911dcaf063e4209e26dd256203dffa072b7/extension-src/background.js#L26968)、[native requestPolicy](https://github.com/0xCUB3/wBlock/blob/a57ee911dcaf063e4209e26dd256203dffa072b7/wBlockCoreService/WebExtensionRequestHandler.swift#L1457)、[connect/redirect policy](https://github.com/0xCUB3/wBlock/blob/a57ee911dcaf063e4209e26dd256203dffa072b7/wBlockCoreService/UserScript.swift#L270)

本产品应结合自己明确的账号/origin/native授权与实际 Safari 目标 URL 复查；用户在 Safari 选择 Deny 后仍以“另有 native allowlist”为由发送请求，与本轮目标不符。既有产品采用 native 不等于这一授权缺口已有成熟通用答案。

## 5. 可以随现有 Safari app 一起交付

官方 Safari extension app 模板就包含 native app extension 与 Swift handler；sendNativeMessage 只发送到同一 containing app 的 native extension，Safari 忽略 application.id。把原生网络实现打包进该 handler 可随现有 Safari app 安装/更新，架构上不需要用户另装 Chrome 式 native messaging host。仍需要 manifest nativeMessaging、sandbox outgoing client entitlement，以及现有 app 签名/发布流程；“同一包”不是不需发布 native app 更新。[创建 Safari extension](https://developer.apple.com/documentation/safariservices/creating-a-safari-web-extension)、[消息路由](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension)、[network.client](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.network.client)

## 6. 普通 credentials:include 与账号私有 Cookie 必须分别验证

URLSession ephemeral 默认是自己的内存 Cookie 仓库，不会自动获得 Safari 登录；设置 httpCookieStorage=nil 后更不能把它当作浏览器 credentials:include。普通请求若依赖网页当前账号，可保留浏览器请求路径，或在授权后的目标同源网页执行请求，分别测试浏览器 Cookie 语义，不能统一迁移到私有 native 请求。[Apple Cookie storage](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/httpcookiestorage)

上游 #260676 记录 Safari 扩展背景 fetch credentials:include 对 SameSite/Lax/Strict 或跨站政策的历史限制，维护者报告的 HttpOnly 导入也未证明现版本消失。官方 WebKit Cookie 政策建议第一方认证/OAuth 或符合 Storage Access API 的场景，并未提供扩展任意导出浏览器登录会话的通用保证。不得让用户关闭 ITP 当作修复，也不能把 synthetic SameSite=None/local HTTP 成功外推到所有真实站点。[WebKit issue #260676](https://bugs.webkit.org/show_bug.cgi?id=260676)、[官方 Cookie 政策](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)

## 最小可实测路径

1. 先做 random-name cookies.remove 的真实 Safari Allow/Deny/Ask/optional-cookies revoke/恢复矩阵。记录 resolved-null、明确拒绝、超时和 UI；服务端确认整个权限探针不发 HTTP。对比随机 cookies.get，直接证明 null 歧义。只用 localhost/独有合成 Cookie。
2. 若 remove 能可靠拒绝目标 Deny，再在每次 native dispatch 前和在途做具体 URL 探针；不确定、超时、optional revoke 或后台失联即关闭授权并 cancel native task。后台给有限时效、绑定账号/origin/请求ID/权限代次的授权，native 重新校验自己持有的账号/origin策略；不能持久缓存一个 permits=true。
3. 改变 Safari Websites 为 Deny 时记录：新请求是否 0 dispatch、已经发出的长请求是否取消、检测/取消延迟、是否仍发生后续 redirect 或重试；再验证 Allow 恢复、后台/extension/native restart。permissions事件与tab事件只用于加快复查。
4. 必须明确边界：JS 探针→IPC→URLSession 存在检查与发送的竞态，轮询不是与 Safari 授权原子绑定；网络已发送内容无法撤回。报告实际拒绝/取消与延迟，不宣称“Deny瞬间绝无字节”或源码已解决实机问题。若目标要求无法接受该竞态，则目前缺少公开 Safari/native 授权原子 API，保留保护并另找浏览器受管传输。
5. 私有账号 A/B 隔离和普通网页 C 登录分别运行；对 ordinary browser fetch 明确测试 Secure/HttpOnly/SameSite 和真实站点页面挑战。未验证的站点不作为透明 fallback；原生失败不退回 ambient credentials:include。
