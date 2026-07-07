import { isDevelopmentMode } from "~/utils/core/environment"
import sponsorCatalog from "~~/public/sponsor-catalog.v5.json"

import type { RawSponsorCatalog } from "./types"

export const bundledSponsorCatalog = sponsorCatalog as RawSponsorCatalog

/** Returns example-only sponsor data for local development surfaces. */
export function getDevelopmentSponsorCatalog(): RawSponsorCatalog | null {
  if (!isDevelopmentMode()) {
    return null
  }

  const devSponsors = bundledSponsorCatalog._examples?.devSponsors
  if (!devSponsors?.length) {
    return null
  }

  return {
    schemaVersion: bundledSponsorCatalog.schemaVersion,
    items: devSponsors,
  }
}

/** Returns bundled sponsor data with example-only records injected in development. */
export function getBundledSponsorCatalog(): RawSponsorCatalog {
  const developmentCatalog = getDevelopmentSponsorCatalog()
  if (!developmentCatalog) {
    return bundledSponsorCatalog
  }

  return {
    ...bundledSponsorCatalog,
    items: [...bundledSponsorCatalog.items, ...developmentCatalog.items],
  }
}
