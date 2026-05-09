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
| 企业微信机器人 | 希望在企业微信群中接收团队提醒 | 企业微信群消息推送的 Webhook URL 或 Key |
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

## 相关文档

- [权限说明](./permissions.md)
- [自动签到流](./auto-checkin.md)
- [WebDAV 同步与加密](./webdav-sync.md)
