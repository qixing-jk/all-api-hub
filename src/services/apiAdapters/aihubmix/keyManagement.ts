import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import {
  createApiToken,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchUserGroups,
  resolveApiTokenKey,
  updateApiToken,
} from "~/services/apiService/aihubmix"

export const aihubmixKeyManagement: KeyManagementCapability = {
  fetchTokens: (request) => fetchAccountTokens(request),
  createToken: (request, tokenData) => createApiToken(request, tokenData),
  updateToken: ({ request, tokenId, tokenData }) =>
    updateApiToken(request, tokenId, tokenData),
  resolveTokenKey: ({ request, token }) => resolveApiTokenKey(request, token),
  deleteToken: ({ request, tokenId }) => deleteApiToken(request, tokenId),
  // Preserve AIHubMix's explicit FEATURE_UNSUPPORTED group-inventory contract.
  fetchUserGroups: (request) => fetchUserGroups(request),
  fetchAvailableModels: (request) => fetchAccountAvailableModels(request),
}
