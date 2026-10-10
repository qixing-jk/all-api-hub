# Safari 扩展安装指南

本文档介绍如何在 Safari 浏览器中安装 All API Hub 扩展。

## 先看区别

- 没有 Apple Developer Program 付费账号：仍可用 Xcode 在自己的 Mac 上构建并启用扩展，适合开发调试或自用；通常不能面向普通用户分发，本地未正式分发版本可能需要在 Safari 开发者菜单里打开 `允许未签名的扩展`。
- 有 Apple Developer Program 付费账号：可以做正式签名，并通过 TestFlight / App Store 分发，适合给其他用户安装，安装体验也更接近普通 Safari 扩展。

## 系统要求

- macOS 11.0 Big Sur 或更高版本
- Safari 14.0 或更高版本
- Xcode 13.0 或更高版本（用于构建）

## 功能兼容性

Safari 使用 WebKit 的 WebExtensions 权限机制，权限声明与 Chromium、Firefox 分开维护。Cookie 访问和网络请求规则仍按需授权，设置搜索只展示当前 Safari 构建实际声明的可选权限。

账号独立 Cookie 直连请求目前尚未通过 Safari 实机隔离验证，因此会提示暂不支持并停止请求，不会改用其他账号的浏览器登录态。需要此功能时，请使用 Chrome 或 Edge。Safari 构建成功不代表全部功能均已通过实机验证。

## 安装方式

有两种安装方式：

1. 从 GitHub 最新 Release 下载已经打好的 Safari Xcode 工程压缩包，解压后直接用 Xcode 打开
2. 从源码自己构建，再用 Xcode 运行

### 方式一：从 GitHub 最新 Release 下载 Safari 附件

Safari 附件会上传到最新版本 Release 页面：

- [最新版本 Release](https://github.com/qixing-jk/all-api-hub/releases/latest)

#### 1. 打开对应版本的 Release 页面

直接打开上面的“最新版本 Release”即可。

#### 2. 下载正确的 Safari 附件

在页面附件里，下载下面这个文件：

```text
all-api-hub-<version>-safari-xcode-bundle.zip
```

例如：

```text
all-api-hub-3.29.0-safari-xcode-bundle.zip
```

这个压缩包已经包含可直接打开的 Xcode 工程和所需的 Safari 文件。

请下载这个文件，不要下载 `all-api-hub-<version>-safari.zip`。

<details>
<summary>为什么要下载这个文件？</summary>

`all-api-hub-<version>-safari-xcode-bundle.zip` 里通常会同时包含：

- `all-api-hub-<version>-safari.zip`
- `safari-mv2/`
- 转换器生成的 Xcode 工程目录

这样解压后就可以直接用 Xcode 打开工程，不需要自己再补齐工程引用的 Safari 文件。

</details>

#### 3. 解压后直接用 Xcode 打开工程

1. 在解压目录中找到 Xcode 工程
2. 双击工程文件，或用 Xcode 打开它
3. 确保目标设备选择的是你的 Mac
4. 点击 `Product > Run`
5. Safari 提示后，在 `Safari > 设置 > 扩展` 中启用扩展

压缩包里已经包含运行所需文件，解压后直接打开即可，通常不需要单独移动其中的目录。

### 方式二：从源码构建安装

#### 1. 获取源码并构建 Safari 产物

```bash
# 克隆或下载项目源码
git clone https://github.com/qixing-jk/all-api-hub.git
cd all-api-hub

# 安装依赖
pnpm install

# 构建 Safari 版本
pnpm run build:safari
```

构建完成后，编译产物会输出到 `.output/safari-mv2/`。

#### 2. 使用 Safari 转换器生成 Xcode 工程

```bash
xcrun safari-web-extension-converter .output/safari-mv2/
```

如果你想自定义输出目录、应用名和包标识符，也可以使用：

```bash
xcrun safari-web-extension-converter .output/safari-mv2/ \
  --project-location /path/to/all-api-hub-safari-project \
  --app-name "All API Hub" \
  --bundle-identifier "io.github.qixingjk.allapihub"
```

这一步会生成一个 Xcode 工程，用来承载 Safari 扩展。

#### 3. 在 Xcode 中构建并运行

1. 打开刚生成的 Xcode 工程
2. 确保目标设备选择的是你的 Mac
3. 点击 `Product > Run`，或按 `Cmd + R`
4. 首次运行时，Xcode 会要求你处理签名；没有付费账号时通常可使用 `Personal Team` 做本机调试
5. 构建成功后，Safari 会提示你启用扩展

#### 4. 在 Safari 中启用扩展

1. 打开 Safari
2. 在菜单栏点击 `Safari > 设置`
3. 如果是本地未正式分发版本，再到 `开发` 菜单打开 `允许未签名的扩展`
4. 打开 `扩展` 标签页
5. 找到 `All API Hub` 并启用
6. 根据需要授予权限

### 方式三：临时调试（仅开发用途）

部分 macOS / Safari 版本支持临时调试加载，但不适合作为正式安装或分发方式：

```bash
pnpm run build:safari
```

然后在 Safari 中启用开发者模式：

1. 打开 `Safari > 设置 > 高级`
2. 勾选“在菜单栏中显示开发菜单”
3. 在菜单栏点击 `开发 > 允许未签名的扩展`
4. 在 `Safari > 设置 > 扩展` 中启用扩展

> **注意**
> 如果该方式不可用，请回到上面的 Xcode 流程；正式发布仍应使用签名分发。

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

### 为什么 Safari 需要特殊处理？

Safari 扩展需要打包成 macOS 应用才能安装和分发，这与 Chrome、Edge、Firefox 直接安装 `.crx` 或 `.xpi` 文件不同。

### 有开发者账号和没有，有什么区别？

- 没有账号：可以本机构建并使用，但更偏开发调试/自用，通常不能直接分发给普通用户。
- 有账号：可以正式签名，并通过 TestFlight / App Store 分发，适合长期维护和正式发布。

### 能否像 Chrome 一样直接安装？

不可以。Safari 不能像 Chrome 一样直接解压加载做正式安装；本地使用通常走 Xcode，正式分发则走 TestFlight / App Store。

### 构建时出现错误怎么办？

请先确认：
- Xcode 命令行工具已安装：`xcode-select --install`
- 已同意 Xcode 许可：`sudo xcodebuild -license accept`
- Node.js 版本 >= 18

### 扩展功能与 Chrome 版本有差异吗？

基本功能完全一致。但由于 Safari WebExtensions API 的一些限制，部分功能可能略有差异：
- `sidePanel` API 在 Safari 中不可用（使用弹出窗口代替）
- 某些权限请求方式可能不同

### 如何更新扩展？

- 如果你是从源码安装：重新构建 Safari 产物并重新运行 Xcode 工程
- 如果你是从最新 Release 安装：重新下载最新的 `all-api-hub-<version>-safari-xcode-bundle.zip`，解压后重新打开新的 Xcode 工程运行

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
