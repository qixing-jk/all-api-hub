# CLIProxyAPI 集成与一键导入

> 将中转站账号一键导入到本地 CLIProxyAPI 管理接口，自动生成 OpenAI 兼容提供方配置，避免手动维护配置文件。

## 功能概览

- **管理接口对接**
  - 通过 CLIProxyAPI 的 Management API（`/openai-compatibility`）读取并写回配置。
  - 支持在已有提供方上追加/更新 API Key，或自动创建新提供方。
- **一键导入密钥**
  - 在密钥列表中点击“导入到 CLIProxyAPI”，即可将当前站点的 Base URL 与密钥写入 CLIProxyAPI。
- **避免重复配置**
  - 自动复用站点名称和 `Base URL`，若检测到相同提供方则只更新密钥列表，不会创建重复条目。

## 前置条件

- 已部署或运行兼容的 **CLIProxyAPI**，并开启管理接口：
  - 示例地址：`http://localhost:8317/v0/management`
  - 支持 `GET/PUT/PATCH /openai-compatibility` 等接口。
- 拥有管理接口的 **Management Key**（用于鉴权）。
- 在 All API Hub 中已完成：
  - 至少添加一个中转站账号并获取可用密钥。

## 设置入口

1. 打开插件 → 进入 **设置** 页面。
2. 切换到 **“CLIProxyAPI”** 分组（`基础设置 → CLIProxyAPI` 标签页）。
3. 填写以下字段：
   - **管理接口基础 URL**：例如 `http://localhost:8317/v0/management`
   - **管理密钥（Management Key）**：用于访问管理接口的密钥。
4. 保存后，配置会存储到本地偏好中，供后续导入操作复用。

## 从密钥列表一键导入

1. 打开插件 → 进入 **密钥管理** 页面。
2. 找到想要导入到 CLIProxyAPI 的站点密钥卡片。
3. 点击密钥右侧的 CLIProxyAPI 图标按钮（通常在 CherryStudio / CC Switch / New API 按钮旁边）。
4. 插件会：
   - 读取 CLIProxyAPI 配置（基础 URL 和管理密钥）。
   - 使用站点的 `Base URL` 生成 OpenAI 兼容地址（自动拼接 `/v1`）。
   - 以站点名称或 Base URL 作为提供方名称。
   - （可选）在导入弹窗中配置 **模型映射**（原始模型 → 别名）；弹窗会尝试从上游 `/v1/models` 拉取模型列表，便于选择原始模型。
   - 调用 CLIProxyAPI：
     - 若已存在同名或相同 `base-url` 的提供方：
       - 去重后在 `api-key-entries` 中追加当前密钥。
     - 若不存在：
       - 创建一个新的提供方条目，仅包含当前密钥和基础信息。
5. 操作完成后，你会在右上角看到导入结果提示（成功/失败和错误原因）。

## 导入到 CLIProxyAPI 后的效果

- 在 CLIProxyAPI 的配置中，会新增或更新类似结构：
  - `name`：来源于站点名称（或 Base URL）。
  - `base-url`：统一指向对应中转站的 `/v1` OpenAI 兼容接口。
  - `api-key-entries`：包含一条或多条 `api-key` 记录，可在 CLIProxyAPI 中继续手动编辑。
- 这意味着：
  - 在 CLIProxyAPI 层即可统一管理多个上游中转站的密钥。
  - All API Hub 负责将基础配置信息同步过去，后续细节可在 CLIProxyAPI 内自定义。

## 常见问题

- **提示未配置 CLIProxyAPI**
  - 检查是否在 **设置 → CLIProxyAPI** 中填写了基础 URL 和管理密钥。
  - 确保未多余带 `/openai-compatibility`，应为管理接口前缀，例如 `.../v0/management`。
- **返回 401/403 或其它 HTTP 错误**
  - 确认管理密钥正确，且当前账号有访问管理接口的权限。
  - 查看 CLIProxyAPI 后端日志，确认路由与方法（GET/PUT/PATCH）是否启用。
- **重复导入会生成很多条记录吗？**
  - 不会。插件会基于 `base-url` 或名称查找已有提供方：
    - 若存在，则只更新 `api-key-entries`，对同一密钥做去重。
    - 若不存在，才创建新的提供方。

## 使用建议

- 建议先在少量测试账号上验证导入效果，再用于生产环境。
- 可配合 All API Hub 的 **快速导出** 功能，将同一批上游站点同步到 New API / CLIProxyAPI 等多种下游系统。

## 相关文档

- [快速导出站点配置](./quick-export.md)
- [New API 渠道管理](./new-api-channel-management.md)
- [New API 模型列表同步](./new-api-model-sync.md)
