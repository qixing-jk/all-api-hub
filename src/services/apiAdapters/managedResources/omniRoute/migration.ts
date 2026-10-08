import { resolveOmniRouteBuiltinProvider } from "~/constants/omniroute"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  isManagedResourceRefFor,
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ResourceFailure,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  isManagedSiteMigrationSourceType,
  resolveManagedSiteMigrationType,
} from "~/services/apiAdapters/managedResources/migration/migrationTypeRoutes"
import { openOmniRouteNativeResourceOperations } from "~/services/apiAdapters/managedResources/omniRoute/nativeOperations"
import { OmniRouteNativeError } from "~/services/apiAdapters/managedResources/omniRoute/nativeRuntime"
import type { OmniRouteSanitizedConnection } from "~/services/apiService/omniroute/redaction"
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
    siteType: SITE_TYPES.OMNIROUTE,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    scopeKey,
  })
    ? selection.ref.resourceId
    : null

const normalizeAbort = (error: unknown): unknown => {
  if (
    !(error instanceof OmniRouteNativeError) ||
    error.failure.code !== MANAGED_RESOURCE_FAILURE_CODES.Aborted
  ) {
    return error
  }
  const abortError = new Error("OmniRoute operation was aborted.", {
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
    const operations = await openOmniRouteNativeResourceOperations(options)
    const resourceId = decodeSelectionResourceId(selection, operations.scopeKey)
    if (resourceId === null) return null
    return {
      detail: await operations.get(resourceId, options),
      operations,
      resourceId,
    }
  } catch (error) {
    throw normalizeAbort(error)
  }
}

const toSource = (
  detail: OmniRouteSanitizedConnection,
): ManagedSiteMigrationSource => ({
  sourceSiteType: SITE_TYPES.OMNIROUTE,
  resourceType: detail.provider,
  baseUrl: detail.baseUrl,
  // OmniRoute stores no per-channel model list, so there is nothing to carry.
  models: [],
  groups: [],
  status: detail.isActive ? "enabled" : "disabled",
  lossSignals: {
    hasModelMapping: false,
    hasStatusCodeMapping: false,
    // A compatible provider node's model prefix is a channel addressing mode
    // with no equivalent on any other managed site.
    hasAdvancedSettings: Boolean(detail.nodePrefix),
    hasMultiKeyState: false,
  },
})

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

/** Canonical source and target behavior for OmniRoute provider connections. */
export const omniRouteManagedSiteMigrationCapability: ManagedSiteMigrationCapability =
  {
    source: {
      createSelectionValidationContext: async (options) => {
        const operations = await openOmniRouteNativeResourceOperations(options)
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
            SITE_TYPES.OMNIROUTE,
            resolved.detail.provider,
          )
        ) {
          // Node-backed connections carry a generated provider id, and the route
          // table only admits the built-in providers whose protocol is known.
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_TYPE_UNSUPPORTED,
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
          const credential = (
            await resolved.operations.loadSecret(resolved.resourceId, options)
          ).trim()
          return hasUsableManagedSiteChannelKey(credential)
            ? { status: "ready", credential }
            : {
                status: "blocked",
                reasonCode: blockers.SOURCE_KEY_MISSING,
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
      prepare: async (source) => {
        const type = resolveManagedSiteMigrationType(
          source,
          SITE_TYPES.OMNIROUTE,
        )
        if (type.status === "unsupported") {
          throw new Error(
            "OmniRoute does not support this migration channel type",
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
        const provider = String(command.projection.type)
        if (command.targetSiteType !== SITE_TYPES.OMNIROUTE || !provider) {
          return { status: "failed", failureCode: failures.TargetRejected }
        }
        const sourceBaseUrl = command.projection.baseUrl.trim()
        try {
          const operations =
            await openOmniRouteNativeResourceOperations(options)
          const result = await operations.create(
            {
              provider,
              name: command.projection.name.trim(),
              apiKey: command.credential.trim(),
              // A recognised first-party endpoint keeps the provider's own
              // configuration; only an address no provider models needs the
              // connection-level override.
              baseUrl:
                sourceBaseUrl &&
                resolveOmniRouteBuiltinProvider(sourceBaseUrl) !== provider
                  ? sourceBaseUrl
                  : "",
              // No default model: OmniRoute stores no channel model list, and
              // picking one of the source's models would silently route
              // unspecified traffic.
              defaultModel: "",
              prefix: "",
            },
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
        } catch (error) {
          const normalized = normalizeAbort(error)
          if (normalized instanceof Error && normalized.name === "AbortError") {
            throw normalized
          }
          const failure =
            normalized instanceof OmniRouteNativeError ||
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
