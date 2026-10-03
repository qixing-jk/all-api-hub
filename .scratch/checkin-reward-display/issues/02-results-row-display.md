# 02 — 结果行展示签到奖励

- Status: resolved
- Parent: `../spec.md`
- Blocked by: none（可用测试夹具先行；真实数据依赖 01）

## 目标

在自动签到的执行结果行里，对携带 `reward` 的结果显示本次奖励；没有权威奖励的结果行保持原样，不显示任何金额。

## 实施

1. 数据来源：
   - 账户汇率：`src/features/AutoCheckin/AutoCheckin.tsx:177` 已经加载 `SiteAccount[]`（`accountSetup.accounts`，含 `exchange_rate`），从这里构造 `exchangeRateByAccountId` 传给 `ResultsTable` → `ResultsTableRow`。
   - 显示货币：页面从 `useUserPreferencesContext()` 取 `currencyType`，传给结果表和行。
2. 换算与格式化：复用 `getCurrencySymbol`（`src/utils/core/formatters`）与 `formatMoneyFixed`（`src/utils/core/money`）；quota → 金额的换算沿用账户 `exchange_rate`，与余额/今日收入展示保持一致。
3. 渲染位置：`src/features/AutoCheckin/components/ResultsTableRow.tsx:78` 的消息单元格内，在消息后同行显示 `· +{symbol}{金额}`（不要拼进 message 字符串）。
4. **不要修改 `getAutoCheckinResultMessage`**（`src/features/AutoCheckin/utils/autoCheckin.ts:456`）：它的返回值同时是结果搜索的匹配输入（同文件 `:504`）。
5. 兜底：账户已不在当前账号列表中（取不到汇率）时按"无奖励"处理，不猜汇率、不硬编码汇率。
6. i18n：新增文案 key 放在 `autoCheckin` 命名空间，在所有受支持的应用语言里补齐；key 必须能被 extractor 静态枚举（字面量 `t("autoCheckin:...")`），完成后按 `docs/agents/i18n.md` 跑提取/完整性校验。

## 测试

- `tests/features/AutoCheckin/components/ResultsTable.test.tsx`：带 `reward` 的成功行渲染奖励金额（含 CNY/USD 两种 `currencyType` 与账户汇率换算）；不带 `reward` 的行不出现金额文本；消息文本本身不变。
- 若提取到独立组件，可另加 `ResultsTableRow` 级测试；沿用现有测试文件的 mock 习惯。

## 验收

- 无奖励的行与改动前视觉一致（不出现空占位、不出现 `+0`）。
- 有奖励的失败/跳过行（不应存在该字段）不会被渲染出金额。
- 结果搜索（按文案过滤）行为不因本改动变化。
