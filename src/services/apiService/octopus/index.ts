/**
 * Octopus API 服务
 * 提供与 Octopus 后端的所有 API 交互
 */
import { OCTOPUS_LOGIN_PATH } from "~/constants/octopus"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { userPreferences } from "~/services/preferences/userPreferences"
import { createUserCommandProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  createAutomaticProtectionBypassExecution,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_USER_COMMANDS,
  type ProtectionBypassExecution,
  type ProtectionBypassSurface,
} from "~/services/protectionBypass/contracts"
import type {
  OctopusApiResponse,
  OctopusChannel,
  OctopusCreateChannelInput,
  OctopusFetchModelInput,
  OctopusUpdateChannelInput,
} from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"
import {
  OCTOPUS_API_RESOURCE_BINDINGS,
  type OctopusApiResourceBinding,
  type TempWindowFetch,
} from "~/types/tempWindowFetch"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { normalizeBaseUrl } from "~/utils/core/url"

import {
  OCTOPUS_AUTH_MODES,
  OCTOPUS_COOKIE_API_VERSIONS,
  octopusAuthManager,
  type OctopusAuthSession,
} from "./auth"
import { currentOctopusContract } from "./current"
import { legacyOctopusContract } from "./legacy"
import { OCTOPUS_API_OPERATIONS, type OctopusApiOperation } from "./operations"
import { tempWindowOctopusApiFetch } from "./tempContextClient"
import { buildOctopusAuthHeaders } from "./utils"
import { octopusV013Contract } from "./v013"

const logger = createLogger("OctopusAPI")

type OctopusRequestInit = RequestInit & {
  protectionBypassExecution?: ProtectionBypassExecution
  resourceBinding?: OctopusApiResourceBinding
}

const resolveOctopusProtectionExecution = (
  execution: ProtectionBypassExecution | undefined,
): ProtectionBypassExecution => {
  if (execution) return execution
  const requestSource = getCurrentTempWindowRequestSource()
  return createAutomaticProtectionBypassExecution(
    PROTECTION_BYPASS_FEATURES.ManagedSiteChannels,
    requestSource === "background"
      ? PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery
      : PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
    requestSource,
  )
}

const throwIfOctopusRequestAborted = (signal?: AbortSignal) => {
  if (!signal?.aborted) return
  throw (
    signal.reason ?? new DOMException("The operation was aborted", "AbortError")
  )
}

/** Runs the current Octopus cookie contract in its same-origin browser context. */
const fetchOctopusCookieApi = async (params: {
  config: OctopusConfig
  session: Extract<OctopusAuthSession, { mode: "cookie" }>
  baseUrl: string
  endpoint: string
  fetchOptions: RequestInit
  protectionBypassExecution?: ProtectionBypassExecution
  resourceBinding?: OctopusApiResourceBinding
}): Promise<TempWindowFetch> => {
  const execution = resolveOctopusProtectionExecution(
    params.protectionBypassExecution,
  )
  const perform = async (endpoint: string, init: RequestInit) => {
    throwIfOctopusRequestAborted(params.fetchOptions.signal ?? undefined)
    return await tempWindowOctopusApiFetch({
      originUrl: params.baseUrl,
      resourceUsername: params.config.username,
      fetchUrl: `${params.baseUrl}${endpoint}`,
      fetchOptions: {
        ...init,
        credentials: "include",
        headers: createOctopusRequestHeaders(params.session, init.headers),
      },
      requestId: safeRandomUUID(`octopus-${endpoint}`),
      resourceBinding: params.resourceBinding,
      protectionBypassExecution: execution,
    })
  }

  let response = await perform(params.endpoint, params.fetchOptions)
  if (response.status !== 401) return response

  throwIfOctopusRequestAborted(params.fetchOptions.signal ?? undefined)
  const login = await perform(OCTOPUS_LOGIN_PATH, {
    method: "POST",
    body: JSON.stringify({
      username: params.config.username,
      password: params.config.password,
    }),
  })
  if (!login.success) {
    throw new Error(login.error || "Octopus cookie login failed")
  }
  const loginData = login.data
  if (
    typeof loginData !== "object" ||
    loginData === null ||
    Array.isArray(loginData) ||
    loginData.code !== 200
  ) {
    const message =
      typeof loginData === "object" &&
      loginData !== null &&
      "message" in loginData &&
      typeof loginData.message === "string"
        ? loginData.message
        : "Octopus cookie login failed"
    throw new Error(message)
  }
  throwIfOctopusRequestAborted(params.fetchOptions.signal ?? undefined)
  response = await perform(params.endpoint, params.fetchOptions)
  return response
}

export class OctopusMutationApiError extends Error {
  constructor(
    message: string,
    readonly evidence: {
      dispatch: "not-dispatched" | "dispatched"
      responseReceived: boolean
      confirmedNonApplication: boolean
      raw: unknown
      statusCode?: number
      code?: string | number
    },
  ) {
    super(message)
    this.name = "OctopusMutationApiError"
  }

  get dispatch() {
    return this.evidence.dispatch
  }

  get responseReceived() {
    return this.evidence.responseReceived
  }

  get confirmedNonApplication() {
    return this.evidence.confirmedNonApplication
  }

  get raw() {
    return this.evidence.raw
  }

  get statusCode() {
    return this.evidence.statusCode
  }

  get code() {
    return this.evidence.code
  }
}

const getOctopusErrorCode = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined
  }
  const code = error.code
  return typeof code === "string" ||
    (typeof code === "number" && Number.isSafeInteger(code))
    ? code
    : undefined
}

const getOctopusMutationErrorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "Octopus mutation failed"

const parseOctopusEnvelope = (
  endpoint: string,
  data: unknown,
): Record<string, unknown> => {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`Invalid Octopus response from ${endpoint}`)
  }
  return data as Record<string, unknown>
}

const getOctopusEnvelopeData = (endpoint: string, data: unknown): unknown => {
  const envelope = parseOctopusEnvelope(endpoint, data)
  if (
    envelope.success === false ||
    (envelope.code !== undefined && envelope.code !== 200)
  ) {
    throw new Error(
      typeof envelope.message === "string"
        ? envelope.message
        : "API request failed",
    )
  }
  return envelope.data
}

const fetchOctopusV013Channels = async (params: {
  config: OctopusConfig
  session: Extract<OctopusAuthSession, { mode: "cookie" }>
  baseUrl: string
  signal?: AbortSignal
  protectionBypassExecution?: ProtectionBypassExecution
  resourceBinding?: OctopusApiResourceBinding
}): Promise<OctopusChannel[]> => {
  const request = async (endpoint: string) => {
    const remote = await fetchOctopusCookieApi({
      config: params.config,
      session: params.session,
      baseUrl: params.baseUrl,
      endpoint,
      fetchOptions: params.signal ? { signal: params.signal } : {},
      protectionBypassExecution: params.protectionBypassExecution,
      resourceBinding: params.resourceBinding,
    })
    if (!remote.success) {
      throw new Error(
        remote.status
          ? "HTTP " +
            remote.status +
            ": " +
            (remote.error || "Octopus request failed")
          : remote.error || "Octopus request failed",
      )
    }
    return getOctopusEnvelopeData(endpoint, remote.data)
  }

  return octopusV013Contract
    .parseStatsList(await request(octopusV013Contract.statsEndpoint))
    .map(octopusV013Contract.normalizeStatsChannel)
}

const fetchOctopusV013ChannelDetail = async (params: {
  config: OctopusConfig
  session: Extract<OctopusAuthSession, { mode: "cookie" }>
  baseUrl: string
  channelId: number
  signal?: AbortSignal
  protectionBypassExecution?: ProtectionBypassExecution
  resourceBinding?: OctopusApiResourceBinding
}): Promise<OctopusChannel> => {
  const endpoint = octopusV013Contract.detailEndpoint(params.channelId)
  const remote = await fetchOctopusCookieApi({
    config: params.config,
    session: params.session,
    baseUrl: params.baseUrl,
    endpoint,
    fetchOptions: params.signal ? { signal: params.signal } : {},
    protectionBypassExecution: params.protectionBypassExecution,
    resourceBinding: params.resourceBinding,
  })
  if (!remote.success) {
    throw new Error(
      remote.status
        ? "HTTP " +
          remote.status +
          ": " +
          (remote.error || "Octopus request failed")
        : remote.error || "Octopus request failed",
    )
  }
  return octopusV013Contract.normalizeChannel(
    getOctopusEnvelopeData(endpoint, remote.data),
  )
}

const resolveOctopusCookieApiVersion = async (params: {
  config: OctopusConfig
  session: Extract<OctopusAuthSession, { mode: "cookie" }>
  baseUrl: string
  signal?: AbortSignal
  protectionBypassExecution?: ProtectionBypassExecution
  resourceBinding?: OctopusApiResourceBinding
}) => {
  if (params.session.apiVersion) return params.session.apiVersion

  const probeOperation: OctopusApiOperation = {
    kind: OCTOPUS_API_OPERATIONS.ListChannels,
  }
  const probeRequest = currentOctopusContract.createRequest(
    probeOperation,
    params.signal ? { signal: params.signal } : {},
  )
  const probe = await fetchOctopusCookieApi({
    config: params.config,
    session: params.session,
    baseUrl: params.baseUrl,
    endpoint: probeRequest.endpoint,
    fetchOptions: probeRequest.init,
    protectionBypassExecution: params.protectionBypassExecution,
    resourceBinding: params.resourceBinding,
  })

  if (probe.success) {
    currentOctopusContract.normalizeResponse(
      probeOperation,
      getOctopusEnvelopeData(probeRequest.endpoint, probe.data),
    )
    params.session.apiVersion = OCTOPUS_COOKIE_API_VERSIONS.V012
    params.session.confirmed = true
    return params.session.apiVersion
  }

  if (probe.status !== 404) {
    throw new Error(
      probe.status
        ? "HTTP " +
          probe.status +
          ": " +
          (probe.error || "Octopus session confirmation failed")
        : probe.error || "Octopus session confirmation failed",
    )
  }

  const statsEndpoint = octopusV013Contract.statsEndpoint
  const statsProbe = await fetchOctopusCookieApi({
    config: params.config,
    session: params.session,
    baseUrl: params.baseUrl,
    endpoint: statsEndpoint,
    fetchOptions: params.signal ? { signal: params.signal } : {},
    protectionBypassExecution: params.protectionBypassExecution,
    resourceBinding: params.resourceBinding,
  })
  if (!statsProbe.success) {
    throw new Error(
      statsProbe.status
        ? "HTTP " +
          statsProbe.status +
          ": " +
          (statsProbe.error || "Octopus session confirmation failed")
        : statsProbe.error || "Octopus session confirmation failed",
    )
  }
  octopusV013Contract.parseStatsList(
    getOctopusEnvelopeData(statsEndpoint, statsProbe.data),
  )
  params.session.apiVersion = OCTOPUS_COOKIE_API_VERSIONS.V013
  params.session.confirmed = true
  return params.session.apiVersion
}

/**
 * 执行 Octopus API 请求
 */
async function fetchOctopusApi<T>(
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
      session.confirmed === false &&
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
            const errorData = JSON.parse(rawBody)
            errorMessage =
              errorData.message || errorData.error || JSON.stringify(errorData)
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
      const message = (responseData.message as string) || "API request failed"
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

/**
 * 获取渠道列表
 */
export async function listChannels(
  config: OctopusConfig,
  options?: Pick<
    OctopusRequestInit,
    "signal" | "protectionBypassExecution" | "resourceBinding"
  >,
): Promise<OctopusChannel[]> {
  try {
    const result = await fetchOctopusApi<OctopusChannel[]>(
      config,
      { kind: OCTOPUS_API_OPERATIONS.ListChannels },
      options,
    )
    return result.data || []
  } catch (error) {
    logger.error("Failed to list channels", error)
    throw error
  }
}

/** Loads one full channel configuration for editing. */
export async function getChannel(
  config: OctopusConfig,
  channelId: number,
  options?: Pick<
    OctopusRequestInit,
    "signal" | "protectionBypassExecution" | "resourceBinding"
  >,
): Promise<OctopusChannel> {
  const signal = options?.signal ?? undefined
  const session = await octopusAuthManager.getValidSession(config, { signal })
  const loadV013Detail = (
    cookieSession: Extract<OctopusAuthSession, { mode: "cookie" }>,
  ) =>
    fetchOctopusV013ChannelDetail({
      config,
      session: cookieSession,
      baseUrl: normalizeBaseUrl(config.baseUrl),
      channelId,
      signal,
      protectionBypassExecution: options?.protectionBypassExecution,
      resourceBinding: options?.resourceBinding,
    })

  if (
    session.mode === OCTOPUS_AUTH_MODES.Cookie &&
    session.apiVersion === OCTOPUS_COOKIE_API_VERSIONS.V013
  ) {
    return await loadV013Detail(session)
  }

  const channels = await listChannels(config, options)
  if (
    session.mode === OCTOPUS_AUTH_MODES.Cookie &&
    session.apiVersion === OCTOPUS_COOKIE_API_VERSIONS.V013
  ) {
    return await loadV013Detail(session)
  }

  const channel = channels.find((item) => item.id === channelId)
  if (!channel) throw new Error(`Channel ${channelId} was not found`)
  return channel
}

/** Validates both authentication and a harmless protected Octopus read. */
export async function validateOctopusConfig(
  config: OctopusConfig,
  surface: ProtectionBypassSurface,
): Promise<{ success: boolean; error?: string }> {
  const authResult = await octopusAuthManager.validateConfig(config)
  if (!authResult.success) return authResult

  try {
    await listChannels(config, {
      protectionBypassExecution: createUserCommandProtectionBypassExecution(
        PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
        surface,
      ),
      resourceBinding: OCTOPUS_API_RESOURCE_BINDINGS.ConfigurationTest,
    })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : undefined,
    }
  }
}

/**
 * 搜索渠道（按名称过滤）
 */
export async function searchChannels(
  config: OctopusConfig,
  keyword: string,
): Promise<OctopusChannel[]> {
  const channels = await listChannels(config)
  if (!keyword) return channels

  const lowerKeyword = keyword.toLowerCase()
  return channels.filter(
    (ch) =>
      ch.name.toLowerCase().includes(lowerKeyword) ||
      ch.base_urls?.some((u) => u.url?.toLowerCase().includes(lowerKeyword)),
  )
}

/**
 * 创建渠道
 */
export async function createChannel(
  config: OctopusConfig,
  data: OctopusCreateChannelInput,
): Promise<OctopusApiResponse<OctopusChannel>> {
  try {
    const result = await fetchOctopusApi<OctopusChannel>(
      config,
      { kind: OCTOPUS_API_OPERATIONS.CreateChannel, input: data },
      {},
      "mutation",
    )
    logger.info("Channel created", { name: data.name })
    return result
  } catch (error) {
    logger.error("Failed to create channel")
    throw error
  }
}

/**
 * 更新渠道
 */
export async function updateChannel(
  config: OctopusConfig,
  data: OctopusUpdateChannelInput,
  options?: Pick<OctopusRequestInit, "signal" | "protectionBypassExecution">,
): Promise<OctopusApiResponse<OctopusChannel>> {
  try {
    const result = await fetchOctopusApi<OctopusChannel>(
      config,
      { kind: OCTOPUS_API_OPERATIONS.UpdateChannel, input: data },
      {
        signal: options?.signal,
        protectionBypassExecution: options?.protectionBypassExecution,
      },
      "mutation",
    )
    logger.info("Channel updated", { id: data.id })
    return result
  } catch (error) {
    logger.error("Failed to update channel")
    throw error
  }
}

/**
 * 删除渠道
 */
export async function deleteChannel(
  config: OctopusConfig,
  channelId: number,
): Promise<OctopusApiResponse<null>> {
  try {
    const result = await fetchOctopusApi<null>(
      config,
      { kind: OCTOPUS_API_OPERATIONS.DeleteChannel, channelId },
      {},
      "mutation",
    )
    logger.info("Channel deleted", { id: channelId })
    return result
  } catch (error) {
    logger.error("Failed to delete channel")
    throw error
  }
}

/**
 * 获取上游模型列表
 */
export async function fetchRemoteModels(
  config: OctopusConfig,
  channelData: OctopusFetchModelInput,
  options?: Pick<OctopusRequestInit, "signal" | "protectionBypassExecution">,
): Promise<string[]> {
  try {
    const result = await fetchOctopusApi<string[]>(
      config,
      {
        kind: OCTOPUS_API_OPERATIONS.FetchRemoteModels,
        input: channelData,
      },
      {
        signal: options?.signal,
        protectionBypassExecution: options?.protectionBypassExecution,
      },
    )
    return result.data || []
  } catch (error) {
    logger.error("Failed to fetch remote models", error)
    throw error
  }
}

/**
 * Octopus LLMInfo 类型（模型价格信息）
 */
interface OctopusLLMInfo {
  name: string
  input: number
  output: number
  cache_read: number
  cache_write: number
}

/**
 * Octopus Group 类型（分组信息）
 */
interface OctopusGroup {
  id: number
  name: string
  mode: number
  match_regex: string
  first_token_time_out: number
  items: Array<{
    id: number
    group_id: number
    channel_id: number
    model_name: string
    priority: number
    weight: number
  }>
}

/**
 * 获取可用模型列表
 * 调用 Octopus 的 /api/v1/model/list 端点，返回模型名称数组
 */
export async function fetchAvailableModels(
  config: OctopusConfig,
): Promise<string[]> {
  try {
    const result = await fetchOctopusApi<OctopusLLMInfo[]>(config, {
      kind: OCTOPUS_API_OPERATIONS.ListAvailableModels,
    })
    return (result.data || []).map((model) => model.name)
  } catch (error) {
    logger.error("Failed to fetch available models", error)
    throw error
  }
}

/**
 * 获取分组列表
 * 调用 Octopus 的 /api/v1/group/list 端点，返回分组名称数组
 */
export async function fetchGroups(config: OctopusConfig): Promise<string[]> {
  try {
    const result = await fetchOctopusApi<OctopusGroup[]>(config, {
      kind: OCTOPUS_API_OPERATIONS.ListGroups,
    })
    return (result.data || []).map((group) => group.name)
  } catch (error) {
    logger.error("Failed to fetch groups", error)
    throw error
  }
}

export { octopusAuthManager } from "./auth"

const createOctopusRequestHeaders = (
  session: OctopusAuthSession,
  headers?: HeadersInit,
): Headers => {
  const token =
    session.mode === OCTOPUS_AUTH_MODES.Bearer ? session.token : undefined
  const requestHeaders = new Headers(buildOctopusAuthHeaders(token))
  const overrideHeaders = new Headers(headers)
  for (const [name, value] of overrideHeaders.entries()) {
    requestHeaders.set(name, value)
  }
  return requestHeaders
}

const getStoredOctopusConfig = async (): Promise<OctopusConfig | null> => {
  const octopusConfig = (await userPreferences.getPreferences())?.octopus
  if (
    !octopusConfig?.baseUrl ||
    !octopusConfig?.username ||
    !octopusConfig?.password
  ) {
    return null
  }
  return {
    baseUrl: octopusConfig.baseUrl,
    username: octopusConfig.username,
    password: octopusConfig.password,
  }
}

/**
 * 获取站点分组列表（符合 common API 签名）
 * 使用当前 Octopus 管理员会话调用 /api/v1/group/list
 * 注意：忽略 request 中的 auth 参数，使用 Octopus 配置中的凭据
 */
export async function fetchSiteUserGroups(
  _request: ApiServiceRequest,
): Promise<string[]> {
  try {
    const octopusConfig = await getStoredOctopusConfig()
    if (!octopusConfig) {
      logger.warn("Octopus config not available, returning empty groups")
      return []
    }
    return await fetchGroups(octopusConfig)
  } catch (error) {
    logger.error("Failed to fetch site user groups", error)
    return []
  }
}

/**
 * 获取账号可用模型列表（符合 common API 签名）
 * 使用当前 Octopus 管理员会话调用 /api/v1/model/list
 * 注意：忽略 request 中的 auth 参数，使用 Octopus 配置中的凭据
 */
export async function fetchAccountAvailableModels(
  _request: ApiServiceRequest,
): Promise<string[]> {
  try {
    const octopusConfig = await getStoredOctopusConfig()
    if (!octopusConfig) {
      logger.warn("Octopus config not available, returning empty models")
      return []
    }
    return await fetchAvailableModels(octopusConfig)
  } catch (error) {
    logger.error("Failed to fetch account available models", error)
    return []
  }
}
