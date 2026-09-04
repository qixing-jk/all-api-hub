import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import { DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
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
  ClaudeCodeHubNativeError,
  normalizeClaudeCodeHubAllowedModels,
  openClaudeCodeHubNativeResourceOperations,
} from "~/services/apiAdapters/managedResources/claudeCodeHub"
import {
  mapChannelTypeToClaudeCodeHubProviderType,
  mapClaudeCodeHubProviderTypeToChannelTypeStrict,
} from "~/services/apiAdapters/managedResources/claudeCodeHubChannelType"
import { MANAGED_SITE_MUTATION_OUTCOMES } from "~/services/managedSites/mutations"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type {
  ClaudeCodeHubAllowedModel,
  ClaudeCodeHubProviderCreatePayload,
  ClaudeCodeHubProviderDisplay,
} from "~/types/claudeCodeHub"
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

const hasMeaningfulValue = (value: unknown): boolean => {
  if (value === null || value === undefined || value === false) return false
  if (typeof value === "string") return Boolean(value.trim())
  if (typeof value === "number") return value !== 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.keys(value).length > 0
  return true
}

const hasNonExactAllowedModels = (
  values?: ClaudeCodeHubAllowedModel[] | null,
): boolean =>
  (values ?? []).some(
    (value) =>
      typeof value !== "string" &&
      Boolean(value?.matchType && value.matchType !== "exact"),
  )

// Defaults come from v0.9.5's provider columns. Only non-default values are
// lossy: https://github.com/ding113/claude-code-hub/blob/dfeb14331cb350f672e92a3684adecf1052dd476/src/drizzle/schema.ts
const CLAUDE_CODE_HUB_ADVANCED_DEFAULTS = {
  mcpPassthroughType: "none",
  limit5hResetMode: "rolling",
  dailyResetMode: "fixed",
  dailyResetTime: "00:00",
} as const

const hasAdvancedSettings = (detail: ClaudeCodeHubProviderDisplay): boolean =>
  hasNonExactAllowedModels(detail.allowedModels) ||
  (typeof detail.mcpPassthroughType === "string" &&
    detail.mcpPassthroughType.trim() !== "" &&
    detail.mcpPassthroughType !==
      CLAUDE_CODE_HUB_ADVANCED_DEFAULTS.mcpPassthroughType) ||
  detail.proxyFallbackToDirect === true ||
  (typeof detail.limit5hResetMode === "string" &&
    detail.limit5hResetMode !==
      CLAUDE_CODE_HUB_ADVANCED_DEFAULTS.limit5hResetMode) ||
  (typeof detail.dailyResetMode === "string" &&
    detail.dailyResetMode !==
      CLAUDE_CODE_HUB_ADVANCED_DEFAULTS.dailyResetMode) ||
  (typeof detail.dailyResetTime === "string" &&
    detail.dailyResetTime !==
      CLAUDE_CODE_HUB_ADVANCED_DEFAULTS.dailyResetTime) ||
  [
    detail.groupPriorities,
    detail.providerVendorId,
    detail.preserveClientIp,
    detail.disableSessionReuse,
    detail.activeTimeStart,
    detail.activeTimeEnd,
    detail.allowedClients,
    detail.blockedClients,
    detail.mcpPassthroughUrl,
    detail.limit5hUsd,
    detail.limitDailyUsd,
    detail.limitWeeklyUsd,
    detail.limitMonthlyUsd,
    detail.limitTotalUsd,
    detail.totalCostResetAt,
    detail.limitConcurrentSessions,
    detail.maxRetryAttempts,
    detail.circuitBreakerFailureThreshold,
    detail.circuitBreakerOpenDuration,
    detail.circuitBreakerHalfOpenSuccessThreshold,
    detail.proxyUrl,
    detail.customHeaders,
    detail.firstByteTimeoutStreamingMs,
    detail.streamingIdleTimeoutMs,
    detail.requestTimeoutNonStreamingMs,
    detail.websiteUrl,
    detail.faviconUrl,
    detail.cacheTtlPreference,
    detail.swapCacheTtlBilling,
    detail.context1mPreference,
    detail.codexReasoningEffortPreference,
    detail.codexReasoningSummaryPreference,
    detail.codexTextVerbosityPreference,
    detail.codexParallelToolCallsPreference,
    detail.codexImageGenerationPreference,
    detail.codexServiceTierPreference,
    detail.anthropicMaxTokensPreference,
    detail.anthropicThinkingBudgetPreference,
    detail.anthropicAdaptiveThinking,
    detail.geminiGoogleSearchPreference,
  ].some(hasMeaningfulValue) ||
  (typeof detail.costMultiplier === "number" && detail.costMultiplier !== 1)

const decodeSelectionProviderId = (
  selection: ManagedSiteMigrationSelection,
  scopeKey: string,
): number | null => {
  if (
    !isManagedResourceRefFor(selection.ref, {
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey,
    })
  ) {
    return null
  }
  const providerId = Number(selection.ref.resourceId)
  return Number.isSafeInteger(providerId) && providerId > 0 ? providerId : null
}

const normalizeAbort = (error: unknown): unknown => {
  if (
    !(error instanceof ClaudeCodeHubNativeError) ||
    error.failure.code !== MANAGED_RESOURCE_FAILURE_CODES.Aborted
  ) {
    return error
  }
  const abortError = new Error("Claude Code Hub operation was aborted.", {
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
    const operations = await openClaudeCodeHubNativeResourceOperations(options)
    const providerId = decodeSelectionProviderId(selection, operations.scopeKey)
    if (providerId === null) return null
    const detail = await operations.get(providerId, options)
    return { detail, operations, providerId }
  } catch (error) {
    throw normalizeAbort(error)
  }
}

const toSource = (
  detail: ClaudeCodeHubProviderDisplay,
  resourceType: ManagedSiteMigrationSource["resourceType"],
): ManagedSiteMigrationSource => ({
  sourceSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
  resourceType,
  baseUrl: detail.url?.trim() ?? "",
  models: normalizeClaudeCodeHubAllowedModels(detail.allowedModels),
  groups: detail.groupTag?.trim() ? [detail.groupTag.trim()] : [],
  priority: detail.priority ?? DEFAULT_CHANNEL_FIELDS.priority,
  weight: detail.weight ?? DEFAULT_CHANNEL_FIELDS.weight,
  status: detail.isEnabled === false ? "disabled" : "enabled",
  lossSignals: {
    hasModelMapping: hasMeaningfulValue(detail.modelRedirects),
    hasStatusCodeMapping: false,
    hasAdvancedSettings: hasAdvancedSettings(detail),
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

const normalizedPriority = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0

const normalizedWeight = (value: number) =>
  Number.isFinite(value) ? Math.min(100, Math.max(1, Math.trunc(value))) : 1

/** Canonical source and target behavior for Claude Code Hub native providers. */
export const claudeCodeHubManagedSiteMigrationCapability: ManagedSiteMigrationCapability =
  {
    source: {
      createSelectionValidationContext: async (options) => {
        const operations =
          await openClaudeCodeHubNativeResourceOperations(options)
        return {
          isValid: (selection) =>
            decodeSelectionProviderId(selection, operations.scopeKey) !== null,
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
        const mappedType = mapClaudeCodeHubProviderTypeToChannelTypeStrict(
          resolved.detail.providerType ??
            CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
        )
        if (mappedType.status === "unsupported") {
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_TYPE_UNSUPPORTED,
          }
        }
        return {
          status: "ready",
          source: toSource(resolved.detail, mappedType.value),
        }
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
            await resolved.operations.loadSecret(resolved.providerId, options)
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
        const type = mapChannelTypeToClaudeCodeHubProviderType(
          source.resourceType,
        )
        const roundTripType =
          mapClaudeCodeHubProviderTypeToChannelTypeStrict(type)
        const groups = [
          source.groups[0]?.trim() || DEFAULT_CHANNEL_FIELDS.groups[0],
        ]
        const priority = normalizedPriority(source.priority)
        const weight = normalizedWeight(source.weight)
        return {
          projection: {
            name: "",
            type,
            baseUrl: source.baseUrl,
            models: [...source.models],
            groups,
            priority,
            weight,
            status: source.status === "enabled" ? 1 : 2,
          },
          adjustments: {
            remappedType:
              roundTripType.status === "unsupported" ||
              roundTripType.value !== source.resourceType,
            normalizedBaseUrl: false,
            forcedDefaultGroup:
              source.groups.length !== 1 || source.groups[0] !== groups[0],
            ignoredPriority: priority !== source.priority,
            ignoredWeight: weight !== source.weight,
            simplifiedStatus: source.status === "other",
          },
        }
      },
      create: async (command, options) => {
        const type = String(command.projection.type)
        if (
          mapClaudeCodeHubProviderTypeToChannelTypeStrict(type).status ===
          "unsupported"
        ) {
          return {
            status: "failed",
            failureCode: failures.TargetRejected,
          }
        }
        const payload: ClaudeCodeHubProviderCreatePayload = {
          name: command.projection.name.trim(),
          url: command.projection.baseUrl.trim(),
          key: command.credential.trim(),
          provider_type: type,
          allowed_models: command.projection.models.map((pattern) => ({
            matchType: "exact",
            pattern,
          })),
          group_tag:
            command.projection.groups[0]?.trim() ||
            DEFAULT_CHANNEL_FIELDS.groups[0],
          priority: normalizedPriority(command.projection.priority),
          weight: normalizedWeight(command.projection.weight),
          is_enabled: command.projection.status === 1,
        }
        try {
          const operations =
            await openClaudeCodeHubNativeResourceOperations(options)
          const result = await operations.create(payload, options)
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
        } catch (error) {
          const normalized = normalizeAbort(error)
          if (normalized instanceof Error && normalized.name === "AbortError") {
            throw normalized
          }
          const failure =
            normalized instanceof ClaudeCodeHubNativeError ||
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
