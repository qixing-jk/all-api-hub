import { resolveGptLoadFirstPartyChannel } from "~/constants/gptLoad"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  isManagedResourceRefFor,
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  ManagedResourceError,
  type ResourceFailure,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  type GptLoadGroupDetail,
  type GptLoadGroupEditorCommand,
} from "~/services/apiAdapters/managedResources/gptLoad/nativeContracts"
import { openGptLoadNativeResourceOperations } from "~/services/apiAdapters/managedResources/gptLoad/nativeOperations"
import { GptLoadNativeError } from "~/services/apiAdapters/managedResources/gptLoad/nativeRuntime"
import {
  isManagedSiteMigrationSourceType,
  resolveManagedSiteMigrationType,
} from "~/services/apiAdapters/managedResources/migration/migrationTypeRoutes"
import { MANAGED_SITE_MUTATION_OUTCOMES } from "~/services/managedSites/mutations"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES } from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES,
  type ManagedSiteMigrationCapability,
  type ManagedSiteMigrationConfirmedFailureCode,
  type ManagedSiteMigrationSelection,
  type ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"

const blockers = MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES
const failures = MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES

const decodeSelectionResourceId = (
  selection: ManagedSiteMigrationSelection,
  scopeKey: string,
): string | null =>
  isManagedResourceRefFor(selection.ref, {
    siteType: SITE_TYPES.GPT_LOAD,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    scopeKey,
  })
    ? selection.ref.resourceId
    : null

const normalizeAbort = (error: unknown): unknown => {
  if (
    !(error instanceof GptLoadNativeError) ||
    error.failure.code !== MANAGED_RESOURCE_FAILURE_CODES.Aborted
  ) {
    return error
  }
  const abortError = new Error("gpt-load operation was aborted.", {
    cause: error,
  })
  abortError.name = "AbortError"
  return abortError
}

const openSelection = async (
  selection: ManagedSiteMigrationSelection,
  options?: ResourceOperationOptions,
) => {
  try {
    const operations = await openGptLoadNativeResourceOperations(options)
    const resourceId = decodeSelectionResourceId(selection, operations.scopeKey)
    if (resourceId === null) return null
    const groupId = Number(resourceId)
    if (!Number.isSafeInteger(groupId) || groupId <= 0) return null
    return {
      detail: await operations.get(groupId, options),
      operations,
      groupId,
    }
  } catch (error) {
    throw normalizeAbort(error)
  }
}

/** Reads every usable plaintext value from a group's credential pool. */
const revealAllKeys = async (
  operations: Awaited<ReturnType<typeof openGptLoadNativeResourceOperations>>,
  groupId: number,
  options?: ResourceOperationOptions,
): Promise<string[]> => {
  const records = await operations.loadSecret(groupId, options)
  return records
    .map((record) => record.key.trim())
    .filter((value) => hasUsableManagedSiteChannelKey(value))
}

const toSource = (detail: GptLoadGroupDetail): ManagedSiteMigrationSource => {
  const credentialCount = detail.credentials.length
  return {
    sourceSiteType: SITE_TYPES.GPT_LOAD,
    resourceType: detail.group.channelId,
    baseUrl: detail.group.baseUrl,
    models: [...detail.models],
    groups: [],
    status: detail.group.enabled ? "enabled" : "disabled",
    lossSignals: {
      hasModelMapping: false,
      hasStatusCodeMapping: false,
      // Price multiplier and manual weight are gateway routing settings with no
      // cross-site equivalent; a non-default value is a loss signal.
      hasAdvancedSettings:
        detail.group.priceMultiplier !== "1" &&
        detail.group.priceMultiplier !== "",
      hasMultiKeyState: credentialCount > 1,
    },
    // gpt-load rows carry no per-key enable state the gateway exposes, so every
    // slot is reported enabled.
    credentialMetadata: detail.credentials.map(() => ({ enabled: true })),
  }
}

const toConfirmedFailure = (
  failure: ResourceFailure,
): ManagedSiteMigrationConfirmedFailureCode => {
  switch (failure.code) {
    case MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed:
    case MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected:
      return failures.TargetRejected
    case MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired:
    case MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration:
    case MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed:
    case MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied:
    case MANAGED_RESOURCE_FAILURE_CODES.NotFound:
    case MANAGED_RESOURCE_FAILURE_CODES.Unavailable:
      return failures.TargetUnavailable
    default:
      return failures.Unexpected
  }
}

/** Canonical source and target behavior for gpt-load groups. */
export const gptLoadManagedSiteMigrationCapability: ManagedSiteMigrationCapability =
  {
    source: {
      createSelectionValidationContext: async (options) => {
        const operations = await openGptLoadNativeResourceOperations(options)
        return {
          isValid: (selection) =>
            decodeSelectionResourceId(selection, operations.scopeKey) !== null,
        }
      },
      prepare: async (selection, options) => {
        const resolved = await openSelection(selection, options)
        if (!resolved) {
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
          }
        }
        if (
          !isManagedSiteMigrationSourceType(
            SITE_TYPES.GPT_LOAD,
            resolved.detail.group.channelId,
          )
        ) {
          // The route table only admits the drivers whose protocol is known; a
          // driver with no equivalent (grok, cerebras, ...) must not guess one.
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_TYPE_UNSUPPORTED,
          }
        }
        if (resolved.detail.credentials.length === 0) {
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_KEY_MISSING,
          }
        }
        return { status: "ready", source: toSource(resolved.detail) }
      },
      resolveCredential: async (selection, options) => {
        try {
          const resolved = await openSelection(selection, options)
          if (!resolved) {
            return {
              status: "blocked",
              reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
            }
          }
          const values = await revealAllKeys(
            resolved.operations,
            resolved.groupId,
            options,
          )
          if (values.length === 0) {
            return {
              status: "blocked",
              reasonCode: blockers.SOURCE_KEY_MISSING,
            }
          }
          return {
            status: "ready",
            credential: values[0]!,
            credentials: values.map((value) => ({ value, enabled: true })),
          }
        } catch (error) {
          const normalized = normalizeAbort(error)
          if (
            options?.signal?.aborted ||
            (normalized instanceof Error && normalized.name === "AbortError")
          ) {
            throw normalized
          }
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
          }
        }
      },
    },
    target: {
      // A gpt-load group owns a credential pool, so every source key fits.
      supportsMultipleCredentials: () => true,
      prepare: async (source) => {
        const type = resolveManagedSiteMigrationType(
          source,
          SITE_TYPES.GPT_LOAD,
        )
        if (type.status === "unsupported") {
          throw new Error(
            "gpt-load does not support this migration channel type",
          )
        }
        return {
          projection: {
            name: "",
            type: type.value,
            baseUrl: source.baseUrl,
            models: [...source.models],
            groups: [],
            enabled: source.status === "enabled",
          },
          adjustments: {
            remappedType: type.remappedType,
            normalizedBaseUrl: false,
            forcedDefaultGroup: false,
            simplifiedStatus: source.status === "other",
          },
        }
      },
      create: async (command, options) => {
        const channelId = String(command.projection.type).trim()
        if (command.targetSiteType !== SITE_TYPES.GPT_LOAD || !channelId) {
          return { status: "failed", failureCode: failures.TargetRejected }
        }
        const sourceBaseUrl = command.projection.baseUrl.trim()
        // A source address on this driver's own first-party endpoint keeps the
        // driver default; any other address is written as the base_url override.
        const baseUrl =
          sourceBaseUrl &&
          resolveGptLoadFirstPartyChannel(sourceBaseUrl) !== channelId
            ? sourceBaseUrl
            : ""
        const credentials =
          command.credentials && command.credentials.length > 0
            ? command.credentials
            : [{ value: command.credential, enabled: true }]
        const keys = credentials
          .map((entry) => entry.value.trim())
          .filter(Boolean)
        if (keys.length === 0) {
          return { status: "failed", failureCode: failures.TargetRejected }
        }

        const editorCommand: GptLoadGroupEditorCommand = {
          name: command.projection.name.trim(),
          channelId,
          baseUrl,
          models: [...command.projection.models],
          priceMultiplier: "1",
          credentialPatch: {
            baseline: "",
            entries: keys.map((value, index) => ({
              id: `new-${index}`,
              fields: {},
              secret: {
                kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
                value,
              },
            })),
          },
        }

        try {
          const operations = await openGptLoadNativeResourceOperations(options)
          const result = await operations.create(editorCommand, options)
          switch (result.outcome) {
            case MANAGED_SITE_MUTATION_OUTCOMES.Succeeded:
              return { status: "created" }
            case MANAGED_SITE_MUTATION_OUTCOMES.Rejected:
              return { status: "failed", failureCode: failures.TargetRejected }
            case MANAGED_SITE_MUTATION_OUTCOMES.Partial:
            case MANAGED_SITE_MUTATION_OUTCOMES.Uncertain:
              return { status: "uncertain" }
          }
        } catch (error) {
          const normalized = normalizeAbort(error)
          if (normalized instanceof Error && normalized.name === "AbortError") {
            throw normalized
          }
          const failure =
            normalized instanceof GptLoadNativeError ||
            normalized instanceof ManagedResourceError
              ? normalized.failure
              : null
          return {
            status: "failed",
            failureCode: failure
              ? toConfirmedFailure(failure)
              : failures.Unexpected,
          }
        }
      },
    },
  }
