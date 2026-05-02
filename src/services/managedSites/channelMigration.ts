import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import { ChannelType, DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import {
  AXON_HUB,
  CLAUDE_CODE_HUB,
  NEW_API,
  OCTOPUS,
  type ManagedSiteType,
} from "~/constants/siteType"
import {
  getManagedSiteServiceForType,
  type ManagedSiteService,
} from "~/services/managedSites/managedSiteService"
import {
  buildOctopusBaseUrl,
  mapChannelTypeToOctopusOutboundType,
  mapOctopusOutboundTypeToChannelType,
} from "~/services/managedSites/providers/octopus"
import {
  getManagedSiteAdminConfigForType,
  needsManagedSiteChannelKeyResolution,
} from "~/services/managedSites/utils/managedSite"
import type { UserPreferences } from "~/services/preferences/userPreferences"
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

const areStringArraysEqual = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  left.every((item, index) => item === right[index])

const hasMeaningfulValue = (value: string | null | undefined) =>
  Boolean(value?.trim())

const hasMultiKeyState = (channel: ManagedSiteChannel) =>
  Boolean(
    channel.channel_info?.is_multi_key ||
      (channel.channel_info?.multi_key_size ?? 0) > 0 ||
      channel.channel_info?.multi_key_status_list?.length ||
      channel.channel_info?.multi_key_mode,
  )

const PREVIEW_BUILD_CONCURRENCY = 5

const AXON_HUB_TO_SHARED_CHANNEL_TYPE: Partial<Record<string, ChannelType>> = {
  [AXON_HUB_CHANNEL_TYPE.OPENAI]: ChannelType.OpenAI,
  [AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES]: ChannelType.OpenAI,
  [AXON_HUB_CHANNEL_TYPE.ANTHROPIC]: ChannelType.Anthropic,
  [AXON_HUB_CHANNEL_TYPE.ANTHROPIC_AWS]: ChannelType.Anthropic,
  [AXON_HUB_CHANNEL_TYPE.ANTHROPIC_GCP]: ChannelType.Anthropic,
  [AXON_HUB_CHANNEL_TYPE.CLAUDECODE]: ChannelType.Anthropic,
  [AXON_HUB_CHANNEL_TYPE.GEMINI_OPENAI]: ChannelType.Gemini,
  [AXON_HUB_CHANNEL_TYPE.GEMINI]: ChannelType.Gemini,
  [AXON_HUB_CHANNEL_TYPE.GEMINI_VERTEX]: ChannelType.Gemini,
  [AXON_HUB_CHANNEL_TYPE.DEEPSEEK]: ChannelType.DeepSeek,
  [AXON_HUB_CHANNEL_TYPE.DEEPSEEK_ANTHROPIC]: ChannelType.DeepSeek,
  [AXON_HUB_CHANNEL_TYPE.OPENROUTER]: ChannelType.OpenRouter,
  [AXON_HUB_CHANNEL_TYPE.XAI]: ChannelType.Xai,
  [AXON_HUB_CHANNEL_TYPE.SILICONFLOW]: ChannelType.SiliconFlow,
  [AXON_HUB_CHANNEL_TYPE.VOLCENGINE]: ChannelType.VolcEngine,
  [AXON_HUB_CHANNEL_TYPE.OLLAMA]: ChannelType.Ollama,
  [AXON_HUB_CHANNEL_TYPE.GITHUB_COPILOT]: ChannelType.OpenAI,
  [AXON_HUB_CHANNEL_TYPE.NANOGPT]: ChannelType.OpenAI,
}

const SHARED_TO_AXON_HUB_CHANNEL_TYPE: Partial<Record<ChannelType, string>> = {
  [ChannelType.Unknown]: AXON_HUB_CHANNEL_TYPE.OPENAI,
  [ChannelType.OpenAI]: AXON_HUB_CHANNEL_TYPE.OPENAI,
  [ChannelType.Azure]: AXON_HUB_CHANNEL_TYPE.OPENAI,
  [ChannelType.OpenAIMax]: AXON_HUB_CHANNEL_TYPE.OPENAI,
  [ChannelType.OhMyGPT]: AXON_HUB_CHANNEL_TYPE.OPENAI,
  [ChannelType.Custom]: AXON_HUB_CHANNEL_TYPE.OPENAI,
  [ChannelType.AILS]: AXON_HUB_CHANNEL_TYPE.OPENAI,
  [ChannelType.AIProxy]: AXON_HUB_CHANNEL_TYPE.OPENAI,
  [ChannelType.API2GPT]: AXON_HUB_CHANNEL_TYPE.OPENAI,
  [ChannelType.AIGC2D]: AXON_HUB_CHANNEL_TYPE.OPENAI,
  [ChannelType.Anthropic]: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
  [ChannelType.OpenRouter]: AXON_HUB_CHANNEL_TYPE.OPENROUTER,
  [ChannelType.Gemini]: AXON_HUB_CHANNEL_TYPE.GEMINI,
  [ChannelType.VertexAi]: AXON_HUB_CHANNEL_TYPE.GEMINI,
  [ChannelType.SiliconFlow]: AXON_HUB_CHANNEL_TYPE.SILICONFLOW,
  [ChannelType.DeepSeek]: AXON_HUB_CHANNEL_TYPE.DEEPSEEK,
  [ChannelType.VolcEngine]: AXON_HUB_CHANNEL_TYPE.VOLCENGINE,
  [ChannelType.Xai]: AXON_HUB_CHANNEL_TYPE.XAI,
  [ChannelType.Ollama]: AXON_HUB_CHANNEL_TYPE.OLLAMA,
}

const CLAUDE_CODE_HUB_TO_SHARED_CHANNEL_TYPE: Partial<
  Record<string, ChannelType>
> = {
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE]: ChannelType.OpenAI,
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX]: ChannelType.OpenAI,
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE]: ChannelType.Anthropic,
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI]: ChannelType.Gemini,
}

const SHARED_TO_CLAUDE_CODE_HUB_PROVIDER_TYPE: Partial<
  Record<ChannelType, string>
> = {
  [ChannelType.Unknown]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [ChannelType.OpenAI]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [ChannelType.Azure]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [ChannelType.OpenAIMax]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [ChannelType.OhMyGPT]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [ChannelType.Custom]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [ChannelType.AILS]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [ChannelType.AIProxy]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [ChannelType.API2GPT]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [ChannelType.AIGC2D]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [ChannelType.Anthropic]: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
  [ChannelType.OpenRouter]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [ChannelType.Gemini]: CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI,
  [ChannelType.VertexAi]: CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI,
  [ChannelType.SiliconFlow]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [ChannelType.DeepSeek]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [ChannelType.VolcEngine]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [ChannelType.Xai]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [ChannelType.Ollama]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
}

const getSafeClaudeCodeHubWeight = (weight?: number) => {
  const numericWeight = Number(weight ?? 1)
  if (!Number.isFinite(numericWeight)) {
    return 1
  }

  return Math.max(1, Math.trunc(numericWeight))
}

const mapWithConcurrency = async <TItem, TResult>(
  items: TItem[],
  concurrency: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> => {
  if (items.length === 0) {
    return []
  }

  const results = new Array<TResult>(items.length)
  let nextIndex = 0

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const index = nextIndex
        nextIndex += 1

        if (index >= items.length) {
          return
        }

        results[index] = await mapper(items[index], index)
      }
    },
  )

  await Promise.all(workers)

  return results
}

const getSharedChannelType = (
  sourceSiteType: ManagedSiteType,
  channel: ManagedSiteChannel,
): ChannelType => {
  const numericChannelType =
    typeof channel.type === "number"
      ? channel.type
      : sourceSiteType === AXON_HUB
        ? AXON_HUB_TO_SHARED_CHANNEL_TYPE[channel.type] ?? ChannelType.OpenAI
        : sourceSiteType === CLAUDE_CODE_HUB
          ? CLAUDE_CODE_HUB_TO_SHARED_CHANNEL_TYPE[channel.type] ??
            ChannelType.OpenAI
          : ChannelType.OpenAI

  if (sourceSiteType === OCTOPUS) {
    return mapOctopusOutboundTypeToChannelType(numericChannelType)
  }

  return numericChannelType as ChannelType
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

  if (targetSiteType === AXON_HUB) {
    // AxonHub rejects New API numeric channel types. Unknown or unsupported
    // shared types fall back to OpenAI-compatible with a preview remap warning.
    return (
      SHARED_TO_AXON_HUB_CHANNEL_TYPE[sharedType] ??
      AXON_HUB_CHANNEL_TYPE.OPENAI
    )
  }

  if (targetSiteType === CLAUDE_CODE_HUB) {
    // Claude Code Hub uses string provider types. Source types that cannot be
    // represented exactly fall back to OpenAI-compatible and receive a preview
    // remap warning before the create payload is built.
    return (
      SHARED_TO_CLAUDE_CODE_HUB_PROVIDER_TYPE[sharedType] ??
      CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE
    )
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
    if (
      sourceSiteType === OCTOPUS ||
      targetSiteType === OCTOPUS ||
      targetSiteType === AXON_HUB ||
      targetSiteType === CLAUDE_CODE_HUB ||
      ((sourceSiteType === AXON_HUB || sourceSiteType === CLAUDE_CODE_HUB) &&
        typeof channel.type === "string")
    ) {
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

  if (targetSiteType === AXON_HUB) {
    const sourceGroups = parseDelimitedValues(channel.group)
    const emittedGroups = [...DEFAULT_CHANNEL_FIELDS.groups]
    if (!areStringArraysEqual(sourceGroups, emittedGroups)) {
      warnings.add(
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
      )
    }

    if ((channel.priority ?? DEFAULT_CHANNEL_FIELDS.priority) !== 0) {
      warnings.add(
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_PRIORITY,
      )
    }

    if (![1, 2].includes(channel.status ?? DEFAULT_CHANNEL_FIELDS.status)) {
      warnings.add(
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_SIMPLIFIES_STATUS,
      )
    }
  }

  if (targetSiteType === CLAUDE_CODE_HUB) {
    const sourceGroups = parseDelimitedValues(channel.group)
    const emittedGroups =
      sourceGroups.length > 0 ? [sourceGroups[0]] : ["default"]
    if (!areStringArraysEqual(sourceGroups, emittedGroups)) {
      warnings.add(
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
      )
    }

    const sourceWeight = channel.weight ?? DEFAULT_CHANNEL_FIELDS.weight
    if (getSafeClaudeCodeHubWeight(sourceWeight) !== sourceWeight) {
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
    targetSiteType === OCTOPUS ||
    targetSiteType === AXON_HUB ||
    targetSiteType === CLAUDE_CODE_HUB
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
      targetSiteType === OCTOPUS || targetSiteType === AXON_HUB
        ? [...DEFAULT_CHANNEL_FIELDS.groups]
        : targetSiteType === CLAUDE_CODE_HUB
          ? [groups[0] ?? "default"]
          : groups.length > 0
            ? groups
            : [...DEFAULT_CHANNEL_FIELDS.groups],
    priority:
      targetSiteType === OCTOPUS || targetSiteType === AXON_HUB
        ? DEFAULT_CHANNEL_FIELDS.priority
        : channel.priority ?? DEFAULT_CHANNEL_FIELDS.priority,
    weight:
      targetSiteType === OCTOPUS
        ? DEFAULT_CHANNEL_FIELDS.weight
        : targetSiteType === CLAUDE_CODE_HUB
          ? getSafeClaudeCodeHubWeight(channel.weight)
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
  const existingKey = channel.key?.trim() ?? ""
  if (!needsManagedSiteChannelKeyResolution(existingKey)) {
    return { key: existingKey }
  }

  if (sourceSiteType === CLAUDE_CODE_HUB) {
    const rawProviderKey = (
      channel as ManagedSiteChannel & {
        _claudeCodeHubData?: { key?: string | null }
      }
    )._claudeCodeHubData?.key?.trim()

    // Claude Code Hub list data may include only masked display keys. A raw
    // provider key is safe to reuse only when upstream returned real key
    // material on the authenticated provider object.
    if (
      rawProviderKey &&
      !needsManagedSiteChannelKeyResolution(rawProviderKey)
    ) {
      return { key: rawProviderKey }
    }
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
      if (needsManagedSiteChannelKeyResolution(resolvedKey)) {
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

  const sourceConfig = getManagedSiteAdminConfigForType(
    preferences,
    sourceSiteType,
  )
  if (!sourceConfig) {
    return {
      key: null,
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
      blockingMessage: "Source managed-site configuration is missing.",
    }
  }

  const sourceService = getManagedSiteServiceForType(sourceSiteType)
  if (!sourceService.fetchChannelSecretKey) {
    return {
      key: null,
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    }
  }

  try {
    const key = await sourceService.fetchChannelSecretKey(
      sourceConfig.baseUrl,
      sourceConfig.adminToken,
      sourceConfig.userId,
      channel.id,
    )
    const resolvedKey = key.trim()
    if (needsManagedSiteChannelKeyResolution(resolvedKey)) {
      return {
        key: null,
        blockingReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
      }
    }

    return { key: resolvedKey }
  } catch (error) {
    return {
      key: null,
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
      blockingMessage: getErrorMessage(error),
    }
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

const buildExecutionFailureItem = (
  item: ManagedSiteChannelMigrationPreviewItem,
  params: {
    skipped: boolean
    fallbackError?: string
  },
): ManagedSiteChannelMigrationExecutionItem => ({
  channelId: item.channelId,
  channelName: item.channelName,
  success: false,
  skipped: params.skipped,
  blockingReasonCode: item.blockingReasonCode,
  error: item.blockingMessage || params.fallbackError,
})

/**
 * Converts a target-config failure into per-channel execution results so the UI
 * can still show which rows were blocked versus which ready rows failed.
 */
const buildCreateFailureResults = (
  preview: ManagedSiteChannelMigrationPreview,
  message: string,
): ManagedSiteChannelMigrationExecutionResult => {
  const items: ManagedSiteChannelMigrationExecutionItem[] = preview.items.map(
    (item) =>
      buildExecutionFailureItem(item, {
        skipped: item.status !== "ready",
        fallbackError: message,
      }),
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
  const items = await mapWithConcurrency(
    params.channels,
    PREVIEW_BUILD_CONCURRENCY,
    (channel) =>
      buildPreviewItem({
        ...params,
        channel,
      }),
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
      items.push(
        buildExecutionFailureItem(item, {
          skipped: true,
        }),
      )
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
