import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import {
  API_OPERATION_SEMANTICS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

export const HOG_AIRDROP_ENDPOINTS = {
  List: "/api/welfare-airdrop/",
  History: "/api/welfare-airdrop/my-claims",
} as const

export interface HogAirdropCampaign {
  id: number
  quota: number
  endTime: number
}

export interface HogAirdropClaim {
  id: number
  airdropId: number
  quota: number
  createdTime: number
}

const integerAtLeast = (value: unknown, minimum: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum

const invalid = () => new Error("Invalid Hog welfare airdrop response")
const requestOptions = {
  currentTabTransport: "disabled" as const,
  tempWindowFallback: { codes: [], statusCodes: [] },
}
const withoutRecovery = (request: ApiServiceRequest): ApiServiceRequest => ({
  ...request,
  allowAccountCredentialRecovery: false,
})

/** Only active, explicitly eligible, one-per-account free campaigns qualify. */
export async function fetchHogClaimableAirdrops(request: ApiServiceRequest) {
  const response = await newApiFamilyRequests.envelope<unknown>(
    withoutRecovery(request),
    {
      ...requestOptions,
      endpoint: HOG_AIRDROP_ENDPOINTS.List,
      options: { method: "GET", cache: "no-store" },
    },
  )
  if (response.success !== true || !Array.isArray(response.data))
    throw invalid()

  const seen = new Set<number>()
  const eligible: { id: number; quota: number; endTime: number }[] = []
  const now = Math.floor(Date.now() / 1000)
  for (const item of response.data) {
    if (
      !isRecord(item) ||
      !integerAtLeast(item.id, 1) ||
      seen.has(item.id) ||
      typeof item.canClaim !== "boolean" ||
      typeof item.unlimited !== "boolean" ||
      !integerAtLeast(item.claimedByMe, 0) ||
      !integerAtLeast(item.perUserLimit, 1) ||
      !integerAtLeast(item.remaining, 0)
    )
      throw invalid()
    seen.add(item.id)
    if (!item.canClaim || item.perUserLimit !== 1) continue
    if (
      item.state !== "active" ||
      item.claimedByMe !== 0 ||
      !integerAtLeast(item.quota, 1) ||
      !integerAtLeast(item.startTime, 0) ||
      !integerAtLeast(item.endTime, 0) ||
      item.startTime > now ||
      item.endTime < now ||
      (!item.unlimited && item.remaining === 0)
    )
      throw invalid()
    eligible.push({ id: item.id, quota: item.quota, endTime: item.endTime })
  }
  return eligible
}

/** Project only the public claim facts, discarding the returned redemption key. */
function parseClaim(data: unknown) {
  if (
    !isRecord(data) ||
    !integerAtLeast(data.id, 1) ||
    !integerAtLeast(data.airdropId, 1) ||
    !integerAtLeast(data.quota, 1) ||
    !integerAtLeast(data.createdTime, 1)
  )
    throw invalid()
  return {
    id: data.id,
    airdropId: data.airdropId,
    quota: data.quota,
    createdTime: data.createdTime,
  }
}

/** Read the signed-in account's own claims without exposing redemption keys. */
export async function fetchHogAirdropClaims(request: ApiServiceRequest) {
  const response = await newApiFamilyRequests.envelope<unknown>(
    withoutRecovery(request),
    {
      ...requestOptions,
      endpoint: HOG_AIRDROP_ENDPOINTS.History,
      options: { method: "GET", cache: "no-store" },
    },
  )
  if (response.success !== true || !Array.isArray(response.data))
    throw invalid()
  return response.data.map(parseClaim)
}

/** Send one campaign claim; the transport must not replay or fall back. */
export async function performHogAirdropClaim(
  request: ApiServiceRequest,
  airdropId: number,
  observer?: ApiServiceRequest["observer"],
) {
  if (!integerAtLeast(airdropId, 1)) throw invalid()
  const response = await newApiFamilyRequests.envelope<unknown>(
    withoutRecovery({ ...request, ...(observer ? { observer } : {}) }),
    {
      ...requestOptions,
      endpoint: `/api/welfare-airdrop/claim/${airdropId}`,
      operationSemantics: API_OPERATION_SEMANTICS.Mutation,
      options: { method: "POST", cache: "no-store", body: "{}" },
    },
  )
  if (response.success !== true) throw invalid()
  return parseClaim(response.data)
}
