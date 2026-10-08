import {
  OCTOPUS_AUTH_MODES,
  OCTOPUS_COOKIE_API_VERSIONS,
  octopusAuthManager,
} from "~/services/apiService/octopus/auth"
import {
  fetchOctopusV013Channels,
  resolveOctopusCookieApiVersion,
} from "~/services/apiService/octopus/cookieProtocol"
import { fetchOctopusCookieApi } from "~/services/apiService/octopus/cookieTransport"
import { currentOctopusContract } from "~/services/apiService/octopus/current"
import { legacyOctopusContract } from "~/services/apiService/octopus/legacy"
import {
  OCTOPUS_API_OPERATIONS,
  type OctopusApiOperation,
} from "~/services/apiService/octopus/operations"
import {
  createOctopusRequestHeaders,
  throwIfOctopusRequestAborted,
  type OctopusRequestInit,
} from "~/services/apiService/octopus/requestContext"
import {
  getOctopusEnvelopeData,
  getOctopusErrorCode,
  getOctopusMutationErrorMessage,
  OctopusMutationApiError,
  parseOctopusEnvelope,
} from "~/services/apiService/octopus/responseProtocol"
import { octopusV013Contract } from "~/services/apiService/octopus/v013"
import { type OctopusApiResponse } from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"
import { getErrorMessage } from "~/utils/core/error"
import { normalizeBaseUrl } from "~/utils/core/url"

/**
 * 执行 Octopus API 请求
 */
export async function fetchOctopusApi<T>(
  config: OctopusConfig,
  operation: OctopusApiOperation,
  options: OctopusRequestInit = {},
  requestKind: "read" | "mutation" = "read",
  retryAfterUnauthorized = true,
): Promise<OctopusApiResponse<T>> {
  const signal = options.signal ?? undefined
  const isMutation = requestKind === "mutation"
  let fetchStarted = false
  let responseReceived = false
  let responseStatus: number | undefined

  try {
    throwIfOctopusRequestAborted(signal)
    const session = await octopusAuthManager.getValidSession(config, {
      signal,
    })
    throwIfOctopusRequestAborted(signal)
    const baseUrl = normalizeBaseUrl(config.baseUrl)

    const { protectionBypassExecution, resourceBinding, ...fetchOptions } =
      options
    if (
      session.mode === OCTOPUS_AUTH_MODES.Cookie &&
      session.apiVersion === OCTOPUS_COOKIE_API_VERSIONS.V013 &&
      operation.kind === OCTOPUS_API_OPERATIONS.ListChannels
    ) {
      const channels = await fetchOctopusV013Channels({
        config,
        session,
        baseUrl,
        signal,
        protectionBypassExecution: options.protectionBypassExecution,
        resourceBinding: options.resourceBinding,
      })
      session.confirmed = true
      return { success: true, data: channels as T, message: "success" }
    }

    if (
      session.mode === OCTOPUS_AUTH_MODES.Cookie &&
      (session.confirmed === false || session.apiVersion === undefined) &&
      (isMutation ||
        operation.kind === OCTOPUS_API_OPERATIONS.FetchRemoteModels)
    ) {
      await resolveOctopusCookieApiVersion({
        config,
        session,
        baseUrl,
        signal,
        protectionBypassExecution,
        resourceBinding,
      })
    }

    const usesV013Contract =
      session.mode === OCTOPUS_AUTH_MODES.Cookie &&
      session.apiVersion === OCTOPUS_COOKIE_API_VERSIONS.V013
    let existingV013Detail
    if (
      usesV013Contract &&
      operation.kind === OCTOPUS_API_OPERATIONS.UpdateChannel
    ) {
      const detailEndpoint = octopusV013Contract.detailEndpoint(
        operation.input.id,
      )
      const detailResponse = await fetchOctopusCookieApi({
        config,
        session,
        baseUrl,
        endpoint: detailEndpoint,
        fetchOptions: signal ? { signal } : {},
        protectionBypassExecution,
        resourceBinding,
      })
      if (!detailResponse.success) {
        throw new Error(
          detailResponse.status
            ? "HTTP " +
              detailResponse.status +
              ": " +
              (detailResponse.error || "Octopus request failed")
            : detailResponse.error || "Octopus request failed",
        )
      }
      existingV013Detail = octopusV013Contract.parseDetail(
        getOctopusEnvelopeData(detailEndpoint, detailResponse.data),
      )
    }

    const contract =
      session.mode === OCTOPUS_AUTH_MODES.Bearer
        ? legacyOctopusContract
        : currentOctopusContract
    const nativeRequest = usesV013Contract
      ? octopusV013Contract.createRequest(
          operation,
          fetchOptions,
          existingV013Detail,
        )
      : contract.createRequest(operation, fetchOptions)
    const { endpoint } = nativeRequest
    let data: unknown

    if (session.mode === OCTOPUS_AUTH_MODES.Cookie) {
      const confirmationOperation: OctopusApiOperation = {
        kind: OCTOPUS_API_OPERATIONS.ListChannels,
      }
      const confirmationRequest = currentOctopusContract.createRequest(
        confirmationOperation,
        signal ? { signal } : {},
      )
      if (isMutation && session.confirmed === false) {
        const confirmation = await fetchOctopusCookieApi({
          config,
          session,
          baseUrl,
          endpoint: confirmationRequest.endpoint,
          fetchOptions: confirmationRequest.init,
          protectionBypassExecution,
          resourceBinding,
        })
        if (!confirmation.success) {
          throw new Error(
            confirmation.status
              ? `HTTP ${confirmation.status}: ${confirmation.error || "Octopus session confirmation failed"}`
              : confirmation.error || "Octopus session confirmation failed",
          )
        }
        const confirmationEnvelope = parseOctopusEnvelope(
          confirmationRequest.endpoint,
          confirmation.data,
        )
        if (
          confirmationEnvelope.success === false ||
          (confirmationEnvelope.code !== undefined &&
            confirmationEnvelope.code !== 200)
        ) {
          throw new Error(
            typeof confirmationEnvelope.message === "string"
              ? confirmationEnvelope.message
              : "Octopus session confirmation failed",
          )
        }
        currentOctopusContract.normalizeResponse(
          confirmationOperation,
          confirmationEnvelope.data,
        )
        session.confirmed = true
      }
      // Once the temporary-context bridge is invoked, absence of lifecycle
      // evidence cannot prove that an upstream mutation was never dispatched.
      fetchStarted = true
      const remote = await fetchOctopusCookieApi({
        config,
        session,
        baseUrl,
        endpoint,
        fetchOptions: nativeRequest.init,
        protectionBypassExecution,
        resourceBinding,
      })

      fetchStarted =
        remote.transportLifecycle?.upstreamRequestDispatched ?? true
      responseReceived =
        remote.transportLifecycle?.upstreamResponseReceived ??
        remote.status !== undefined
      responseStatus = remote.status
      if (!remote.success) {
        if (
          operation.kind === OCTOPUS_API_OPERATIONS.ListChannels &&
          remote.status === 404
        ) {
          const channels = await fetchOctopusV013Channels({
            config,
            session,
            baseUrl,
            signal,
            protectionBypassExecution,
            resourceBinding,
          })
          session.apiVersion = OCTOPUS_COOKIE_API_VERSIONS.V013
          session.confirmed = true
          return { success: true, data: channels as T, message: "success" }
        }
        throw new Error(
          remote.status
            ? `HTTP ${remote.status}: ${remote.error || "Octopus request failed"}`
            : remote.error || "Octopus request failed",
        )
      }
      data = remote.data
      if (operation.kind === OCTOPUS_API_OPERATIONS.ListChannels) {
        session.apiVersion = OCTOPUS_COOKIE_API_VERSIONS.V012
      }
      session.confirmed = true
    } else {
      fetchStarted = true
      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...nativeRequest.init,
        signal,
        headers: createOctopusRequestHeaders(
          session,
          nativeRequest.init.headers,
        ),
      })
      responseReceived = true
      responseStatus = response.status

      if (response.status === 401 && retryAfterUnauthorized) {
        octopusAuthManager.clearCache(config.baseUrl, config.username)
        return await fetchOctopusApi(
          config,
          operation,
          options,
          requestKind,
          false,
        )
      }

      // 检查 HTTP 状态码，处理非成功响应
      if (!response.ok) {
        const contentType = response.headers.get("Content-Type") || ""
        let errorMessage: string

        // Read body once as text, then try to parse as JSON
        const rawBody = await response.text()

        if (contentType.includes("application/json")) {
          // 尝试解析 JSON 错误响应
          try {
            const errorData = JSON.parse(rawBody) as unknown
            const errorRecord =
              typeof errorData === "object" &&
              errorData !== null &&
              !Array.isArray(errorData)
                ? (errorData as Record<string, unknown>)
                : undefined
            errorMessage = getErrorMessage(
              errorRecord?.message,
              getErrorMessage(errorRecord?.error, "Octopus request failed"),
            )
          } catch {
            errorMessage = rawBody
          }
        } else {
          // 非 JSON 响应，使用已读取的文本
          errorMessage = rawBody
        }

        throw new Error(
          `HTTP ${response.status} ${response.statusText}: ${errorMessage}`,
        )
      }

      // 检查 Content-Type 是否为 JSON
      const contentType = response.headers.get("Content-Type") || ""
      if (!contentType.includes("application/json")) {
        const text = await response.text()
        throw new Error(
          `Expected JSON response but got ${contentType || "unknown content type"}: ${text.slice(0, 200)}`,
        )
      }

      try {
        data = await response.json()
      } catch {
        throw new Error(`Failed to parse JSON response from ${endpoint}`)
      }
    }

    // Octopus 返回格式: { success: boolean, data?: T, message?: string }
    // 或者 { code: number, message: string, data?: T }
    const responseData = parseOctopusEnvelope(endpoint, data)
    if (
      responseData.success === false ||
      (responseData.code !== undefined && responseData.code !== 200)
    ) {
      const message = getErrorMessage(
        responseData.message,
        "API request failed",
      )
      if (isMutation) {
        throw new OctopusMutationApiError(message, {
          dispatch: "dispatched",
          responseReceived: true,
          confirmedNonApplication: true,
          raw: data,
          statusCode: responseStatus,
          code: getOctopusErrorCode(data),
        })
      }
      throw new Error(message)
    }

    const normalizedData = usesV013Contract
      ? octopusV013Contract.normalizeResponse(operation, responseData.data)
      : contract.normalizeResponse(operation, responseData.data)
    return {
      success: true,
      data: (normalizedData as T | undefined) ?? null,
      message: (responseData.message as string) || "success",
    }
  } catch (error) {
    if (!isMutation || error instanceof OctopusMutationApiError) {
      throw error
    }
    throw new OctopusMutationApiError(getOctopusMutationErrorMessage(error), {
      dispatch: fetchStarted ? "dispatched" : "not-dispatched",
      responseReceived,
      confirmedNonApplication: !fetchStarted,
      raw: error,
      ...(responseStatus === undefined ? {} : { statusCode: responseStatus }),
      code: getOctopusErrorCode(error),
    })
  }
}
