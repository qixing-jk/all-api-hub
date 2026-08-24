# 添加账号

> 本文介绍如何通过自动识别、手动填写或书签导入，把 AI 站点账号添加到 All API Hub。添加完成后的整理、排序和批量操作，请查看 [账号管理](./account-management.md)。

## 1. 自动识别（推荐）

这是最简单的添加方式。请先在浏览器中登录目标站点，然后：

1. 点击 **“新增账号”**。
2. 填写站点的 **网站 URL**。
3. 点击 **“自动识别”**。
4. 插件会尝试识别站点类型和当前登录账号，并自动补全所需信息。
5. 确认信息无误后保存账号。

如果站点有 Cloudflare 验证，插件会打开辅助窗口；完成验证后会继续识别。自动识别失败时，可参考 [常见问题](./faq.md) 排查登录状态、认证方式和站点兼容性，也可以改用下面的手动添加方式。

<a id="manual-addition"></a>
## 2. 手动添加

不同站点类型需要填写的信息及其获取位置可能不同。下面按站点类型分别介绍如何手动添加账号。

> **站点类型**为可选项：可以不选择；未选择时仍然可以保存账号，站点类型会先记录为 `unknown`，后续刷新或识别仍可能自动补全。

快速跳转：

- [New API](#manual-new-api)
- [Sub2API](#manual-sub2api)
- [OpenRouter](#manual-openrouter)

<a id="manual-new-api"></a>
### 2.1 New API

> 不同 New API 二开站点的页面布局、按钮名称和功能位置可能存在差异，请以实际网站界面为准。

1. 登录你的 New API 网站。
2. 点击浏览器右上角的 **All API Hub** 扩展图标。建议以侧边栏方式打开，方便后续对照填写。
3. 点击 **“新增账号”**，使用当前站点地址或手动填写地址。
4. 点击 **“手动添加”**。

   ![点击“新增账号”](./static/image/manual/new-api/add-account.png)

5. 在表单中填写以下信息，点击字段名称可以跳转到下方对应的填写说明：

   - [**网站名称**](#manual-new-api-site-name)
   - [**站点类型**](#manual-new-api-site-type)
   - [**用户名、用户 ID**](#manual-new-api-user-id)
   - [**访问令牌**](#manual-new-api-access-token)

   <a id="manual-new-api-site-name"></a>

   **网站名称**：用于在插件中区分账号，可以自定义。

   <a id="manual-new-api-site-type"></a>

   **站点类型**：选择 `new-api`。

   ![手动添加账号表单](./static/image/manual/new-api/account-form.png)

   <a id="manual-new-api-user-id"></a>

   **5.1 怎么获取用户名与用户 ID**

   登录 New API 网站后，进入“个人资料 / 个人信息”页面，在该页面可以看到用户名与用户 ID。

   ![个人资料中的用户名与用户 ID](./static/image/manual/new-api/profile-user-info.png)

   <a id="manual-new-api-access-token"></a>

   **5.2 怎么获取访问令牌**

   进入 New API 网站的个人资料页面后向下滚动，在“安全”栏目中找到“访问令牌”，点击即可生成 / 获取访问令牌。请注意，这里的访问令牌不是“令牌管理”中用于调用模型的 API Key。

   ![“安全”栏目中的访问令牌](./static/image/manual/new-api/access-token.png)

6. 填写 **充值金额比例**（`CNY/USD`，需大于 0）后即可保存账号。具体充值比例请前往实际使用的网站查询，再填写该网站对应的实际比例。

   ![填写充值金额比例](./static/image/manual/new-api/exchange-rate.png)

::: tip 填写建议
优先使用 **访问令牌认证**。如果保存后无法刷新账号，请先检查站点类型、用户 ID 和访问令牌是否填写正确；只有目标站点明确需要时，再尝试 Cookie 认证。
:::

::: warning 保护账号信息
访问令牌和 Cookie 都属于敏感信息。请勿将完整内容发给他人，也不要在公开截图或问题反馈中暴露这些信息。
:::

<a id="manual-sub2api"></a>
### 2.2 Sub2API

> 不同 Sub2API 站点的页面布局、按钮名称和功能位置可能存在差异，请以实际网站界面为准。
> Sub2API 的访问令牌保存在浏览器本地存储中，且登录令牌有时效，建议优先使用 **自动识别**（见第 1 节）方式添加；如需手动添加，请参考以下步骤。

1. 登录你的 Sub2API 网站。
2. 点击浏览器右上角的 **All API Hub** 扩展图标。建议以侧边栏方式打开，方便后续对照填写。
3. 点击 **“新增账号”**，使用当前站点地址或手动填写地址。
4. 点击 **“手动添加”**。

   ![点击“新增账号”](./static/image/manual/sub2api/add-account.png)

5. 在表单中填写以下信息，点击字段名称可以跳转到下方对应的填写说明：

   - [**网站名称**](#manual-sub2api-site-name)
   - [**站点类型**](#manual-sub2api-site-type)
   - [**用户 ID**](#manual-sub2api-user-id)
   - [**访问令牌**](#manual-sub2api-access-token)

   <a id="manual-sub2api-site-name"></a>

   **网站名称**：用于在插件中区分账号，可以自定义。

   <a id="manual-sub2api-site-type"></a>

   **站点类型**：选择 `sub2api`。

   ![手动添加账号表单](./static/image/manual/sub2api/account-form.png)

   <a id="manual-sub2api-user-id"></a>

   **5.1 怎么获取用户 ID**

   Sub2API 的个人资料页面只显示用户名和邮箱，不会直接显示数字用户 ID，需要通过开发者工具获取：

   1. 登录 Sub2API 网站后，按 `F12` 打开开发者工具。
   2. 切换到 **Network（网络）** 标签，按 `F5` 刷新页面。
   3. 在请求列表中找到 `auth/me` 请求，点击打开它的 **Response（响应）**。
   4. 在 `"data"` 中找到 `"id"` 字段，该数字就是你的用户 ID。

   > 备选方式：在开发者工具中选择 **Application（应用）** → **Local Storage** → 站点域名，找到 `auth_user`，其中的 `id` 字段也是你的用户 ID。

   <a id="manual-sub2api-access-token"></a>

   **5.2 怎么获取访问令牌**

   Sub2API 的访问令牌保存在浏览器本地存储中，页面不会直接显示，需要通过开发者工具获取：

   1. 登录 Sub2API 网站后，按 `F12` 打开开发者工具。
   2. 切换到 **Application（应用）** → **Local Storage** → 站点域名。
   3. 找到 `auth_token`，复制它的值（一长串以 `eyJ` 开头的字符串），这就是访问令牌。

   > 请注意，这里的访问令牌用于登录站点，不是“API 密钥”页面中用于调用模型的 API Key，两者不要混淆。

   ::: warning 令牌时效与托管会话
   Sub2API 的访问令牌有时效。若希望插件在后台独立续期，请按以下步骤导入或填写 `refresh_token`：

   1. 建议先在无痕 / 隐私窗口登录目标 Sub2API 站点。
   2. 在账号表单中开启 **“插件托管会话（多账号）”**。
   3. 点击随后出现的 **“从当前登录账号导入”**。插件会从该站点当前登录会话的 Local Storage 读取 `refresh_token`，并同时补全可读取的访问令牌、用户 ID 和用户名。
   4. 如果自动导入失败，也可以在开发者工具的 **Application（应用）** → **Local Storage** → 站点域名中复制 `refresh_token`，粘贴到表单的 **“Refresh Token”** 输入框。
   5. 确认 Refresh Token 已填入后保存账号，再关闭用于导入的无痕 / 隐私窗口，避免控制台与插件并行轮转同一个 Refresh Token。

   开启托管但没有填写 Refresh Token 时无法保存。未开启托管时，插件不会保存刷新令牌；只有浏览器仍登录对应账号时，刷新过程中才可能通过临时窗口重新同步，登录态失效后仍需重新登录或更新凭据。
   :::

6. 填写 **充值金额比例**（`CNY/USD`，需大于 0）后即可保存账号。

   自动识别会优先读取站点提供的充值换算配置；只有站点没有提供有效数据时，才回退为 **7.2**。你也可以按实际充值比例手动调整。该值只用于余额换算显示，不影响账号功能。

   ![填写充值金额比例](./static/image/manual/sub2api/exchange-rate.png)

::: tip 填写建议
Sub2API 仅支持 **访问令牌认证**（不支持 Cookie 模式），请优先使用 **自动识别** 添加账号，插件会自动读取令牌并补全用户 ID。如果保存后无法刷新账号，请先检查站点类型、用户 ID 和访问令牌是否填写正确。
:::

::: warning 保护账号信息
访问令牌属于敏感信息，请勿将完整内容发给他人，也不要在公开截图或问题反馈中暴露这些信息。
:::

<a id="manual-openrouter"></a>
### 2.3 OpenRouter

1. 登录你的 OpenRouter 网站。
2. 点击浏览器右上角的 **All API Hub** 扩展图标。建议以侧边栏方式打开，方便后续对照填写。
3. 点击 **“新增账号”**，使用当前站点地址或手动填写地址。
4. 点击 **“手动添加”**。

   ![点击“新增账号”](./static/image/manual/open-router/add-account.png)

5. 在表单中填写以下信息，点击字段名称可以跳转到下方对应的填写说明：

   - [**网站名称**](#manual-openrouter-site-name)
   - [**站点类型**](#manual-openrouter-site-type)
   - [**访问令牌**](#manual-openrouter-access-token)

   <a id="manual-openrouter-site-name"></a>

   **网站名称**：用于在插件中区分账号，可以自定义。

   <a id="manual-openrouter-site-type"></a>

   **站点类型**：选择 `openrouter`。

   ![手动添加账号表单](./static/image/manual/open-router/account-form.png)

   <a id="manual-openrouter-access-token"></a>

   **5.1 怎么获取访问令牌**

   进入 OpenRouter 网站的控制台页面后，找到 **“Management Keys”**，点击右上角 **“+ New Key”**，填写对应表单后，点击 **“Create”**，然后点击复制你的新 API Key，填入插件中的 **“OpenRouter 管理密钥”**。

   > 注意：该 Key 只能明文显示一次，若丢失请重新创建并填入。

   快捷跳转网站：[https://openrouter.ai/settings/management-keys](https://openrouter.ai/settings/management-keys)

   ![Management Keys 中的管理密钥](./static/image/manual/open-router/management-key.png)

6. 填写 **充值金额比例**（`CNY/USD`，需大于 0）后即可保存账号。该值用于把美元余额换算为人民币显示，可按你希望使用的换算比例填写，不影响 OpenRouter 账号或计费。

   ![填写充值金额比例](./static/image/manual/open-router/exchange-rate.png)

::: tip 填写建议
OpenRouter 固定使用 **Management Key（访问令牌）** 认证，用户 ID 无需填写，也不支持 Cookie 模式。如果保存后无法刷新，请确认密钥来自 OpenRouter 的 Management Keys 页面；现有密钥的明文无法再次显示，需要新建后立即复制。
:::

::: warning 保护账号信息
Management Key 属于敏感信息。请勿将完整内容发给他人，也不要在公开截图或问题反馈中暴露。
:::

## 3. Cookie 模式

对于某些对接口保护较严或经过特殊定制的站点，如果 Access Token 模式无法工作，可以尝试切换到 **“Cookie 模式”**。在此模式下，插件将利用你当前的登录会话（Cookie）来请求数据。

Cookie 可能过期，也不适用于所有站点。请先使用自动识别和访问令牌认证；只有目标站点明确需要时，再切换到 Cookie 模式。

## 4. 从书签批量导入

如果你用浏览器书签收藏了各个中转站点，可以通过“从书签批量导入”快速扫描并批量生成账号候选：

- 入口位于账号管理页顶部，以及“新增账号”对话框内（显示为“从书签导入账号”）。
- 书签访问属于**可选权限**，只有在用户授权后，插件才能读取浏览器书签。
- 导入流程为：

  > 授权 → 读取书签树 → 选择范围 → 扫描并生成候选账号 → 预览 → 导入 → 结果汇总

- 已有账号默认跳过，不会重复导入。
- 导入完成后会分别汇总成功、失败和跳过的条目；已有账号默认计入跳过结果。
- 导入失败的条目可以通过“打开添加账号”继续处理。

## 5. 优化添加体验

在 **“设置 → 基础设置 → 账号管理”** 中，你可以开启以下功能来提升添加账号的效率：

- ⚡ **自动填充当前页面 URL**：开启后，点击“新增账号”时会自动填入当前浏览器标签页的网址，省去手动复制。
- 🔑 **添加后自动创建默认令牌**：开启后，在成功添加账号后，插件会自动尝试在站点后端为你创建一个默认的 API 密钥（Token），方便你直接导出使用。
  - **AIHubMix**：AIHubMix 的 API 密钥完整内容只会在创建时显示一次。添加新的 AIHubMix 账号后（不含“配置到托管站点”流程），插件会先检查该账号是否已有令牌；如果已有令牌，会跳过创建提示；如果没有令牌，会弹出确认对话框，询问是否立即创建默认密钥并展示一次性完整密钥；如果取消，需要之后在“密钥管理”中手动创建并立即保存完整密钥。
- ⚠️ **添加重复账号时提醒**：当尝试添加一个已存在的站点（相同 URL）时，插件会弹出确认提示，防止误加重复账号。你可以选择继续本次添加、取消操作，或直接关闭后续重复账号提醒并继续本次添加。

::: tip 全新 profile 的默认状态
以上开关在全新 profile（未配置过的账号设置）中的默认状态如下：

- 自动填充网址：关闭
- 添加后自动创建默认令牌：关闭
- 添加重复账号时提醒：开启
- 排序优先级：10 项默认全部开启

这是全新 profile 的默认状态，不代表你修改设置之后仍会保持这些状态。
:::

## 相关文档

- [账号管理](./account-management.md)
- [快速上手](./get-started.md)
- [支持的站点与系统类型](./supported-sites.md)
- [常见问题](./faq.md)
