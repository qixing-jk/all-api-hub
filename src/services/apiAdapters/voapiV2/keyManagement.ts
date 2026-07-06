import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
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
  fetchTokens: (request, options) =>
    fetchVoApiV2Tokens(request, options?.page, options?.size),
  createToken: (request, tokenData) => createVoApiV2Token(request, tokenData),
  updateToken: ({ request, tokenId, tokenData }) =>
    updateVoApiV2Token(request, tokenId, tokenData),
  resolveTokenKey: ({ request, token }) =>
    resolveVoApiV2TokenKey(request, token),
  deleteToken: ({ request, tokenId }) => deleteVoApiV2Token(request, tokenId),
  fetchAvailableModels: (request) => fetchVoApiV2AvailableModels(request),
  userGroups: {
    fetch: (request) => fetchVoApiV2UserGroups(request),
  },
}
