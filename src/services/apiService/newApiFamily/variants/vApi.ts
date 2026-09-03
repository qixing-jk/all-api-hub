import type { UserGroupInfo } from "~/services/accountTokens/tokenProvisioningModel"
import { fetchAccountAvailableModels as fetchLegacyAccountAvailableModels } from "~/services/apiService/newApiFamily/default/keyManagement"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

const CURRENT_AVAILABLE_MODELS_ENDPOINT = "/api/user/available_models"
const USER_GROUPS_ENDPOINT = "/api/user/self/groups"

const isMissingCurrentEndpoint = (error: unknown): error is ApiError =>
  error instanceof ApiError &&
  (error.statusCode === 404 || error.statusCode === 405)

const normalizeUserGroupInfo = (
  groupName: string,
  value: unknown,
): UserGroupInfo => {
  if (
    isRecord(value) &&
    typeof value.desc === "string" &&
    typeof value.ratio === "number" &&
    Number.isFinite(value.ratio)
  ) {
    return { desc: value.desc, ratio: value.ratio }
  }

  if (typeof value === "string") {
    const [rawDescription, rawRatioLabel] = value.split("=")
    const ratioMatch = rawRatioLabel
      ?.trim()
      .match(/^x\s*(\d+(?:\.\d+)?)\s*倍?$/i)
    const description = rawDescription?.trim()
    const ratio = ratioMatch ? Number(ratioMatch[1]) : Number.NaN

    if (description && Number.isFinite(ratio)) {
      return { desc: description, ratio }
    }
  }

  throw new TypeError(`Invalid V-API metadata for group ${groupName}`)
}

/** Fetch the models that the current V-API account may assign to a key. */
export const fetchAccountAvailableModels = async (
  request: ApiServiceRequest,
): Promise<string[]> => {
  // https://gpt.ge/api/user/available_models is the current V-API user-facing
  // endpoint; `/api/user/models` is permission-gated on this generation. Keep
  // the legacy New API-family endpoint as a read-only compatibility fallback.
  try {
    return await newApiFamilyRequests.data<string[]>(request, {
      endpoint: CURRENT_AVAILABLE_MODELS_ENDPOINT,
    })
  } catch (currentEndpointError) {
    if (!isMissingCurrentEndpoint(currentEndpointError)) {
      throw currentEndpointError
    }

    try {
      return await fetchLegacyAccountAvailableModels(request)
    } catch {
      throw currentEndpointError
    }
  }
}

/** Fetch and normalize the groups that the current V-API account may assign. */
export const fetchUserGroups = async (
  request: ApiServiceRequest,
): Promise<Record<string, UserGroupInfo>> => {
  // The current deployment returns `description=x N倍` strings, while older
  // V-API-compatible deployments return New API-style `{ desc, ratio }` values:
  // https://gpt.ge/api/user/self/groups
  const rawGroups = await newApiFamilyRequests.data<unknown>(request, {
    endpoint: USER_GROUPS_ENDPOINT,
  })
  if (!isRecord(rawGroups)) {
    throw new TypeError("Invalid V-API user group payload")
  }

  return Object.fromEntries(
    Object.entries(rawGroups).map(([groupName, value]) => [
      groupName,
      normalizeUserGroupInfo(groupName, value),
    ]),
  )
}
