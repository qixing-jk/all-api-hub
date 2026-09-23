import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { resolveSiteTypeMismatch } from "~/services/siteDetection/siteTypeMismatch"
import { siteTypeObservations } from "~/services/siteDetection/siteTypeObservations"
import type { SiteAccount } from "~/types"
import {
  isSiteTypeRelatedSkipReason,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("SiteTypeObservation")

type MismatchResolver = typeof resolveSiteTypeMismatch

interface RecordSiteTypeObservationOptions {
  /**
   * The bypass context of the run this result came from, so a shielded site still
   * answers its probe. Whether it applies stays the bypass policy's call.
   */
  protectionBypassExecution?: ProtectionBypassExecution
  /** Test seam: the probe to use instead of detection. */
  resolveMismatch?: MismatchResolver
}

/**
 * Records the type a site resolves to when a check-in failed for a reason a
 * wrong site type explains.
 *
 * The record is advice other features read; it never changes the run's outcome.
 * Failures with their own cause (auth, credentials, network, permission, manual
 * verification) are not probed, so the advice cannot attach to them.
 */
export async function recordSiteTypeObservationForResult(
  account: Pick<SiteAccount, "id" | "site_url" | "site_type">,
  result: CheckinAccountResult,
  options: RecordSiteTypeObservationOptions = {},
): Promise<void> {
  if (!result.reasonCode || !isSiteTypeRelatedSkipReason(result.reasonCode)) {
    return
  }

  const {
    protectionBypassExecution,
    resolveMismatch = resolveSiteTypeMismatch,
  } = options

  try {
    const mismatch = await resolveMismatch({
      siteUrl: account.site_url,
      storedSiteType: account.site_type,
      ...(protectionBypassExecution ? { protectionBypassExecution } : {}),
    })
    if (!mismatch) return

    await siteTypeObservations.record({ accountId: account.id, mismatch })
  } catch (error) {
    logger.debug("site type observation skipped", { error })
  }
}
