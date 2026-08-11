import {
  INVENTORY_GROUP_KINDS,
  resolveNamedInventoryGroup,
  type KeyManagementCapability,
} from "~/services/apiAdapters/contracts/keyManagement"
import {
  createVoApiV2Token,
  deleteVoApiV2Token,
  fetchVoApiV2AvailableModels,
  fetchVoApiV2Tokens,
  fetchVoApiV2UserGroups,
  resolveVoApiV2TokenKey,
  updateVoApiV2Token,
} from "~/services/apiService/voapiV2"

export const voApiV2KeyManagement: KeyManagementCapability = {
  fetchTokens: (request) => fetchVoApiV2Tokens(request),
  createToken: (request, tokenData) => createVoApiV2Token(request, tokenData),
  updateToken: ({ request, tokenId, tokenData }) =>
    updateVoApiV2Token(request, tokenId, tokenData),
  resolveTokenKey: ({ request, token }) =>
    resolveVoApiV2TokenKey(request, token),
  deleteToken: ({ request, tokenId }) => deleteVoApiV2Token(request, tokenId),
  fetchAvailableModels: (request) => fetchVoApiV2AvailableModels(request),
  // VoAPI v2 key creation requires a group selection, so a missing group name
  // in inventory cannot be interpreted as an ungrouped key.
  // https://demo.voapi.top/assets/keys-BUkrbzdE.js
  inventoryGroup: {
    resolve: (token) =>
      resolveNamedInventoryGroup(token, INVENTORY_GROUP_KINDS.Unavailable),
  },
  userGroups: {
    fetch: (request) => fetchVoApiV2UserGroups(request),
  },
}
