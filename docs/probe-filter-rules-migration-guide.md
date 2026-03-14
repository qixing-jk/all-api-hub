# Probe 探测型过滤规则 - 迁移指南

## 兼容性说明

本次更新完全向后兼容，现有的模式匹配规则会继续正常工作。

### 数据迁移

- 现有的过滤规则会自动被识别为 `pattern` 类型
- `ruleType` 字段是可选的，未设置时默认为 `pattern`
- 无需手动迁移现有配置

### 类型变更

#### `ChannelModelFilterRule`

**之前（必填字段）：**
```typescript
{
  pattern: string
  isRegex: boolean
}
```

**现在（根据规则类型）：**
```typescript
{
  ruleType?: "pattern" | "probe"
  
  // Pattern 规则字段（ruleType === "pattern" 或未设置时）
  pattern?: string
  isRegex?: boolean
  
  // Probe 规则字段（ruleType === "probe" 时）
  probeId?: "models" | "text-generation" | "tool-calling" | "structured-output" | "web-search"
  apiType?: string
  verificationBaseUrl?: string
  verificationApiKey?: string
}
```

#### `ChannelConfig`

**新增字段：**
```typescript
{
  verificationCredentials?: {
    baseUrl: string
    apiKey: string
    apiType: string
    sourceProfileId?: string
    updatedAt: number
  }
}
```

## 升级步骤

### 1. 安装依赖（如果尚未安装）

```bash
pnpm install
```

### 2. 运行测试

```bash
pnpm test
```

### 3. 启动开发服务器

```bash
pnpm dev
```

### 4. 验证功能

1. 打开扩展的渠道管理页面
2. 点击某个渠道的"编辑渠道过滤规则"
3. 确认现有规则正常显示
4. 尝试添加新的探测型规则

## 使用建议

### 首次使用探测规则

1. **配置渠道校验凭证**
   - 在过滤规则对话框顶部的"渠道校验凭证"区域配置
   - 或者从 API 凭证创建渠道，凭证会自动带入

2. **添加探测规则**
   - 点击"新增规则"，选择"探测型规则"
   - 选择探测类型（如"文本生成探测"）
   - 选择 API 类型（如"openai-compatible"）
   - 选择动作（包含/排除）

3. **性能优化**
   - 先添加模式匹配规则缩小范围
   - 再添加探测规则进行精细筛选
   - 避免对大量模型直接应用探测规则

### 常见场景

#### 场景 1: 只同步支持工具调用的模型

```
规则 1 (Pattern): 包含 "gpt-4"
规则 2 (Probe): 包含 - 工具调用探测 - openai-compatible
```

#### 场景 2: 排除不支持联网搜索的模型

```
规则 1 (Probe): 排除 - 联网搜索探测 - openai-compatible
```

## 故障排查

### 探测规则不生效

**可能原因：**
- 校验凭证未配置或不完整
- API 类型选择错误
- 网络连接问题

**解决方案：**
1. 检查浏览器控制台日志
2. 确认校验凭证配置正确
3. 尝试在 API 凭证页面验证凭证是否可用

### 模型同步很慢

**可能原因：**
- 探测规则对每个模型执行 API 调用
- 模型数量较多

**解决方案：**
1. 先使用模式匹配规则缩小范围
2. 减少探测规则数量
3. 考虑只在必要时使用探测规则

### 凭证解析失败

**可能原因：**
- 渠道的 `key` 字段为空（New API 2FA 限制）
- 校验凭证未配置

**解决方案：**
1. 在"渠道校验凭证"区域手动配置凭证
2. 或者在探测规则中直接填写凭证

## API 变更

### 新增 Runtime Actions

- `channelConfig:upsertVerificationCredentials`
- `channelConfig:clearVerificationCredentials`

### 存储结构变更

#### `channel_configs` Storage Key

**之前：**
```json
{
  "1": {
    "channelId": 1,
    "modelFilterSettings": {
      "rules": [...]
    }
  }
}
```

**现在：**
```json
{
  "1": {
    "channelId": 1,
    "modelFilterSettings": {
      "rules": [...]
    },
    "verificationCredentials": {
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-...",
      "apiType": "openai",
      "sourceProfileId": "profile-123",
      "updatedAt": 1710000000000
    }
  }
}
```

## 回滚说明

如果需要回滚到之前的版本：

1. 探测型规则会被忽略（因为旧代码不识别 `ruleType === "probe"`）
2. 模式匹配规则会继续正常工作
3. `verificationCredentials` 字段会被忽略，不影响现有功能

## 技术支持

如有问题，请查看：

- [渠道管理文档](./new-api-channel-management.md)
- [模型同步文档](./new-api-model-sync.md)
- [实现总结](./probe-filter-rules-implementation.md)
