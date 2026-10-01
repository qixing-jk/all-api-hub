# 01 — 注册 `omniroute` 站点类型与配置校验

- Status: resolved
- 归属：[spec.md](../spec.md) 切片 01
- 证据：[research.md](../research.md)（鉴权一节 + 「实测结果」）

## 目标

让用户能在设置里配置一个 OmniRoute 部署并得到可信的有效性判定；此后该站点出现在管理站点相关入口（设置页、渠道工作区的目标列表、console 跳转）里。

## 范围

- 站点类型注册：`SITE_TYPES.OMNIROUTE`、`MANAGED_ONLY_SITE_DEFINITIONS` 条目（`scopes: MANAGED_SCOPE`、`adapterFamily: Unsupported`、`managedResource.primaryKind: Channel`、`consoleRoutes.channels = "/dashboard/providers"`、`consoleRoutes.tokens = "/dashboard/api-manager"`、`labelKey`/`messagesKey`/`getStartedUrl`、表格与详情字段常量）。
- 配置类型 `OmniRouteConfig = { baseUrl, token }` 与持久化（`runtimeConfig` 联合项、`getManagedSiteRuntimePrincipal`、`hasManagedSiteRuntimeConfigInputForType`、`userPreferences`，必要时 preferences 迁移）。
- 设置页表单 `OmniRouteSettings`：baseUrl + 二选一输入（`oma_` 令牌 / 面板密码）。
- `checkValid` 与 `src/services/apiService/omniroute/auth.ts`：
  - 令牌路径：`GET /api/providers`（或更轻的 `GET /api/cli/whoami` 顺带读回作用域）。
  - 密码路径：`POST /api/cli/connect { password, name, scope: "admin" }` 换令牌，**只持久化换回的令牌**。
  - 三种失败语义分开报：凭据不对 / 令牌作用域不足（403 `Access token scope '<have>' is insufficient; '<need>' required.`）/ 部署仍是众所周知的默认密码（403，#14486）。
- i18n：`settings:managedSite.omniroute`、messages key、表单文案（含「密码只用于换令牌、不会保存」与「会在网关上创建一条名为 … 的访问令牌」）。

## 验收

- 有效 `admin` 作用域令牌 → 配置保存且 `checkValid` 为真。
- `write` 作用域令牌 → 明确提示作用域不足并说明需要重新铸 `admin` 令牌，**不是**笼统的凭据错误。
- 默认密码部署 → 提示「先在网关本机改掉默认密码」。
- 密码路径走完后，偏好里**只有令牌**，密码不落库（用测试断言，不靠人工检查）。
- 站点出现在设置页的托管站点列表里，console 链接指向 `/dashboard/providers`。

## 不做

- 任何渠道读写（切片 02/03）。
- 网关密钥工作区、模型同步、账户作用域（spec 的「能力边界」与开放问题）。
- 站点识别 hostname（默认不做，见 spec 开放问题 3）。

## 测试

按仓库约定先写失败测试：`auth.ts` 的三条错误语义映射、配置校验路径、偏好读写往返（含「不存密码」的断言）、i18n 抽取检查（动态 key 会被判未使用而删文案）。

## Answer

注册与配置全部落地。站点事实来源是 `src/services/accountSiteDefinitions/definitions.ts:737`：`MANAGED_SCOPE` + `Unsupported`、`primaryKind: Channel`、`consoleRoutes.channels = /dashboard/providers`、`consoleRoutes.tokens = /dashboard/api-manager`，配置落在 `userPreferences.omniroute`。

**比验收多拆了一档。** `validateOmniRouteCredential` 返回五种状态而不是「有效 + 三种失败」：`valid` / `invalid-credential` / `insufficient-scope` / `default-password-rejected` / `unreachable`。`unreachable` 单独拆出来是因为「网关连不上」和「凭据不对」的处置完全不同——混在一起会引导用户去换一个本来没问题的令牌。

**作用域判定用不着猜。** 先走 `GET /api/cli/whoami` 读回 `scope`（顺带确认 `viaAccessToken`），再用 `limit=1` 的 `GET /api/providers` 兼作连通性探测。两步都过才算 `valid`，所以「作用域够但网关不可达」不会被报成配置有效。

**密码路径只留令牌。** 公开的 `POST /api/cli/connect` 显式传 `scope: "admin"`、令牌名固定 `All API Hub`；`validateOmniRouteCredential` 只把铸出的令牌返回给调用方，设置页在验证成功后才写回这个令牌。表单 blur 不落库密码，用例锁在 `tests/features/BasicSettings/OmniRouteSettings.test.tsx`（「never persists a pasted password on blur」）。

验收逐条为真：令牌有效、`write` 令牌报到作用域不足（并回读 `Access token scope '<have>' is insufficient` 的缺额）、默认密码部署单独报「先在网关本机改掉密码」，证据在 `tests/services/managedSites/providers/omniroute.test.ts`。

i18n 的 `settings:omniroute.*` 与 `messages:omniroute.*` 按 8 语言同步（`pnpm i18n:status` 全 100%）。
