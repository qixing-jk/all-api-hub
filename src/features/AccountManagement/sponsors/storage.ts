import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { createLogger } from "~/utils/core/logger"

import type { RawSponsorCatalog } from "./types"

const logger = createLogger("SponsorCatalogStorage")

class SponsorCatalogStorage {
  private storage = new Storage({ area: "local" })

  async getCachedRemoteCatalog(): Promise<RawSponsorCatalog | null> {
    try {
      return (
        (await this.storage.get(STORAGE_KEYS.SPONSOR_CATALOG_CACHE)) ?? null
      )
    } catch (error) {
      logger.warn("Failed to read sponsor catalog cache", error)
      return null
    }
  }

  async setCachedRemoteCatalog(catalog: RawSponsorCatalog): Promise<void> {
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.SPONSOR_CATALOG,
      async () => {
        await this.storage.set(STORAGE_KEYS.SPONSOR_CATALOG_CACHE, catalog)
      },
    )
  }
}

export const sponsorCatalogStorage = new SponsorCatalogStorage()
