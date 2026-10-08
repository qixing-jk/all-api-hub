import {
  OCTOPUS_AUTH_MODES,
  OCTOPUS_COOKIE_API_VERSIONS,
  octopusAuthManager,
  type OctopusAuthSession,
} from "~/services/apiService/octopus/auth"
import {
  fetchOctopusV013ChannelDetail,
  resolveOctopusCookieApiVersion,
} from "~/services/apiService/octopus/cookieProtocol"
import { OCTOPUS_API_OPERATIONS } from "~/services/apiService/octopus/operations"
import {
  throwIfOctopusRequestAborted,
  type OctopusRequestInit,
} from "~/services/apiService/octopus/requestContext"
import { fetchOctopusApi } from "~/services/apiService/octopus/requestExecution"
import { ApiError } from "~/services/apiTransport/errors"
import {
  sharePendingConfigRead,
  type ScheduledReadOptions,
} from "~/services/apiTransport/requestScheduling"
import { createUserCommandProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_USER_COMMANDS,
  type ProtectionBypassSurface,
} from "~/services/protectionBypass/contracts"
import {
  OCTOPUS_CHANNEL_DETAIL_AVAILABILITY,
  type OctopusApiResponse,
  type OctopusChannel,
  type OctopusCreateChannelInput,
  type OctopusUpdateChannelInput,
} from "~/types/octopus"
import type { OctopusConfig } from "~/types/octopusConfig"
import { OCTOPUS_API_RESOURCE_BINDINGS } from "~/types/tempWindowFetch"
import { createLogger } from "~/utils/core/logger"
import { normalizeBaseUrl } from "~/utils/core/url"

const logger = createLogger("OctopusAPI")

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

/** Resolves whether this deployment appends protocol paths to channel origins. */
export async function usesChannelProtocolPaths(
  config: OctopusConfig,
  options?: Pick<OctopusRequestInit, "signal" | "protectionBypassExecution">,
): Promise<boolean> {
  options?.signal?.throwIfAborted()
  const session = await octopusAuthManager.getValidSession(config, {
    signal: options?.signal ?? undefined,
  })
  options?.signal?.throwIfAborted()
  if (session.mode !== OCTOPUS_AUTH_MODES.Cookie) return false
  const version = await resolveOctopusCookieApiVersion({
    config,
    session,
    baseUrl: normalizeBaseUrl(config.baseUrl),
    signal: options?.signal ?? undefined,
    protectionBypassExecution: options?.protectionBypassExecution,
  })
  options?.signal?.throwIfAborted()
  return version === OCTOPUS_COOKIE_API_VERSIONS.V013
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
  if (!channel) throw new ApiError(`Channel ${channelId} was not found`, 404)
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

const SEARCH_DETAIL_CONCURRENCY = 4

// Search fetches the full inventory before filtering. Keep protection intent in
// its identity so interactive and automatic execution never borrow each other's policy.
const readSearchInventory = sharePendingConfigRead(
  async (
    {
      protectionBypassExecution,
      ...config
    }: OctopusConfig & Pick<OctopusRequestInit, "protectionBypassExecution">,
    options,
  ) => {
    const requestOptions = { ...options, protectionBypassExecution }
    const channels = await listChannels(config, requestOptions)
    const inventory: OctopusChannel[] = []

    // v0.13 stats omit base URLs and keys. Matching needs full details, while
    // ordinary listChannels callers keep the lightweight stats inventory.
    // https://github.com/bestruirui/octopus/blob/v0.13.4/internal/model/channel.go
    for (
      let offset = 0;
      offset < channels.length;
      offset += SEARCH_DETAIL_CONCURRENCY
    ) {
      throwIfOctopusRequestAborted(options.signal)
      const batch = await Promise.all(
        channels
          .slice(offset, offset + SEARCH_DETAIL_CONCURRENCY)
          .map(async (channel) => {
            if (
              channel.detailAvailability !==
              OCTOPUS_CHANNEL_DETAIL_AVAILABILITY.Summary
            ) {
              return channel
            }
            const detail = await getChannel(config, channel.id, requestOptions)
            if (detail.id !== channel.id) {
              throw new Error(
                "Octopus channel detail identity does not match its summary",
              )
            }
            return {
              ...channel,
              ...detail,
              detailAvailability: OCTOPUS_CHANNEL_DETAIL_AVAILABILITY.Full,
            }
          }),
      )
      inventory.push(...batch)
    }
    return inventory
  },
)

/** 搜索渠道（按名称或上游 URL 过滤）。 */
export async function searchChannels(
  config: OctopusConfig,
  keyword: string,
  options?: ScheduledReadOptions &
    Pick<OctopusRequestInit, "protectionBypassExecution">,
): Promise<OctopusChannel[]> {
  const channels = await readSearchInventory(
    {
      ...config,
      protectionBypassExecution: options?.protectionBypassExecution,
    },
    options,
  )
  const lowerKeyword = keyword.trim().toLowerCase()
  if (!lowerKeyword) return channels
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
  options?: Pick<OctopusRequestInit, "signal" | "protectionBypassExecution">,
): Promise<OctopusApiResponse<OctopusChannel>> {
  try {
    const result = await fetchOctopusApi<OctopusChannel>(
      config,
      { kind: OCTOPUS_API_OPERATIONS.CreateChannel, input: data },
      options ?? {},
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
  options?: Pick<OctopusRequestInit, "signal" | "protectionBypassExecution">,
): Promise<OctopusApiResponse<null>> {
  try {
    const result = await fetchOctopusApi<null>(
      config,
      { kind: OCTOPUS_API_OPERATIONS.DeleteChannel, channelId },
      options ?? {},
      "mutation",
    )
    logger.info("Channel deleted", { id: channelId })
    return result
  } catch (error) {
    logger.error("Failed to delete channel")
    throw error
  }
}

/** Resolve credential editing from the probed protocol, never from version labels. */
export async function getChannelKeyManagement(
  config: OctopusConfig,
  options?: Pick<RequestInit, "signal">,
): Promise<"single" | "legacy" | "named"> {
  const session = await octopusAuthManager.getValidSession(config, options)
  if (session.mode === OCTOPUS_AUTH_MODES.Bearer) return "legacy"
  return (await usesChannelProtocolPaths(config, options)) ? "named" : "single"
}
