import type { NewApiChannel } from "~/types"
import { CHANNEL_STATUS } from "~/types"
import type {
  GenerateMappingOptions,
  ModelCandidate,
  ModelMappingResult,
  ModelRedirectMapping,
  ScoringChannel,
  ScoringCoefficients
} from "~/types"
import {
  compareModels,
  extractModelTokens,
  isModelMatch,
  normalizeModelName,
  parseDateFromModelName
} from "~/utils/modelName"

import { NewApiModelSyncService } from "../newApiModelSync"
import { getNewApiConfig } from "../newApiService"
import { userPreferences } from "../userPreferences"
import { modelRedirectStorage } from "./storage"

const DEFAULT_SCORING_COEFFICIENTS: ScoringCoefficients = {
  priorityWeight: 10000,
  weightWeight: 100,
  usedQuotaWeight: -1
}

/**
 * Convert NewApiChannel to ScoringChannel
 */
function channelToScoringChannel(
  channel: NewApiChannel & { used_quota?: number }
): ScoringChannel {
  const parsedModels = channel.models
    ? channel.models
        .split(",")
        .map((m: string) => m.trim())
        .filter(Boolean)
    : []

  // Deduplicate models
  const uniqueModels = Array.from(new Set(parsedModels))

  return {
    id: channel.id,
    name: channel.name,
    status: channel.status,
    priority: channel.priority ?? 0,
    weight: channel.weight ?? 0,
    models: uniqueModels,
    used_quota: channel.used_quota
  }
}

/**
 * Filter enabled channels
 */
function filterEnabledChannels(channels: ScoringChannel[]): ScoringChannel[] {
  return channels.filter((ch) => ch.status === CHANNEL_STATUS.Enable)
}

/**
 * Find candidates for a standard model across all channels
 */
function findCandidatesForModel(
  standardModel: string,
  channels: ScoringChannel[]
): ModelCandidate[] {
  const candidates: ModelCandidate[] = []

  for (const channel of channels) {
    for (const channelModel of channel.models) {
      if (isModelMatch(channelModel, standardModel)) {
        candidates.push({
          channelId: channel.id,
          channelName: channel.name,
          channelPriority: channel.priority,
          channelWeight: channel.weight,
          channelUsedQuota: channel.used_quota ?? 0,
          modelName: channelModel,
          normalizedModel: normalizeModelName(channelModel),
          parsedDate: parseDateFromModelName(channelModel),
          normalizedTokens: extractModelTokens(channelModel)
        })
      }
    }
  }

  return candidates
}

/**
 * Score a candidate based on channel attributes
 */
function scoreCandidate(
  candidate: ModelCandidate,
  coefficients: ScoringCoefficients
): number {
  const priorityScore = candidate.channelPriority * coefficients.priorityWeight
  const weightScore = candidate.channelWeight * coefficients.weightWeight
  const quotaScore = candidate.channelUsedQuota * coefficients.usedQuotaWeight

  return priorityScore + weightScore + quotaScore
}

/**
 * Select best candidate from a list
 * Uses scoring and deterministic tie-breaking
 */
function selectBestCandidate(
  candidates: ModelCandidate[],
  coefficients: ScoringCoefficients
): ModelCandidate | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  // Score all candidates
  const scored = candidates.map((candidate) => ({
    candidate,
    score: scoreCandidate(candidate, coefficients)
  }))

  // Sort by score (highest first)
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }

    // Tie-breaker: use model comparison (date, version, lexicographic)
    return compareModels(a.candidate.modelName, b.candidate.modelName)
  })

  return scored[0].candidate
}

/**
 * Build reason string explaining selection
 */
function buildReason(
  candidate: ModelCandidate,
  score: number,
  totalCandidates: number
): string {
  const parts: string[] = []

  parts.push(`Selected from ${totalCandidates} candidate(s)`)
  parts.push(`Channel Model: ${candidate.modelName}`)
  parts.push(`Priority: ${candidate.channelPriority}`)
  parts.push(`Weight: ${candidate.channelWeight}`)
  parts.push(`Used Quota: ${candidate.channelUsedQuota}`)

  if (candidate.parsedDate) {
    parts.push(`Date: ${candidate.parsedDate}`)
  }

  parts.push(`Score: ${score.toFixed(2)}`)

  return parts.join(", ")
}

/**
 * Generate model mapping from channel data
 */
export async function generateModelMapping(
  options: GenerateMappingOptions = { trigger: "manual" }
): Promise<ModelMappingResult> {
  const { trigger, scoringCoefficients = {} } = options

  // Merge with default coefficients
  const coefficients: ScoringCoefficients = {
    ...DEFAULT_SCORING_COEFFICIENTS,
    ...scoringCoefficients
  }

  // Get New API config
  const config = await getNewApiConfig()
  if (!config) {
    throw new Error("New API configuration is missing or incomplete")
  }

  // Get preferences for rate limiting
  const prefs = await userPreferences.getPreferences()
  const syncPrefs = prefs.newApiModelSync

  // Create service instance with rate limiter
  const service = new NewApiModelSyncService(
    config.baseUrl,
    config.token,
    config.userId,
    syncPrefs?.rateLimit
  )

  // Fetch channel list
  let channelListData
  try {
    channelListData = await service.listChannels()
  } catch (error) {
    console.error("[MappingService] Failed to fetch channels:", error)
    throw new Error("Failed to fetch channel list from New API")
  }

  // Convert to scoring channels
  const scoringChannels = channelListData.items.map(channelToScoringChannel)

  // Fetch models for each channel to ensure up-to-date data
  await Promise.all(
    scoringChannels.map(async (channel) => {
      try {
        const fetchedModels = await service.fetchChannelModels(channel.id)
        if (Array.isArray(fetchedModels) && fetchedModels.length > 0) {
          channel.models = Array.from(
            new Set(
              fetchedModels
                .map((model) => model.trim())
                .filter(Boolean)
            )
          )
        }
      } catch (error) {
        console.warn(
          `[MappingService] Failed to fetch models for channel ${channel.id}:`,
          error
        )
        // Fall back to existing models parsed from channel info
        channel.models = Array.from(
          new Set(channel.models.map((model) => model.trim()).filter(Boolean))
        )
      }
    })
  )

  // Filter enabled channels
  const enabledChannels = filterEnabledChannels(scoringChannels)

  if (enabledChannels.length === 0) {
    throw new Error("No enabled channels found")
  }

  // Collect all unique models grouped by normalized name
  const standardModelMap = new Map<string, string>()
  for (const channel of enabledChannels) {
    for (const model of channel.models) {
      const normalized = normalizeModelName(model)
      if (!normalized) continue
      const existing = standardModelMap.get(normalized)
      if (!existing) {
        standardModelMap.set(normalized, model)
      } else if (compareModels(model, existing) < 0) {
        // Prefer model with latest date / better version, compareModels returns
        // negative when first argument should come before second
        standardModelMap.set(normalized, model)
      }
    }
  }

  const standardModels = Array.from(standardModelMap.entries())

  // Deterministic ordering of standard models
  standardModels.sort((a, b) => {
    const compare = compareModels(a[1], b[1])
    if (compare !== 0) return compare
    return a[0].localeCompare(b[0])
  })

  // Generate mappings
  const mapping: Record<string, ModelRedirectMapping> = {}

  for (const [normalizedName, displayName] of standardModels) {
    const candidates = findCandidatesForModel(displayName, enabledChannels)

    if (candidates.length === 0) {
      continue
    }

    const bestCandidate = selectBestCandidate(candidates, coefficients)

    if (bestCandidate) {
      const score = scoreCandidate(bestCandidate, coefficients)
      const reason = buildReason(bestCandidate, score, candidates.length)

      mapping[normalizedName] = {
        standardModel: normalizedName,
        sourceModel: displayName,
        targetChannelId: bestCandidate.channelId,
        targetChannelName: bestCandidate.channelName,
        targetModel: bestCandidate.modelName,
        score,
        reason
      }
    }
  }

  // Build result
  const generatedAt = Date.now()

  const result: ModelMappingResult = {
    mapping,
    updatedAt: generatedAt,
    metadata: {
      trigger,
      generatedAt,
      channelCount: enabledChannels.length,
      mappingCount: Object.keys(mapping).length
    }
  }

  // Persist to storage
  await modelRedirectStorage.saveMapping(result)

  return result
}

/**
 * Get current mapping from storage
 */
export async function getCurrentMapping(): Promise<ModelMappingResult | null> {
  return modelRedirectStorage.getMapping()
}

/**
 * Get standard model suggestions by aggregating unique models from all channels
 * Returns a deduplicated list of model names
 */
export async function getStandardModelSuggestions(): Promise<string[]> {
  try {
    const config = await getNewApiConfig()
    if (!config) {
      // Gracefully handle missing config
      console.warn(
        "[MappingService] New API config missing, returning empty suggestions"
      )
      return []
    }

    const prefs = await userPreferences.getPreferences()
    const syncPrefs = prefs.newApiModelSync

    const service = new NewApiModelSyncService(
      config.baseUrl,
      config.token,
      config.userId,
      syncPrefs?.rateLimit
    )

    const channelListData = await service.listChannels()
    const scoringChannels = channelListData.items.map(channelToScoringChannel)
    const enabledChannels = filterEnabledChannels(scoringChannels)

    const modelsSet = new Set<string>()
    for (const channel of enabledChannels) {
      for (const model of channel.models) {
        if (model.trim()) {
          modelsSet.add(model.trim())
        }
      }
    }

    return Array.from(modelsSet).sort()
  } catch (error) {
    console.error("[MappingService] Failed to get model suggestions:", error)
    // Gracefully return empty array on failure
    return []
  }
}
