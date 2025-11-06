<h4 align="center">
简体中文 | <a href="./README_EN.md">English</a>
</h4>

<hr/>

<div align="center">
  <img src="assets/icon.png" alt="All API Hub Logo" width="128" height="128">

# 中转站管理器 - All API Hub

**开源浏览器插件，自动识别并管理所有 AI 聚合中转站账号，查看余额、同步模型、管理密钥，支持跨平台和云端备份**

<p align="center">
<a href="https://github.com/qixing-jk/all-api-hub/releases">
  <img alt="GitHub version" src="https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat">
</a>
<a href="https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}">
  <img alt="Firefox Add-on" src="https://img.shields.io/amo/v/{bc73541a-133d-4b50-b261-36ea20df0d24}?label=Firefox&logo=firefoxbrowser&style=flat">
</a>
<a href="https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo">
  <img alt="Chrome Web Store" src="https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat">
</a>
<a href="https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa">
  <img alt="Microsoft Edge" src="https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat">
</a>
</p>

**[文档教程](https://qixing-jk.github.io/all-api-hub/) | [常见问题](https://qixing-jk.github.io/all-api-hub/faq.html)**

</div>

## 📖 介绍

目前市面上有大量 AI 聚合中转站点，每次查看余额、模型列表和密钥等信息都需要逐个登录，非常繁琐。
本插件可以自动识别并整合管理基于以下项目的 AI 聚合中转站账号：

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- Neo-API（闭源）
- Super-API（闭源）
- RIX_API（闭源，基本功能支持）
- VoAPI（闭源，老版本支持）

## ✨ 功能特性

- 🔍 **智能站点识别** - 自动识别 AI 聚合中转站点并创建访问 token，智能解析充值比例和站点配置，支持重复检测防止误添加
- 🏷️ **站点信息管理** - 多方式获取真实站点名称，支持签到状态检测和自动签到，可手动添加任意 AI 聚合中转站点
- 👥 **多账号管理** - 每个站点支持多个账号，账号分组与快速切换，余额和使用日志一目了然
- 🔑 **令牌与密钥** - 便捷的 API Key 查看与管理，支持快速复制和批量操作
- 🤖 **模型信息查看** - 查看站点支持的模型列表和价格信息
- 🔄 **New API 类系统管理**
    - 自动同步 New API 及其 fork 项目的渠道模型列表，持续与上游模型列表保持同步
    - 自动生成模型重定向，免去手动搜索与逐个配置，最大化利用渠道资源，提升模型可用性
- 🚀 **快速导出集成** - 一键导出配置到 [CherryStudio](https://github.com/CherryHQ/cherry-studio) 和 [New API](https://github.com/QuantumNous/new-api)，简化 API 使用流程
- ☁️ **数据备份恢复** - 支持 JSON 格式导入导出，WebDav 云端备份，跨设备数据同步
- 🌐 **全平台兼容** - 支持 Chrome、Firefox 浏览器，可在 Kiwi Browser 等移动端使用，支持深色模式自动切换
- 🔒 **隐私与安全** - 完全离线运行，所有数据本地存储，保护您的隐私安全

> [!NOTE]
> 最初基于 [One API Hub](https://github.com/fxaxg/one-api-hub) 开发，现已大幅重构扩展。数据格式保持兼容，支持直接导入


## 🖥️ 截图展示


<div style="display: flex; justify-content: center; gap: 20px; box-sizing: border-box; flex-wrap: wrap;">
  <figure>
    <img src="docs/docs/static/image/current-site-check.png" alt="current-site-check" style="width:49%;height:auto;">
    <img src="docs/docs/static/image/try-add-existing-site.png" alt="try-add-existing-site" style="width:49%;height:auto;">
    <figcaption style="text-align:center;">站点重复检测</figcaption>
  </figure>
</div>
<figure>
<img src="docs/docs/static/image/account-manage.png" alt="account-manage" style="height:auto;">
<figcaption style="text-align:center;">账户管理</figcaption>
</figure>
<figure>
<img src="docs/docs/static/image/model-list.png" alt="model-list" style="height:auto;">
<figcaption style="text-align:center;">模型列表</figcaption>
</figure>
<figure>
<img src="docs/docs/static/image/api-key-list.png" alt="api-key-list" style="height:auto;">
<figcaption style="text-align:center;">密钥列表</figcaption>
</figure>
<figure>
<img src="docs/docs/static/image/new-api-channel-sync.png" alt="new-api-channel-sync" style="height:auto;">
<figcaption style="text-align:center;">New API 模型同步</figcaption>
<figure>
<img src="docs/docs/static/image/import-and-export-setting.png" alt="import-and-export-setting" style="height:auto;">
<figcaption style="text-align:center;">导入导出</figcaption>
</figure>

## 🚀 安装使用

### Chrome 应用商店（推荐）
[🔗 前往下载](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo)

### Edge 应用商店（推荐）
[🔗 前往下载](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa)

### FireFox 应用商店（推荐）
[🔗 前往下载](https://addons.mozilla.org/firefox/addon/%E4%B8%AD%E8%BD%AC%E7%AB%99%E7%AE%A1%E7%90%86%E5%99%A8-all-api-hub/)

### 手动安装

1. 下载最新版本的扩展包
2. 打开 Chrome 浏览器，进入 `chrome://extensions/`
3. 开启 "开发者模式"
4. 点击 "加载已解压的扩展程序"
5. 选择解压后的扩展文件夹

## 🛠️ 开发指南

请参阅 [CONTRIBUTING](CONTRIBUTING.md) 以获取更多信息。

## 🏗️ 技术栈

- **框架**: [WXT](https://wxt.dev)
- **UI 库**: [React](https://reactjs.org)
- **样式**: [Tailwind CSS](https://tailwindcss.com)
- **组件**: [Headless UI](https://headlessui.com)
- **图标**: [Heroicons](https://heroicons.com)
- **状态管理**: React Context API
- **类型检查**: [TypeScript](https://typescriptlang.org)


## 🙏 致谢

- 感谢 [@AngleNaris](https://github.com/AngleNaris) 设计了项目 Logo 🎨
- [WXT](https://wxt.dev) - 现代化的浏览器扩展开发框架

---

<div align="center">
  <strong>⭐ 如果这个项目对你有帮助，请考虑给它一个星标！</strong>
</div>
