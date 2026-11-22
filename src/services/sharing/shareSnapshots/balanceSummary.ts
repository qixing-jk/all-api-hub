import { CURRENCIES } from "~/constants/money"
import {
  parseAllowanceInstant,
  projectAllowancePosition,
  type AccountAllowanceSnapshot,
} from "~/services/accounts/allowances"
import type { Asset } from "~/services/amounts/assets"
import { assetIdentity } from "~/services/amounts/assets"
import {
  balancePositionKey,
  isKnownOrStaleObservation,
  usageScopeKey,
  type Amount,
  type BalanceSnapshot,
} from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_RELATIONS,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import {
  SHARE_BALANCE_PURPOSES,
  type ShareBalanceSummary,
} from "~/services/sharing/shareSnapshots/types"
import { formatAsOfTimestamp } from "~/services/sharing/shareSnapshots/utils"
import type { CurrencyType } from "~/types"
import {
  formatBalanceSource,
  formatBalanceWindow,
  getBalanceQualifiers,
  getBalanceRoleLabel,
} from "~/utils/core/balancePresentation"
import { formatBudgetRules } from "~/utils/core/budgetPresentation"
import { formatBalanceAmount } from "~/utils/core/money"
import { t } from "~/utils/i18n/core"

/** Copy only public asset fields, even when a caller supplies an enriched object. */
export function publicShareAsset(
  asset: Exclude<Asset, { kind: typeof ASSET_KINDS.Unknown }>,
): Exclude<Asset, { kind: typeof ASSET_KINDS.Unknown }>
export function publicShareAsset(asset: Asset): Asset
export function publicShareAsset(asset: Asset): Asset {
  switch (asset.kind) {
    case ASSET_KINDS.Currency:
      return { kind: ASSET_KINDS.Currency, code: asset.code }
    case ASSET_KINDS.Crypto:
      return { kind: ASSET_KINDS.Crypto, id: asset.id }
    case ASSET_KINDS.Quota:
      return {
        kind: ASSET_KINDS.Quota,
        id: asset.id,
        label: asset.label,
        displayLabel: asset.displayLabel,
        displayScale: asset.displayScale,
      }
    case ASSET_KINDS.Unknown:
      return { kind: ASSET_KINDS.Unknown }
  }
}

/** Sharing projects facts without exposing local identities or summing components. */
export function accountShareBalanceSummary(
  snapshot?: BalanceSnapshot,
  allowances?: AccountAllowanceSnapshot,
  asOf = Date.now(),
): ShareBalanceSummary {
  const validAllowances =
    allowances?.entries.filter(
      ({ constraint, validity, reportedTiming }) =>
        (parseAllowanceInstant(reportedTiming?.startsAt) ??
          Number.NEGATIVE_INFINITY) <= asOf &&
        constraint.asset.kind !== ASSET_KINDS.Unknown &&
        (isKnownOrStaleObservation(constraint.remaining) ||
          (constraint.limitState === BUDGET_LIMIT_STATES.Unlimited &&
            (constraint.stateObservation.status ===
              OBSERVATION_STATUSES.Known ||
              constraint.stateObservation.status ===
                OBSERVATION_STATUSES.Stale))) &&
        !(
          constraint.enabled.status === OBSERVATION_STATUSES.Known &&
          !constraint.enabled.value
        ) &&
        !(
          validity.kind === BALANCE_VALIDITY_KINDS.Expires &&
          validity.at <= asOf
        ) &&
        !(
          "resetsAt" in constraint.window &&
          constraint.window.resetsAt !== undefined &&
          constraint.window.resetsAt <= asOf
        ),
    ) ?? []
  const allowanceDisplay = new Map(
    validAllowances.map((entry) => [
      projectAllowancePosition(entry),
      { rules: formatBudgetRules(entry.constraint, t, false), entry },
    ]),
  )
  const positions = [...(snapshot?.positions ?? []), ...allowanceDisplay.keys()]
  return {
    purpose: SHARE_BALANCE_PURPOSES.Account,
    coverage:
      snapshot && allowances
        ? snapshot.coverage === allowances.coverage
          ? snapshot.coverage
          : FINANCIAL_COVERAGE.Partial
        : (snapshot?.coverage ??
          allowances?.coverage ??
          FINANCIAL_COVERAGE.Unknown),
    entries: positions
      .filter(
        (p) =>
          !positions.some(
            (mirror) =>
              p.role === BALANCE_ROLES.Ledger &&
              mirror.relation === BALANCE_RELATIONS.Summary &&
              mirror.role === BALANCE_ROLES.Available &&
              mirror.parentId !== undefined &&
              balancePositionKey(p) ===
                balancePositionKey(mirror, mirror.parentId) &&
              usageScopeKey(p.scope) === usageScopeKey(mirror.scope) &&
              assetIdentity(p.asset) === assetIdentity(mirror.asset) &&
              isKnownOrStaleObservation(p.amount) &&
              mirror.amount.status === p.amount.status &&
              mirror.amount.value === p.amount.value &&
              mirror.validity.kind === p.validity.kind &&
              (mirror.validity.kind !== BALANCE_VALIDITY_KINDS.Expires ||
                (p.validity.kind === BALANCE_VALIDITY_KINDS.Expires &&
                  mirror.validity.at === p.validity.at)) &&
              mirror.amount.observedAt === p.amount.observedAt,
          ),
      )
      .map((p) => {
        const observation = p.amount
        const observed = isKnownOrStaleObservation(observation)
        const { adapter, operation, contractVersion, kind, inputs } =
          p.amount.source
        const asset = publicShareAsset(p.asset)
        const allowance = allowanceDisplay.get(p)
        const unlimited =
          allowance?.entry.constraint.limitState ===
          BUDGET_LIMIT_STATES.Unlimited
        return {
          asset,
          amount:
            observed && asset.kind !== ASSET_KINDS.Unknown
              ? { asset, value: observation.value }
              : undefined,
          status: unlimited
            ? allowance.entry.constraint.stateObservation.status
            : p.amount.status,
          ...(unlimited ? { unlimited: true as const } : {}),
          role: p.role,
          nature: p.nature,
          funding: p.funding,
          cashClassification: p.cashClassification,
          ...(p.labelKey ? { labelKey: p.labelKey } : {}),
          ...(p.reportedTiming
            ? {
                reportedTiming: {
                  startsAt: p.reportedTiming.startsAt,
                  expiresAt: p.reportedTiming.expiresAt,
                  resetsAt: p.reportedTiming.resetsAt,
                },
              }
            : {}),
          instrument: p.instrument,
          relation: p.relation,
          source: {
            adapter,
            operation,
            contractVersion,
            kind,
            inputs:
              inputs && p.role !== BALANCE_ROLES.Allowance
                ? [...inputs]
                : undefined,
          },
          observedAt: observed
            ? observation.observedAt
            : unlimited &&
                "observedAt" in allowance.entry.constraint.stateObservation
              ? allowance.entry.constraint.stateObservation.observedAt
              : undefined,
          ...(allowanceDisplay.has(p)
            ? { allowanceRules: allowance?.rules }
            : {}),
          scope: {
            projects: p.scope.projects.kind,
            keys: p.scope.keys.kind,
            models: p.scope.models.kind,
            groups: p.scope.groups.kind,
            ...(p.scope.routes ? { routes: p.scope.routes.kind } : {}),
          },
          validity:
            p.validity.kind === BALANCE_VALIDITY_KINDS.Expires
              ? { kind: BALANCE_VALIDITY_KINDS.Expires, at: p.validity.at }
              : { kind: p.validity.kind },
          window: p.window
            ? {
                start: p.window.start,
                end: p.window.end,
                timeZone: p.window.timeZone,
                resetsAt: p.window.resetsAt,
              }
            : undefined,
        }
      }),
  }
}

/** Combine only the eligible monetary pair while retaining every other native asset. */
export function getShareBalanceDisplayAmounts(
  summary: ShareBalanceSummary | undefined,
  currencyType?: CurrencyType,
): Amount[] {
  const native = summary?.amounts ?? []
  const value = currencyType
    ? summary?.convertedCurrencyTotals?.[currencyType]
    : undefined
  if (value === undefined || !currencyType) return native
  let included = false
  return native.flatMap((amount) => {
    if (
      amount.asset.kind !== ASSET_KINDS.Currency ||
      (amount.asset.code !== CURRENCIES.USD &&
        amount.asset.code !== CURRENCIES.CNY)
    )
      return [amount]
    if (included) return []
    included = true
    return [
      { asset: { kind: ASSET_KINDS.Currency, code: currencyType }, value },
    ]
  })
}

/** Canvas and caption use the same per-account monetary conversion as the overview. */
export function formatOverviewShareBalance(
  amount: NonNullable<ShareBalanceSummary["amounts"]>[number],
  summary: ShareBalanceSummary | undefined,
  locale?: string,
  currencyType?: CurrencyType,
): string {
  const converted =
    currencyType === CURRENCIES.CNY &&
    amount.asset.kind === ASSET_KINDS.Currency &&
    amount.asset.code === CURRENCIES.USD
      ? summary?.usdInCny
      : currencyType === CURRENCIES.USD &&
          amount.asset.kind === ASSET_KINDS.Currency &&
          amount.asset.code === CURRENCIES.CNY
        ? summary?.cnyInUsd
        : undefined
  if (converted !== undefined && currencyType) {
    return formatBalanceAmount(
      {
        asset: { kind: ASSET_KINDS.Currency, code: currencyType },
        value: converted,
      },
      locale,
    )
  }
  return formatBalanceAmount(amount, locale)
}

/** Include full balance details in the share caption. */
export function shareBalanceLines(
  summary?: ShareBalanceSummary,
  locale?: string,
  currencyType?: CurrencyType,
  exchangeRate?: number,
): string[] {
  if (!summary) return [t("account:financial.legacy")]
  const lines =
    summary.purpose === SHARE_BALANCE_PURPOSES.Account
      ? summary.entries.map((entry) => {
          const assetLabel =
            entry.asset.kind === ASSET_KINDS.Currency
              ? entry.asset.code
              : entry.asset.kind === ASSET_KINDS.Crypto
                ? entry.asset.id
                : entry.asset.kind === ASSET_KINDS.Quota
                  ? entry.asset.displayLabel
                  : ""
          const value = entry.unlimited
            ? t("keyManagement:dialog.unlimitedQuota")
            : entry.amount
              ? formatBalanceAmount(
                  entry.amount,
                  locale,
                  currencyType,
                  exchangeRate,
                )
              : `${assetLabel} ${t("shareSnapshots:financial.unavailable")}`.trim()
          const qualifiers = [
            ...getBalanceQualifiers(entry, t),
            entry.source.kind === EVIDENCE_KINDS.Manual
              ? t("account:financial.manual")
              : undefined,
            entry.source.kind === EVIDENCE_KINDS.Legacy
              ? t("account:financial.legacy")
              : undefined,
            Object.values(entry.scope).includes(
              SCOPE_SELECTION_KINDS.Restricted,
            )
              ? t("account:financial.restricted")
              : undefined,
            entry.validity.kind === BALANCE_VALIDITY_KINDS.Expires
              ? t("account:financial.expires", {
                  date: formatAsOfTimestamp(entry.validity.at, locale),
                })
              : undefined,
            entry.observedAt
              ? formatAsOfTimestamp(entry.observedAt, locale)
              : undefined,
            ...formatBalanceWindow(entry.window, t, locale),
            entry.reportedTiming?.startsAt && !entry.window
              ? `${t("account:financial.startsAt")}: ${entry.reportedTiming.startsAt}`
              : undefined,
            entry.reportedTiming?.expiresAt &&
            entry.validity.kind !== BALANCE_VALIDITY_KINDS.Expires
              ? `${t("account:financial.expires", { date: entry.reportedTiming.expiresAt })}`
              : undefined,
            entry.reportedTiming?.resetsAt &&
            entry.window?.resetsAt === undefined
              ? `${t("account:financial.resetsAt")}: ${entry.reportedTiming.resetsAt}`
              : undefined,
            ...(entry.allowanceRules ?? []),
            formatBalanceSource(entry.source, t),
          ].filter(Boolean)
          const label = getBalanceRoleLabel(entry, t)
          const statePrefix =
            entry.status === OBSERVATION_STATUSES.Stale
              ? `${t("account:financial.lastKnown")} · `
              : ""
          return `${statePrefix}${label}: ${value}${qualifiers.length ? ` · ${qualifiers.join(" · ")}` : ""}`
        })
      : (getShareBalanceDisplayAmounts(summary, currencyType).map((amount) => {
          const value = formatOverviewShareBalance(
            amount,
            summary,
            locale,
            currencyType,
          )
          const nativeMoney = (summary.amounts ?? []).filter(
            ({ asset }) =>
              asset.kind === ASSET_KINDS.Currency &&
              (asset.code === CURRENCIES.USD || asset.code === CURRENCIES.CNY),
          )
          if (
            currencyType &&
            summary.convertedCurrencyTotals?.[currencyType] !== undefined &&
            amount.asset.kind === ASSET_KINDS.Currency &&
            amount.asset.code === currencyType &&
            (nativeMoney.length > 1 ||
              nativeMoney.some(
                ({ asset }) =>
                  asset.kind === ASSET_KINDS.Currency &&
                  asset.code !== currencyType,
              ))
          )
            return `${value} · ${nativeMoney.map((native) => formatBalanceAmount(native, locale)).join(" · ")}`
          return amount.asset.kind === ASSET_KINDS.Currency &&
            (amount.asset.code === CURRENCIES.USD ||
              amount.asset.code === CURRENCIES.CNY) &&
            currencyType !== undefined &&
            amount.asset.code !== currencyType &&
            value !== formatBalanceAmount(amount, locale)
            ? `${value} · ${formatBalanceAmount(amount, locale)}`
            : value
        }) ?? [])
  if (summary.referenceAmount)
    lines.push(
      `${t("account:financial.lastKnown")} · ${formatBalanceAmount(summary.referenceAmount, locale)}`,
    )
  if (!lines.length) lines.push(t("shareSnapshots:financial.unavailable"))
  if (summary.lastKnownCount) lines.push(t("account:financial.lastKnown"))
  lines.push(
    summary.coverage === FINANCIAL_COVERAGE.Complete
      ? t("shareSnapshots:financial.complete")
      : summary.coverage === FINANCIAL_COVERAGE.Partial
        ? t("shareSnapshots:financial.partial")
        : t("shareSnapshots:financial.unknown"),
  )
  if (summary.eligibleCount !== undefined)
    lines.push(
      t("account:financial.coverage", {
        included: summary.includedCount,
        eligible: summary.eligibleCount,
      }),
    )
  if (summary.duplicateCount)
    lines.push(
      t("account:financial.duplicates", { count: summary.duplicateCount }),
    )
  if (summary.conflictCount)
    lines.push(
      t("account:financial.conflicts", { count: summary.conflictCount }),
    )
  if (summary.potentialDuplicateCount)
    lines.push(
      t("account:financial.potentialDuplicates", {
        count: summary.potentialDuplicateCount,
      }),
    )
  if (summary.manualCount) lines.push(t("account:financial.manualContribution"))
  return lines
}

/** Use the purpose label shared by the account summary and export. */
export function shareBalanceTitle(summary?: ShareBalanceSummary): string {
  return summary?.purpose === SHARE_BALANCE_PURPOSES.Prepaid
    ? t("account:financial.prepaidTotal")
    : summary?.purpose === SHARE_BALANCE_PURPOSES.Available
      ? t("account:financial.availableTotal")
      : t("shareSnapshots:labels.balance")
}
