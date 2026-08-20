import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { TokenProvisioningCapability } from "~/services/apiAdapters/contracts/tokenProvisioning"
import { resolveRequiredGroupDefaultTokenCreation } from "~/services/apiAdapters/tokenProvisioning/requiredGroup"
import { defaultTokenProvisioning } from "~/services/apiService/newApiFamily/default/tokenProvisioning"

const createModelFlareTokenProvisioning = (): TokenProvisioningCapability => ({
  ...defaultTokenProvisioning,
  resolveDefaultTokenCreation(request) {
    // ModelFlare rejects empty and legacy `default` groups, exposing the valid
    // choices through /api/user/self/groups instead: https://modelflare.dev/
    const defaultTokenData = {
      ...request.defaultTokenData,
      remain_quota: request.defaultTokenData.unlimited_quota
        ? -1
        : request.defaultTokenData.remain_quota,
    }

    return resolveRequiredGroupDefaultTokenCreation({
      ...request,
      defaultTokenData,
    })
  },
})

export const createNewApiTokenProvisioning = (
  siteType: AccountSiteType = SITE_TYPES.NEW_API,
): TokenProvisioningCapability =>
  siteType === SITE_TYPES.MODELFLARE
    ? createModelFlareTokenProvisioning()
    : defaultTokenProvisioning
