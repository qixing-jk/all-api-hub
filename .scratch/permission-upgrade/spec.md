# 原生 CRX 权限升级实测与复现

历史生产构建基线为 `9cff1dacd`；Windows Chrome for Testing 145.0.7632.6 中完成原生安装与更新。三个测试包均是同一份当时 production build，使用同一把临时生成的签名密钥。基线包恢复 [已批准权限列表](../../e2e/fixtures/permission-warnings-baseline.json)，不是历史发行版二进制。以下结果不代表本轮重新实测。

| 阶段 | 当时原生浏览器结果 |
| --- | --- |
| 基线，测试版本 4.3.0 | 人工批准原生安装，保持启用；可选 DNR 与通知尚未授予 |
| 当前权限，测试版本 4.3.1 | 原生更新器下载更新，无需再次批准，仍启用；DNR 已授予且 API 可调用，本地存储标记保留 |
| 正对照，测试版本 4.3.2 | 通知权限提升为必需后，原生更新器将扩展停用，原因为 `permissions_increase` |
| 对照重新批准 | 原生对话框列出通知权限；批准后恢复启用，通知已授予，存储标记保留 |

实验只通过临时浏览器的 policy test 页面允许该测试扩展和回环安装来源，没有 force-install 或自动批准开关；Windows UI Automation 调用的是该隔离浏览器的原生安装/重新批准按钮。临时 profile 与签名密钥已删除，未改用户 profile 或系统策略。

Edge 154.0.4258.62 未提供本实验依赖的本地 policy test 页面，因此 Edge 更新流程未验证。Chrome Web Store 与 Edge Add-ons 分发也未验证。DNR API 可调用不能单独证明请求头隔离，后者由独立浏览器行为测试建立。

## 手动复现工具

保留 [原实验脚本](run-crx-upgrade.mjs) 和 [Windows 原生 UI helper](native-ui.ps1)。它们是依赖 Chromium 内部页面和英文按钮名的手动实验，不纳入 CI 或产品运行路径。脚本运行会创建临时浏览器，自动批准其测试安装与正对照重新启用，并在正常结束时清理临时 profile；不操作日用浏览器。

从仓库根目录执行，需 Windows 交互式桌面、已安装依赖与 Playwright Chromium、可用的原生 policy test 页面及新构建：

```powershell
pnpm build
node .scratch/permission-upgrade/run-crx-upgrade.mjs chromium
```

脚本继续使用固定的实验版本和通知正对照；重新运行前核对当前 manifest 的通知仍为可选、基线未授予 DNR/通知。生成的 CRX、报告和截图属于本地证据，不能提交。浏览器内部 API、安装策略和英文 UI 改变时需要重新检查工具，不能用旧报告证明新版本兼容。

### 原脚本仍有的限制

- 只使用上面的固定 `chromium` 参数复现已验证流程。参数没有白名单校验，其他值也不代表对应浏览器受支持；`edge` 分支只有固定安装路径，且历史实验未通过其 policy test 前提。
- helper 按临时 profile 对应的唯一浏览器主进程定位窗口，再匹配英文按钮。`DialogName` 参数未参与筛选，不能声称校验了对话框标题或扩展名称。复现时不要在该测试浏览器中进行其他操作。
- 临时目录在主 `try` 之前创建，浏览器关闭失败也会中断后续清理。因此异常退出后须检查遗留进程、临时 profile 与签名密钥，不能仅凭有 `finally` 就认为已清理。
- 同一浏览器的报告目录固定，重复运行会覆盖同名报告和截图，失败时还可能混入旧文件。需要保留证据时先移走已有输出，不能把目录中全部文件当成同一次运行的结果。

该实验不替代现有 [权限警告检查](../../scripts/run-permission-warning-check.mjs)。本次归档只检查脚本语法、文档引用和与原脚本的一致性，未重跑原生升级。
