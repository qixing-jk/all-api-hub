import {
  fetchNovitaKeys,
  fetchNovitaUserInfo,
} from "~/services/apiService/novita"
import {
  encodeNovitaConsoleCredential,
  parseNovitaCredentials,
} from "~/services/apiService/novita/constants"
import { fetchNovitaData } from "~/services/apiService/novita/transport"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

export type NovitaModelPolicy = {
  schemaVersion: 1
  productScope: "model_api"
  mode: "all_enabled" | "selected"
  allowedModels: { type: string; id: string }[]
  excludedModels: { type: string; id: string }[]
}

const invalidPolicy = () =>
  new ApiError(
    "Invalid Novita policy response",
    undefined,
    undefined,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/** Hydrates the full model policy and rejects unknown writable representations. */
export async function fetchNovitaModelPolicy(
  request: ApiServiceRequest,
  id: string,
): Promise<NovitaModelPolicy> {
  const result = await fetchNovitaData<unknown>(
    request,
    `/v2/user/key/${encodeURIComponent(id)}/model-access-policy`,
  )
  if (!isRecord(result) || result.stringId !== id || !isRecord(result.policy))
    throw invalidPolicy()
  const policy = result.policy
  if (
    policy.schemaVersion !== 1 ||
    policy.productScope !== "model_api" ||
    !["all_enabled", "selected"].includes(String(policy.mode))
  )
    throw invalidPolicy()
  for (const field of ["allowedModels", "excludedModels"]) {
    if (
      !Array.isArray(policy[field]) ||
      !policy[field].every(
        (item) =>
          isRecord(item) &&
          item.type === "llm" &&
          typeof item.id === "string" &&
          item.id.trim(),
      )
    )
      throw invalidPolicy()
  }
  return {
    schemaVersion: 1,
    productScope: "model_api",
    mode: policy.mode as NovitaModelPolicy["mode"],
    allowedModels: policy.allowedModels as NovitaModelPolicy["allowedModels"],
    excludedModels:
      policy.excludedModels as NovitaModelPolicy["excludedModels"],
  }
}

/** Reads the complete IP allowlist, including an explicit unrestricted list. */
export async function fetchNovitaAllowedIps(
  request: ApiServiceRequest,
  id: string,
): Promise<string[]> {
  const result = await fetchNovitaData<unknown>(
    request,
    `/v2/user/key/${encodeURIComponent(id)}/ip-access-policy`,
  )
  if (
    !isRecord(result) ||
    result.stringId !== id ||
    !isRecord(result.policy) ||
    !Array.isArray(result.policy.allowedIps) ||
    !result.policy.allowedIps.every((ip) => typeof ip === "string")
  )
    throw invalidPolicy()
  return result.policy.allowedIps as string[]
}

/** The native policy uses modelName, while modelId is unrelated inventory metadata. */
export async function fetchNovitaManagementModels(request: ApiServiceRequest) {
  const result = await fetchNovitaData<unknown>(
    request,
    "/v1/user/whitelist/available-llm-models",
  )
  if (!isRecord(result) || !Array.isArray(result.models)) throw invalidPolicy()
  return result.models.map((model) => {
    if (
      !isRecord(model) ||
      typeof model.modelId !== "string" ||
      typeof model.modelName !== "string"
    )
      throw invalidPolicy()
    return { value: model.modelName, displayLabel: model.modelName }
  })
}

/** Renames a native key without replacing its independent access policies. */
export async function updateNovitaKeyName(
  request: ApiServiceRequest,
  stringId: string,
  name: string,
) {
  await fetchNovitaData(request, "/v2/user/key", {
    method: "PUT",
    body: { name, stringId },
  })
}

/** Replaces only the selected key's model-access policy. */
export async function setNovitaModelPolicy(
  request: ApiServiceRequest,
  id: string,
  policy: NovitaModelPolicy,
) {
  await fetchNovitaData(
    request,
    `/v2/user/key/${encodeURIComponent(id)}/model-access-policy`,
    { method: "PUT", body: policy },
  )
}

/** Updates the IP policy, or removes it to restore unrestricted access. */
export async function setNovitaAllowedIps(
  request: ApiServiceRequest,
  id: string,
  allowedIps: readonly string[],
) {
  await fetchNovitaData(
    request,
    `/v2/user/key/${encodeURIComponent(id)}/ip-access-policy`,
    allowedIps.length
      ? { method: "PUT", body: { allowedIps } }
      : { method: "DELETE" },
  )
}

/** Deletes a native key; callers verify authoritative absence afterward. */
export async function deleteNovitaKey(request: ApiServiceRequest, id: string) {
  await fetchNovitaData(request, `/v2/user/key/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
}

/** Check the saved bearer against its expected identity before admitting writes. */
export async function verifyNovitaManagementIdentity(
  request: ApiServiceRequest,
  consoleOnly = false,
) {
  const expected = String(request.auth.userId ?? "").trim()
  const { consoleToken } = parseNovitaCredentials(request.auth.accessToken)
  const identityRequest =
    consoleOnly && consoleToken
      ? {
          ...request,
          auth: {
            ...request.auth,
            accessToken: encodeNovitaConsoleCredential(consoleToken),
          },
        }
      : request
  if (
    !expected ||
    (await fetchNovitaUserInfo(identityRequest)).id !== expected
  ) {
    throw new ApiError(
      "Novita account identity mismatch",
      undefined,
      undefined,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  }
}

/** Issues one creation request and validates its one-time plaintext result. */
export async function createNovitaKey(
  request: ApiServiceRequest,
  input: { name: string; expireTime: string },
) {
  const result = await fetchNovitaData<{ id: string; apiKey: string }>(
    request,
    "/v2/user/key",
    { method: "POST", body: input },
  )
  if (
    typeof result?.id !== "string" ||
    !result.id.trim() ||
    typeof result.apiKey !== "string" ||
    !result.apiKey.startsWith("sk_")
  ) {
    throw new ApiError(
      "Invalid Novita create response",
      undefined,
      undefined,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }
  return result
}

/** Resolves a native key by its provider-owned string identifier. */
export async function findNovitaKey(
  request: ApiServiceRequest,
  stringId: string,
) {
  return (await fetchNovitaKeys(request)).find(
    (key) => key.stringId === stringId,
  )
}
