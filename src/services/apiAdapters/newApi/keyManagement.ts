import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import {
  INVENTORY_GROUP_KINDS,
  resolveNamedInventoryGroup,
  type InventoryGroupCapability,
  type KeyManagementCapability,
} from "~/services/apiAdapters/contracts/keyManagement"

import { resolveNewApiFamilyTokenTransport } from "./tokenTransport"

export const tokenGroupFollowsAccount = (siteType: AccountSiteType): boolean =>
  siteType !== SITE_TYPES.ONE_API &&
  getAccountSiteDefinition(siteType)?.adapterFamily ===
    ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily

const getInventoryGroupCapability = (
  siteType: AccountSiteType,
): InventoryGroupCapability => {
  if (siteType === SITE_TYPES.ONE_API) {
    // One API tokens have no key-level group field.
    // https://github.com/songquanpeng/one-api/blob/8df4a2670b98266bd287c698243fff327d9748cf/model/token.go#L23-L40
    return {
      resolve: () => ({ kind: INVENTORY_GROUP_KINDS.NotApplicable }),
    }
  }

  if (tokenGroupFollowsAccount(siteType)) {
    // New API-family adapters treat an empty token group as the account/user
    // group. Individual forks may not expose `/api/user/self`; callers retain
    // an explicit unresolved-inherited-group result in that case.
    // https://github.com/QuantumNous/new-api/blob/0ab02020603d22e5613bc4cf46bfab06f8567769/relay/common/relay_info.go#L451-L455
    // https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/web/src/pages/Token/EditToken.js#L520-L537
    // https://anyrouter.top/assets/index-Dultz3N6.js
    // https://github.com/RixAPI/Rix-API/blob/79db6da868aa4e22407a0fbf7d8fb2f123ee0a9a/file/i18n/en.json#L1605-L1606
    return {
      resolve: (token) =>
        resolveNamedInventoryGroup(token, INVENTORY_GROUP_KINDS.FollowsAccount),
    }
  }

  return {
    resolve: (token) =>
      resolveNamedInventoryGroup(token, INVENTORY_GROUP_KINDS.Unknown),
  }
}

/**
 * Create key-management operations bound to the New API-family site type.
 */
export function createNewApiKeyManagement(
  siteType: AccountSiteType,
): KeyManagementCapability {
  const implementation = resolveNewApiFamilyTokenTransport(siteType)

  return {
    fetchTokens: (request) => implementation.fetchAccountTokens(request),
    createToken: (request, tokenData) =>
      implementation.createApiToken(request, tokenData),
    updateToken: ({ request, tokenId, tokenData }) =>
      implementation.updateApiToken(request, tokenId, tokenData),
    resolveTokenKey: ({ request, token }) =>
      implementation.resolveApiTokenKey(request, token),
    deleteToken: ({ request, tokenId }) =>
      implementation.deleteApiToken(request, tokenId),
    fetchAvailableModels: (request) =>
      implementation.fetchAccountAvailableModels(request),
    inventoryGroup: getInventoryGroupCapability(siteType),
    userGroups: {
      fetch: (request) => implementation.fetchUserGroups(request),
    },
  }
}
