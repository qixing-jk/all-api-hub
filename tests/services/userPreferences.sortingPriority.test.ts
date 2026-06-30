import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { userPreferences } from "~/services/preferences/userPreferences"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/services/preferences/utils/sortingPriority"
import { SortingCriteriaType } from "~/types/sorting"

describe("userPreferences sortingPriorityConfig", () => {
  const storage = new Storage({ area: "local" })

  beforeEach(async () => {
    vi.useFakeTimers()
    await storage.remove(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await storage.remove(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES)
  })

  it("resets sorting priority config to a fresh default snapshot", async () => {
    vi.setSystemTime(new Date("2026-03-30T01:00:00.000Z"))
    await userPreferences.setSortingPriorityConfig({
      criteria: [
        {
          id: SortingCriteriaType.USER_SORT_FIELD,
          enabled: false,
          priority: 99,
        },
      ],
      lastModified: 123,
    })

    vi.setSystemTime(new Date("2026-03-30T01:00:05.000Z"))
    const writeResult = await userPreferences.resetSortingPriorityConfig()

    expect(writeResult.ok).toBe(true)

    const preferences = await userPreferences.getPreferences()
    expect(preferences.sortingPriorityConfig).toEqual({
      ...DEFAULT_SORTING_PRIORITY_CONFIG,
      criteria: DEFAULT_SORTING_PRIORITY_CONFIG.criteria.map((item) => ({
        ...item,
      })),
      lastModified: new Date("2026-03-30T01:00:05.000Z").getTime(),
    })

    const storedPreferences = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as {
      sortingPriorityConfig?: unknown
    }
    expect(storedPreferences.sortingPriorityConfig).toEqual(
      preferences.sortingPriorityConfig,
    )
  })
})
