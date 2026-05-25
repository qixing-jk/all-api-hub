import sponsorCatalog from "~~/public/sponsor-catalog.json"

import type { RawSponsorCatalog } from "./types"

export const bundledSponsorCatalog = sponsorCatalog as RawSponsorCatalog

/** Returns bundled sponsor data with example-only records injected in development. */
export function getBundledSponsorCatalog(): RawSponsorCatalog {
  if (import.meta.env.MODE !== "development") {
    return bundledSponsorCatalog
  }

  const devSponsors = bundledSponsorCatalog._examples?.devSponsors
  if (!devSponsors?.length) {
    return bundledSponsorCatalog
  }

  return {
    ...bundledSponsorCatalog,
    items: [...bundledSponsorCatalog.items, ...devSponsors],
  }
}
