# 快速导出站点配置

> 将已录入的聚合中转站账号，一键同步到 CherryStudio、CC Switch、New API、Claude Code Hub 等下游系统，避免重复输入 Base URL、密钥与模型列表。

## 支持目标

| 目标 | 方式 | 备注 |
|------|------|------|
| CherryStudio | 通过本地协议唤起客户端，自动填充 API 信息 | 需启动 CherryStudio 桌面端并授权 |
| CC Switch | 以 JSON/剪贴板格式输出，内置专用字段映射 | 需在 CC Switch 内使用导入功能粘贴内容 |
| 自建托管站点（New API / DoneHub / Veloera / Octopus / AxonHub / Claude Code Hub） | 调用目标后台管理接口，自动创建或更新 Channel / Provider | 需先在扩展中完成对应后台配置 |

## 前置配置

1. **站点同步**：先在插件中完成账号识别，确保密钥列表中存在可导出的 API。
2. **目标凭据**：
   - CherryStudio / CC Switch：无需额外配置，但需保持应用运行。
   - 自建托管站点：在「基础设置 → 自建站点管理」中选择目标类型并完成配置。
3. **模型列表**：若需白名单导出，可在「New API 模型同步」中预先筛选模型。

## 操作步骤

1. 打开插件 → **密钥管理**，在任意站点卡片中点击对应导出按钮；如需一次处理多个密钥，可先勾选密钥列表中的项目。
2. 选择目标平台：`CherryStudio` / `CC Switch` / `当前自建站点`。已勾选多个密钥时，可使用 **“批量导入到当前自管理站点”** 进入预览。
3. 根据提示完成授权：
   - CherryStudio：浏览器会提示是否打开桌面客户端，确认后自动完成。
   - CC Switch：生成 JSON 并复制到剪贴板，切换到 CC Switch 粘贴即可。
   - 自建托管站点：后台调用对应管理接口，将当前站点配置导入为 Provider / Channel。批量导入时会先展示每个密钥的目标渠道预览，并默认跳过已精确存在的渠道。
4. 在目标系统中确认渠道/供应商是否出现，并测试调用。

## 导出内容

| 字段 | 说明 |
|------|------|
| 站点名称 | 自动取自站点/账号备注，可在导出前修改 |
| Base URL | 使用账号的 `base_url`，确保包含协议前缀 |
| API Key | 取自密钥列表，若站点支持多密钥会逐个列出 |
| 模型列表 | 来自站点能力探测或 New API 模型同步结果 |
| 充值比例 | 用于 CherryStudio/CC Switch 的折算展示 |
| 分组/优先级 | 针对自建托管站点，可在导出面板中按目标后台能力调整 |

## 常见问题

| 问题 | 处理方式 |
|------|----------|
| 自建托管站点提示 401/403 | 确认后台凭据未过期，并已在插件中重新保存配置；必要时参考 [Cloudflare 过盾助手](./cloudflare-helper.md)。 |
| CherryStudio 无响应 | 检查是否已安装桌面端并允许浏览器唤起 `cherrystudio://` 协议。 |
| CC Switch 导入失败 | 将生成的 JSON 粘贴到官方导入对话框，若提示字段缺失，请更新 CC Switch 至最新版本。 |
| 模型列表为空 | 站点尚未返回模型数据，可先在插件内刷新模型列表或执行 New API 模型同步。 |

## 相关文档

- [New API 渠道管理](./new-api-channel-management.md)
- [New API 模型列表同步](./new-api-model-sync.md)
- [Cloudflare 过盾助手](./cloudflare-helper.md)
- [CLIProxyAPI 集成](./cliproxyapi-integration.md)
