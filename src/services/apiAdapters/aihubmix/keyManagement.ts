import {
  INVENTORY_GROUP_KINDS,
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
  // AIHubMix's key create/update DTOs do not define a key-level group.
  // https://github.com/AIhubmix/platfrom-cli/blob/d83dbc139a82619333d5b0f557a8350b42b03583/internal/api/endpoints.go#L105-L152
  inventoryGroup: {
    resolve: () => ({ kind: INVENTORY_GROUP_KINDS.NotApplicable }),
  },
  fetchTokens: (request) => fetchAccountTokens(request),
  createToken: (request, tokenData) => createApiToken(request, tokenData),
  updateToken: ({ request, tokenId, tokenData }) =>
    updateApiToken(request, tokenId, tokenData),
  resolveTokenKey: ({ request, token }) => resolveApiTokenKey(request, token),
  deleteToken: ({ request, tokenId }) => deleteApiToken(request, tokenId),
  fetchAvailableModels: (request) => fetchAccountAvailableModels(request),
}
