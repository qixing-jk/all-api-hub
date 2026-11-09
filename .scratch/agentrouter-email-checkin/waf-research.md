# 阿里云 WAF 识别与浏览器验证处理

调查日期：2026-11-10。范围：官方 WAF/CAPTCHA 文档、WAFW00F 原始规则，以及本次部署的已脱敏响应特征。本文保留共享识别的依据和边界；线上验证结果见 [spec.md](spec.md)。

## 结论

可以在共享响应解析层、调用 `response.json()` 之前识别已收到的阿里云挑战页，包括 HTTP 200 的 HTML；但无法通过一次首页预检保证后续密码接口或 OAuth 回调不会再遇到挑战。官方规则可以按 URI、客户端与会话等条件生效，严格滑块要求每次命中规则都验证，因此“站点使用阿里云”“当前请求被挑战”“已完成验证”应分别表达。[官方自定义规则](https://help.aliyun.com/zh/waf/web-application-firewall-3-0/configure-custom-rules-to-defend-against-specific-requests)

上段共享解析位置是工程建议。本次部署观察到的响应为：`HTTP 200`、`text/html`，开头含 `meta[name="aliyun_waf_aa"]` 与 `meta[name="aliyun_waf_bb"]`，正文包含 `aliyunCaptcha-sliding-slider`。这是本次部署证据，尚未找到官方承诺这些 meta 名称为长期稳定公共协议。

## 识别信号及边界

| 信号 | 证据等级 | 可得结论与限制 |
| --- | --- | --- |
| 实际 HTML 中同时出现 `aliyun_waf_aa`、`aliyun_waf_bb` meta，并呈现挑战页内容 | 本次部署观察 | 可作为本部署 WAF 挑战的指纹，不应写成覆盖所有阿里云 WAF 的标准。应解析真实标签，避免把日志、文档或脚本文本中的名称误认成当前挑战。 |
| 当前页面可见、可操作的 `#aliyunCaptcha-sliding-slider` | 官方 CAPTCHA 组件结构 | 可识别阿里云滑块组件；该组件也可嵌入普通登录表单，不能单独推出是 WAF。源 HTML 仅包含 ID 的 CSS/JS 字符串也不能证明滑块已显示。[CAPTCHA 客户端 UI](https://help.aliyun.com/en/captcha/captcha2-0/user-guide/client-ui-description-and-custom-configuration) |
| `acw_sc__v2` / `acw_sc__v3` Cookie | 官方 WAF 行为 | 分别与通过 JS / 滑块验证有关；存在 Cookie 不等于当前业务请求成功，缺失也不能证明没有 WAF。[WAF Cookie 说明](https://help.aliyun.com/en/waf/web-application-firewall-3-0/web-application-firewall-3-0-security-compliance-instructions) |
| `acw_tc`、`ssxmod_itna` / `ssxmod_itna2` / `ssxmod_itna3` Cookie | 官方 WAF 行为 | 前者用于客户端跟踪，后者与 Bot SDK 浏览器指纹有关，适合作为相关产品线索，不能标记“正在等待验证”或“通过验证”。跟踪 Cookie 可由站长关闭。[WAF Cookie 说明](https://help.aliyun.com/en/waf/web-application-firewall-3-0/web-application-firewall-3-0-security-compliance-instructions) |
| WAFW00F 的 AliYunDun 指纹 | 开源工具原始规则 | 规则同时要求阿里云错误域名、指定 `alicdn.com/sd-base/static/.../image/405.png`、固定英文阻断提示以及 HTTP 405。该规则覆盖一种阻断页，无法识别本次 HTTP 200 挑战，不能照搬为唯一判据。[固定版本源码](https://github.com/EnableSecurity/wafw00f/blob/69fbe3956bba47a172cf87e40e9037535d32a130/wafw00f/plugins/aliyundun.py) |

## 官方支持的正常浏览器流程

官方区分 JS 验证、滑块、严格滑块：标准浏览器可自动执行 JS 验证；普通滑块需要成功完成交互，严格滑块对每个命中请求再次验证。普通 JS/滑块的默认放行时间为 30 分钟，但不能把默认值硬编码为本部署保证。[官方自定义规则](https://help.aliyun.com/zh/waf/web-application-firewall-3-0/configure-custom-rules-to-defend-against-specific-requests)

对 XHR/Fetch，阿里云提供站点侧 Web SDK 的异步响应组件：包装页面的 XHR、Fetch、Form，识别 WAF 返回的挑战，处理 JS 计算并带验证信息重新请求。它依赖 Cookie，可能与其他请求 hook 冲突。这是官方已有解决方式；集成配置属于站点方。[Web SDK 原理与兼容性](https://www.alibabacloud.com/help/en/waf/web-application-firewall-3-0/integrate-the-web-sdk-into-web-applications)

对扩展的建议是复用正常站点浏览器会话：

1. 检出挑战后进入明确的验证状态，保留请求属于哪个账号、浏览器会话和业务动作的信息。
2. 使用该会话中的站点页面加载，给原站脚本完成 JS 验证的机会；页面加载成功本身不是验证完成证据。
3. 若观察到可见滑块或其他人工验证码，保持页面可供用户完成，并进入手动验证分支。不能将脚本等待承诺为滑块会自动消失。
4. 用同一会话中的后续正常响应确认通行，再按业务流程继续；登录成功、签到成功各自还需自己的权威后置状态。不要把 Cookie、SDK 回调或页面标题当作业务成功。

上述步骤是基于官方浏览器/SDK 行为提出的工程方案，尚未证明项目现有临时窗口、隔离登录上下文与所有调用方完全兼容。后台或隔离世界发出的 fetch 不应被假定必然经过站点页面的 SDK hook，须检查请求实际执行上下文。首页通过也不保证另一个路径的密码 POST 可通行。对可能已提交的业务写操作，应先核对业务结果，不能因响应异常自动重复提交。

## OAuth 与密码登录为何可能不同

可支持的解释是请求路径和浏览器流程不同：OAuth 往往经过页面导航、重定向与页面脚本；密码登录若直接请求 JSON API，收到 HTML 挑战时不会因为调用了 `fetch` 就自动运行其中的验证。浏览器页面中的站点 SDK 可能进一步处理异步挑战。这个差异符合官方机制，但具体是否发生，仍须以本项目调用链和本次请求证据确认。[Web SDK 原理](https://www.alibabacloud.com/help/en/waf/web-application-firewall-3-0/integrate-the-web-sdk-into-web-applications)

因此不能说 OAuth 自带 WAF 豁免，也不能认为更换为真实浏览器就永久解决：规则范围、客户端状态和 Cookie 都可能不同，官方 SDK 还明确采集浏览器环境与自动化探针信息。[规则条件](https://help.aliyun.com/zh/waf/web-application-firewall-3-0/configure-custom-rules-to-defend-against-specific-requests)、[SDK 采集说明](https://www.alibabacloud.com/help/en/waf/web-application-firewall-3-0/integrate-the-web-sdk-into-web-applications)

## 后续验收边界

共享检测至少应覆盖本次 HTTP 200 HTML、普通 JSON、包含阿里云脚本但未触发挑战的正常页、仅 CSS/JS 引用滑块 ID、实际可见滑块，以及其他供应商已有行为。真实浏览器还需分别验证自动 JS 完成、人工滑块停留/继续，以及原业务成功状态；单元测试不能证明线上通行。官方资料与 WAFW00F 没有提供所有部署统一、永不过期的指纹或保证自动通过的方案。

上述资料在调查日期核实；WAFW00F 规则固定于 `69fbe3956bba47a172cf87e40e9037535d32a130`，未对目标站点执行 WAF 探测载荷。本文不含 Cookie 值或认证材料。
