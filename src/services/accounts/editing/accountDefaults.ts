import { CHECK_IN_SELECTION_MODES } from "~/constants/checkIn"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import {
  normalizeAccountLogin,
  resolveAccountLogin,
} from "~/services/accountLogin/configCodec"
import { normalizeAccountSiteProfileUrlForStorage } from "~/services/accounts/accountSiteProfile/urls"
import {
  accountAllowanceSnapshotSchema,
  bindAccountAllowances,
} from "~/services/accounts/allowances"
import { bindAccountBalance } from "~/services/accounts/balanceSnapshot"
import { normalizeManualBalanceUsd } from "~/services/accounts/editing/accountFormValidation"
import {
  coerceAccountIdentity,
  hasSameAccountRequestIdentity,
} from "~/services/accounts/identity/accountIdentity"
import { normalizeAccountTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import {
  CURRENT_CONFIG_VERSION,
  migrateAccountsConfig,
} from "~/services/accounts/migrations/accountDataMigration"
import { migrateAccountFinancialInfo } from "~/services/accounts/migrations/accountFinancialMigration"
import {
  BALANCE_IDENTITY_CHANGED_REASON,
  staleBalancePosition,
} from "~/services/accounts/refresh/balanceAcceptance"
import { staleUsageSummary } from "~/services/accounts/refresh/usageAcceptance"
import {
  balanceSnapshotSchema,
  staleObservation,
  type UsageScope,
} from "~/services/amounts/balance"
import { staleBudgetConstraint } from "~/services/amounts/budgets"
import {
  FINANCIAL_COVERAGE,
  FINANCIAL_SUBJECT_KINDS,
} from "~/services/amounts/financialConstants"
import { financialIncomeFactSchema } from "~/services/amounts/income"
import {
  financialConsumptionFactSchema,
  reportedUsageCostSchema,
} from "~/services/amounts/usage"
import { normalizeCheckInConfigV7 } from "~/services/checkin/autoCheckin/configuration/configCodec"
import {
  ACCOUNT_SUBSCRIPTION_STATUSES,
  ACCOUNT_USAGE_SUMMARY_SCOPES,
  AuthTypeEnum,
  DELETED_ENTRY_KINDS,
  MANUAL_BALANCE_OBSERVATION_KINDS,
  SiteHealthStatus,
  type AccountInfo,
  type AccountStorageConfig,
  type AccountSubscriptionSummary,
  type AccountUsageRecord,
  type AccountUsageSummary,
  type CheckInConfig,
  type DeletedEntryKind,
  type HealthStatus,
  type SiteAccount,
} from "~/types"
import type { DeepPartial } from "~/types/utils"
import { deepOverride } from "~/utils"
import { parseDayKey } from "~/utils/core/dayKey"

const DEFAULT_ACCOUNT_INFO: AccountInfo = {
  id: "",
  access_token: "",
  username: "",
  today_prompt_tokens: 0,
  today_completion_tokens: 0,
  today_quota_consumption: 0,
  today_requests_count: 0,
  today_income: 0,
}

const DEFAULT_HEALTH_STATUS: HealthStatus = {
  status: SiteHealthStatus.Unknown,
}

const DEFAULT_CHECK_IN_CONFIG: CheckInConfig = {
  automaticExecutionEnabled: true,
  methodKnowledge: { methods: {} },
  selection: { mode: CHECK_IN_SELECTION_MODES.Automatic },
}

// Placeholder values for required fields; real persisted data should override these.
const DEFAULT_SITE_ACCOUNT: SiteAccount = {
  id: "",
  site_name: "",
  site_url: "",
  health: DEFAULT_HEALTH_STATUS,
  site_type: SITE_TYPES.UNKNOWN,
  exchange_rate: DEFAULT_USD_TO_CNY_RATE,
  account_info: DEFAULT_ACCOUNT_INFO,
  last_sync_time: 0,
  updated_at: 0,
  user_updated_at: 0,
  created_at: 0,
  notes: "",
  tagIds: [],
  disabled: false,
  excludeFromTotalBalance: false,
  excludeFromTodayIncome: false,
  authType: AuthTypeEnum.AccessToken,
  checkIn: DEFAULT_CHECK_IN_CONFIG,
}

const VALID_AUTH_TYPES = new Set(Object.values(AuthTypeEnum))

const coerceNumber = <TFallback extends number | undefined>(
  input: unknown,
  fallback: TFallback,
): number | TFallback => {
  if (typeof input === "number" && Number.isFinite(input)) return input
  if (typeof input === "string" && input.trim() !== "") {
    const parsed = Number(input)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const coerceString = (input: unknown, fallback: string) =>
  typeof input === "string" ? input : fallback

const coerceOptionalString = (input: unknown) =>
  typeof input === "string" ? input : undefined

const coerceOptionalNumber = (input: unknown) => coerceNumber(input, undefined)

const coerceOptionalBoolean = (input: unknown) =>
  typeof input === "boolean" ? input : undefined

const coerceStringArray = (input: unknown): string[] => {
  if (!Array.isArray(input)) return []
  return input
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

const normalizeAccountUsageSummary = (
  raw: AccountUsageSummary | undefined,
): AccountUsageSummary | undefined => {
  if (!raw || typeof raw !== "object") return undefined
  const allowedScopes = new Set<AccountUsageSummary["scope"]>(
    ACCOUNT_USAGE_SUMMARY_SCOPES,
  )
  const scope = allowedScopes.has(raw.scope) ? raw.scope : "unknown"

  return {
    scope,
    ...(typeof raw.observedAt === "number" &&
    raw.observedAt > 0 &&
    Number.isFinite(new Date(raw.observedAt).getTime())
      ? { observedAt: raw.observedAt }
      : {}),
    ...(typeof raw.lastKnown === "boolean" ? { lastKnown: raw.lastKnown } : {}),
    ...(raw.reportedDay && parseDayKey(raw.reportedDay)
      ? { reportedDay: raw.reportedDay }
      : {}),
    totalRequests: coerceOptionalNumber(raw.totalRequests),
    totalTokens: coerceOptionalNumber(raw.totalTokens),
    totalCost: coerceOptionalNumber(raw.totalCost),
    ...(raw.cost === undefined
      ? {}
      : {
          cost: reportedUsageCostSchema.parse(raw.cost),
        }),
    lastRequestTime: coerceOptionalString(raw.lastRequestTime),
  }
}

const normalizeAccountSubscriptionSummary = (
  raw: AccountSubscriptionSummary | undefined,
): AccountSubscriptionSummary | undefined => {
  if (!raw || typeof raw !== "object") return undefined
  return {
    name: coerceOptionalString(raw.name),
    billingType: coerceOptionalString(raw.billingType),
    limit: coerceOptionalNumber(raw.limit),
    amountLimit: coerceOptionalNumber(raw.amountLimit),
    usedAmount: coerceOptionalNumber(raw.usedAmount),
    remainingAmount: coerceOptionalNumber(raw.remainingAmount),
    usedCount: coerceOptionalNumber(raw.usedCount),
    remainingCount: coerceOptionalNumber(raw.remainingCount),
    remainingTokens: coerceOptionalNumber(raw.remainingTokens),
    period: coerceOptionalString(raw.period),
    periodResetTime: coerceOptionalString(raw.periodResetTime),
    expireTime: coerceOptionalString(raw.expireTime),
    isLongTerm: coerceOptionalBoolean(raw.isLongTerm),
    isActive: coerceOptionalBoolean(raw.isActive),
    status: (
      Object.values(ACCOUNT_SUBSCRIPTION_STATUSES) as readonly string[]
    ).includes(raw.status ?? "")
      ? raw.status
      : undefined,
  }
}

const normalizeAccountUsageRecord = (
  raw: AccountUsageRecord,
): AccountUsageRecord => ({
  requestTime: coerceOptionalString(raw.requestTime),
  model: coerceOptionalString(raw.model),
  inputTokens: coerceOptionalNumber(raw.inputTokens),
  outputTokens: coerceOptionalNumber(raw.outputTokens),
  cacheCreationTokens: coerceOptionalNumber(raw.cacheCreationTokens),
  cacheReadTokens: coerceOptionalNumber(raw.cacheReadTokens),
  cacheInputTokens: coerceOptionalNumber(raw.cacheInputTokens),
  reasoningTokens: coerceOptionalNumber(raw.reasoningTokens),
  totalTokens: coerceOptionalNumber(raw.totalTokens),
  responseTime: coerceOptionalNumber(raw.responseTime),
  firstByteTime: coerceOptionalNumber(raw.firstByteTime),
  cost: coerceOptionalNumber(raw.cost),
  errorMessage: coerceOptionalString(raw.errorMessage),
  status: coerceOptionalString(raw.status),
})

const normalizeAccountUsageRecords = (
  raw: AccountUsageRecord[] | undefined,
): AccountUsageRecord[] | undefined => {
  if (!Array.isArray(raw)) return undefined
  return raw
    .filter(
      (record): record is AccountUsageRecord =>
        !!record && typeof record === "object",
    )
    .map(normalizeAccountUsageRecord)
}

const RESERVED_DELETED_ENTRY_RECORD_IDS = new Set([
  "__proto__",
  "constructor",
  "prototype",
])

const isDeletedEntryKind = (kind: unknown): kind is DeletedEntryKind =>
  DELETED_ENTRY_KINDS.includes(kind as DeletedEntryKind)

/**
 * Normalizes persisted deletion markers used by WebDAV sync reconciliation.
 */
function normalizeDeletedEntryRecords(
  raw: unknown,
): AccountStorageConfig["deletedEntryRecords"] {
  if (!raw || typeof raw !== "object") return {}

  const records = Object.create(null) as NonNullable<
    AccountStorageConfig["deletedEntryRecords"]
  >

  for (const [id, value] of Object.entries(raw)) {
    if (
      !id ||
      RESERVED_DELETED_ENTRY_RECORD_IDS.has(id) ||
      !value ||
      typeof value !== "object"
    ) {
      continue
    }

    const candidate = value as Record<string, unknown>
    const kind = candidate.kind
    const deletedAt = coerceNumber(candidate.deletedAt, 0)
    const entryUpdatedAt = coerceNumber(candidate.entryUpdatedAt, 0)

    if (!isDeletedEntryKind(kind)) continue
    if (deletedAt <= 0) continue

    records[id] = {
      kind,
      deletedAt,
      entryUpdatedAt,
    }
  }

  return records
}

/**
 * Creates the canonical default shape for `AccountStorageConfig`.
 *
 * All top-level collections are present as arrays and `last_updated` is set to `now`.
 */
export function createDefaultAccountStorageConfig(
  now: number = Date.now(),
): AccountStorageConfig {
  return {
    schemaVersion: 1,
    accounts: [],
    bookmarks: [],
    pinnedAccountIds: [],
    orderedAccountIds: [],
    deletedEntryRecords: {},
    last_updated: now,
  }
}

/**
 * Normalizes a raw persisted `AccountStorageConfig` for read paths.
 *
 * Ensures all top-level collections exist as arrays and that `last_updated`
 * is a number (falling back to `now`).
 */
export function normalizeAccountStorageConfigForRead(
  raw: AccountStorageConfig | undefined,
  now: number = Date.now(),
): AccountStorageConfig {
  if (
    raw !== undefined &&
    (raw === null ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      (raw.schemaVersion !== undefined && raw.schemaVersion !== 1) ||
      !Array.isArray(raw.accounts) ||
      (raw.bookmarks !== undefined && !Array.isArray(raw.bookmarks)))
  )
    throw new Error("unsupported_or_invalid_account_storage")
  return {
    schemaVersion: 1,
    accounts: Array.isArray(raw?.accounts) ? raw.accounts : [],
    bookmarks: Array.isArray(raw?.bookmarks) ? raw.bookmarks : [],
    pinnedAccountIds: Array.isArray(raw?.pinnedAccountIds)
      ? raw.pinnedAccountIds
      : [],
    orderedAccountIds: Array.isArray(raw?.orderedAccountIds)
      ? raw.orderedAccountIds
      : [],
    deletedEntryRecords: normalizeDeletedEntryRecords(raw?.deletedEntryRecords),
    last_updated:
      typeof raw?.last_updated === "number" ? raw.last_updated : now,
  }
}

/**
 * Normalizes an `AccountStorageConfig` for persistence (write paths).
 *
 * Ensures top-level collections are arrays and stamps `last_updated` to `now`.
 */
export function normalizeAccountStorageConfigForWrite(
  config: AccountStorageConfig,
  now: number = Date.now(),
): AccountStorageConfig {
  normalizeAccountStorageConfigForRead(config, now)
  return {
    ...createDefaultAccountStorageConfig(now),
    ...config,
    accounts: config.accounts.map(normalizeSiteAccount),
    bookmarks: Array.isArray(config.bookmarks) ? config.bookmarks : [],
    pinnedAccountIds: Array.isArray(config.pinnedAccountIds)
      ? config.pinnedAccountIds
      : [],
    orderedAccountIds: Array.isArray(config.orderedAccountIds)
      ? config.orderedAccountIds
      : [],
    deletedEntryRecords: normalizeDeletedEntryRecords(
      config.deletedEntryRecords,
    ),
    last_updated: now,
  }
}

/**
 * Normalizes the nested `account_info` object on a `SiteAccount`.
 *
 * Ensures all required numeric counters exist and are numbers; missing values
 * default to `0`.
 */
function normalizeAccountInfo(raw: Partial<AccountInfo> | undefined) {
  const merged = deepOverride(DEFAULT_ACCOUNT_INFO, raw ?? undefined)
  return {
    id: coerceAccountIdentity(merged.id, ""),
    access_token: coerceString(merged.access_token, ""),
    username: coerceString(merged.username, ""),
    ...(raw?.allowances === undefined
      ? {}
      : { allowances: accountAllowanceSnapshotSchema.parse(raw.allowances) }),
    ...(raw?.legacyFinancial ? { legacyFinancial: raw.legacyFinancial } : {}),
    ...(raw?.reportedIncome === undefined
      ? {}
      : {
          reportedIncome: financialIncomeFactSchema
            .array()
            .parse(raw.reportedIncome),
        }),
    ...(raw?.settledConsumption === undefined
      ? {}
      : {
          settledConsumption: financialConsumptionFactSchema
            .array()
            .parse(raw.settledConsumption),
        }),
    ...(raw?.balance === undefined
      ? {}
      : { balance: balanceSnapshotSchema.parse(raw.balance) }),
    today_prompt_tokens: coerceNumber(merged.today_prompt_tokens, 0),
    today_completion_tokens: coerceNumber(merged.today_completion_tokens, 0),
    today_quota_consumption: coerceNumber(merged.today_quota_consumption, 0),
    today_requests_count: coerceNumber(merged.today_requests_count, 0),
    today_income: coerceNumber(merged.today_income, 0),
    todayStatsAvailability:
      raw?.todayStatsAvailability === undefined
        ? undefined
        : normalizeAccountTodayStatsAvailability(raw.todayStatsAvailability),
    usage: normalizeAccountUsageSummary(merged.usage),
    ...(raw?.usageObservations === undefined
      ? {}
      : {
          usageObservations: raw.usageObservations.map((usage) => {
            const normalized = normalizeAccountUsageSummary(usage)
            if (!normalized)
              throw new Error("invalid_account_usage_observation")
            return normalized
          }),
        }),
    subscription: normalizeAccountSubscriptionSummary(merged.subscription),
    recentUsageRecords: normalizeAccountUsageRecords(merged.recentUsageRecords),
  }
}

/**
 * Normalizes a `HealthStatus` object.
 *
 * Validates `status` against {@link SiteHealthStatus} and drops invalid
 * optional fields without throwing.
 */
function normalizeHealthStatus(raw: Partial<HealthStatus> | undefined) {
  const merged = deepOverride(DEFAULT_HEALTH_STATUS, raw ?? undefined)
  return {
    status:
      merged.status && Object.values(SiteHealthStatus).includes(merged.status)
        ? merged.status
        : SiteHealthStatus.Unknown,
    reason: typeof merged.reason === "string" ? merged.reason : undefined,
    code: merged.code,
  }
}

/**
 * Normalizes canonical check-in state and applies the independent custom
 * URL flow's backward-compatible open policy.
 */
function normalizeCheckInConfig(raw: unknown): CheckInConfig {
  const normalized = normalizeCheckInConfigV7(raw)
  const customCheckIn = normalized.customCheckIn
    ? {
        ...normalized.customCheckIn,
        openRedeemWithCheckIn:
          normalized.customCheckIn.openRedeemWithCheckIn !== false,
      }
    : undefined

  return {
    ...normalized,
    ...(customCheckIn ? { customCheckIn } : {}),
  }
}

/** Decodes all accounts in a storage envelope into the canonical schema. */
export function canonicalizeAccountStorageConfig(
  raw: AccountStorageConfig | undefined,
): {
  config: AccountStorageConfig
  migratedCount: number
} {
  const normalized = normalizeAccountStorageConfigForRead(raw)
  const { accounts, migratedCount } = migrateAccountsConfig(normalized.accounts)

  return {
    config: {
      ...normalized,
      accounts: accounts.map(normalizeSiteAccount),
    },
    migratedCount,
  }
}

/**
 * Normalizes a persisted `SiteAccount` to the canonical runtime shape.
 *
 * This is intentionally tolerant of legacy/partial stored records. It preserves
 * deprecated fields (like `tags`) only when explicitly present in the input so
 * migrations that remove legacy fields stay effective.
 */
export function normalizeSiteAccount(raw: SiteAccount): SiteAccount {
  const merged = deepOverride<SiteAccount>(DEFAULT_SITE_ACCOUNT, raw)
  const updatedAt = coerceNumber(merged.updated_at, 0)
  const rawUserUpdatedAt = (raw as { user_updated_at?: unknown })
    .user_updated_at

  const normalized = {
    ...merged,
    id: coerceString(merged.id, ""),
    site_name: coerceString(merged.site_name, ""),
    site_type: isAccountSiteType(merged.site_type)
      ? merged.site_type
      : SITE_TYPES.UNKNOWN,
    site_url: normalizeAccountSiteProfileUrlForStorage({
      siteType: isAccountSiteType(merged.site_type)
        ? merged.site_type
        : SITE_TYPES.UNKNOWN,
      url: coerceString(merged.site_url, ""),
    }),
    exchange_rate: coerceNumber(merged.exchange_rate, DEFAULT_USD_TO_CNY_RATE),
    account_info: normalizeAccountInfo(
      migrateAccountFinancialInfo(raw.account_info, {
        accountId: coerceString(merged.id, ""),
        siteUrl: coerceString(merged.site_url, ""),
        siteType: merged.site_type,
        capturedAt: coerceNumber(merged.last_sync_time, 0),
      }),
    ),
    health: normalizeHealthStatus(merged.health),
    last_sync_time: coerceNumber(merged.last_sync_time, 0),
    updated_at: updatedAt,
    user_updated_at: coerceNumber(rawUserUpdatedAt, updatedAt),
    manualBalanceObservation:
      normalizeManualBalanceUsd(raw.manualBalanceUsd) === undefined
        ? undefined
        : raw.manualBalanceObservation &&
            Number.isFinite(raw.manualBalanceObservation.at) &&
            [
              MANUAL_BALANCE_OBSERVATION_KINDS.Edit,
              MANUAL_BALANCE_OBSERVATION_KINDS.LegacyReference,
            ].includes(raw.manualBalanceObservation.kind)
          ? raw.manualBalanceObservation
          : {
              at: coerceNumber(rawUserUpdatedAt, updatedAt),
              kind: MANUAL_BALANCE_OBSERVATION_KINDS.LegacyReference,
            },
    created_at: coerceNumber(merged.created_at, 0),
    notes: coerceString(merged.notes, ""),
    tagIds: coerceStringArray(merged.tagIds),
    tags: Array.isArray(merged.tags)
      ? coerceStringArray(merged.tags)
      : undefined,
    disabled: merged.disabled === true,
    excludeFromTotalBalance: merged.excludeFromTotalBalance === true,
    excludeFromTodayIncome: merged.excludeFromTodayIncome === true,
    authType: VALID_AUTH_TYPES.has(merged.authType)
      ? merged.authType
      : AuthTypeEnum.AccessToken,
    checkIn: normalizeCheckInConfig(merged.checkIn),
    login: resolveAccountLogin(merged),
  }

  delete normalized.passwordAuth
  delete normalized.checkIn.loginCheckIn
  delete (normalized as SiteAccount & { can_check_in?: unknown }).can_check_in
  delete (normalized as SiteAccount & { supports_check_in?: unknown })
    .supports_check_in
  return normalized
}

/**
 * Builds a canonical persisted `SiteAccount` for the account mutation module.
 *
 * Applies canonical defaults, assigns id/timestamps, and normalizes nested
 * structures so downstream reads see stable shapes.
 */
export function createPersistedSiteAccount(params: {
  account: Omit<
    SiteAccount,
    "id" | "created_at" | "updated_at" | "user_updated_at"
  >
  id: string
  now: number
}): SiteAccount {
  const merged = deepOverride<SiteAccount>(
    DEFAULT_SITE_ACCOUNT,
    params.account,
    {
      id: params.id,
      created_at: params.now,
      updated_at: params.now,
      user_updated_at: params.now,
      configVersion: CURRENT_CONFIG_VERSION,
    } as DeepPartial<SiteAccount>,
  )

  if (merged.account_info.balance)
    merged.account_info.balance = bindAccountBalance(
      merged.account_info.balance,
      params.id,
    )
  if (merged.account_info.allowances)
    merged.account_info.allowances = bindAccountAllowances(
      merged.account_info.allowances,
      params.id,
    )
  const bindFinancialScope = (scope: UsageScope): UsageScope => ({
    ...scope,
    subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId: params.id },
  })
  const bindScopedFacts = <T extends { scope: UsageScope }>(
    facts?: T[],
  ): T[] | undefined =>
    facts?.map((fact) => ({ ...fact, scope: bindFinancialScope(fact.scope) }))
  const bindUsage = (usage: AccountUsageSummary): AccountUsageSummary =>
    usage.cost?.scope
      ? {
          ...usage,
          cost: {
            ...usage.cost,
            scope: bindFinancialScope(usage.cost.scope),
          },
        }
      : usage
  if (merged.account_info.usage)
    merged.account_info.usage = bindUsage(merged.account_info.usage)
  merged.account_info.usageObservations =
    merged.account_info.usageObservations?.map(bindUsage)
  merged.account_info.settledConsumption = bindScopedFacts(
    merged.account_info.settledConsumption,
  )
  merged.account_info.reportedIncome = bindScopedFacts(
    merged.account_info.reportedIncome,
  )
  if (normalizeManualBalanceUsd(merged.manualBalanceUsd) !== undefined)
    merged.manualBalanceObservation = {
      at: params.now,
      kind: MANUAL_BALANCE_OBSERVATION_KINDS.Edit,
    }
  return normalizeSiteAccount(merged)
}

export const AccountUpdateUserTimestampMode = {
  Touch: "touch",
  Preserve: "preserve",
} as const

export type AccountUpdateUserTimestampMode =
  (typeof AccountUpdateUserTimestampMode)[keyof typeof AccountUpdateUserTimestampMode]

export type AccountUpdateOptions = {
  userTimestampMode: AccountUpdateUserTimestampMode
}

/**
 * Applies a partial update to a stored `SiteAccount`.
 *
 * Uses deterministic deep-merge semantics (via `deepOverride`):
 * - nested objects merge
 * - arrays replace (no concatenation)
 * - explicitly supplied today-stat availability replaces the prior value
 *
 * Also preserves explicit cleanup semantics where an update sets `health.code`
 * to `undefined` to delete the property from storage.
 */
export function applySiteAccountUpdates(params: {
  account: SiteAccount
  updates: DeepPartial<SiteAccount>
  now: number
  userTimestampMode: AccountUpdateUserTimestampMode
}): SiteAccount {
  const normalized = normalizeSiteAccount(params.account)
  const merged = deepOverride<SiteAccount>(normalized, {
    ...params.updates,
    updated_at: params.now,
    ...(params.userTimestampMode === AccountUpdateUserTimestampMode.Preserve
      ? {}
      : { user_updated_at: params.now }),
  } as DeepPartial<SiteAccount>)
  const previousManual = normalizeManualBalanceUsd(normalized.manualBalanceUsd)
  const nextManual = normalizeManualBalanceUsd(merged.manualBalanceUsd)
  merged.manualBalanceObservation =
    nextManual === undefined
      ? undefined
      : previousManual === nextManual
        ? normalized.manualBalanceObservation
        : { at: params.now, kind: MANUAL_BALANCE_OBSERVATION_KINDS.Edit }
  if (
    params.updates.account_info &&
    Object.hasOwn(params.updates.account_info, "balance")
  ) {
    merged.account_info.balance = params.updates.account_info
      .balance as AccountInfo["balance"]
  }
  if (
    params.updates.account_info &&
    Object.hasOwn(params.updates.account_info, "settledConsumption")
  ) {
    merged.account_info.settledConsumption = params.updates.account_info
      .settledConsumption as AccountInfo["settledConsumption"]
  }
  if (
    params.updates.account_info &&
    Object.hasOwn(params.updates.account_info, "allowances")
  )
    merged.account_info.allowances = params.updates.account_info
      .allowances as AccountInfo["allowances"]
  for (const field of [
    "usage",
    "usageObservations",
    "reportedIncome",
    "legacyFinancial",
  ] as const)
    if (
      params.updates.account_info &&
      Object.hasOwn(params.updates.account_info, field)
    )
      Object.assign(merged.account_info, {
        [field]: params.updates.account_info[field],
      })

  if (
    params.updates.account_info &&
    Object.prototype.hasOwnProperty.call(
      params.updates.account_info,
      "todayStatsAvailability",
    )
  ) {
    merged.account_info.todayStatsAvailability = params.updates.account_info
      .todayStatsAvailability as AccountInfo["todayStatsAvailability"]
  }

  // Login is one credential-bearing configuration, never a partial deep merge.
  if (Object.prototype.hasOwnProperty.call(params.updates, "aimlApiAuth")) {
    merged.aimlApiAuth = params.updates
      .aimlApiAuth as SiteAccount["aimlApiAuth"]
  }
  if (Object.prototype.hasOwnProperty.call(params.updates, "login")) {
    merged.login = normalizeAccountLogin(params.updates.login)
  }
  // Route overrides are a complete map owned by the draft. Deep-merging it
  // resurrects deleted method entries (and ignores an explicit clear).
  if (
    params.updates.checkIn &&
    Object.prototype.hasOwnProperty.call(
      params.updates.checkIn,
      "routeOverrides",
    )
  ) {
    merged.checkIn.routeOverrides = normalizeCheckInConfigV7(
      params.updates.checkIn,
    ).routeOverrides
  }
  const result = normalizeSiteAccount(merged)
  if (!hasSameAccountRequestIdentity(result, normalized)) {
    if (result.account_info.legacyFinancial?.cashflow)
      result.account_info.legacyFinancial = {
        ...result.account_info.legacyFinancial,
        identityInvalidated: true,
      }
    if (
      params.updates.account_info?.allowances === undefined &&
      result.account_info.allowances
    )
      result.account_info.allowances = {
        ...result.account_info.allowances,
        coverage: FINANCIAL_COVERAGE.Partial,
        entries: result.account_info.allowances.entries.map((entry) => ({
          ...entry,
          constraint: staleBudgetConstraint(entry.constraint),
        })),
      }
    if (
      params.updates.account_info?.usage === undefined &&
      result.account_info.usage
    )
      result.account_info.usage = staleUsageSummary(result.account_info.usage)
    if (params.updates.account_info?.usageObservations === undefined)
      result.account_info.usageObservations =
        result.account_info.usageObservations?.map(staleUsageSummary)
    if (params.updates.account_info?.settledConsumption === undefined)
      result.account_info.settledConsumption =
        result.account_info.settledConsumption?.map((fact) => ({
          ...fact,
          amount: staleObservation(fact.amount),
        }))
    if (params.updates.account_info?.reportedIncome === undefined)
      result.account_info.reportedIncome =
        result.account_info.reportedIncome?.map((fact) => ({
          ...fact,
          amount: staleObservation(fact.amount),
        }))
  }
  if (
    !hasSameAccountRequestIdentity(result, normalized) &&
    params.updates.account_info?.balance === undefined &&
    result.account_info.balance
  ) {
    result.account_info.balance = {
      ...result.account_info.balance,
      coverage: FINANCIAL_COVERAGE.Partial,
      positions: result.account_info.balance.positions.map((position) =>
        staleBalancePosition(position, BALANCE_IDENTITY_CHANGED_REASON),
      ),
    }
  }
  if (
    !Object.prototype.hasOwnProperty.call(params.updates, "login") &&
    (result.site_url !== normalized.site_url ||
      result.site_type !== normalized.site_type ||
      result.account_info.id !== normalized.account_info.id)
  ) {
    delete result.login
  }

  if (
    params.updates.checkIn &&
    Object.prototype.hasOwnProperty.call(
      params.updates.checkIn,
      "customCheckIn",
    ) &&
    params.updates.checkIn.customCheckIn === undefined
  ) {
    delete result.checkIn.customCheckIn
  }

  // Choosing "follow the global preference" clears the account override, and a
  // deep merge would otherwise keep the previous boolean.
  if (
    params.updates.checkIn &&
    Object.prototype.hasOwnProperty.call(
      params.updates.checkIn,
      "continueWhenVerificationRequired",
    ) &&
    params.updates.checkIn.continueWhenVerificationRequired === undefined
  ) {
    delete result.checkIn.continueWhenVerificationRequired
  }

  if (
    params.updates.health &&
    Object.prototype.hasOwnProperty.call(params.updates.health, "code") &&
    params.updates.health.code === undefined &&
    result.health &&
    Object.prototype.hasOwnProperty.call(result.health, "code")
  ) {
    delete (result.health as { code?: unknown }).code
  }

  return result
}
