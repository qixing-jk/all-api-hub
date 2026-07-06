# dataeyesai

一个只监听本机回环地址的可视化渠道 Key 导入器。使用 New API 系统访问令牌连接站点后，可以明确选择复制已有同类型渠道、通过 New API 向供应商获取模型、使用 New API 内置模型或手动填写配置，再批量创建渠道。

批量写入默认使用“每条 Key 建立独立渠道”，工具采用有限并发逐个创建并定位渠道 ID，便于独立记录额度和用量。也可以选择 New API 原生 `multi_to_single`，一次请求把所有 Key 写入一个多 Key 渠道，由 New API 随机轮询，同时利用日志里的 Key 索引保留单 Key 用量统计。

发现同类渠道时，可以继续新建，也可以选择已有渠道：多 Key 渠道会追加新 Key，单 Key 渠道会在明确确认后替换原 Key，完成后自动启用渠道。更新已有渠道不会改动其模型或模型重定向。

可以保存并切换多个 New API 站点。每一批 Key 的渠道类型由用户明确选择，工具不会猜测 Key 来源。Key 和额度使用两个独立输入框并按行对应：额度框填写数字，不知道时填写 `x`，行数不一致时拒绝写入；AWS 等组合凭证可以在 Key 框原样填写。批量新建时每条 Key 对应一个独立渠道。工具会保存不含明文 Key 的导入台账，包括 Key 尾号、不可逆指纹、录入额度、目标站点、渠道和时间。能查询渠道余额时会据此估算消耗；多 Key 共用渠道或上游不支持余额查询时，不会伪造单 Key 消耗。

连接站点后会读取该 New API 的管理员分组列表。创建渠道时可选择一个或多个分组，工具会按当前站点校验分组，并同时写入 New API 的 `group` 和 `groups` 字段；默认选择 `default`。

## 运行

要求 Node.js 24+。

```bash
pnpm channel-importer
```

服务默认打开 `http://127.0.0.1:4179`。可通过 `CHANNEL_IMPORTER_PORT` 修改端口。

## 桌面安装包

GitHub Actions 会构建三个安装包：

- macOS Apple Silicon（M1/M2/M3/M4 等）：DMG
- macOS Intel：DMG
- Windows x64：NSIS EXE 安装程序

本机启动桌面开发版：

```bash
pnpm channel-importer:desktop
```

构建当前系统安装包：

```bash
pnpm channel-importer:package
```

安装包输出到 `tools/channel-key-importer/dist/`。推送后可在 GitHub Actions 手动运行 `dataeyesai desktop packages`，成功后会建立带三个安装包的预发布版本。

当前安装包尚未配置 Apple 和 Microsoft 付费代码签名证书，因此首次启动可能出现系统安全提示。应用本身仍固定监听随机本机回环端口，不对局域网或公网开放。

## 安全约束

- 服务固定监听 `127.0.0.1`，并校验 Host、Origin 和随机本地会话令牌。
- 公网 New API 默认要求 HTTPS。旧部署只有 HTTP 时，界面会显示显式风险开关；未勾选时不会发送管理员密码、Session、访问令牌或渠道 Key。
- 默认使用 New API 用户名和密码直接登录。密码只用于这一次登录请求，不写入浏览器、配置文件或日志；登录 Session 仅保存在本地服务内存中，服务关闭后失效。
- 渠道凭证只在内存预览中保存五分钟，创建或过期后立即移除。
- 启用两步验证、OAuth 或验证码的账号可改用系统访问令牌；网页开发版在 macOS 使用钥匙串，桌面安装版使用 Electron 对接的系统安全存储加密令牌。普通配置文件只保存目标地址和用户 ID。
- 日志、错误信息和浏览器响应均不返回完整 Key。
- 没有产品统计、远程日志或第三方前端资源。

## 渠道范围

渠道类型和值来自 New API 官方的 [`constant/channel.go`](https://github.com/QuantumNous/new-api/blob/main/constant/channel.go)，目前展示 54 种默认类型。模型发现使用 New API 管理接口 `POST /api/channel/fetch_models`，由目标版本执行对应渠道协议。

已收录厂商使用项目现有的 MIT 许可 [`@lobehub/icons`](https://github.com/lobehub/lobe-icons) 图标并从本机提供；无法准确归属官方厂商的兼容渠道保留字母徽标，避免误导。

Codex 订阅渠道需要在 New API 内完成 OAuth，Advanced Custom 需要高级配置，因此这两种类型会显示，但不会伪装成“只凭一个 Key”就能导入。Azure、AWS、VertexAI、火山引擎等来源可能要求组合凭证或额外部署信息，界面会展示提示，并原样把用户提供的凭证交给 New API 校验。

预览区包含模型工作台：可以补充模型、把“对外标准名”映射到“上游实际名”，也可以根据厂商前缀和日期后缀生成一组保守的名称建议。最终创建请求会把标准名加入 `models`，并按 New API 的 `标准名 → 实际名` 方向写入 `model_mapping`。手动新增、尚未配置倍率的模型可能需要在 New API 中启用自用模式或补充倍率/价格。

OpenRouter 会自动把唯一的 `供应商/模型` 变成 `模型 → 供应商/模型` 重定向，并且只把简洁模型名暴露到新渠道。若多个供应商返回相同的简洁模型名，工具会保留这些完整模型名，避免把请求静默路由到错误供应商。

云厂商按 New API 当前协议使用专用表单：AWS Bedrock 支持 `AccessKey|SecretAccessKey|Region` 与 `APIKey|Region` 两种模式并写入 `settings.aws_key_type`，还可把模型定向到系统或 Application Inference Profile ID/ARN；Vertex AI 支持服务账号 JSON 文件或 API Key，并把默认/模型专用地区写入 `other`；Azure 要求填写 Endpoint 和实际部署名称。这些渠道可以直接选择一个已配置好的同类型渠道，复制模型、重定向、地区、Base URL 和高级参数，只替换新 Key。OpenRouter 会自动按 `模型 → 供应商/模型` 写入重定向；存在同名冲突时保留完整名称。

渠道创建后，工具会调用 New API 的单渠道余额刷新接口。支持该能力的上游会显示当前剩余额度（统一为 USD），并把首次查询值保存在本机非敏感快照中，用于计算“导入后已消耗”。充值或赠送导致余额升高时，工具会停止推算消耗，避免展示错误数字。部分上游没有可用的账单/余额接口，此时界面会明确显示无法自动查询。

Key 台账的实时用量来自目标 New API 的管理员消费日志，并按站点配置、渠道 ID 和多 Key 索引统计；额度余额仍来自供应商支持的余额接口。两者统计口径分开显示，避免把 New API 网关计费误当成供应商账户余额。

## 测试

```bash
pnpm test:channel-importer
```

测试不会连接真实 New API，也不会发送真实凭证。
