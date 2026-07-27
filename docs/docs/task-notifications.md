# 任务通知

> 后台定时任务完成后，通过浏览器系统通知或第三方渠道接收结果提醒。

<a id="channels"></a>
## 支持的通知渠道

在 **`设置 → 通用 → 通知`** 中开启任务通知后，可以为自动签到、WebDAV 自动同步、模型同步、用量历史同步、余额历史捕获和网站公告分别配置提醒。

目前支持以下渠道：

| 渠道 | 适合场景 | 需要配置 |
|------|----------|----------|
| 浏览器系统通知 | 只需要在当前设备收到提醒 | 浏览器 `notifications` 权限 |
| Telegram Bot | 希望在 Telegram 会话或群组中接收提醒 | Bot Token、Chat ID |
| 飞书机器人 | 希望在飞书群中接收团队提醒 | 飞书自定义机器人的 Webhook URL 或 Key |
| 钉钉机器人 | 希望在钉钉群中接收团队提醒 | 钉钉自定义机器人的 Webhook URL 或 access_token，可选加签 Secret |
| 企业微信机器人 | 希望在企业微信群中接收团队提醒 | 企业微信群消息推送的 Webhook URL 或 Key |
| ntfy | 希望通过 ntfy App、自建 ntfy 服务或订阅主题接收提醒 | Topic URL 或主题名，可选访问令牌 |
| 通用 Webhook | 接入自建服务、自动化平台或其它兼容服务 | 可接收 JSON 请求的 HTTP(S) 地址 |

配置完成后，建议先点击对应渠道的 **`发送测试通知`**，确认通知可以正常送达。

<a id="feishu"></a>
## 飞书机器人

飞书渠道使用飞书群自定义机器人发送文本消息。最简单的配置方式是直接粘贴飞书提供的完整 Webhook URL。

### 获取 Webhook URL

1. 打开目标飞书群。
2. 在群设置或机器人入口中添加 **自定义机器人**。
3. 复制飞书生成的 Webhook 地址，格式通常类似：

```text
https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

4. 回到 All API Hub，进入 **`设置 → 通用 → 通知 → 飞书机器人`**。
5. 将完整 Webhook URL 填入 **`Webhook URL 或 Key`**，启用渠道后点击 **`发送测试通知`**。

如果你只复制了 `/hook/` 后面的 key，也可以直接填入，All API Hub 会自动补全飞书 Webhook 地址。

### 安全设置

飞书自定义机器人支持关键词、IP 白名单、签名校验等安全设置。创建机器人和配置安全设置时，可参考 [飞书自定义机器人使用指南](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot)。

使用 All API Hub 时需要注意：

- 如果启用了关键词校验，请确保通知标题或正文包含你配置的关键词，例如 `All API Hub`。
- IP 白名单会受当前设备网络环境影响，移动网络、代理或家庭宽带出口变化时可能导致发送失败。
- 当前飞书渠道只配置 Webhook URL 或 Key，未提供单独的签名密钥输入；如果启用飞书签名校验，测试通知可能会因为缺少签名而失败。

### 常见错误

| 错误信息 | 可能原因 | 处理方式 |
|----------|----------|----------|
| `param invalid: incoming webhook access token invalid` | Webhook URL 或 key 填写错误，或机器人已被删除 / 重建 | 从飞书机器人配置页重新复制完整 Webhook URL |
| `Bad Request` | 请求体被飞书拒绝，常见于机器人安全设置不匹配 | 检查关键词、安全设置和机器人是否仍在目标群中 |
| 测试通知没有到达 | 渠道未启用、URL 填写为空、网络或飞书安全策略拦截 | 启用渠道后重新发送测试通知，并检查飞书群机器人配置 |

<a id="dingtalk"></a>
## 钉钉机器人

钉钉渠道使用钉钉群自定义机器人发送文本消息。推荐直接粘贴钉钉提供的完整 Webhook URL；如果只复制了 `access_token=` 后面的值，也可以直接填写。

### 创建机器人并获取 Webhook URL

1. 打开目标钉钉群。
2. 进入群设置，选择 **机器人**，添加 **自定义机器人**。
3. 配置机器人名称和安全设置。钉钉支持自定义关键词、加签、IP 地址（段）等安全设置。
4. 创建完成后，打开该自定义机器人配置页，复制 Webhook 地址，格式通常类似：

```text
https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

5. 回到 All API Hub，进入 **`设置 → 通用 → 通知 → 钉钉机器人`**。
6. 将完整 Webhook URL 填入 **`Webhook URL 或 access_token`**。如果钉钉机器人启用了 **加签** 安全设置，将钉钉生成的 `SEC...` 密钥填入 **`加签 Secret`**。
7. 启用渠道后点击 **`发送测试通知`**。

### 安全设置

钉钉自定义机器人支持多种安全设置，使用 All API Hub 时需要注意：

- 如果启用了关键词校验，请确保通知标题或正文包含你配置的关键词，例如 `All API Hub`。
- 如果启用了加签，请在 All API Hub 中填写钉钉提供的 `SEC...` Secret。发送通知时，All API Hub 会按钉钉要求为每次请求生成 `timestamp` 和 HMAC-SHA256 签名。
- IP 地址（段）会受当前设备网络环境影响，移动网络、代理或家庭宽带出口变化时可能导致发送失败。
- 请妥善保管 Webhook URL 和加签 Secret，不要发布到公开仓库、公开文档或截图中。

钉钉的创建、加签和 Webhook 获取流程可参考官方文档：[创建自定义机器人](https://open.dingtalk.com/document/dingstart/custom-bot-creation-and-installation)、[自定义机器人安全设置](https://open.dingtalk.com/document/dingstart/customize-robot-security-settings)、[获取自定义机器人 Webhook 地址](https://open.dingtalk.com/document/dingstart/obtain-the-webhook-address-of-a-custom-robot)。

### 接口行为

钉钉机器人接口使用 `POST /robot/send?access_token=...` 发送消息。All API Hub 会发送文本消息：

```json
{
  "msgtype": "text",
  "text": {
    "content": "通知标题\n通知内容"
  },
  "at": {
    "isAtAll": false
  }
}
```

如果配置了加签 Secret，请求 URL 会额外包含 `timestamp` 和 `sign` 参数。钉钉返回 `errcode: 0` 时视为发送成功；如果返回其它 `errcode`，设置页的测试通知会展示钉钉返回的 `errmsg`，便于检查配置。

### 常见错误

| 错误信息 | 可能原因 | 处理方式 |
|----------|----------|----------|
| `keywords not in content` 或类似关键词错误 | 钉钉机器人启用了关键词校验，但通知内容不包含关键词 | 调整钉钉关键词，或确保通知标题/正文包含该关键词 |
| `sign not match` 或类似签名错误 | 钉钉机器人启用了加签，但 Secret 未填写或填写错误 | 重新复制钉钉机器人配置页中的 `SEC...` Secret |
| `access_token` 相关错误 | Webhook URL 或 access_token 填写错误，或机器人已被删除 / 重建 | 从钉钉机器人配置页重新复制完整 Webhook URL |
| 测试通知没有到达 | 渠道未启用、URL 填写为空、网络或钉钉安全策略拦截 | 启用渠道后重新发送测试通知，并检查钉钉群机器人配置 |

<a id="wecom"></a>
## 企业微信机器人

企业微信渠道使用企业微信群的消息推送能力发送文本消息。推荐直接粘贴企业微信提供的完整 Webhook URL。

### 获取 Webhook URL

1. 打开目标企业微信群。
2. 进入群设置，找到 **消息推送**。
3. 创建一条新的消息推送配置，或打开已有配置。
4. 复制企业微信生成的 Webhook 地址，格式通常类似：

```text
https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

5. 回到 All API Hub，进入 **`设置 → 通用 → 通知 → 企业微信机器人`**。
6. 将完整 Webhook URL 填入 **`Webhook URL 或 Key`**，启用渠道后点击 **`发送测试通知`**。

如果你只复制了 `key=` 后面的 key，也可以直接填入，All API Hub 会自动补全企业微信 Webhook 地址。

### 接口行为

企业微信机器人接口使用 `POST /cgi-bin/webhook/send?key=...` 发送消息。All API Hub 会发送文本消息：

```json
{
  "msgtype": "text",
  "text": {
    "content": "通知标题\n通知内容"
  }
}
```

企业微信返回 `errcode: 0` 时视为发送成功；如果返回其它 `errcode`，设置页的测试通知会展示企业微信返回的 `errmsg`，便于检查配置。

### 使用限制

企业微信群消息推送的消息格式和发送频率限制以 [企业微信消息推送配置说明](https://developer.work.weixin.qq.com/document/path/99110) 为准。

使用 All API Hub 时需要注意：

- 企业微信机器人有发送频率限制；如果大量任务同时完成，可能触发平台限流。
- 如果测试通知返回 `invalid webhook url`、`key not found` 或类似错误，请从企业微信机器人配置页重新复制完整 Webhook URL。

<a id="ntfy"></a>
## ntfy

ntfy 渠道通过 ntfy 的主题发布接口发送纯文本通知。你可以使用公共服务 `ntfy.sh`，也可以填写自建 ntfy 服务的主题 URL。

### 配置主题

1. 在 ntfy App、网页端或自建服务中准备一个主题名，例如 `all-api-hub-alerts`。
2. 回到 All API Hub，进入 **`设置 → 通用 → 通知 → ntfy`**。
3. 在 **`Topic URL 或主题名`** 中填写完整主题 URL：

```text
https://ntfy.sh/all-api-hub-alerts
```

也可以只填写主题名：

```text
all-api-hub-alerts
```

只填写主题名时，All API Hub 会自动发送到 `https://ntfy.sh/<主题名>`。如果你使用自建 ntfy 服务，请填写完整 URL，例如：

```text
https://ntfy.example.com/all-api-hub-alerts
```

4. 如果该主题需要认证，在 **`访问令牌（可选）`** 中填写 ntfy access token；公开主题可以留空。
5. 启用渠道后点击 **`发送测试通知`**。

### 接口行为

All API Hub 使用 ntfy 的发布接口，向主题 URL 发送 `POST` 请求。通知正文作为纯文本请求体发送，通知标题放在 `Title` 请求头中；非 ASCII 标题会按 RFC 2047 编码后发送，以兼容浏览器扩展后台的请求头限制。如果填写了访问令牌，请求会带上 `Authorization: Bearer <token>`。

ntfy 的发布接口、请求头和认证方式可参考官方文档：[Publishing messages](https://docs.ntfy.sh/publish/)。

### 使用限制

- 公共 `ntfy.sh` 主题不是私有命名空间，请使用不容易猜到的主题名，或改用自建服务和访问令牌。
- 如果自建服务使用私有主题，请确认访问令牌有发布权限。
- 如果测试通知返回 `401`、`403` 或类似认证错误，请检查主题 URL、访问令牌和服务端权限配置。

## 相关文档

- [权限说明](./permissions.md)
- [自动签到流](./auto-checkin.md)
- [WebDAV 同步与加密](./webdav-sync.md)
