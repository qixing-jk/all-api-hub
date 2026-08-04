import {
  INVENTORY_SECRET_AVAILABILITIES,
  type KeyManagementCapability,
} from "~/services/apiAdapters/contracts/keyManagement"
import {
  createApiToken,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  resolveApiTokenKey,
  updateApiToken,
} from "~/services/apiService/aihubmix"

export const aihubmixKeyManagement: KeyManagementCapability = {
  // AIHubMix lists saved keys as masked values with no reveal route; the full
  // secret is available only in the create response. https://docs.aihubmix.com/en/api/Cli
  inventorySecretAvailability:
    INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
  fetchTokens: (request) => fetchAccountTokens(request),
  createToken: (request, tokenData) => createApiToken(request, tokenData),
  updateToken: ({ request, tokenId, tokenData }) =>
    updateApiToken(request, tokenId, tokenData),
  resolveTokenKey: ({ request, token }) => resolveApiTokenKey(request, token),
  deleteToken: ({ request, tokenId }) => deleteApiToken(request, tokenId),
  fetchAvailableModels: (request) => fetchAccountAvailableModels(request),
}
