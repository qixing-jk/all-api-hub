import type { AccountSiteType } from "~/constants/siteType"
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import { getApiService } from "~/services/apiService"

/**
 * Create key-management operations bound to the New API-family site type.
 */
export function createNewApiKeyManagement(
  siteType: AccountSiteType,
): KeyManagementCapability {
  return {
    fetchTokens: (request, options) =>
      getApiService(siteType).fetchAccountTokens(
        request,
        options?.page,
        options?.size,
      ),
    createToken: (request, tokenData) =>
      getApiService(siteType).createApiToken(request, tokenData),
    resolveTokenKey: ({ request, token }) =>
      getApiService(siteType).resolveApiTokenKey(request, token),
  }
}
