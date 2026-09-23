import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { createLogger } from "~/utils/core/logger"

import { getAccountSiteType } from "./detectSiteType"

const logger = createLogger("SiteTypeMismatch")

/** A stored site type the site's own signals no longer agree with. */
export interface SiteTypeMismatch {
  storedSiteType: AccountSiteType
  suggestedSiteType: AccountSiteType
}

/**
 * Compares a stored site type with the type the site's own signals resolve to.
 *
 * The result is a suggestion, not a verdict: brand signals (public site name,
 * page title, domain, endpoint shape) can legitimately disagree with the
 * protocol a deployment actually speaks, so callers decide when a mismatch is
 * worth showing. Detection is best-effort and never throws; a site that resolves
 * to no registered type reports no mismatch.
 */
export async function resolveSiteTypeMismatch(input: {
  siteUrl?: string
  storedSiteType: AccountSiteType
  protectionBypassExecution?: ProtectionBypassExecution
}): Promise<SiteTypeMismatch | null> {
  const siteUrl = input.siteUrl?.trim()
  if (!siteUrl) return null

  try {
    const resolvedSiteType = await getAccountSiteType(
      siteUrl,
      input.protectionBypassExecution,
    )
    if (
      resolvedSiteType === SITE_TYPES.UNKNOWN ||
      resolvedSiteType === input.storedSiteType
    ) {
      return null
    }

    return {
      storedSiteType: input.storedSiteType,
      suggestedSiteType: resolvedSiteType,
    }
  } catch (error) {
    logger.debug("site type mismatch check failed", { siteUrl, error })
  }

  return null
}
