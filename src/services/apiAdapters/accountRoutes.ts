import { getAccountSiteApiRouter } from "~/constants/siteType"

import {
  ACCOUNT_BOOTSTRAP_ROUTE_KINDS,
  type AccountBootstrapRouteKind,
  type AccountBootstrapRouteTarget,
} from "./contracts/accountBootstrap"

/**
 * Resolve a declared page path, preserving null for unsupported navigation.
 */
export function resolveStaticAccountRoutePath(
  target: AccountBootstrapRouteTarget,
  route: AccountBootstrapRouteKind,
): string | null {
  const router = getAccountSiteApiRouter(target.siteType)

  switch (route) {
    case ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Login:
      return router.loginPath
    case ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Usage:
      return router.usagePath
    case ACCOUNT_BOOTSTRAP_ROUTE_KINDS.CheckIn:
      return router.checkInPath
    case ACCOUNT_BOOTSTRAP_ROUTE_KINDS.AdminCredentials:
      return router.adminCredentialsPath
    case ACCOUNT_BOOTSTRAP_ROUTE_KINDS.Redeem:
      return router.redeemPath
    case ACCOUNT_BOOTSTRAP_ROUTE_KINDS.SiteAnnouncements:
      return router.siteAnnouncementsPath
  }
}
