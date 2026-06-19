import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import {
  createApiToken,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchUserGroups,
  resolveApiTokenKey,
} from "~/services/apiService/aihubmix"

export const aihubmixKeyManagement: KeyManagementCapability = {
  fetchTokens: (request) => fetchAccountTokens(request),
  createToken: (request, tokenData) => createApiToken(request, tokenData),
  resolveTokenKey: ({ request, token }) => resolveApiTokenKey(request, token),
  deleteToken: ({ request, tokenId }) => deleteApiToken(request, tokenId),
  fetchUserGroups: (request) => fetchUserGroups(request),
  fetchAvailableModels: (request) => fetchAccountAvailableModels(request),
}
