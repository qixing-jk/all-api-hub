import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { WEB_AI_API_CHECK_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  coerceWebAiApiCheckBaseUrlHistoryStore,
  webAiApiCheckBaseUrlHistoryStorage,
  type WebAiApiCheckBaseUrlHistoryStore,
} from "~/services/verification/webAiApiCheck/baseUrlHistory"

describe("webAiApiCheckBaseUrlHistoryStorage", () => {
  const storage = new Storage({ area: "local" })

  beforeEach(async () => {
    vi.useRealTimers()
    await webAiApiCheckBaseUrlHistoryStorage.clearAllData()
  })

  it("records normalized base URLs with source origins but without page paths or secrets", async () => {
    vi.setSystemTime(new Date("2026-06-24T01:00:00.000Z"))

    await webAiApiCheckBaseUrlHistoryStorage.recordUse({
      baseUrl: "https://proxy.example.com/api/v1/chat/completions",
      pageUrl: "https://source.example.invalid/docs/setup?token=secret#comment",
    })

    const raw = (await storage.get(
      WEB_AI_API_CHECK_STORAGE_KEYS.BASE_URL_HISTORY,
    )) as WebAiApiCheckBaseUrlHistoryStore

    expect(raw.entries).toHaveLength(1)
    expect(raw.entries[0]).toEqual({
      baseUrl: "https://proxy.example.com/api",
      lastUsedAt: Date.parse("2026-06-24T01:00:00.000Z"),
      useCount: 1,
      sourceOrigins: {
        "https://source.example.invalid": {
          lastUsedAt: Date.parse("2026-06-24T01:00:00.000Z"),
          useCount: 1,
        },
      },
    })
    expect(JSON.stringify(raw)).not.toContain("/docs/")
    expect(JSON.stringify(raw)).not.toContain("token=secret")
  })

  it("coerces persisted source origins to the most recent privacy-safe origins", () => {
    const sourceOrigins = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => {
        const item = index + 1
        return [
          `https://source-${item}.example.invalid/path?token=secret`,
          {
            lastUsedAt: item,
            useCount: item,
          },
        ]
      }),
    )

    const store = coerceWebAiApiCheckBaseUrlHistoryStore({
      entries: [
        {
          baseUrl: "https://proxy.example.invalid/api/v1/models",
          lastUsedAt: 10,
          useCount: 2,
          sourceOrigins,
        },
      ],
      lastUpdated: 10,
    })

    const coercedSourceOrigins = store.entries[0].sourceOrigins
    expect(Object.keys(coercedSourceOrigins)).toEqual(
      Array.from(
        { length: 8 },
        (_, index) => `https://source-${9 - index}.example.invalid`,
      ),
    )
    expect(coercedSourceOrigins["https://source-9.example.invalid"]).toEqual({
      lastUsedAt: 9,
      useCount: 9,
    })
    expect(coercedSourceOrigins).not.toHaveProperty(
      "https://source-1.example.invalid",
    )
    expect(JSON.stringify(store)).not.toContain("/path")
    expect(JSON.stringify(store)).not.toContain("token=secret")
  })

  it("ranks current-source history ahead of global recency", async () => {
    vi.setSystemTime(new Date("2026-06-24T01:00:00.000Z"))
    await webAiApiCheckBaseUrlHistoryStorage.recordUse({
      baseUrl: "https://source-match.example.com/v1",
      pageUrl: "https://source.example.invalid/t/topic",
    })

    vi.setSystemTime(new Date("2026-06-24T02:00:00.000Z"))
    await webAiApiCheckBaseUrlHistoryStorage.recordUse({
      baseUrl: "https://recent.example.com/v1",
      pageUrl: "https://recent-source.example.invalid/issues/1025",
    })

    const suggestions = await webAiApiCheckBaseUrlHistoryStorage.getSuggestions(
      {
        pageUrl: "https://source.example.invalid/other-topic",
      },
    )

    expect(suggestions.map((item) => item.baseUrl)).toEqual([
      "https://source-match.example.com",
      "https://recent.example.com",
    ])
    expect(suggestions[0].matchedSourceOrigin).toBe(
      "https://source.example.invalid",
    )
  })

  it("removes a normalized base URL from history", async () => {
    await webAiApiCheckBaseUrlHistoryStorage.recordUse({
      baseUrl: "https://remove.example.com/api/v1/models",
      pageUrl: "https://source.example.invalid/issues/1025",
    })
    await webAiApiCheckBaseUrlHistoryStorage.recordUse({
      baseUrl: "https://keep.example.com/v1",
      pageUrl: "https://source.example.invalid/issues/1025",
    })

    await webAiApiCheckBaseUrlHistoryStorage.removeBaseUrl({
      baseUrl: "https://remove.example.com/api",
    })

    const suggestions = await webAiApiCheckBaseUrlHistoryStorage.getSuggestions(
      {
        pageUrl: "https://source.example.invalid/pull/1026",
      },
    )

    expect(suggestions.map((item) => item.baseUrl)).toEqual([
      "https://keep.example.com",
    ])
  })
})
