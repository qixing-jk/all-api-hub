import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSiteChannelDraft"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  isManagedResourceRefFor,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  isManagedSiteMigrationSourceType,
  resolveManagedSiteMigrationType,
} from "~/services/apiAdapters/managedResources/migrationTypeRoutes"
import { openNewApiNativeResourceOperations } from "~/services/apiAdapters/managedResources/newApi"
import {
  parseNewApiResourceList,
  throwIfNewApiResourceOperationAborted,
} from "~/services/apiAdapters/managedResources/newApiResourceUtils"
import { MANAGED_SITE_MUTATION_OUTCOMES } from "~/services/managedSites/mutations"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES } from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES,
  type ManagedSiteMigrationCapability,
  type ManagedSiteMigrationSelection,
  type ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"
import type { NewApiChannel } from "~/types/newApi"
import { CHANNEL_STATUS } from "~/types/newApi"

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

const resolveChannelType = (value: NewApiChannel["type"]) => {
  const numeric = Number(value)
  return Number.isInteger(numeric) &&
    isManagedSiteMigrationSourceType(SITE_TYPES.NEW_API, numeric)
    ? {
        status: "mapped" as const,
        value: numeric,
      }
    : {
        status: "blocked" as const,
        reasonCode: blockers.SOURCE_TYPE_UNSUPPORTED,
      }
}

const toSource = (
  channel: NewApiChannel,
  resourceType: ManagedSiteMigrationSource["resourceType"],
): ManagedSiteMigrationSource => ({
  sourceSiteType: SITE_TYPES.NEW_API,
  resourceType,
  baseUrl: channel.base_url?.trim() ?? "",
  models: parseNewApiResourceList(channel.models),
  groups: parseNewApiResourceList(channel.group),
  priority: channel.priority ?? DEFAULT_CHANNEL_FIELDS.priority,
  weight: channel.weight ?? DEFAULT_CHANNEL_FIELDS.weight,
  status:
    channel.status === CHANNEL_STATUS.Enable
      ? "enabled"
      : channel.status === CHANNEL_STATUS.ManuallyDisabled
        ? "disabled"
        : "other",
  // These are provider-owned New API channel fields that the canonical
  // migration draft cannot represent, so populated values must be disclosed:
  // https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/model/channel.go#L42-L56
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
    ].some(hasMeaningfulAdvancedValue),
    hasMultiKeyState: channel.channel_info?.is_multi_key === true,
  },
})

const decodeSelectionChannelId = (
  selection: ManagedSiteMigrationSelection,
  scopeKey: string,
): number | null => {
  if (
    !isManagedResourceRefFor(selection.ref, {
      siteType: SITE_TYPES.NEW_API,
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
  const operations = await openNewApiNativeResourceOperations()
  const channelId = decodeSelectionChannelId(selection, operations.scopeKey)
  if (channelId === null) return null
  const channel = await operations.get(channelId, options)
  return { operations, channel, channelId }
}

const createSelectionValidationContext = async (
  options?: ResourceOperationOptions,
) => {
  throwIfNewApiResourceOperationAborted(options)
  const operations = await openNewApiNativeResourceOperations()
  return {
    isValid: (selection: ManagedSiteMigrationSelection) =>
      decodeSelectionChannelId(selection, operations.scopeKey) !== null,
  }
}

/** Resolves one New API source credential while preserving verification errors. */
export async function resolveNewApiMigrationCredential(
  selection: ManagedSiteMigrationSelection,
  options?: ResourceOperationOptions,
) {
  const resolved = await parseSelection(selection, options)
  if (!resolved) {
    return {
      status: "blocked" as const,
      reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
    }
  }
  const credential = (
    await resolved.operations.loadSecret(resolved.channelId, options)
  ).trim()
  return credential
    ? { status: "ready" as const, credential }
    : {
        status: "blocked" as const,
        reasonCode: blockers.SOURCE_KEY_MISSING,
      }
}

/** Canonical source/target mapping for New API native channel migrations. */
export const newApiManagedSiteMigrationCapability: ManagedSiteMigrationCapability =
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
        const type = resolveChannelType(resolved.channel.type)
        return type.status === "blocked"
          ? type
          : {
              status: "ready",
              source: toSource(resolved.channel, type.value),
            }
      },
      resolveCredential: async (selection, options) => {
        try {
          return await resolveNewApiMigrationCredential(selection, options)
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
        const type = resolveManagedSiteMigrationType(source, SITE_TYPES.NEW_API)
        if (type.status === "unsupported") {
          throw new Error(
            "New API does not support this migration channel type",
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
        const operations = await openNewApiNativeResourceOperations()
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
            ? CHANNEL_STATUS.Enable
            : CHANNEL_STATUS.ManuallyDisabled,
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
