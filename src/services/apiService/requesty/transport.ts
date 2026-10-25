import { REQUESTY_MANAGE_API_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { getErrorMessage } from "~/utils/core/error"
import { isRecord } from "~/utils/core/object"
import { t } from "~/utils/i18n/core"

import { readRequestyError } from "./parsing"

export type RequestyRequestOptions = {
  method?: "GET" | "POST" | "DELETE"
  body?: unknown
  /**
   * Mutation routes answer 200 with an empty body (no content-type), which
   * the JSON parser would reject; they are read as text instead.
   */
  emptyBody?: boolean
}

const statusToErrorCode = (status: number) => {
  if (status === 401) return API_ERROR_CODES.HTTP_401
  if (status === 403) return API_ERROR_CODES.HTTP_403
  if (status === 429) return API_ERROR_CODES.HTTP_429
  return API_ERROR_CODES.HTTP_OTHER
}

/**
 * Calls the Requesty management API with the account's manage key as a
 * bearer credential.
 *
 * Management routes live on the dedicated `api-v2.requesty.ai` host, not the
 * console origin, so every request carries an explicit
 * `managementApiBaseUrl` that overrides the account's saved console URL at the
 * transport boundary. The bearer credential is explicit, so the request never
 * carries cookies.
 */
export const fetchRequestyManageData = async <T>(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestyRequestOptions = {},
): Promise<T> => {
  const accessToken =
    typeof request.auth?.accessToken === "string"
      ? request.auth.accessToken.trim()
      : ""
  if (!accessToken) {
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      401,
      endpoint,
      API_ERROR_CODES.HTTP_401,
    )
  }

  const method = options.method ?? "GET"
  const headers = new Headers()
  headers.set("Authorization", `Bearer ${accessToken}`)
  headers.set("Accept", "application/json")
  if (method !== "GET" && options.body !== undefined) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetchApiResponse<T>(
    {
      ...request,
      managementApiBaseUrl: REQUESTY_MANAGE_API_ORIGIN,
    },
    {
      endpoint,
      options: {
        method,
        headers,
        credentials: "omit",
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      },
      ...(options.emptyBody ? { responseType: "text" as const } : {}),
      currentTabTransport: "disabled",
      tempWindowFallback: { statusCodes: [], codes: [] },
    },
  )
  if (!response.ok) {
    const providerError = readRequestyError(response.body)
    throw new ApiError(
      getErrorMessage(
        providerError?.message,
        t("messages:errors.api.requestFailed", { status: response.status }),
      ),
      response.status,
      endpoint,
      statusToErrorCode(response.status),
    )
  }

  return response.body as T
}

export const readRequestyRecord = (value: unknown, endpoint: string) => {
  if (!isRecord(value)) {
    throw new ApiError(
      t("messages:errors.api.invalidResponseFormat"),
      undefined,
      endpoint,
    )
  }
  return value
}
