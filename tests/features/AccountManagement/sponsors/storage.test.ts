import { beforeEach, describe, expect, it } from "vitest"

import { Storage } from "@plasmohq/storage"

import { SPONSOR_CATALOG_SCHEMA_VERSION } from "~/features/AccountManagement/sponsors/constants"
import { sponsorCatalogStorage } from "~/features/AccountManagement/sponsors/storage"
import {
  SPONSOR_SUPPORT_STATUS,
  type RawSponsorCatalog,
} from "~/features/AccountManagement/sponsors/types"
import { STORAGE_KEYS } from "~/services/core/storageKeys"

const storage = new Storage({ area: "local" })

const catalog: RawSponsorCatalog = {
  schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
  items: [
    {
      id: "cached-provider",
      enabled: true,
      supportStatus: SPONSOR_SUPPORT_STATUS.Unsupported,
      urls: {
        primaryAffiliate: "https://cached.example.com/register",
      },
      locales: {
        en: {
          name: "Cached Provider",
          tagline: "Cached sponsor recommendation.",
        },
      },
    },
  ],
}

describe("sponsor catalog storage", () => {
  beforeEach(async () => {
    await storage.remove(STORAGE_KEYS.SPONSOR_CATALOG_CACHE)
  })

  it("returns null when no cached remote catalog exists", async () => {
    await expect(
      sponsorCatalogStorage.getCachedRemoteCatalog(),
    ).resolves.toBeNull()
  })

  it("persists and reads the cached remote sponsor catalog", async () => {
    await sponsorCatalogStorage.setCachedRemoteCatalog(catalog)

    await expect(
      sponsorCatalogStorage.getCachedRemoteCatalog(),
    ).resolves.toEqual(catalog)
  })

  it("preserves raw catalog metadata for later normalization", async () => {
    const extendedCatalog: RawSponsorCatalog = {
      ...catalog,
      _examples: {
        devSponsors: [
          {
            id: "example-provider",
            enabled: true,
            supportStatus: SPONSOR_SUPPORT_STATUS.Supported,
            urls: {
              primaryAffiliate: "https://example.test/register",
            },
            locales: {
              en: {
                name: "Example Provider",
                tagline: "Development-only example.",
              },
            },
          },
        ],
      },
    }

    await sponsorCatalogStorage.setCachedRemoteCatalog(extendedCatalog)

    const cached = await sponsorCatalogStorage.getCachedRemoteCatalog()
    expect(cached?._examples?.devSponsors?.[0]?.id).toBe("example-provider")
  })
})
