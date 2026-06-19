import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import {
  createApiToken,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchUserGroups,
  resolveApiTokenKey,
  updateApiToken,
} from "~/services/apiService/sub2api"

export const sub2ApiKeyManagement: KeyManagementCapability = {
  fetchTokens: (request, options) =>
    fetchAccountTokens(request, options?.page, options?.size),
  createToken: (request, tokenData) => createApiToken(request, tokenData),
  updateToken: ({ request, tokenId, tokenData }) =>
    updateApiToken(request, tokenId, tokenData),
  resolveTokenKey: ({ request, token }) => resolveApiTokenKey(request, token),
  deleteToken: ({ request, tokenId }) => deleteApiToken(request, tokenId),
  fetchUserGroups: (request) => fetchUserGroups(request),
  fetchAvailableModels: (request) => fetchAccountAvailableModels(request),
}
