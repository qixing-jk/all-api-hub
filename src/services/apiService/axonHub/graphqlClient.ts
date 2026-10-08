import { getSessionToken } from "~/services/apiService/axonHub/authSession"
import { normalizeBaseUrl } from "~/services/apiService/axonHub/configIdentity"
import {
  AxonHubRequestError,
  classifyGraphqlFailure,
  isAbortError,
  isGraphqlMutationDocument,
  parseGraphqlEnvelope,
  shouldRefreshAuthentication,
  throwIfAborted,
  toAxonHubRequestError,
  toGraphqlResponseError,
} from "~/services/apiService/axonHub/graphqlProtocol"
import type { AxonHubConfig } from "~/types/axonHubConfig"

/**
 * Execute an authenticated AxonHub admin GraphQL request with one auth retry.
 */
export async function graphqlRequest<T>(
  config: AxonHubConfig,
  query: string,
  variables?: Record<string, unknown>,
  options?: { retryAuth?: boolean } & Pick<RequestInit, "signal">,
): Promise<T> {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const retryAuth = options?.retryAuth ?? true
  const isMutation = isGraphqlMutationDocument(query)
  let mutationDispatched = false

  type GraphqlAttempt = { kind: "data"; data: T } | { kind: "retry-auth" }

  const retryAuthentication = (): GraphqlAttempt => ({ kind: "retry-auth" })

  const execute = async (
    sessionToken: string,
    allowAuthRetry: boolean,
  ): Promise<GraphqlAttempt> => {
    throwIfAborted(options?.signal)

    let response: Response
    try {
      if (isMutation) {
        mutationDispatched = true
      }
      response = await fetch(`${baseUrl}/admin/graphql`, {
        method: "POST",
        signal: options?.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ query, variables }),
      })
    } catch (error) {
      throw toAxonHubRequestError(
        error,
        isMutation ? "dispatched" : "not-dispatched",
        "unavailable",
      )
    }

    const dispatch = isMutation ? "dispatched" : "not-dispatched"
    let payload: unknown
    try {
      payload = await response.json()
    } catch (error) {
      if (isAbortError(error)) {
        throw toAxonHubRequestError(error, dispatch, "protocol")
      }
      if (allowAuthRetry && shouldRefreshAuthentication(response, undefined)) {
        return retryAuthentication()
      }
      if (!response.ok) {
        throw toGraphqlResponseError(
          classifyGraphqlFailure(response, undefined),
          dispatch,
          response,
          undefined,
          error,
        )
      }
      throw toGraphqlResponseError(
        "protocol",
        dispatch,
        response,
        undefined,
        error,
      )
    }

    const graphqlPayload = parseGraphqlEnvelope(payload, {
      dispatch,
      responseReceived: true,
      statusCode: response.status,
      raw: payload,
    })

    if (response.status >= 500) {
      throw toGraphqlResponseError(
        "unavailable",
        dispatch,
        response,
        graphqlPayload.errors,
        payload,
      )
    }
    if (response.status === 401) {
      if (allowAuthRetry) return retryAuthentication()
      throw toGraphqlResponseError(
        "authentication",
        dispatch,
        response,
        graphqlPayload.errors,
        payload,
      )
    }
    if (response.status === 403) {
      throw toGraphqlResponseError(
        "permission",
        dispatch,
        response,
        graphqlPayload.errors,
        payload,
      )
    }

    if (!response.ok || graphqlPayload.errors?.length) {
      if (
        allowAuthRetry &&
        shouldRefreshAuthentication(response, graphqlPayload.errors)
      ) {
        return retryAuthentication()
      }

      throw toGraphqlResponseError(
        classifyGraphqlFailure(response, graphqlPayload.errors),
        dispatch,
        response,
        graphqlPayload.errors,
        payload,
      )
    }

    if (graphqlPayload.data === undefined || graphqlPayload.data === null) {
      throw toGraphqlResponseError(
        "protocol",
        dispatch,
        response,
        undefined,
        payload,
      )
    }

    return { kind: "data", data: graphqlPayload.data as T }
  }

  try {
    throwIfAborted(options?.signal)
    const token = await getSessionToken(config, false, options)
    const firstAttempt = await execute(token, retryAuth && !isMutation)
    if (firstAttempt.kind === "data") return firstAttempt.data

    // Cached admin JWTs are session-scoped and may expire while the extension
    // page remains open; retry once with fresh credentials before surfacing.
    const refreshedToken = await getSessionToken(config, true, options)
    const secondAttempt = await execute(refreshedToken, false)
    if (secondAttempt.kind !== "data") {
      throw new AxonHubRequestError(
        "protocol",
        isMutation ? "dispatched" : "not-dispatched",
      )
    }
    return secondAttempt.data
  } catch (error) {
    throw toAxonHubRequestError(
      error,
      isMutation && mutationDispatched ? "dispatched" : "not-dispatched",
      "unavailable",
    )
  }
}
