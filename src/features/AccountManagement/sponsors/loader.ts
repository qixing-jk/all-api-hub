import { getExtensionVersion } from "~/utils/browser/browserApi"
import { detectBrowserFamily } from "~/utils/browser/userAgent"
import { createLogger } from "~/utils/core/logger"

import {
  getBundledSponsorCatalog,
  getDevelopmentSponsorCatalog,
} from "./bundledCatalog"
import { normalizeSponsorCatalog } from "./catalog"
import {
  SPONSOR_CATALOG_SCHEMA_VERSION,
  SPONSOR_REMOTE_CATALOG_V5_URL,
} from "./constants"
import { sponsorCatalogStorage } from "./storage"
import {
  SPONSOR_CATALOG_SOURCES,
  type SponsorCatalogNormalizationResult,
  type SponsorCatalogSource,
  type SponsorRecommendation,
} from "./types"

const logger = createLogger("SponsorCatalogLoader")

interface LoadSponsorRecommendationsOptions {
  locale: string
  now?: number
  currentVersion?: string
  browserFamily?: string
}

export interface LoadSponsorRecommendationsResult {
  items: SponsorRecommendation[]
  source: SponsorCatalogSource
}

/** Appends local development examples to display results without persisting them as remote cache. */
function mergeDevelopmentSponsorRecommendations(
  items: SponsorRecommendation[],
  options: LoadSponsorRecommendationsOptions,
): SponsorRecommendation[] {
  const developmentCatalog = getDevelopmentSponsorCatalog()
  if (!developmentCatalog) {
    return items
  }

  const normalized = normalizeSponsorCatalog(developmentCatalog, {
    ...options,
    source: SPONSOR_CATALOG_SOURCES.Bundled,
  })

  if (!normalized.ok) {
    logger.warn("Development sponsor catalog examples are invalid", {
      errors: normalized.errors,
    })
    return items
  }

  return [...items, ...normalized.items].sort(
    (a, b) => a.rank - b.rank || a.id.localeCompare(b.id),
  )
}

/** Fetches the current V5 sponsor catalog as a best-effort JSON payload. */
async function fetchRemoteSponsorCatalog(): Promise<unknown | null> {
  try {
    const response = await fetch(SPONSOR_REMOTE_CATALOG_V5_URL, {
      cache: "no-store",
    })

    if (!response.ok) {
      logger.warn("Failed to fetch sponsor catalog resource", {
        status: response.status,
        url: SPONSOR_REMOTE_CATALOG_V5_URL,
      })
      return null
    }

    return await response.json()
  } catch (error) {
    logger.warn("Failed to fetch sponsor catalog resource", {
      error,
      url: SPONSOR_REMOTE_CATALOG_V5_URL,
    })
    return null
  }
}

/** Normalizes one V5 catalog payload for a result source. */
function normalizeCatalog(
  catalog: unknown,
  options: LoadSponsorRecommendationsOptions & { source: SponsorCatalogSource },
): SponsorCatalogNormalizationResult {
  return normalizeSponsorCatalog(catalog, {
    ...options,
    currentVersion: options.currentVersion?.trim() || getExtensionVersion(),
    browserFamily: options.browserFamily?.trim() || detectBrowserFamily(),
  })
}

/** Reads the fixed V5 remote cache. */
async function readCachedSponsorCatalog(): Promise<unknown | null> {
  try {
    const cached = await sponsorCatalogStorage.getCachedVersionedCatalog({
      schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
      sourceUrl: SPONSOR_REMOTE_CATALOG_V5_URL,
    })
    return cached?.payload ?? null
  } catch (error) {
    logger.warn("Failed to read sponsor catalog cache", {
      error,
      url: SPONSOR_REMOTE_CATALOG_V5_URL,
    })
    return null
  }
}

/** Persists the fixed V5 remote cache. */
async function persistCachedSponsorCatalog(
  payload: unknown,
  options: LoadSponsorRecommendationsOptions,
): Promise<void> {
  try {
    await sponsorCatalogStorage.setCachedVersionedCatalog({
      schemaVersion: SPONSOR_CATALOG_SCHEMA_VERSION,
      sourceUrl: SPONSOR_REMOTE_CATALOG_V5_URL,
      fetchedAt: options.now ?? Date.now(),
      payload,
    })
  } catch (error) {
    logger.warn("Failed to persist sponsor catalog cache", {
      error,
      url: SPONSOR_REMOTE_CATALOG_V5_URL,
    })
  }
}

/**
 * Fetches, validates, and caches the current remote V5 sponsor recommendations.
 */
export async function refreshSponsorRecommendations(
  options: LoadSponsorRecommendationsOptions,
): Promise<LoadSponsorRecommendationsResult | null> {
  const remoteCatalog = await fetchRemoteSponsorCatalog()
  if (!remoteCatalog) {
    return null
  }

  const normalized = normalizeCatalog(remoteCatalog, {
    ...options,
    source: SPONSOR_CATALOG_SOURCES.Remote,
  })

  if (!normalized.ok) {
    logger.warn("Rejected invalid remote sponsor catalog", {
      errors: normalized.errors,
    })
    return null
  }

  await persistCachedSponsorCatalog(remoteCatalog, options)

  return {
    items: mergeDevelopmentSponsorRecommendations(normalized.items, options),
    source: SPONSOR_CATALOG_SOURCES.Remote,
  }
}

/**
 * Loads cached V5 remote recommendations when valid, falling back to bundled data.
 */
export async function loadSponsorRecommendations(
  options: LoadSponsorRecommendationsOptions,
): Promise<LoadSponsorRecommendationsResult> {
  const bundled = normalizeCatalog(getBundledSponsorCatalog(), {
    ...options,
    source: SPONSOR_CATALOG_SOURCES.Bundled,
  })

  if (!bundled.ok) {
    logger.warn("Bundled sponsor catalog is invalid", {
      errors: bundled.errors,
    })
  }

  const cachedCatalog = await readCachedSponsorCatalog()
  if (cachedCatalog) {
    const cached = normalizeCatalog(cachedCatalog, {
      ...options,
      source: SPONSOR_CATALOG_SOURCES.Cached,
    })

    if (cached.ok) {
      return {
        items: mergeDevelopmentSponsorRecommendations(cached.items, options),
        source: SPONSOR_CATALOG_SOURCES.Cached,
      }
    }

    logger.warn("Rejected invalid cached sponsor catalog", {
      errors: cached.errors,
    })
  }

  return {
    items: bundled.items,
    source: SPONSOR_CATALOG_SOURCES.Bundled,
  }
}
