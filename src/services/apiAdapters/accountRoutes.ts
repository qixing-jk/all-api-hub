import { getAccountSiteApiRouter } from "~/constants/siteType"

import type {
  AccountBootstrapRouteKind,
  AccountBootstrapRouteTarget,
} from "./contracts/accountBootstrap"

/**
 * Resolve account bootstrap route paths from the existing static site router.
 */
export function resolveStaticAccountRoutePath(
  target: AccountBootstrapRouteTarget,
  route: AccountBootstrapRouteKind,
): string {
  const router = getAccountSiteApiRouter(target.siteType)

  switch (route) {
    case "login":
      return router.loginPath
    case "usage":
      return router.usagePath ?? router.loginPath
    case "checkIn":
      return router.checkInPath ?? router.loginPath
    case "adminCredentials":
      return router.adminCredentialsPath ?? router.loginPath
    case "redeem":
      return router.redeemPath ?? router.loginPath
    case "siteAnnouncements":
      return router.siteAnnouncementsPath ?? router.loginPath
  }
}
