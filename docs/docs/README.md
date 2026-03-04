---
home: true
title: 首页
heroImage: https://github.com/qixing-jk/all-api-hub/blob/main/src/assets/icon.png?raw=true
heroText: All API Hub - AI 聚合中转站管理器
tagline: "开源浏览器插件，统一管理第三方 AI 聚合中转站与自建 New API：自动识别账号、查看余额、同步模型、管理密钥，并支持跨平台与云端备份"
actions:
  - text: 开始使用
    link: /get-started.html # 建议修改为您的实际文档路径，例如 /guide/
    type: primary
    
  - text: Chrome 商店
    link: https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo
    type: secondary

  - text: Edge 商店
    link: https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa
    type: secondary

  - text: FireFox 商店
    link: https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}
    type: secondary

features:
  - title: 智能站点管理
    details: 自动识别 AI 聚合中转站点并创建访问令牌，智能获取站点名称和充值比例，支持重复检测和手动添加。
  - title: 多账号体系
    details: 支持每个站点添加多个账号，账号分组与快速切换，实时查看余额和详细使用日志。
  - title: 令牌与密钥管理
    details: 便捷管理所有 API Key，支持查看、复制、刷新和批量操作。
  - title: 模型信息查看
    details: 清晰展示站点支持的模型列表和价格信息。
  - title: 签到状态监控
    details: 自动检测哪些站点支持签到，并标记当天尚未签到的账号，让你在一个面板里按顺序完成多站点签到，减少因为忘记签到而浪费的免费额度。
  - title: 快速导出集成
    details: 一键导出配置到 CherryStudio 和 New API，简化 API 使用流程。
  - title: New API 类系统管理
    details: 支持对自建 New API 实例进行渠道管理和模型列表同步，并提供专门的渠道管理界面。
  - title: 数据备份恢复
    details: 支持 JSON 格式导入导出和 WebDav 云端备份，实现跨设备数据同步。
  - title: 全平台支持
    details: 兼容 Chrome、Firefox 浏览器，支持 Kiwi Browser 等移动端浏览器，适配深色模式。
  - title: 隐私与安全
    details: 完全离线运行，所有数据本地存储，无需联网即可使用全部核心功能。
  - title: Cloudflare 过盾助手
    details: 遇到五秒盾自动弹窗过盾，确保站点可被识别和记录。
  - title: 快速导出
    details: 一键导出站点配置到 CherryStudio、New API 与 CC Switch。

footer: AGPL-3.0 Licensed | Copyright 2025-present All API Hub
---

## 介绍

现在 AI 生态里有越来越多基于 New API 系列的聚合中转站和自建面板，要同时管理各站点的余额、模型列表和 API 密钥，往往既分散又费时。

All API Hub 作为浏览器插件，可以自动识别这些站点的账号，并一键查看余额、管理模型、密钥与自动签到，并为自建 New API 提供模型同步和渠道管理等工具。当前已支持基于以下项目的中转站账号：

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [Sub2API](https://github.com/Wei-Shaw/sub2api)（基本功能支持）
- Neo-API（闭源）
- Super-API（闭源）
- RIX_API（闭源，基本功能支持）
- VoAPI（闭源，老版本支持）
