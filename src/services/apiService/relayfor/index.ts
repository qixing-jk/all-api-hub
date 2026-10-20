import { RELAYFOR_ENDPOINTS } from "~/services/apiService/relayfor/constants"
import {
  isRelayForAnnouncement,
  isRelayForCheckInCampaignList,
  isRelayForCheckInClaimResult,
  isRelayForModelList,
  isRelayForOverview,
  isRelayForToken,
  isRelayForTokenList,
  isRelayForUser,
} from "~/services/apiService/relayfor/parsing"
import { fetchRelayForData } from "~/services/apiService/relayfor/transport"
import type {
  RelayForAnnouncement,
  RelayForCheckInCampaign,
  RelayForCheckInClaimResult,
  RelayForModelListResponse,
  RelayForOverview,
  RelayForToken,
  RelayForTokenCreateRequest,
  RelayForTokenUpdateRequest,
  RelayForUser,
} from "~/services/apiService/relayfor/type"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { t } from "~/utils/i18n/core"

export * from "~/services/apiService/relayfor/constants"
export * from "~/services/apiService/relayfor/parsing"
export * from "~/services/apiService/relayfor/responseError"
export * from "~/services/apiService/relayfor/transport"
export * from "~/services/apiService/relayfor/type"

/**
 * Fetches user profile for the authenticated RelayFor account.
 */
export async function fetchRelayForUserInfo(
  request: ApiServiceRequest,
): Promise<RelayForUser> {
  const data = await fetchRelayForData<unknown>(
    request,
    RELAYFOR_ENDPOINTS.self,
    { method: "GET" },
  )
  if (!isRelayForUser(data)) {
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      undefined,
      RELAYFOR_ENDPOINTS.self,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }
  return data
}

/**
 * Fetches overview metrics and user balance for RelayFor.
 */
export async function fetchRelayForOverview(
  request: ApiServiceRequest,
): Promise<RelayForOverview> {
  const data = await fetchRelayForData<unknown>(
    request,
    RELAYFOR_ENDPOINTS.overview,
    { method: "GET" },
  )
  if (!isRelayForOverview(data)) {
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      undefined,
      RELAYFOR_ENDPOINTS.overview,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }
  return data
}

/**
 * Lists API tokens configured on the RelayFor account.
 */
export async function fetchRelayForTokens(
  request: ApiServiceRequest,
): Promise<RelayForToken[]> {
  const data = await fetchRelayForData<unknown>(
    request,
    RELAYFOR_ENDPOINTS.tokens,
    { method: "GET" },
  )
  if (!isRelayForTokenList(data)) {
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      undefined,
      RELAYFOR_ENDPOINTS.tokens,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }
  return data
}

/**
 * Creates a new API token for the RelayFor account.
 */
export async function createRelayForToken(
  request: ApiServiceRequest,
  payload: RelayForTokenCreateRequest,
): Promise<RelayForToken> {
  const data = await fetchRelayForData<unknown>(
    request,
    RELAYFOR_ENDPOINTS.tokens,
    {
      method: "POST",
      body: payload,
    },
  )
  if (!isRelayForToken(data)) {
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      undefined,
      RELAYFOR_ENDPOINTS.tokens,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }
  return data
}

/**
 * Updates an existing API token by ID.
 */
export async function updateRelayForToken(
  request: ApiServiceRequest,
  id: number | string,
  payload: RelayForTokenUpdateRequest,
): Promise<void> {
  await fetchRelayForData<unknown>(
    request,
    RELAYFOR_ENDPOINTS.tokenDetail(id),
    {
      method: "PUT",
      body: payload,
    },
  )
}

/**
 * Rotates an API token's key by ID.
 */
export async function rotateRelayForToken(
  request: ApiServiceRequest,
  id: number | string,
): Promise<{ key: string }> {
  const data = await fetchRelayForData<{ key: string }>(
    request,
    RELAYFOR_ENDPOINTS.tokenRotate(id),
    { method: "POST" },
  )
  if (!data || typeof data.key !== "string") {
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      undefined,
      RELAYFOR_ENDPOINTS.tokenRotate(id),
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }
  return data
}

/**
 * Deletes an API token by ID.
 */
export async function deleteRelayForToken(
  request: ApiServiceRequest,
  id: number | string,
): Promise<void> {
  await fetchRelayForData<unknown>(
    request,
    RELAYFOR_ENDPOINTS.tokenDetail(id),
    { method: "DELETE" },
  )
}

/**
 * Fetches available models and pricing rules from RelayFor.
 */
export async function fetchRelayForModels(
  request: ApiServiceRequest,
): Promise<RelayForModelListResponse> {
  const data = await fetchRelayForData<unknown>(
    request,
    RELAYFOR_ENDPOINTS.models,
    { method: "GET" },
  )
  if (!isRelayForModelList(data)) {
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      undefined,
      RELAYFOR_ENDPOINTS.models,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }
  return data
}

/**
 * Fetches active check-in campaigns for the account.
 */
export async function fetchRelayForCheckInCampaigns(
  request: ApiServiceRequest,
): Promise<RelayForCheckInCampaign[]> {
  const data = await fetchRelayForData<unknown>(
    request,
    RELAYFOR_ENDPOINTS.checkinCampaigns,
    { method: "GET" },
  )
  if (!isRelayForCheckInCampaignList(data)) {
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      undefined,
      RELAYFOR_ENDPOINTS.checkinCampaigns,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }
  return data
}

/**
 * Claims a daily check-in or makeup for a campaign day.
 */
export async function claimRelayForCheckIn(
  request: ApiServiceRequest,
  campaignId: number | string,
  date: string,
): Promise<RelayForCheckInClaimResult> {
  const endpoint = RELAYFOR_ENDPOINTS.checkinClaim(campaignId)
  const data = await fetchRelayForData<unknown>(request, endpoint, {
    method: "POST",
    body: { date },
  })
  if (!isRelayForCheckInClaimResult(data)) {
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      undefined,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }
  return data
}

/**
 * Fetches the site announcement.
 */
export async function fetchRelayForAnnouncement(
  request: ApiServiceRequest,
): Promise<RelayForAnnouncement> {
  const data = await fetchRelayForData<unknown>(
    request,
    RELAYFOR_ENDPOINTS.announcement,
    { method: "GET" },
  )
  if (!isRelayForAnnouncement(data)) {
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      undefined,
      RELAYFOR_ENDPOINTS.announcement,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }
  return data
}

/** Reads expiry-bearing grants separately from the overview's aggregate. */
export async function fetchRelayForTimedQuotas(
  request: ApiServiceRequest,
): Promise<unknown[]> {
  const data = await fetchRelayForData<unknown>(
    request,
    RELAYFOR_ENDPOINTS.timedQuotas,
  )
  if (!Array.isArray(data))
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      undefined,
      RELAYFOR_ENDPOINTS.timedQuotas,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  return data
}

/** Persists only the routing preference; catalog readback belongs to the adapter. */
export async function updateRelayForModelGroup(
  request: ApiServiceRequest,
  model: string,
  group: string,
): Promise<void> {
  await fetchRelayForData(request, RELAYFOR_ENDPOINTS.modelGroup, {
    method: "PUT",
    body: { model, group },
  })
}

/** Reads the native log envelope for canonical usage-history normalization. */
export function fetchRelayForUsagePage(
  request: ApiServiceRequest,
  query: {
    page: number
    pageSize: number
    startTimestamp: number
    endTimestamp: number
  },
): Promise<unknown> {
  return fetchRelayForData(request, RELAYFOR_ENDPOINTS.logs, {
    query: {
      page: query.page,
      page_size: query.pageSize,
      start_timestamp: query.startTimestamp,
      end_timestamp: query.endTimestamp,
      sort_by: "created_at",
      sort_order: "desc",
    },
  })
}

/** Submits one redemption; native benefit confirmation belongs to the adapter. */
export function redeemRelayForCode(
  request: ApiServiceRequest,
  code: string,
): Promise<unknown> {
  return fetchRelayForData(request, RELAYFOR_ENDPOINTS.redeem, {
    method: "POST",
    body: { code },
  })
}
