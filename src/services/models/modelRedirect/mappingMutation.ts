import type {
  ManagedModelMappingPolicy,
  ManagedResourceModelsCapability,
} from "~/services/apiAdapters/contracts/managedResourceModels"
import type {
  ManagedSiteRuntimeConfig,
  ManagedSiteRuntimeConfigValue,
} from "~/services/managedSites/configuration/runtimeConfig"
import { assertManagedResourceRefForSite } from "~/services/managedSites/managedResourceIdentity"
import { consumeManagedSiteMutationResult } from "~/services/managedSites/mutations/consumption"
import { type ManagedSiteMutationResult } from "~/services/managedSites/mutations/contracts"
import {
  collectManagedConfigSecrets,
  collectManagedResourceSecrets,
  mergeManagedResourceSecretCollections,
} from "~/services/managedSites/utils/resourceSecrets"
import type { ManagedModelChannel } from "~/types/managedResourceModels"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ModelRedirect")
export type ModelRedirectMappingWriter = {
  readonly knownSecrets: readonly string[]
  readonly knownSecretsComplete: boolean
  updateChannelModelMapping(
    channel: ManagedModelChannel,
    modelMapping: Record<string, string>,
  ): Promise<ManagedSiteMutationResult<unknown>>
  reconcileChannel?(channel: ManagedModelChannel): Promise<void>
}

export type ModelRedirectChannelCapabilities = Pick<
  ManagedResourceModelsCapability<ManagedSiteRuntimeConfigValue>,
  "list" | "updateModelMapping"
> & {
  list: NonNullable<
    ManagedResourceModelsCapability<ManagedSiteRuntimeConfigValue>["list"]
  >
  updateModelMapping: NonNullable<
    ManagedResourceModelsCapability<ManagedSiteRuntimeConfigValue>["updateModelMapping"]
  >
}

const appendMissingValues = (
  baseValues: readonly string[],
  valuesToAppend: readonly string[],
): string[] => {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of [...baseValues, ...valuesToAppend]) {
    const normalizedValue = value.trim()
    if (normalizedValue && !seen.has(normalizedValue)) {
      seen.add(normalizedValue)
      result.push(normalizedValue)
    }
  }

  return result
}

export const consumeModelRedirectMutationResult = async (
  result: unknown,
  reconcile: () => Promise<void>,
  knownSecrets: readonly string[],
  knownSecretsComplete: boolean,
) =>
  consumeManagedSiteMutationResult(result, {
    idempotent: true,
    retryableRejection: false,
    knownSecrets,
    knownSecretsComplete,
    reconcile,
    rejectedFallbackMessage: "Model mapping update was rejected",
    ambiguousFallbackMessage: "Model mapping update requires reconciliation",
    createError: (message) => new Error(message),
  })

export class DirectModelRedirectMappingWriter
  implements ModelRedirectMappingWriter
{
  private mutationKnownSecrets: readonly string[]
  private mutationKnownSecretsComplete = true

  constructor(
    private readonly runtimeConfig: ManagedSiteRuntimeConfig,
    private readonly channels: ModelRedirectChannelCapabilities,
  ) {
    this.mutationKnownSecrets = Object.freeze(
      collectManagedConfigSecrets(runtimeConfig.config),
    )
  }

  get knownSecrets(): readonly string[] {
    return this.mutationKnownSecrets
  }

  get knownSecretsComplete(): boolean {
    return this.mutationKnownSecretsComplete
  }

  async updateChannelModelMapping(
    channel: ManagedModelChannel,
    modelMapping: Record<string, string>,
  ): Promise<ManagedSiteMutationResult<unknown>> {
    assertManagedResourceRefForSite(channel.ref, this.runtimeConfig)
    const configSecrets = {
      knownSecrets: collectManagedConfigSecrets(this.runtimeConfig.config),
      complete: true,
    }
    const channelSecrets = collectManagedResourceSecrets(channel)
    const secrets = mergeManagedResourceSecretCollections(
      configSecrets,
      channelSecrets,
    )
    this.mutationKnownSecrets = Object.freeze(secrets.knownSecrets)
    // Model inventory projections do not establish a complete provider-secret set.
    // Updates may load additional hidden credentials; do not display their raw diagnostics.
    this.mutationKnownSecretsComplete = false
    return await this.channels.updateModelMapping(
      this.runtimeConfig.config,
      channel.ref,
      appendMissingValues(channel.models, Object.keys(modelMapping)),
      modelMapping,
    )
  }

  async reconcileChannel(): Promise<void> {
    await this.channels.list(this.runtimeConfig.config)
  }
}

/** Compares complete mapping contents before deciding whether a write is meaningful. */
function areModelMappingsEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false
  }

  return true
}

/** Resolves mapping chains using the adapter policy and removes unavailable targets. */
function pruneModelMappingMissingTargets(
  existingMapping: Record<string, unknown>,
  availableModels: ReadonlySet<string>,
  options?: {
    modelMappingPolicy?: ManagedModelMappingPolicy
  },
): { prunedMapping: Record<string, unknown>; removedCount: number } {
  let removedCount = 0
  const prunedMapping: Record<string, unknown> = {}

  const policy = options?.modelMappingPolicy
  const normalizeTargetForAvailability = (targetModel: string): string => {
    const trimmed = targetModel.trim()
    return policy?.normalizeTargetForAvailability?.(trimmed) ?? trimmed
  }

  const resolvesToAvailableModel = (startModel: string): boolean => {
    let current = startModel
    const visited = new Set<string>([current])

    while (true) {
      if (availableModels.has(current)) return true

      const nextRaw = existingMapping[current]
      if (typeof nextRaw !== "string") return false

      const next = normalizeTargetForAvailability(nextRaw)
      if (!next) return false

      if (visited.has(next)) return false
      visited.add(next)
      current = next
    }
  }

  for (const [sourceModel, targetModel] of Object.entries(existingMapping)) {
    if (typeof targetModel !== "string") {
      prunedMapping[sourceModel] = targetModel
      continue
    }

    const normalizedTarget = normalizeTargetForAvailability(targetModel)
    const isAvailable =
      Boolean(normalizedTarget) &&
      (availableModels.has(normalizedTarget) ||
        (policy?.supportsChaining &&
          resolvesToAvailableModel(normalizedTarget)))

    if (!isAvailable) {
      removedCount += 1
      continue
    }

    prunedMapping[sourceModel] = targetModel
  }

  return { prunedMapping, removedCount }
}

/**
 * Apply model mapping to a channel with incremental merge
 * Merges new mapping with existing mapping (new keys override old keys)
 * @param channel Target channel's model-task input.
 * @param newMapping Mapping of standard model -> upstream model.
 * @param service Model mapping writer used to update channel.
 */
export async function applyModelMappingToChannel(
  channel: ManagedModelChannel,
  newMapping: Record<string, string>,
  service: ModelRedirectMappingWriter,
  options?: {
    availableModels?: string[]
    pruneMissingTargets?: boolean
    modelMappingPolicy?: ManagedModelMappingPolicy
  },
): Promise<{ updated: boolean; prunedCount: number }> {
  const hasNewMapping = Object.keys(newMapping).length > 0
  const shouldPrune =
    Boolean(options?.pruneMissingTargets) &&
    Array.isArray(options?.availableModels)

  if (!hasNewMapping && !shouldPrune) {
    return { updated: false, prunedCount: 0 }
  }

  // Parse the provider's existing redirect mapping.
  let existingMapping: Record<string, unknown> = {}
  let canPruneExisting = true

  const rawExisting = channel.modelMapping
  if (rawExisting) {
    try {
      const parsed = JSON.parse(rawExisting) as unknown
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("existing model_mapping is not an object")
      }
      existingMapping = parsed as Record<string, unknown>
    } catch (parseError) {
      canPruneExisting = false
      logger.warn("Failed to parse existing model_mapping for channel", {
        resourceRef: channel.ref,
        error: parseError,
      })
    }
  }

  let prunedCount = 0
  let baseMapping: Record<string, unknown> = existingMapping

  if (shouldPrune && canPruneExisting) {
    const availableModelsSet = new Set(
      options?.availableModels?.map((model) => model.trim()).filter(Boolean),
    )
    const { prunedMapping, removedCount } = pruneModelMappingMissingTargets(
      existingMapping,
      availableModelsSet,
      { modelMappingPolicy: options?.modelMappingPolicy },
    )
    baseMapping = prunedMapping
    prunedCount = removedCount
  }

  // Merge mappings: new mapping overrides existing keys
  const mergedMapping: Record<string, unknown> = {
    ...baseMapping,
    ...newMapping,
  }

  if (canPruneExisting) {
    const hasMeaningfulChange = !areModelMappingsEqual(
      mergedMapping,
      existingMapping,
    )

    if (!hasMeaningfulChange) {
      return { updated: false, prunedCount }
    }
  } else if (!hasNewMapping) {
    // Best-effort safety: if the existing mapping is invalid and we're not
    // applying any new mapping, skip any destructive action (including prune).
    return { updated: false, prunedCount: 0 }
  }

  const mutationResult = await service.updateChannelModelMapping(
    channel,
    mergedMapping as Record<string, string>,
  )
  await consumeModelRedirectMutationResult(
    mutationResult,
    () => service.reconcileChannel?.(channel) ?? Promise.resolve(),
    service.knownSecrets ?? [],
    service.knownSecretsComplete,
  )

  return { updated: true, prunedCount }
}
