import {
  fetchSub2ApiData,
  fetchSub2ApiDataWithRequest,
} from "~/services/apiService/sub2api/account/dashboardRequest"
import {
  extractSub2ApiKeyItems,
  parseSub2ApiNativeKey,
} from "~/services/apiService/sub2api/parsing"
import { getSafeErrorMessage } from "~/services/apiService/sub2api/redaction"
import {
  SUB2API_KEYS_ENDPOINT,
  type Sub2ApiCreateKeyPayload,
  type Sub2ApiKeyData,
  type Sub2ApiKeyListData,
  type Sub2ApiNativeKey,
  type Sub2ApiUpdateKeyPayload,
} from "~/services/apiService/sub2api/type"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

/**
 * Unified logger scoped to Sub2API site API overrides.
 */
const logger = createLogger("ApiService.Sub2API")

const DEFAULT_KEYS_PAGE = 1

const DEFAULT_KEYS_PAGE_SIZE = 100

const FULL_KEYS_PAGE_SIZE = 1000

const MAX_FULL_KEYS_PAGES = 1000

const SUB2API_KEY_INVENTORY_FAILURE_CODES = {
  DuplicateKey: "sub2api_key_inventory_duplicate_key",
  InvalidPagination: "sub2api_key_inventory_invalid_pagination",
  PageLimitExceeded: "sub2api_key_inventory_page_limit_exceeded",
  PageDidNotAdvance: "sub2api_key_inventory_page_did_not_advance",
} as const

const normalizePositiveInteger = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback

const createSub2ApiKeysEndpoint = (page: number, size: number): string => {
  const searchParams = new URLSearchParams({
    page: normalizePositiveInteger(page, DEFAULT_KEYS_PAGE).toString(),
    page_size: normalizePositiveInteger(
      size,
      DEFAULT_KEYS_PAGE_SIZE,
    ).toString(),
  })

  return `${SUB2API_KEYS_ENDPOINT}?${searchParams.toString()}`
}

type Sub2ApiKeyPage = {
  tokens: Sub2ApiNativeKey[]
  totalPages: number
  reportedPage?: number
}

const createSub2ApiKeyInventoryError = (
  endpoint: string,
  upstreamCode: (typeof SUB2API_KEY_INVENTORY_FAILURE_CODES)[keyof typeof SUB2API_KEY_INVENTORY_FAILURE_CODES],
) =>
  new ApiError(
    t("messages:errors.api.invalidResponseFormat"),
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
    upstreamCode,
  )

const fetchAccountTokenPage = async (
  request: ApiServiceRequest,
  page: number,
  size: number,
): Promise<Sub2ApiKeyPage> => {
  const endpoint = createSub2ApiKeysEndpoint(page, size)

  try {
    const { data, request: hydratedRequest } =
      await fetchSub2ApiDataWithRequest<Sub2ApiKeyListData>(request, endpoint, {
        method: "GET",
        cache: "no-store",
      })
    const reportedPage = Array.isArray(data) ? undefined : data.page
    const reportedTotalPages = Array.isArray(data) ? undefined : data.pages
    if (
      reportedPage !== undefined &&
      (!Number.isSafeInteger(reportedPage) || reportedPage <= 0)
    ) {
      throw createSub2ApiKeyInventoryError(
        endpoint,
        SUB2API_KEY_INVENTORY_FAILURE_CODES.InvalidPagination,
      )
    }
    if (
      reportedTotalPages !== undefined &&
      (!Number.isSafeInteger(reportedTotalPages) || reportedTotalPages <= 0)
    ) {
      throw createSub2ApiKeyInventoryError(
        endpoint,
        SUB2API_KEY_INVENTORY_FAILURE_CODES.InvalidPagination,
      )
    }

    return {
      tokens: extractSub2ApiKeyItems(data).map((item) =>
        parseSub2ApiNativeKey(item, {
          defaultUserId: hydratedRequest.auth?.userId,
          endpoint,
        }),
      ),
      totalPages: Array.isArray(data)
        ? DEFAULT_KEYS_PAGE
        : Math.max(page, reportedTotalPages ?? page),
      ...(reportedPage === undefined ? {} : { reportedPage }),
    }
  } catch (error) {
    logger.error("Failed to fetch Sub2API keys", {
      accountId: request.accountId,
      endpoint,
      error: getSafeErrorMessage(error),
    })
    throw error
  }
}

/** Fetch the complete API-token inventory for all key-management consumers. */
export async function fetchSub2ApiKeys(
  request: ApiServiceRequest,
): Promise<Sub2ApiNativeKey[]> {
  const tokens: Sub2ApiNativeKey[] = []
  const seenTokenIds = new Set<number>()
  let page = DEFAULT_KEYS_PAGE

  // Upstream paginates this endpoint and caps page_size at 1000:
  // https://github.com/Wei-Shaw/sub2api/blob/main/backend/internal/pkg/response/response.go
  while (true) {
    const result = await fetchAccountTokenPage(
      request,
      page,
      FULL_KEYS_PAGE_SIZE,
    )
    const endpoint = createSub2ApiKeysEndpoint(page, FULL_KEYS_PAGE_SIZE)
    if (result.totalPages > MAX_FULL_KEYS_PAGES) {
      throw createSub2ApiKeyInventoryError(
        endpoint,
        SUB2API_KEY_INVENTORY_FAILURE_CODES.PageLimitExceeded,
      )
    }
    if (result.reportedPage !== undefined && result.reportedPage !== page) {
      throw createSub2ApiKeyInventoryError(
        endpoint,
        SUB2API_KEY_INVENTORY_FAILURE_CODES.PageDidNotAdvance,
      )
    }
    for (const token of result.tokens) {
      if (seenTokenIds.has(token.id)) {
        throw createSub2ApiKeyInventoryError(
          endpoint,
          SUB2API_KEY_INVENTORY_FAILURE_CODES.DuplicateKey,
        )
      }
      seenTokenIds.add(token.id)
    }
    tokens.push(...result.tokens)

    if (page >= result.totalPages) {
      return tokens
    }

    page += 1
  }
}

/** Fetch a native key without flattening its group identity or quota units. */
export async function fetchSub2ApiKey(
  request: ApiServiceRequest,
  keyId: number,
): Promise<Sub2ApiNativeKey> {
  const endpoint = `${SUB2API_KEYS_ENDPOINT}/${keyId}`
  const { data, request: hydrated } =
    await fetchSub2ApiDataWithRequest<Sub2ApiKeyData>(request, endpoint, {
      method: "GET",
      cache: "no-store",
    })
  const key = parseSub2ApiNativeKey(data, {
    defaultUserId: hydrated.auth?.userId,
    endpoint,
  })
  if (key.id !== keyId)
    throw createSub2ApiKeyInventoryError(
      endpoint,
      SUB2API_KEY_INVENTORY_FAILURE_CODES.DuplicateKey,
    )
  return key
}

/** Sub2API accepts native group_id, USD quota, and whole expiry days on create. */
export async function createSub2ApiKey(
  request: ApiServiceRequest,
  payload: Sub2ApiCreateKeyPayload,
): Promise<Sub2ApiNativeKey | undefined> {
  const { data, request: hydrated } = await fetchSub2ApiDataWithRequest<
    Sub2ApiKeyData | undefined
  >(
    request,
    SUB2API_KEYS_ENDPOINT,
    { method: "POST", body: JSON.stringify(payload) },
    { allowMissingData: true },
  )
  return data
    ? parseSub2ApiNativeKey(data, { defaultUserId: hydrated.auth?.userId })
    : undefined
}

/** Update only the native fields selected by the provider editor. */
export async function updateSub2ApiKey(
  request: ApiServiceRequest,
  keyId: number,
  payload: Partial<Sub2ApiUpdateKeyPayload>,
): Promise<void> {
  await fetchSub2ApiData(
    request,
    `${SUB2API_KEYS_ENDPOINT}/${keyId}`,
    { method: "PUT", body: JSON.stringify(payload) },
    { allowMissingData: true },
  )
}

/**
 * Delete an API token in Sub2API by its ID.
 */
export async function deleteApiToken(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<boolean> {
  const endpoint = `${SUB2API_KEYS_ENDPOINT}/${tokenId}`

  try {
    await fetchSub2ApiData<void>(
      request,
      endpoint,
      {
        method: "DELETE",
      },
      { allowMissingData: true },
    )

    return true
  } catch (error) {
    logger.error("Failed to delete Sub2API key", {
      accountId: request.accountId,
      tokenId,
      endpoint,
      error: getSafeErrorMessage(error),
    })
    throw error
  }
}
