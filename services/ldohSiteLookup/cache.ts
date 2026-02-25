import { Storage } from "@plasmohq/storage"

import {
  LDOH_SITE_LOOKUP_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/storageWriteLock"

import { coerceLdohSiteListCache, coerceLdohSiteSummaryList } from "./coerce"
import { LDOH_SITE_LIST_CACHE_TTL_MS } from "./constants"
import type { LdohSiteListCache } from "./types"

const storage = new Storage({ area: "local" })

/**
 * Reads the raw LDOH site directory cache from extension storage.
 *
 * Returns `null` when missing or when the stored payload fails validation.
 */
export async function readLdohSiteListCache(): Promise<LdohSiteListCache | null> {
  const raw = await storage.get(LDOH_SITE_LOOKUP_STORAGE_KEYS.SITE_LIST_CACHE)
  return coerceLdohSiteListCache(raw)
}

/**
 * Reads the LDOH site directory cache and returns it only when still fresh.
 *
 * This is the primary accessor used by UI code to avoid doing work based on
 * expired data. Callers can trigger a background refresh when this returns `null`.
 */
export async function readFreshLdohSiteListCache(
  now: number = Date.now(),
): Promise<LdohSiteListCache | null> {
  const cache = await readLdohSiteListCache()
  if (!cache) return null
  if (cache.expiresAt <= now) return null
  return cache
}

/**
 * Writes a validated, de-duplicated LDOH site directory cache to extension storage.
 *
 * - Coerces items to a minimal safe shape (`id`, `apiBaseUrl`, optional `name`).
 * - Dedupes by `id` to keep cache stable across refreshes.
 * - Applies a TTL to ensure the UI stays "quiet" (no repeated network work).
 */
export async function writeLdohSiteListCache(
  rawItems: unknown,
  options?: { now?: number; ttlMs?: number },
): Promise<LdohSiteListCache> {
  const now = typeof options?.now === "number" ? options.now : Date.now()
  const ttlMs =
    typeof options?.ttlMs === "number" && options.ttlMs > 0
      ? options.ttlMs
      : LDOH_SITE_LIST_CACHE_TTL_MS

  const deduped = coerceLdohSiteSummaryList(rawItems)

  const cache: LdohSiteListCache = {
    version: 1,
    fetchedAt: now,
    expiresAt: now + ttlMs,
    items: deduped,
  }

  await withExtensionStorageWriteLock(
    STORAGE_LOCKS.LDOH_SITE_LOOKUP,
    async () => {
      await storage.set(LDOH_SITE_LOOKUP_STORAGE_KEYS.SITE_LIST_CACHE, cache)
    },
  )

  return cache
}

/**
 * Clears the cached LDOH site directory from extension storage.
 */
export async function clearLdohSiteListCache(): Promise<void> {
  await withExtensionStorageWriteLock(
    STORAGE_LOCKS.LDOH_SITE_LOOKUP,
    async () => {
      await storage.remove(LDOH_SITE_LOOKUP_STORAGE_KEYS.SITE_LIST_CACHE)
    },
  )
}
