import { ChannelType, DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import {
  DONE_HUB,
  NEW_API,
  OCTOPUS,
  type ManagedSiteType,
} from "~/constants/siteType"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import { fetchChannel as fetchDoneHubChannel } from "~/services/apiService/doneHub"
import {
  getManagedSiteServiceForType,
  type ManagedSiteService,
} from "~/services/managedSites/managedSiteService"
import {
  buildOctopusBaseUrl,
  mapChannelTypeToOctopusOutboundType,
  mapOctopusOutboundTypeToChannelType,
} from "~/services/managedSites/providers/octopus"
import { getManagedSiteAdminConfigForType } from "~/services/managedSites/utils/managedSite"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import { AuthTypeEnum } from "~/types"
import type { ChannelFormData, ManagedSiteChannel } from "~/types/managedSite"
import {
  MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES,
  type ManagedSiteChannelMigrationBlockedReasonCode,
  type ManagedSiteChannelMigrationExecutionItem,
  type ManagedSiteChannelMigrationExecutionResult,
  type ManagedSiteChannelMigrationItemWarningCode,
  type ManagedSiteChannelMigrationPreview,
  type ManagedSiteChannelMigrationPreviewItem,
} from "~/types/managedSiteMigration"
import { getErrorMessage } from "~/utils/core/error"
import { normalizeList } from "~/utils/core/string"

interface PrepareManagedSiteChannelMigrationPreviewParams {
  preferences: UserPreferences
  sourceSiteType: ManagedSiteType
  targetSiteType: ManagedSiteType
  channels: ManagedSiteChannel[]
  resolveNewApiSourceKey?: (params: {
    channelId: number
    channelName: string
  }) => Promise<string>
}

interface ExecuteManagedSiteChannelMigrationParams {
  preview: ManagedSiteChannelMigrationPreview
}

interface SourceKeyResolutionResult {
  key: string | null
  blockingReasonCode?: ManagedSiteChannelMigrationBlockedReasonCode
  blockingMessage?: string
}

const parseDelimitedValues = (value: string | null | undefined) =>
  normalizeList(value?.split(",") ?? [])

const hasMeaningfulValue = (value: string | null | undefined) =>
  Boolean(value?.trim())

const hasMultiKeyState = (channel: ManagedSiteChannel) =>
  Boolean(
    channel.channel_info?.is_multi_key ||
      (channel.channel_info?.multi_key_size ?? 0) > 0 ||
      channel.channel_info?.multi_key_status_list?.length ||
      channel.channel_info?.multi_key_mode,
  )

const createAccessTokenRequest = (
  baseUrl: string,
  adminToken: string,
  userId: number | string,
): ApiServiceRequest => ({
  baseUrl,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: adminToken,
    userId,
  },
})

const getSharedChannelType = (
  sourceSiteType: ManagedSiteType,
  channel: ManagedSiteChannel,
) => {
  if (sourceSiteType === OCTOPUS) {
    return mapOctopusOutboundTypeToChannelType(channel.type)
  }

  return (channel.type ?? DEFAULT_CHANNEL_FIELDS.type) as ChannelType
}

const getTargetChannelType = (
  sourceSiteType: ManagedSiteType,
  targetSiteType: ManagedSiteType,
  channel: ManagedSiteChannel,
) => {
  const sharedType = getSharedChannelType(sourceSiteType, channel)

  if (targetSiteType === OCTOPUS) {
    return mapChannelTypeToOctopusOutboundType(sharedType)
  }

  return sharedType
}

const collectItemWarningCodes = (params: {
  sourceSiteType: ManagedSiteType
  targetSiteType: ManagedSiteType
  channel: ManagedSiteChannel
}): ManagedSiteChannelMigrationItemWarningCode[] => {
  const { sourceSiteType, targetSiteType, channel } = params
  const warnings = new Set<ManagedSiteChannelMigrationItemWarningCode>()

  if (hasMeaningfulValue(channel.model_mapping)) {
    warnings.add(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MODEL_MAPPING,
    )
  }

  if (hasMeaningfulValue(channel.status_code_mapping)) {
    warnings.add(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_STATUS_CODE_MAPPING,
    )
  }

  if (
    hasMeaningfulValue(channel.setting) ||
    hasMeaningfulValue(channel.settings)
  ) {
    warnings.add(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_ADVANCED_SETTINGS,
    )
  }

  if (hasMultiKeyState(channel)) {
    warnings.add(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MULTI_KEY_STATE,
    )
  }

  if (sourceSiteType !== targetSiteType) {
    if (sourceSiteType === OCTOPUS || targetSiteType === OCTOPUS) {
      warnings.add(
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
      )
    }
  }

  if (targetSiteType === OCTOPUS) {
    const normalizedBaseUrl = buildOctopusBaseUrl(channel.base_url ?? "")
    if ((channel.base_url ?? "").trim() !== normalizedBaseUrl) {
      warnings.add(
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_NORMALIZES_BASE_URL,
      )
    }

    const groups = parseDelimitedValues(channel.group)
    if (groups.length !== 1 || groups[0] !== DEFAULT_CHANNEL_FIELDS.groups[0]) {
      warnings.add(
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
      )
    }

    if ((channel.priority ?? DEFAULT_CHANNEL_FIELDS.priority) !== 0) {
      warnings.add(
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_PRIORITY,
      )
    }

    if ((channel.weight ?? DEFAULT_CHANNEL_FIELDS.weight) !== 0) {
      warnings.add(
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_WEIGHT,
      )
    }

    if (![1, 2].includes(channel.status ?? DEFAULT_CHANNEL_FIELDS.status)) {
      warnings.add(
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_SIMPLIFIES_STATUS,
      )
    }
  }

  return Array.from(warnings)
}

const buildDraftFromSourceChannel = (params: {
  sourceSiteType: ManagedSiteType
  targetSiteType: ManagedSiteType
  channel: ManagedSiteChannel
  key: string
}): ChannelFormData => {
  const { sourceSiteType, targetSiteType, channel, key } = params
  const groups = parseDelimitedValues(channel.group)
  const models = parseDelimitedValues(channel.models)
  const targetStatus =
    targetSiteType === OCTOPUS
      ? channel.status === 1
        ? 1
        : 2
      : channel.status ?? DEFAULT_CHANNEL_FIELDS.status

  return {
    name: channel.name?.trim() || `Channel #${channel.id}`,
    type: getTargetChannelType(sourceSiteType, targetSiteType, channel),
    key: key.trim(),
    base_url:
      targetSiteType === OCTOPUS
        ? buildOctopusBaseUrl(channel.base_url ?? "")
        : (channel.base_url ?? "").trim(),
    models,
    groups:
      targetSiteType === OCTOPUS
        ? [...DEFAULT_CHANNEL_FIELDS.groups]
        : groups.length > 0
          ? groups
          : [...DEFAULT_CHANNEL_FIELDS.groups],
    priority:
      targetSiteType === OCTOPUS
        ? DEFAULT_CHANNEL_FIELDS.priority
        : channel.priority ?? DEFAULT_CHANNEL_FIELDS.priority,
    weight:
      targetSiteType === OCTOPUS
        ? DEFAULT_CHANNEL_FIELDS.weight
        : channel.weight ?? DEFAULT_CHANNEL_FIELDS.weight,
    status: targetStatus,
  }
}

const resolveSourceChannelKey = async (params: {
  preferences: UserPreferences
  sourceSiteType: ManagedSiteType
  channel: ManagedSiteChannel
  resolveNewApiSourceKey?: PrepareManagedSiteChannelMigrationPreviewParams["resolveNewApiSourceKey"]
}): Promise<SourceKeyResolutionResult> => {
  const { preferences, sourceSiteType, channel, resolveNewApiSourceKey } =
    params
  const existingKey = channel.key?.trim()
  if (existingKey) {
    return { key: existingKey }
  }

  if (sourceSiteType === NEW_API) {
    if (!resolveNewApiSourceKey) {
      return {
        key: null,
        blockingReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
      }
    }

    try {
      const key = await resolveNewApiSourceKey({
        channelId: channel.id,
        channelName: channel.name,
      })
      const resolvedKey = key.trim()
      if (!resolvedKey) {
        return {
          key: null,
          blockingReasonCode:
            MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
        }
      }

      return {
        key: resolvedKey,
      }
    } catch (error) {
      return {
        key: null,
        blockingReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        blockingMessage: getErrorMessage(error),
      }
    }
  }

  if (sourceSiteType === DONE_HUB) {
    const sourceConfig = getManagedSiteAdminConfigForType(preferences, DONE_HUB)
    if (!sourceConfig) {
      return {
        key: null,
        blockingReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        blockingMessage: "Source managed-site configuration is missing.",
      }
    }

    try {
      const detailedChannel = await fetchDoneHubChannel(
        createAccessTokenRequest(
          sourceConfig.baseUrl,
          sourceConfig.adminToken,
          sourceConfig.userId,
        ),
        channel.id,
      )
      const resolvedKey = detailedChannel.key?.trim()
      if (resolvedKey) {
        return { key: resolvedKey }
      }

      return {
        key: null,
        blockingReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
      }
    } catch (error) {
      return {
        key: null,
        blockingReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        blockingMessage: getErrorMessage(error),
      }
    }
  }

  return {
    key: null,
    blockingReasonCode:
      MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
  }
}

const buildBlockedPreviewItem = (params: {
  channel: ManagedSiteChannel
  sourceSiteType: ManagedSiteType
  targetSiteType: ManagedSiteType
  blockingReasonCode?: ManagedSiteChannelMigrationBlockedReasonCode
  blockingMessage?: string
}): ManagedSiteChannelMigrationPreviewItem => ({
  channelId: params.channel.id,
  channelName: params.channel.name,
  sourceChannel: params.channel,
  draft: null,
  status: "blocked",
  warningCodes: collectItemWarningCodes({
    sourceSiteType: params.sourceSiteType,
    targetSiteType: params.targetSiteType,
    channel: params.channel,
  }),
  blockingReasonCode: params.blockingReasonCode,
  blockingMessage: params.blockingMessage,
})

/**
 * Resolves the final preview row, including any source-key hydration required
 * before a target channel can be created safely.
 */
async function buildPreviewItem(
  params: PrepareManagedSiteChannelMigrationPreviewParams & {
    channel: ManagedSiteChannel
  },
): Promise<ManagedSiteChannelMigrationPreviewItem> {
  const { channel, sourceSiteType, targetSiteType } = params

  const keyResolution = await resolveSourceChannelKey({
    preferences: params.preferences,
    sourceSiteType,
    channel,
    resolveNewApiSourceKey: params.resolveNewApiSourceKey,
  })

  if (!keyResolution.key) {
    return buildBlockedPreviewItem({
      channel,
      sourceSiteType,
      targetSiteType,
      blockingReasonCode: keyResolution.blockingReasonCode,
      blockingMessage: keyResolution.blockingMessage,
    })
  }

  return {
    channelId: channel.id,
    channelName: channel.name,
    sourceChannel: channel,
    draft: buildDraftFromSourceChannel({
      sourceSiteType,
      targetSiteType,
      channel,
      key: keyResolution.key,
    }),
    status: "ready",
    warningCodes: collectItemWarningCodes({
      sourceSiteType,
      targetSiteType,
      channel,
    }),
  }
}

/**
 * Converts a target-config failure into per-channel execution results so the UI
 * can still show which rows were blocked versus which ready rows failed.
 */
const buildCreateFailureResults = (
  preview: ManagedSiteChannelMigrationPreview,
  message: string,
): ManagedSiteChannelMigrationExecutionResult => {
  const items: ManagedSiteChannelMigrationExecutionItem[] = preview.items.map(
    (item) => {
      if (item.status !== "ready") {
        return {
          channelId: item.channelId,
          channelName: item.channelName,
          success: false,
          skipped: true,
          error: item.blockingMessage,
        }
      }

      return {
        channelId: item.channelId,
        channelName: item.channelName,
        success: false,
        skipped: false,
        error: message,
      }
    },
  )

  return {
    totalSelected: preview.totalCount,
    attemptedCount: 0,
    createdCount: 0,
    failedCount: preview.readyCount,
    skippedCount: preview.blockedCount,
    items,
  }
}

/**
 * Builds a create-only migration preview for the selected source channels and
 * target managed-site type, including per-row warnings and blockers.
 */
export async function prepareManagedSiteChannelMigrationPreview(
  params: PrepareManagedSiteChannelMigrationPreviewParams,
): Promise<ManagedSiteChannelMigrationPreview> {
  const items = await Promise.all(
    params.channels.map((channel) =>
      buildPreviewItem({
        ...params,
        channel,
      }),
    ),
  )

  const readyCount = items.filter((item) => item.status === "ready").length
  const blockedCount = items.length - readyCount

  return {
    sourceSiteType: params.sourceSiteType,
    targetSiteType: params.targetSiteType,
    generalWarningCodes: [
      MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.CREATE_ONLY,
      MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.NO_DEDUPE_OR_SYNC,
      MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.NO_ROLLBACK,
    ],
    items,
    totalCount: items.length,
    readyCount,
    blockedCount,
  }
}

/**
 * Creates target channels for every ready preview row and returns a
 * channel-by-channel execution summary without mutating the source site.
 */
export async function executeManagedSiteChannelMigration(
  params: ExecuteManagedSiteChannelMigrationParams,
): Promise<ManagedSiteChannelMigrationExecutionResult> {
  const { preview } = params
  const targetService: ManagedSiteService = getManagedSiteServiceForType(
    preview.targetSiteType,
  )
  const targetConfig = await targetService.getConfig()

  if (!targetConfig) {
    return buildCreateFailureResults(
      preview,
      "Target managed-site configuration is missing.",
    )
  }

  const items: ManagedSiteChannelMigrationExecutionItem[] = []
  let attemptedCount = 0
  let createdCount = 0
  let failedCount = 0
  let skippedCount = 0

  for (const item of preview.items) {
    if (item.status !== "ready" || !item.draft) {
      skippedCount += 1
      items.push({
        channelId: item.channelId,
        channelName: item.channelName,
        success: false,
        skipped: true,
        error: item.blockingMessage,
      })
      continue
    }

    attemptedCount += 1

    try {
      const payload = targetService.buildChannelPayload(item.draft)
      const response = await targetService.createChannel(
        targetConfig.baseUrl,
        targetConfig.token,
        targetConfig.userId,
        payload,
      )

      if (!response.success) {
        failedCount += 1
        items.push({
          channelId: item.channelId,
          channelName: item.channelName,
          success: false,
          skipped: false,
          error: response.message || "Unknown error",
        })
        continue
      }

      createdCount += 1
      items.push({
        channelId: item.channelId,
        channelName: item.channelName,
        success: true,
        skipped: false,
      })
    } catch (error) {
      failedCount += 1
      items.push({
        channelId: item.channelId,
        channelName: item.channelName,
        success: false,
        skipped: false,
        error: getErrorMessage(error),
      })
    }
  }

  return {
    totalSelected: preview.totalCount,
    attemptedCount,
    createdCount,
    failedCount,
    skippedCount,
    items,
  }
}
