import { CURRENCIES } from "~/constants/money"
import {
  balanceSnapshotSchema,
  evidenceSchema,
  isKnownOrStaleObservation,
  observationWindowSchema,
  usageScopeSchema,
} from "~/services/amounts/balance"
import { budgetConstraintSchema } from "~/services/amounts/budgets"
import { parseDecimal } from "~/services/amounts/decimal"
import {
  FINANCIAL_COVERAGE,
  MEASUREMENT_UNIT_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { SiteHealthStatus } from "~/types"
import type {
  ApiCredentialTelemetryAttempt,
  ApiCredentialTelemetryBalanceFact,
  ApiCredentialTelemetryFacts,
  ApiCredentialTelemetrySnapshot,
  ApiCredentialTelemetrySource,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES,
  API_CREDENTIAL_TELEMETRY_FACT_UNITS,
  API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES,
  API_CREDENTIAL_TELEMETRY_SOURCES,
} from "~/types/apiCredentialProfiles"
import { toOptionalFiniteNumber } from "~/utils/core/number"

/** Persisted flat fields accepted only when migrating pre-facts snapshots. */
type LegacyTelemetrySnapshotFields = {
  balanceUsd?: unknown
  todayCostUsd?: unknown
  todayRequests?: unknown
  todayTokens?: unknown
  unlimitedQuota?: unknown
  totalUsedUsd?: unknown
  totalGrantedUsd?: unknown
  totalAvailableUsd?: unknown
  expiresAt?: unknown
  models?: unknown
}

/** Canonical and legacy snapshots retain the same optional token counters. */
function coerceTelemetryTokenUsage(
  rawTokens: Record<string, unknown> | null | undefined,
): NonNullable<ApiCredentialTelemetryFacts["usage"]>["todayTokens"] {
  const upload = toOptionalFiniteNumber(rawTokens?.upload)
  const download = toOptionalFiniteNumber(rawTokens?.download)
  const total = toOptionalFiniteNumber(rawTokens?.total)
  if (upload === undefined && download === undefined && total === undefined)
    return undefined
  return {
    ...(upload !== undefined ? { upload } : {}),
    ...(download !== undefined ? { download } : {}),
    ...(total !== undefined ? { total } : {}),
    unit: {
      kind: API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Count,
      code: API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.Tokens,
    },
  }
}

/** Normalizes persisted model facts with finite counts and capped previews. */
function coerceTelemetryModelsFact(
  rawModels: unknown,
): ApiCredentialTelemetryFacts["models"] | undefined {
  if (!rawModels || typeof rawModels !== "object") return undefined
  const models = rawModels as Record<string, unknown>
  const count = toOptionalFiniteNumber(models.count)
  if (count === undefined) return undefined
  return {
    count: Math.max(0, Math.trunc(count)),
    preview: Array.isArray(models.preview)
      ? models.preview
          .filter((item): item is string => typeof item === "string")
          .slice(0, 20)
      : [],
  }
}

/** Checks whether a persisted source is one of the released telemetry adapters. */
function isTelemetrySource(
  value: unknown,
): value is ApiCredentialTelemetrySource {
  return (
    typeof value === "string" &&
    Object.values(API_CREDENTIAL_TELEMETRY_SOURCES).includes(
      value as ApiCredentialTelemetrySource,
    )
  )
}

/**
 * Normalizes persisted telemetry endpoint attempts.
 */
function coerceTelemetryAttempts(
  raw: unknown,
): ApiCredentialTelemetryAttempt[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((item): ApiCredentialTelemetryAttempt | null => {
      if (!item || typeof item !== "object") return null
      const candidate = item as Record<string, unknown>
      const rawSource = candidate.source
      const source = isTelemetrySource(rawSource)
        ? (rawSource as ApiCredentialTelemetryAttempt["source"])
        : null
      const endpoint =
        typeof candidate.endpoint === "string" ? candidate.endpoint.trim() : ""
      const rawStatus = candidate.status
      const status =
        rawStatus === API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Success ||
        rawStatus === API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Unsupported ||
        rawStatus === API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Error
          ? rawStatus
          : null

      if (!source || !endpoint || !status) return null

      const message =
        typeof candidate.message === "string" && candidate.message.trim()
          ? candidate.message.trim()
          : undefined

      return {
        source,
        endpoint,
        status,
        ...(message ? { message } : {}),
      }
    })
    .filter((item): item is ApiCredentialTelemetryAttempt => item !== null)
}

/** Validates and normalizes the unit-aware v6 telemetry facts payload. */
function coerceTelemetryFacts(
  raw: unknown,
): ApiCredentialTelemetryFacts | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const obj = raw as Record<string, unknown>
  const facts: ApiCredentialTelemetryFacts = {}
  if (obj.balanceSnapshot !== undefined) {
    const result = balanceSnapshotSchema.safeParse(obj.balanceSnapshot)
    if (!result.success)
      throw new Error("Invalid canonical credential balance snapshot")
    facts.balanceSnapshot = result.data
  }
  if (obj.budgets !== undefined) {
    const result = budgetConstraintSchema.array().safeParse(obj.budgets)
    if (!result.success) throw new Error("Invalid canonical credential budgets")
    facts.budgets = result.data
  }

  const rawBalances = Array.isArray(obj.balances) ? obj.balances : []
  const balances = rawBalances
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    )
    .map((item) => {
      const amount = toOptionalFiniteNumber(item.amount)
      const unit =
        item.unit && typeof item.unit === "object"
          ? (item.unit as Record<string, unknown>)
          : null
      const currency =
        typeof unit?.currency === "string" ? unit.currency.trim() : ""
      const code = typeof unit?.code === "string" ? unit.code.trim() : ""
      const label = typeof unit?.label === "string" ? unit.label.trim() : ""
      const decimalPlaces = toOptionalFiniteNumber(unit?.decimalPlaces)
      const semantics = item.semantics
      if (
        amount === undefined ||
        (unit?.kind === MEASUREMENT_UNIT_KINDS.Money &&
          (!currency || decimalPlaces === undefined)) ||
        (unit?.kind === MEASUREMENT_UNIT_KINDS.Quota && (!code || !label)) ||
        (unit?.kind !== MEASUREMENT_UNIT_KINDS.Money &&
          unit?.kind !== MEASUREMENT_UNIT_KINDS.Quota) ||
        !(
          Object.values(
            API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics,
          ) as readonly string[]
        ).includes(String(semantics))
      ) {
        return null
      }
      return {
        amount,
        ...(isKnownOrStaleObservation(item)
          ? {
              status: item.status as (typeof OBSERVATION_STATUSES)[
                "Known" | "Stale"],
            }
          : {}),
        ...(toOptionalFiniteNumber(item.observedAt) !== undefined
          ? { observedAt: toOptionalFiniteNumber(item.observedAt) }
          : {}),
        unit:
          unit.kind === MEASUREMENT_UNIT_KINDS.Quota
            ? { kind: MEASUREMENT_UNIT_KINDS.Quota, code, label }
            : {
                kind: MEASUREMENT_UNIT_KINDS.Money,
                currency,
                decimalPlaces: decimalPlaces ?? 2,
              },
        semantics: semantics as ApiCredentialTelemetryBalanceFact["semantics"],
        ...(toOptionalFiniteNumber(item.grantedAmount) !== undefined
          ? { grantedAmount: toOptionalFiniteNumber(item.grantedAmount) }
          : {}),
        ...(toOptionalFiniteNumber(item.toppedUpAmount) !== undefined
          ? { toppedUpAmount: toOptionalFiniteNumber(item.toppedUpAmount) }
          : {}),
        ...(typeof item.isAvailable === "boolean"
          ? { isAvailable: item.isAvailable }
          : {}),
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
  if (balances.length > 0) facts.balances = balances

  const rawQuota =
    obj.quota && typeof obj.quota === "object"
      ? (obj.quota as Record<string, unknown>)
      : null
  const rawWindows = Array.isArray(rawQuota?.windows) ? rawQuota.windows : []
  const windows = rawWindows
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    )
    .map((item) => {
      const type = item.type
      const unit =
        item.unit && typeof item.unit === "object"
          ? (item.unit as Record<string, unknown>)
          : null
      const unitKind = unit?.kind
      const validType = Object.values(
        API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES,
      ).includes(
        String(
          type,
        ) as (typeof API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES)[keyof typeof API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES],
      )
      const validUnit =
        unitKind === MEASUREMENT_UNIT_KINDS.Percent ||
        (unitKind === MEASUREMENT_UNIT_KINDS.Quota &&
          typeof unit?.code === "string" &&
          typeof unit.label === "string")
      const remainingPercent = toOptionalFiniteNumber(item.remainingPercent)
      const retainedAmounts: NonNullable<
        import("~/types/apiCredentialProfiles").ApiCredentialTelemetryQuotaWindowFact["retainedAmounts"]
      > = {}
      if (item.retainedAmounts && typeof item.retainedAmounts === "object") {
        const retained = item.retainedAmounts as Record<string, unknown>
        for (const field of [
          "used",
          "limit",
          "remaining",
          "remainingPercent",
        ] as const) {
          const rawAmount = retained[field]
          if (!rawAmount || typeof rawAmount !== "object") continue
          const amount = rawAmount as Record<string, unknown>
          const value = toOptionalFiniteNumber(amount.value)
          const observedAt = toOptionalFiniteNumber(amount.observedAt)
          if (
            amount.status !== OBSERVATION_STATUSES.Stale ||
            value === undefined ||
            observedAt === undefined ||
            (field === "remainingPercent" && (value < 0 || value > 100))
          )
            continue
          const source = evidenceSchema.safeParse(amount.source)
          retainedAmounts[field] = {
            status: OBSERVATION_STATUSES.Stale,
            value,
            observedAt,
            ...(source.success ? { source: source.data } : {}),
          }
        }
      }
      if (
        !validType ||
        !validUnit ||
        (remainingPercent !== undefined &&
          (remainingPercent < 0 || remainingPercent > 100))
      )
        return null
      return {
        type: type as (typeof API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES)[keyof typeof API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES],
        ...(isKnownOrStaleObservation(item)
          ? {
              status: item.status as (typeof OBSERVATION_STATUSES)[
                "Known" | "Stale"],
            }
          : {}),
        unit:
          unitKind === MEASUREMENT_UNIT_KINDS.Percent
            ? { kind: MEASUREMENT_UNIT_KINDS.Percent }
            : {
                kind: MEASUREMENT_UNIT_KINDS.Quota,
                code: String(unit?.code),
                label: String(unit?.label),
              },
        ...(toOptionalFiniteNumber(item.used) !== undefined
          ? { used: toOptionalFiniteNumber(item.used) }
          : {}),
        ...(toOptionalFiniteNumber(item.limit) !== undefined
          ? { limit: toOptionalFiniteNumber(item.limit) }
          : {}),
        ...(toOptionalFiniteNumber(item.remaining) !== undefined
          ? { remaining: toOptionalFiniteNumber(item.remaining) }
          : {}),
        ...(remainingPercent !== undefined ? { remainingPercent } : {}),
        ...(Object.keys(retainedAmounts).length ? { retainedAmounts } : {}),
        ...(evidenceSchema.safeParse(item.source).success
          ? { source: evidenceSchema.parse(item.source) }
          : {}),
        ...(usageScopeSchema.safeParse(item.scope).success
          ? { scope: usageScopeSchema.parse(item.scope) }
          : {}),
        ...(toOptionalFiniteNumber(item.observedAt) !== undefined
          ? { observedAt: toOptionalFiniteNumber(item.observedAt) }
          : {}),
        ...(toOptionalFiniteNumber(item.resetTime) !== undefined
          ? { resetTime: toOptionalFiniteNumber(item.resetTime) }
          : {}),
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
  const membershipLevel =
    typeof rawQuota?.membershipLevel === "string" &&
    rawQuota.membershipLevel.trim()
      ? rawQuota.membershipLevel.trim()
      : undefined
  if (windows.length > 0 || membershipLevel) {
    facts.quota = {
      windows,
      ...(membershipLevel ? { membershipLevel } : {}),
    }
  }

  const rawUsage =
    obj.usage && typeof obj.usage === "object"
      ? (obj.usage as Record<string, unknown>)
      : null
  if (rawUsage) {
    const usage: NonNullable<ApiCredentialTelemetryFacts["usage"]> = {}
    const coerceAmount = (rawAmount: unknown) => {
      if (!rawAmount || typeof rawAmount !== "object") return undefined
      const amount = rawAmount as Record<string, unknown>
      const value =
        typeof amount.value === "string"
          ? parseDecimal(amount.value)
          : toOptionalFiniteNumber(amount.value)
      const source = evidenceSchema.safeParse(amount.source)
      const scope = usageScopeSchema.safeParse(amount.scope)
      const window = observationWindowSchema.safeParse(amount.window)
      const metadata = {
        ...(isKnownOrStaleObservation(amount)
          ? {
              status: amount.status as (typeof OBSERVATION_STATUSES)[
                "Known" | "Stale"],
            }
          : {}),
        ...(window.success ? { window: window.data } : {}),
        ...(source.success ? { source: source.data } : {}),
        ...(scope.success ? { scope: scope.data } : {}),
        ...(toOptionalFiniteNumber(amount.observedAt) !== undefined
          ? { observedAt: toOptionalFiniteNumber(amount.observedAt) }
          : {}),
        ...((Object.values(FINANCIAL_COVERAGE) as readonly string[]).includes(
          String(amount.coverage),
        )
          ? {
              coverage:
                amount.coverage as (typeof FINANCIAL_COVERAGE)[keyof typeof FINANCIAL_COVERAGE],
            }
          : {}),
      }
      const unit =
        amount.unit && typeof amount.unit === "object"
          ? (amount.unit as Record<string, unknown>)
          : null
      if (value === undefined || !unit?.kind) return undefined
      if (unit.kind === MEASUREMENT_UNIT_KINDS.Unknown)
        return {
          value,
          unit: { kind: MEASUREMENT_UNIT_KINDS.Unknown },
          ...metadata,
        }
      if (unit.kind === MEASUREMENT_UNIT_KINDS.Crypto && unit.id === "XNO")
        return {
          value,
          unit: { kind: MEASUREMENT_UNIT_KINDS.Crypto, id: "XNO" as const },
          ...metadata,
        }
      if (
        unit.kind === MEASUREMENT_UNIT_KINDS.Money &&
        typeof unit.currency === "string"
      ) {
        return {
          value,
          ...metadata,
          unit: {
            kind: MEASUREMENT_UNIT_KINDS.Money,
            currency: unit.currency,
            decimalPlaces: toOptionalFiniteNumber(unit.decimalPlaces) ?? 2,
          },
        }
      }
      if (
        unit.kind === MEASUREMENT_UNIT_KINDS.Quota &&
        typeof unit.code === "string" &&
        typeof unit.label === "string"
      ) {
        return {
          value,
          ...metadata,
          unit: {
            kind: MEASUREMENT_UNIT_KINDS.Quota,
            code: unit.code,
            label: unit.label,
            ...(typeof unit.displayScale === "number" &&
            Number.isFinite(unit.displayScale) &&
            unit.displayScale > 0
              ? { displayScale: unit.displayScale }
              : {}),
            ...(typeof unit.displayLabel === "string" &&
            unit.displayLabel.trim()
              ? { displayLabel: unit.displayLabel.trim() }
              : {}),
          },
        }
      }
      if (
        unit.kind === MEASUREMENT_UNIT_KINDS.Count &&
        typeof unit.code === "string"
      ) {
        return {
          value,
          ...metadata,
          unit: { kind: MEASUREMENT_UNIT_KINDS.Count, code: unit.code },
        }
      }
      return undefined
    }
    const todayCost = coerceAmount(rawUsage.todayCost)
    const todayRequests = coerceAmount(rawUsage.todayRequests)
    const totalUsed = coerceAmount(rawUsage.totalUsed)
    const totalGranted = coerceAmount(rawUsage.totalGranted)
    const totalAvailable = coerceAmount(rawUsage.totalAvailable)
    if (todayCost) usage.todayCost = todayCost
    if (todayRequests) usage.todayRequests = todayRequests
    if (totalUsed) usage.totalUsed = totalUsed
    if (totalGranted) usage.totalGranted = totalGranted
    if (totalAvailable) usage.totalAvailable = totalAvailable
    if (typeof rawUsage.unlimited === "boolean")
      usage.unlimited = rawUsage.unlimited
    if (toOptionalFiniteNumber(rawUsage.expiresAt) !== undefined)
      usage.expiresAt = toOptionalFiniteNumber(rawUsage.expiresAt)
    const rawTokens =
      rawUsage.todayTokens && typeof rawUsage.todayTokens === "object"
        ? (rawUsage.todayTokens as Record<string, unknown>)
        : null
    const todayTokens = coerceTelemetryTokenUsage(rawTokens)
    if (todayTokens) usage.todayTokens = todayTokens
    if (Object.keys(usage).length > 0) facts.usage = usage
  }

  const rawModels =
    obj.models && typeof obj.models === "object"
      ? (obj.models as Record<string, unknown>)
      : null
  const modelsFact = coerceTelemetryModelsFact(rawModels)
  if (modelsFact) {
    facts.models = modelsFact
  }
  return Object.keys(facts).length > 0 ? facts : undefined
}

/** Migrates the last released v5 flat telemetry fields into v6 facts. */
function migrateLegacyTelemetryFacts(
  obj: Record<string, unknown> & LegacyTelemetrySnapshotFields,
  source: ApiCredentialTelemetrySource | undefined,
): ApiCredentialTelemetryFacts {
  const facts: ApiCredentialTelemetryFacts = {}
  const balanceUsd = toOptionalFiniteNumber(obj.balanceUsd)
  if (balanceUsd !== undefined) {
    facts.balances = [
      {
        amount: balanceUsd,
        unit:
          source === API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage ||
          source === API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage
            ? {
                kind: MEASUREMENT_UNIT_KINDS.Quota,
                code: API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.UsdEquivalent,
                label: API_CREDENTIAL_TELEMETRY_FACT_UNITS.labels.UsdEquivalent,
              }
            : {
                kind: MEASUREMENT_UNIT_KINDS.Money,
                currency: CURRENCIES.USD,
                decimalPlaces: 2,
              },
        semantics:
          source === API_CREDENTIAL_TELEMETRY_SOURCES.OpenAiBilling
            ? API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.Legacy
            : source === API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage ||
                source === API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage
              ? API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.BudgetEquivalent
              : API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.Legacy,
      },
    ]
  }
  const usage: NonNullable<ApiCredentialTelemetryFacts["usage"]> = {}
  const todayCostUsd = toOptionalFiniteNumber(obj.todayCostUsd)
  const todayRequests = toOptionalFiniteNumber(obj.todayRequests)
  if (todayCostUsd !== undefined) {
    usage.todayCost = {
      value: todayCostUsd,
      unit: {
        kind: MEASUREMENT_UNIT_KINDS.Money,
        currency: CURRENCIES.USD,
        decimalPlaces: 2,
      },
    }
  }
  if (todayRequests !== undefined) {
    usage.todayRequests = {
      value: todayRequests,
      unit: {
        kind: API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Count,
        code: API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.Requests,
      },
    }
  }
  const rawTokens = obj.todayTokens as Record<string, unknown> | undefined
  const todayTokens = coerceTelemetryTokenUsage(rawTokens)
  if (todayTokens) usage.todayTokens = todayTokens
  const budgetUnit =
    source === API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage ||
    source === API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage
      ? {
          kind: MEASUREMENT_UNIT_KINDS.Quota,
          code: API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.UsdEquivalent,
          label: API_CREDENTIAL_TELEMETRY_FACT_UNITS.labels.UsdEquivalent,
        }
      : {
          kind: MEASUREMENT_UNIT_KINDS.Money,
          currency: CURRENCIES.USD,
          decimalPlaces: 2,
        }
  for (const [key, field] of [
    ["totalUsed", "totalUsedUsd"],
    ["totalGranted", "totalGrantedUsd"],
    ["totalAvailable", "totalAvailableUsd"],
  ] as const) {
    const value = toOptionalFiniteNumber(obj[field])
    if (value !== undefined) usage[key] = { value, unit: budgetUnit }
  }
  if (typeof obj.unlimitedQuota === "boolean")
    usage.unlimited = obj.unlimitedQuota
  if (toOptionalFiniteNumber(obj.expiresAt) !== undefined)
    usage.expiresAt = toOptionalFiniteNumber(obj.expiresAt)
  if (Object.keys(usage).length > 0) facts.usage = usage

  const modelsFact = coerceTelemetryModelsFact(obj.models)
  if (modelsFact) {
    facts.models = modelsFact
  }
  return facts
}

/**
 * Normalizes a persisted telemetry snapshot and drops unusable snapshots.
 */
export function coerceTelemetrySnapshot(
  raw: unknown,
): ApiCredentialTelemetrySnapshot | undefined {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  if (obj.schemaVersion !== undefined && obj.schemaVersion !== 2)
    throw new Error("Unsupported credential telemetry snapshot version")
  if (
    obj.schemaVersion === 2 &&
    obj.facts !== undefined &&
    (!obj.facts || typeof obj.facts !== "object" || Array.isArray(obj.facts))
  )
    throw new Error("Invalid canonical credential telemetry facts")
  const lastSyncTime = toOptionalFiniteNumber(obj.lastSyncTime)
  if (!lastSyncTime || lastSyncTime <= 0) return undefined

  const rawHealth =
    obj.health && typeof obj.health === "object" ? obj.health : {}
  const healthRecord = rawHealth as Record<string, unknown>
  const health = {
    status: Object.values(SiteHealthStatus).includes(
      healthRecord.status as SiteHealthStatus,
    )
      ? (healthRecord.status as SiteHealthStatus)
      : SiteHealthStatus.Unknown,
    ...(typeof healthRecord.reason === "string" && healthRecord.reason.trim()
      ? { reason: healthRecord.reason.trim() }
      : {}),
  } as ApiCredentialTelemetrySnapshot["health"]

  const rawSource = obj.source
  const source = isTelemetrySource(rawSource)
    ? (rawSource as ApiCredentialTelemetrySnapshot["source"])
    : undefined

  const facts =
    obj.facts !== undefined
      ? coerceTelemetryFacts(obj.facts)
      : migrateLegacyTelemetryFacts(obj, source)

  if (facts?.balances && obj.schemaVersion === undefined)
    facts.balances = facts.balances.map((balance) => ({
      ...balance,
      semantics: API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.Legacy,
    }))

  return {
    ...(obj.schemaVersion === 2 ? { schemaVersion: 2 as const } : {}),
    health,
    lastSyncTime,
    ...(toOptionalFiniteNumber(obj.lastSuccessTime)
      ? { lastSuccessTime: toOptionalFiniteNumber(obj.lastSuccessTime) }
      : {}),
    ...(typeof obj.lastError === "string" && obj.lastError.trim()
      ? { lastError: obj.lastError.trim() }
      : {}),
    ...(source ? { source } : {}),
    facts,
    attempts: coerceTelemetryAttempts(obj.attempts),
  }
}
