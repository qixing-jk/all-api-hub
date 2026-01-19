import { describe, expect, it } from "vitest"

import { LogType, type LogItem } from "~/services/apiService/common/type"
import {
  computeRetentionCutoffDayKey,
  createEmptyUsageHistoryAccountStore,
  ingestConsumeLogItems,
  pruneUsageHistoryAccountStore,
  USAGE_HISTORY_LATENCY_BUCKET_UPPER_BOUNDS_SECONDS,
  USAGE_HISTORY_SLOW_THRESHOLD_SECONDS,
} from "~/services/usageHistory/core"

/**
 * Create a fully populated Consume log item for usage-history unit tests.
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
    prompt_tokens: rest.prompt_tokens ?? 2,
    completion_tokens: rest.completion_tokens ?? 3,
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

describe("usageHistory core", () => {
  it("computes cutoff dayKey from retentionDays", () => {
    // 2026-01-10T12:00:00Z
    const nowUnixSeconds = Math.floor(Date.UTC(2026, 0, 10, 12, 0, 0) / 1000)

    const cutoff = computeRetentionCutoffDayKey(7, nowUnixSeconds, "UTC")
    expect(cutoff).toBe("2026-01-04")
  })

  it("dedupes boundary items via fingerprints (idempotent sync boundary)", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()

    const items = [
      createConsumeLogItem({ id: 1, created_at: 100, quota: 1 }),
      createConsumeLogItem({ id: 2, created_at: 200, quota: 2 }),
      createConsumeLogItem({ id: 3, created_at: 200, quota: 3 }),
    ]

    const startCursor = {
      ...accountStore.cursor,
      fingerprintsAtLastSeenCreatedAt: [],
    }
    const first = ingestConsumeLogItems({
      accountStore,
      items,
      startCursor,
      cursorCandidate: { ...startCursor, fingerprintsAtLastSeenCreatedAt: [] },
      timeZone: "UTC",
    })

    accountStore.cursor = first.cursorCandidate

    const dayKeys = Object.keys(accountStore.daily)
    expect(dayKeys.length).toBeGreaterThan(0)

    const dailyBefore = JSON.stringify(accountStore.daily)

    // Second run only fetches items at the boundary timestamp (created_at === cursor).
    const boundaryItems = items.filter(
      (item) => item.created_at === accountStore.cursor.lastSeenCreatedAt,
    )

    const secondStartCursor = {
      ...accountStore.cursor,
      fingerprintsAtLastSeenCreatedAt: [
        ...accountStore.cursor.fingerprintsAtLastSeenCreatedAt,
      ],
    }
    const second = ingestConsumeLogItems({
      accountStore,
      items: boundaryItems,
      startCursor: secondStartCursor,
      cursorCandidate: {
        ...secondStartCursor,
        fingerprintsAtLastSeenCreatedAt: [
          ...secondStartCursor.fingerprintsAtLastSeenCreatedAt,
        ],
      },
      timeZone: "UTC",
    })

    expect(second.ingestedCount).toBe(0)
    expect(JSON.stringify(accountStore.daily)).toBe(dailyBefore)
  })

  it("ingests new items at the same created_at as cursor and updates fingerprints", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    accountStore.cursor = {
      lastSeenCreatedAt: 1000,
      fingerprintsAtLastSeenCreatedAt: [],
    }

    const existing = createConsumeLogItem({
      id: 1,
      created_at: 1000,
      quota: 10,
      prompt_tokens: 1,
      completion_tokens: 1,
    })
    const start = ingestConsumeLogItems({
      accountStore,
      items: [existing],
      startCursor: {
        ...accountStore.cursor,
        fingerprintsAtLastSeenCreatedAt: [],
      },
      cursorCandidate: {
        ...accountStore.cursor,
        fingerprintsAtLastSeenCreatedAt: [],
      },
      timeZone: "UTC",
    })
    accountStore.cursor = start.cursorCandidate

    const duplicate = existing
    const newSameSecond = createConsumeLogItem({
      id: 999,
      created_at: 1000,
      quota: 20,
      prompt_tokens: 2,
      completion_tokens: 2,
    })

    const startCursor = {
      ...accountStore.cursor,
      fingerprintsAtLastSeenCreatedAt: [
        ...accountStore.cursor.fingerprintsAtLastSeenCreatedAt,
      ],
    }

    const result = ingestConsumeLogItems({
      accountStore,
      items: [duplicate, newSameSecond],
      startCursor,
      cursorCandidate: {
        ...startCursor,
        fingerprintsAtLastSeenCreatedAt: [
          ...startCursor.fingerprintsAtLastSeenCreatedAt,
        ],
      },
      timeZone: "UTC",
    })

    expect(result.ingestedCount).toBe(1)
    expect(result.cursorCandidate.lastSeenCreatedAt).toBe(1000)
    expect(result.cursorCandidate.fingerprintsAtLastSeenCreatedAt.length).toBe(
      2,
    )
  })

  it("prunes daily and per-model buckets older than cutoff", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()
    accountStore.daily["2026-01-01"] = {
      requests: 1,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      quotaConsumed: 1,
    }
    accountStore.daily["2026-01-02"] = {
      requests: 2,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      quotaConsumed: 2,
    }
    accountStore.hourly["2026-01-01"] = {
      "12": { ...accountStore.daily["2026-01-01"] },
    }
    accountStore.hourly["2026-01-02"] = {
      "12": { ...accountStore.daily["2026-01-02"] },
    }
    accountStore.dailyByModel["gpt-4"] = {
      "2026-01-01": { ...accountStore.daily["2026-01-01"] },
      "2026-01-02": { ...accountStore.daily["2026-01-02"] },
    }

    accountStore.dailyByToken["1"] = {
      "2026-01-01": { ...accountStore.daily["2026-01-01"] },
      "2026-01-02": { ...accountStore.daily["2026-01-02"] },
    }
    accountStore.hourlyByToken["1"] = {
      "2026-01-01": { "12": { ...accountStore.daily["2026-01-01"] } },
      "2026-01-02": { "12": { ...accountStore.daily["2026-01-02"] } },
    }

    accountStore.latencyDaily["2026-01-01"] = {
      count: 1,
      sum: 1,
      max: 1,
      slowCount: 0,
      unknownCount: 0,
      buckets: [1],
    }
    accountStore.latencyDaily["2026-01-02"] = {
      count: 1,
      sum: 2,
      max: 2,
      slowCount: 0,
      unknownCount: 0,
      buckets: [1],
    }

    accountStore.latencyDailyByToken["1"] = {
      "2026-01-01": { ...accountStore.latencyDaily["2026-01-01"] },
      "2026-01-02": { ...accountStore.latencyDaily["2026-01-02"] },
    }

    pruneUsageHistoryAccountStore(accountStore, "2026-01-02")

    expect(accountStore.daily["2026-01-01"]).toBeUndefined()
    expect(accountStore.daily["2026-01-02"]).toBeDefined()
    expect(accountStore.hourly["2026-01-01"]).toBeUndefined()
    expect(accountStore.hourly["2026-01-02"]).toBeDefined()
    expect(accountStore.dailyByModel["gpt-4"]["2026-01-01"]).toBeUndefined()
    expect(accountStore.dailyByModel["gpt-4"]["2026-01-02"]).toBeDefined()
    expect(accountStore.dailyByToken["1"]["2026-01-01"]).toBeUndefined()
    expect(accountStore.dailyByToken["1"]["2026-01-02"]).toBeDefined()
    expect(accountStore.hourlyByToken["1"]["2026-01-01"]).toBeUndefined()
    expect(accountStore.hourlyByToken["1"]["2026-01-02"]).toBeDefined()
    expect(accountStore.latencyDaily["2026-01-01"]).toBeUndefined()
    expect(accountStore.latencyDaily["2026-01-02"]).toBeDefined()
    expect(accountStore.latencyDailyByToken["1"]["2026-01-01"]).toBeUndefined()
    expect(accountStore.latencyDailyByToken["1"]["2026-01-02"]).toBeDefined()
  })

  it("ingests token-scoped aggregates and latency histograms", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()

    // 2026-01-01T12:00:00Z
    const createdAt = Math.floor(Date.UTC(2026, 0, 1, 12, 0, 0) / 1000)
    const dayKey = "2026-01-01"

    const items = [
      createConsumeLogItem({
        id: 1,
        created_at: createdAt,
        token_id: 1,
        token_name: "Token A",
        model_name: "gpt-4",
        prompt_tokens: 10,
        completion_tokens: 5,
        quota: 2,
        use_time: 0.4,
      }),
      createConsumeLogItem({
        id: 2,
        created_at: createdAt + 1,
        token_id: 2,
        token_name: "Token B",
        model_name: "gpt-4",
        prompt_tokens: 1,
        completion_tokens: 1,
        quota: 1,
        use_time: 6,
      }),
    ]

    const startCursor = {
      ...accountStore.cursor,
      fingerprintsAtLastSeenCreatedAt: [],
    }

    ingestConsumeLogItems({
      accountStore,
      items,
      startCursor,
      cursorCandidate: { ...startCursor, fingerprintsAtLastSeenCreatedAt: [] },
      timeZone: "UTC",
    })

    expect(accountStore.daily[dayKey]).toMatchObject({
      requests: 2,
      totalTokens: 17,
      quotaConsumed: 3,
    })
    expect(accountStore.hourly[dayKey]["12"]).toMatchObject({
      requests: 2,
      totalTokens: 17,
      quotaConsumed: 3,
    })

    expect(accountStore.tokenNamesById["1"]).toBe("Token A")
    expect(accountStore.tokenNamesById["2"]).toBe("Token B")

    expect(accountStore.dailyByToken["1"][dayKey]).toMatchObject({
      requests: 1,
      totalTokens: 15,
    })
    expect(accountStore.hourlyByToken["1"][dayKey]["12"]).toMatchObject({
      requests: 1,
      totalTokens: 15,
    })
    expect(accountStore.dailyByToken["2"][dayKey]).toMatchObject({
      requests: 1,
      totalTokens: 2,
    })

    expect(
      accountStore.dailyByTokenByModel["1"]["gpt-4"][dayKey],
    ).toMatchObject({
      requests: 1,
      totalTokens: 15,
    })

    expect(accountStore.latencyDaily[dayKey]).toMatchObject({
      count: 2,
      slowCount: 1,
      max: 6,
    })

    const bucketIndex = (seconds: number) => {
      const bounds = USAGE_HISTORY_LATENCY_BUCKET_UPPER_BOUNDS_SECONDS
      for (let index = 0; index < bounds.length; index += 1) {
        if (seconds < bounds[index]) return index
      }
      return bounds.length
    }

    const buckets = accountStore.latencyDaily[dayKey].buckets
    expect(buckets[bucketIndex(0.4)]).toBe(1)
    expect(buckets[bucketIndex(6)]).toBe(1)
    expect(accountStore.latencyDaily[dayKey].slowCount).toBe(
      6 >= USAGE_HISTORY_SLOW_THRESHOLD_SECONDS ? 1 : 0,
    )
  })

  it("records unknown latency when use_time is missing/invalid", () => {
    const accountStore = createEmptyUsageHistoryAccountStore()

    // 2026-01-01T12:00:00Z
    const createdAt = Math.floor(Date.UTC(2026, 0, 1, 12, 0, 0) / 1000)
    const dayKey = "2026-01-01"

    const items = [
      createConsumeLogItem({
        id: 1,
        created_at: createdAt,
        model_name: " ",
        token_id: Number.NaN as any,
        token_name: "Token Unknown",
        use_time: -1 as any,
      }),
      createConsumeLogItem({
        id: 2,
        created_at: createdAt + 1,
        model_name: "",
        token_id: Number.NaN as any,
        token_name: "Token Unknown",
        use_time: "bad" as any,
      }),
    ]

    const startCursor = {
      ...accountStore.cursor,
      fingerprintsAtLastSeenCreatedAt: [],
    }

    ingestConsumeLogItems({
      accountStore,
      items,
      startCursor,
      cursorCandidate: { ...startCursor, fingerprintsAtLastSeenCreatedAt: [] },
      timeZone: "UTC",
    })

    expect(accountStore.daily[dayKey]).toMatchObject({ requests: 2 })
    expect(accountStore.dailyByModel["unknown"][dayKey]).toMatchObject({
      requests: 2,
    })

    expect(accountStore.tokenNamesById["unknown"]).toBe("Token Unknown")
    expect(accountStore.dailyByToken["unknown"][dayKey]).toMatchObject({
      requests: 2,
    })

    expect(accountStore.latencyDaily[dayKey]).toMatchObject({
      count: 0,
      unknownCount: 2,
    })
    expect(accountStore.latencyDailyByModel["unknown"][dayKey]).toMatchObject({
      unknownCount: 2,
    })
    expect(accountStore.latencyDailyByToken["unknown"][dayKey]).toMatchObject({
      unknownCount: 2,
    })
    expect(
      accountStore.latencyDailyByTokenByModel["unknown"]["unknown"][dayKey],
    ).toMatchObject({ unknownCount: 2 })
  })
})
