import { NOVITA_OPENAPI_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchPreparedJsonResponse } from "~/services/apiTransport/requestExecution"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { joinUrl } from "~/utils/core/url"

import { parseNovitaCredentials } from "./constants"
import { decodeNovitaResponseError } from "./responseError"

export type NovitaQueryValue = string | number | boolean | undefined | null

export { isNovitaConsoleCredential } from "./constants"

/**
 * Prefers the console for reads, with one API-key fallback on expired authentication.
 * API keys serve policy writes; console credentials serve native CRUD. Never replay writes.
 */
export async function fetchNovitaData<T>(
  request: ApiServiceRequest,
  endpoint: string,
  options: {
    query?: Record<string, NovitaQueryValue>
    method?: "GET" | "POST" | "PUT" | "DELETE"
    body?: unknown
  } = {},
): Promise<T> {
  const credential =
    typeof request.auth?.accessToken === "string"
      ? request.auth.accessToken.trim()
      : ""
  const credentials = parseNovitaCredentials(credential)
  const requiresConsole =
    /^\/v2\/user\/key(?:\/[^/]+)?$/.test(endpoint) &&
    options.method !== undefined &&
    options.method !== "GET"
  const isRead = !options.method || options.method === "GET"
  const consoleCredential =
    requiresConsole ||
    !credentials.apiKey ||
    (isRead && Boolean(credentials.consoleToken))
  const accessToken = consoleCredential
    ? credentials.consoleToken
    : credentials.apiKey
  if (!accessToken) {
    throw new ApiError(
      "Novita credential is required",
      401,
      endpoint,
      API_ERROR_CODES.HTTP_401,
    )
  }

  const url = new URL(
    joinUrl(
      consoleCredential
        ? "https://api-server.novita.ai"
        : NOVITA_OPENAPI_BASE_URL,
      endpoint,
    ),
  )
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null) continue
    url.searchParams.set(key, String(value))
  }

  const response = await fetchPreparedJsonResponse(request, {
    url: url.toString(),
    options: {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    },
  })

  if (!response.ok) {
    if (
      isRead &&
      consoleCredential &&
      credentials.apiKey &&
      response.status === 401
    ) {
      return fetchNovitaData<T>(
        {
          ...request,
          auth: { ...request.auth, accessToken: credentials.apiKey },
        },
        endpoint,
        options,
      )
    }
    throw decodeNovitaResponseError(response, { endpoint })
  }

  return response.body as T
}

/** Whether a failure indicates the saved API key is invalid or expired. */
export const isNovitaAuthFailureError = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.statusCode === 401
