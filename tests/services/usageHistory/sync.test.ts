import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { accountStorage } from "~/services/accounts/accountStorage"
import { USAGE_HISTORY_LIMITS } from "~/services/history/usageHistory/constants"
import { getDayKeyFromUnixSeconds } from "~/services/history/usageHistory/core"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { syncUsageHistoryForAccount } from "~/services/history/usageHistory/sync"
import { LogType } from "~/services/usageLogs/model"
import type { LogItem } from "~/services/usageLogs/model"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import {
  USAGE_HISTORY_SCHEDULE_MODE,
  type UsageHistoryPreferences,
} from "~/types/usageHistory"
import { server } from "~~/tests/msw/server"

/**
 * Create a fully populated Consume log item for usage-history sync tests.
 */
function createConsumeLogItem(
  overrides: Partial<LogItem> & { created_at: number },
): LogItem {
  const { created_at, ...rest } = overrides
  return {
    id: rest.id ?? 1,
    user_id: rest.user_id ?? 1,
    created_at,
    type: rest.type ?? LogType.Consume,
    content: rest.content ?? "",
    username: rest.username ?? "test",
    token_name: rest.token_name ?? "",
    model_name: rest.model_name ?? "gpt-4",
    quota: rest.quota ?? 1,
    prompt_tokens: rest.prompt_tokens ?? 1,
    completion_tokens: rest.completion_tokens ?? 1,
    use_time: rest.use_time ?? 0,
    is_stream: rest.is_stream ?? false,
    channel_id: rest.channel_id ?? 1,
    channel_name: rest.channel_name ?? "",
    token_id: rest.token_id ?? 1,
    group: rest.group ?? "",
    ip: rest.ip ?? "",
    other: rest.other ?? "{}",
    ...rest,
  }
}

/**
 * Create and persist a minimal New-API test account, returning its generated id.
 */
async function createTestAccount(baseUrl: string): Promise<string> {
  const accountData: Omit<
    SiteAccount,
    "id" | "created_at" | "updated_at" | "user_updated_at"
  > = {
    site_name: "Example",
    site_url: baseUrl,
    health: { status: SiteHealthStatus.Healthy },
    site_type: "new-api",
    exchange_rate: 7.2,
    account_info: {
      id: "1",
      access_token: "mock-token",
      username: "tester",
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    last_sync_time: Date.now(),
    notes: "",
    tagIds: [],
    disabled: false,
    excludeFromTotalBalance: false,
    excludeFromTodayIncome: false,
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
  }

  return await accountStorage.addAccount(accountData)
}

describe("usageHistory sync (MSW)", () => {
  it("skips disabled sync and mismatched scheduled triggers before loading accounts", async () => {
    const disabledConfig: UsageHistoryPreferences = {
      enabled: false,
      retentionDays: 30,
      scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.MANUAL,
      syncIntervalMinutes: 60,
    }

    await expect(
      syncUsageHistoryForAccount({
        accountId: "missing-disabled",
        trigger: "manual",
        config: disabledConfig,
      }),
    ).resolves.toMatchObject({
      accountId: "missing-disabled",
      status: "skipped",
      partial: false,
    })

    const afterRefreshConfig: UsageHistoryPreferences = {
      enabled: true,
      retentionDays: 30,
      scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.MANUAL,
      syncIntervalMinutes: 60,
    }

    await expect(
      syncUsageHistoryForAccount({
        accountId: "missing-after-refresh",
        trigger: "afterRefresh",
        config: afterRefreshConfig,
      }),
    ).resolves.toMatchObject({
      accountId: "missing-after-refresh",
      status: "skipped",
      partial: false,
    })

    const alarmConfig: UsageHistoryPreferences = {
      enabled: true,
      retentionDays: 30,
      scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH,
      syncIntervalMinutes: 60,
    }

    await expect(
      syncUsageHistoryForAccount({
        accountId: "missing-alarm",
        trigger: "alarm",
        config: alarmConfig,
      }),
    ).resolves.toMatchObject({
      accountId: "missing-alarm",
      status: "skipped",
      partial: false,
    })
  })

  it("returns an error when the requested account no longer exists", async () => {
    const config: UsageHistoryPreferences = {
      enabled: true,
      retentionDays: 30,
      scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.MANUAL,
      syncIntervalMinutes: 60,
    }

    const result = await syncUsageHistoryForAccount({
      accountId: "missing-account",
      trigger: "manual",
      config,
    })

    expect(result.status).toBe("error")
    expect(result.error).toBe("messages:storage.accountNotFound")
  })

  it("syncs /api/log/self with paging and is idempotent at the cursor boundary", async () => {
    const baseUrl = "https://api.example.com"
    const accountId = await createTestAccount(baseUrl)

    const nowUnixSeconds = Math.floor(Date.now() / 1000)
    const newestCreatedAt = nowUnixSeconds - 10

    const dataset: LogItem[] = Array.from({ length: 101 }).map((_, index) => {
      // Newest-first ordering (page 1 is newest).
      const createdAt = newestCreatedAt - index
      return createConsumeLogItem({
        id: index + 1,
        created_at: createdAt,
        model_name: index % 2 === 0 ? "gpt-4" : "gpt-3.5-turbo",
        quota: 1,
        prompt_tokens: 1,
        completion_tokens: 1,
      })
    })

    server.use(
      http.get(`${baseUrl}/api/log/self`, ({ request }) => {
        const url = new URL(request.url)
        const page = Number(url.searchParams.get("p") ?? "1")
        const pageSize = Number(url.searchParams.get("page_size") ?? "100")
        const startTimestamp = Number(
          url.searchParams.get("start_timestamp") ?? "0",
        )
        const endTimestamp = Number(
          url.searchParams.get("end_timestamp") ?? String(nowUnixSeconds),
        )

        const filtered = dataset
          .filter(
            (item) =>
              item.created_at >= startTimestamp &&
              item.created_at <= endTimestamp,
          )
          .sort((a, b) => b.created_at - a.created_at)

        const total = filtered.length
        const startIndex = (page - 1) * pageSize
        const items = filtered.slice(startIndex, startIndex + pageSize)

        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            items,
            total,
          },
        })
      }),
    )

    const config: UsageHistoryPreferences = {
      enabled: true,
      retentionDays: 30,
      scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.MANUAL,
      syncIntervalMinutes: 60,
    }

    const first = await syncUsageHistoryForAccount({
      accountId,
      trigger: "manual",
      force: true,
      timeZone: "UTC",
      config,
    })

    expect(first.status).toBe("success")
    expect(first.pagesFetched).toBeGreaterThanOrEqual(1)

    const storeAfterFirst = await usageHistoryStorage.getStore()
    const accountStoreAfterFirst = storeAfterFirst.accounts[accountId]
    expect(accountStoreAfterFirst).toBeDefined()
    expect(accountStoreAfterFirst.cursor.lastSeenCreatedAt).toBe(
      newestCreatedAt,
    )

    const dayKey = getDayKeyFromUnixSeconds(newestCreatedAt, "UTC")
    expect(accountStoreAfterFirst.daily[dayKey]).toBeDefined()
    expect(accountStoreAfterFirst.dailyByToken["1"][dayKey]).toBeDefined()
    expect(accountStoreAfterFirst.latencyDaily[dayKey]).toBeDefined()
    expect(
      accountStoreAfterFirst.latencyDailyByToken["1"][dayKey],
    ).toBeDefined()
    expect(accountStoreAfterFirst.latencyDaily[dayKey].count).toBe(
      accountStoreAfterFirst.daily[dayKey].requests,
    )

    const snapshotDaily = JSON.stringify(accountStoreAfterFirst.daily)
    const snapshotDailyByToken = JSON.stringify(
      accountStoreAfterFirst.dailyByToken,
    )
    const snapshotLatencyDaily = JSON.stringify(
      accountStoreAfterFirst.latencyDaily,
    )

    // Second run: should not double-count boundary items.
    const second = await syncUsageHistoryForAccount({
      accountId,
      trigger: "manual",
      force: true,
      timeZone: "UTC",
      config,
    })

    expect(second.status).toBe("success")
    const storeAfterSecond = await usageHistoryStorage.getStore()
    expect(JSON.stringify(storeAfterSecond.accounts[accountId].daily)).toBe(
      snapshotDaily,
    )
    expect(
      JSON.stringify(storeAfterSecond.accounts[accountId].dailyByToken),
    ).toBe(snapshotDailyByToken)
    expect(
      JSON.stringify(storeAfterSecond.accounts[accountId].latencyDaily),
    ).toBe(snapshotLatencyDaily)
  })

  it("ingests a new item at the same cursor timestamp (fingerprint boundary)", async () => {
    const baseUrl = "https://api.example.com"
    const accountId = await createTestAccount(baseUrl)

    const nowUnixSeconds = Math.floor(Date.now() / 1000)
    const cursorCreatedAt = nowUnixSeconds - 10

    let dataset: LogItem[] = [
      createConsumeLogItem({
        id: 1,
        created_at: cursorCreatedAt,
        model_name: "gpt-4",
        quota: 1,
        prompt_tokens: 1,
        completion_tokens: 1,
      }),
    ]

    server.use(
      http.get(`${baseUrl}/api/log/self`, ({ request }) => {
        const url = new URL(request.url)
        const startTimestamp = Number(
          url.searchParams.get("start_timestamp") ?? "0",
        )
        const endTimestamp = Number(
          url.searchParams.get("end_timestamp") ?? String(nowUnixSeconds),
        )
        const page = Number(url.searchParams.get("p") ?? "1")
        const pageSize = Number(url.searchParams.get("page_size") ?? "100")

        const filtered = dataset
          .filter(
            (item) =>
              item.created_at >= startTimestamp &&
              item.created_at <= endTimestamp,
          )
          .sort((a, b) => b.created_at - a.created_at)

        const total = filtered.length
        const startIndex = (page - 1) * pageSize
        const items = filtered.slice(startIndex, startIndex + pageSize)

        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            items,
            total,
          },
        })
      }),
    )

    const config: UsageHistoryPreferences = {
      enabled: true,
      retentionDays: 30,
      scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.MANUAL,
      syncIntervalMinutes: 60,
    }

    await syncUsageHistoryForAccount({
      accountId,
      trigger: "manual",
      force: true,
      timeZone: "UTC",
      config,
    })

    // Add a new log at the same second as the cursor, but with a different fingerprint.
    dataset = [
      ...dataset,
      createConsumeLogItem({
        id: 2,
        created_at: cursorCreatedAt,
        model_name: "gpt-4",
        quota: 2,
        prompt_tokens: 2,
        completion_tokens: 2,
      }),
    ]

    const before = await usageHistoryStorage.getStore()
    const dayKey = getDayKeyFromUnixSeconds(cursorCreatedAt, "UTC")
    const beforeRequests =
      before.accounts[accountId].daily[dayKey]?.requests ?? 0

    await syncUsageHistoryForAccount({
      accountId,
      trigger: "manual",
      force: true,
      timeZone: "UTC",
      config,
    })

    const after = await usageHistoryStorage.getStore()
    const afterRequests = after.accounts[accountId].daily[dayKey]?.requests ?? 0
    expect(afterRequests).toBe(beforeRequests + 1)
    expect(after.accounts[accountId].latencyDaily[dayKey]?.count ?? 0).toBe(
      afterRequests,
    )
  })

  it("marks unsupported endpoints and then respects the cooldown window", async () => {
    const baseUrl = "https://api-unsupported.example.com"
    const accountId = await createTestAccount(baseUrl)

    server.use(
      http.get(`${baseUrl}/api/log/self`, () =>
        HttpResponse.json(
          { success: false, message: "not found" },
          { status: 404 },
        ),
      ),
    )

    const config: UsageHistoryPreferences = {
      enabled: true,
      retentionDays: 30,
      scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.MANUAL,
      syncIntervalMinutes: 60,
    }

    const first = await syncUsageHistoryForAccount({
      accountId,
      trigger: "manual",
      force: true,
      config,
    })

    expect(first.status).toBe("unsupported")
    expect(first.error).toBeTruthy()

    const storeAfterFailure =
      await usageHistoryStorage.getAccountStore(accountId)
    expect(storeAfterFailure.status.state).toBe("unsupported")
    expect(storeAfterFailure.status.unsupportedUntil).toBeGreaterThan(
      Date.now(),
    )

    const skipped = await syncUsageHistoryForAccount({
      accountId,
      trigger: "manual",
      config,
    })

    expect(skipped).toMatchObject({
      accountId,
      status: "skipped",
      partial: false,
    })
  })

  it("records generic fetch failures without marking the endpoint unsupported", async () => {
    const baseUrl = "https://api-error.example.com"
    const accountId = await createTestAccount(baseUrl)

    server.use(
      http.get(`${baseUrl}/api/log/self`, () =>
        HttpResponse.json(
          { success: false, message: "forbidden" },
          { status: 401 },
        ),
      ),
    )

    const config: UsageHistoryPreferences = {
      enabled: true,
      retentionDays: 30,
      scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.MANUAL,
      syncIntervalMinutes: 60,
    }

    const result = await syncUsageHistoryForAccount({
      accountId,
      trigger: "manual",
      force: true,
      config,
    })

    expect(result.status).toBe("error")
    expect(result.error).toBeTruthy()

    const store = await usageHistoryStorage.getAccountStore(accountId)
    expect(store.status.state).toBe("error")
    expect(store.status.unsupportedUntil).toBeUndefined()
  })

  it("marks the run as partial when the item safety cap truncates a page", async () => {
    const baseUrl = "https://api-item-cap.example.com"
    const accountId = await createTestAccount(baseUrl)
    const nowUnixSeconds = Math.floor(Date.now() / 1000)
    const originalMaxItems = USAGE_HISTORY_LIMITS.maxItems

    server.use(
      http.get(`${baseUrl}/api/log/self`, () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            items: [
              createConsumeLogItem({ id: 1, created_at: nowUnixSeconds - 2 }),
              createConsumeLogItem({ id: 2, created_at: nowUnixSeconds - 1 }),
            ],
          },
        }),
      ),
    )

    try {
      ;(USAGE_HISTORY_LIMITS as { maxItems: number }).maxItems = 1

      const result = await syncUsageHistoryForAccount({
        accountId,
        trigger: "manual",
        force: true,
        config: {
          enabled: true,
          retentionDays: 30,
          scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.MANUAL,
          syncIntervalMinutes: 60,
        },
      })

      expect(result).toMatchObject({
        accountId,
        status: "success",
        partial: true,
        pagesFetched: 1,
        itemsFetched: 1,
        ingestedCount: 1,
      })

      const store = await usageHistoryStorage.getAccountStore(accountId)
      expect(store.status.state).toBe("success")
      expect(store.status.lastWarning).toContain("Reached safety limits")
    } finally {
      ;(USAGE_HISTORY_LIMITS as { maxItems: number }).maxItems =
        originalMaxItems
    }
  })

  it("marks the run as partial when the page safety cap stops additional fetches", async () => {
    const baseUrl = "https://api-page-cap.example.com"
    const accountId = await createTestAccount(baseUrl)
    const nowUnixSeconds = Math.floor(Date.now() / 1000)
    const originalMaxPages = USAGE_HISTORY_LIMITS.maxPages

    const dataset: LogItem[] = Array.from({ length: 101 }).map((_, index) =>
      createConsumeLogItem({
        id: index + 1,
        created_at: nowUnixSeconds - index - 1,
      }),
    )

    server.use(
      http.get(`${baseUrl}/api/log/self`, ({ request }) => {
        const url = new URL(request.url)
        const page = Number(url.searchParams.get("p") ?? "1")
        const pageSize = Number(url.searchParams.get("page_size") ?? "100")
        const startIndex = (page - 1) * pageSize
        const items = dataset.slice(startIndex, startIndex + pageSize)

        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            items,
            total: dataset.length,
          },
        })
      }),
    )

    try {
      ;(USAGE_HISTORY_LIMITS as { maxPages: number }).maxPages = 1

      const result = await syncUsageHistoryForAccount({
        accountId,
        trigger: "manual",
        force: true,
        config: {
          enabled: true,
          retentionDays: 30,
          scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.MANUAL,
          syncIntervalMinutes: 60,
        },
      })

      expect(result).toMatchObject({
        accountId,
        status: "success",
        partial: true,
        pagesFetched: 1,
      })

      const store = await usageHistoryStorage.getAccountStore(accountId)
      expect(store.status.lastWarning).toContain("Reached safety limits")
    } finally {
      ;(USAGE_HISTORY_LIMITS as { maxPages: number }).maxPages =
        originalMaxPages
    }
  })
})
