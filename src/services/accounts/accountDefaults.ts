import { UNKNOWN_SITE } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type AccountInfo,
  type AccountStorageConfig,
  type CheckInConfig,
  type HealthStatus,
  type SiteAccount,
} from "~/types"
import type { DeepPartial } from "~/types/utils"
import { deepOverride } from "~/utils"

const DEFAULT_ACCOUNT_INFO: AccountInfo = {
  id: 0,
  access_token: "",
  username: "",
  quota: 0,
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
  enableDetection: false,
}

// Placeholder values for required fields; real persisted data should override these.
const DEFAULT_SITE_ACCOUNT: SiteAccount = {
  id: "",
  site_name: "",
  site_url: "",
  health: DEFAULT_HEALTH_STATUS,
  site_type: UNKNOWN_SITE,
  exchange_rate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
  account_info: DEFAULT_ACCOUNT_INFO,
  last_sync_time: 0,
  updated_at: 0,
  created_at: 0,
  notes: "",
  tagIds: [],
  disabled: false,
  excludeFromTotalBalance: false,
  authType: AuthTypeEnum.AccessToken,
  checkIn: DEFAULT_CHECK_IN_CONFIG,
}

const VALID_AUTH_TYPES = new Set(Object.values(AuthTypeEnum))

const coerceNumber = (input: unknown, fallback: number) => {
  if (typeof input === "number" && Number.isFinite(input)) return input
  if (typeof input === "string" && input.trim() !== "") {
    const parsed = Number(input)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const coerceString = (input: unknown, fallback: string) =>
  typeof input === "string" ? input : fallback

const coerceStringArray = (input: unknown): string[] => {
  if (!Array.isArray(input)) return []
  return input
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
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
    accounts: [],
    bookmarks: [],
    pinnedAccountIds: [],
    orderedAccountIds: [],
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
  return {
    accounts: Array.isArray(raw?.accounts) ? raw.accounts : [],
    bookmarks: Array.isArray(raw?.bookmarks) ? raw.bookmarks : [],
    pinnedAccountIds: Array.isArray(raw?.pinnedAccountIds)
      ? raw.pinnedAccountIds
      : [],
    orderedAccountIds: Array.isArray(raw?.orderedAccountIds)
      ? raw.orderedAccountIds
      : [],
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
  return {
    ...createDefaultAccountStorageConfig(now),
    ...config,
    accounts: Array.isArray(config.accounts) ? config.accounts : [],
    bookmarks: Array.isArray(config.bookmarks) ? config.bookmarks : [],
    pinnedAccountIds: Array.isArray(config.pinnedAccountIds)
      ? config.pinnedAccountIds
      : [],
    orderedAccountIds: Array.isArray(config.orderedAccountIds)
      ? config.orderedAccountIds
      : [],
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
    id: coerceNumber(merged.id, 0),
    access_token: coerceString(merged.access_token, ""),
    username: coerceString(merged.username, ""),
    quota: coerceNumber(merged.quota, 0),
    today_prompt_tokens: coerceNumber(merged.today_prompt_tokens, 0),
    today_completion_tokens: coerceNumber(merged.today_completion_tokens, 0),
    today_quota_consumption: coerceNumber(merged.today_quota_consumption, 0),
    today_requests_count: coerceNumber(merged.today_requests_count, 0),
    today_income: coerceNumber(merged.today_income, 0),
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
 * Normalizes a `CheckInConfig` object using deterministic deep-merge semantics.
 *
 * Default behavior is backward-compatible:
 * - `enableDetection` defaults to false
 * - `autoCheckInEnabled` defaults to true unless explicitly set to false
 * - `customCheckIn.openRedeemWithCheckIn` defaults to true unless explicitly set to false
 */
function normalizeCheckInConfig(raw: DeepPartial<CheckInConfig> | undefined) {
  const merged = deepOverride(DEFAULT_CHECK_IN_CONFIG, raw ?? undefined)

  const customCheckIn = merged.customCheckIn
    ? {
        ...merged.customCheckIn,
        openRedeemWithCheckIn:
          merged.customCheckIn.openRedeemWithCheckIn !== false,
      }
    : undefined

  return {
    ...merged,
    enableDetection: merged.enableDetection === true,
    autoCheckInEnabled: merged.autoCheckInEnabled !== false,
    customCheckIn,
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

  return {
    ...merged,
    id: coerceString(merged.id, ""),
    site_name: coerceString(merged.site_name, ""),
    site_url: coerceString(merged.site_url, ""),
    site_type: coerceString(merged.site_type, UNKNOWN_SITE) || UNKNOWN_SITE,
    exchange_rate: coerceNumber(
      merged.exchange_rate,
      UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
    ),
    account_info: normalizeAccountInfo(merged.account_info),
    health: normalizeHealthStatus(merged.health),
    last_sync_time: coerceNumber(merged.last_sync_time, 0),
    updated_at: coerceNumber(merged.updated_at, 0),
    created_at: coerceNumber(merged.created_at, 0),
    notes: coerceString(merged.notes, ""),
    tagIds: coerceStringArray(merged.tagIds),
    tags: Array.isArray(merged.tags)
      ? coerceStringArray(merged.tags)
      : undefined,
    disabled: merged.disabled === true,
    excludeFromTotalBalance: merged.excludeFromTotalBalance === true,
    authType: VALID_AUTH_TYPES.has(merged.authType)
      ? merged.authType
      : AuthTypeEnum.AccessToken,
    checkIn: normalizeCheckInConfig(merged.checkIn),
  }
}

/**
 * Builds a persisted `SiteAccount` for `accountStorage.addAccount`.
 *
 * Applies canonical defaults, assigns id/timestamps, and normalizes nested
 * structures so downstream reads see stable shapes.
 */
export function createPersistedSiteAccount(params: {
  account: Omit<SiteAccount, "id" | "created_at" | "updated_at">
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
    } as DeepPartial<SiteAccount>,
  )

  return normalizeSiteAccount(merged)
}

/**
 * Applies a partial update to a stored `SiteAccount`.
 *
 * Uses deterministic deep-merge semantics (via `deepOverride`):
 * - nested objects merge
 * - arrays replace (no concatenation)
 *
 * Also preserves explicit cleanup semantics where an update sets `health.code`
 * to `undefined` to delete the property from storage.
 */
export function applySiteAccountUpdates(params: {
  account: SiteAccount
  updates: DeepPartial<SiteAccount>
  now: number
}): SiteAccount {
  const normalized = normalizeSiteAccount(params.account)
  const merged = deepOverride<SiteAccount>(normalized, {
    ...params.updates,
    updated_at: params.now,
  } as DeepPartial<SiteAccount>)
  const result = normalizeSiteAccount(merged)

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
