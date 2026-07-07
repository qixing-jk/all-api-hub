import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { sponsorCatalogStorage } from "~/features/AccountManagement/sponsors/storage"
import { STORAGE_KEYS } from "~/services/core/storageKeys"

const storage = new Storage({ area: "local" })
const sourceUrl = "https://example.invalid/sponsors/catalog.v5.json"

describe("sponsor catalog storage", () => {
  beforeEach(async () => {
    await storage.remove(STORAGE_KEYS.SPONSOR_CATALOG_CACHE)
    await storage.remove(STORAGE_KEYS.SPONSOR_CATALOG_VERSIONED_CACHE)
  })

  it("persists and reads catalog cache envelopes", async () => {
    await sponsorCatalogStorage.setCachedVersionedCatalog({
      schemaVersion: 5,
      sourceUrl,
      fetchedAt: Date.parse("2026-06-11T00:00:00.000Z"),
      payload: {
        schemaVersion: 5,
        items: [],
      },
    })

    await expect(
      sponsorCatalogStorage.getCachedVersionedCatalog({
        schemaVersion: 5,
        sourceUrl,
      }),
    ).resolves.toEqual({
      schemaVersion: 5,
      sourceUrl,
      fetchedAt: Date.parse("2026-06-11T00:00:00.000Z"),
      payload: {
        schemaVersion: 5,
        items: [],
      },
    })
  })

  it("does not return cache entries for mismatched schema or URL", async () => {
    await sponsorCatalogStorage.setCachedVersionedCatalog({
      schemaVersion: 5,
      sourceUrl,
      fetchedAt: 1,
      payload: {
        schemaVersion: 5,
        items: [],
      },
    })

    await expect(
      sponsorCatalogStorage.getCachedVersionedCatalog({
        schemaVersion: 3,
        sourceUrl,
      }),
    ).resolves.toBeNull()
    await expect(
      sponsorCatalogStorage.getCachedVersionedCatalog({
        schemaVersion: 5,
        sourceUrl: "https://example.invalid/sponsors/other.json",
      }),
    ).resolves.toBeNull()
  })

  it("returns null for malformed matching cache entries", async () => {
    await storage.set(STORAGE_KEYS.SPONSOR_CATALOG_VERSIONED_CACHE, {
      [`5:${sourceUrl}`]: {
        schemaVersion: 5,
        sourceUrl,
        payload: {
          schemaVersion: 5,
          items: [],
        },
      },
      "5:https://example.invalid/sponsors/catalog-with-invalid-date.v5.json": {
        schemaVersion: 5,
        sourceUrl:
          "https://example.invalid/sponsors/catalog-with-invalid-date.v5.json",
        fetchedAt: "2026-06-11T00:00:00.000Z",
        payload: {
          schemaVersion: 5,
          items: [],
        },
      },
    })

    await expect(
      sponsorCatalogStorage.getCachedVersionedCatalog({
        schemaVersion: 5,
        sourceUrl,
      }),
    ).resolves.toBeNull()
    await expect(
      sponsorCatalogStorage.getCachedVersionedCatalog({
        schemaVersion: 5,
        sourceUrl:
          "https://example.invalid/sponsors/catalog-with-invalid-date.v5.json",
      }),
    ).resolves.toBeNull()
  })

  it("returns null when the versioned cache cannot be read", async () => {
    const getSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockRejectedValueOnce(new Error("storage unavailable"))

    await expect(
      sponsorCatalogStorage.getCachedVersionedCatalog({
        schemaVersion: 5,
        sourceUrl,
      }),
    ).resolves.toBeNull()

    getSpy.mockRestore()
  })
})
