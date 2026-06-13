import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("SponsorCatalogStorage")

/**
 * Cache envelope for schema/source-discriminated sponsor catalog payloads.
 */
interface SponsorCatalogCacheEnvelope {
  schemaVersion: number
  sourceUrl: string
  fetchedAt: number
  payload: unknown
}

type SponsorCatalogVersionedCacheStore = Record<
  string,
  SponsorCatalogCacheEnvelope
>

/**
 * Builds the storage bucket key for one schema/source catalog pair.
 */
function createVersionedCacheKey({
  schemaVersion,
  sourceUrl,
}: {
  schemaVersion: number
  sourceUrl: string
}) {
  return `${schemaVersion}:${sourceUrl}`
}

/**
 * Verifies untyped extension storage data before returning a cache envelope.
 */
function isSponsorCatalogCacheEnvelope(
  value: unknown,
  {
    schemaVersion,
    sourceUrl,
  }: {
    schemaVersion: number
    sourceUrl: string
  },
): value is SponsorCatalogCacheEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const envelope = value as Record<string, unknown>
  return (
    envelope.schemaVersion === schemaVersion &&
    envelope.sourceUrl === sourceUrl &&
    typeof envelope.fetchedAt === "number" &&
    Number.isFinite(envelope.fetchedAt) &&
    Object.prototype.hasOwnProperty.call(envelope, "payload")
  )
}

class SponsorCatalogStorage {
  private storage = new Storage({ area: "local" })

  async getCachedVersionedCatalog({
    schemaVersion,
    sourceUrl,
  }: {
    schemaVersion: number
    sourceUrl: string
  }): Promise<SponsorCatalogCacheEnvelope | null> {
    try {
      const store =
        ((await this.storage.get(
          STORAGE_KEYS.SPONSOR_CATALOG_VERSIONED_CACHE,
        )) as Record<string, unknown> | undefined) ?? {}
      const envelope =
        store[createVersionedCacheKey({ schemaVersion, sourceUrl })]
      if (
        !isSponsorCatalogCacheEnvelope(envelope, { schemaVersion, sourceUrl })
      ) {
        return null
      }
      return envelope
    } catch (error) {
      logger.warn("Failed to read versioned sponsor catalog cache", error)
      return null
    }
  }

  async setCachedVersionedCatalog(
    envelope: SponsorCatalogCacheEnvelope,
  ): Promise<void> {
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.SPONSOR_CATALOG,
      async () => {
        const store =
          ((await this.storage.get(
            STORAGE_KEYS.SPONSOR_CATALOG_VERSIONED_CACHE,
          )) as SponsorCatalogVersionedCacheStore | undefined) ?? {}
        await this.storage.set(STORAGE_KEYS.SPONSOR_CATALOG_VERSIONED_CACHE, {
          ...store,
          [createVersionedCacheKey(envelope)]: envelope,
        })
      },
    )
  }
}

export const sponsorCatalogStorage = new SponsorCatalogStorage()
