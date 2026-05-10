# 快速上手

只需几分钟，即可开启你的 AI 资产智能管理之旅。All API Hub 能帮你自动同步额度、每日签到、并一键集成到常用的 AI 工具中。

## 1. 安装插件

为了获得最佳体验（包括自动更新），我们**强烈推荐从各浏览器官方商店安装**。

| 渠道 | 下载链接 | 当前版本 | 用户数 |
|------|----------|----------|--------|
| Chrome 商店 | [Chrome 商店](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/lapnciffpekdengooeolaienkeoilfeo?label=Chrome%20Users)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| Edge 商店 | [Edge 商店](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge Add-ons Users](https://img.shields.io/badge/dynamic/json?label=Edge%20Users&query=$.activeInstallCount&url=https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/pcokpjaffghgipcgjhapgdpeddlhblaa)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| Firefox 商店 | [Firefox 商店](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Mozilla Add-on Users](https://img.shields.io/amo/users/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox%20Users)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |
| GitHub Releases | [查看全部版本](https://github.com/qixing-jk/all-api-hub/releases) | [![GitHub version](https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat)](https://github.com/qixing-jk/all-api-hub/releases/latest) | [![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/qixing-jk/all-api-hub/total?label=Total%20Downloads)](https://github.com/qixing-jk/all-api-hub/releases) |

<details>
<summary>📦 需要手动安装、Safari 或手机端？（点击展开）</summary>

- **GitHub Release**：无法访问商店时，可前往 [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases) 下载正式版或 Nightly 版。
- **Safari (Mac)**：需要通过 Xcode 安装，详见 [Safari 安装指南](./safari-install.md)。
- **QQ / 360 等**：支持 Chromium 内核浏览器手动加载，详见 [手动安装指南](./other-browser-install.md)。
- **移动端**：支持 Edge 手机版、Firefox Android、Kiwi 等，详见 [移动端 FAQ](./faq.md#mobile-browser-support)。

</details>

<a id="add-site"></a>
## 2. 添加你的第一个账号

这是使用插件最核心的一步。**强烈建议使用“自动识别”功能**，它像扫码登录一样简单。

### 2.1 自动识别（推荐）

::: tip 第一步
先在浏览器里打开并登录你的 AI 中转站网站。
:::

1. 点击浏览器右上角的插件图标，打开主页面。
2. 点击 **`新增账号`**。
3. 在弹出的对话框中输入该站点的网址。
4. 点击 **`自动识别`**。
5. 确认信息无误后，点击 **`确认添加`**。

> **过盾提示**：如果站点有 Cloudflare 验证（五秒盾），插件会自动弹出窗口协助过盾，验证通过后会自动继续识别。

<a id="manual-addition"></a>
### 2.2 手动添加（备选）

如果自动识别不成功，或者你想精确控制，可以手动填写：
- **用户名 / ID**：站点显示的名称。
- **访问令牌 (Access Token)**：通常在站点的“设置”或“令牌”页面可以找到。
- **模式选择**：默认推荐 `Access Token` 模式。

---

## 3. 支持的站点类型

All API Hub 几乎支持市面上所有主流的 AI 中转站架构，包括：
- **One API / New API** 系列（最常见）
- **Sub2API**
- **AIHubMix**
- **AnyRouter / VoAPI / Super-API** 等特色架构

::: tip 兼容性提示
只要是基于以上开源系统搭建的站点，通常都能完美支持。完整的兼容列表请查看 [支持的站点与系统类型](./supported-sites.md)。
:::

<a id="quick-export-sites"></a>
## 4. 快速导出与集成

添加账号后，你可以一键将这些配置“推”给其它 AI 工具，再也不用手动复制粘贴。

1. 进入 **`密钥管理`** 页面。
2. 找到你想导出的 Key，在菜单中选择 **`导出到 CherryStudio`**、**`导出到 CC Switch`** 等。
3. 你的 AI 客户端会自动唤起并完成配置。

> 完整列表请查看 [支持的导出工具与集成目标](./supported-export-tools.md)。

---

## 5. 核心功能深入指南

### 📊 资产看板与统计
- **[资产总览与实时刷新](./auto-refresh.md)**：集中查看多站余额、用量与健康状态。
- **[余额历史记录](./balance-history.md)**：直观呈现资产变动趋势。
- **[用量统计分析](./usage-analytics.md)**：多维度分析消耗、模型分布与延迟。

### 🔑 密钥管理与快捷集成
- **[令牌管理](./key-management.md)**：集中管理站点令牌，支持一键补全。
- **[独立 API 凭证](./api-credential-profiles.md)**：无需账号保存 URL+Key，支持批量验证。
- **[网页 API 嗅探](./web-ai-api-check.md)**：在网页内快速识别并测试 API 配置。

### ⚡ 自动化与信息追踪
- **[自动签到流](./auto-checkin.md)**：每天自动帮你完成所有站点的签到。
- **[网站公告](./site-announcements.md)**：后台抓取已添加站点的公告，集中查看维护、模型变更、价格调整等消息。
- **[兑换助手](./redemption-assist.md)**：自动识别网页兑换码并一键领取。
- **[书签收纳管理](./bookmark-management.md)**：集中收藏控制台、文档、充值入口。

### 🛡️ 稳定性与安全防护
- **[Cloudflare 过盾助手](./cloudflare-helper.md)**：协助通过验证，确保刷新、签到不中断。
- **[WebDAV 同步与加密](./webdav-sync.md)**：支持跨设备加密备份，数据永不丢失。

### 🔔 通知渠道
- **[任务通知](./task-notifications.md)**：在 **`设置 → 通用 → 通知`** 中开启，可通过浏览器系统通知、Telegram Bot、飞书机器人、钉钉机器人、企业微信机器人、ntfy 或通用 Webhook 接收后台任务结果提醒。

### 🛠️ 自建站点运营工具
- **[自建站点管理](./self-hosted-site-management.md)**：在插件内直接对渠道进行增删改查。
- **[模型同步与重定向](./managed-site-model-sync.md)**：批量同步上游模型，配置映射逻辑。

---

## 6. 其他说明

- [常见问题 FAQ](./faq.md)
- [更新日志](./changelog.md)
- [权限说明](./permissions.md)
- [数据导入导出](./data-management.md)
