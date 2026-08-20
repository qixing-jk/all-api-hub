# New API 渠道类型编辑契约调研

调研日期：2026-08-20

## 结论

当前实现决定**先支持编辑渠道类型，创建态继续允许选择**。这是一项与 New API 上游一致的敏感管理能力，不把它包装成具有兼容性保证的“渠道类型迁移”。

New API 上游明确允许有 `ChannelSensitiveWrite` 权限的管理员修改 Type，后端会保存并审计该变化。All API Hub 因此保留普通编辑表单中的 Type 选择，并通过完整的最新渠道详情提交更新，避免只投影公共字段时丢失 `other`、`setting`、`settings` 等未编辑字段。

当前支持边界是：

- **保留上游原生编辑能力**：允许切换到当前通用编辑器提供的目标类型，由现有前端校验和上游响应决定是否接受。
- **不承诺自动迁移**：不会自动把旧 `key`、`base_url`、`other`、`setting`、`settings` 转换成目标类型的完整配置。
- **不猜测安全 allowlist**：上游没有发布类型兼容矩阵，不能从类型名称、共同的 API Key 形态或默认 Base URL 推导安全转换。
- **保留未知当前值**：未来或部署自定义 Type 可以在编辑其他字段时原样保留，但不会因此自动成为新的可选目标类型。

## 核对快照

本仓库锁定的上游 commit 与调研时 QuantumNous/new-api 默认分支 HEAD 相同，均为 [`f116414284162ad15d8925f7bca494c109b83e93`](https://github.com/QuantumNous/new-api/commit/f116414284162ad15d8925f7bca494c109b83e93)。因此 pinned 与 current 没有行为差异，下面所有源码链接同时代表两者。

| 检查项 | pinned `f116…` | 当前默认分支 HEAD |
| --- | --- | --- |
| 编辑态 Type 控件 | 可编辑，受敏感写权限控制 | 相同 |
| Type 改变时字段处理 | 部分校验、部分 `settings` 清理；无完整迁移 | 相同 |
| 后端 UpdateChannel | 接收、校验并保存 Type | 相同 |
| 明示转换规则 | 未发现禁止规则或安全 allowlist | 相同 |

## 上游前端行为

### 1. 编辑态 Type 确实可改，但属于敏感操作

官方渠道抽屉在新增和编辑时共用 Type `Combobox`。它只被 `sensitiveLocked` fieldset 禁用，没有因为 `isEditing` 而禁用；控件还启用了 `allowCustomValue`。[官方表单 Type 控件](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/web/src/features/channels/components/drawers/channel-mutate-drawer.tsx#L1976-L2030)

`sensitiveLocked` 的含义是“正在编辑且用户没有敏感写权限”；Type 与 key、Base URL、`setting/settings/other` 一起被列为敏感更新字段。[权限判定](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/web/src/features/channels/components/drawers/channel-mutate-drawer.tsx#L659-L667)、[敏感更新字段](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/web/src/features/channels/hooks/use-channel-mutate-form.ts#L39-L56)

这说明“允许修改”是上游明确支持的管理员能力，不是偶然漏掉 disabled。

### 2. 编辑态改变 Type 不会套用新类型默认值

官方前端有 Type change effect，会给 VolcEngine 设置默认 Base URL、给讯飞设置默认 `other`，但第一行即在编辑态返回：`if (isEditing) return`。[Type change 默认值逻辑](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/web/src/features/channels/components/drawers/channel-mutate-drawer.tsx#L1275-L1294)

因此从 A 类型改到 B 类型时，上游不会把 B 的新增态默认配置自动迁入；管理员需要自行检查当前字段。

### 3. 前端会按新 Type 校验部分专有字段

官方 schema 至少区分：

- Azure、Custom、SunoAPI、VolcEngine、New API 必须有 Base URL；
- Advanced Custom 必须有合法 `advanced_custom` 配置；
- 类型 3、18、21、39、41、49 必须有 `other`（其中当前选项表可确认包括 Azure、讯飞、Cloudflare、Vertex AI、Coze，21 是已隐藏的旧类型）；
- Codex 在填写新 key 时要求 OAuth JSON；
- Vertex AI 对 key 格式和多 key 模式还有专门约束。

来源：[Base URL 与 Advanced Custom 校验](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/web/src/features/channels/lib/channel-form.ts#L286-L327)、[`other`、Codex、Vertex AI 校验](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/web/src/features/channels/lib/channel-form.ts#L329-L378)

这也是不能把“所有能创建的类型”直接当作“可以安全转换到的类型”的原因：类型本身决定表单字段含义与凭证格式。

### 4. 只清理部分 `settings`，并没有完整迁移所有相关字段

编辑表单先把旧渠道的 `type/base_url/setting/settings/other` 全部加载进表单。[编辑初始值](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/web/src/features/channels/lib/channel-form.ts#L504-L600)

提交时，`buildSettingsJSON` 会依据新 Type 添加或删除部分已知子键，例如 `vertex_key_type`、Azure Responses 版本、OpenRouter enterprise、AWS key type、field passthrough 与 `advanced_custom`。[类型专有 `settings` 清理](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/web/src/features/channels/lib/channel-form.ts#L632-L766)

但更新 payload 仍直接携带当前 `base_url`、`setting`、`settings`、`other`；没有通用的“从旧类型迁移到新类型”步骤。[更新 payload](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/web/src/features/channels/lib/channel-form.ts#L827-L880)

key 也不会因 Type 改变而强制重填：编辑时 key 为空会从 payload 删除，UI 文案明确表示留空保留原 key。[更新提交逻辑](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/web/src/features/channels/hooks/use-channel-mutate-form.ts#L92-L121)

所以官方前端提供的是高权限的原始编辑能力，而不是具有原子迁移保证的类型转换器。

## 上游后端行为

### 1. UpdateChannel 接受并保存 Type

`PatchChannel` 直接嵌入完整 `model.Channel`。`UpdateChannel` 对请求体执行 `validateChannel(..., false)`，随后调用 `channel.Update()`；成功后还会将 Type 与原值比较并把 `type` 记入审计变更字段。[UpdateChannel 主流程](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/controller/channel.go#L930-L999)、[保存与 Type 审计](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/controller/channel.go#L1082-L1116)

后端授权层也显式把 Type 变化定义为敏感变化，而不是只读或非法字段。[Type 敏感写判定](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/controller/channel_authz.go#L5-L13)、[敏感字段清单](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/controller/channel_authz.go#L59-L74)

### 2. validateChannel 是“新对象局部有效性校验”，不是类型转换校验

`validateChannel` 会检查：

- 通用 `setting/settings`；
- New API 类型必须有 Base URL；
- Vertex AI 的 `other` 地区 JSON；
- Codex 在新增或请求携带非空 key 时的 OAuth JSON。

来源：[validateChannel](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/controller/channel.go#L473-L539)

它没有读取旧 Type 来判断 `oldType -> newType` 是否允许，也没有转换矩阵、清理计划或强制凭证轮换。更重要的是，校验发生在读取数据库中的原渠道之前。[校验与读取原渠道的顺序](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/controller/channel.go#L945-L983)

当 key 未提供时，模型更新路径会保留已有 key；多 key 分支甚至显式回读原 key。[模型更新与旧 key 保留](https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/model/channel.go#L542-L588)

因此后端能够持久化 Type 变化，但不能证明旧凭证与新类型兼容。

### 3. 未发现明示的禁止/允许转换规则

在官方仓库的渠道前端、`controller/channel.go`、`controller/channel_authz.go`、渠道文档与相关测试中，未发现：

- 禁止编辑 Type 的规则；
- `oldType -> newType` allowlist；
- 类型变化确认步骤；
- 自动清理或迁移所有 `base_url/key/other/setting/settings` 的函数；
- 覆盖类型转换行为的专项测试。

能确认的规则只有“Type 可由有敏感写权限的管理员更新”以及“提交后的新渠道对象必须通过现有的类型局部校验”。

## 对 All API Hub 的处理建议

### 本轮立即行为

1. 新增渠道：Type 可选，继续限制为原生编辑器当前提供的创建类型。
2. 编辑渠道：Type 可修改为当前编辑器提供的目标类型；更新前重新读取最新原生详情，并保留未投影字段。
3. 对未来上游新增或部署自定义的当前 Type：仍可查看和编辑其他字段，并原样保留该 Type。
4. 代码与测试明确记录上游允许并审计 Type 修改，避免后续误恢复为旧版只读行为。
5. 不把“上游 UI 能改”表述为“上游保证转换安全”；管理员仍需检查目标类型所需的凭证、Base URL、附加配置和模型。

这比旧版 All API Hub 的编辑态锁定能力更强，同时如实保留上游原生操作的风险边界。上游拒绝、权限不足或字段校验失败时，沿现有失败契约返回，不声称转换成功。

### 后续可选增强

如果实际使用中需要更强的转换保障，可以单独实现“转换渠道类型”工作流，至少包含：

1. 明示旧 Type 与目标 Type，并要求二次确认；
2. 目标类型完整字段模型，而不是只复用通用字段；
3. 对 `base_url/other/setting/settings` 给出保留、清空、重建的逐字段预览；
4. 凭证格式可能变化时强制输入新 key，不静默沿用旧 secret；
5. 用目标类型校验器验证完整候选对象；
6. 重新拉取或显式确认模型列表与分组；
7. 后端失败时不声称已转换，成功后重新读取详情确认 Type 和相关字段。

在上游没有兼容矩阵的情况下，后续转换工作流也不应维护猜测式 allowlist。可以允许管理员显式选择目标类型，并通过目标类型的完整字段和验证契约 fail closed；若某目标类型尚未被编辑器完整建模，则继续使用当前原生编辑能力，而不宣称自动迁移保障。

## 未决风险

1. New API 的某些部署可能是 fork，可能额外限制 Type 或拥有自定义 Type；应以目标部署版本或网络响应为准。
2. 上游当前 UI 的“任意正整数 + `allowCustomValue`”体现管理员自由度，不代表所有自定义 Type 都能在标准后端工作。
3. 即使两个类型都只显示通用字段，Base URL 默认值、认证 Header、key 格式、relay adapter 与模型能力也可能不同；没有一手契约时不能据此建立安全 allowlist。
4. 本调研只判断 Type 编辑/转换边界，不评估复制渠道或新建后删除旧渠道能否替代转换；后者通常更可回滚，可作为未来 UX 方案比较。

## 调研命令与验证

- `gh api repos/QuantumNous/new-api/commits/HEAD --jq .sha`
- `gh api repos/QuantumNous/new-api/commits/f116414284162ad15d8925f7bca494c109b83e93 --jq .sha`
- `gh api repos/QuantumNous/new-api/git/trees/f116414284162ad15d8925f7bca494c109b83e93?recursive=1`
- `gh api -H 'Accept: application/vnd.github.raw+json' repos/QuantumNous/new-api/contents/<path>?ref=f116414284162ad15d8925f7bca494c109b83e93`
- `gh search code ... repo:QuantumNous/new-api`

未运行产品测试：本次仅新增研究文档，没有修改产品代码、测试、spec 或运行时配置。
