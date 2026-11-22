import type { TFunction } from "i18next"

import type {
  BalancePosition,
  EvidenceRef,
  UsageScope,
} from "~/services/amounts/balance"
import {
  BALANCE_CASH_CLASSIFICATIONS,
  BALANCE_FUNDING,
  BALANCE_INSTRUMENTS,
  BALANCE_LABEL_KEYS,
  BALANCE_NATURES,
  BALANCE_RELATIONS,
  BALANCE_ROLES,
  EVIDENCE_KINDS,
  FINANCIAL_OBSERVATION_REASONS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"

/** Explain retained current balances without exposing protocol reason strings. */
export function getBalanceObservationDescription(
  position: Pick<BalancePosition, "amount">,
  t: TFunction,
): string | undefined {
  if (position.amount.status !== OBSERVATION_STATUSES.Stale) return undefined
  switch (position.amount.reason) {
    case FINANCIAL_OBSERVATION_REASONS.LegacySemantics:
      return t("account:financial.observationReasons.legacy")
    case FINANCIAL_OBSERVATION_REASONS.NotRequested:
      return t("account:financial.observationReasons.notRequested")
    case FINANCIAL_OBSERVATION_REASONS.IncompleteEnumeration:
    case FINANCIAL_OBSERVATION_REASONS.RefreshUnavailable:
      return t("account:financial.observationReasons.missingResponse")
    case FINANCIAL_OBSERVATION_REASONS.RefreshFailed:
      return t("account:financial.observationReasons.refreshFailed")
    case FINANCIAL_OBSERVATION_REASONS.IdentityChanged:
      return t("account:financial.observationReasons.identityChanged")
    default:
      return t("account:financial.observationReasons.unconfirmed")
  }
}

/** Shared details retain the named restriction dimensions instead of flattening them into a warning. */
export function formatBalanceScope(
  scope: UsageScope,
  t: TFunction,
  includeUnknown = false,
): string[] {
  const labels = {
    projects: t("balanceHistory:native.dimensions.projects"),
    keys: t("balanceHistory:native.dimensions.keys"),
    models: t("balanceHistory:native.dimensions.models"),
    groups: t("balanceHistory:native.dimensions.groups"),
    routes: t("balanceHistory:native.dimensions.routes"),
  }
  return (["projects", "keys", "models", "groups", "routes"] as const).flatMap(
    (dimension) => {
      const selection = scope[dimension]
      return !selection ||
        selection.kind === SCOPE_SELECTION_KINDS.All ||
        (!includeUnknown && selection.kind === SCOPE_SELECTION_KINDS.Unknown)
        ? []
        : [
            t("balanceHistory:native.restrictions", {
              dimension: labels[dimension],
              value:
                selection.kind === SCOPE_SELECTION_KINDS.Restricted
                  ? selection.ids.join(", ") || "∅"
                  : t("account:financial.scopeUnknown"),
            }),
          ]
    },
  )
}

type BalanceDescription = Pick<
  BalancePosition,
  | "role"
  | "instrument"
  | "cashClassification"
  | "nature"
  | "funding"
  | "relation"
  | "labelKey"
>

/** Account cards and exported snapshots use the same explicit semantic labels. */
export function getBalanceRoleLabel(
  position: BalanceDescription,
  t: TFunction,
): string {
  switch (position.labelKey) {
    case BALANCE_LABEL_KEYS.Normal:
      return t("account:financial.normalBalance")
    case BALANCE_LABEL_KEYS.Charity:
      return t("account:financial.charityBalance")
    case BALANCE_LABEL_KEYS.Basic:
      return t("account:financial.basicBalance")
    case BALANCE_LABEL_KEYS.Bound:
      return t("account:financial.boundBalance")
    case BALANCE_LABEL_KEYS.Permanent:
      return t("account:financial.permanentBalance")
    case BALANCE_LABEL_KEYS.Timed:
      return t("account:financial.timedBalance")
    case BALANCE_LABEL_KEYS.Daily:
      return t("account:financial.dailyBalance")
    case BALANCE_LABEL_KEYS.TotalTokens:
      return t("account:financial.totalTokens")
    case BALANCE_LABEL_KEYS.PoolTokens:
      return t("account:financial.poolTokens")
    case BALANCE_LABEL_KEYS.AllocatedTokens:
      return t("account:financial.allocatedTokens")
  }
  if (position.instrument === BALANCE_INSTRUMENTS.Voucher)
    return t("account:financial.voucher")
  if (position.cashClassification === BALANCE_CASH_CLASSIFICATIONS.ReportedCash)
    return t("account:financial.cash")
  switch (position.role) {
    case BALANCE_ROLES.Available:
      return t("account:financial.available")
    case BALANCE_ROLES.Ledger:
      return t("account:financial.ledger")
    case BALANCE_ROLES.Reserved:
      return t("account:financial.reserved")
    case BALANCE_ROLES.CreditLimit:
      return t("account:financial.creditLimit")
    case BALANCE_ROLES.Debt:
      return t("account:financial.debt")
    case BALANCE_ROLES.PendingCharge:
      return t("account:financial.pendingCharge")
    case BALANCE_ROLES.Allowance:
      return t("account:financial.allowance")
  }
}

/** Funding names are independent of instrument, cash classification and balance nature. */
export function getBalanceFundingLabel(
  funding: BalanceDescription["funding"],
  t: TFunction,
  includeUnknown = false,
): string | undefined {
  return {
    [BALANCE_FUNDING.Purchased]: t("account:financial.purchased"),
    [BALANCE_FUNDING.Granted]: t("account:financial.granted"),
    [BALANCE_FUNDING.Mixed]: t("account:financial.mixedFunding"),
    [BALANCE_FUNDING.Unknown]: includeUnknown
      ? t("account:financial.unknownFunding")
      : undefined,
  }[funding]
}

/** Nature and funding remain independent; classification can be confined to diagnostics. */
export function getBalanceQualifiers(
  position: BalanceDescription,
  t: TFunction,
  {
    includeUnknown = false,
    includeClassification = true,
  }: { includeUnknown?: boolean; includeClassification?: boolean } = {},
): string[] {
  const nature = {
    [BALANCE_NATURES.Prepaid]: t("account:financial.prepaid"),
    [BALANCE_NATURES.Subscription]: t("account:financial.subscription"),
    [BALANCE_NATURES.Credit]: t("account:financial.credit"),
    [BALANCE_NATURES.Mixed]: includeClassification
      ? t("account:financial.mixedNature")
      : undefined,
    [BALANCE_NATURES.Unknown]: includeUnknown
      ? t("account:financial.unknownNature")
      : undefined,
  }[position.nature]
  const funding = getBalanceFundingLabel(position.funding, t, includeUnknown)
  const qualifiers =
    includeClassification && position.relation === BALANCE_RELATIONS.Component
      ? [t("account:financial.component"), nature, funding]
      : [nature, funding]
  return qualifiers.filter((label): label is string => label !== undefined)
}

/** Provenance names describe upstream contracts and field names, never wallet IDs. */
export function formatBalanceSource(
  source: EvidenceRef,
  t: TFunction,
  includeTechnical = false,
): string {
  const kind =
    source.kind === EVIDENCE_KINDS.Derived
      ? t("account:financial.derived")
      : source.kind === EVIDENCE_KINDS.Manual
        ? t("account:financial.manual")
        : source.kind === EVIDENCE_KINDS.Legacy
          ? t("account:financial.olderRecord")
          : t("account:financial.reported")
  return includeTechnical
    ? `${kind} · ${source.adapter}/${source.operation}@${source.contractVersion}${source.inputs?.length ? ` · ${source.inputs.join(", ")}` : ""}`
    : kind
}

/** Window and reset times retain the upstream timezone and are separate from expiry. */
export function formatBalanceWindow(
  window: BalancePosition["window"],
  t: TFunction,
  locale?: string,
): string[] {
  if (!window) return []
  const format = (at: number) => {
    const instant = new Date(at)
    if (!Number.isFinite(instant.getTime())) return undefined
    try {
      return instant.toLocaleString(locale, {
        timeZone: window.timeZone,
        timeZoneName: "shortOffset",
      })
    } catch {
      // An unsupported zone or locale still has an unambiguous UTC representation.
      return instant.toISOString()
    }
  }
  const start = format(window.start)
  const end = format(window.end)
  const lines =
    start && end
      ? [
          `${t("account:financial.window")}: ${start} – ${end} · ${window.timeZone}`,
        ]
      : []
  if (window.resetsAt !== undefined) {
    const reset = format(window.resetsAt)
    if (reset)
      lines.push(
        `${t("account:financial.resetsAt")}: ${reset} · ${window.timeZone}`,
      )
  }
  return lines
}
