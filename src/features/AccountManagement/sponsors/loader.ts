import { createLogger } from "~/utils/core/logger"

import {
  getBundledSponsorCatalog,
  getDevelopmentSponsorCatalog,
} from "./bundledCatalog"
import { normalizeSponsorCatalog } from "./catalog"
import { SPONSOR_REMOTE_CATALOG_URL } from "./constants"
import { sponsorCatalogStorage } from "./storage"
import {
  SPONSOR_CATALOG_SOURCES,
  type RawSponsorCatalog,
  type SponsorCatalogSource,
  type SponsorRecommendation,
} from "./types"

const logger = createLogger("SponsorCatalogLoader")

interface LoadSponsorRecommendationsOptions {
  locale: string
  now?: number
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

/**
 * Fetches the remote sponsor catalog as a best-effort JSON payload.
 */
async function fetchRemoteSponsorCatalog(): Promise<RawSponsorCatalog | null> {
  try {
    const response = await fetch(SPONSOR_REMOTE_CATALOG_URL, {
      cache: "no-store",
    })

    if (!response.ok) {
      logger.warn("Failed to fetch sponsor catalog", {
        status: response.status,
      })
      return null
    }

    return (await response.json()) as RawSponsorCatalog
  } catch (error) {
    logger.warn("Failed to fetch sponsor catalog", error)
    return null
  }
}

/**
 * Fetches, validates, and caches the latest remote sponsor recommendations.
 */
export async function refreshSponsorRecommendations(
  options: LoadSponsorRecommendationsOptions,
): Promise<LoadSponsorRecommendationsResult | null> {
  const remoteCatalog = await fetchRemoteSponsorCatalog()
  if (!remoteCatalog) {
    return null
  }

  const normalized = normalizeSponsorCatalog(remoteCatalog, {
    ...options,
    source: SPONSOR_CATALOG_SOURCES.Remote,
  })

  if (!normalized.ok) {
    logger.warn("Rejected invalid remote sponsor catalog", {
      errors: normalized.errors,
    })
    return null
  }

  try {
    await sponsorCatalogStorage.setCachedRemoteCatalog(remoteCatalog)
  } catch (error) {
    logger.warn("Failed to persist sponsor catalog cache", error)
  }

  return {
    items: mergeDevelopmentSponsorRecommendations(normalized.items, options),
    source: SPONSOR_CATALOG_SOURCES.Remote,
  }
}

/**
 * Loads cached remote recommendations when valid, falling back to bundled data.
 */
export async function loadSponsorRecommendations(
  options: LoadSponsorRecommendationsOptions,
): Promise<LoadSponsorRecommendationsResult> {
  const bundled = normalizeSponsorCatalog(getBundledSponsorCatalog(), {
    ...options,
    source: SPONSOR_CATALOG_SOURCES.Bundled,
  })

  if (!bundled.ok) {
    logger.warn("Bundled sponsor catalog is invalid", {
      errors: bundled.errors,
    })
  }

  let cachedCatalog: RawSponsorCatalog | null = null
  try {
    cachedCatalog = await sponsorCatalogStorage.getCachedRemoteCatalog()
  } catch (error) {
    logger.warn("Failed to read sponsor catalog cache", error)
  }

  if (cachedCatalog) {
    const cached = normalizeSponsorCatalog(cachedCatalog, {
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
