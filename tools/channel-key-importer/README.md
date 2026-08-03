# dataeyesai

一个只监听本机回环地址的可视化渠道 Key 导入器。使用 New API 系统访问令牌连接站点后，可以明确选择复制已有同类型渠道、通过 New API 向供应商获取模型、使用 New API 内置模型或手动填写配置，再批量创建渠道。

界面按任务拆成五个独立工作区：导入渠道、定时任务、用量监测、上 Key 记录和站点设置。每个工作区只展示完成当前任务需要的信息，顶部目标站点状态可随时进入站点设置。视觉采用平面的运营工具风格，统一使用清晰的无衬线数字，并在导入首页使用随安装包提供的本地流程插画；页面不加载外部图片、字体或第三方前端资源。

批量写入默认使用“每条 Key 建立独立渠道”，工具串行提交渠道，并在整批提交后用分页列表统一定位渠道 ID，避免为每条 Key 再发一次搜索请求。若 New API 返回明确的 429，当前项和尚未提交的 Key 会立即停止请求，以 AES-GCM 加密后进入自动续传队列；已经成功的项不会重发。程序优先遵循上游 `Retry-After`，未提供时默认等待 180 秒，可用 `DATAEYESAI_RATE_LIMIT_FALLBACK_SECONDS` 调整。也可以选择 New API 原生 `multi_to_single`，一次请求把所有 Key 写入一个多 Key 渠道，由 New API 随机轮询，同时利用日志里的 Key 索引保留单 Key 用量统计。

点击导入按钮时只进行识别和预览，不会立即写入。预览弹窗会显示原始数量、去重后数量、跳过的重复数量和录入总额度，管理员核对后再手动确认。系统会同时跳过当前粘贴内容中的重复 Key、该 New API 站点已经录入的 Key，以及仍在定时队列中的 Key；真正写入前还会再次检查，避免并发操作造成重复渠道。上 Key 记录按每次操作分批展示，并可展开按序号核对该批次中的每一条 Key。

发现同类渠道时，可以继续新建，也可以选择已有渠道：多 Key 渠道会追加新 Key，单 Key 渠道会在明确确认后替换原 Key，完成后自动启用渠道。更新已有渠道不会改动其模型或模型重定向。

可以保存并切换多个 New API 站点。每一批 Key 的渠道类型由用户明确选择，工具不会猜测 Key 来源。Key 和额度输入默认明文显示，方便写入前核对，两个输入区都可以单独切换为隐藏。额度默认使用“统一额度”，整批 Key 只需填写一次金额；也可以切换为“逐条额度”并按行对应，不知道时填写 `x`，行数不一致时拒绝写入。AWS 等组合凭证可以在 Key 框原样填写。批量新建时每条 Key 对应一个独立渠道。工具会保存不含明文 Key 的导入台账，包括 Key 尾号、不可逆指纹、录入额度、目标站点、渠道和时间。能查询渠道余额时会据此估算消耗；多 Key 共用渠道或上游不支持余额查询时，不会伪造单 Key 消耗。

共享服务器使用用户名和密码登录 New API 时，可以只保存登录后的 Session：密码始终不落盘，Session 使用服务器主密钥 AES-GCM 加密后写入 SQLite，使定时任务在容器重启后仍能继续。也可以关闭该选项，让 Session 只保留在当前进程内。

连接站点后会读取该 New API 的管理员分组列表。创建渠道时可选择一个或多个分组，工具会按当前站点校验分组，并同时写入 New API 的 `group` 和 `groups` 字段；默认选择 `default`。

创建渠道时可以设置优先级和权重：优先级越高的渠道越先使用，同优先级渠道按权重比例分流。该设置位于“批量写入方式”正下方；留空时新渠道使用 `0`，复制已有渠道时沿用原值，更新已有渠道时只有明确填写才修改。每条 Key 建立独立渠道时还可开启“批量 Key 优先级依次递减”，第一条使用所填优先级，后续按粘贴顺序和指定步长递减；定时任务跨批次执行时仍沿用整批 Key 的原始顺序。定时上 Key 的首次执行时间支持精确到秒，后台按最近任务时间动态唤醒。等待中或已暂停的任务可直接修改下一次执行时间、每批写入数量和执行间隔；修改保存后后台会立即按新时间重新排程，已完成、已取消或正在执行的任务不可修改。

上 Key 记录按每次实际写入批次汇总，列表直接显示写入时间、成功数量、录入额度、累计消耗和请求次数，每条 Key 的渠道与用量明细按需展开。新记录使用批次 ID 精确归组；升级前的旧记录按站点、供应商、操作类型和相近写入时间归组。界面中的日期、数量和金额统一使用清晰的无衬线阿拉伯数字。

定时任务中的失败 Key 不会被删除，仍以加密形式保存在任务中。任务卡会显示“重试失败 Key（数量）”，点击后只把失败项重新加入待写入队列，不会重复已经成功的 Key；上一次错误原因会保留到重试成功，方便排查临时网络错误和无效 Key。

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

## 多设备服务器版

服务器版使用独立的 dataeyesai 系统访问密钥保护整个工作台。未登录时只能看到登录页，无法读取站点、任务、Key 记录或调用业务接口；登录态 12 小时后失效，同一来源连续输错 5 次会锁定 15 分钟。这个密钥与 New API 管理令牌完全分开，服务端只保存 `scrypt` 哈希。

启用 `DATAEYESAI_STORAGE=sqlite` 后，站点配置、定时任务、额度快照和导入记录统一保存在服务器 SQLite 数据库。多台电脑和手机访问同一服务器时看到的是同一套数据。需要记住的 New API 系统令牌会先用服务器主密钥执行 AES-256-GCM 加密，再写入数据库；定时任务 Key 也保持加密存储。

仓库提供 Docker 部署文件：

```bash
cd tools/channel-key-importer
cp server.env.example server.env
node src/generateAccessKey.js
openssl rand -base64 32
docker compose --env-file server.env -f compose.server.yml up -d --build
```

把生成结果中的 `accessKeyHash` 和主密钥写入 `server.env`，只把一次性显示的 `accessKey` 交给需要登录的设备。`server.env` 和 `server-data/` 已加入 Git 忽略，不会上传到 GitHub。

直接使用 `http://IP:4179` 虽然有登录密钥保护，但浏览器到服务器之间的渠道 Key 仍没有传输加密。生产环境应使用域名和 HTTPS 反向代理，并将 `DATAEYESAI_PUBLIC_HOSTS`、`DATAEYESAI_PUBLIC_ORIGINS` 和 `DATAEYESAI_SECURE_COOKIE` 改成对应的 HTTPS 配置。

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
