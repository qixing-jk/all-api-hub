# 📝 文档助手工具

这个目录包含用于维护和自动化文档的各种辅助脚本。

## 🌐 translate.py - 文档自动翻译工具

自动将中文文档翻译为英文和日文的工具。

### 安装依赖

```bash
pip install -r requirements.txt
```

### 配置

设置以下环境变量：

```bash
export OPENAI_API_KEY="your-api-key-here"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # 可选
export OPENAI_MODEL="gpt-4o-mini"  # 可选

# 重试配置（可选）
export MAX_RETRIES="3"        # 最大重试次数
export RETRY_DELAY="2"        # 初始重试延迟（秒）
export RETRY_BACKOFF="2.0"    # 退避倍数
```

### 使用方法

#### 翻译单个文件

```bash
python translate.py ../docs/getting-started.md
```

#### 翻译多个文件

```bash
python translate.py ../docs/getting-started.md ../docs/guide/index.md
```

#### 批量翻译

```bash
# 翻译某个目录下的所有文件
find ../docs/guide -name "*.md" -type f ! -path "*/en/*" ! -path "*/ja/*" | xargs python translate.py
```

### 工作原理

1. 读取中文源文件
2. 使用 OpenAI API 进行翻译（带重试机制）
3. 保持 Markdown 格式完整
4. 将翻译结果保存到对应的 `en/` 和 `ja/` 目录

### 重试机制

脚本内置了智能重试机制，提高翻译的可靠性：

- ✅ **指数退避策略**: 每次重试的等待时间递增
- ✅ **可配置参数**: 支持自定义重试次数和延迟时间
- ✅ **详细日志**: 记录每次重试的详细信息
- ✅ **超时保护**: 每次 API 调用 60 秒超时

**重试流程示例（默认配置）：**
1. 第 1 次尝试失败 → 等待 2 秒
2. 第 2 次尝试失败 → 等待 4 秒（2 × 2.0¹）
3. 第 3 次尝试失败 → 等待 8 秒（2 × 2.0²）
4. 第 4 次尝试失败 → 抛出错误

### 翻译质量控制

- ✅ 代码块内容不翻译
- ✅ 保持图片路径和链接不变
- ✅ 专业术语使用标准翻译
- ✅ 专有名词保持不变
- ✅ 保持原文的语气和风格

### 支持的模型

#### 使用 New API

如果你使用 New API 等 API 网关服务：

```bash
export OPENAI_BASE_URL="https://your-newapi-domain.com/v1"
export OPENAI_API_KEY="your-newapi-token"
export OPENAI_MODEL="gpt-4o-mini"
```

### 示例输出

**正常翻译：**
```
2025-01-15 10:30:00 - INFO - 共有 1 个文件需要翻译
2025-01-15 10:30:00 - INFO - 使用模型: gpt-4o-mini
2025-01-15 10:30:00 - INFO - API 地址: https://api.openai.com/v1
2025-01-15 10:30:00 - INFO - 目标语言: 英文, 日文
2025-01-15 10:30:00 - INFO - 重试配置: 最大 3 次, 初始延迟 2s, 退避倍数 2.0x
2025-01-15 10:30:00 - INFO - ------------------------------------------------------------
2025-01-15 10:30:00 - INFO - 处理文件: docs/getting-started.md
2025-01-15 10:30:01 - INFO - 正在翻译为 英文...
2025-01-15 10:30:15 - INFO - 翻译完成 (英文)
2025-01-15 10:30:15 - INFO - ✓ 已保存 英文翻译: docs/en/getting-started.md
2025-01-15 10:30:16 - INFO - 正在翻译为 日文...
2025-01-15 10:30:30 - INFO - 翻译完成 (日文)
2025-01-15 10:30:30 - INFO - ✓ 已保存 日文翻译: docs/ja/getting-started.md
2025-01-15 10:30:30 - INFO - ✅ 所有翻译任务完成！
```

**包含重试的翻译：**
```
2025-01-15 10:30:00 - INFO - 正在翻译为 英文...
2025-01-15 10:30:15 - WARNING - 翻译失败: Connection timeout, 将在 2.0 秒后进行第 1 次重试 (最多 3 次)
2025-01-15 10:30:17 - INFO - 第 1 次重试翻译为 英文...
2025-01-15 10:30:25 - INFO - 翻译完成 (英文)
2025-01-15 10:30:25 - INFO - ✓ 已保存 英文翻译: docs/en/getting-started.md
```

## 🤖 GitHub Actions 集成

该脚本已集成到 GitHub Actions 工作流中，可以在文档更新时自动运行。

详细说明请查看: [../.github/workflows/README.md](../.github/workflows/README.md)

## 🔧 其他工具

- `afdian_api.py` - 爱发电 API 集成
- `changelog.py` - 变更日志生成
- `contributors.py` - 贡献者统计
- `github_api.py` - GitHub API 集成
- `utils.py` - 通用工具函数

## 📝 贡献

如果你想改进翻译脚本或添加新功能，欢迎提交 PR！

### 改进建议

- [ ] 支持更多语言（如韩语、西班牙语等）
- [ ] 添加翻译缓存机制以减少重复翻译
- [ ] 支持增量翻译（只翻译变更的部分）
- [ ] 添加翻译质量评分
- [ ] 支持自定义翻译提示词

## 📚 相关文档

- [重试配置详解](RETRY_CONFIG.md) - 详细的重试机制配置指南
- [GitHub Actions 集成](../.github/workflows/README.md) - 自动化工作流说明

## 📄 许可证

本工具遵循项目主仓库的许可证。

