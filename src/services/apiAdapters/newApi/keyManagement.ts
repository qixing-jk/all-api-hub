import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
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
    userGroups: {
      fetch: (request) => implementation.fetchUserGroups(request),
    },
  }
}
