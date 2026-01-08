# 国际化 (i18n) 翻译文件

## 📁 目录结构

```
locales/
├── en/                      # 英文翻译
│   ├── common.json         # 通用操作、状态、标签
│   ├── account.json        # 账户管理
│   ├── accountDialog.json  # 账户对话框
│   ├── aiApiVerification.json # AI API 验证对话框
│   ├── keyManagement.json  # 密钥管理
│   ├── modelList.json      # 模型列表
│   ├── settings.json       # 设置
│   ├── messages.json       # 消息提示
│   ├── ui.json             # UI 元素
│   ├── importExport.json   # 导入/导出
│   └── about.json          # 关于
├── zh_CN/                  # 中文翻译
│   └── (同上结构)
└── README.md               # 本文件
```

---

## 🚀 快速开始

### 基本用法

```typescript
import { useTranslation } from "react-i18next"

function MyComponent() {
  // 使用单个 namespace
  const { t } = useTranslation("common")
  
  return <button>{t("actions.save")}</button>
}
```

### 使用多个 namespace

```typescript
function MyComponent() {
  const { t } = useTranslation(["account", "common"])
  
  return (
    <div>
      <h1>{t("account:title")}</h1>
      <button>{t("common:actions.save")}</button>
    </div>
  )
}
```

---

## 📚 Namespace 说明

| Namespace | 用途 | 示例 |
|-----------|------|------|
| `common` | 通用操作、状态 | `t("common:actions.save")` |
| `account` | 账户管理 | `t("account:title")` |
| `accountDialog` | 账户对话框 | `t("accountDialog:title.add")` |
| `keyManagement` | 密钥管理 | `t("keyManagement:selectAccount")` |
| `modelList` | 模型列表 | `t("modelList:searchModels")` |
| `settings` | 设置 | `t("settings:display.title")` |
| `messages` | 消息提示 | `t("messages:toast.success.accountAdded")` |
| `ui` | UI 元素 | `t("ui:navigation.home")` |
| `importExport` | 导入/导出 | `t("importExport:export.title")` |
| `about` | 关于 | `t("about:title")` |
