import type { AccountSiteType } from "~/constants/siteType"
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import { keyManagement } from "~/services/apiService/newApiFamily"

/**
 * Create key-management operations bound to the New API-family site type.
 */
export function createNewApiKeyManagement(
  siteType: AccountSiteType,
): KeyManagementCapability {
  const implementation =
    keyManagement.createKeyManagementImplementation(siteType)

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
