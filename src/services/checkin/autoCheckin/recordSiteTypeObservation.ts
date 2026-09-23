import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import {
  checkSiteTypeMismatch,
  SITE_TYPE_MISMATCH_OUTCOMES,
} from "~/services/siteDetection/siteTypeMismatch"
import { siteTypeObservations } from "~/services/siteDetection/siteTypeObservations"
import type { SiteAccount } from "~/types"
import {
  isSiteTypeRelatedSkipReason,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("SiteTypeObservation")

type MismatchChecker = typeof checkSiteTypeMismatch

interface RecordSiteTypeObservationOptions {
  /**
   * The bypass context of the run this result came from, so a shielded site still
   * answers its probe. Whether it applies stays the bypass policy's call.
   */
  protectionBypassExecution?: ProtectionBypassExecution
  /** Test seam: the reading to use instead of detection. */
  checkMismatch?: MismatchChecker
}

/**
 * Keeps the recorded site-type advice in step with a check-in result.
 *
 * A failure a wrong site type explains records the type the site resolves to; a
 * reading that agrees with the stored type retires what an earlier result
 * recorded. Either way the record is advice other features read, and it never
 * changes the run's outcome. Failures with their own cause (auth, credentials,
 * network, permission, manual verification) are not probed, so the advice cannot
 * attach to them.
 */
export async function recordSiteTypeObservationForResult(
  account: Pick<SiteAccount, "id" | "site_url" | "site_type">,
  result: CheckinAccountResult,
  options: RecordSiteTypeObservationOptions = {},
): Promise<void> {
  if (!result.reasonCode || !isSiteTypeRelatedSkipReason(result.reasonCode)) {
    return
  }

  const { protectionBypassExecution, checkMismatch = checkSiteTypeMismatch } =
    options

  try {
    const check = await checkMismatch({
      siteUrl: account.site_url,
      storedSiteType: account.site_type,
      ...(protectionBypassExecution ? { protectionBypassExecution } : {}),
    })
    if (check.outcome === SITE_TYPE_MISMATCH_OUTCOMES.Mismatch) {
      await siteTypeObservations.record({
        accountId: account.id,
        mismatch: check.mismatch,
      })
      return
    }
    if (check.outcome === SITE_TYPE_MISMATCH_OUTCOMES.Agrees) {
      await siteTypeObservations.clear(account.id, account.site_type)
    }
  } catch (error) {
    logger.debug("site type observation skipped", { error })
  }
}
