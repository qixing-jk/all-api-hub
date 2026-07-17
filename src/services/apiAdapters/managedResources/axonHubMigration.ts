import { AXON_HUB_CHANNEL_STATUS } from "~/constants/axonHub"
import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import {
  AxonHubNativeError,
  isRegularAxonHubChannelType,
  openAxonHubNativeResourceOperations,
  type AxonHubNativeFailure,
} from "~/services/apiAdapters/managedResources/axonHub"
import {
  mapAxonHubChannelTypeToChannelType,
  mapChannelTypeToAxonHubChannelType,
} from "~/services/apiAdapters/managedResources/axonHubChannelType"
import type { AxonHubChannel, AxonHubCreateChannelInput } from "~/types/axonHub"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES } from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES,
  type ManagedSiteMigrationCapability,
  type ManagedSiteMigrationConfirmedFailureCode,
  type ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"
import { normalizeList } from "~/utils/core/string"

const blockers = MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES
const failures = MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES

const getCredentialCandidates = (channel: AxonHubChannel): string[] =>
  [
    ...(channel.credentials?.apiKeys ?? []),
    ...(channel.credentials?.apiKey ? [channel.credentials.apiKey] : []),
  ]
    .map((key) => key.trim())
    .filter(Boolean)

const inspectCredential = (channel: AxonHubChannel) => {
  if (channel.credentials === null) {
    return { state: "permission-hidden" as const }
  }
  if (!isRegularAxonHubChannelType(String(channel.type))) {
    return { state: "unavailable" as const }
  }
  const candidates = getCredentialCandidates(channel)
  const credential = candidates.find(hasUsableApiTokenKey)
  if (credential) return { state: "available" as const, credential }
  return candidates.length > 0
    ? { state: "masked" as const }
    : { state: "unavailable" as const }
}

const credentialBlocker = (
  state: "permission-hidden" | "masked" | "unavailable",
) =>
  state === "permission-hidden"
    ? blockers.SOURCE_KEY_RESOLUTION_FAILED
    : blockers.SOURCE_KEY_MISSING

const hasAdvancedSettings = (channel: AxonHubChannel): boolean =>
  Boolean(
    (channel.settings && Object.keys(channel.settings).length > 0) ||
      (channel.policies && Object.keys(channel.policies).length > 0) ||
      channel.endpoints?.length ||
      channel.tags?.length ||
      channel.autoSyncSupportedModels ||
      channel.autoSyncModelPattern ||
      channel.remark,
  )

const toCanonicalSource = (
  channel: AxonHubChannel,
): ManagedSiteMigrationSource => ({
  sourceSiteType: SITE_TYPES.AXON_HUB,
  resourceType: mapAxonHubChannelTypeToChannelType(String(channel.type)),
  baseUrl: channel.baseURL?.trim() ?? "",
  models: normalizeList([
    ...(channel.supportedModels ?? []),
    ...(channel.manualModels ?? []),
  ]),
  groups: [],
  priority: DEFAULT_CHANNEL_FIELDS.priority,
  weight: channel.orderingWeight ?? DEFAULT_CHANNEL_FIELDS.weight,
  status:
    channel.status === AXON_HUB_CHANNEL_STATUS.ENABLED
      ? "enabled"
      : channel.status === AXON_HUB_CHANNEL_STATUS.DISABLED
        ? "disabled"
        : "other",
  lossSignals: {
    hasModelMapping: Boolean(channel.settings?.modelMappings?.length),
    hasStatusCodeMapping: false,
    hasAdvancedSettings: hasAdvancedSettings(channel),
    hasMultiKeyState: getCredentialCandidates(channel).length > 1,
  },
})

const toConfirmedFailureCode = (
  failure: AxonHubNativeFailure,
): ManagedSiteMigrationConfirmedFailureCode => {
  switch (failure.code) {
    case "upstream_rejected":
      return failures.TargetRejected
    case "configuration_required":
    case "invalid_configuration":
    case "authentication_failed":
    case "permission_denied":
    case "not_found":
    case "unavailable":
      return failures.TargetUnavailable
    default:
      return failures.Unexpected
  }
}

const normalizeAxonHubNativeAbort = (error: unknown): unknown => {
  if (
    !(error instanceof AxonHubNativeError) ||
    error.failure.code !== "aborted"
  ) {
    return error
  }

  const abortError = new Error("AxonHub native operation was aborted.", {
    cause: error,
  })
  abortError.name = "AbortError"
  return abortError
}

const withNormalizedAxonHubAbort = async <T>(
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw normalizeAxonHubNativeAbort(error)
  }
}

/**
 * AxonHub beta5 regular channels use apiKeys and a separate status mutation.
 * Source: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/features/channels/data/schema.ts
 */
export const axonHubManagedSiteMigrationCapability: ManagedSiteMigrationCapability =
  {
    source: {
      prepare: async (selection, options) => {
        const detail = await withNormalizedAxonHubAbort(async () => {
          const operations = await openAxonHubNativeResourceOperations(options)
          return await operations.get(selection.ref, options)
        })
        const credential = inspectCredential(detail)
        if (credential.state !== "available") {
          return {
            status: "blocked",
            reasonCode: credentialBlocker(credential.state),
          }
        }
        return { status: "ready", source: toCanonicalSource(detail) }
      },
      resolveCredential: async (selection, options) => {
        const detail = await withNormalizedAxonHubAbort(async () => {
          const operations = await openAxonHubNativeResourceOperations(options)
          return await operations.get(selection.ref, options)
        })
        const credential = inspectCredential(detail)
        if (credential.state !== "available") {
          return {
            status: "blocked",
            reasonCode: credentialBlocker(credential.state),
          }
        }
        return { status: "ready", credential: credential.credential }
      },
    },
    target: {
      prepare: async (source) => {
        const models = normalizeList(source.models)
        if (models.length === 0) {
          throw new Error("AxonHub migration requires at least one model.")
        }
        const type = mapChannelTypeToAxonHubChannelType(source.resourceType)
        const groups = [...DEFAULT_CHANNEL_FIELDS.groups]
        const priority = DEFAULT_CHANNEL_FIELDS.priority
        return {
          projection: {
            name: "",
            type,
            baseUrl: source.baseUrl,
            models,
            groups,
            priority,
            weight: source.weight,
            status: source.status === "enabled" ? 1 : 2,
          },
          adjustments: {
            remappedType: String(type) !== String(source.resourceType),
            normalizedBaseUrl: false,
            forcedDefaultGroup:
              groups.length !== source.groups.length ||
              groups.some((group, index) => group !== source.groups[index]),
            ignoredPriority: priority !== source.priority,
            ignoredWeight: false,
            simplifiedStatus: source.status === "other",
          },
        }
      },
      create: async (command, options) => {
        const baseURL = command.projection.baseUrl.trim()
        const input: AxonHubCreateChannelInput = {
          type:
            typeof command.projection.type === "string"
              ? command.projection.type
              : mapChannelTypeToAxonHubChannelType(command.source.resourceType),
          name: command.projection.name.trim(),
          ...(baseURL ? { baseURL } : {}),
          credentials: { apiKeys: [command.credential.trim()] },
          supportedModels: [...command.projection.models],
          manualModels: [...command.projection.models],
          defaultTestModel: command.projection.models[0] ?? "",
          settings: {},
          orderingWeight: command.projection.weight,
        }
        let operations: Awaited<
          ReturnType<typeof openAxonHubNativeResourceOperations>
        >
        try {
          operations = await withNormalizedAxonHubAbort(() =>
            openAxonHubNativeResourceOperations(options),
          )
        } catch (error) {
          if (!(error instanceof AxonHubNativeError)) {
            throw error
          }
          return {
            status: "failed",
            failureCode: toConfirmedFailureCode(error.failure),
          }
        }
        const result = await operations.create(
          input,
          command.projection.status === 1
            ? AXON_HUB_CHANNEL_STATUS.ENABLED
            : AXON_HUB_CHANNEL_STATUS.DISABLED,
          options,
        )
        if (result.certainty === "applied") return { status: "created" }
        if (result.certainty === "not-applied") {
          if (
            result.failure.code === "aborted" &&
            result.failure.dispatch === "before"
          ) {
            throw normalizeAxonHubNativeAbort(
              new AxonHubNativeError(result.failure),
            )
          }
          return {
            status: "failed",
            failureCode: toConfirmedFailureCode(result.failure),
          }
        }
        return { status: "uncertain" }
      },
    },
  }
