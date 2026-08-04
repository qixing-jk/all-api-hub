import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  INVENTORY_GROUP_KINDS,
  resolveNamedInventoryGroup,
  type InventoryGroupCapability,
  type KeyManagementCapability,
} from "~/services/apiAdapters/contracts/keyManagement"
import * as keyManagement from "~/services/apiService/newApiFamily/default/keyManagement"
import * as oneHub from "~/services/apiService/newApiFamily/variants/oneHub"
import * as wong from "~/services/apiService/newApiFamily/variants/wong"

type KeyManagementImplementation =
  typeof keyManagement.defaultKeyManagementImplementation

const oneHubKeyManagementOverrides: Partial<KeyManagementImplementation> = {
  fetchAccountTokens: oneHub.fetchAccountTokens,
  fetchUserGroups: oneHub.fetchUserGroups,
  fetchAccountAvailableModels: oneHub.fetchAccountAvailableModels,
}

const keyManagementOverrides: Partial<
  Record<AccountSiteType, Partial<KeyManagementImplementation>>
> = {
  [SITE_TYPES.ONE_HUB]: oneHubKeyManagementOverrides,
  [SITE_TYPES.DONE_HUB]: oneHubKeyManagementOverrides,
  [SITE_TYPES.WONG_GONGYI]: {
    resolveApiTokenKey: wong.resolveApiTokenKey,
  },
}

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

  if (
    siteType === SITE_TYPES.NEW_API ||
    siteType === SITE_TYPES.VELOERA ||
    siteType === SITE_TYPES.ANYROUTER ||
    siteType === SITE_TYPES.RIX_API
  ) {
    // These token editors treat an empty selection as the account/user group.
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
  const implementation = {
    ...keyManagement.defaultKeyManagementImplementation,
    ...keyManagementOverrides[siteType],
  }

  return {
    fetchTokens: (request, options) =>
      implementation.fetchAccountTokens(request, options?.page, options?.size),
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
