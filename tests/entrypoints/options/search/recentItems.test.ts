// @vitest-environment jsdom

import { Storage } from "@plasmohq/storage"
import { beforeEach, describe, expect, it } from "vitest"

import {
  loadRecentSearchItemIds,
  resolveRecentSearchItems,
  saveRecentSearchItemSelection,
} from "~/entrypoints/options/search/recentItems"
import { OPTIONS_SEARCH_STORAGE_KEYS } from "~/services/core/storageKeys"

describe("options search recent items", () => {
  const storage = new Storage({ area: "local" })

  beforeEach(async () => {
    await storage.remove(OPTIONS_SEARCH_STORAGE_KEYS.RECENT_ITEM_IDS)
    window.localStorage.clear()
  })

  it("returns an empty list when nothing is stored", async () => {
    await expect(loadRecentSearchItemIds()).resolves.toEqual([])
  })

  it("migrates the legacy localStorage value into extension storage", async () => {
    window.localStorage.setItem(
      "options-search-recent-item-ids",
      JSON.stringify(["alpha", "beta"]),
    )

    await expect(loadRecentSearchItemIds()).resolves.toEqual(["alpha", "beta"])
    await expect(
      storage.get(OPTIONS_SEARCH_STORAGE_KEYS.RECENT_ITEM_IDS),
    ).resolves.toEqual(["alpha", "beta"])
    expect(
      window.localStorage.getItem("options-search-recent-item-ids"),
    ).toBeNull()
  })

  it("falls back to an empty list for malformed stored payloads", async () => {
    await storage.set(OPTIONS_SEARCH_STORAGE_KEYS.RECENT_ITEM_IDS, {
      invalid: true,
    })

    await expect(loadRecentSearchItemIds()).resolves.toEqual([])
  })

  it("deduplicates and prepends saved recent ids", async () => {
    await storage.set(OPTIONS_SEARCH_STORAGE_KEYS.RECENT_ITEM_IDS, [
      "beta",
      "alpha",
    ])

    await expect(
      saveRecentSearchItemSelection({ id: "alpha" }),
    ).resolves.toEqual(["alpha", "beta"])
  })

  it("resolves only recent ids that still exist in the localized item list", () => {
    expect(
      resolveRecentSearchItems(
        [
          {
            id: "alpha",
            kind: "control",
            pageId: "basic",
            tabId: "general",
            targetId: "alpha",
            title: "Alpha",
            titleKey: "alpha",
            breadcrumbs: [],
            breadcrumbsKeys: [],
            keywords: [],
            order: 1,
          },
        ],
        ["alpha", "missing"],
      ),
    ).toEqual([
      {
        id: "alpha",
        kind: "control",
        pageId: "basic",
        tabId: "general",
        targetId: "alpha",
        title: "Alpha",
        titleKey: "alpha",
        breadcrumbs: [],
        breadcrumbsKeys: [],
        keywords: [],
        order: 1,
      },
    ])
  })
})
