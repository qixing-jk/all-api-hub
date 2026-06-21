# QQ / 360 等浏览器安装指南

本文档介绍如何在 QQ 浏览器、360 安全浏览器、360 极速浏览器、猎豹浏览器、Brave、Vivaldi、Opera 等浏览器中安装 All API Hub 扩展。

这些浏览器大多基于 Chromium 内核，因此通常可以使用 GitHub Release 中的 Chrome 版本压缩包，通过“加载已解压的扩展程序”完成安装。

## 先看区别

- Chrome / Edge / Firefox 用户：优先使用对应商店版本，更新更省心。
- QQ 浏览器、360 系浏览器、猎豹浏览器、Brave、Vivaldi、Opera 等用户：通常没有单独商店版本，建议从 GitHub Release 下载 Chrome 版本压缩包，然后通过“加载已解压的扩展程序”安装。
- Safari 用户：安装方式不同，需要通过 Xcode 或 Safari 专用包处理，请查看 [Safari 扩展安装指南](./safari-install.md)。
- 移动端浏览器：不同浏览器对扩展能力支持差异较大，移动端说明请查看 [常见问题中的移动端使用](./faq.md#mobile-browser-support)。

::: warning 提示
手动加载的扩展通常不会自动更新。后续升级需要重新下载新版 Chrome 压缩包，并在扩展管理页点击“重新加载”或重新安装。
:::

## 适用浏览器

| 浏览器 | 扩展管理页入口 | 安装提示 |
|--------|----------------|----------|
| QQ 浏览器 | `qqbrowser://extensions`，不可用时尝试 `chrome://extensions/` | 开启开发者模式后加载解压目录；入口可能在扩展管理或应用中心里，详见 [QQ 浏览器安装](#qq-browser)。 |
| 360 安全浏览器 / 360 极速浏览器 | `chrome://extensions/`，或菜单中的扩展 / 插件管理 | 先确认目标网页使用极速模式，再加载解压目录；安全策略可能会拦截直接拖拽安装，详见 [360 系浏览器安装](#browser-360)。 |
| 猎豹浏览器 | `liebao://extensions/` | 开启开发者模式后加载解压目录；如果弹出主页 / 标签页变更提示，优先保持当前设置，详见 [猎豹浏览器安装](#liebao-browser)。 |
| Brave / Vivaldi / Opera | `brave://extensions/`、`vivaldi://extensions/`、`opera://extensions/` | 这些浏览器通常保留开发者模式和加载已解压入口，可按 [其他桌面浏览器通用流程](#desktop-browser-common-flow) 安装。 |
| 星愿 / 百分 / Cent Browser 等 | 优先尝试 `chrome://extensions/` | 如果扩展管理页能开启开发者模式并加载已解压目录，通常可以尝试；否则建议换用 Chrome / Edge / Firefox。 |
| 移动端 Kiwi / Edge 等 | 以浏览器实际扩展入口为准 | 移动端限制更多，支持情况随浏览器版本变化；如果找不到外部扩展安装入口，建议改用桌面浏览器。 |

如果某个浏览器的扩展管理页没有“开发者模式”或“加载已解压的扩展程序”，说明当前版本可能不支持手动安装外部扩展。此时建议换用 Chrome、Edge、Firefox，或安装对应浏览器的完整版 / 桌面版后再试。

## 准备安装包

1. 打开 [最新版本 Release](https://github.com/qixing-jk/all-api-hub/releases/latest)。
2. 在附件中下载 Chrome 版本压缩包：

```text
all-api-hub-<version>-chrome.zip
```

例如：

```text
all-api-hub-3.32.0-chrome.zip
```

3. 将压缩包解压到一个固定目录，例如 `D:\Extensions\all-api-hub\`。
4. 确认你选择的扩展目录中能直接看到 `manifest.json` 文件。

::: tip 目录选择
加载扩展时要选择包含 `manifest.json` 的那一层目录。如果报错“清单文件缺失”或“manifest.json 不存在”，通常是选到了外层父目录。
:::

<a id="desktop-browser-common-flow"></a>

## 其他桌面浏览器通用流程

适用于大多数支持 Chrome 扩展的桌面浏览器。

1. 打开浏览器扩展管理页。
   - 优先尝试在地址栏输入 `chrome://extensions/`
   - 如果无法打开，请通过浏览器菜单进入 `扩展`、`扩展程序`、`插件管理` 或 `应用管理`
2. 开启 `开发者模式`。
3. 点击 `加载已解压的扩展程序`。
4. 选择刚才解压出来、且包含 `manifest.json` 的目录。
5. 安装完成后，在扩展列表中确认 `All API Hub` 已启用。
6. 如工具栏没有显示图标，在扩展按钮中将 All API Hub 固定到工具栏。
7. 如果安装前已经打开了中转站页面，请刷新这些页面后再使用自动识别。

<a id="qq-browser"></a>

## QQ 浏览器安装

QQ 浏览器桌面版通常可以使用 Chrome 版本压缩包进行手动加载。

### 1. 进入扩展管理页

任选一种方式：

- 在地址栏输入 `qqbrowser://extensions`
- 如果上面的地址不可用，尝试 `chrome://extensions/`
- 通过右上角菜单进入 `扩展`、`扩展程序` 或 `应用中心`，再打开 `管理扩展`

### 2. 开启开发者模式

在扩展管理页中找到 `开发者模式` 开关并开启。不同版本的入口位置可能在页面右上角、页面底部或“高级管理”区域。

### 3. 加载扩展目录

1. 点击 `加载已解压的扩展程序`。
2. 选择解压后的 `all-api-hub-<version>-chrome` 目录。
3. 安装后确认扩展处于启用状态。

### 4. 常见处理

- 如果页面没有 `开发者模式`：当前 QQ 浏览器版本可能限制外部扩展安装，建议升级到最新桌面完整版，或改用 Chrome / Edge。
- 如果提示“不是来自 QQ 浏览器商店”：优先使用“加载已解压的扩展程序”，不要直接拖拽压缩包。
- 如果扩展已安装但页面识别失败：刷新目标中转站页面，确认页面不是浏览器兼容模式或特殊安全模式。

<a id="browser-360"></a>

## 360 系浏览器安装

360 安全浏览器和 360 极速浏览器都可能支持 Chromium 扩展，但入口名称和安全提示会随版本变化。

### 1. 确认使用极速模式

360 安全浏览器存在“极速模式 / 兼容模式”等不同内核模式。All API Hub 属于 Chromium 扩展，建议在需要识别的站点页面使用极速模式。

如果地址栏附近显示 `闪电` / `e` 等内核切换图标，请切换到 `极速模式` 后再使用扩展。

### 2. 进入扩展管理页

任选一种方式：

- 在地址栏输入 `chrome://extensions/`
- 通过右上角菜单进入 `扩展`、`扩展管理`、`插件管理` 或 `应用管理`
- 如果有 `高级管理` 入口，先进入高级管理再开启开发者相关选项

### 3. 开启开发者模式并加载

1. 开启 `开发者模式`。
2. 点击 `加载已解压的扩展程序`。
3. 选择解压后的 `all-api-hub-<version>-chrome` 目录。
4. 安装完成后启用 All API Hub，并按需固定到工具栏。

### 4. 常见处理

- 如果浏览器安全策略拦截外部扩展：保持解压加载方式，不要直接拖拽 `.zip` 或 `.crx`。
- 如果扩展重启后被禁用：在扩展管理页手动启用；如仍被禁用，建议换用 Chrome / Edge 或检查浏览器安全策略。
- 如果在某些网页中扩展无效：确认该网页没有切到兼容模式，并刷新安装前已经打开的页面。

<a id="liebao-browser"></a>

## 猎豹浏览器安装

猎豹浏览器可通过内置扩展管理页手动加载 Chrome 版本压缩包。

### 1. 进入扩展管理页

在地址栏输入：

```text
liebao://extensions/
```

如果该地址不可用，请通过浏览器菜单进入 `扩展`、`扩展程序` 或 `插件管理`。

### 2. 开启开发者模式

在扩展管理页中开启 `开发者模式`。

### 3. 加载扩展目录

1. 点击 `加载已解压的扩展程序`。
2. 选择解压后的 `all-api-hub-<version>-chrome` 目录。
3. 安装后确认扩展处于启用状态。

### 4. 常见处理

- 如果浏览器弹出类似“更改此网页是您的本意吗？”的提示，请优先选择保持当前设置，不要让浏览器把主页或标签页设置改掉。
- 如果扩展安装后不生效，请刷新安装前已经打开的目标站点页面。
- 如果当前版本找不到开发者模式或加载入口，建议升级猎豹浏览器桌面版，或改用 Chrome / Edge。

## Brave / Vivaldi / Opera 安装

这些浏览器通常保留了 Chromium 的扩展管理页，只是内部地址不同：

| 浏览器 | 扩展管理页 |
|--------|------------|
| Brave | `brave://extensions/` |
| Vivaldi | `vivaldi://extensions/` |
| Opera | `opera://extensions/` |
| 其他 Chromium 浏览器 | 优先尝试 `chrome://extensions/` |

进入扩展管理页后，按 [其他桌面浏览器通用流程](#desktop-browser-common-flow) 开启开发者模式并加载解压目录即可。

<a id="update-extension"></a>

## 更新扩展

手动加载版本不会自动更新。关于商店版、GitHub Stable 和 Nightly 的区别，请先查看 [安装渠道与更新说明](./extension-update-install.md)。手动加载版本更新时请按下面流程处理：

1. 打开 [最新版本 Release](https://github.com/qixing-jk/all-api-hub/releases/latest)。
2. 下载新的 `all-api-hub-<version>-chrome.zip`。
3. 解压到原来的固定目录，或解压到一个新的版本目录。
4. 打开扩展管理页。
5. 如果仍使用原目录，点击 All API Hub 卡片上的 `重新加载`。
6. 如果换了新目录，先移除旧版本，再加载新目录。

::: warning 注意
不要把扩展目录放在系统临时目录、下载器缓存目录或会被清理的软件目录里。目录被删除或移动后，浏览器会无法加载该扩展。
:::

## 卸载

1. 打开浏览器扩展管理页。
2. 找到 `All API Hub`。
3. 点击 `移除`、`卸载` 或关闭启用开关。
4. 删除本地解压目录。

## 常见问题

### 应该下载 Chrome 包还是 Firefox / Safari 包？

QQ 浏览器、360 系浏览器、猎豹浏览器、Brave、Vivaldi、Opera 等浏览器应下载：

```text
all-api-hub-<version>-chrome.zip
```

不要下载 Firefox 的 `.xpi` / Firefox 包，也不要下载 Safari 的 Xcode bundle。

### 可以直接安装 `.zip` 文件吗？

通常不建议。请先解压，再通过 `加载已解压的扩展程序` 选择包含 `manifest.json` 的目录。

### 为什么安装成功后自动识别还是失败？

常见原因包括：

- 安装前已经打开了目标站点页面，需要刷新页面。
- 目标站点登录态已经失效，需要先在同一浏览器中重新登录。
- 浏览器切到了兼容模式或安全模式，导致 Chromium 扩展没有注入页面。
- 当前浏览器对扩展 API 支持不完整，可换用 Chrome / Edge 复现确认。

### 侧边栏入口不可用怎么办？

部分浏览器不支持 Chrome / Edge 的侧边栏能力。遇到这种情况时，可以使用扩展弹窗或设置页完成账号管理，核心功能不依赖侧边栏。

## 相关文档

- [开始使用](./get-started.md)
- [常见问题](./faq.md)
- [安装渠道与更新说明](./extension-update-install.md)
- [权限管理（可选权限）](./permissions.md)
- [Safari 扩展安装指南](./safari-install.md)

## 参考资源

- [Microsoft Edge 官方文档：本地加载扩展（Chrome 扩展通用流程参考）](https://learn.microsoft.com/microsoft-edge/extensions-chromium/getting-started/extension-sideloading)
- [360 安全浏览器帮助中心：扩展应用](https://browser.360.cn/se/help/extension.html)
- [zTab 文档：猎豹浏览器扩展安装示例](https://docs.ztab.ink/browser-extension/liebao.html)

---

如有问题，请在 [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues) 中反馈。
