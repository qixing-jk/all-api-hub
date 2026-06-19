import { getAccountSiteApiRouter } from "~/constants/siteType"

import {
  ACCOUNT_BOOTSTRAP_ROUTE_KINDS,
  type AccountBootstrapRouteKind,
  type AccountBootstrapRouteTarget,
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
    case ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Login:
      return router.loginPath
    case ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Usage:
      return router.usagePath ?? router.loginPath
    case ACCOUNT_BOOTSTRAP_ROUTE_KINDS.CheckIn:
      return router.checkInPath ?? router.loginPath
    case ACCOUNT_BOOTSTRAP_ROUTE_KINDS.AdminCredentials:
      return router.adminCredentialsPath ?? router.loginPath
    case ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Redeem:
      return router.redeemPath ?? router.loginPath
    case ACCOUNT_BOOTSTRAP_ROUTE_KINDS.SiteAnnouncements:
      return router.siteAnnouncementsPath ?? router.loginPath
  }
}
