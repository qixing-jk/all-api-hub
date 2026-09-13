# Cookie 账号隔离风险记录

日期：2026-09-14。调查基线：main `1b53f6b73`，开始时已 fetch，和 origin/main 相同。

## 当前处置

已知风险保留，生产修复暂缓。
首次请求 DNR 和额外响应身份校验均不属于当前待实施任务。

决策依据：用户实际体验通常是一次身份不一致的失败请求，而非静默串账号。
尚未验证线上发生比例；前移 DNR 会引入正常网页请求匹配、同目标并发、权限失败和异常规则清理的额外风险，当前证据不足以确认总体可靠性收益。
这项决定不代表风险已消除，也不代表所有站点都会拒绝错账号请求。

重新评估条件：真实站点出现静默串账号，或失败回退明显影响正常使用。
届时先复现目标部署的实际行为，再比较收益和隔离成本。

## 已确认的产品风险

使用真实 Chromium 145.0.7632.6、实际构建的扩展和本地 HTTP 服务复现。
未替换 fetch、DNR、Cookie API 或临时窗口消息；仅使用虚构账号及独立浏览器配置。

| 浏览器 Cookie | 扩展保存账号 | 服务端实际身份 | 刷新后保存的余额 |
| --- | --- | --- | --- |
| A | B / 用户 202 | A；New-Api-User 仍为 202 | 33000（A 的余额，错误） |
| B | B / 用户 202 | B；New-Api-User 为 202 | 44000（B 的余额，正确） |

扩展中的 B 用户 ID 和用户名保持不变，但余额被 A 的返回值覆盖。
原始失败断言为 Expected 44000 / Received 33000。对照实验只切换浏览器 Cookie。
临时窗口回退已启用，成功的主请求没有进入该回退，因此不是临时窗口规则清理造成的这次失败。

代码证据：

- `src/services/apiTransport/request.ts` 的 createRequestHeaders 对保存 Cookie 仅做 best-effort 请求头赋值。
- createAuthRequest 对 Cookie 认证设置 credentials: include，浏览器仍会选择自身 Cookie。
- 默认 forceTempWindow 条件不包含普通保存 Cookie 账号。
- `src/services/apiService/newApiFamily/default/accountRefresh.ts` 接受成功的 fetchAccountData 结果；上述真实刷新流程证明错误余额可进入保存账号。

浏览器规则依据：[Fetch forbidden request-header](https://fetch.spec.whatwg.org/#forbidden-request-header) 包含 Cookie。
[Chrome DNR](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) 提供独立的请求头修改能力；现有产品 DNR Cookie 路径主要针对临时标签页。

边界：本地服务按 Cookie 决定身份，故意不把 New-Api-User 当作身份一致性保护。
这证明扩展主请求没有可靠实现保存 Cookie 隔离，并不证明每个线上 New API 版本都允许错账号请求成功。
校验用户 ID 与会话一致性的部署可能拒绝请求；本轮没有用线上真实账号执行写操作，也没有验证线上部署覆盖范围或 Firefox。

## 复现方法

仓库跟踪本报告；诊断脚本、独立 Playwright 配置和原始日志保留在调查者本地，未纳入版本控制。
新检出可按以下步骤重建实验，不依赖这些本地文件：

1. 用独立 Chromium 配置加载扩展，启用 Cookie 认证所需权限及临时窗口回退。
2. 启动回环 HTTP 服务，为账号刷新接口提供响应；按 Cookie 区分 A（用户 201、余额 33000）和 B（用户 202、余额 44000），不校验请求用户 ID 与 Cookie 是否一致。
3. 在扩展保存 B 的 Cookie、用户 ID 和初始余额 0，在浏览器 Cookie 存储中设置 A 的会话。
4. 从账号列表刷新 B，断言保存余额应为 44000，同时记录服务端实际会话身份与请求用户 ID。已观察到服务端身份 A、请求用户 ID 202、保存余额 33000。
5. 仅把浏览器会话改为 B，再刷新同一保存账号；已观察到服务端身份 B、保存余额 44000。
