/**
 * Test factories for generating safe, non-secret-like values.
 *
 * IMPORTANT:
 * - Do not embed realistic-looking secrets (e.g. `sk-...`) as string literals.
 * - Keep values deterministic to avoid brittle snapshots/expectations.
 */

import { ChannelType } from "~/constants"
import {
  createDefaultPreferences,
  DEFAULT_PREFERENCES,
  type TempWindowFallbackPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import type {
  AccountShareSnapshotPayload,
  OverviewShareSnapshotPayload,
  ShareSnapshotPayload,
} from "~/services/sharing/shareSnapshots/types"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type ApiToken,
  type DisplaySiteData,
  type SiteAccount,
  type Tag,
} from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { CHANNEL_STATUS, type ManagedSiteChannel } from "~/types/managedSite"

/**
 * Build a dummy API key used by Web AI API Check tests.
 */
export function buildApiKey(): string {
  return "test-api-key"
}

/**
 * Build a clipboard payload that the content script can extract credentials from.
 */
export function buildApiCheckClipboardText(params?: {
  baseUrl?: string
  apiKey?: string
}): string {
  const baseUrl = params?.baseUrl ?? "https://proxy.example.com/api/v1"
  const apiKey = params?.apiKey ?? buildApiKey()

  return [`Base URL: ${baseUrl}`, `API Key: ${apiKey}`].join("\n")
}

/**
 * Build a share snapshot payload with deterministic, non-secret-like values.
 */
export function buildShareSnapshotPayload(
  overrides:
    | (Partial<AccountShareSnapshotPayload> & { kind?: "account" })
    | (Partial<OverviewShareSnapshotPayload> & { kind: "overview" }) = {},
): ShareSnapshotPayload {
  if (overrides.kind === "overview") {
    const base: OverviewShareSnapshotPayload = {
      kind: "overview",
      currencyType: "USD",
      enabledAccountCount: 2,
      totalBalance: 123.45,
      asOf: 1700000000000,
      backgroundSeed: 1,
    }

    return { ...base, ...overrides, kind: "overview" }
  }

  const base: AccountShareSnapshotPayload = {
    kind: "account",
    currencyType: "USD",
    siteName: "Example Site",
    originUrl: "https://example.com",
    balance: 12.34,
    asOf: 1700000000000,
    backgroundSeed: 1,
  }

  return { ...base, ...overrides, kind: "account" }
}

/**
 * Build a minimal `DisplaySiteData` fixture with sensible defaults for UI tests.
 */
export function buildDisplaySiteData(
  overrides: Partial<DisplaySiteData> = {},
): DisplaySiteData {
  const base: DisplaySiteData = {
    id: "account-1",
    name: "Test Account",
    username: "test-user",
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    health: { status: SiteHealthStatus.Healthy },
    siteType: "test",
    baseUrl: "https://example.com",
    token: "test-token",
    userId: 1,
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
  }

  return {
    ...base,
    ...overrides,
    checkIn: {
      ...base.checkIn,
      ...overrides.checkIn,
    },
  }
}

/**
 * Build an `ApiToken` fixture with stable defaults and shallow overrides.
 */
export function buildApiToken(overrides: Partial<ApiToken> = {}): ApiToken {
  const base: ApiToken = {
    id: 1,
    user_id: 1,
    key: "test-key",
    status: 1,
    name: "Test Token",
    created_time: 0,
    accessed_time: 0,
    expired_time: -1,
    remain_quota: 0,
    unlimited_quota: true,
    model_limits_enabled: false,
    model_limits: "",
    allow_ips: "",
    used_quota: 0,
    group: "default",
  }

  return { ...base, ...overrides }
}

/**
 * Build a Sub2API-flavored `DisplaySiteData` fixture for shared key-flow tests.
 */
export function buildSub2ApiAccount(
  overrides: Partial<DisplaySiteData> = {},
): DisplaySiteData {
  return buildDisplaySiteData({
    id: "sub2-acc",
    name: "Sub2API",
    username: "tester",
    siteType: "sub2api",
    baseUrl: "https://sub2.example.com",
    token: "jwt-token",
    userId: 1,
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
    ...overrides,
  })
}

/**
 * Build a Sub2API-flavored `ApiToken` fixture for shared key-flow tests.
 */
export function buildSub2ApiToken(overrides: Partial<ApiToken> = {}): ApiToken {
  return buildApiToken({
    id: 1,
    user_id: 1,
    key: "sub2api-test-key",
    status: 1,
    name: "default",
    created_time: 0,
    accessed_time: 0,
    expired_time: -1,
    remain_quota: 0,
    unlimited_quota: true,
    used_quota: 0,
    allow_ips: "",
    model_limits_enabled: false,
    model_limits: "",
    group: "default",
    ...overrides,
  })
}

/**
 * Build a `SiteAccount` fixture with stable defaults and shallow overrides.
 */
export function buildSiteAccount(
  overrides: Partial<SiteAccount> = {},
): SiteAccount {
  const base: SiteAccount = {
    id: "account-1",
    site_name: "Test",
    site_url: "https://example.com",
    site_type: "test",
    exchange_rate: 7,
    notes: "",
    tagIds: [],
    checkIn: { enableDetection: true },
    health: { status: SiteHealthStatus.Healthy },
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      id: 1,
      access_token: "test-token",
      username: "test-user",
      quota: 1000,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    last_sync_time: 1700000000000,
    created_at: 1700000000000,
    updated_at: 1700000000000,
  }

  return {
    ...base,
    ...overrides,
    health: {
      ...base.health,
      ...(overrides.health ?? {}),
    },
    account_info: {
      ...base.account_info,
      ...(overrides.account_info ?? {}),
    },
    checkIn: {
      ...base.checkIn,
      ...(overrides.checkIn ?? {}),
    },
  }
}

/**
 * Build a `Tag` fixture with stable defaults and shallow overrides.
 */
export function buildTag(overrides: Partial<Tag> = {}): Tag {
  const base: Tag = {
    id: "tag-1",
    name: "Test Tag",
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  }

  return { ...base, ...overrides }
}

/**
 * Build an `ApiCredentialProfile` fixture with deterministic, non-secret-like values.
 */
export function buildApiCredentialProfile(
  overrides: Partial<ApiCredentialProfile> = {},
): ApiCredentialProfile {
  const base: ApiCredentialProfile = {
    id: "profile-1",
    name: "Test Profile",
    apiType: API_TYPES.OPENAI,
    baseUrl: "https://proxy.example.com",
    apiKey: buildApiKey(),
    tagIds: [],
    notes: "",
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  }

  return { ...base, ...overrides }
}

/**
 * Build a managed-site channel fixture with deterministic, UI-friendly defaults.
 */
export function buildManagedSiteChannel(
  overrides: Partial<ManagedSiteChannel> = {},
): ManagedSiteChannel {
  const base: ManagedSiteChannel = {
    id: 1,
    type: ChannelType.OpenAI,
    key: "",
    name: "Test Channel",
    base_url: "https://example.com",
    models: "",
    status: CHANNEL_STATUS.Enable,
    weight: 0,
    priority: 0,
    openai_organization: null,
    test_model: null,
    created_time: 1700000000,
    test_time: 0,
    response_time: 0,
    other: "",
    balance: 0,
    balance_updated_time: 0,
    group: "default",
    used_quota: 0,
    model_mapping: "{}",
    status_code_mapping: "{}",
    auto_ban: 0,
    other_info: "{}",
    tag: null,
    param_override: null,
    header_override: null,
    remark: null,
    channel_info: {
      is_multi_key: false,
      multi_key_size: 0,
      multi_key_status_list: null,
      multi_key_polling_index: 0,
      multi_key_mode: "",
    },
    setting: "{}",
    settings: "{}",
  }

  return {
    ...base,
    ...overrides,
    channel_info: {
      ...base.channel_info,
      ...overrides.channel_info,
    },
  }
}

/**
 * Build a `UserPreferences` fixture with defaults and shallow overrides.
 */
export function buildUserPreferences(
  overrides: Partial<UserPreferences> = {},
): UserPreferences {
  const preferences = { ...createDefaultPreferences(), ...overrides }
  if (!Object.prototype.hasOwnProperty.call(overrides, "lastUpdated")) {
    preferences.lastUpdated = DEFAULT_PREFERENCES.lastUpdated
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      overrides,
      "sharedPreferencesLastUpdated",
    )
  ) {
    preferences.sharedPreferencesLastUpdated =
      DEFAULT_PREFERENCES.sharedPreferencesLastUpdated ??
      DEFAULT_PREFERENCES.lastUpdated
  }

  return preferences
}

/**
 * Build a `TempWindowFallbackPreferences` fixture with stable defaults.
 */
export function buildTempWindowPrefs(
  overrides: Partial<TempWindowFallbackPreferences> = {},
): TempWindowFallbackPreferences {
  const base: TempWindowFallbackPreferences = {
    enabled: true,
    useInPopup: true,
    useInSidePanel: true,
    useInOptions: true,
    useForAutoRefresh: true,
    useForManualRefresh: true,
    tempContextMode: "composite",
  }

  return { ...base, ...overrides }
}
