import { ChannelType, DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  isManagedResourceRefFor,
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { openOctopusNativeResourceOperations } from "~/services/apiAdapters/managedResources/octopus"
import {
  isOctopusHttpUrl,
  octopusModels,
} from "~/services/apiAdapters/managedResources/octopusEditor"
import { MANAGED_SITE_MUTATION_OUTCOMES } from "~/services/managedSites/mutations"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES as blockers } from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES as failures,
  type ManagedSiteMigrationCapability,
  type ManagedSiteMigrationSelection,
} from "~/types/managedSiteMigrationCapability"
import { OctopusAutoGroupType, OctopusOutboundType } from "~/types/octopus"
import { normalizeList } from "~/utils/core/string"

// The canonical draft has no Responses/Embedding protocol discriminator;
// those known source types disclose the lost mode through advanced settings.
const sourceTypes: Readonly<Partial<Record<OctopusOutboundType, ChannelType>>> =
  {
    [OctopusOutboundType.OpenAIChat]: ChannelType.OpenAI,
    [OctopusOutboundType.OpenAIResponse]: ChannelType.OpenAI,
    [OctopusOutboundType.OpenAIEmbedding]: ChannelType.OpenAI,
    [OctopusOutboundType.Anthropic]: ChannelType.Anthropic,
    [OctopusOutboundType.Gemini]: ChannelType.Gemini,
    [OctopusOutboundType.Volcengine]: ChannelType.VolcEngine,
  }
// Only explicit protocol matches are accepted; unknown provider families must
// not silently become an OpenAI Chat channel.
const targetTypes: Readonly<Partial<Record<ChannelType, OctopusOutboundType>>> =
  {
    [ChannelType.OpenAI]: OctopusOutboundType.OpenAIChat,
    [ChannelType.Anthropic]: OctopusOutboundType.Anthropic,
    [ChannelType.Gemini]: OctopusOutboundType.Gemini,
    [ChannelType.VolcEngine]: OctopusOutboundType.Volcengine,
  }
const throwIfAborted = (options?: ResourceOperationOptions) => {
  if (options?.signal?.aborted)
    throw options.signal.reason ?? new DOMException("Aborted", "AbortError")
}
const withCancellation = async <T>(
  action: () => Promise<T>,
  options?: ResourceOperationOptions,
): Promise<T> => {
  throwIfAborted(options)
  try {
    return await action()
  } catch (error) {
    throwIfAborted(options)
    if (
      error instanceof ManagedResourceError &&
      error.failure.code === MANAGED_RESOURCE_FAILURE_CODES.Aborted
    )
      throw new DOMException("Aborted", "AbortError")
    throw error
  }
}
const decodeId = (
  selection: ManagedSiteMigrationSelection,
  scopeKey: string,
) => {
  if (
    !isManagedResourceRefFor(selection.ref, {
      siteType: SITE_TYPES.OCTOPUS,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey,
    })
  )
    return null
  const id = Number(selection.ref.resourceId)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
const openSelection = async (
  selection: ManagedSiteMigrationSelection,
  options?: ResourceOperationOptions,
) => {
  throwIfAborted(options)
  const operations = await withCancellation(
    () => openOctopusNativeResourceOperations(options),
    options,
  )
  const id = decodeId(selection, operations.scopeKey)
  if (id === null) return null
  const detail = await withCancellation(
    () => operations.get(id, options),
    options,
  )
  return { operations, id, detail }
}

/** Canonical migration for native Octopus channels without the legacy channel facade. */
export const octopusManagedSiteMigrationCapability: ManagedSiteMigrationCapability =
  {
    source: {
      createSelectionValidationContext: async (options) => {
        throwIfAborted(options)
        const operations = await withCancellation(
          () => openOctopusNativeResourceOperations(options),
          options,
        )
        return {
          isValid: (selection) =>
            decodeId(selection, operations.scopeKey) !== null,
        }
      },
      prepare: async (selection, options) => {
        const resolved = await openSelection(selection, options)
        if (!resolved)
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
          }
        const { detail } = resolved
        const resourceType = sourceTypes[detail.type]
        if (resourceType === undefined)
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_TYPE_UNSUPPORTED,
          }
        return {
          status: "ready",
          source: {
            sourceSiteType: SITE_TYPES.OCTOPUS,
            resourceType,
            baseUrl: detail.base_urls[0]?.url.trim() ?? "",
            models: octopusModels(detail.model),
            groups: [],
            priority: DEFAULT_CHANNEL_FIELDS.priority,
            weight: DEFAULT_CHANNEL_FIELDS.weight,
            status: detail.enabled ? "enabled" : "disabled",
            lossSignals: {
              hasModelMapping: false,
              hasStatusCodeMapping: false,
              hasMultiKeyState:
                detail.keys.length > 1 ||
                detail.keys.some((key) => !key.enabled),
              hasAdvancedSettings: Boolean(
                // v0.13 grants and protocol paths cannot be represented by one
                // canonical channel type: github.com/bestruirui/octopus/blob/27aa40dc0f3b2902bce3e96ccdba019d17041606/internal/model/channel.go
                detail.hasUnrepresentedProtocolSettings ||
                  detail.base_urls.length > 1 ||
                  detail.custom_model?.trim() ||
                  detail.proxy ||
                  detail.auto_sync ||
                  detail.auto_group !== OctopusAutoGroupType.None ||
                  detail.custom_header?.length ||
                  detail.param_override?.trim() ||
                  detail.channel_proxy?.trim() ||
                  detail.match_regex?.trim() ||
                  detail.type === OctopusOutboundType.OpenAIResponse ||
                  detail.type === OctopusOutboundType.OpenAIEmbedding,
              ),
            },
          },
        }
      },
      resolveCredential: async (selection, options) => {
        try {
          const resolved = await openSelection(selection, options)
          if (!resolved)
            return {
              status: "blocked",
              reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
            }
          const credential = (
            await withCancellation(
              () => resolved.operations.loadSecret(resolved.id, options),
              options,
            )
          ).trim()
          return hasUsableManagedSiteChannelKey(credential)
            ? { status: "ready", credential }
            : { status: "blocked", reasonCode: blockers.SOURCE_KEY_MISSING }
        } catch (error) {
          throwIfAborted(options)
          if (error instanceof Error && error.name === "AbortError") throw error
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
          }
        }
      },
    },
    target: {
      prepare: async (source, options) => {
        throwIfAborted(options)
        const type = targetTypes[source.resourceType]
        if (type === undefined)
          throw new Error(
            "Octopus does not support this migration channel type",
          )
        const operations = await withCancellation(
          () => openOctopusNativeResourceOperations(options),
          options,
        )
        const baseUrl = await withCancellation(
          () =>
            operations.prepareMigrationBaseUrl(source.baseUrl, type, options),
          options,
        )
        return {
          projection: {
            name: "",
            type: String(type),
            baseUrl,
            models: [...source.models],
            groups: [...DEFAULT_CHANNEL_FIELDS.groups],
            priority: DEFAULT_CHANNEL_FIELDS.priority,
            weight: DEFAULT_CHANNEL_FIELDS.weight,
            status: source.status === "enabled" ? 1 : 2,
          },
          adjustments: {
            remappedType: Number(type) !== Number(source.resourceType),
            normalizedBaseUrl: baseUrl !== source.baseUrl,
            forcedDefaultGroup:
              source.groups.length !== 1 ||
              source.groups[0] !== DEFAULT_CHANNEL_FIELDS.groups[0],
            ignoredPriority:
              source.priority !== DEFAULT_CHANNEL_FIELDS.priority,
            ignoredWeight: source.weight !== DEFAULT_CHANNEL_FIELDS.weight,
            simplifiedStatus: source.status === "other",
          },
        }
      },
      create: async (command, options) => {
        throwIfAborted(options)
        const type = Number(command.projection.type)
        const models = normalizeList(command.projection.models)
        if (
          command.targetSiteType !== SITE_TYPES.OCTOPUS ||
          String(command.projection.type).trim() === "" ||
          !Number.isInteger(type) ||
          sourceTypes[type as OctopusOutboundType] === undefined ||
          !command.projection.name.trim() ||
          !isOctopusHttpUrl(command.projection.baseUrl) ||
          models.length === 0 ||
          ![1, 2].includes(command.projection.status) ||
          !hasUsableManagedSiteChannelKey(command.credential)
        )
          return { status: "failed", failureCode: failures.TargetRejected }
        const operations = await withCancellation(
          () => openOctopusNativeResourceOperations(options),
          options,
        )
        const result = await withCancellation(
          () =>
            operations.create(
              {
                name: command.projection.name.trim(),
                type,
                baseUrl: command.projection.baseUrl.trim(),
                key: command.credential.trim(),
                model: models.join(","),
                enabled: command.projection.status === 1,
              },
              options,
            ),
          options,
        )
        switch (result.outcome) {
          case MANAGED_SITE_MUTATION_OUTCOMES.Succeeded:
            return { status: "created" }
          case MANAGED_SITE_MUTATION_OUTCOMES.Rejected:
            return { status: "failed", failureCode: failures.TargetRejected }
          case MANAGED_SITE_MUTATION_OUTCOMES.Partial:
          case MANAGED_SITE_MUTATION_OUTCOMES.Uncertain:
            return { status: "uncertain" }
        }
      },
    },
  }
