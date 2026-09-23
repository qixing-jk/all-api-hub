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

export const SITE_TYPE_MISMATCH_OUTCOMES = {
  /** The site's own signals resolve to a type other than the stored one. */
  Mismatch: "mismatch",
  /**
   * The site's own signals resolve to the stored type. Nothing is worth showing,
   * and an observation recorded earlier no longer holds.
   */
  Agrees: "agrees",
  /**
   * Detection resolved to no registered type, or could not read the site. This is
   * not agreement: what was recorded earlier may still be true.
   */
  Undetermined: "undetermined",
} as const

/** What one site's own signals say about the type stored on an account. */
export type SiteTypeCheck =
  | {
      outcome: typeof SITE_TYPE_MISMATCH_OUTCOMES.Mismatch
      mismatch: SiteTypeMismatch
    }
  | { outcome: typeof SITE_TYPE_MISMATCH_OUTCOMES.Agrees }
  | { outcome: typeof SITE_TYPE_MISMATCH_OUTCOMES.Undetermined }

/**
 * Compares a stored site type with the type the site's own signals resolve to.
 *
 * The result is a suggestion, not a verdict: brand signals (public site name,
 * page title, domain, endpoint shape) can legitimately disagree with the protocol
 * a deployment actually speaks, so callers decide when a mismatch is worth
 * showing. Detection is best-effort and never throws; a site that resolves to no
 * registered type reports no reading rather than agreement.
 */
export async function checkSiteTypeMismatch(input: {
  siteUrl?: string
  storedSiteType: AccountSiteType
  protectionBypassExecution?: ProtectionBypassExecution
}): Promise<SiteTypeCheck> {
  const siteUrl = input.siteUrl?.trim()
  if (!siteUrl) return { outcome: SITE_TYPE_MISMATCH_OUTCOMES.Undetermined }

  try {
    const resolvedSiteType = await getAccountSiteType(
      siteUrl,
      input.protectionBypassExecution,
    )
    if (resolvedSiteType === SITE_TYPES.UNKNOWN) {
      return { outcome: SITE_TYPE_MISMATCH_OUTCOMES.Undetermined }
    }
    if (resolvedSiteType === input.storedSiteType) {
      return { outcome: SITE_TYPE_MISMATCH_OUTCOMES.Agrees }
    }

    return {
      outcome: SITE_TYPE_MISMATCH_OUTCOMES.Mismatch,
      mismatch: {
        storedSiteType: input.storedSiteType,
        suggestedSiteType: resolvedSiteType,
      },
    }
  } catch (error) {
    logger.debug("site type mismatch check failed", { siteUrl, error })
  }

  return { outcome: SITE_TYPE_MISMATCH_OUTCOMES.Undetermined }
}
