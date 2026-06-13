import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { sponsorCatalogStorage } from "~/features/AccountManagement/sponsors/storage"
import { STORAGE_KEYS } from "~/services/core/storageKeys"

const storage = new Storage({ area: "local" })
const sourceUrl = "https://example.invalid/sponsors/catalog.v4.json"

describe("sponsor catalog storage", () => {
  beforeEach(async () => {
    await storage.remove(STORAGE_KEYS.SPONSOR_CATALOG_CACHE)
    await storage.remove(STORAGE_KEYS.SPONSOR_CATALOG_VERSIONED_CACHE)
  })

  it("persists and reads V4 catalog cache envelopes", async () => {
    await sponsorCatalogStorage.setCachedVersionedCatalog({
      schemaVersion: 4,
      sourceUrl,
      fetchedAt: Date.parse("2026-06-11T00:00:00.000Z"),
      payload: {
        schemaVersion: 4,
        items: [],
      },
    })

    await expect(
      sponsorCatalogStorage.getCachedVersionedCatalog({
        schemaVersion: 4,
        sourceUrl,
      }),
    ).resolves.toEqual({
      schemaVersion: 4,
      sourceUrl,
      fetchedAt: Date.parse("2026-06-11T00:00:00.000Z"),
      payload: {
        schemaVersion: 4,
        items: [],
      },
    })
  })

  it("does not return cache entries for mismatched schema or URL", async () => {
    await sponsorCatalogStorage.setCachedVersionedCatalog({
      schemaVersion: 4,
      sourceUrl,
      fetchedAt: 1,
      payload: {
        schemaVersion: 4,
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
        schemaVersion: 4,
        sourceUrl: "https://example.invalid/sponsors/other.json",
      }),
    ).resolves.toBeNull()
  })

  it("returns null for malformed matching cache entries", async () => {
    await storage.set(STORAGE_KEYS.SPONSOR_CATALOG_VERSIONED_CACHE, {
      [`4:${sourceUrl}`]: {
        schemaVersion: 4,
        sourceUrl,
        payload: {
          schemaVersion: 4,
          items: [],
        },
      },
      "4:https://example.invalid/sponsors/catalog-with-invalid-date.v4.json": {
        schemaVersion: 4,
        sourceUrl:
          "https://example.invalid/sponsors/catalog-with-invalid-date.v4.json",
        fetchedAt: "2026-06-11T00:00:00.000Z",
        payload: {
          schemaVersion: 4,
          items: [],
        },
      },
    })

    await expect(
      sponsorCatalogStorage.getCachedVersionedCatalog({
        schemaVersion: 4,
        sourceUrl,
      }),
    ).resolves.toBeNull()
    await expect(
      sponsorCatalogStorage.getCachedVersionedCatalog({
        schemaVersion: 4,
        sourceUrl:
          "https://example.invalid/sponsors/catalog-with-invalid-date.v4.json",
      }),
    ).resolves.toBeNull()
  })

  it("returns null when the versioned cache cannot be read", async () => {
    const getSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockRejectedValueOnce(new Error("storage unavailable"))

    await expect(
      sponsorCatalogStorage.getCachedVersionedCatalog({
        schemaVersion: 4,
        sourceUrl,
      }),
    ).resolves.toBeNull()

    getSpy.mockRestore()
  })
})
