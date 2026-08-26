import {
  TELEMETRY_PROVIDER_PROTOCOL,
  type TelemetryPatch,
} from "~/services/apiCredentialProfiles/telemetryContracts"
import type {
  ApiCredentialTelemetryAmount,
  ApiCredentialTelemetryFacts,
  ApiCredentialTelemetrySource,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_TELEMETRY_FACT_UNITS,
  API_CREDENTIAL_TELEMETRY_SOURCES,
} from "~/types/apiCredentialProfiles"

/** Converts provider parser output into the unit-aware v6 product facts. */
export function normalizeTelemetryPatchToFacts(
  data: TelemetryPatch,
  source: ApiCredentialTelemetrySource,
): ApiCredentialTelemetryFacts {
  const facts: ApiCredentialTelemetryFacts = {}
  const budgetSource =
    source === API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage ||
    source === API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage
  const balances: NonNullable<ApiCredentialTelemetryFacts["balances"]> = []
  const balancesToNormalize =
    data.balances ?? (data.balance ? [data.balance] : [])
  for (const balance of balancesToNormalize) {
    const decimalPlaces =
      balance.currency === TELEMETRY_PROVIDER_PROTOCOL.currencies.Jpy ? 0 : 2
    balances.push({
      amount: balance.amount,
      unit: {
        kind: API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Money,
        currency: balance.currency,
        decimalPlaces,
      },
      semantics:
        source === API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance
          ? API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.Cash
          : API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.ProviderWallet,
      ...(balance.grantedAmount !== undefined
        ? { grantedAmount: balance.grantedAmount }
        : {}),
      ...(balance.toppedUpAmount !== undefined
        ? { toppedUpAmount: balance.toppedUpAmount }
        : {}),
      ...(balance.isAvailable !== undefined
        ? { isAvailable: balance.isAvailable }
        : {}),
    })
  }

  if (data.balanceUsd !== undefined) {
    balances.push({
      amount: data.balanceUsd,
      unit: budgetSource
        ? {
            kind: API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Quota,
            code: API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.UsdEquivalent,
            label: API_CREDENTIAL_TELEMETRY_FACT_UNITS.labels.UsdEquivalent,
          }
        : {
            kind: API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Money,
            currency: TELEMETRY_PROVIDER_PROTOCOL.currencies.Usd,
            decimalPlaces: 2,
          },
      semantics: budgetSource
        ? API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.BudgetEquivalent
        : source === API_CREDENTIAL_TELEMETRY_SOURCES.OpenAiBilling
          ? API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.Cash
          : API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.Legacy,
    })
  }
  if (balances.length > 0) facts.balances = balances

  if (data.quota) {
    facts.quota = {
      windows: data.quota.windows.map((window) => ({
        type: window.type,
        unit:
          window.unit === "percent"
            ? { kind: API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Percent }
            : {
                kind: API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Quota,
                code:
                  source === API_CREDENTIAL_TELEMETRY_SOURCES.GlmQuota
                    ? API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.GlmCredit
                    : API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.ProviderQuota,
                label:
                  source === API_CREDENTIAL_TELEMETRY_SOURCES.GlmQuota
                    ? API_CREDENTIAL_TELEMETRY_FACT_UNITS.labels.GlmCredit
                    : API_CREDENTIAL_TELEMETRY_FACT_UNITS.labels.ProviderQuota,
              },
        ...(window.unit === "percent"
          ? {}
          : {
              used: window.used,
              limit: window.limit,
              remaining: window.remaining,
            }),
        remainingPercent: window.percentRemaining,
        ...(window.resetTime !== undefined
          ? { resetTime: window.resetTime }
          : {}),
      })),
      ...(data.quota.membershipLevel
        ? { membershipLevel: data.quota.membershipLevel }
        : {}),
    }
  }

  const budgetUnit: ApiCredentialTelemetryAmount["unit"] = budgetSource
    ? {
        kind: API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Quota,
        code: API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.UsdEquivalent,
        label: API_CREDENTIAL_TELEMETRY_FACT_UNITS.labels.UsdEquivalent,
      }
    : {
        kind: API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Money,
        currency: TELEMETRY_PROVIDER_PROTOCOL.currencies.Usd,
        decimalPlaces: 2,
      }
  const usage: NonNullable<ApiCredentialTelemetryFacts["usage"]> = {}
  if (data.todayCostUsd !== undefined) {
    usage.todayCost = {
      value: data.todayCostUsd,
      unit: {
        kind: API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Money,
        currency: TELEMETRY_PROVIDER_PROTOCOL.currencies.Usd,
        decimalPlaces: 2,
      },
    }
  }
  if (data.todayRequests !== undefined) {
    usage.todayRequests = {
      value: data.todayRequests,
      unit: {
        kind: API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Count,
        code: API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.Requests,
      },
    }
  }
  if (data.todayTokens) {
    usage.todayTokens = {
      ...data.todayTokens,
      unit: {
        kind: API_CREDENTIAL_TELEMETRY_FACT_UNITS.kinds.Count,
        code: API_CREDENTIAL_TELEMETRY_FACT_UNITS.codes.Tokens,
      },
    }
  }
  if (data.totalUsedUsd !== undefined) {
    usage.totalUsed = { value: data.totalUsedUsd, unit: budgetUnit }
  }
  if (data.totalGrantedUsd !== undefined) {
    usage.totalGranted = { value: data.totalGrantedUsd, unit: budgetUnit }
  }
  if (data.totalAvailableUsd !== undefined) {
    usage.totalAvailable = { value: data.totalAvailableUsd, unit: budgetUnit }
  }
  if (data.expiresAt !== undefined) usage.expiresAt = data.expiresAt
  if (data.unlimitedQuota !== undefined) usage.unlimited = data.unlimitedQuota
  if (Object.keys(usage).length > 0) facts.usage = usage

  return facts
}
