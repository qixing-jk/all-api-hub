import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSiteChannelDraft"
import { SITE_TYPES } from "~/constants/siteType"
import {
  isManagedResourceRefFor,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  cliProxyApiKeys,
  cliProxyApiScope,
  createCliProxyApiResource,
  getCliProxyApiResource,
} from "~/services/apiAdapters/managedResources/cliProxyApi"
import {
  isManagedSiteMigrationSourceType,
  resolveManagedSiteMigrationType,
} from "~/services/apiAdapters/managedResources/migrationTypeRoutes"
import { getManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES as blockers } from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES as failures,
  type ManagedSiteMigrationCapability,
  type ManagedSiteMigrationSelection,
} from "~/types/managedSiteMigrationCapability"

const siteType = SITE_TYPES.CLI_PROXY_API
const open = async (options?: ResourceOperationOptions) => {
  options?.signal?.throwIfAborted()
  const runtime = await getManagedSiteRuntimeConfigForType(siteType)
  options?.signal?.throwIfAborted()
  if (!runtime) throw new Error("CLIProxyAPI configuration required")
  return runtime.config
}
const read = async (
  selection: ManagedSiteMigrationSelection,
  options?: ResourceOperationOptions,
) => {
  const config = await open(options)
  if (
    !isManagedResourceRefFor(selection.ref, {
      siteType,
      kind: "channel",
      scopeKey: cliProxyApiScope(config),
    })
  )
    return null
  return getCliProxyApiResource(config, selection.ref.resourceId, options)
}

/** API-key providers only; OAuth files and structured Vertex credentials have no cross-site route. */
export const cliProxyApiManagedSiteMigrationCapability: ManagedSiteMigrationCapability =
  {
    source: {
      createSelectionValidationContext: async (options) => {
        const config = await open(options)
        return {
          isValid: (selection) =>
            isManagedResourceRefFor(selection.ref, {
              siteType,
              kind: "channel",
              scopeKey: cliProxyApiScope(config),
            }),
        }
      },
      prepare: async (selection, options) => {
        const resource = await read(selection, options)
        if (!resource)
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
          }
        if (!isManagedSiteMigrationSourceType(siteType, resource.kind))
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_TYPE_UNSUPPORTED,
          }
        const keys = cliProxyApiKeys(resource)
        if (
          !keys.length ||
          keys.some((key) => !hasUsableManagedSiteChannelKey(key))
        )
          return { status: "blocked", reasonCode: blockers.SOURCE_KEY_MISSING }
        const value = resource.value
        return {
          status: "ready",
          source: {
            sourceSiteType: siteType,
            resourceType: resource.kind,
            baseUrl: value["base-url"] ?? "",
            models: (value.models ?? []).map((model) => model.name),
            groups: [],
            priority:
              typeof value.priority === "number"
                ? value.priority
                : DEFAULT_CHANNEL_FIELDS.priority,
            weight: DEFAULT_CHANNEL_FIELDS.weight,
            status:
              value.disabled === true ||
              (Array.isArray(value["excluded-models"]) &&
                value["excluded-models"].includes("*"))
                ? "disabled"
                : "enabled",
            ...(keys.length > 1
              ? { credentialMetadata: keys.map(() => ({ enabled: true })) }
              : {}),
            lossSignals: {
              hasModelMapping: (value.models ?? []).some(
                (model) => !!model.alias && model.alias !== model.name,
              ),
              hasStatusCodeMapping: false,
              hasMultiKeyState: false,
              hasAdvancedSettings:
                Object.keys(value).some(
                  (key) =>
                    ![
                      "name",
                      "base-url",
                      "api-key",
                      "api-key-entries",
                      "models",
                      "priority",
                      "disabled",
                    ].includes(key),
                ) ||
                (value["api-key-entries"] ?? []).some((entry) =>
                  Object.keys(entry).some((key) => key !== "api-key"),
                ),
            },
          },
        }
      },
      resolveCredential: async (selection, options) => {
        const resource = await read(selection, options)
        if (!resource)
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
          }
        const keys = cliProxyApiKeys(resource)
        if (
          !keys.length ||
          keys.some((key) => !hasUsableManagedSiteChannelKey(key))
        )
          return { status: "blocked", reasonCode: blockers.SOURCE_KEY_MISSING }
        return {
          status: "ready",
          credential: keys[0],
          ...(keys.length > 1
            ? { credentials: keys.map((value) => ({ value, enabled: true })) }
            : {}),
        }
      },
    },
    target: {
      supportsMultipleCredentials: (source) => {
        const route = resolveManagedSiteMigrationType(source, siteType)
        return (
          route.status === "mapped" &&
          route.value === "openai-compatibility" &&
          source.credentialMetadata?.every((key) => key.enabled) === true
        )
      },
      prepare: async (source) => {
        const route = resolveManagedSiteMigrationType(source, siteType)
        if (route.status === "unsupported")
          throw new Error("Unsupported CLIProxyAPI migration route")
        const url = new URL(source.baseUrl)
        if (
          !["http:", "https:"].includes(url.protocol) ||
          !source.models.length
        )
          throw new Error(
            "CLIProxyAPI migration requires a base URL and models",
          )
        return {
          projection: {
            name: "",
            type: route.value,
            baseUrl: source.baseUrl,
            models: [...source.models],
            groups: [],
            priority: source.priority,
            weight: DEFAULT_CHANNEL_FIELDS.weight,
            enabled: source.status === "enabled",
          },
          adjustments: {
            remappedType: route.remappedType,
            normalizedBaseUrl: false,
            forcedDefaultGroup: source.groups.length > 0,
            ignoredPriority: false,
            ignoredWeight: source.weight !== DEFAULT_CHANNEL_FIELDS.weight,
            simplifiedStatus: source.status === "other",
          },
        }
      },
      create: async (command, options) => {
        const route = resolveManagedSiteMigrationType(command.source, siteType)
        if (
          command.targetSiteType !== siteType ||
          route.status === "unsupported" ||
          route.value !== command.projection.type ||
          !hasUsableManagedSiteChannelKey(command.credential)
        )
          return { status: "failed", failureCode: failures.TargetRejected }
        const keys = command.credentials?.map((key) => key.value) ?? [
          command.credential,
        ]
        if (
          !keys.length ||
          keys.some((key) => !hasUsableManagedSiteChannelKey(key)) ||
          (command.credentials &&
            (route.value !== "openai-compatibility" ||
              command.credentials.some((key) => !key.enabled)))
        )
          return { status: "failed", failureCode: failures.TargetRejected }
        // API-key lists and excluded-models are persisted through the same native
        // CRUD path as the editor: github.com/router-for-me/CLIProxyAPI/internal/api/handlers/management/config_lists.go
        const result = await createCliProxyApiResource(
          await open(options),
          {
            kind: route.value,
            value: {
              ...(route.value === "openai-compatibility"
                ? {
                    name: command.projection.name,
                    "api-key-entries": keys.map((key) => ({ "api-key": key })),
                  }
                : { "api-key": keys[0] }),
              "base-url": command.projection.baseUrl,
              models: command.projection.models.map((name) => ({
                name,
                alias: name,
              })),
              priority: command.projection.priority,
              ...(route.value === "openai-compatibility"
                ? { disabled: !command.projection.enabled }
                : !command.projection.enabled
                  ? { "excluded-models": ["*"] }
                  : {}),
            },
          },
          options,
        )
        if (result.outcome === "succeeded") return { status: "created" }
        if (result.outcome === "rejected")
          return { status: "failed", failureCode: failures.TargetRejected }
        return { status: "uncertain" }
      },
    },
  }
