# Safari 扩展安装指南

本文档介绍如何在 Safari 浏览器中安装 All API Hub 扩展。

## 先看区别

- 没有 Apple Developer Program 付费账号：仍可用 Xcode 在自己的 Mac 上构建并启用扩展，适合开发调试或自用；通常不能面向普通用户分发，本地未正式分发版本可能需要在 Safari 开发者菜单里打开 `允许未签名的扩展`。
- 有 Apple Developer Program 付费账号：可以做正式签名，并通过 TestFlight / App Store 分发，适合给其他用户安装，安装体验也更接近普通 Safari 扩展。

## 系统要求

- macOS 11.0 Big Sur 或更高版本
- Safari 14.0 或更高版本
- Xcode 13.0 或更高版本（用于构建）

## 安装方式

### 方式一：从源码构建安装（推荐，无账号也可）

#### 1. 构建 Safari 扩展

```bash
# 克隆或下载项目源码
git clone https://github.com/qixing-jk/all-api-hub.git
cd all-api-hub

# 安装依赖
pnpm install

# 构建 Safari 版本
pnpm run build:safari
```

构建完成后，扩展文件将输出到 `.output/safari-mv2/` 目录。

#### 2. 使用 Xcode 转换器创建 Safari 应用

```bash
# 运行 Safari Web Extension 转换器
xcrun safari-web-extension-converter .output/safari-mv2/
```

该命令会：
1. 自动打开 Xcode
2. 创建一个新的 Xcode 项目
3. 生成一个 macOS 应用（用于承载扩展）

#### 3. 在 Xcode 中构建并运行

1. 在 Xcode 中，确保目标设备选择的是你的 Mac
2. 点击 Product > Run（或按 `Cmd + R`）
3. 首次运行时，Xcode 会处理签名；没有付费账号时可使用 `Personal Team` 做本机调试
4. 构建成功后，Safari 会自动打开并提示安装扩展

#### 4. 启用扩展

1. 打开 Safari
2. 在菜单栏点击 `Safari > 设置`
3. 如果是本地未正式分发版本，再到 `开发` 菜单打开 `允许未签名的扩展`
4. 选择 `扩展` 标签
5. 找到 `All API Hub` 并启用它
6. 根据需要配置扩展权限

### 方式二：临时调试（仅开发用途）

部分 macOS / Safari 版本支持临时调试加载，但不适合作为正式安装或分发方式：

```bash
# 构建 Safari 扩展
pnpm run build:safari

# 在 Safari 中启用开发者模式
# Safari > 设置 > 高级 > 勾选 "在菜单栏中显示开发菜单"
```

1. 打开 Safari
2. 在菜单栏点击 `开发 > 允许未签名的扩展`
3. 在 `Safari > 设置 > 扩展` 中启用扩展

> **注意**：如果该方式不可用，请回到上面的 Xcode 流程；正式发布仍应使用签名分发。

## 开发模式调试

### 开发构建

```bash
# 开发模式构建（热重载）
pnpm run dev -- -b safari
```

### 调试扩展

1. **调试背景脚本/弹出窗口**：
   - 在 Safari 中，右键点击扩展图标
   - 选择 `检查` 或打开 Web Inspector

2. **调试内容脚本**：
   - 在任意网页上，右键点击页面
   - 选择 `检查元素`
   - 在控制台中查看扩展相关日志

## 常见问题

### Q: 为什么 Safari 需要特殊处理？

A: Safari 扩展需要打包成 macOS 应用才能安装和分发，这与 Chrome/Edge/Firefox 直接安装 `.crx` 或 `.xpi` 文件不同。

### Q: 有开发者账号和没有，有什么区别？

A:
- 没有账号：可以本机构建并使用，但更偏开发调试/自用，通常不能直接分发给普通用户。
- 有账号：可以正式签名，并通过 TestFlight / App Store 分发，适合长期维护和正式发布。

### Q: 能否像 Chrome 一样直接安装？

A: 不可以。Safari 不能像 Chrome 一样直接解压加载做正式安装；本地使用通常走 Xcode，正式分发则走 TestFlight / App Store。

### Q: 构建时出现错误怎么办？

A: 确保：
- Xcode 命令行工具已安装：`xcode-select --install`
- 已同意 Xcode 许可：`sudo xcodebuild -license accept`
- Node.js 版本 >= 18

### Q: 扩展功能与 Chrome 版本有差异吗？

A: 基本功能完全一致。但由于 Safari WebExtensions API 的一些限制，部分功能可能略有差异：
- `sidePanel` API 在 Safari 中不可用（使用弹出窗口代替）
- 某些权限请求方式可能不同

### Q: 如何更新扩展？

A: 重新构建并运行 Xcode 项目即可更新已安装的扩展。

## 卸载

1. 打开 Safari
2. 进入 `Safari > 设置 > 扩展`
3. 取消勾选 `All API Hub`
4. 删除 Xcode 生成的 macOS 应用

## 参考资源

- [Apple Safari Web Extensions 官方文档](https://developer.apple.com/documentation/safari-extensions/safari-web-extensions)
- [Safari Web Extension Converter 使用说明](https://developer.apple.com/documentation/safari-extensions/converting-a-web-extension-for-safari)
- [WXT 框架 Safari 支持文档](https://wxt.dev/guide/browsers/safari.html)

---

如有问题，请在 [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues) 中反馈。
