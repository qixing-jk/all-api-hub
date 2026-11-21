import {
  balanceSnapshotParts,
  type BalancePosition,
  type BalanceRefreshPart,
  type BalanceSnapshot,
  type UsageScope,
} from "~/services/amounts/balance"
import {
  FINANCIAL_COVERAGE,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
  type FINANCIAL_ENUMERATION,
} from "~/services/amounts/financialConstants"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

/** Unknown restrictions remain explicit until the adapter verifies them. */
export function accountBalanceScope<
  T extends Pick<ApiServiceRequest, "baseUrl" | "accountId">,
>(
  request: T,
  identity: {
    walletId?: string
    organizationId?: string
    workspaceId?: string
    authority?: string
  } = {},
): UsageScope {
  return {
    subject: {
      kind: FINANCIAL_SUBJECT_KINDS.Account,
      ...(request.accountId ? { accountId: request.accountId } : {}),
    },
    authority: new URL(request.baseUrl).origin,
    ...identity,
    projects: { kind: SCOPE_SELECTION_KINDS.Unknown },
    keys: { kind: SCOPE_SELECTION_KINDS.Unknown },
    models: { kind: SCOPE_SELECTION_KINDS.Unknown },
    groups: { kind: SCOPE_SELECTION_KINDS.Unknown },
  }
}

/** Creates one coherent observation; acceptance and collection merging belong to storage. */
function accountBalanceSnapshot(
  scope: UsageScope,
  positions: BalancePosition[],
  capturedAt: number,
  enumerationCoverage: BalanceSnapshot["coverage"] = FINANCIAL_COVERAGE.Unknown,
): BalanceSnapshot {
  return {
    schemaVersion: 2,
    subject: scope.subject,
    capturedAt,
    positions,
    coverage:
      enumerationCoverage === FINANCIAL_COVERAGE.Complete &&
      positions.some((p) => p.amount.status !== OBSERVATION_STATUSES.Known)
        ? FINANCIAL_COVERAGE.Partial
        : enumerationCoverage,
  }
}

/** Fixed-shape adapters explicitly declare enumeration separately from amount validity. */
export function accountBalanceObservation(
  scope: UsageScope,
  positions: BalancePosition[],
  capturedAt: number,
  enumeration: (typeof FINANCIAL_ENUMERATION)["Complete" | "Partial"],
) {
  const balance = accountBalanceSnapshot(
    scope,
    positions,
    capturedAt,
    enumeration,
  )
  const balanceRefreshParts: BalanceRefreshPart[] = balanceSnapshotParts(
    balance,
    enumeration,
  )
  return { balance, balanceRefreshParts }
}
