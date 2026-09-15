import {
  reconcileAccountKeyInventory,
  type AccountKeyInventoryReconciliationResult,
} from "~/services/accounts/accountKeyInventoryReconciliation"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { SiteAccount } from "~/types"

/**
 * Fills the provider's missing key requirements using the same native inventory
 * reconciliation as manual key checks. Null means automatic provisioning is unavailable.
 */
export async function ensureAllGroupKeysForAccount(
  account: SiteAccount,
): Promise<AccountKeyInventoryReconciliationResult | null> {
  const keyResourceManagement = getSiteTypeCapabilities(account.site_type)
    .account?.keyResourceManagement
  if (!keyResourceManagement) return null

  const { request } = createAccountApiRequestFromStoredAccount(account)
  const session = await keyResourceManagement.open({
    account: {
      id: account.id,
      name: account.site_name,
      siteType: account.site_type,
    },
    request,
  })
  if (!session.provisioning) return null

  return reconcileAccountKeyInventory(session, {
    renameSuggestedResources: false,
  })
}
