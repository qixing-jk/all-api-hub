# GitHub Actions 自托管自动更新（Issue #190）

Status: implemented
Issue: https://github.com/qixing-jk/all-api-hub/issues/190

## 目标

让 GitHub Stable 与 Nightly 两个手动安装渠道具备真正的自动更新能力，同时保持商店渠道不变。核心动机是「商店正式版之前先做 beta 测试，用户抢先体验」。

## 已确认的约束

- **Chromium 自托管更新（CRX + `update_url`）在 stock Chrome/Edge 上需要管理员级策略**：`ExtensionInstallAllowlist` 提供阻止列表豁免，`ExtensionInstallSources` 允许匹配的 CRX 下载地址及 referrer，并不限制只能安装本扩展。GitHub 附件共享域名的信任范围已在三语安装文档和模板旁说明。Windows Edge 另要求 AD 域加入（Entra-only 不足，混合加入可以）；HKLM / MDM 策略不能代替设备前提。Linux 无此限制，QQ/360 等分支浏览器行为不一。
- **Firefox unlisted 通道本次不做**：AMO 的版本号命名空间按 add-on ID 共享且不可复用，复用 `{bc73541a-…}` 会占用商店版的版本号；Nightly 每次滚动构建都需唯一版本号。商店版更新速度已足够。
- **manifest 内的 `update_url` 在 stock Chrome 上会导致 `CRX_REQUIRED_PROOF_MISSING`**，除非配套策略。因此只有明确标注为「自更新」的构建才写入该字段。
- **稳定的 manifest URL** 用 GitHub Releases 固定资产名实现：`releases/latest/download/updates.xml`（stable）与 `releases/download/nightly/updates.xml`（nightly，tag 本来就 force-move），不需要改动 gh-pages。

## 方案

### 1. 渠道与构建输入

- `package-distribution.mjs` 为 `github-release` / `github-nightly` 的 **chrome** 目标额外产出 `*.crx`。
- 新增构建环境变量 `AAH_SELF_UPDATE_URL`：只在非空时把 `update_url` 写进 manifest。商店渠道、firefox、safari 永不写入。
- CRX 签名私钥来自 `AAH_CRX_PRIVATE_KEY`（base64 PKCS#8 PEM），缺失时构建报错而不是静默产出无法更新的包。
- CRX 打包用 `crx3`（纯 JS，Node ≥22，无需 Chrome 二进制）；扩展 ID 由公钥 SHA-256 派生，与 `chrome://extensions` 显示一致，写进 `updates.xml` 的 `appid`。

### 2. updates.xml 生成

- 新增 `scripts/generate-crx-update-manifest.mjs`：输入版本、CRX 固定下载 URL、扩展 ID，输出 `<gupdate>` XML。
- stable 的 `codebase` 指向 `releases/latest/download/all-api-hub-chrome.crx`（固定资产名，需要在上传时用固定名而非版本名）。
- nightly 的 `codebase` 指向 `releases/download/nightly/all-api-hub-nightly-chrome.crx`。
- XML 同时作为 release 附件上传，供 `update_url` 拉取。

### 3. CI

- `build-and-publish.yml`：release 构建产出并上传 `all-api-hub-chrome.crx` + `updates.xml`。
- `nightly-release.yml`：nightly 构建产出 `all-api-hub-nightly-chrome.crx` + `updates.xml`，`--clobber` 覆盖。
- 两个 workflow 都从 secrets 读取签名私钥；缺失时该步骤跳过并给出明确 annotation，不阻断其他产物。

### 4. 插件内更新面板

- 新增 `RELEASE_UPDATE_REASONS` 之外的展示分支：当构建带 `update_url` 时，`UpdateAvailable` 状态的文案改为「浏览器将自动更新」，动作按钮改为「在扩展页手动检查更新」，而不是引导下载 zip。
- `distributionChannel` 保持 github-release / github-nightly 不变（用户可见渠道语义不变），自更新能力由单独的 `selfUpdate` 状态位表达。

### 5. 文档

- 新增 `docs/docs/extension-auto-update.md`（zh 源 + en/ja 同步），说明：适用条件、策略配置（Windows 注册表 `.reg`、macOS `.mobileconfig`、Linux 无需配置）、验证步骤、以及为什么 stock Chrome 默认不可用。
- 提供 `resources/crx-self-update/` 下的 `.reg` 与 `.mobileconfig` 模板（扩展 ID 占位）。
- 更新 `extension-update-install.md` 与 `other-browser-install.md` 的「手动版不会自动更新」表述。
- 更新三处 `docs/docs/.vuepress/config.js` 导航。

## 验证

- 单测：`updates.xml` 生成、`update_url` 只写自更新构建、CRX ID 派生、面板状态映射。
- 本机实测：用 `.scratch/permission-upgrade/` 的原生升级 harness，在 Chrome for Testing 里跑 4.6.0 → 4.6.1 的自托管升级，确认无需二次批准且存储保留。
- `pnpm i18n:extract:ci`、`pnpm compile`、相关 vitest。

## 不做

- Firefox unlisted 签名通道。
- 自动下载/静默安装：浏览器负责下载，插件只负责提示状态。
- 商店渠道的任何变更。


## 实现记录（2026-10-25）

- CRX3 签名以 `scripts/crx-self-update.mjs` 内的纯 `node:crypto` 实现完成，输出与 `crx3@2.0.0` 参考实现逐字节一致（同一 key+zip 验证过）；因此没有新增依赖，lockfile 无变更。
- `packCrx3` 签名域：`CRX3 SignedData` + header 长度 + `SignedData{crx_id}` + zip 字节。
- 扩展 ID 由签名公钥 SHA-256 前 16 字节映射 a-p；与 crx3 的 `encodeAppId` 一致。
- `createDistributionBuildPlan` 新增第 4 个目标（chrome + selfUpdate），输出目录 `.output/distribution/<channel>/chrome-crx`；产物落在 `.output`：`all-api-hub-chrome.crx`（stable）/`all-api-hub-nightly-chrome.crx`（nightly）+ `updates.xml`。
- 无签名 key 时构建告警跳过 CRX 对，不阻塞其他产物；`AAH_REQUIRE_CRX_SELF_UPDATE`（CI 由 vars `CRX_SELF_UPDATE_REQUIRED` 控制）可改为硬失败。
- CI：`package-extension` action 新增 `crx-signing-key` / `require-crx-self-update` 输入与 `crx-files` 输出；build-and-publish 与 nightly 上传 `.crx`+`updates.xml`（nightly `--clobber` 覆盖，stable 走 `releases/latest/download` 固定名）。
- 插件侧 `ReleaseUpdateStatus` 新增 `selfUpdate` 布尔（manifest 是否带 update_url），检查结果新 outcome `self-update-pending`，动作改为「查看更新说明」而不是引导下载 zip。
- 文档：新增 `chromium-crx-self-update.md`（zh/en/ja + 三处 config.js 导航）；`extension-update-install`、`other-browser-install`、`get-started` 三语的「手动版不会自动更新」表述补充 `.crx` 替代方案。
- 8 个 locale 的 `settings:releaseUpdate` 新增 `helpers.selfUpdate`、`states.selfUpdatePending`、`viewReleaseNotes`，i18n:status 100%。

## 维护者操作

1. 已完成（2026-10-25）：生成 4096 位 RSA 私钥，base64 写入仓库 secret `CRX_SIGNING_KEY`，并用它跑通 stable / nightly 两渠道打包。本地私钥在主 worktree 的 `.crx-signing-key.pem`，受 `*.pem` 忽略规则与本机 `.git/info/exclude` 保护；应离线备份，不要放进任何工作树或上传。一旦首个 `.crx` 发布，该 key 不可更换（换了 ID 变、所有已装实例收不到更新）。
2. 已完成：扩展 ID `oligofghjlogjhmnhnhccnobbginfgmp` 已回填三语文档正文与 `resources/crx-self-update/` 四个策略模板（原 `EXTENSION_ID` 占位）。
3. 未设置：repo variable `CRX_SELF_UPDATE_REQUIRED=true`。key 已在位，缺 key 时默认告警跳过；只有想让缺 key 变成硬失败时才需要开启。

## 本机原生升级验证（2026-10-25）

复用 `.scratch/permission-upgrade/` 的原生 harness（Chrome for Testing 145.0.7632.6，Windows，policy test 页面注入 ExtensionInstallAllowlist + ExtensionInstallSources）：

- 浏览器按 Omaha 协议请求 `/update?...x=id%3D<id>%26v%3D4.3.0...`（与我们 `updates.xml` 的 gupdate 格式同构），随后下载 `/extension.crx` 完成安装。
- 4.3.0 → 4.3.1 升级：无二次批准、保持 ENABLED、`chrome.storage.local` 探针保留。
- 4.3.2 正对照（通知权限升为必需）：`permissions_increase` 停用 → 原生对话框重新批准后恢复。
- 报告与截图在 `.scratch/permission-upgrade/crx-chromium/`（harness 自身忽略规则内，不入库）。

结论：CI 产出的 `.crx` + `updates.xml` 组合与浏览器更新器的实际协议相符；发布产物上传到 Releases 固定资产名后，已安装实例即可自动更新。


## 真实密钥端到端实测（2026-10-25）

在主 worktree 生成正式签名密钥（4096 位 RSA，PKCS#8 PEM，路径 `.crx-signing-key.pem`，由 `*.pem` 忽略规则与 `.git/info/exclude` 双重保护），用 `AAH_CRX_PRIVATE_KEY_PATH` 走完整 `package-distribution.mjs`：

- 派生扩展 ID `oligofghjlogjhmnhnhccnobbginfgmp`。
- stable 渠道产出 `all-api-hub-chrome.crx`（7,322,800 B）+ `updates.xml`；nightly 渠道产出 `all-api-hub-nightly-chrome.crx` + 指向 `releases/download/nightly/...` 的 `updates.xml`。
- 独立脚本重算校验：`Cr24`/format 3 头、签名用该私钥验证通过、内嵌公钥等于签名私钥 SPKI、`SignedData.crx_id` 等于 `sha256(pubkey)[0:16]`、`crx_id` 与 `updates.xml` 的 `appid` 一致——全部通过。
- 清单隔离：`.crx` 内 `manifest.json` 带 `update_url`（stable/nightly 各自正确）；三个普通发布 ZIP 的 `update_url` 均为空。
- 每个渠道的源 ZIP 内 `distribution.json` 的 channel 正确。
- 门禁：无 key 默认告警跳过；无 key 且 `AAH_REQUIRE_CRX_SELF_UPDATE` 为真时抛错；有 key 正常产出。

密钥卫生：生成时副产的 `.b64` 副本曾被并发 session 的 `git add` 暂存，已撤出 index 并删除；`git rev-list --all --objects` 确认密钥从未进入任何提交或 object。

## 审查修复（2026-10-26）

- 原生 CRX 更新只比较 `manifest.version`，不会读取插件内的构建提交比较结果。此前原生升级实测只证明较高数字版本的升级协议，不能证明同版本 Nightly 能更新。
- Nightly CRX 改用 UTC `年.月日.时分.秒毫秒`（`YYYY.MMDD.HHMM.SSmmm`）作为浏览器版本，例如 `2026.1026.459.59999`；每段均不超过 65535，跨毫秒、分钟、日期、月份和年份维持时间顺序。打包入口冻结一次构建时间并传给 WXT，避免同次构建的多次清单求值产生不同版本。`version_name` 保留包版本，Stable、普通 ZIP、商店和其他浏览器沿用原版本策略。
- Nightly 与 Stable 使用同一签名 ID，但前者数字版本更高；从 Nightly CRX 切回 Stable CRX 需要备份、卸载、重装和恢复，已同步三语文档。
- 产物收集和 Stable/Nightly 上传只在 XML 存在时加入上传列表，恢复缺密钥时仅发布 ZIP 的路径；普通目标显式清空继承的自更新 URL。
- Edge 的 macOS 策略配置使用独立标识和 UUID，避免替换 Chrome 配置。Chrome 原标识保留。
- 回归入口：`tests/config/crxReleaseArtifacts.test.ts` 执行实际 workflow shell（远端上传使用本地验证替身），`wxtSelfUpdate.test.ts` 验证版本边界和渠道隔离，`distributionPackaging.test.ts` 验证继承环境隔离，`crxPolicyProfiles.test.tsx` 解析策略 XML 并验证身份互不冲突。
- 本地验收入口与保留证据：`artifacts/acceptance.md`、`artifacts/pack-acceptance.mjs`、`artifacts/package-nightly*.log`。首次实际打包因 Windows PATH 没有 `unzip` 失败，保留失败日志；验收脚本随后只为自身进程补充 Git 的 `usr/bin`。测试签名密钥仅在内存生成，不使用正式密钥。浏览器原生安装和真实 macOS/MDM 下发未在本次修复重跑。

- PR #1761 后续反馈：Nightly 打包前在缺密钥时查询发布附件；已有 CRX 或 `updates.xml` 则失败，尚未启用的渠道仍可仅发布 ZIP，API 失败也阻止继续。回归测试执行真实步骤 Shell，覆盖 CRX/XML、未启用、查询失败及已配置密钥。三语文档、四个策略模板与模板 README 同步设备前提及共享来源信任说明；未改变托管源或全局阻止策略。本轮本地及远端验收保留在 `artifacts/pr-1761-feedback.md`。
