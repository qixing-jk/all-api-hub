import { t } from "i18next"

import { accountStorage } from "~/services/accounts/accountStorage"
import { REQUEST_CONFIG } from "~/services/apiService/common/constant"
import { ApiError } from "~/services/apiService/common/errors"
import {
  LogType,
  type ApiServiceRequest,
  type LogItem,
  type LogResponseData,
} from "~/services/apiService/common/type"
import { fetchApiData } from "~/services/apiService/common/utils"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { SiteAccount } from "~/types"
import {
  DEFAULT_USAGE_HISTORY_PREFERENCES,
  USAGE_HISTORY_SCHEDULE_MODE,
  type UsageHistoryPreferences,
} from "~/types/usageHistory"
import { getErrorMessage } from "~/utils/error"

import {
  USAGE_HISTORY_LIMITS,
  USAGE_HISTORY_UNSUPPORTED_COOLDOWN_MS,
} from "./constants"
import {
  computeRetentionCutoffDayKey,
  ingestConsumeLogItems,
  pruneUsageHistoryAccountStore,
} from "./core"
import { usageHistoryStorage } from "./storage"

export type UsageHistorySyncTrigger = "manual" | "afterRefresh" | "alarm"

export interface UsageHistoryAccountSyncSummary {
  accountId: string
  status: "success" | "skipped" | "error" | "unsupported"
  ingestedCount: number
  pagesFetched: number
  itemsFetched: number
  partial: boolean
  error?: string
}

/**
 * Resolve usage-history preferences from the full user preferences snapshot.
 */
function getUsageHistoryPreferences(
  preferences: Awaited<ReturnType<typeof userPreferences.getPreferences>>,
): UsageHistoryPreferences {
  return preferences.usageHistory ?? DEFAULT_USAGE_HISTORY_PREFERENCES
}

/**
 * Build an ApiServiceRequest DTO from a stored account record.
 */
function buildApiRequestForAccount(account: SiteAccount): ApiServiceRequest {
  return {
    baseUrl: account.site_url,
    accountId: account.id,
    auth: {
      authType: account.authType,
      userId: account.account_info.id,
      accessToken: account.account_info.access_token,
      cookie: account.cookieAuth?.sessionCookie,
    },
  }
}

/**
 * Detect errors that likely indicate the `/api/log/self` endpoint is unsupported.
 */
function isUnsupportedLogEndpointError(error: unknown): boolean {
  if (error instanceof ApiError) {
    const statusCode = error.statusCode
    return statusCode === 404 || statusCode === 405 || statusCode === 500
  }

  return false
}

/**
 * Fetch a single page of Consume logs from `/api/log/self`.
 */
async function fetchConsumeLogPage(params: {
  request: ApiServiceRequest
  page: number
  startTimestamp: number
  endTimestamp: number
}): Promise<LogResponseData> {
  const { request, page, startTimestamp, endTimestamp } = params

  const searchParams = new URLSearchParams({
    p: String(page),
    page_size: String(REQUEST_CONFIG.DEFAULT_PAGE_SIZE),
    type: String(LogType.Consume),
    token_name: "",
    model_name: "",
    start_timestamp: String(startTimestamp),
    end_timestamp: String(endTimestamp),
    group: "",
  })

  return await fetchApiData<LogResponseData>(request, {
    endpoint: `/api/log/self?${searchParams.toString()}`,
  })
}

/**
 * Resolve total pages from a response using the same paging constants used in requests.
 */
function resolveTotalPages(logData: LogResponseData): number {
  const total = typeof logData.total === "number" ? logData.total : 0
  if (total <= 0) {
    const itemsCount = Array.isArray(logData.items) ? logData.items.length : 0
    return itemsCount > 0 ? 1 : 0
  }
  return Math.ceil(total / REQUEST_CONFIG.DEFAULT_PAGE_SIZE)
}

/**
 * Sync usage-history for a single account using cursor-based incremental ingestion.
 *
 * The cursor is based on `created_at` and a privacy-safe fingerprint (New-API masks ids),
 * and aggregates are stored as bounded daily buckets.
 */
export async function syncUsageHistoryForAccount(params: {
  accountId: string
  trigger: UsageHistorySyncTrigger
  /**
   * Force a sync run, bypassing schedule mode and due checks.
   *
   * Manual sync uses this to run immediately.
   */
  force?: boolean
  /**
   * Optional timezone override used only for deterministic tests.
   */
  timeZone?: string
  /**
   * Optional preferences override to avoid repeated storage reads when syncing
   * many accounts in a batch (scheduler/alarm triggers).
   */
  config?: UsageHistoryPreferences
}): Promise<UsageHistoryAccountSyncSummary> {
  const { accountId, trigger, force = false, timeZone } = params
  const nowMs = Date.now()
  const nowUnixSeconds = Math.floor(nowMs / 1000)

  // Get preferences, either from params or storage.
  const config =
    params.config ??
    getUsageHistoryPreferences(await userPreferences.getPreferences())

  // Check if sync should be skipped based on preferences and trigger.
  if (!config.enabled && !force) {
    return {
      accountId,
      status: "skipped",
      ingestedCount: 0,
      pagesFetched: 0,
      itemsFetched: 0,
      partial: false,
    }
  }

  // Schedule mode checks.
  if (!force) {
    if (
      trigger === "afterRefresh" &&
      config.scheduleMode !== USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH
    ) {
      return {
        accountId,
        status: "skipped",
        ingestedCount: 0,
        pagesFetched: 0,
        itemsFetched: 0,
        partial: false,
      }
    }

    if (
      trigger === "alarm" &&
      config.scheduleMode !== USAGE_HISTORY_SCHEDULE_MODE.ALARM
    ) {
      return {
        accountId,
        status: "skipped",
        ingestedCount: 0,
        pagesFetched: 0,
        itemsFetched: 0,
        partial: false,
      }
    }
  }

  // Load account info.
  const account = await accountStorage.getAccountById(accountId)
  if (!account) {
    return {
      accountId,
      status: "error",
      ingestedCount: 0,
      pagesFetched: 0,
      itemsFetched: 0,
      partial: false,
      error: t("messages:storage.accountNotFound", { id: accountId }),
    }
  }

  const apiRequest = buildApiRequestForAccount(account)
  // Defensive: preferences may be corrupted or come from untyped sources; avoid NaN propagation.
  const retentionDaysRaw = Number(config.retentionDays)
  const retentionDays = Number.isFinite(retentionDaysRaw)
    ? Math.max(1, Math.trunc(retentionDaysRaw))
    : 1
  const retentionStartTimestamp = Math.max(
    0,
    nowUnixSeconds - retentionDays * 24 * 60 * 60,
  )

  const accountStore = await usageHistoryStorage.getAccountStore(accountId)

  // Due check: unsupported cooldown.
  if (
    !force &&
    typeof accountStore.status.unsupportedUntil === "number" &&
    accountStore.status.unsupportedUntil > nowMs
  ) {
    return {
      accountId,
      status: "skipped",
      ingestedCount: 0,
      pagesFetched: 0,
      itemsFetched: 0,
      partial: false,
    }
  }

  // Due check: sync interval.
  const syncIntervalMinutesRaw = Number(config.syncIntervalMinutes)
  const intervalMs =
    (Number.isFinite(syncIntervalMinutesRaw)
      ? Math.max(1, Math.trunc(syncIntervalMinutesRaw))
      : 1) *
    60 *
    1000
  if (
    !force &&
    typeof accountStore.status.lastSyncAt === "number" &&
    nowMs - accountStore.status.lastSyncAt < intervalMs
  ) {
    return {
      accountId,
      status: "skipped",
      ingestedCount: 0,
      pagesFetched: 0,
      itemsFetched: 0,
      partial: false,
    }
  }

  // Determine fetch range based on cursor and retention.
  const startTimestamp = Math.max(
    accountStore.cursor.lastSeenCreatedAt,
    retentionStartTimestamp,
  )
  const endTimestamp = nowUnixSeconds
  const cutoffDayKey = computeRetentionCutoffDayKey(
    retentionDays,
    nowUnixSeconds,
    timeZone,
  )

  // Fetch and ingest pages until limits are reached.
  let pagesFetched = 0
  let itemsFetched = 0
  let ingestedCount = 0
  let partial = false

  try {
    const firstPage = await fetchConsumeLogPage({
      request: apiRequest,
      page: 1,
      startTimestamp,
      endTimestamp,
    })

    const totalPages = resolveTotalPages(firstPage)
    const startCursor = {
      ...accountStore.cursor,
      fingerprintsAtLastSeenCreatedAt: [
        ...accountStore.cursor.fingerprintsAtLastSeenCreatedAt,
      ],
    }
    let cursorCandidate = {
      ...startCursor,
      fingerprintsAtLastSeenCreatedAt: [
        ...startCursor.fingerprintsAtLastSeenCreatedAt,
      ],
    }

    const processPageItems = (items: LogItem[]) => {
      if (itemsFetched >= USAGE_HISTORY_LIMITS.maxItems) {
        partial = true
        return
      }

      const remaining = USAGE_HISTORY_LIMITS.maxItems - itemsFetched
      const sliced =
        remaining < items.length ? items.slice(0, remaining) : items
      itemsFetched += sliced.length

      const ingestResult = ingestConsumeLogItems({
        accountStore,
        items: sliced,
        startCursor,
        cursorCandidate,
        timeZone,
      })

      cursorCandidate = ingestResult.cursorCandidate
      ingestedCount += ingestResult.ingestedCount

      if (sliced.length < items.length) {
        partial = true
      }
    }

    // Iterate from older pages to newer pages so that cursor advancement is safe under caps.
    for (let page = totalPages; page >= 1; page -= 1) {
      if (pagesFetched >= USAGE_HISTORY_LIMITS.maxPages) {
        partial = true
        break
      }

      const logData =
        page === 1
          ? firstPage
          : await fetchConsumeLogPage({
              request: apiRequest,
              page,
              startTimestamp,
              endTimestamp,
            })

      pagesFetched += 1
      const items = Array.isArray(logData.items) ? logData.items : []
      processPageItems(items)

      if (partial) {
        break
      }
    }

    accountStore.cursor = cursorCandidate
    pruneUsageHistoryAccountStore(accountStore, cutoffDayKey)

    accountStore.status = {
      ...accountStore.status,
      state: "success",
      lastSyncAt: nowMs,
      lastSuccessAt: nowMs,
      lastWarning: partial
        ? `Reached safety limits (maxPages=${USAGE_HISTORY_LIMITS.maxPages}, maxItems=${USAGE_HISTORY_LIMITS.maxItems}); history may be incomplete for this run.`
        : undefined,
      lastError: undefined,
      unsupportedUntil: undefined,
    }

    await usageHistoryStorage.updateAccountStore(accountId, () => accountStore)

    return {
      accountId,
      status: "success",
      ingestedCount,
      pagesFetched,
      itemsFetched,
      partial,
    }
  } catch (error) {
    const isUnsupported = isUnsupportedLogEndpointError(error)
    const message = getErrorMessage(error)

    await usageHistoryStorage.updateAccountStore(accountId, (store) => {
      const next = store
      next.status = {
        ...next.status,
        state: isUnsupported ? "unsupported" : "error",
        lastSyncAt: nowMs,
        lastWarning: undefined,
        lastError: message,
        unsupportedUntil: isUnsupported
          ? nowMs + USAGE_HISTORY_UNSUPPORTED_COOLDOWN_MS
          : next.status.unsupportedUntil,
      }

      return next
    })

    return {
      accountId,
      status: isUnsupported ? "unsupported" : "error",
      ingestedCount: 0,
      pagesFetched: 0,
      itemsFetched: 0,
      partial: false,
      error: message,
    }
  }
}
