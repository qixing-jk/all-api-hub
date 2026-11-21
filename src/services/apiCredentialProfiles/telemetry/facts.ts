import {
  balancePosition,
  balancePositionKey,
  type EvidenceRef,
  type UsageScope,
} from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BALANCE_CASH_CLASSIFICATIONS,
  BALANCE_FUNDING,
  BALANCE_NATURES,
  BALANCE_RELATIONS,
  BALANCE_ROLES,
  BUDGET_LIMIT_STATES,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SUBJECT_KINDS,
  MEASUREMENT_UNIT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { type TelemetryPatch } from "~/services/apiCredentialProfiles/telemetry/contracts"
import {
  KIMI_FINANCIAL_SOURCES,
  parseKimiFinancialData,
} from "~/services/apiService/kimiOpenPlatform/balance"
import type {
  ApiCredentialTelemetryAmount,
  ApiCredentialTelemetryBalanceFact,
  ApiCredentialTelemetryFacts,
  ApiCredentialTelemetrySource,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_TELEMETRY_FACT_UNITS,
  API_CREDENTIAL_TELEMETRY_SOURCES,
  TELEMETRY_FINANCIAL_SCOPES,
  TELEMETRY_QUOTA_UNIT_HINTS,
} from "~/types/apiCredentialProfiles"

export type TelemetryObservationContext = {
  profileId: string
  baseUrl: string
  observedAt: number
}

/** Bind observations to a credential without inventing a remote wallet or account. */
function telemetryScope(
  context: TelemetryObservationContext,
  keyScoped = false,
): UsageScope {
  let authority = context.baseUrl
  try {
    authority = new URL(context.baseUrl).origin
  } catch {
    /* Legacy observations lack a verified authority. */
  }
  return {
    subject: {
      kind: FINANCIAL_SUBJECT_KINDS.Credential,
      profileId: context.profileId,
    },
    authority,
    projects: { kind: SCOPE_SELECTION_KINDS.Unknown },
    keys: keyScoped
      ? { kind: SCOPE_SELECTION_KINDS.Restricted, ids: [context.profileId] }
      : { kind: SCOPE_SELECTION_KINDS.Unknown },
    models: { kind: SCOPE_SELECTION_KINDS.Unknown },
    groups: { kind: SCOPE_SELECTION_KINDS.Unknown },
  }
}

/** One read projection for canonical wallets and historical numeric snapshots. */
export function selectTelemetryBalances(
  facts: ApiCredentialTelemetryFacts | undefined,
): ApiCredentialTelemetryBalanceFact[] {
  const unitFor = (
    asset: import("~/services/amounts/assets").Asset,
  ): ApiCredentialTelemetryBalanceFact["unit"] =>
    asset.kind === ASSET_KINDS.Currency
      ? {
          kind: MEASUREMENT_UNIT_KINDS.Money,
          currency: asset.code,
          decimalPlaces: asset.code === "JPY" ? 0 : 2,
        }
      : asset.kind === ASSET_KINDS.Quota
        ? {
            kind: MEASUREMENT_UNIT_KINDS.Quota,
            code: asset.id,
            label: asset.displayLabel,
          }
        : asset.kind === ASSET_KINDS.Crypto
          ? { kind: MEASUREMENT_UNIT_KINDS.Crypto, id: asset.id }
          : { kind: MEASUREMENT_UNIT_KINDS.Unknown }
  const positions = facts?.balanceSnapshot?.positions ?? []
  const project = (
    p: import("~/services/amounts/balance").BalancePosition,
  ): ApiCredentialTelemetryBalanceFact => ({
    position: p,
    amount: "value" in p.amount ? Number(p.amount.value) : NaN,
    unit: unitFor(p.asset),
    semantics:
      p.amount.source.kind === EVIDENCE_KINDS.Legacy
        ? API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.Legacy
        : p.cashClassification === BALANCE_CASH_CLASSIFICATIONS.ReportedCash
          ? API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.Cash
          : API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.ProviderWallet,
    scope: p.scope,
    status: p.amount.status,
    ...("observedAt" in p.amount ? { observedAt: p.amount.observedAt } : {}),
  })
  const canonical = facts?.balanceSnapshot
    ? positions
        .filter((p) => !p.parentId && p.role === BALANCE_ROLES.Available)
        .map((p) => ({
          ...project(p),
          components: positions
            .filter(
              (c) =>
                c.parentId &&
                balancePositionKey(c, c.parentId) === balancePositionKey(p) &&
                c.relation === BALANCE_RELATIONS.Component,
            )
            .map(project),
        }))
    : []
  const unitKey = (unit: ApiCredentialTelemetryBalanceFact["unit"]) =>
    unit.kind === MEASUREMENT_UNIT_KINDS.Money
      ? `${unit.kind}:${unit.currency}`
      : unit.kind === MEASUREMENT_UNIT_KINDS.Quota
        ? `${unit.kind}:${unit.code}`
        : unit.kind === MEASUREMENT_UNIT_KINDS.Crypto
          ? `${unit.kind}:${unit.id}`
          : unit.kind
  const legacy = (facts?.balances ?? []).filter(
    (balance) =>
      !canonical.some(
        (current) =>
          unitKey(current.unit) === unitKey(balance.unit) &&
          (current.status === OBSERVATION_STATUSES.Known ||
            current.status === OBSERVATION_STATUSES.Stale),
      ),
  )
  const balances = [
    ...canonical.filter(
      (balance) =>
        !legacy.some((old) => unitKey(old.unit) === unitKey(balance.unit)),
    ),
    ...legacy,
  ]
  return [
    ...balances,
    ...(facts?.budgets ?? []).map(
      (budget): ApiCredentialTelemetryBalanceFact => {
        const observation =
          budget.stateObservation?.status === OBSERVATION_STATUSES.Stale ||
          budget.limitState !== BUDGET_LIMIT_STATES.Finite
            ? (budget.stateObservation ?? budget.remaining)
            : budget.remaining
        return {
          budget,
          amount:
            "value" in budget.remaining ? Number(budget.remaining.value) : NaN,
          unit: unitFor(budget.asset),
          semantics:
            API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.BudgetEquivalent,
          scope: budget.scope,
          status: observation.status,
          ...("observedAt" in observation
            ? { observedAt: observation.observedAt }
            : {}),
        }
      },
    ),
  ]
}

/** Bind provider output to one real credential observation and canonical financial facts. */
export function normalizeTelemetryPatchToFacts(
  data: TelemetryPatch,
  source: ApiCredentialTelemetrySource,
  context: TelemetryObservationContext,
): ApiCredentialTelemetryFacts {
  const facts: ApiCredentialTelemetryFacts = {}
  const evidence: EvidenceRef = {
    adapter: source,
    contractVersion: "2",
    operation: source,
    kind: data.financialMapping
      ? EVIDENCE_KINDS.Manual
      : EVIDENCE_KINDS.Reported,
  }
  const scope = telemetryScope(
    context,
    source === API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage ||
      data.financialMapping?.scope === TELEMETRY_FINANCIAL_SCOPES.Credential,
  )
  if (data.kimiInference) {
    facts.balanceSnapshot = parseKimiFinancialData(
      data.kimiInference.payload,
      scope,
      data.kimiInference.currency,
      KIMI_FINANCIAL_SOURCES.Inference,
      context.observedAt,
    ).balance
  }
  if (data.budget) {
    const budget = budgetConstraint({
      ...data.budget,
      scope,
      source: data.budget.source ?? evidence,
      observedAt: context.observedAt,
      limitState: data.budget.unlimited
        ? BUDGET_LIMIT_STATES.Unlimited
        : data.budget.limit !== undefined || data.budget.remaining !== undefined
          ? BUDGET_LIMIT_STATES.Finite
          : BUDGET_LIMIT_STATES.Unknown,
    })
    if (data.budget.remainingDerived)
      budget.remaining.source = {
        ...evidence,
        kind: EVIDENCE_KINDS.Derived,
        inputs: ["limit", "used"],
      }
    facts.budgets = [budget]
  }
  const nativeBalances = data.balances ?? (data.balance ? [data.balance] : [])
  if (data.balances !== undefined || data.balance !== undefined) {
    const positions = nativeBalances.flatMap((balance, index) => {
      const asset =
        data.balanceAsset ??
        (/^[A-Z]{3}$/.test(balance.currency)
          ? { kind: ASSET_KINDS.Currency, code: balance.currency }
          : { kind: ASSET_KINDS.Unknown })
      const duplicate =
        nativeBalances.filter(
          (candidate) => candidate.currency === balance.currency,
        ).length > 1
      const id = `available:${balance.currency || "unknown"}${duplicate ? `:ambiguous:${index}` : ""}`
      const common = {
        scope,
        asset,
        source: evidence,
        observedAt: context.observedAt,
        nature:
          source === API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance
            ? BALANCE_NATURES.Prepaid
            : BALANCE_NATURES.Unknown,
      }
      return [
        balancePosition({
          ...common,
          id,
          value: balance.amount,
          funding:
            source === API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance
              ? BALANCE_FUNDING.Mixed
              : BALANCE_FUNDING.Unknown,
        }),
        ...(source === API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance ||
        balance.grantedAmount !== undefined
          ? [
              balancePosition({
                ...common,
                id: `${id}:granted`,
                value: balance.grantedAmount,
                funding: BALANCE_FUNDING.Granted,
                cashClassification: BALANCE_CASH_CLASSIFICATIONS.NotCash,
                parentId: id,
                relation: BALANCE_RELATIONS.Component,
              }),
            ]
          : []),
        ...(source === API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance ||
        balance.toppedUpAmount !== undefined
          ? [
              balancePosition({
                ...common,
                id: `${id}:purchased`,
                value: balance.toppedUpAmount,
                funding: BALANCE_FUNDING.Purchased,
                cashClassification: BALANCE_CASH_CLASSIFICATIONS.Unknown,
                parentId: id,
                relation: BALANCE_RELATIONS.Component,
              }),
            ]
          : []),
      ]
    })
    const ambiguous =
      new Set(nativeBalances.map((balance) => balance.currency)).size !==
      nativeBalances.length
    if (ambiguous)
      for (const position of positions) {
        if (position.id.includes(":ambiguous:"))
          position.amount = {
            status: OBSERVATION_STATUSES.Unavailable,
            source: evidence,
            reason: "duplicate-currency-wallet-identity",
          }
      }
    facts.balanceSnapshot = {
      schemaVersion: 2,
      subject: scope.subject,
      capturedAt: context.observedAt,
      positions,
      coverage: ambiguous
        ? FINANCIAL_COVERAGE.Partial
        : (data.balanceCoverage ?? FINANCIAL_COVERAGE.Unknown),
    }
  }
  if (data.balanceUsd !== undefined) {
    facts.balanceSnapshot = {
      schemaVersion: 2,
      subject: scope.subject,
      capturedAt: context.observedAt,
      coverage: FINANCIAL_COVERAGE.Unknown,
      positions: [
        balancePosition({
          id: "legacy-balance",
          scope,
          asset: { kind: ASSET_KINDS.Unknown },
          value: data.balanceUsd,
          source: { ...evidence, kind: EVIDENCE_KINDS.Legacy },
          observedAt: context.observedAt,
        }),
      ],
    }
  }

  if (data.quota) {
    facts.quota = {
      windows: data.quota.windows.map((window) => ({
        type: window.type,
        source: evidence,
        scope,
        observedAt: context.observedAt,
        unit:
          window.unit === TELEMETRY_QUOTA_UNIT_HINTS.Percent
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
        ...(window.unit === TELEMETRY_QUOTA_UNIT_HINTS.Percent
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

  const asset = data.financialMapping?.asset
  const budgetUnit: ApiCredentialTelemetryAmount["unit"] =
    asset?.kind === ASSET_KINDS.Currency
      ? {
          kind: MEASUREMENT_UNIT_KINDS.Money,
          currency: asset.code,
          decimalPlaces: 2,
        }
      : asset?.kind === ASSET_KINDS.Quota
        ? {
            kind: MEASUREMENT_UNIT_KINDS.Quota,
            code: asset.id,
            label: asset.label,
            displayScale: asset.displayScale,
            displayLabel: asset.displayLabel,
          }
        : asset?.kind === ASSET_KINDS.Crypto
          ? { kind: MEASUREMENT_UNIT_KINDS.Crypto, id: asset.id }
          : source === API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage
            ? {
                kind: MEASUREMENT_UNIT_KINDS.Money,
                currency: API_CREDENTIAL_TELEMETRY_FACT_UNITS.currencies.Usd,
                decimalPlaces: 2,
              }
            : { kind: MEASUREMENT_UNIT_KINDS.Unknown }
  const usageEvidence =
    data.financialMapping ||
    source === API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint
      ? evidence
      : { ...evidence, kind: EVIDENCE_KINDS.Legacy }
  const usage: NonNullable<ApiCredentialTelemetryFacts["usage"]> = {}
  if (data.todayCostUsd !== undefined) {
    usage.todayCost = {
      value: data.todayCostUsd,
      unit: budgetUnit,
      source: usageEvidence,
      scope,
      observedAt: context.observedAt,
      coverage: FINANCIAL_COVERAGE.Partial,
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
    usage.totalUsed = {
      value: data.totalUsedUsd,
      unit: budgetUnit,
      source: usageEvidence,
      scope,
      observedAt: context.observedAt,
      coverage: FINANCIAL_COVERAGE.Unknown,
    }
  }
  if (data.totalGrantedUsd !== undefined) {
    usage.totalGranted = {
      value: data.totalGrantedUsd,
      unit: budgetUnit,
      source: usageEvidence,
      scope,
      observedAt: context.observedAt,
      coverage: FINANCIAL_COVERAGE.Unknown,
    }
  }
  if (data.totalAvailableUsd !== undefined) {
    usage.totalAvailable = {
      value: data.totalAvailableUsd,
      unit: budgetUnit,
      source: usageEvidence,
      scope,
      observedAt: context.observedAt,
      coverage: FINANCIAL_COVERAGE.Unknown,
    }
  }
  if (data.expiresAt !== undefined) usage.expiresAt = data.expiresAt
  if (data.unlimitedQuota !== undefined) usage.unlimited = data.unlimitedQuota
  if (Object.keys(usage).length > 0) facts.usage = usage

  return facts
}
