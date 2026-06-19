import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import {
  createApiToken,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
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
  fetchAvailableModels: (request) => fetchAccountAvailableModels(request),
}
