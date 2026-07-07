import type { BrowserContext, Page, Worker } from "@playwright/test"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createDefaultAccountStorageConfig,
  normalizeAccountStorageConfigForWrite,
  normalizeSiteAccount,
} from "~/services/accounts/accountDefaults"
import {
  I18NEXT_LANGUAGE_STORAGE_KEY,
  STORAGE_KEYS,
} from "~/services/core/storageKeys"
import { USAGE_HISTORY_STORAGE_KEYS } from "~/services/history/usageHistory/constants"
import type { ModelPricing } from "~/services/modelList/pricingModel"
import { SITE_ANNOUNCEMENTS_STORE_SCHEMA_VERSION } from "~/services/siteAnnouncements/constants"
import { API_TYPES } from "~/services/verification/aiApiVerification/types"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type AccountStorageConfig,
  type ApiToken,
  type SiteAccount,
  type SiteBookmark,
} from "~/types"
import {
  API_CREDENTIAL_PROFILES_CONFIG_VERSION,
  type ApiCredentialProfile,
} from "~/types/apiCredentialProfiles"
import {
  DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
  type DailyBalanceHistoryStore,
} from "~/types/dailyBalanceHistory"
import type { SiteAnnouncementStoreState } from "~/types/siteAnnouncements"
import {
  USAGE_HISTORY_STORE_SCHEMA_VERSION,
  type UsageHistoryAccountStore,
  type UsageHistoryStore,
} from "~/types/usageHistory"
import type { DeepPartial } from "~/types/utils"
import { deepOverride } from "~/utils"

import { setPlasmoStorageValue } from "./extensionState"

type StoredAccountOverrides = DeepPartial<SiteAccount>

type StoredApiCredentialProfileOverrides = Partial<ApiCredentialProfile>
type StoredBookmarkOverrides = Partial<SiteBookmark>

type WaitForExtensionPageParams = {
  extensionId: string
  path: string
  hash?: string
  searchParams?: Record<string, string>
  timeoutMs?: number
  reuseExistingPage?: boolean
}

type StubNewApiSiteRoutesOptions = {
  baseUrl?: string
  title?: string
  systemName?: string
  exchangeRate?: number
  /** Quota total returned by the lightweight today-usage stat endpoint. */
  todayQuotaConsumption?: number
  /** Initial quota returned by the mocked account self endpoint. */
  initialQuota?: number
  /** Quota credited by the mocked redemption-code top-up endpoint. */
  redemptionCreditQuota?: number
  onRedeemCode?: (code: string) => void | Promise<void>
  userId?: string | number
  username?: string
  accessToken?: string
  models?: string[]
  pricingModels?: ModelPricing[]
  initialTokens?: ApiToken[]
  groups?: Record<string, { desc: string; ratio: number }>
}

/** Scenario-specific console-error patterns that should not fail the test. */
export type ExtensionPageGuardOptions = {
  ignoreConsoleErrorPatterns?: RegExp[]
}

const E2E_SPONSOR_REMOTE_CATALOG_URL =
  "https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/public/sponsor-catalog.v5.json"
const E2E_SPONSOR_CATALOG_PAYLOAD = {
  schemaVersion: 5,
  items: [],
}

/**
 * Surface unexpected runtime errors immediately instead of letting the popup or
 * options page fail silently in the background.
 */
export function installExtensionPageGuards(
  page: Page,
  options?: ExtensionPageGuardOptions,
) {
  installExtensionPageGuardsWithOptions(page, options)
}

/**
 * Same as {@link installExtensionPageGuards}, but allows narrowly ignoring
 * known-noisy console errors for scenario-specific real-site flows.
 */
function installExtensionPageGuardsWithOptions(
  page: Page,
  options: ExtensionPageGuardOptions = {},
) {
  page.on("pageerror", (error) => {
    throw error
  })

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return
    }

    const text = message.text()
    if (
      options.ignoreConsoleErrorPatterns?.some((pattern) => pattern.test(text))
    ) {
      return
    }

    throw new Error(text)
  })
}

/**
 * Lock the extension to a known locale before the page bootstraps so text
 * selectors stay stable across machines and CI.
 */
export async function forceExtensionLanguage(page: Page, language = "en") {
  await page.addInitScript(
    ([languageStorageKey, nextLanguage]) => {
      window.localStorage.setItem(languageStorageKey, nextLanguage)
    },
    [I18NEXT_LANGUAGE_STORAGE_KEY, language],
  )
}

/**
 * Reuse deterministic external catalog payloads so unrelated background
 * refreshes do not reach the network during these user-flow specs.
 */
export async function stubLlmMetadataIndex(context: BrowserContext) {
  await context.route(
    "https://llm-metadata.pages.dev/api/index.json",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ models: [] }),
      }),
  )
  await stubSponsorRemoteCatalog(context)
}

/**
 * Reuse a deterministic sponsor catalog payload so background recommendation
 * refreshes do not depend on a PR branch asset already existing on main.
 */
export async function stubSponsorRemoteCatalog(context: BrowserContext) {
  await context.route(E2E_SPONSOR_REMOTE_CATALOG_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(E2E_SPONSOR_CATALOG_PAYLOAD),
    }),
  )
}

/**
 * Build the minimal persisted account record needed by popup/options flows.
 */
export function createStoredAccount(
  overrides: StoredAccountOverrides = {},
): SiteAccount {
  const now = Date.now()
  const baseAccount: SiteAccount = {
    id: "e2e-account-1",
    site_name: "E2E Example",
    site_url: "https://example.com",
    health: { status: SiteHealthStatus.Healthy },
    site_type: SITE_TYPES.NEW_API,
    exchange_rate: 7,
    account_info: {
      id: "1",
      access_token: "e2e-token",
      username: "e2e-user",
      quota: 1000,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    last_sync_time: now,
    updated_at: now,
    user_updated_at: now,
    created_at: now,
    notes: "",
    tagIds: [],
    disabled: false,
    excludeFromTotalBalance: false,
    excludeFromTodayIncome: false,
    authType: AuthTypeEnum.AccessToken,
    checkIn: {
      enableDetection: false,
    },
  }

  return normalizeSiteAccount(deepOverride(baseAccount, overrides))
}

/**
 * Persist a canonical account-storage payload through the service worker so
 * popup, options, and background all observe the same seeded accounts.
 */
export async function seedStoredAccounts(
  serviceWorker: Worker,
  accounts: SiteAccount[],
) {
  const now = Date.now()
  const config: AccountStorageConfig = normalizeAccountStorageConfigForWrite(
    {
      ...createDefaultAccountStorageConfig(now),
      accounts,
    },
    now,
  )

  await setPlasmoStorageValue(serviceWorker, STORAGE_KEYS.ACCOUNTS, config)
}

/**
 * Build the minimal persisted bookmark record needed by popup/options flows.
 */
export function createStoredBookmark(
  overrides: StoredBookmarkOverrides = {},
): SiteBookmark {
  const now = Date.now()

  return {
    id: "e2e-bookmark-1",
    name: "E2E Bookmark",
    url: "https://example.com/docs",
    tagIds: [],
    notes: "",
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

/**
 * Persist bookmarks through the shared account-storage payload so options and
 * popup bookmark views start from a deterministic saved state.
 */
export async function seedStoredBookmarks(
  serviceWorker: Worker,
  bookmarks: SiteBookmark[],
) {
  const now = Date.now()
  const config: AccountStorageConfig = normalizeAccountStorageConfigForWrite(
    {
      ...createDefaultAccountStorageConfig(now),
      bookmarks,
    },
    now,
  )

  await setPlasmoStorageValue(serviceWorker, STORAGE_KEYS.ACCOUNTS, config)
}

/**
 * Persist the global tag store used by account/bookmark filter chips.
 */
export async function seedTagStore(
  serviceWorker: Worker,
  tags: Array<{ id: string; name: string }>,
) {
  const now = Date.now()
  await setPlasmoStorageValue(serviceWorker, STORAGE_KEYS.TAG_STORE, {
    version: 1,
    tagsById: Object.fromEntries(
      tags.map((tag) => [
        tag.id,
        {
          id: tag.id,
          name: tag.name,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    ),
  })
}

/**
 * Persist daily balance snapshots for Balance History E2E scenarios.
 */
export async function seedDailyBalanceHistoryStore(
  serviceWorker: Worker,
  snapshotsByAccountId: DailyBalanceHistoryStore["snapshotsByAccountId"],
) {
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE,
    {
      schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
      snapshotsByAccountId,
    } satisfies DailyBalanceHistoryStore,
  )
}

function createEmptyUsageHistoryAccountStore(
  overrides: Partial<UsageHistoryAccountStore> = {},
): UsageHistoryAccountStore {
  return {
    cursor: {
      lastSeenCreatedAt: 0,
      fingerprintsAtLastSeenCreatedAt: [],
    },
    status: {
      state: "success",
      lastSyncAt: Date.now(),
      lastSuccessAt: Date.now(),
    },
    daily: {},
    hourly: {},
    dailyByModel: {},
    tokenNamesById: {},
    dailyByToken: {},
    hourlyByToken: {},
    dailyByTokenByModel: {},
    latencyDaily: {},
    latencyDailyByModel: {},
    latencyDailyByToken: {},
    latencyDailyByTokenByModel: {},
    ...overrides,
  }
}

/**
 * Build a complete per-account usage-history store while keeping scenarios terse.
 */
export function createUsageHistoryAccountStore(
  overrides: Partial<UsageHistoryAccountStore> = {},
): UsageHistoryAccountStore {
  return createEmptyUsageHistoryAccountStore(overrides)
}

/**
 * Persist usage analytics aggregates for Usage Analytics E2E scenarios.
 */
export async function seedUsageHistoryStore(
  serviceWorker: Worker,
  accounts: Record<string, UsageHistoryAccountStore>,
) {
  await setPlasmoStorageValue(serviceWorker, USAGE_HISTORY_STORAGE_KEYS.STORE, {
    schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
    accounts,
  } satisfies UsageHistoryStore)
}

/**
 * Persist cached provider-site announcements for Site Announcements E2E scenarios.
 */
export async function seedSiteAnnouncementsStore(
  serviceWorker: Worker,
  sites: SiteAnnouncementStoreState["sites"],
) {
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE,
    {
      schemaVersion: SITE_ANNOUNCEMENTS_STORE_SCHEMA_VERSION,
      sites,
    } satisfies SiteAnnouncementStoreState,
  )
}

/**
 * Build a merged user-preferences snapshot while preserving repo defaults for
 * fields unrelated to the current scenario.
 */
function createStoredUserPreferences(overrides: Record<string, unknown> = {}) {
  return {
    lastUpdated: Date.now(),
    ...overrides,
  }
}

/**
 * Persist user preferences through the service worker for duplicate-warning and
 * other preference-gated runtime flows.
 */
export async function seedUserPreferences(
  serviceWorker: Worker,
  overrides: Record<string, unknown> = {},
) {
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.USER_PREFERENCES,
    createStoredUserPreferences(overrides),
  )
}

/**
 * Build a normalized API credential profile record for popup verification flows.
 */
export function createStoredApiCredentialProfile(
  overrides: StoredApiCredentialProfileOverrides = {},
): ApiCredentialProfile {
  const now = Date.now()

  return {
    id: "api-profile-1",
    name: "E2E Profile",
    apiType: API_TYPES.OPENAI_COMPATIBLE,
    baseUrl: "https://api.example.com",
    apiKey: "sk-e2e-profile",
    tagIds: [],
    notes: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/**
 * Persist profile storage directly so popup tests can start from an existing
 * profile without exercising the creation flow first.
 */
export async function seedApiCredentialProfiles(
  serviceWorker: Worker,
  profiles: ApiCredentialProfile[],
) {
  await setPlasmoStorageValue(
    serviceWorker,
    STORAGE_KEYS.API_CREDENTIAL_PROFILES,
    {
      version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
      profiles,
      lastUpdated: Date.now(),
    },
  )
}

/**
 * Match an already-open extension page against the expected path, hash, and
 * optional query parameters used by popup quick-action navigations.
 */
function isMatchingExtensionPage(
  page: Page,
  params: WaitForExtensionPageParams,
): boolean {
  if (page.isClosed()) {
    return false
  }

  try {
    const url = new URL(page.url())
    if (url.protocol !== "chrome-extension:") {
      return false
    }

    if (url.host !== params.extensionId) {
      return false
    }

    if (url.pathname !== `/${params.path}`) {
      return false
    }

    if (params.hash && url.hash !== params.hash) {
      return false
    }

    for (const [key, value] of Object.entries(params.searchParams ?? {})) {
      if (url.searchParams.get(key) !== value) {
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

/**
 * Register this wait before clicking popup navigation controls. Popup-triggered
 * routes often close the source page immediately after creating the target tab.
 */
export async function waitForExtensionPage(
  context: BrowserContext,
  params: WaitForExtensionPageParams,
) {
  if (params.reuseExistingPage !== false) {
    const existingPage = context
      .pages()
      .find((page) => isMatchingExtensionPage(page, params))

    if (existingPage) {
      await existingPage.waitForLoadState("domcontentloaded")
      return existingPage
    }
  }

  const page = await context.waitForEvent("page", {
    timeout: params.timeoutMs ?? 15_000,
    predicate: (candidate) => isMatchingExtensionPage(candidate, params),
  })

  await page.waitForLoadState("domcontentloaded")
  return page
}

/**
 * Create a stable token payload that matches the subset of fields rendered by
 * Key Management after a successful create-token round trip.
 */
function buildStubToken(input: {
  id: number
  userId: number
  name: string
  key: string
  group: string
  remainQuota: number
  unlimitedQuota: boolean
  expiredTime: number
  modelLimitsEnabled: boolean
  modelLimits: string
  allowIps: string
}): ApiToken {
  const nowSeconds = Math.floor(Date.now() / 1000)

  return {
    id: input.id,
    user_id: input.userId,
    key: input.key,
    status: 1,
    name: input.name,
    created_time: nowSeconds,
    accessed_time: nowSeconds,
    expired_time: input.expiredTime,
    remain_quota: input.remainQuota,
    unlimited_quota: input.unlimitedQuota,
    model_limits_enabled: input.modelLimitsEnabled,
    model_limits: input.modelLimits,
    allow_ips: input.allowIps,
    used_quota: 0,
    group: input.group,
  }
}

/**
 * Create deterministic pricing rows for the model-management page from the
 * same model-id list used by key-management mocks.
 */
function buildStubPricingModels(models: string[]): ModelPricing[] {
  return models.map((modelName, index) => ({
    model_name: modelName,
    model_description: `E2E model catalog entry for ${modelName}`,
    quota_type: 0,
    model_ratio: index + 1,
    model_price: 0,
    owner_by: "e2e",
    completion_ratio: 1,
    enable_groups: index % 2 === 0 ? ["default", "vip"] : ["default"],
    supported_endpoint_types: ["chat_completions"],
  }))
}

/**
 * Stub the small New-API-compatible surface used by onboarding and key
 * management without replacing the extension's own orchestration logic.
 */
export async function stubNewApiSiteRoutes(
  context: BrowserContext,
  options: StubNewApiSiteRoutesOptions = {},
) {
  const baseUrl = options.baseUrl ?? "https://example.com"
  const origin = new URL(baseUrl).origin
  const userId = options.userId ?? 1
  const username = options.username ?? "e2e-user"
  const accessToken = options.accessToken ?? "e2e-token"
  const exchangeRate = options.exchangeRate ?? 7
  const todayQuotaConsumption = options.todayQuotaConsumption ?? 0
  const redemptionCreditQuota = options.redemptionCreditQuota ?? 100_000
  const title = options.title ?? SITE_TYPES.NEW_API
  const systemName = options.systemName ?? "E2E New API"
  const models = options.models ?? ["gpt-4o-mini", "gpt-4.1-mini"]
  const pricingModels = options.pricingModels ?? buildStubPricingModels(models)
  const groups = options.groups ?? {
    default: { desc: "Default", ratio: 1 },
    vip: { desc: "VIP", ratio: 1.5 },
  }

  let nextTokenId =
    Math.max(0, ...(options.initialTokens ?? []).map((token) => token.id)) + 1
  const tokens = [...(options.initialTokens ?? [])]
  let accountQuota = options.initialQuota ?? 1000

  await context.route(`${origin}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (method === "GET" && url.pathname === "/") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><head><title>${title}</title></head><body>${systemName}</body></html>`,
      })
      return
    }

    if (method === "GET" && url.pathname === "/favicon.ico") {
      await route.fulfill({
        status: 204,
        body: "",
      })
      return
    }

    if (
      method === "GET" &&
      (url.pathname === "/api/user/info" || url.pathname === "/api/v1/auth/me")
    ) {
      await route.fulfill({
        status: 204,
        body: "",
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/user/self") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: {
            id: userId,
            username,
            access_token: accessToken,
            quota: accountQuota,
          },
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: {
            system_name: systemName,
            price: exchangeRate,
            checkin_enabled: false,
          },
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/log/self") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: {
            page: Number(url.searchParams.get("p") ?? "1"),
            page_size: Number(url.searchParams.get("page_size") ?? "100"),
            total: 0,
            items: [],
          },
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/log/self/stat") {
      // Keep the E2E backend mock aligned with the production fast path.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: {
            quota: todayQuotaConsumption,
            rpm: 0,
            tpm: 0,
          },
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/token/") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: tokens,
        }),
      })
      return
    }

    if (method === "POST" && url.pathname === "/api/token/") {
      const payload = request.postDataJSON() as {
        name?: string
        remain_quota?: number
        unlimited_quota?: boolean
        expired_time?: number
        model_limits_enabled?: boolean
        model_limits?: string
        allow_ips?: string
        group?: string
      }

      tokens.push(
        buildStubToken({
          id: nextTokenId,
          userId: Number(userId),
          name: payload.name?.trim() || `e2e-token-${nextTokenId}`,
          key: `sk-created-${nextTokenId}`,
          group: payload.group?.trim() || "default",
          remainQuota: payload.remain_quota ?? -1,
          unlimitedQuota: payload.unlimited_quota !== false,
          expiredTime: payload.expired_time ?? -1,
          modelLimitsEnabled: payload.model_limits_enabled === true,
          modelLimits: payload.model_limits ?? "",
          allowIps: payload.allow_ips ?? "",
        }),
      )
      nextTokenId += 1

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "created",
        }),
      })
      return
    }

    if (method === "POST" && url.pathname === "/api/user/topup") {
      const payload = request.postDataJSON() as {
        key?: string
      }
      await options.onRedeemCode?.(payload.key ?? "")
      accountQuota += redemptionCreditQuota

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "redeemed",
          data: redemptionCreditQuota,
        }),
      })
      return
    }

    if (method === "PUT" && url.pathname === "/api/token/") {
      const payload = request.postDataJSON() as {
        id?: number
        name?: string
        remain_quota?: number
        unlimited_quota?: boolean
        expired_time?: number
        model_limits_enabled?: boolean
        model_limits?: string
        allow_ips?: string
        group?: string
      }

      const tokenIndex = tokens.findIndex((token) => token.id === payload.id)
      if (tokenIndex === -1) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: `Token ${payload.id ?? "unknown"} not found`,
          }),
        })
        return
      }

      const current = tokens[tokenIndex]
      tokens[tokenIndex] = {
        ...current,
        name: payload.name?.trim() || current.name,
        remain_quota: payload.remain_quota ?? current.remain_quota,
        unlimited_quota: payload.unlimited_quota ?? current.unlimited_quota,
        expired_time: payload.expired_time ?? current.expired_time,
        model_limits_enabled:
          payload.model_limits_enabled ?? current.model_limits_enabled,
        model_limits: payload.model_limits ?? current.model_limits,
        allow_ips: payload.allow_ips ?? current.allow_ips,
        group: payload.group?.trim() || current.group,
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "updated",
        }),
      })
      return
    }

    if (method === "DELETE" && /^\/api\/token\/\d+$/.test(url.pathname)) {
      const tokenId = Number(url.pathname.split("/").pop())
      const tokenIndex = tokens.findIndex((token) => token.id === tokenId)

      if (tokenIndex === -1) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: `Token ${tokenId} not found`,
          }),
        })
        return
      }

      tokens.splice(tokenIndex, 1)

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "deleted",
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/user/models") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: models,
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/v1/models") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: models.map((id) => ({ id })),
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/pricing") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: pricingModels,
          group_ratio: Object.fromEntries(
            Object.entries(groups).map(([group, info]) => [group, info.ratio]),
          ),
          usable_group: Object.fromEntries(
            Object.entries(groups).map(([group, info]) => [group, info.desc]),
          ),
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/user/self/groups") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: groups,
        }),
      })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: `Unhandled E2E route: ${method} ${url.pathname}`,
      }),
    })
  })
}
