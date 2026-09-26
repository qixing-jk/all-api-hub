# 开发者与进阶工具

> 为高级用户和开发者提供的内置辅助工具，用于调试、视觉定制或深度排查。

## 网格渐变调试工具

**网格渐变调试工具** 是插件内置的一个视觉调试工具，主要用于预览和自定义 [分享快照](./share-snapshot.md) 功能所使用的动态背景效果。

### 核心功能

- **实时预览**：在不同种子值、调色板和布局组合下实时查看背景生成效果。
- **调色板浏览**：查看插件内置的所有颜色组合及其十六进制代码。
- **布局切换**：浏览所有支持的网格变形布局。
- **叠加层模拟**：可以开启/关闭数据叠加层，模拟真实的快照生成效果。

### 如何进入

由于该工具主要用于开发与测试，它没有直接放在常规菜单中。你可以通过以下方式进入：

1. 打开插件的 **“设置”** 页面。
2. 在浏览器地址栏中，在 `options.html` 后面添加 `#mesh-gradient-lab`。
   - 例如：`chrome-extension://<id>/options.html#mesh-gradient-lab`
3. 页面将自动切换到调试视图。

---

## 调试与日志

如果你在使用过程中遇到无法解释的问题，可以利用浏览器自带的开发者工具进行排查。

### 1. 查看背景页 `Service Worker` 日志
- 进入浏览器扩展管理页面 (`chrome://extensions`)。
- 开启 **“开发者模式”**。
- 在 All API Hub 卡片中点击 **“查看视图：Service Worker”**。
- 这里可以看到所有后台请求、自动刷新和 WebDAV 同步的底层日志。

### 2. 查看选项页/弹窗日志
- 在插件弹窗或设置页面上 **点击右键 -> 检查**。
- 切换到 **“Console”** 标签页即可查看 UI 层的日志输出。

---

## 本地验证卸载问卷

卸载反馈问卷页面在 `docs/docs/.vuepress/public/uninstall.html`，由文档站原样发布。默认情况下，本地构建的扩展不会注册卸载页面地址，因此本地卸载不会打开任何页面；需要本地验证时按下述步骤临时打开。

### 1. 本地预览问卷页面

问卷页是纯静态页面，不需要注入任何配置即可打开：

```bash
# 直接打开文件
start docs/docs/.vuepress/public/uninstall.html   # Windows
open docs/docs/.vuepress/public/uninstall.html    # macOS

# 或通过文档站开发服务器（路径与线上一致）
pnpm --dir docs docs:dev
# 然后访问 http://localhost:8080/uninstall.html
```

可以在地址后手动拼参数模拟真实卸载场景：

```text
uninstall.html?uid=analytics-test&v=4.0.0&d=42&lang=zh-CN
```

`d` 表示从安装到卸载的天数。页面在没有 PostHog 配置时不会发送任何网络请求，只会把将要发送的内容打印到浏览器控制台（`[uninstall-survey] not sent`），因此本地预览不会产生统计数据。

### 2. 在本地构建中真正走一次卸载流程

默认 dev/test 构建会跳过注册。开发模式下打开选项页右下角的 **Dev panel**（悬浮球图标），在「Uninstall survey」分区中：

- **Survey target**：显示当前目标地址，可在「本地文档站（`http://localhost:8080/uninstall.html`）」与「线上页面」之间切换，选择会记住。切换后需要重新注册才会生效。
- **Compose URL preview**：只组合并展示地址（不注册），参数可复制。
- **Register uninstall URL**：立刻向浏览器注册当前目标地址；随后在 `chrome://extensions` **移除**扩展，浏览器应打开该页面。注册是显式操作，不受 dev/test 默认跳过限制。
- **Open survey page**：直接打开问卷页预览；会自动去掉 `uid` 参数，预览不会被统计为真实卸载。
- **Clear uninstall URL**：清除已注册的地址。

注意浏览器只在**卸载**后打开该页面，禁用扩展不会触发。后台 Service Worker 控制台中的 `Uninstall survey URL registered` 日志会单独列出参数（URL 的查询串会被日志脱敏器抹掉）。

需要脚本化自动测试时，也可以用环境变量在每次后台启动时自动注册：

```bash
VITE_PUBLIC_UNINSTALL_SURVEY_DEV=1 \
VITE_PUBLIC_UNINSTALL_SURVEY_URL=http://localhost:8080/uninstall.html \
pnpm dev
```

- `VITE_PUBLIC_UNINSTALL_SURVEY_DEV=1` 是关键开关：没有它，dev/test 构建一律跳过自动注册。
- `VITE_PUBLIC_UNINSTALL_SURVEY_URL` 把地址指向本地页面或你自建的测试页面，避免打到线上问卷页。省略时会使用线上地址。

---

## 关联文档

- [分享快照](./share-snapshot.md)
- [隐私政策](./privacy.md)
- [常见问题](./faq.md)
