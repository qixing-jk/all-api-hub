import { SiteHealthStatus } from "~/types"
import type {
  ApiCredentialTelemetryAttempt,
  ApiCredentialTelemetryFacts,
  ApiCredentialTelemetrySnapshot,
  ApiCredentialTelemetrySource,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES,
  API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES,
  API_CREDENTIAL_TELEMETRY_SOURCES,
} from "~/types/apiCredentialProfiles"

/** Coerces a numeric-like value into a finite number. */
function coerceFiniteNumber(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/** Normalizes persisted model facts with finite counts and capped previews. */
function coerceTelemetryModelsFact(
  rawModels: unknown,
): ApiCredentialTelemetryFacts["models"] | undefined {
  if (!rawModels || typeof rawModels !== "object") return undefined
  const models = rawModels as Record<string, unknown>
  const count = coerceFiniteNumber(models.count)
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

  const rawBalances = Array.isArray(obj.balances) ? obj.balances : []
  const balances = rawBalances
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    )
    .map((item) => {
      const amount = coerceFiniteNumber(item.amount)
      const unit =
        item.unit && typeof item.unit === "object"
          ? (item.unit as Record<string, unknown>)
          : null
      const currency =
        typeof unit?.currency === "string" ? unit.currency.trim() : ""
      const code = typeof unit?.code === "string" ? unit.code.trim() : ""
      const label = typeof unit?.label === "string" ? unit.label.trim() : ""
      const decimalPlaces = coerceFiniteNumber(unit?.decimalPlaces)
      const semantics = item.semantics
      if (
        amount === undefined ||
        (unit?.kind === "money" &&
          (!currency || decimalPlaces === undefined)) ||
        (unit?.kind === "quota" && (!code || !label)) ||
        (unit?.kind !== "money" && unit?.kind !== "quota") ||
        !["cash", "provider-wallet", "budget-equivalent", "legacy"].includes(
          String(semantics),
        )
      ) {
        return null
      }
      return {
        amount,
        unit:
          unit.kind === "quota"
            ? { kind: "quota" as const, code, label }
            : {
                kind: "money" as const,
                currency,
                decimalPlaces: decimalPlaces ?? 2,
              },
        semantics: semantics as
          | "cash"
          | "provider-wallet"
          | "budget-equivalent"
          | "legacy",
        ...(coerceFiniteNumber(item.grantedAmount) !== undefined
          ? { grantedAmount: coerceFiniteNumber(item.grantedAmount) }
          : {}),
        ...(coerceFiniteNumber(item.toppedUpAmount) !== undefined
          ? { toppedUpAmount: coerceFiniteNumber(item.toppedUpAmount) }
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
        unitKind === "percent" ||
        (unitKind === "quota" &&
          typeof unit?.code === "string" &&
          typeof unit.label === "string")
      const remainingPercent = coerceFiniteNumber(item.remainingPercent)
      if (
        !validType ||
        !validUnit ||
        remainingPercent === undefined ||
        remainingPercent < 0 ||
        remainingPercent > 100
      )
        return null
      return {
        type: type as (typeof API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES)[keyof typeof API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES],
        unit:
          unitKind === "percent"
            ? { kind: "percent" as const }
            : {
                kind: "quota" as const,
                code: String(unit?.code),
                label: String(unit?.label),
              },
        ...(coerceFiniteNumber(item.used) !== undefined
          ? { used: coerceFiniteNumber(item.used) }
          : {}),
        ...(coerceFiniteNumber(item.limit) !== undefined
          ? { limit: coerceFiniteNumber(item.limit) }
          : {}),
        ...(coerceFiniteNumber(item.remaining) !== undefined
          ? { remaining: coerceFiniteNumber(item.remaining) }
          : {}),
        remainingPercent,
        ...(coerceFiniteNumber(item.resetTime) !== undefined
          ? { resetTime: coerceFiniteNumber(item.resetTime) }
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
      const value = coerceFiniteNumber(amount.value)
      const unit =
        amount.unit && typeof amount.unit === "object"
          ? (amount.unit as Record<string, unknown>)
          : null
      if (value === undefined || !unit?.kind) return undefined
      if (unit.kind === "money" && typeof unit.currency === "string") {
        return {
          value,
          unit: {
            kind: "money" as const,
            currency: unit.currency,
            decimalPlaces: coerceFiniteNumber(unit.decimalPlaces) ?? 2,
          },
        }
      }
      if (
        unit.kind === "quota" &&
        typeof unit.code === "string" &&
        typeof unit.label === "string"
      ) {
        return {
          value,
          unit: { kind: "quota" as const, code: unit.code, label: unit.label },
        }
      }
      if (unit.kind === "count" && typeof unit.code === "string") {
        return { value, unit: { kind: "count" as const, code: unit.code } }
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
    if (coerceFiniteNumber(rawUsage.expiresAt) !== undefined)
      usage.expiresAt = coerceFiniteNumber(rawUsage.expiresAt)
    const rawTokens =
      rawUsage.todayTokens && typeof rawUsage.todayTokens === "object"
        ? (rawUsage.todayTokens as Record<string, unknown>)
        : null
    const upload = coerceFiniteNumber(rawTokens?.upload)
    const download = coerceFiniteNumber(rawTokens?.download)
    if (upload !== undefined || download !== undefined) {
      usage.todayTokens = {
        upload: upload ?? 0,
        download: download ?? 0,
        unit: { kind: "count", code: "tokens" },
      }
    }
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
  obj: Record<string, unknown>,
  source: ApiCredentialTelemetrySource | undefined,
): ApiCredentialTelemetryFacts {
  const facts: ApiCredentialTelemetryFacts = {}
  const balanceUsd = coerceFiniteNumber(obj.balanceUsd)
  if (balanceUsd !== undefined) {
    facts.balances = [
      {
        amount: balanceUsd,
        unit:
          source === API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage ||
          source === API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage
            ? {
                kind: "quota",
                code: "usd-equivalent",
                label: "USD-equivalent budget",
              }
            : { kind: "money", currency: "USD", decimalPlaces: 2 },
        semantics:
          source === API_CREDENTIAL_TELEMETRY_SOURCES.OpenAiBilling
            ? "cash"
            : source === API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage ||
                source === API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage
              ? "budget-equivalent"
              : "legacy",
      },
    ]
  }
  const usage: NonNullable<ApiCredentialTelemetryFacts["usage"]> = {}
  const todayCostUsd = coerceFiniteNumber(obj.todayCostUsd)
  const todayRequests = coerceFiniteNumber(obj.todayRequests)
  if (todayCostUsd !== undefined) {
    usage.todayCost = {
      value: todayCostUsd,
      unit: { kind: "money", currency: "USD", decimalPlaces: 2 },
    }
  }
  if (todayRequests !== undefined) {
    usage.todayRequests = {
      value: todayRequests,
      unit: { kind: "count", code: "requests" },
    }
  }
  const rawTokens = obj.todayTokens as Record<string, unknown> | undefined
  const upload = coerceFiniteNumber(rawTokens?.upload)
  const download = coerceFiniteNumber(rawTokens?.download)
  if (upload !== undefined || download !== undefined) {
    usage.todayTokens = {
      upload: upload ?? 0,
      download: download ?? 0,
      unit: { kind: "count", code: "tokens" },
    }
  }
  const budgetUnit =
    source === API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage ||
    source === API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage
      ? {
          kind: "quota" as const,
          code: "usd-equivalent",
          label: "USD-equivalent budget",
        }
      : { kind: "money" as const, currency: "USD", decimalPlaces: 2 }
  for (const [key, field] of [
    ["totalUsed", "totalUsedUsd"],
    ["totalGranted", "totalGrantedUsd"],
    ["totalAvailable", "totalAvailableUsd"],
  ] as const) {
    const value = coerceFiniteNumber(obj[field])
    if (value !== undefined) usage[key] = { value, unit: budgetUnit }
  }
  if (typeof obj.unlimitedQuota === "boolean")
    usage.unlimited = obj.unlimitedQuota
  if (coerceFiniteNumber(obj.expiresAt) !== undefined)
    usage.expiresAt = coerceFiniteNumber(obj.expiresAt)
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
  const lastSyncTime = coerceFiniteNumber(obj.lastSyncTime)
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
    coerceTelemetryFacts(obj.facts) ?? migrateLegacyTelemetryFacts(obj, source)

  return {
    health,
    lastSyncTime,
    ...(coerceFiniteNumber(obj.lastSuccessTime)
      ? { lastSuccessTime: coerceFiniteNumber(obj.lastSuccessTime) }
      : {}),
    ...(typeof obj.lastError === "string" && obj.lastError.trim()
      ? { lastError: obj.lastError.trim() }
      : {}),
    ...(source ? { source } : {}),
    facts,
    attempts: coerceTelemetryAttempts(obj.attempts),
  }
}
