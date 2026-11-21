import { assetIdentity } from "~/services/amounts/assets"
import type { UsageScope } from "~/services/amounts/balance"
import { sumDecimals } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_ROLES,
} from "~/services/amounts/financialConstants"
import type { FinancialHistorySeries } from "~/services/history/dailyBalanceHistory/selectors"

/** Compare native metrics without combining different roles or asset identities. */
export function financialHistoryComparisonKey(
  item: FinancialHistorySeries,
): string {
  const { asset } = item.position
  return JSON.stringify([
    assetIdentity(asset),
    asset.kind === ASSET_KINDS.Quota
      ? [asset.displayScale, asset.displayLabel]
      : null,
    item.position.role,
    item.position.nature,
    item.position.instrument,
    item.position.cashClassification,
    Boolean(item.allowance),
  ])
}

/** Keep compatible account series together and expose ambiguous sources separately. */
export function groupFinancialHistoryMetrics(
  series: readonly FinancialHistorySeries[],
) {
  const groups = new Map<string, FinancialHistorySeries[]>()
  for (const item of series) {
    if (
      item.position.asset.kind === ASSET_KINDS.Unknown ||
      !item.values.some((value) => value !== null)
    )
      continue
    const key =
      item.allowance || item.position.parentId
        ? JSON.stringify([item.key])
        : JSON.stringify([
            financialHistoryComparisonKey(item),
            item.position.label,
          ])
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }

  return Array.from(groups).flatMap(([key, items]) =>
    new Set(items.map((item) => item.accountId)).size < items.length
      ? items.map((item) => ({
          key: `native:${item.key}`,
          items: [item],
          sourceSpecific: true,
        }))
      : [{ key: `native:${key}`, items, sourceSpecific: false }],
  )
}

/** Distinct upstream wallet, organization or workspace identities prove independent funds. */
export function haveIndependentHistoryScopes(
  accounts: UsageScope[][],
): boolean {
  return accounts.every((scopes, index) =>
    accounts
      .slice(0, index)
      .every((others) =>
        scopes.every((scope) =>
          others.every(
            (other) =>
              scope.authority !== other.authority ||
              (["walletId", "organizationId", "workspaceId"] as const).some(
                (key) =>
                  Boolean(
                    scope[key] && other[key] && scope[key] !== other[key],
                  ),
              ),
          ),
        ),
      ),
  )
}

/** Identify wallet series that can be totaled without double-counting. */
export function canSumFinancialHistory(
  items: FinancialHistorySeries[],
): boolean {
  const position = items[0]?.position
  return Boolean(
    position &&
    !position.parentId &&
    (position.role === BALANCE_ROLES.Ledger ||
      position.role === BALANCE_ROLES.Available) &&
    haveIndependentHistoryScopes(items.map(({ position }) => [position.scope])),
  )
}

/** Sum compatible, independent wallets on the same day and list other observations separately. */
export function getFinancialHistoryDayEntries(
  items: FinancialHistorySeries[],
  day: number,
): Array<{
  accountId?: string
  value: string | null
  covered: number
  total: number
}> {
  const positions = items.map(({ accountId, values }) => ({
    accountId,
    value: values.at(day) ?? null,
  }))
  if (items.length === 1 || canSumFinancialHistory(items)) {
    const known = positions.flatMap(({ value }) =>
      value === null ? [] : [value],
    )
    try {
      return [
        {
          value: known.length > 1 ? sumDecimals(known) : (known[0] ?? null),
          covered: known.length,
          total: items.length,
        },
      ]
    } catch {
      // A subtotal outside the decimal bounds must not hide individual values.
    }
  }
  return positions.map(({ accountId, value }) => ({
    accountId,
    value,
    covered: value === null ? 0 : 1,
    total: 1,
  }))
}
