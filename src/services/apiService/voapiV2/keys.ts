import { fetchVoApiV2Data } from "~/services/apiService/voapiV2/dashboardRequest"
import { toCanonicalPositiveInteger } from "~/services/apiService/voapiV2/keyGroups"
import {
  VOAPI_V2_ENDPOINTS,
  type VoApiV2Key,
  type VoApiV2KeyWrite,
} from "~/services/apiService/voapiV2/type"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { type ApiServiceRequest } from "~/services/apiTransport/type"

const DEFAULT_KEYS_PAGE = 1

const DEFAULT_KEYS_PAGE_SIZE = 10

const TOKEN_LOOKUP_PAGE_SIZE = 100

const TOKEN_LOOKUP_MAX_PAGES = 100

const buildKeysEndpoint = (
  page = DEFAULT_KEYS_PAGE,
  size = DEFAULT_KEYS_PAGE_SIZE,
) =>
  `${VOAPI_V2_ENDPOINTS.Keys}?page=${page}&size=${size}&sl[name]=true&sl[token]=true&sl[note]=true`

type VoApiV2KeyListPayload =
  | VoApiV2Key[]
  | {
      list?: VoApiV2Key[]
      records?: VoApiV2Key[]
      page?: number
      size?: number
      total?: number
      pages?: number
    }

const extractKeyList = (payload: VoApiV2KeyListPayload) =>
  Array.isArray(payload) ? payload : payload.records ?? payload.list ?? []

type VoApiV2RawKeyPage = {
  items: VoApiV2Key[]
  page?: number
  size?: number
  total?: number
  pages?: number
}

const extractRawKeyPage = (
  payload: VoApiV2KeyListPayload,
): VoApiV2RawKeyPage =>
  Array.isArray(payload)
    ? { items: payload }
    : {
        items: payload.records ?? payload.list ?? [],
        page: payload.page,
        size: payload.size,
        total: payload.total,
        pages: payload.pages,
      }

const fetchVoApiV2RawKeyPage = async (
  request: ApiServiceRequest,
  page: number,
  size: number,
): Promise<VoApiV2RawKeyPage> =>
  extractRawKeyPage(
    await fetchVoApiV2Data<VoApiV2KeyListPayload>(
      request,
      buildKeysEndpoint(page, size),
      { cache: "no-store" },
    ),
  )

const fetchVoApiV2RawKeys = async (
  request: ApiServiceRequest,
  page = DEFAULT_KEYS_PAGE,
  size = DEFAULT_KEYS_PAGE_SIZE,
) =>
  extractKeyList(
    await fetchVoApiV2Data<VoApiV2KeyListPayload>(
      request,
      buildKeysEndpoint(page, size),
      { cache: "no-store" },
    ),
  )

/**
 * Reads the complete native key inventory without flattening group identities.
 * VoAPI v2 exposes pagination metadata and multi-group ids on `/api/keys`.
 * https://demo.voapi.top/assets/keys-BUkrbzdE.js
 */
export async function fetchAllVoApiV2RawKeys(
  request: ApiServiceRequest,
  size = TOKEN_LOOKUP_PAGE_SIZE,
): Promise<VoApiV2Key[]> {
  const keys: VoApiV2Key[] = []
  const keyIds = new Set<number>()
  let expectedPagination:
    | { size: number; total: number; pages: number }
    | undefined

  const invalidPagination = () =>
    new ApiError(
      "VoAPI v2 key inventory has invalid pagination",
      undefined,
      VOAPI_V2_ENDPOINTS.Keys,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )

  for (
    let page = DEFAULT_KEYS_PAGE;
    page <= TOKEN_LOOKUP_MAX_PAGES;
    page += 1
  ) {
    const result = await fetchVoApiV2RawKeyPage(request, page, size)
    const paginationValues = [
      result.page,
      result.size,
      result.total,
      result.pages,
    ]
    const hasPagination = paginationValues.some((value) => value !== undefined)
    if (hasPagination) {
      if (
        !Number.isSafeInteger(result.page) ||
        result.page !== page ||
        !Number.isSafeInteger(result.size) ||
        result.size !== size ||
        !Number.isSafeInteger(result.total) ||
        result.total! < 0 ||
        !Number.isSafeInteger(result.pages) ||
        result.pages! < 0 ||
        result.pages !== Math.ceil(result.total! / size) ||
        result.items.length > size ||
        (result.pages === 0 ? page !== 1 : page > result.pages)
      ) {
        throw invalidPagination()
      }

      const currentPagination = {
        size: result.size!,
        total: result.total!,
        pages: result.pages!,
      }
      if (
        expectedPagination &&
        (currentPagination.size !== expectedPagination.size ||
          currentPagination.total !== expectedPagination.total ||
          currentPagination.pages !== expectedPagination.pages)
      ) {
        throw invalidPagination()
      }
      expectedPagination ??= currentPagination
    } else if (expectedPagination) {
      throw invalidPagination()
    }

    for (const key of result.items) {
      if (!Number.isSafeInteger(key.id) || key.id <= 0) {
        throw new ApiError(
          "VoAPI v2 key inventory contains invalid key id",
          undefined,
          VOAPI_V2_ENDPOINTS.Keys,
          API_ERROR_CODES.JSON_PARSE_ERROR,
        )
      }
      if (keyIds.has(key.id)) {
        throw new ApiError(
          "VoAPI v2 key inventory contains duplicate key id",
          undefined,
          VOAPI_V2_ENDPOINTS.Keys,
          API_ERROR_CODES.JSON_PARSE_ERROR,
        )
      }
      keyIds.add(key.id)
    }
    keys.push(...result.items)

    if (
      result.pages !== undefined
        ? page >= result.pages
        : result.items.length < size
    ) {
      if (expectedPagination && keys.length !== expectedPagination.total) {
        throw invalidPagination()
      }
      return keys
    }
  }

  throw new ApiError(
    "VoAPI v2 key inventory exceeds pagination limit",
    undefined,
    VOAPI_V2_ENDPOINTS.Keys,
    API_ERROR_CODES.BUSINESS_ERROR,
  )
}

/**
 * Finds one VoAPI v2 key by id from the key inventory.
 */
async function fetchVoApiV2TokenById(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<VoApiV2Key> {
  let page = DEFAULT_KEYS_PAGE

  while (page <= TOKEN_LOOKUP_MAX_PAGES) {
    const keys = await fetchVoApiV2RawKeys(
      request,
      page,
      TOKEN_LOOKUP_PAGE_SIZE,
    )
    const token = keys.find((item) => item.id === tokenId)

    if (token) {
      return token
    }

    if (keys.length < TOKEN_LOOKUP_PAGE_SIZE) {
      break
    }

    page += 1
  }

  throw new ApiError(
    "VoAPI v2 token not found",
    undefined,
    VOAPI_V2_ENDPOINTS.Keys,
    API_ERROR_CODES.BUSINESS_ERROR,
  )
}

type VoApiV2RevealTokenResponse = string | { token?: unknown }

const extractVoApiV2RevealedToken = (
  value: VoApiV2RevealTokenResponse,
): string => {
  if (typeof value === "string") return value
  if (value && typeof value === "object" && typeof value.token === "string") {
    return value.token
  }

  throw new ApiError(
    "VoAPI v2 token reveal response is missing token",
    undefined,
    VOAPI_V2_ENDPOINTS.Keys,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )
}

/**
 * Reveals the full secret for an exact VoAPI v2 native key id.
 * VoAPI v2 exposes this as `POST /api/keys/{id}/token`.
 * https://demo.voapi.top/assets/keys-BUkrbzdE.js
 */
export async function resolveVoApiV2KeySecretById(
  request: ApiServiceRequest,
  keyId: number,
): Promise<string> {
  const revealedToken = await fetchVoApiV2Data<VoApiV2RevealTokenResponse>(
    request,
    `${VOAPI_V2_ENDPOINTS.Keys}/${keyId}/token`,
    { method: "POST" },
    { allowTopLevelToken: true },
  )

  return extractVoApiV2RevealedToken(revealedToken)
}

/**
 * Creates a VoAPI v2 key and relies on inventory refetch for the created secret.
 */
export async function createVoApiV2Key(
  request: ApiServiceRequest,
  payload: VoApiV2KeyWrite,
): Promise<void> {
  await fetchVoApiV2Data<null>(
    request,
    VOAPI_V2_ENDPOINTS.Keys,
    { method: "POST", body: JSON.stringify({ ...payload, genCount: 1 }) },
    { allowNullData: true },
  )
}

/** Write one native key, preserving fields from its freshly loaded snapshot. */
export async function updateVoApiV2Key(
  request: ApiServiceRequest,
  id: number,
  payload: VoApiV2KeyWrite,
): Promise<void> {
  await fetchVoApiV2Data<null>(
    request,
    `${VOAPI_V2_ENDPOINTS.Keys}/${id}`,
    { method: "PUT", body: JSON.stringify({ ...payload, id }) },
    { allowNullData: true },
  )
}

/**
 * Renames one native VoAPI v2 key while preserving its current provider fields.
 * https://demo.voapi.top/assets/keys-BUkrbzdE.js
 */
export async function renameVoApiV2Key(
  request: ApiServiceRequest,
  keyId: number,
  name: string,
): Promise<boolean> {
  const existing = await fetchVoApiV2TokenById(request, keyId)
  await fetchVoApiV2Data<null>(
    request,
    `${VOAPI_V2_ENDPOINTS.Keys}/${keyId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        id: keyId,
        name,
        groups: (existing.groups ?? []).map((group) => {
          const id = toCanonicalPositiveInteger(group)
          if (id === null)
            throw new ApiError(
              "VoAPI v2 key contains invalid group identity",
              undefined,
              `${VOAPI_V2_ENDPOINTS.Keys}/${keyId}`,
              API_ERROR_CODES.JSON_PARSE_ERROR,
            )
          return id
        }),
        enable: existing.enable ?? true,
        expireTime: existing.expireTime ?? -1,
        boundlessAmount: existing.boundlessAmount === true,
        amount: existing.amount ?? "0",
        used: existing.used ?? "0",
        note: existing.note ?? "",
      }),
    },
    { allowNullData: true },
  )
  return true
}

/**
 * Deletes a VoAPI v2 key.
 */
export async function deleteVoApiV2Token(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<boolean> {
  await fetchVoApiV2Data<null>(
    request,
    `${VOAPI_V2_ENDPOINTS.Keys}/${tokenId}`,
    { method: "DELETE" },
    { allowNullData: true },
  )

  return true
}
