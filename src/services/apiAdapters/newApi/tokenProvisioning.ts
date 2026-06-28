import type { AccountSiteType } from "~/constants/siteType"
import type { TokenProvisioningCapability } from "~/services/apiAdapters/contracts/tokenProvisioning"
import { tokenProvisioning } from "~/services/apiService/newApiFamily"

export const createNewApiTokenProvisioning = (
  siteType: AccountSiteType,
): TokenProvisioningCapability =>
  tokenProvisioning.createTokenProvisioningImplementation(siteType)
