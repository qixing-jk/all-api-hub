# Atlas Cloud 用户如何用 All API Hub 统一管理 AI API 资产

> 在 All API Hub 中管理 Atlas Cloud API 凭据：对比模型价格，并快速导出到常用 AI 工具

Atlas Cloud 是全模态 AI 推理平台，一个 AI API 即可访问视频生成、图像生成和 LLM API，覆盖 300+ 精选模型。如果你同时使用多个 Atlas Cloud 账号、多个 AI API 平台，或经常把 Atlas Cloud 配置到不同客户端里，**All API Hub** 可以作为一个本地管理助手，帮你把这些信息放到同一个入口里查看和复用。

添加 Atlas Cloud API 凭据后，你可以在 All API Hub 中查询模型价格，并快速导出到 Cherry Studio、CC Switch、Kilo Code、CLIProxyAPI、Claude Code Router 或自己的自建后台。这样，Atlas Cloud 可以自然接入你的多账号、多工具 API 使用流程。

![All API Hub 首页预览](../static/image/sponsor-guides/atlascloud/all-api-hub-home-preview.png)

---

## 一、All API Hub 是什么？

**All API Hub**（[GitHub 开源](https://github.com/qixing-jk/all-api-hub)）是一款面向 AI API 用户的开源浏览器扩展，适合用来集中管理多个账号、多个站点和多个客户端配置。对 Atlas Cloud 用户来说，它可以把 Atlas Cloud 的 API 密钥、模型价格和导出配置纳入统一工作流。

配合 Atlas Cloud 使用时，核心优势在于：

*   **API 凭据统一管理**：把 Atlas Cloud 的 API Key 保存到 API 凭据库，与其他账号和凭据放在一起集中管理。
*   **跨账号价格对比**：在模型价格页查看 Atlas Cloud 模型价格，并与其他已添加账号的数据一起比较。
*   **凭据快速复用**：把已管理的 `Base URL + API Key` 导出到常用客户端、CLI 工具或自建站点渠道。
*   **一键导出到客户端**：从 API 凭据库直接导出到 Cherry Studio、CC Switch、Kilo Code 等常用工具。
*   **多设备更好衔接**：配合数据导入导出或 WebDAV 同步，把常用配置迁移到其他设备继续使用。

一句话：Atlas Cloud 提供模型和接口，All API Hub 帮你把凭据管理、价格对比和下游工具配置串起来。

---

## 二、安装 All API Hub

为了获得自动更新和最稳定的体验，建议优先通过与你的浏览器匹配的官方商店安装：

### 1. 桌面端浏览器
*   **Chrome 浏览器**：[Chrome Web Store](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo)
*   **Edge 浏览器**：[Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa)
*   **Firefox 浏览器**：[Firefox Add-ons](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24})

### 2. 其他环境
*   **QQ / 360 / Brave / Vivaldi / Opera 等浏览器**：Brave、Vivaldi、Opera 可优先尝试 Chrome Web Store；QQ、360、猎豹等浏览器如果找不到可用商店入口，再使用 Chromium 手动加载方式，详见 [其他浏览器安装指南](https://all-api-hub.qixing1217.top/other-browser-install.html)。
*   **Safari (Mac)**：需要通过 Xcode 或 Safari 专用包安装，详见 [Safari 安装指南](https://all-api-hub.qixing1217.top/safari-install.html)。
*   **手机端**：支持 Edge 手机版、Firefox Android、Kiwi 等，详见 [移动端使用指南](https://all-api-hub.qixing1217.top/faq.html#mobile-browser-support)。
*   **最后备选方案**：如果你的浏览器无法使用商店版或 Chrome Web Store 兼容版本，也无法通过上面的安装指南完成安装，可从 [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases/latest) 下载 Stable 包手动安装。手动安装版本不会像商店版一样自动更新，后续升级需要重新下载并安装。

---

## 三、添加 Atlas Cloud API 凭据

Atlas Cloud 当前不支持自动识别，需要通过 API 密钥手动添加。你先在 Atlas Cloud 控制台创建好 API Key，再把它保存到 All API Hub。

### 为什么适合 Atlas Cloud 用户？

Atlas Cloud 适合接入多种模型和客户端。加入 All API Hub 后，你可以把 Atlas Cloud 放进统一的 AI API 管理流程：

*   在 API 凭据库中统一管理 Atlas Cloud 的 API Key。
*   在模型价格页对比不同账号下的模型成本。
*   在 API 凭据库中查看、复制、编辑和删除 Atlas Cloud API Key。
*   将 Atlas Cloud 密钥继续导出到 AI 客户端，或导入到你自己的自建站点渠道中。

对于已经在多个 AI 工具中使用 Atlas Cloud 的用户，这相当于把“API Key、模型价格、客户端配置”整理成一条更顺的使用链路。

### 3.1 手动添加 API 凭据
1.  在浏览器中登录 [Atlas Cloud](https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub)。
2.  在个人中心进入 **API Keys**，创建并管理你的 API 密钥。

    ![在 Atlas Cloud 控制台创建 API 密钥](../static/image/sponsor-guides/atlascloud/atlascloud-api-key-create.png)
    ![查看 Atlas Cloud API 密钥列表](../static/image/sponsor-guides/atlascloud/atlascloud-api-key-list.png)

3.  点击浏览器右上角的 All API Hub 扩展图标。
4.  点击 **“新增账号”**，在赞助商列表中找到 **Atlas Cloud** 并点击。

    ![在新增账号中选择 Atlas Cloud](../static/image/sponsor-guides/atlascloud/atlascloud-add-account-select.png)

5.  填入密钥并保存。

    ![填入 Atlas Cloud API 密钥并保存](../static/image/sponsor-guides/atlascloud/atlascloud-add-account-save.png)

:::: tip 提示
添加成功后，扩展会使用已导入的 API 密钥读取模型列表和价格等信息。
::::

---

## 四、Atlas Cloud 用户常用场景

### 4.1 对比模型价格
进入 **“模型价格”** 页面，选择 Atlas Cloud 作为数据源。你可以：

*   查看 Atlas Cloud 返回的模型列表。
*   搜索指定模型，测试模型是否可用。
*   查看每个模型的输入/输出价格。
*   与其他已添加账号的模型价格一起比较，选择更适合当前任务的调用方案。

![查看 Atlas Cloud 模型列表与价格](../static/image/sponsor-guides/atlascloud/atlascloud-model-price-list.png)

### 4.2 导出到 AI 客户端
如果你需要将 Atlas Cloud 接入其他工具，可以直接从 All API Hub 导出：

1.  在 **“API 凭据库”** 中找到你的 Atlas Cloud 密钥。
2.  点击导出按钮。
3.  选择目标工具，例如 **Cherry Studio**、**CC Switch**、**Kilo Code**、**CLIProxyAPI**、**Claude Code Router**，或导入到当前已配置的自建托管站点渠道。

![从 API 凭据库导出 Atlas Cloud 密钥](../static/image/sponsor-guides/atlascloud/atlascloud-credential-export-menu.png)

此外还支持以下功能：

*   复制 `Base URL + API Key`，手动填入其他工具。
*   验证接口是否可用，也可以测试 CLI 工具兼容性。
*   在模型列表中查看该凭据可使用的模型列表。
*   将同一份凭据导出到多个常用客户端，减少重复录入。
*   将凭据导入到已配置的自建托管站点，作为新的渠道配置使用。
*   随数据导入导出或 WebDAV 同步一起迁移，便于多设备使用。

::: warning 凭据传输范围
浏览器本地存储只是默认保存位置。导出到 AI 客户端、导入到自建站点、接口或 CLI 兼容性测试，以及 WebDAV 同步，都会把凭据发送到对应的目标地址。请只把 Key 发送给你信任的目标；不再使用时及时吊销。
:::

### 4.3 导入到自建站点渠道
如果你自己有 AI 分发后台，可以把 Atlas Cloud 作为其中一个上游供应商。All API Hub 可以把 Atlas Cloud 密钥作为上游渠道直接导入进去，减少手动创建渠道、填写地址和复制 Key 的步骤。

使用时只需要先在 **“基础设置” → “自建站点管理”** 完成后台配置，然后回到 **“API 凭据库”**，在 Atlas Cloud 凭据中选择导入到当前自建站点；如果要一次处理多个凭据，也可以先勾选后批量导入。

### 4.4 多设备迁移和备份
如果你经常在多台电脑之间切换，可以使用 All API Hub 的数据导入导出或 WebDAV 同步能力迁移配置。默认情况下，数据保存在当前浏览器本地；只有你主动配置 WebDAV 同步时，才会同步到你指定的 WebDAV 存储。

---

## 五、All API Hub vs API 客户端

| 维度 | All API Hub (管理端) | Cherry Studio / NextChat 等 (调用端) |
| --- | --- |----------------------------------|
| **核心定位** | 统一管理 Atlas Cloud 与其他 AI API 账号、密钥、价格和渠道 | 发起对话、模型推理、提示词工程 |
| **主要功能** | API 凭据管理、价格对比、凭据导出、渠道导入 | 聊天对话、文件分析、Agent 工作流 |
| **协同关系** | **整理源头配置**：让 Key、Base URL 和价格集中可用 | **使用这些配置**：拿管理好的凭据去调用模型 |

**建议用法**：用 All API Hub 管理 Atlas Cloud 的 API 密钥、模型价格和导出配置；用你常用的客户端实际发起请求。一个负责管配置，一个负责用模型。

---

## 六、常见问题 FAQ

**Q: All API Hub 会上传我的 API Key 吗？**

A: 默认情况下，账号和密钥信息保存在你的浏览器本地。需要明确：导出到 AI 客户端、导入到自建站点、接口或 CLI 兼容性测试，以及 WebDAV 同步，都会把凭据发送到对应的目标地址；只有当你主动配置 WebDAV 同步时，整体配置数据才会同步到你配置的 WebDAV 存储。请只把 Key 发送给你信任的目标，不再使用时及时吊销。

**Q: All API Hub 最适合哪些 Atlas Cloud 用户？**

A: 如果你有多个 Atlas Cloud 账号、同时使用其他 AI API 平台，或经常把 Atlas Cloud 配置到多个客户端和设备里，All API Hub 可以把这些账号与凭据集中起来管理。即使只从 Atlas Cloud 开始使用，也可以先用它管理密钥和对比模型价格。

**Q: 没有自建后台，也能使用 All API Hub 吗？**

A: 可以。添加 Atlas Cloud 凭据后，就可以使用密钥管理、模型价格对比和客户端导出；自建站点管理适合已经维护 AI 分发后台的用户继续扩展使用。

**Q: 导出到客户端后，客户端还能正常独立使用吗？**

A: 可以。All API Hub 只是帮你生成或填入配置；真正的模型调用仍由 Cherry Studio、CC Switch、Kilo Code、CLIProxyAPI、Claude Code Router 等目标工具完成。

**Q: All API Hub 和 Atlas Cloud 控制台是什么关系？**

A: 两者是配合关系。Atlas Cloud 控制台负责账号、充值和官方服务；All API Hub 更适合把 Atlas Cloud 的 API 密钥、模型价格和客户端配置纳入你的日常管理流程。

---

## 结语

Atlas Cloud 提供丰富的模型与 API 调用入口，All API Hub 则让这些密钥、价格和客户端配置更容易统一管理。

安装插件并添加 Atlas Cloud 凭据后，你可以先从两个最常用的动作开始：对比模型价格、管理密钥并导出到常用客户端。后续如果你需要接入自建后台、多设备同步或批量管理，再逐步启用更完整的管理能力。

*   [Atlas Cloud 官网](https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub)
*   [All API Hub GitHub 仓库](https://github.com/qixing-jk/all-api-hub)
*   [All API Hub 文档](https://all-api-hub.qixing1217.top)