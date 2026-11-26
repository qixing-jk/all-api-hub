import {
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import type { AccountBootstrapRouteTarget } from "~/services/apiAdapters/contracts/accountBootstrap"
import { openAccessTokenSiteTab } from "~/services/browsingContext/accessTokenSiteTab"
import { createUserCommandProtectionBypassExecution } from "~/services/protectionBypass/client"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"

/** Resolves and opens the deployment's access-token route using explicit user intent. */
export async function openAccountAccessTokenPage(
  target: AccountBootstrapRouteTarget,
  tab?: Parameters<typeof openAccessTokenSiteTab>[1]["tab"],
): Promise<boolean> {
  const destination = await resolveAccountSiteRouteUrl(
    {
      ...target,
      pageInspectionExecution: createUserCommandProtectionBypassExecution(
        PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
        getCurrentTempWindowRequestSource(),
      ),
    },
    SITE_ROUTE_KINDS.AccessToken,
  )
  if (!destination) return false
  await openAccessTokenSiteTab(destination, { siteType: target.siteType, tab })
  return true
}
