import { canResolveAccountRuntimeKeySecret } from "~/services/accounts/keyProductCapabilities"
import type { DisplaySiteData } from "~/types"

/**
 * Returns account sources that are active and can expose a runtime key secret.
 */
export function getGatewayGuidanceImportableAccounts(
  accounts: DisplaySiteData[],
): DisplaySiteData[] {
  return accounts.filter(
    (account) =>
      account.disabled !== true && canResolveAccountRuntimeKeySecret(account),
  )
}
