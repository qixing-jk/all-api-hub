import {
  getStaticAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import { resolveAutomaticRedemptionAvailability } from "~/services/redemption/accountSupport"
import type { DisplaySiteData } from "~/types"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

import {
  REDEMPTION_ACCOUNT_SUPPORT_STATUSES,
  type RedemptionAccountCandidate,
} from "./contracts"

/** Adds serializable product support metadata for the content-script picker. */
export function toRedemptionAccountCandidate(
  account: DisplaySiteData,
): RedemptionAccountCandidate {
  const availability = resolveAutomaticRedemptionAvailability(account)
  const manualRedemptionUrl =
    availability.status === REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Unsupported
      ? tryParseHttpUrl(
          getStaticAccountSiteRouteUrl(
            account,
            SITE_ROUTE_KINDS.Redeem,
            account.checkIn?.customCheckIn?.redeemUrl,
          ) ?? "",
        )?.href
      : undefined

  return {
    ...account,
    ...(manualRedemptionUrl ? { manualRedemptionUrl } : {}),
    automaticRedemptionSupport:
      availability.status === REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Supported
        ? { status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Supported }
        : {
            status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Unsupported,
            reason: availability.reason,
          },
  }
}
