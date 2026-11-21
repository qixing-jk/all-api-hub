import type { TFunction } from "i18next"

import { FINANCIAL_METRIC_KINDS } from "~/components/financialMetricKinds"
import { CURRENCIES } from "~/constants/money"
import { ACCOUNT_SITE_ADAPTER_FAMILIES } from "~/constants/siteType"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import {
  ASSET_KINDS,
  BALANCE_FUNDING,
  BALANCE_ROLES,
} from "~/services/amounts/financialConstants"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"
import type { buildFinancialHistorySeries } from "~/services/history/dailyBalanceHistory/selectors"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"

import type { getFinancialHistoryPresentation } from "./financialHistoryPresentation"
import {
  canSumFinancialHistory,
  getFinancialHistoryDayEntries,
  groupFinancialHistoryMetrics,
} from "./financialHistorySelection"

/** Build native balance metrics and compatible archived USD bridges independently of React state. */
export function buildNativeBalanceHistoryMetrics({
  financialHistory,
  historyPresentation,
  accountDisplayLabelById,
  manualBalanceAccountIds,
  store,
  t,
}: {
  financialHistory: ReturnType<typeof buildFinancialHistorySeries>
  historyPresentation: ReturnType<typeof getFinancialHistoryPresentation>
  accountDisplayLabelById: Map<string, string>
  manualBalanceAccountIds: Set<string>
  store: DailyBalanceHistoryStore | null
  t: TFunction<"balanceHistory">
}) {
  const { metricLabel, optionLabel, displayValue, unitLabel, displayAmount } =
    historyPresentation
  const groups = groupFinancialHistoryMetrics(financialHistory.series)
  const accountName = (id: string) => accountDisplayLabelById.get(id) ?? id
  const labels = groups.map(({ items, sourceSpecific }) =>
    sourceSpecific ? optionLabel(items[0]!) : metricLabel(items[0]!),
  )
  return groups.map(({ key, items }, index) => {
    const first = items[0]!
    const label = labels[index]!
    const unit = unitLabel(first.position.asset)
    const { asset, role } = first.position
    const isAllowance = first.allowance || role === BALANCE_ROLES.Allowance
    const description =
      asset.kind === ASSET_KINDS.Quota
        ? t("balanceHistory:metricHelp.quotaHint", { unit })
        : isAllowance
          ? items.every(
              ({ position }) => position.funding === BALANCE_FUNDING.Granted,
            )
            ? t("balanceHistory:metricHelp.bonusHint")
            : t("balanceHistory:metricHelp.allowanceHint")
          : role === BALANCE_ROLES.Ledger
            ? t("balanceHistory:metricHelp.ledgerHint")
            : t("balanceHistory:metricHelp.nativeHint")
    const overviewEntries = getFinancialHistoryDayEntries(items, -1).map(
      ({ accountId, value, covered, total }) => ({
        accountId,
        accountLabel: accountId ? accountName(accountId) : undefined,
        amount: value === null ? undefined : displayAmount(asset, value),
        covered,
        total,
      }),
    )
    const totals =
      items.length > 1 && canSumFinancialHistory(items)
        ? financialHistory.dayKeys.map((_, day) => {
            const entries = getFinancialHistoryDayEntries(items, day)
            return entries.length === 1 ? entries[0] : undefined
          })
        : undefined
    return {
      key,
      kind:
        first.position.asset.kind === ASSET_KINDS.Quota
          ? FINANCIAL_METRIC_KINDS.Tokens
          : isAllowance
            ? FINANCIAL_METRIC_KINDS.Allowance
            : FINANCIAL_METRIC_KINDS.Balance,
      label:
        labels.filter((other) => other === label).length > 1
          ? `${optionLabel(first)} · ${accountName(first.accountId)}`
          : label,
      unit,
      description,
      currencyCode:
        asset.kind === ASSET_KINDS.Currency ? asset.code : undefined,
      overviewEntries,
      referenceTrendSeries: items.flatMap((item) => {
        const { position, accountId } = item
        const { adapter, contractVersion, operation } = position.amount.source
        const family = getAccountSiteDefinition(adapter)?.adapterFamily
        // These release balances used the same USD denomination as the native wallet.
        const releaseUsdWallet =
          (family === ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api &&
            contractVersion === "usd/v1" &&
            operation === "/api/v1/auth/me:balance") ||
          (family === ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily &&
            contractVersion ===
              NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd &&
            operation === "/api/user/self:quota")
        if (
          !releaseUsdWallet ||
          position.role !== BALANCE_ROLES.Available ||
          asset.kind !== ASSET_KINDS.Currency ||
          asset.code !== CURRENCIES.USD ||
          manualBalanceAccountIds.has(accountId)
        )
          return []
        const firstNative = item.values.findIndex((value) => value !== null)
        const reference = store?.referenceSnapshotsByAccountId[accountId]
        if (!reference || firstNative <= 0) return []
        const values = financialHistory.dayKeys.map((day, index) =>
          index < firstNative ? (reference[day]?.balanceUsd ?? null) : null,
        )
        return values.some((value) => value !== null)
          ? [
              {
                name: `${accountName(accountId)} · ${t("balanceHistory:legacy.title")}`,
                values,
                valueFormatter: (value: number | string) =>
                  `${displayAmount(asset, String(value))} · ${t("balanceHistory:legacy.title")}`,
              },
            ]
          : []
      }),
      totalSeries: totals
        ? {
            name: t("balanceHistory:trend.scopes.total"),
            values: totals.map((entry) =>
              entry?.value == null
                ? null
                : Number(displayValue(asset, entry.value)),
            ),
            valueFormatter: (_value: number | string, day: number) => {
              const entry = totals[day]
              return entry?.value == null
                ? "—"
                : `${displayAmount(asset, entry.value)} · ${t("balanceHistory:native.coverage", { covered: entry.covered, total: entry.total })}`
            },
          }
        : undefined,
      openingEntries: getFinancialHistoryDayEntries(items, 0).flatMap(
        ({ accountId, value, covered, total }) =>
          value === null
            ? []
            : [
                {
                  accountId,
                  amount: displayAmount(asset, value),
                  covered,
                  total,
                },
              ],
      ),
      series: items.map((item) => ({
        name: accountName(item.accountId),
        values: item.values.map((value) =>
          value === null
            ? null
            : Number(displayValue(item.position.asset, value)),
        ),
        valueFormatter: (_value: number | string, day: number) => {
          const value = item.values[day]
          return value == null ? "—" : displayAmount(item.position.asset, value)
        },
      })),
    }
  })
}
