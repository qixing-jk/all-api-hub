import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSiteChannelDraft"
import { SITE_TYPES } from "~/constants/siteType"
import { VeloeraChannelStatus } from "~/constants/veloera"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  isManagedResourceRefFor,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  isManagedSiteMigrationSourceType,
  resolveManagedSiteMigrationType,
} from "~/services/apiAdapters/managedResources/migrationTypeRoutes"
import {
  parseNewApiResourceList,
  throwIfNewApiResourceOperationAborted,
} from "~/services/apiAdapters/managedResources/newApiResourceUtils"
import { openVeloeraNativeResourceOperations } from "~/services/apiAdapters/managedResources/veloera"
import { MANAGED_SITE_MUTATION_OUTCOMES } from "~/services/managedSites/mutations"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES } from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES,
  type ManagedSiteMigrationCapability,
  type ManagedSiteMigrationSelection,
  type ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"
import type { VeloeraChannel } from "~/types/veloera"
import { isRecord } from "~/utils/core/object"

const blockers = MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES
const failures = MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES

const hasMeaningfulAdvancedValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false
  if (typeof value === "string") {
    const normalized = value.trim()
    if (!normalized) return false
    try {
      return hasMeaningfulAdvancedValue(JSON.parse(normalized))
    } catch {
      return true
    }
  }
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.keys(value).length > 0
  return Boolean(value)
}

const decodeSelectionChannelId = (
  selection: ManagedSiteMigrationSelection,
  scopeKey: string,
): number | null => {
  if (
    !isManagedResourceRefFor(selection.ref, {
      siteType: SITE_TYPES.VELOERA,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey,
    })
  ) {
    return null
  }
  const channelId = Number(selection.ref.resourceId)
  return Number.isSafeInteger(channelId) && channelId > 0 ? channelId : null
}

const parseSelection = async (
  selection: ManagedSiteMigrationSelection,
  options?: ResourceOperationOptions,
) => {
  const operations = await openVeloeraNativeResourceOperations()
  const channelId = decodeSelectionChannelId(selection, operations.scopeKey)
  if (channelId === null) return null
  const channel = await operations.get(channelId, options)
  return { operations, channel, channelId }
}

const createSelectionValidationContext = async (
  options?: ResourceOperationOptions,
) => {
  throwIfNewApiResourceOperationAborted(options)
  const operations = await openVeloeraNativeResourceOperations()
  return {
    isValid: (selection: ManagedSiteMigrationSelection) =>
      decodeSelectionChannelId(selection, operations.scopeKey) !== null,
  }
}

const toSource = (
  channel: VeloeraChannel,
  resourceType: ManagedSiteMigrationSource["resourceType"],
): ManagedSiteMigrationSource => ({
  sourceSiteType: SITE_TYPES.VELOERA,
  resourceType,
  baseUrl: channel.base_url?.trim() ?? "",
  models: parseNewApiResourceList(channel.models),
  groups: parseNewApiResourceList(channel.group),
  priority: channel.priority ?? DEFAULT_CHANNEL_FIELDS.priority,
  weight: channel.weight ?? DEFAULT_CHANNEL_FIELDS.weight,
  status:
    channel.status === VeloeraChannelStatus.Enable
      ? "enabled"
      : channel.status === VeloeraChannelStatus.ManuallyDisabled
        ? "disabled"
        : "other",
  // Veloera carries provider-owned fields that the canonical migration draft
  // cannot represent: https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/model/channel.go
  lossSignals: {
    hasModelMapping: hasMeaningfulAdvancedValue(channel.model_mapping),
    hasStatusCodeMapping: hasMeaningfulAdvancedValue(
      channel.status_code_mapping,
    ),
    hasAdvancedSettings: [
      channel.setting,
      channel.settings,
      channel.param_override,
      channel.header_override,
      channel.other,
      channel.remark,
      channel.other_info,
      channel.tag,
      channel.model_prefix,
      channel.system_prompt,
    ].some(hasMeaningfulAdvancedValue),
    hasMultiKeyState:
      isRecord(channel.channel_info) &&
      channel.channel_info.is_multi_key === true,
  },
})

/** Canonical source/target mapping for Veloera native channel migrations. */
export const veloeraManagedSiteMigrationCapability: ManagedSiteMigrationCapability =
  {
    source: {
      createSelectionValidationContext,
      prepare: async (selection, options) => {
        const resolved = await parseSelection(selection, options)
        if (!resolved) {
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
          }
        }
        const resourceType = Number(resolved.channel.type)
        return !isManagedSiteMigrationSourceType(
          SITE_TYPES.VELOERA,
          resourceType,
        )
          ? {
              status: "blocked",
              reasonCode: blockers.SOURCE_TYPE_UNSUPPORTED,
            }
          : {
              status: "ready",
              source: toSource(resolved.channel, resourceType),
            }
      },
      resolveCredential: async (selection, options) => {
        try {
          const resolved = await parseSelection(selection, options)
          if (!resolved) {
            return {
              status: "blocked",
              reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
            }
          }
          const credential = (
            await resolved.operations.loadSecret(resolved.channelId, options)
          ).trim()
          return credential
            ? { status: "ready", credential }
            : {
                status: "blocked",
                reasonCode: blockers.SOURCE_KEY_MISSING,
              }
        } catch (error) {
          if (options?.signal?.aborted) {
            throw options.signal.reason ?? error
          }
          if (error instanceof Error && error.name === "AbortError") {
            throw error
          }
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
          }
        }
      },
    },
    target: {
      prepare: async (source) => {
        const type = resolveManagedSiteMigrationType(source, SITE_TYPES.VELOERA)
        if (type.status === "unsupported") {
          throw new Error(
            "Veloera does not support this migration channel type",
          )
        }
        return {
          projection: {
            name: "",
            type: type.value,
            baseUrl: source.baseUrl,
            models: [...source.models],
            groups:
              source.groups.length > 0
                ? [...source.groups]
                : [...DEFAULT_CHANNEL_FIELDS.groups],
            priority: source.priority,
            weight: source.weight,
            enabled: source.status === "enabled",
          },
          adjustments: {
            remappedType: type.remappedType,
            normalizedBaseUrl: false,
            forcedDefaultGroup: source.groups.length === 0,
            ignoredPriority: false,
            ignoredWeight: false,
            simplifiedStatus: source.status === "other",
          },
        }
      },
      create: async (command, options) => {
        const operations = await openVeloeraNativeResourceOperations()
        const commandFields = {
          name: command.projection.name,
          type: command.projection.type,
          key: command.credential,
          base_url: command.projection.baseUrl,
          models: [...command.projection.models],
          groups: [...command.projection.groups],
          priority: command.projection.priority,
          weight: command.projection.weight,
          status: command.projection.enabled
            ? VeloeraChannelStatus.Enable
            : VeloeraChannelStatus.ManuallyDisabled,
        }
        const result = await operations.create(commandFields, options)
        switch (result.outcome) {
          case MANAGED_SITE_MUTATION_OUTCOMES.Succeeded:
            return { status: "created" }
          case MANAGED_SITE_MUTATION_OUTCOMES.Rejected:
            return {
              status: "failed",
              failureCode: failures.TargetRejected,
            }
          case MANAGED_SITE_MUTATION_OUTCOMES.Partial:
          case MANAGED_SITE_MUTATION_OUTCOMES.Uncertain:
            return { status: "uncertain" }
        }
      },
    },
  }
