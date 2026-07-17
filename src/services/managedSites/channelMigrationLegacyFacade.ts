import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import { ChannelType, DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  mapAxonHubChannelTypeToChannelType,
  mapChannelTypeToAxonHubChannelType,
} from "~/services/apiAdapters/managedResources/axonHubChannelType"
import {
  buildOctopusBaseUrl,
  mapChannelTypeToOctopusOutboundType,
  mapOctopusOutboundTypeToChannelType,
} from "~/services/managedSites/providers/octopus"
import type { ChannelFormData, ManagedSiteChannel } from "~/types/managedSite"
import {
  MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES,
  type ManagedSiteChannelMigrationItemWarningCode,
} from "~/types/managedSiteMigration"
import type {
  ManagedSiteMigrationLossSignals,
  ManagedSiteMigrationPreviewProjection,
  ManagedSiteMigrationSelection,
  ManagedSiteMigrationSource,
  ManagedSiteMigrationTargetAdjustments,
  ManagedSiteMigrationTargetPreparation,
} from "~/types/managedSiteMigrationCapability"
import { normalizeList } from "~/utils/core/string"

const parseDelimitedValues = (value: string | null | undefined) =>
  normalizeList(value?.split(",") ?? [])

const hasMeaningfulValue = (value: unknown) => {
  if (value == null) return false
  if (typeof value === "string") return Boolean(value.trim())
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.keys(value).length > 0
  return true
}

const hasMultiKeyState = (channel: ManagedSiteChannel) =>
  Boolean(
    channel.channel_info?.is_multi_key ||
      (channel.channel_info?.multi_key_size ?? 0) > 0 ||
      channel.channel_info?.multi_key_status_list?.length ||
      channel.channel_info?.multi_key_mode,
  )

const areStringArraysEqual = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((item, index) => item === right[index])

type LegacyMigrationPreviewDraft = Omit<ChannelFormData, "key">

const CLAUDE_CODE_HUB_TO_SHARED_CHANNEL_TYPE: Partial<
  Record<string, ChannelType>
> = {
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE]: ChannelType.OpenAI,
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX]: ChannelType.OpenAI,
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE]: ChannelType.Anthropic,
  [CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI]: ChannelType.Gemini,
}

const getSharedChannelType = (
  sourceSiteType: ManagedSiteType,
  channel: ManagedSiteChannel,
): ChannelType => {
  const channelType =
    typeof channel.type === "number"
      ? channel.type
      : sourceSiteType === SITE_TYPES.AXON_HUB
        ? mapAxonHubChannelTypeToChannelType(channel.type)
        : sourceSiteType === SITE_TYPES.CLAUDE_CODE_HUB
          ? CLAUDE_CODE_HUB_TO_SHARED_CHANNEL_TYPE[channel.type] ??
            ChannelType.OpenAI
          : ChannelType.OpenAI
  return sourceSiteType === SITE_TYPES.OCTOPUS
    ? mapOctopusOutboundTypeToChannelType(channelType)
    : (channelType as ChannelType)
}

const SHARED_TO_CLAUDE_CODE_HUB_PROVIDER_TYPE: Partial<
  Record<ChannelType, string>
> = {
  [ChannelType.Anthropic]: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
  [ChannelType.Gemini]: CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI,
  [ChannelType.VertexAi]: CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI,
}

const getLegacyTargetType = (
  targetSiteType: ManagedSiteType,
  resourceType: ChannelType,
) => {
  if (targetSiteType === SITE_TYPES.OCTOPUS) {
    return mapChannelTypeToOctopusOutboundType(resourceType)
  }
  if (targetSiteType === SITE_TYPES.AXON_HUB) {
    return mapChannelTypeToAxonHubChannelType(resourceType)
  }
  if (targetSiteType === SITE_TYPES.CLAUDE_CODE_HUB) {
    return (
      SHARED_TO_CLAUDE_CODE_HUB_PROVIDER_TYPE[resourceType] ??
      CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE
    )
  }
  return resourceType
}

const getSafeClaudeCodeHubWeight = (weight: number) =>
  Number.isFinite(weight) ? Math.max(1, Math.trunc(weight)) : 1

const toLegacyMigrationPreviewDraft = (params: {
  source: ManagedSiteMigrationSource
  targetSiteType: ManagedSiteType
  displayName: string
  selectionId: string
  legacyStatus?: ChannelFormData["status"]
}): LegacyMigrationPreviewDraft => ({
  name: params.displayName.trim() || `Channel #${params.selectionId}`,
  type: getLegacyTargetType(params.targetSiteType, params.source.resourceType),
  base_url:
    params.targetSiteType === SITE_TYPES.OCTOPUS
      ? buildOctopusBaseUrl(params.source.baseUrl)
      : params.source.baseUrl,
  models: [...params.source.models],
  groups:
    params.targetSiteType === SITE_TYPES.OCTOPUS ||
    params.targetSiteType === SITE_TYPES.AXON_HUB
      ? [...DEFAULT_CHANNEL_FIELDS.groups]
      : params.targetSiteType === SITE_TYPES.CLAUDE_CODE_HUB
        ? [params.source.groups[0] ?? DEFAULT_CHANNEL_FIELDS.groups[0]]
        : params.source.groups.length > 0
          ? [...params.source.groups]
          : [...DEFAULT_CHANNEL_FIELDS.groups],
  priority:
    params.targetSiteType === SITE_TYPES.OCTOPUS ||
    params.targetSiteType === SITE_TYPES.AXON_HUB
      ? DEFAULT_CHANNEL_FIELDS.priority
      : params.source.priority,
  weight:
    params.targetSiteType === SITE_TYPES.OCTOPUS
      ? DEFAULT_CHANNEL_FIELDS.weight
      : params.targetSiteType === SITE_TYPES.CLAUDE_CODE_HUB
        ? getSafeClaudeCodeHubWeight(params.source.weight)
        : params.source.weight,
  status:
    params.targetSiteType === SITE_TYPES.OCTOPUS ||
    params.targetSiteType === SITE_TYPES.AXON_HUB ||
    params.targetSiteType === SITE_TYPES.CLAUDE_CODE_HUB
      ? params.source.status === "enabled"
        ? 1
        : 2
      : params.legacyStatus ?? (params.source.status === "enabled" ? 1 : 2),
})

const getLegacyMigrationLossSignals = (
  channel: ManagedSiteChannel,
): ManagedSiteMigrationLossSignals => ({
  hasModelMapping: hasMeaningfulValue(channel.model_mapping),
  hasStatusCodeMapping: hasMeaningfulValue(channel.status_code_mapping),
  hasAdvancedSettings:
    hasMeaningfulValue(channel.setting) ||
    hasMeaningfulValue(channel.settings) ||
    hasMeaningfulValue(channel.param_override) ||
    hasMeaningfulValue(channel.header_override),
  hasMultiKeyState: hasMultiKeyState(channel),
})

/** Extracts the controlled legacy fields that cannot migrate losslessly. */
export function collectLegacyMigrationLossSignals(
  channel: ManagedSiteChannel,
): ManagedSiteMigrationLossSignals {
  return getLegacyMigrationLossSignals(channel)
}

/** Projects a legacy channel into the secret-free canonical source model. */
export function toCanonicalMigrationSourceFromLegacyChannel(params: {
  sourceSiteType: ManagedSiteType
  channel: ManagedSiteChannel
}): ManagedSiteMigrationSource {
  const { channel } = params

  return {
    sourceSiteType: params.sourceSiteType,
    resourceType: getSharedChannelType(params.sourceSiteType, channel),
    baseUrl: (channel.base_url ?? "").trim(),
    models: parseDelimitedValues(channel.models),
    groups: parseDelimitedValues(channel.group),
    priority: channel.priority ?? DEFAULT_CHANNEL_FIELDS.priority,
    weight: channel.weight ?? DEFAULT_CHANNEL_FIELDS.weight,
    status:
      channel.status == null || channel.status === 1
        ? "enabled"
        : channel.status === 2
          ? "disabled"
          : "other",
    lossSignals: getLegacyMigrationLossSignals(channel),
  }
}

type LegacyChannelWithResourceIdentity = ManagedSiteChannel & {
  resourceRef?: ManagedResourceRef
  _axonHubData?: { id?: string | null }
}

type LegacyMigrationResourceRefParams = {
  sourceSiteType: ManagedSiteType
  channel: LegacyChannelWithResourceIdentity
  scopeKey?: string
  resourceRef?: ManagedResourceRef
}

const resolveMigrationResourceRefFromLegacyRow = (
  params: LegacyMigrationResourceRefParams,
): ManagedResourceRef => {
  const existingResourceRef = params.resourceRef ?? params.channel.resourceRef
  if (existingResourceRef) {
    return existingResourceRef
  }

  return {
    siteType: params.sourceSiteType,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    scopeKey: params.scopeKey ?? "",
    resourceId:
      params.channel._axonHubData?.id?.trim() || String(params.channel.id),
  }
}

/** Preserves the AxonHub facade contract while sharing generic ref resolution. */
export function resolveAxonHubMigrationResourceRefFromLegacyRow(
  params: LegacyMigrationResourceRefParams,
): ManagedResourceRef {
  return resolveMigrationResourceRefFromLegacyRow(params)
}

/** Separates legacy numeric row identity from native resource identity. */
function toCanonicalMigrationSelectionFromLegacyRow(params: {
  sourceSiteType: ManagedSiteType
  channel: LegacyChannelWithResourceIdentity
  scopeKey?: string
  resourceRef?: ManagedResourceRef
}): ManagedSiteMigrationSelection {
  return {
    selectionId: String(params.channel.id),
    displayName: params.channel.name,
    ref: resolveMigrationResourceRefFromLegacyRow(params),
  }
}

/** Preserves the AxonHub facade contract while sharing generic row conversion. */
export function toCanonicalMigrationSelectionFromLegacyAxonRow(
  params: LegacyMigrationResourceRefParams,
): ManagedSiteMigrationSelection {
  return toCanonicalMigrationSelectionFromLegacyRow(params)
}

const getTargetAdjustments = (
  source: ManagedSiteMigrationSource,
  draft: ChannelFormData | LegacyMigrationPreviewDraft,
): ManagedSiteMigrationTargetAdjustments => ({
  remappedType: String(draft.type) !== String(source.resourceType),
  normalizedBaseUrl: draft.base_url !== source.baseUrl,
  forcedDefaultGroup: !areStringArraysEqual(draft.groups, source.groups),
  ignoredPriority: draft.priority !== source.priority,
  ignoredWeight: draft.weight !== source.weight,
  simplifiedStatus:
    source.status === "other"
      ? draft.status === 1 || draft.status === 2
      : draft.status !== (source.status === "enabled" ? 1 : 2),
})

/** Removes credentials while retaining the target preview projection and adjustments. */
export async function toCanonicalTargetPreparationFromLegacyDraft(
  params:
    | {
        source: ManagedSiteMigrationSource
        draft: ChannelFormData | LegacyMigrationPreviewDraft
      }
    | {
        source: ManagedSiteMigrationSource
        targetSiteType: ManagedSiteType
        displayName: string
        selectionId: string
        legacyStatus?: ChannelFormData["status"]
        preparePreviewDraft?: (
          draft: LegacyMigrationPreviewDraft,
        ) => Promise<LegacyMigrationPreviewDraft>
      },
): Promise<ManagedSiteMigrationTargetPreparation> {
  const { source } = params
  const draft =
    "draft" in params
      ? params.draft
      : await (params.preparePreviewDraft?.(
          toLegacyMigrationPreviewDraft(params),
        ) ?? Promise.resolve(toLegacyMigrationPreviewDraft(params)))
  const projection: ManagedSiteMigrationPreviewProjection = {
    name: draft.name,
    type: draft.type,
    baseUrl: draft.base_url,
    models: [...draft.models],
    groups: [...draft.groups],
    priority: draft.priority,
    weight: draft.weight,
    status: draft.status === 1 ? 1 : 2,
  }
  const adjustments = getTargetAdjustments(source, draft)
  if (
    "targetSiteType" in params &&
    source.sourceSiteType !== params.targetSiteType &&
    (source.sourceSiteType === SITE_TYPES.OCTOPUS ||
      source.sourceSiteType === SITE_TYPES.AXON_HUB ||
      source.sourceSiteType === SITE_TYPES.CLAUDE_CODE_HUB)
  ) {
    adjustments.remappedType = true
  }
  return { projection, adjustments }
}

/** Builds an execution-only legacy target draft from canonical data and a credential. */
export function toLegacyChannelFormDataProjection(params: {
  source: ManagedSiteMigrationSource
  target:
    | ManagedSiteMigrationTargetPreparation
    | ManagedSiteMigrationPreviewProjection
  credential: string
}): ChannelFormData {
  const projection =
    "projection" in params.target ? params.target.projection : params.target
  return {
    name: projection.name,
    type: projection.type,
    key: params.credential,
    base_url: projection.baseUrl,
    models: [...projection.models],
    groups: [...projection.groups],
    priority: projection.priority,
    weight: projection.weight,
    status: projection.status,
  }
}

/** Maps canonical loss and adjustment facts to stable legacy warning order. */
export function toLegacyMigrationWarningCodes(
  params:
    | {
        lossSignals: ManagedSiteMigrationLossSignals
        adjustments: ManagedSiteMigrationTargetAdjustments
      }
    | {
        sourceSiteType: ManagedSiteType
        targetSiteType: ManagedSiteType
        channel: ManagedSiteChannel
      },
): ManagedSiteChannelMigrationItemWarningCode[] {
  const warnings: ManagedSiteChannelMigrationItemWarningCode[] = []
  let lossSignals: ManagedSiteMigrationLossSignals
  let adjustments: ManagedSiteMigrationTargetAdjustments
  if ("channel" in params) {
    const source = toCanonicalMigrationSourceFromLegacyChannel(params)
    lossSignals = source.lossSignals
    adjustments = getTargetAdjustments(
      source,
      toLegacyMigrationPreviewDraft({
        source,
        targetSiteType: params.targetSiteType,
        displayName: params.channel.name,
        selectionId: String(params.channel.id),
        legacyStatus: params.channel.status,
      }),
    )
    adjustments.remappedType =
      params.sourceSiteType !== params.targetSiteType &&
      (params.sourceSiteType === SITE_TYPES.OCTOPUS ||
        params.targetSiteType === SITE_TYPES.OCTOPUS ||
        params.targetSiteType === SITE_TYPES.AXON_HUB ||
        params.targetSiteType === SITE_TYPES.CLAUDE_CODE_HUB ||
        ((params.sourceSiteType === SITE_TYPES.AXON_HUB ||
          params.sourceSiteType === SITE_TYPES.CLAUDE_CODE_HUB) &&
          typeof params.channel.type === "string"))
  } else {
    lossSignals = params.lossSignals
    adjustments = params.adjustments
  }

  if (lossSignals.hasModelMapping) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MODEL_MAPPING,
    )
  }
  if (lossSignals.hasStatusCodeMapping) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_STATUS_CODE_MAPPING,
    )
  }
  if (lossSignals.hasAdvancedSettings) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_ADVANCED_SETTINGS,
    )
  }
  if (lossSignals.hasMultiKeyState) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MULTI_KEY_STATE,
    )
  }
  if (adjustments.remappedType) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
    )
  }
  if (adjustments.normalizedBaseUrl) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_NORMALIZES_BASE_URL,
    )
  }
  if (adjustments.forcedDefaultGroup) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
    )
  }
  if (adjustments.ignoredPriority) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_PRIORITY,
    )
  }
  if (adjustments.ignoredWeight) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_WEIGHT,
    )
  }
  if (adjustments.simplifiedStatus) {
    warnings.push(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_SIMPLIFIES_STATUS,
    )
  }

  return warnings
}
