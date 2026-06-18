import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import {
  createApiToken,
  fetchAccountTokens,
  resolveApiTokenKey,
} from "~/services/apiService/sub2api"

export const sub2ApiKeyManagement: KeyManagementCapability = {
  fetchTokens: (request, options) =>
    fetchAccountTokens(request, options?.page, options?.size),
  createToken: (request, tokenData) => createApiToken(request, tokenData),
  resolveTokenKey: ({ request, token }) => resolveApiTokenKey(request, token),
}
