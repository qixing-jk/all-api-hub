import { CURRENCIES, QUOTA_PER_USD } from "~/constants/money"
import { parseAllowanceInstant } from "~/services/accounts/allowances"
import { normalizeManualBalanceUsd } from "~/services/accounts/editing/accountFormValidation"
import {
  balancePosition,
  balanceSnapshotParts,
  balanceSnapshotSchema,
  type BalancePosition,
  type BalanceRefreshPart,
  type BalanceSnapshot,
  type UsageScope,
} from "~/services/amounts/balance"
import { normalizeDecimalUnits, parseDecimal } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_LABEL_KEYS,
  BALANCE_NATURES,
  BALANCE_RELATIONS,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_OBSERVATION_REASONS,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
  type FINANCIAL_ENUMERATION,
} from "~/services/amounts/financialConstants"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  MANUAL_BALANCE_OBSERVATION_KINDS,
  type AccountNativeBalance,
  type SiteAccount,
} from "~/types"
import { isPlainObject } from "~/utils/core/object"
import { sanitizeOriginUrl } from "~/utils/core/url"

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
    ...identity,
    authority:
      identity.authority ??
      sanitizeOriginUrl(request.baseUrl) ??
      "legacy:unknown-authority",
    projects: { kind: SCOPE_SELECTION_KINDS.Unknown },
    keys: { kind: SCOPE_SELECTION_KINDS.Unknown },
    models: { kind: SCOPE_SELECTION_KINDS.Unknown },
    groups: { kind: SCOPE_SELECTION_KINDS.Unknown },
  }
}

/** An unfiltered account report covers all selections independently of wallet spending restrictions. */
export function accountReportingScope(
  request: Parameters<typeof accountBalanceScope>[0],
  identity: Parameters<typeof accountBalanceScope>[1] = {},
): UsageScope {
  return {
    ...accountBalanceScope(request, identity),
    projects: { kind: SCOPE_SELECTION_KINDS.All },
    keys: { kind: SCOPE_SELECTION_KINDS.All },
    models: { kind: SCOPE_SELECTION_KINDS.All },
    groups: { kind: SCOPE_SELECTION_KINDS.All },
  }
}

/** Creates one coherent observation; acceptance and collection merging belong to storage. */
export function accountBalanceSnapshot(
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

/** Local record identity is assigned on save; upstream wallet identity is unchanged. */
export function bindAccountBalance(
  snapshot: BalanceSnapshot,
  accountId: string,
): BalanceSnapshot {
  const subject = { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId }
  return {
    ...balanceSnapshotSchema.parse(snapshot),
    subject,
    positions: snapshot.positions.map((position) => ({
      ...position,
      scope: { ...position.scope, subject },
    })),
  }
}

/** The collection used for balance observations migrated from stored scalars. */
export const LEGACY_STORED_ACCOUNT_BALANCE_COLLECTION = {
  collectionKey: "legacy",
  source: {
    adapter: "legacy",
    operation: "stored-account",
    contractVersion: "1",
    kind: EVIDENCE_KINDS.Legacy,
  },
} as const

/**
 * The old product quota encoded a USD display amount; keep its semantics stale.
 * Native legacy assets retain their recorded units, without consulting today's site type.
 */
export function readAccountBalance(
  data: {
    balance?: unknown
    quota?: number
    nativeBalance?: AccountNativeBalance
    balanceUnavailable?: boolean
  },
  scope: UsageScope,
  capturedAt: number,
): BalanceSnapshot {
  if (data.balance !== undefined)
    return balanceSnapshotSchema.parse(data.balance)
  const native = data.nativeBalance
  const source = {
    ...LEGACY_STORED_ACCOUNT_BALANCE_COLLECTION.source,
    ...(!native && parseDecimal(data.quota) !== undefined
      ? { amountInputs: { quota: parseDecimal(data.quota)! } }
      : {}),
  } as const
  const position = balancePosition({
    id: "legacy",
    collectionKey: LEGACY_STORED_ACCOUNT_BALANCE_COLLECTION.collectionKey,
    scope,
    asset:
      native?.unit === "quota"
        ? { kind: ASSET_KINDS.Quota, ...native.asset }
        : native?.unit === CURRENCIES.USD || native?.unit === "USD_XNO"
          ? { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD }
          : native?.unit === "credits"
            ? {
                kind: ASSET_KINDS.Quota,
                id: `${scope.authority}:legacy-credits`,
                label: "credits",
                displayScale: 1,
                displayLabel: "credits",
              }
            : {
                kind: ASSET_KINDS.Currency,
                code: CURRENCIES.USD,
              },
    value: data.balanceUnavailable
      ? undefined
      : (native?.total ?? normalizeDecimalUnits(data.quota, QUOTA_PER_USD)),
    source,
    observedAt: capturedAt,
  })
  if (position.amount.status === OBSERVATION_STATUSES.Known)
    position.amount = {
      ...position.amount,
      status: OBSERVATION_STATUSES.Stale,
      reason: FINANCIAL_OBSERVATION_REASONS.LegacySemantics,
    }
  const positions = [position]
  if (native?.unit === "USD_XNO") {
    const nano = balancePosition({
      id: "legacy-xno",
      collectionKey: "legacy",
      scope,
      asset: { kind: ASSET_KINDS.Crypto, id: "XNO" },
      value: native.nanoBalance,
      source,
      observedAt: capturedAt,
    })
    if (nano.amount.status === OBSERVATION_STATUSES.Known)
      nano.amount = {
        ...nano.amount,
        status: OBSERVATION_STATUSES.Stale,
        reason: FINANCIAL_OBSERVATION_REASONS.LegacySemantics,
      }
    positions.push(nano)
  }
  return {
    schemaVersion: 2,
    subject: scope.subject,
    capturedAt,
    positions,
    coverage: FINANCIAL_COVERAGE.Unknown,
  }
}

/** Reported and manually selected balances remain independent sources. */
export function getAccountBalanceSnapshots(account: SiteAccount) {
  const authority = sanitizeOriginUrl(account.site_url)
  const scope = accountBalanceScope(
    { baseUrl: account.site_url, accountId: account.id },
    { authority: authority ?? "legacy:unknown-authority" },
  )
  let reported = readAccountBalance(
    account.account_info,
    scope,
    account.last_sync_time,
  )
  const legacy =
    account.account_info.nativeBalance ??
    account.account_info.legacyFinancial?.nativeBalance
  const root = reported.positions.find(
    (position) =>
      position.id === "legacy" &&
      position.amount.source.kind === EVIDENCE_KINDS.Legacy &&
      position.amount.status === OBSERVATION_STATUSES.Stale,
  )
  if (
    root?.amount.status === OBSERVATION_STATUSES.Stale &&
    isPlainObject(legacy) &&
    (legacy.unit === "credits" || legacy.unit === CURRENCIES.USD) &&
    !reported.positions.some(({ id }) => id === "legacy-cash")
  ) {
    const observation = root.amount
    const components = Array.isArray(legacy.components)
      ? legacy.components
      : [
          { kind: "permanent", amount: legacy.permanent },
          { kind: "daily", amount: legacy.daily },
        ]
    const restore = (
      raw: unknown,
      id: string,
      parentId: string,
    ): BalancePosition[] => {
      if (!isPlainObject(raw)) return []
      const value = parseDecimal(raw.amount)
      if (
        value === undefined ||
        reported.positions.some((position) => position.id === id)
      )
        return []
      const label = [
        raw.name,
        raw.scope,
        Array.isArray(raw.unlockedModels)
          ? raw.unlockedModels
              .filter((model) => typeof model === "string")
              .join(", ")
          : undefined,
        raw.unlimited === true ? "∞" : undefined,
      ]
        .filter(
          (part): part is string => typeof part === "string" && part.length > 0,
        )
        .join(" · ")
      const labelKey =
        raw.kind === "permanent"
          ? BALANCE_LABEL_KEYS.Permanent
          : raw.kind === "timed"
            ? BALANCE_LABEL_KEYS.Timed
            : raw.kind === "daily"
              ? BALANCE_LABEL_KEYS.Daily
              : undefined
      const expiresAt =
        typeof raw.expiresAt === "string" ? raw.expiresAt : undefined
      const resetsAt = typeof raw.resetAt === "string" ? raw.resetAt : undefined
      const expiry = parseAllowanceInstant(expiresAt)
      return [
        {
          ...root,
          id,
          parentId,
          relation: BALANCE_RELATIONS.Component,
          ...(label ? { label } : {}),
          ...(labelKey ? { labelKey } : {}),
          ...(raw.kind === "subscription"
            ? { nature: BALANCE_NATURES.Subscription }
            : {}),
          amount:
            raw.unlimited === true
              ? {
                  status: OBSERVATION_STATUSES.Unsupported,
                  source: observation.source,
                  reason: "legacy-unlimited",
                }
              : { ...observation, value },
          ...(expiry === undefined
            ? {}
            : {
                validity: { kind: BALANCE_VALIDITY_KINDS.Expires, at: expiry },
              }),
          ...(!expiresAt && !resetsAt
            ? {}
            : {
                reportedTiming: {
                  ...(expiresAt ? { expiresAt } : {}),
                  ...(resetsAt ? { resetsAt } : {}),
                },
              }),
        },
      ]
    }
    const restored = components.flatMap((raw, index) => {
      const kind = isPlainObject(raw) ? raw.kind : undefined
      const id =
        !Array.isArray(legacy.components) &&
        (kind === "permanent" || kind === "daily")
          ? `legacy-${kind}`
          : `legacy-component:${index}`
      return restore(raw, id, root.id)
    })
    const timedParent =
      restored.find(
        (position) => position.labelKey === BALANCE_LABEL_KEYS.Timed,
      )?.id ?? root.id
    reported = {
      ...reported,
      positions: [
        ...reported.positions,
        ...restored,
        ...(Array.isArray(legacy.timedDetails)
          ? legacy.timedDetails.flatMap((raw, index) =>
              restore(raw, `legacy-timed:${index}`, timedParent),
            )
          : []),
      ],
    }
  }
  const value = normalizeManualBalanceUsd(account.manualBalanceUsd)
  if (value === undefined || authority === undefined)
    return { reported, manual: undefined }
  const manualScope: UsageScope = {
    ...scope,
    models: { kind: SCOPE_SELECTION_KINDS.All },
    groups: { kind: SCOPE_SELECTION_KINDS.All },
    keys: { kind: SCOPE_SELECTION_KINDS.All },
    projects: { kind: SCOPE_SELECTION_KINDS.All },
  }
  // Old overrides have no independent observation clock. Retain their reference
  // timestamp for display, with a distinct contract; never use them as exact history.
  const observedAt =
    account.manualBalanceObservation?.at ?? account.user_updated_at
  return {
    reported,
    manual: accountBalanceSnapshot(
      manualScope,
      [
        balancePosition({
          id: "manual",
          scope: manualScope,
          value,
          observedAt,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          nature: BALANCE_NATURES.Prepaid,
          validity: { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
          source: {
            adapter: "manual",
            operation: "account-editor",
            contractVersion:
              account.manualBalanceObservation?.kind ===
              MANUAL_BALANCE_OBSERVATION_KINDS.Edit
                ? "1"
                : "legacy-clock",
            kind: EVIDENCE_KINDS.Manual,
          },
        }),
      ],
      observedAt,
      FINANCIAL_COVERAGE.Complete,
    ),
  }
}
