import { normalizeApiTokenKeyValue } from "~/services/accountTokens/apiTokenKey"
import { resolveApiTokenKeyWithFetcher } from "~/services/accountTokens/tokenKeyResolver"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ApiToken } from "~/types"

/**
 * Fetches a New API-family token secret through its explicit reveal endpoint.
 * New API uses POST and returns `{ success, message, data: { key } }`.
 * https://github.com/QuantumNous/new-api/blob/32c261923a9786c64d2af087327ef057e7bde7e3/router/api-router.go#L255-L262
 * https://github.com/QuantumNous/new-api/blob/32c261923a9786c64d2af087327ef057e7bde7e3/controller/token.go#L188-L202
 */
export async function fetchTokenSecretKeyById(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<string> {
  const response = await newApiFamilyRequests.data<{ key?: string }>(request, {
    endpoint: `/api/token/${tokenId}/key`,
    options: { method: "POST" },
  })

  const normalizedKey = normalizeApiTokenKeyValue(response?.key ?? "")
  if (!normalizedKey) {
    throw new Error("token_secret_key_missing")
  }

  return normalizedKey
}

/** Resolves a usable New API-family token key through the shared cache. */
export async function resolveApiTokenKey(
  request: ApiServiceRequest,
  token: Pick<ApiToken, "id" | "key">,
): Promise<string> {
  return await resolveApiTokenKeyWithFetcher(
    request,
    token,
    fetchTokenSecretKeyById,
  )
}
