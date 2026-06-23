import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import {
  STORAGE_LOCKS,
  WEB_AI_API_CHECK_STORAGE_KEYS,
} from "~/services/core/storageKeys"
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

  it("drops malformed persisted entries and falls back to safe defaults", () => {
    const store = coerceWebAiApiCheckBaseUrlHistoryStore(
      {
        entries: [
          null,
          {
            baseUrl: 123,
            lastUsedAt: 1,
            useCount: 1,
          },
          {
            baseUrl: "https://valid.example.invalid/api/v1/models",
            lastUsedAt: -1,
            useCount: Number.NaN,
            sourceOrigins: {
              "not a url": {
                lastUsedAt: 1,
                useCount: 1,
              },
              "https://bad-stats.example.invalid/path": null,
            },
          },
        ],
        lastUpdated: 0,
      },
      { now: 42 },
    )

    expect(store).toEqual({
      version: 1,
      entries: [
        {
          baseUrl: "https://valid.example.invalid/api",
          lastUsedAt: 42,
          useCount: 1,
          sourceOrigins: {},
        },
      ],
      lastUpdated: 42,
    })
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

  it("returns globally ranked suggestions when the page URL has no safe origin", async () => {
    vi.setSystemTime(new Date("2026-06-24T01:00:00.000Z"))
    await webAiApiCheckBaseUrlHistoryStorage.recordUse({
      baseUrl: "https://older.example.com/v1",
      pageUrl: "https://source.example.invalid/t/topic",
    })

    vi.setSystemTime(new Date("2026-06-24T02:00:00.000Z"))
    await webAiApiCheckBaseUrlHistoryStorage.recordUse({
      baseUrl: "https://newer.example.com/v1",
      pageUrl: "https://source.example.invalid/t/topic",
    })

    const suggestions = await webAiApiCheckBaseUrlHistoryStorage.getSuggestions(
      {
        pageUrl: "not a url",
      },
    )

    expect(suggestions.map((item) => item.baseUrl)).toEqual([
      "https://newer.example.com",
      "https://older.example.com",
    ])
    expect(suggestions[0]).not.toHaveProperty("matchedSourceOrigin")
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

  it("keeps the current store when record or remove receives an invalid base URL", async () => {
    await webAiApiCheckBaseUrlHistoryStorage.recordUse({
      baseUrl: "https://keep.example.com/v1",
      pageUrl: "https://source.example.invalid/issues/1025",
    })

    await webAiApiCheckBaseUrlHistoryStorage.recordUse({
      baseUrl: "not a url",
      pageUrl: "https://source.example.invalid/issues/1025",
    })
    await webAiApiCheckBaseUrlHistoryStorage.removeBaseUrl({
      baseUrl: "not a url",
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

  it("coerces non-object persisted history to an empty store", () => {
    const store = coerceWebAiApiCheckBaseUrlHistoryStore("not an object", {
      now: 42,
    })

    expect(store).toEqual({
      version: 1,
      entries: [],
      lastUpdated: 42,
    })
  })

  it("clears history under the Web AI API Check storage lock", async () => {
    const originalLocksDescriptor = Object.getOwnPropertyDescriptor(
      globalThis.navigator,
      "locks",
    )
    const requestLock = vi.fn(
      async (
        _lockName: string,
        _options: LockOptions,
        callback: (lock: Lock | null) => Promise<void>,
      ) => callback(null),
    )

    Object.defineProperty(globalThis.navigator, "locks", {
      configurable: true,
      value: {
        request: requestLock,
      },
    })

    try {
      await webAiApiCheckBaseUrlHistoryStorage.clearAllData()

      expect(requestLock).toHaveBeenCalledWith(
        STORAGE_LOCKS.WEB_AI_API_CHECK,
        { mode: "exclusive" },
        expect.any(Function),
      )
    } finally {
      if (originalLocksDescriptor) {
        Object.defineProperty(
          globalThis.navigator,
          "locks",
          originalLocksDescriptor,
        )
      } else {
        delete (globalThis.navigator as unknown as { locks?: unknown }).locks
      }
    }
  })
})
