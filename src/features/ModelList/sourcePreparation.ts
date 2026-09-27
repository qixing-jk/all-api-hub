import { resolveAccountExchangeRate } from "~/features/ModelList/accountExchangeRate"
import {
  createModelGroupResolver,
  MODEL_GROUP_ACCESS_STATES,
  type ModelGroupContext,
} from "~/features/ModelList/groupContext"
import {
  createAccountSource,
  deriveModelListSourceCapabilities,
  MODEL_LIST_GROUP_SEMANTICS,
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelManagementItemSource,
  type ModelManagementSource,
} from "~/features/ModelList/modelManagementSources"
import { normalizeGroupRatios } from "~/services/modelCatalog/groupFacts"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import { type ModelListSourceIdentity } from "~/services/modelCatalog/sourceIdentity"
import type { DisplaySiteData } from "~/types"

import { isProviderCatalogFallback } from "./catalogFallback"

export interface PreparedModelListItem {
  model: ModelCatalogSnapshot["data"][number]
  isProviderCatalogFallback?: boolean
  source: ModelManagementItemSource
  sourceIdentity?: ModelListSourceIdentity
  groupRatios: Record<string, number>
  groupContext: ModelGroupContext
  exchangeRate: number
}

export interface PreparedModelListSource {
  source: ModelManagementItemSource
  sourceIdentity?: ModelListSourceIdentity
  items: PreparedModelListItem[]
  groupRatios: Record<string, number>
  canRepairGroupSelection: boolean
}

interface SourcePricingInput {
  source: ModelManagementItemSource
  pricing: ModelCatalogSnapshot | null
  sourceIdentity?: ModelListSourceIdentity
}

/**
 * Selection repair remains a domain policy. Both authoritative access and the
 * existing priced compatibility fallback can repair selections; unknown access
 * cannot. This does not upgrade compatibility evidence to authority.
 */
function canRepairSourceGroupSelection(params: {
  groupSemantics: ModelManagementSource["groupSemantics"]
  pricing: ModelCatalogSnapshot
  groupContexts: readonly ModelGroupContext[]
}) {
  if (params.groupSemantics === MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE) {
    return true
  }

  if (
    params.groupContexts.some(
      (context) => context.accessState === MODEL_GROUP_ACCESS_STATES.UNKNOWN,
    )
  ) {
    return false
  }

  if (params.groupContexts.length === 0) {
    return params.pricing.groupAccess.kind !== "unavailable"
  }

  return true
}

/** Prepares one source independently of filters, selections, and model metadata. */
export function prepareModelListSource(
  input: SourcePricingInput,
): PreparedModelListSource {
  const { pricing, sourceIdentity } = input
  if (!pricing || !Array.isArray(pricing.data)) {
    return {
      source: input.source,
      sourceIdentity,
      items: [],
      groupRatios: {},
      canRepairGroupSelection: false,
    }
  }
  const isAccount = input.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
  const source = isAccount
    ? {
        ...input.source,
        capabilities: deriveModelListSourceCapabilities({
          capabilities: input.source.capabilities,
          modelListSource: pricing.model_list_source,
        }),
      }
    : input.source
  const groupRatios = normalizeGroupRatios(pricing.groupRatios ?? {})
  const resolveGroupContext = createModelGroupResolver({
    groupSemantics: source.groupSemantics,
    groupAccess: pricing.groupAccess,
    groupRatios,
  })
  const exchangeRate =
    source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
      ? resolveAccountExchangeRate(source.account)
      : 1
  const providerCatalogFallback = isProviderCatalogFallback(pricing)
  const items = pricing.data.map(
    (model): PreparedModelListItem => ({
      model,
      source,
      sourceIdentity,
      groupRatios,
      exchangeRate,
      groupContext: resolveGroupContext(model),
      ...(providerCatalogFallback ? { isProviderCatalogFallback: true } : {}),
    }),
  )
  return {
    source,
    sourceIdentity,
    items,
    groupRatios,
    canRepairGroupSelection: canRepairSourceGroupSelection({
      groupSemantics: source.groupSemantics,
      pricing,
      groupContexts: items.map((item) => item.groupContext),
    }),
  }
}

/**
 * Resolves pricing inputs into independent source snapshots. Account contexts
 * take precedence over the single response, including contexts without data.
 * Account-summary eligibility is a list presentation policy applied before
 * response capability restrictions, not a change to stable group semantics.
 */
export function prepareModelListSources(params: {
  pricingContexts: readonly {
    account: DisplaySiteData
    pricing: ModelCatalogSnapshot | null
    sourceIdentity?: ModelListSourceIdentity
  }[]
  pricingData: ModelCatalogSnapshot | null
  selectedSource: ModelManagementSource | null
}): PreparedModelListSource[] {
  if (params.pricingContexts?.length) {
    return params.pricingContexts.map(
      ({ account, pricing, sourceIdentity }) => {
        const accountSource = createAccountSource(account)
        return prepareModelListSource({
          source: {
            ...accountSource,
            capabilities: {
              ...accountSource.capabilities,
              supportsAccountSummary: true,
            },
          },
          pricing,
          sourceIdentity,
        })
      },
    )
  }
  if (
    !params.selectedSource ||
    params.selectedSource.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
  )
    return []
  return [
    prepareModelListSource({
      source: params.selectedSource,
      pricing: params.pricingData,
    }),
  ]
}
