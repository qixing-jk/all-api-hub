import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"

import { isAccountSiteProfileUrl } from "./urls"

interface ContentSessionHintCandidate {
  site_type?: unknown
}

/**
 * Selects the best site-type hint for content-script account session reads.
 */
export function resolveAccountSiteContentSessionHintForOrigin({
  origin,
  candidateAccounts,
}: {
  origin: string
  candidateAccounts: ContentSessionHintCandidate[]
}): AccountSiteType | undefined {
  const validSiteTypes = candidateAccounts
    .map((account) => account.site_type)
    .filter(
      (siteType): siteType is AccountSiteType =>
        isAccountSiteType(siteType) && siteType !== SITE_TYPES.UNKNOWN,
    )

  const profileMatchedSiteType = validSiteTypes.find((siteType) =>
    isAccountSiteProfileUrl(siteType, origin),
  )

  return profileMatchedSiteType ?? validSiteTypes[0]
}
