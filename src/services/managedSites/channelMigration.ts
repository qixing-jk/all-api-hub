import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ManagedResourceRef,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedUpstreamResourcesCapability } from "~/services/apiAdapters/contracts/managedUpstreamResources"
import {
  executeManagedSiteMigrationCore,
  prepareManagedSiteMigrationPreviewCore,
} from "~/services/managedSites/channelMigrationCanonicalOrchestrator"
import { resolveManagedSiteMigrationCapability } from "~/services/managedSites/channelMigrationCapabilityRegistry"
import {
  toCanonicalMigrationSelectionFromLegacyAxonRow,
  toCanonicalMigrationSourceFromLegacyChannel,
  toCanonicalTargetPreparationFromLegacyDraft,
  toLegacyChannelFormDataProjection,
  toLegacyMigrationWarningCodes,
} from "~/services/managedSites/channelMigrationLegacyFacade"
import {
  getManagedSiteServiceForType,
  type ManagedSiteService,
} from "~/services/managedSites/managedSiteService"
import { MANAGED_UPSTREAM_RESOURCE_FEATURES } from "~/services/managedSites/managedUpstreamResourceMigration"
import { resolveManagedUpstreamResourceFeatureCapabilities } from "~/services/managedSites/managedUpstreamResourceService"
import {
  resolveManagedSiteRuntimeConfigForType,
  type ManagedSiteRuntimeConfigValue,
} from "~/services/managedSites/runtimeConfig"
import { needsManagedSiteChannelKeyResolution } from "~/services/managedSites/utils/managedSite"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import type { ChannelFormData, ManagedSiteChannel } from "~/types/managedSite"
import {
  MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES,
  type ManagedSiteChannelMigrationBlockedReasonCode,
  type ManagedSiteChannelMigrationExecutionItem,
  type ManagedSiteChannelMigrationExecutionResult,
  type ManagedSiteChannelMigrationPreview,
  type ManagedSiteChannelMigrationPreviewItem,
} from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES,
  type ManagedSiteMigrationCanonicalExecutionResult,
  type ManagedSiteMigrationCanonicalPreview,
  type ManagedSiteMigrationCanonicalPreviewItem,
  type ManagedSiteMigrationSelection,
  type ManagedSiteMigrationSource,
  type ManagedSiteMigrationTargetPreparation,
} from "~/types/managedSiteMigrationCapability"
import { createManagedUpstreamResourceRef } from "~/types/managedUpstreamResource"
import { getErrorMessage } from "~/utils/core/error"

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

type SourceKeyResolutionResult =
  | {
      key: string
      blockingReasonCode?: never
      blockingMessage?: never
    }
  | {
      key: null
      blockingReasonCode: ManagedSiteChannelMigrationBlockedReasonCode
      blockingMessage?: string
    }

type ChannelMigrationResourceCapabilities = ManagedUpstreamResourcesCapability<
  ManagedSiteRuntimeConfigValue,
  unknown,
  ChannelFormData
>

const migrationBlockers = MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES
const migrationFailures = MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES
const migrationUncertaintyWarning =
  "Target creation may have succeeded. Verify the target before retrying."

const getMigrationBlockingFallback = (
  reasonCode: ManagedSiteChannelMigrationBlockedReasonCode,
): string => {
  if (reasonCode === migrationBlockers.SOURCE_KEY_MISSING) {
    return "The source credential is unavailable. Verify source access and try again."
  }
  if (reasonCode === migrationBlockers.SOURCE_KEY_RESOLUTION_FAILED) {
    return "The source credential could not be resolved. Verify source access and try again."
  }
  if (reasonCode === migrationBlockers.TARGET_DRAFT_PREPARATION_FAILED) {
    return "The target channel could not be prepared. Review channel models and target configuration, then retry."
  }
  return "This channel cannot be migrated right now. Verify source access and try again."
}

const normalizeResourceScopeKey = (baseUrl: string): string => {
  const trimmed = baseUrl.trim()

  try {
    return new URL(trimmed).origin
  } catch {
    return trimmed.replace(/\/+$/, "")
  }
}

type LegacyChannelWithNativeResourceRef = ManagedSiteChannel & {
  resourceRef?: ManagedResourceRef
}

const toCanonicalMigrationSelectionFromLegacyChannel = (params: {
  sourceSiteType: ManagedSiteType
  channel: LegacyChannelWithNativeResourceRef
  scopeKey?: string
}): ManagedSiteMigrationSelection => {
  if (params.sourceSiteType === SITE_TYPES.AXON_HUB) {
    return toCanonicalMigrationSelectionFromLegacyAxonRow(params)
  }

  return {
    selectionId: String(params.channel.id),
    displayName: params.channel.name,
    ref: params.channel.resourceRef ?? {
      siteType: params.sourceSiteType,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey: params.scopeKey ?? "",
      resourceId: String(params.channel.id),
    },
  }
}

const resolveChannelMigrationResourceCapabilities = (
  siteType: ManagedSiteType,
): ChannelMigrationResourceCapabilities | null => {
  const resolution = resolveManagedUpstreamResourceFeatureCapabilities(
    siteType,
    MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration,
  )

  if (!resolution.supported) {
    return null
  }

  return resolution.capabilities as ChannelMigrationResourceCapabilities
}

const buildManagedUpstreamResourceRefForChannel = (params: {
  siteType: ManagedSiteType
  config: ManagedSiteRuntimeConfigValue
  channelId: number
}) =>
  createManagedUpstreamResourceRef({
    managedSiteType: params.siteType,
    scopeKey: normalizeResourceScopeKey(params.config.baseUrl),
    resourceId: params.channelId,
  })

const resolveSourceChannelKeyFromResources = async (params: {
  preferences: UserPreferences
  sourceSiteType: ManagedSiteType
  channel: ManagedSiteChannel
}): Promise<SourceKeyResolutionResult | null> => {
  const resources = resolveChannelMigrationResourceCapabilities(
    params.sourceSiteType,
  )

  if (!resources?.secrets?.revealSecret) {
    return null
  }

  const sourceRuntimeConfig = resolveManagedSiteRuntimeConfigForType(
    params.preferences,
    params.sourceSiteType,
  )
  if (!sourceRuntimeConfig) {
    return {
      key: null,
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
      blockingMessage: "Source managed-site configuration is missing.",
    }
  }

  try {
    const result = await resources.secrets.revealSecret(
      sourceRuntimeConfig.config,
      buildManagedUpstreamResourceRefForChannel({
        siteType: params.sourceSiteType,
        config: sourceRuntimeConfig.config,
        channelId: params.channel.id,
      }),
    )

    if (
      result.status === "available" &&
      !needsManagedSiteChannelKeyResolution(result.secret)
    ) {
      return { key: result.secret.trim() }
    }

    return {
      key: null,
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
      blockingMessage:
        result.status === "available" ? undefined : result.message,
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

  if (sourceSiteType === SITE_TYPES.CLAUDE_CODE_HUB) {
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

  const resourceKeyResolution = await resolveSourceChannelKeyFromResources({
    preferences,
    sourceSiteType,
    channel,
  })
  if (resourceKeyResolution) {
    return resourceKeyResolution
  }

  if (sourceSiteType === SITE_TYPES.NEW_API) {
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

  const sourceRuntimeConfig = resolveManagedSiteRuntimeConfigForType(
    preferences,
    sourceSiteType,
  )
  if (!sourceRuntimeConfig) {
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
      sourceRuntimeConfig.config,
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

const createTargetChannelForMigration = async (params: {
  targetSiteType: ManagedSiteType
  targetService: ManagedSiteService
  targetConfig: ManagedSiteRuntimeConfigValue
  draft: ChannelFormData
}) => {
  const targetResources = resolveChannelMigrationResourceCapabilities(
    params.targetSiteType,
  )

  if (!targetResources) {
    const payload = params.targetService.buildChannelPayload(params.draft)
    return await params.targetService.createChannel(
      params.targetConfig,
      payload,
    )
  }

  return await targetResources.items.create(params.targetConfig, params.draft)
}

const buildLegacyTargetPreparationFromCanonicalSource = async (params: {
  selection: ManagedSiteMigrationSelection
  source: ManagedSiteMigrationSource
  targetSiteType: ManagedSiteType
  legacyStatus?: ChannelFormData["status"]
  onPreparedPreviewDraft?: (draft: Omit<ChannelFormData, "key">) => void
}): Promise<ManagedSiteMigrationTargetPreparation> => {
  const resources = resolveChannelMigrationResourceCapabilities(
    params.targetSiteType,
  )
  return await toCanonicalTargetPreparationFromLegacyDraft({
    source: params.source,
    targetSiteType: params.targetSiteType,
    displayName: params.selection.displayName,
    selectionId: params.selection.selectionId,
    legacyStatus: params.legacyStatus,
    preparePreviewDraft: async (draft) => {
      const preparedDraft = resources
        ? await resources.drafts.prepareImportDraft({
            source: draft as ChannelFormData,
          })
        : draft
      const { key: _credential, ...secretFreeDraft } = preparedDraft as
        | ChannelFormData
        | (Omit<ChannelFormData, "key"> & { key?: string })
      params.onPreparedPreviewDraft?.(secretFreeDraft)
      return secretFreeDraft
    },
  })
}

const withSelectionDisplayName = (
  selection: ManagedSiteMigrationSelection,
  target: ManagedSiteMigrationTargetPreparation,
): ManagedSiteMigrationTargetPreparation =>
  target.projection.name.trim()
    ? target
    : {
        ...target,
        projection: {
          ...target.projection,
          name:
            selection.displayName.trim() || `Channel #${selection.selectionId}`,
        },
      }

/** Builds a secret-free migration preview from canonical resource selections. */
export async function prepareManagedSiteMigrationPreview(params: {
  sourceSiteType: ManagedSiteType
  targetSiteType: ManagedSiteType
  selections: readonly ManagedSiteMigrationSelection[]
  options?: ResourceOperationOptions
}): Promise<ManagedSiteMigrationCanonicalPreview> {
  const sourceCapability = resolveManagedSiteMigrationCapability(
    params.sourceSiteType,
  )?.source
  const targetCapability = resolveManagedSiteMigrationCapability(
    params.targetSiteType,
  )?.target
  return await prepareManagedSiteMigrationPreviewCore({
    sourceSiteType: params.sourceSiteType,
    targetSiteType: params.targetSiteType,
    selections: params.selections,
    signal: params.options?.signal,
    sourceFailureReasonCode: migrationBlockers.SOURCE_KEY_RESOLUTION_FAILED,
    targetFailureReasonCode: migrationBlockers.TARGET_DRAFT_PREPARATION_FAILED,
    getReadyWarningCodes: (source, target) =>
      toLegacyMigrationWarningCodes({
        lossSignals: source.lossSignals,
        adjustments: target.adjustments,
      }),
    prepareSource: (selection) =>
      sourceCapability
        ? sourceCapability.prepare(selection, params.options)
        : Promise.resolve({
            status: "blocked",
            reasonCode: migrationBlockers.SOURCE_KEY_RESOLUTION_FAILED,
          }),
    prepareTarget: (selection, source) =>
      targetCapability
        ? targetCapability
            .prepare(source, params.options)
            .then((target) => withSelectionDisplayName(selection, target))
        : buildLegacyTargetPreparationFromCanonicalSource({
            selection,
            source,
            targetSiteType: params.targetSiteType,
          }),
  })
}

const isUncertainMigrationError = (error: unknown) =>
  error instanceof ManagedResourceError &&
  error.failure.code === MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain

/** Executes canonical migration rows without retaining credentials or commands. */
export async function executeManagedSiteMigration(params: {
  preview: ManagedSiteMigrationCanonicalPreview
  options?: ResourceOperationOptions
}): Promise<ManagedSiteMigrationCanonicalExecutionResult> {
  const { preview } = params
  const sourceCapability = resolveManagedSiteMigrationCapability(
    preview.sourceSiteType,
  )?.source
  const targetCapability = resolveManagedSiteMigrationCapability(
    preview.targetSiteType,
  )?.target
  const legacyTargetService = targetCapability
    ? null
    : getManagedSiteServiceForType(preview.targetSiteType)
  const legacyTargetConfig = legacyTargetService
    ? await legacyTargetService.getConfig()
    : null

  return await executeManagedSiteMigrationCore({
    preview,
    targetAvailable: Boolean(targetCapability || legacyTargetConfig),
    signal: params.options?.signal,
    sourceFailureReasonCode: migrationBlockers.SOURCE_KEY_RESOLUTION_FAILED,
    isMutationStateUncertain: isUncertainMigrationError,
    resolveCredential: (selection) =>
      sourceCapability
        ? sourceCapability.resolveCredential(selection, params.options)
        : Promise.resolve({
            status: "blocked",
            reasonCode: migrationBlockers.SOURCE_KEY_RESOLUTION_FAILED,
          }),
    create: async (command) => {
      if (targetCapability) {
        return await targetCapability.create(command, params.options)
      }
      const response = await createTargetChannelForMigration({
        targetSiteType: preview.targetSiteType,
        targetService: legacyTargetService!,
        targetConfig: legacyTargetConfig!,
        draft: toLegacyChannelFormDataProjection({
          source: command.source,
          target: command.projection,
          credential: command.credential,
        }),
      })
      return response.success
        ? { status: "created" }
        : {
            status: "failed",
            failureCode: migrationFailures.TargetRejected,
          }
    },
  })
}

/**
 * Builds a create-only migration preview for the selected source channels and
 * target managed-site type, including per-row warnings and blockers.
 */
export async function prepareManagedSiteChannelMigrationPreview(
  params: PrepareManagedSiteChannelMigrationPreviewParams,
): Promise<ManagedSiteChannelMigrationPreview> {
  const sourceCapability = resolveManagedSiteMigrationCapability(
    params.sourceSiteType,
  )?.source
  const targetCapability = resolveManagedSiteMigrationCapability(
    params.targetSiteType,
  )?.target
  const sourceScopeKey = normalizeResourceScopeKey(
    resolveManagedSiteRuntimeConfigForType(
      params.preferences,
      params.sourceSiteType,
    )?.config.baseUrl ?? "",
  )
  const selections = params.channels.map((channel) =>
    toCanonicalMigrationSelectionFromLegacyChannel({
      sourceSiteType: params.sourceSiteType,
      channel,
      scopeKey: sourceScopeKey,
    }),
  )
  const channelsBySelectionId = new Map(
    selections.map((selection, index) => [
      selection.selectionId,
      params.channels[index],
    ]),
  )
  const credentials = new Map<string, string>()
  const blockingMessages = new Map<string, string>()
  const preparedDrafts = new Map<string, Omit<ChannelFormData, "key">>()
  const getChannel = (selection: ManagedSiteMigrationSelection) =>
    channelsBySelectionId.get(selection.selectionId)!
  const getWarnings = (selection: ManagedSiteMigrationSelection) =>
    toLegacyMigrationWarningCodes({
      sourceSiteType: params.sourceSiteType,
      targetSiteType: params.targetSiteType,
      channel: getChannel(selection),
    })
  const canonicalPreview = await prepareManagedSiteMigrationPreviewCore({
    sourceSiteType: params.sourceSiteType,
    targetSiteType: params.targetSiteType,
    selections,
    sourceFailureReasonCode: migrationBlockers.SOURCE_KEY_RESOLUTION_FAILED,
    targetFailureReasonCode: migrationBlockers.TARGET_DRAFT_PREPARATION_FAILED,
    getReadyWarningCodes: (source, target) =>
      toLegacyMigrationWarningCodes({
        lossSignals: source.lossSignals,
        adjustments: target.adjustments,
      }),
    getBlockedWarningCodes: getWarnings,
    prepareSource: async (selection) => {
      if (sourceCapability) {
        return await sourceCapability.prepare(selection)
      }
      const channel = getChannel(selection)
      const resolution = await resolveSourceChannelKey({
        preferences: params.preferences,
        sourceSiteType: params.sourceSiteType,
        channel,
        resolveNewApiSourceKey: params.resolveNewApiSourceKey,
      })
      if (resolution.key === null) {
        if (resolution.blockingMessage) {
          blockingMessages.set(
            selection.selectionId,
            resolution.blockingMessage,
          )
        }
        return {
          status: "blocked",
          reasonCode: resolution.blockingReasonCode,
        }
      }
      credentials.set(selection.selectionId, resolution.key)
      return {
        status: "ready",
        source: toCanonicalMigrationSourceFromLegacyChannel({
          sourceSiteType: params.sourceSiteType,
          channel,
        }),
      }
    },
    prepareTarget: async (selection, source) => {
      try {
        if (targetCapability) {
          const target = await targetCapability.prepare(source)
          const preparedTarget = withSelectionDisplayName(selection, target)
          const { key: _credential, ...draft } =
            toLegacyChannelFormDataProjection({
              source,
              target: preparedTarget,
              credential: "",
            })
          preparedDrafts.set(selection.selectionId, draft)
          return preparedTarget
        }
        return await buildLegacyTargetPreparationFromCanonicalSource({
          selection,
          source,
          targetSiteType: params.targetSiteType,
          legacyStatus: sourceCapability
            ? undefined
            : getChannel(selection).status,
          onPreparedPreviewDraft: (draft) =>
            preparedDrafts.set(selection.selectionId, draft),
        })
      } catch (error) {
        blockingMessages.set(selection.selectionId, getErrorMessage(error))
        throw error
      }
    },
  })
  const items: ManagedSiteChannelMigrationPreviewItem[] =
    canonicalPreview.items.map((item) => {
      const channel = getChannel(item.selection)
      if (item.status === "blocked") {
        return {
          channelId: channel.id,
          channelName: channel.name,
          sourceChannel: channel,
          draft: null,
          status: "blocked",
          warningCodes: [...item.warningCodes],
          blockingReasonCode: item.blockingReasonCode,
          blockingMessage:
            blockingMessages.get(item.selection.selectionId)?.trim() ||
            getMigrationBlockingFallback(item.blockingReasonCode),
        }
      }
      return {
        channelId: channel.id,
        channelName: channel.name,
        sourceChannel: channel,
        draft: {
          ...preparedDrafts.get(item.selection.selectionId)!,
          key: credentials.get(item.selection.selectionId) ?? "",
        },
        status: "ready",
        warningCodes: [...item.warningCodes],
        canonicalPreparation: {
          selection: item.selection,
          source: item.source,
          target: item.target,
        },
      }
    })
  return {
    ...canonicalPreview,
    generalWarningCodes: [...canonicalPreview.generalWarningCodes],
    items,
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
  const sourceCapability = resolveManagedSiteMigrationCapability(
    preview.sourceSiteType,
  )?.source
  const targetCapability = resolveManagedSiteMigrationCapability(
    preview.targetSiteType,
  )?.target
  const canonicalItems = await Promise.all(
    preview.items.map(
      async (item): Promise<ManagedSiteMigrationCanonicalPreviewItem> => {
        const selection =
          item.canonicalPreparation?.selection ??
          toCanonicalMigrationSelectionFromLegacyChannel({
            sourceSiteType: preview.sourceSiteType,
            channel: item.sourceChannel,
          })
        if (item.status !== "ready" || !item.draft) {
          return {
            selection,
            status: "blocked",
            warningCodes: item.warningCodes,
            blockingReasonCode:
              item.blockingReasonCode ?? migrationBlockers.SOURCE_KEY_MISSING,
          }
        }
        const source =
          item.canonicalPreparation?.source ??
          toCanonicalMigrationSourceFromLegacyChannel({
            sourceSiteType: preview.sourceSiteType,
            channel: item.sourceChannel,
          })
        return {
          selection,
          status: "ready",
          warningCodes: item.warningCodes,
          source,
          target:
            item.canonicalPreparation?.target ??
            (await toCanonicalTargetPreparationFromLegacyDraft({
              source,
              draft: item.draft,
            })),
        }
      },
    ),
  )
  const canonicalPreview: ManagedSiteMigrationCanonicalPreview = {
    sourceSiteType: preview.sourceSiteType,
    targetSiteType: preview.targetSiteType,
    generalWarningCodes: preview.generalWarningCodes,
    items: canonicalItems,
    totalCount: preview.totalCount,
    readyCount: preview.readyCount,
    blockedCount: preview.blockedCount,
  }
  const legacyItemsBySelectionId = new Map(
    canonicalItems.map((item, index) => [
      item.selection.selectionId,
      preview.items[index],
    ]),
  )
  const readyItemsBySource = new Map(
    canonicalItems.flatMap((item) =>
      item.status === "ready"
        ? [
            [
              item.source,
              {
                canonical: item,
                legacy: legacyItemsBySelectionId.get(
                  item.selection.selectionId,
                )!,
              },
            ] as const,
          ]
        : [],
    ),
  )
  const targetService: ManagedSiteService | null = targetCapability
    ? null
    : getManagedSiteServiceForType(preview.targetSiteType)
  const targetConfig = targetService ? await targetService.getConfig() : null
  const errors = new Map<string, string>()
  if (!targetCapability && !targetConfig) {
    canonicalItems
      .filter((item) => item.status === "ready")
      .forEach((item) =>
        errors.set(
          item.selection.selectionId,
          "Target managed-site configuration is missing.",
        ),
      )
  }
  const canonicalResult = await executeManagedSiteMigrationCore({
    preview: canonicalPreview,
    targetAvailable: Boolean(targetCapability || targetConfig),
    sourceFailureReasonCode: migrationBlockers.SOURCE_KEY_RESOLUTION_FAILED,
    isMutationStateUncertain: isUncertainMigrationError,
    resolveCredential: (selection) =>
      sourceCapability
        ? sourceCapability.resolveCredential(selection)
        : Promise.resolve({
            status: "ready",
            credential: legacyItemsBySelectionId.get(selection.selectionId)!
              .draft!.key,
          }),
    create: async (command) => {
      const targetItem = readyItemsBySource.get(command.source)!
      try {
        if (targetCapability) {
          const result = await targetCapability.create(command)
          if (result.status === "failed") {
            errors.set(
              targetItem.canonical.selection.selectionId,
              "Target channel creation failed.",
            )
          }
          return result
        }
        const executionDraft = toLegacyChannelFormDataProjection({
          source: command.source,
          target: targetItem.canonical.target,
          credential: command.credential,
        })
        const response = await createTargetChannelForMigration({
          targetSiteType: preview.targetSiteType,
          targetService: targetService!,
          targetConfig: targetConfig!,
          draft: {
            ...executionDraft,
            ...targetItem.legacy.draft!,
            key: executionDraft.key,
          },
        })
        if (!response.success) {
          errors.set(
            targetItem.canonical.selection.selectionId,
            response.message || "Unknown error",
          )
          return {
            status: "failed",
            failureCode: migrationFailures.TargetRejected,
          }
        }
        return { status: "created" }
      } catch (error) {
        errors.set(
          targetItem.canonical.selection.selectionId,
          getErrorMessage(error),
        )
        throw error
      }
    },
  })
  const items: ManagedSiteChannelMigrationExecutionItem[] =
    canonicalResult.items.map((result) => {
      const legacyItem = legacyItemsBySelectionId.get(result.selectionId)!
      if (result.status === "created") {
        return {
          channelId: legacyItem.channelId,
          channelName: legacyItem.channelName,
          success: true,
          skipped: false,
        }
      }
      return {
        channelId: legacyItem.channelId,
        channelName: legacyItem.channelName,
        success: false,
        skipped: result.status === "skipped",
        blockingReasonCode:
          result.status === "skipped"
            ? result.blockingReasonCode
            : legacyItem.blockingReasonCode,
        error:
          result.status === "skipped"
            ? legacyItem.blockingMessage?.trim() ||
              getMigrationBlockingFallback(result.blockingReasonCode)
            : result.status === "uncertain"
              ? migrationUncertaintyWarning
              : errors.get(result.selectionId)?.trim() || "Unknown error",
      }
    })
  return {
    totalSelected: preview.totalCount,
    attemptedCount: canonicalResult.attemptedCount,
    createdCount: items.filter((item) => item.success).length,
    failedCount: items.filter((item) => !item.success && !item.skipped).length,
    skippedCount: items.filter((item) => item.skipped).length,
    items,
  }
}
