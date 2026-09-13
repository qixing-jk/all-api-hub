import { resolveAccountExchangeRate } from "~/features/ModelList/accountExchangeRate"
import {
  MODEL_GROUP_ACCESS_STATES,
  normalizeGroupRatios,
  resolveModelGroupContext,
  type ModelGroupContext,
} from "~/features/ModelList/groupContext"
import {
  createAccountSource,
  deriveModelListSourceCapabilities,
  MODEL_LIST_GROUP_SEMANTICS,
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelListSourceIdentity,
  type ModelManagementItemSource,
  type ModelManagementSource,
} from "~/features/ModelList/modelManagementSources"
import type { PricingResponse } from "~/services/modelList/pricingModel"
import type { DisplaySiteData } from "~/types"

export interface PreparedModelListItem {
  model: PricingResponse["data"][number]
  source: ModelManagementItemSource
  sourceIdentity?: ModelListSourceIdentity
  groupRatios: Record<string, number>
  groupContext: ModelGroupContext
  exchangeRate: number
}

interface PreparedModelListSource {
  source: ModelManagementItemSource
  sourceIdentity?: ModelListSourceIdentity
  items: PreparedModelListItem[]
  groupRatios: Record<string, number>
  groupAccessEvidence: "authoritative" | "insufficient"
}

interface SourcePricingInput {
  source: ModelManagementItemSource
  pricing: PricingResponse | null
  sourceIdentity?: ModelListSourceIdentity
}

/**
 * Describes group-access evidence without deciding whether to clear a selection.
 * Preserve the existing empty-response convention: pricing-capable responses
 * establish an empty scope; catalog-only responses do not establish access.
 */
function hasAuthoritativeGroupAccess(params: {
  groupSemantics: ModelManagementSource["groupSemantics"]
  pricing: PricingResponse
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
    return params.pricing.model_list_source?.supportsPricing !== false
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
      groupAccessEvidence: "insufficient",
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
  const groupRatios = normalizeGroupRatios(pricing.group_ratio ?? {})
  const exchangeRate =
    source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
      ? resolveAccountExchangeRate(source.account)
      : 1
  const items = pricing.data.map(
    (model): PreparedModelListItem => ({
      model,
      source,
      sourceIdentity,
      groupRatios,
      exchangeRate,
      groupContext: resolveModelGroupContext({
        groupSemantics: source.groupSemantics,
        model,
        usableGroup: isAccount ? pricing.usable_group ?? {} : {},
        groupRatios,
        modelListSource: pricing.model_list_source,
      }),
    }),
  )
  return {
    source,
    sourceIdentity,
    items,
    groupRatios,
    groupAccessEvidence: hasAuthoritativeGroupAccess({
      groupSemantics: source.groupSemantics,
      pricing,
      groupContexts: items.map((item) => item.groupContext),
    })
      ? "authoritative"
      : "insufficient",
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
    pricing: PricingResponse | null
    sourceIdentity?: ModelListSourceIdentity
  }[]
  pricingData: PricingResponse | null
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
