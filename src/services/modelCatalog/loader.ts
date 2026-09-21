import {
  ACCOUNT_RUNTIME_KEY_STATUSES,
  isSelectableAccountRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { fetchDisplayAccountRuntimeKeys } from "~/services/accounts/utils/apiServiceRequest"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import type { ProviderModelCatalogCapability } from "~/services/apiAdapters/contracts/providerModelCatalog"
import {
  buildApiCredentialProfilePricingResponse,
  fetchApiCredentialModelIds,
} from "~/services/apiCredentialProfiles/modelCatalog"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import {
  loadAccountRuntimeKeyFallbackPricingResponse,
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources"
import {
  MODEL_CATALOG_FAILURE_CATEGORIES,
  MODEL_CATALOG_SCOPES,
  type ModelCatalogFailureCategory,
} from "~/services/modelList/pricingModel"
import { isValidProviderModelCatalogPricing } from "~/services/modelList/providerCatalogAdmission"
import { modelPricingCache } from "~/services/models/modelPricingCache"
import { isAbortError } from "~/services/verification/aiApiVerification/utils"
import type { DisplaySiteData } from "~/types"

import { createAccountModelPricingRequest } from "./accountRequest"
import { hasValidCatalogFacts } from "./admission"
import { MODEL_LIST_DATA_ERROR_CODES } from "./errors"
import type { ModelCatalogSnapshot } from "./snapshot"
import {
  createAccountModelListSourceIdentity,
  createAccountRuntimeKeyModelListSourceIdentity,
  createPersonalizedCatalogModelListSourceIdentity,
  createProviderCatalogModelListSourceIdentity,
  type ModelListSourceIdentity,
} from "./sourceIdentity"

/** Load an account catalog using the same cache and admission path in every view. */
export async function loadAccountModelCatalog(params: {
  account: DisplaySiteData
  capability: ModelPricingCapability
  abortSignal?: AbortSignal
}): Promise<{ pricing: ModelCatalogSnapshot; cacheHit: boolean }> {
  throwIfCatalogLoadAborted(params.abortSignal)
  const cacheKey = createModelPricingCacheKey(params.account)
  const cached = await modelPricingCache.get(cacheKey)
  throwIfCatalogLoadAborted(params.abortSignal)
  if (cached && hasValidCatalogFacts(cached))
    return { pricing: cached, cacheHit: true }
  const pricing = await params.capability.fetchPricing(
    createAccountModelPricingRequest(params.account, params.abortSignal),
  )
  throwIfCatalogLoadAborted(params.abortSignal)
  if (!hasValidCatalogFacts(pricing)) throw createInvalidFormatError()
  await modelPricingCache.set(cacheKey, pricing)
  throwIfCatalogLoadAborted(params.abortSignal)
  return { pricing, cacheHit: false }
}

export interface AccountPricingContext {
  account: DisplaySiteData
  pricing: ModelCatalogSnapshot
  sourceIdentity?: ModelListSourceIdentity
}

interface AccountPricingQueryResult {
  contexts: AccountPricingContext[]
  partialFailureCount?: number
  partialFailureErrors?: unknown[]
}

interface SettledContextResult {
  context?: AccountPricingContext
  error?: unknown
}

/** Creates the normalized invalid-format error used by pricing loaders. */
function createInvalidFormatError() {
  const error = new Error(MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT)
  ;(error as { code?: string }).code =
    MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT
  return error
}

const MODEL_PRICING_UNSUPPORTED_ERROR = "model_pricing_unsupported"

const createUnsupportedModelPricingError = () => {
  const error = new Error(MODEL_PRICING_UNSUPPORTED_ERROR)
  ;(error as { code?: string }).code =
    MODEL_LIST_DATA_ERROR_CODES.UNSUPPORTED_SOURCE
  return error
}

export const isUnsupportedModelPricingError = (error: unknown) =>
  error instanceof Error &&
  (error.message === MODEL_PRICING_UNSUPPORTED_ERROR ||
    (error as { code?: string }).code ===
      MODEL_LIST_DATA_ERROR_CODES.UNSUPPORTED_SOURCE)

/** Builds the persisted pricing-cache key from non-secret account fields. */
export function createModelPricingCacheKey(
  account: Pick<
    DisplaySiteData,
    "id" | "baseUrl" | "userId" | "siteType" | "authType"
  >,
) {
  return [
    account.id,
    account.baseUrl,
    account.userId,
    account.siteType,
    account.authType,
  ].join("|")
}

/** Builds the provider-wide cache key independently of any saved account. */
export function createProviderModelCatalogCacheKey(sourceId: string) {
  return `provider-catalog|${sourceId}`
}

/** Maps provider schema failures into Model List's stable format classification. */
function normalizeProviderModelCatalogError(error: unknown) {
  const code = (error as { code?: string } | null | undefined)?.code
  return code === API_ERROR_CODES.JSON_PARSE_ERROR
    ? createInvalidFormatError()
    : error
}

/** Classifies personalized catalog failures for stable user-facing recovery. */
function getPersonalizedCatalogFailureCategory(
  error: unknown,
): ModelCatalogFailureCategory {
  if (error instanceof TypeError) {
    return MODEL_CATALOG_FAILURE_CATEGORIES.NETWORK
  }

  const code = (error as { code?: string } | null | undefined)?.code
  switch (code) {
    case API_ERROR_CODES.HTTP_401:
      return MODEL_CATALOG_FAILURE_CATEGORIES.AUTH
    case API_ERROR_CODES.HTTP_403:
      return MODEL_CATALOG_FAILURE_CATEGORIES.PERMISSION
    case API_ERROR_CODES.JSON_PARSE_ERROR:
    case API_ERROR_CODES.CONTENT_TYPE_MISMATCH:
    case MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT:
      return MODEL_CATALOG_FAILURE_CATEGORIES.INVALID_RESPONSE
    case API_ERROR_CODES.HTTP_429:
      return MODEL_CATALOG_FAILURE_CATEGORIES.RATE_LIMIT
    case API_ERROR_CODES.NETWORK_ERROR:
      return MODEL_CATALOG_FAILURE_CATEGORIES.NETWORK
    default:
      return MODEL_CATALOG_FAILURE_CATEGORIES.UPSTREAM
  }
}

/** Loads one provider-wide catalog without persisting incomplete failures. */
async function loadProviderModelCatalogPricing(params: {
  capability: ProviderModelCatalogCapability
  abortSignal?: AbortSignal
}): Promise<{ pricing: ModelCatalogSnapshot; cacheHit: boolean }> {
  const { capability, abortSignal } = params
  const cacheKey = createProviderModelCatalogCacheKey(capability.source.id)
  const cached = await modelPricingCache.get(
    cacheKey,
    capability.source.cacheTtlMs,
  )
  if (
    cached &&
    isValidProviderModelCatalogPricing(cached, capability.source.provider)
  ) {
    return { pricing: cached, cacheHit: true }
  }
  if (cached) await modelPricingCache.invalidate(cacheKey)

  let pricing: ModelCatalogSnapshot
  try {
    pricing = await capability.fetchPricing({ abortSignal })
  } catch (error) {
    throw normalizeProviderModelCatalogError(error)
  }

  if (
    !isValidProviderModelCatalogPricing(pricing, capability.source.provider)
  ) {
    throw createInvalidFormatError()
  }

  await modelPricingCache.set(cacheKey, pricing)
  return { pricing, cacheHit: false }
}

interface PersonalizedProviderModelCatalogLoadResult {
  pricing: ModelCatalogSnapshot
  cacheHit: boolean
  personalizedFailure?: {
    category: ModelCatalogFailureCategory
    error: unknown
  }
}

const providerCatalogFallbackLoads = new WeakMap<
  object,
  Map<string, Promise<{ pricing: ModelCatalogSnapshot; cacheHit: boolean }>>
>()

/** Preserves each account query's cancellation boundary around shared loads. */
function throwIfCatalogLoadAborted(abortSignal?: AbortSignal) {
  if (abortSignal?.aborted) {
    throw abortSignal.reason ?? new DOMException("Aborted", "AbortError")
  }
}

/** Shares one credential-free provider fallback request across account queries. */
async function loadSharedProviderModelCatalogFallback(params: {
  loadScope: object
  capability: ProviderModelCatalogCapability
  abortSignal?: AbortSignal
}) {
  throwIfCatalogLoadAborted(params.abortSignal)
  const sourceId = params.capability.source.id
  let loadScopeLoads = providerCatalogFallbackLoads.get(params.loadScope)
  if (!loadScopeLoads) {
    loadScopeLoads = new Map()
    providerCatalogFallbackLoads.set(params.loadScope, loadScopeLoads)
  }
  let load = loadScopeLoads.get(sourceId)

  if (!load) {
    // A caller cancellation must not abort the shared public request for
    // other accounts; each waiter still observes its own abort signal.
    const pendingLoad = loadProviderModelCatalogPricing({
      capability: params.capability,
    }).finally(() => {
      if (loadScopeLoads.get(sourceId) === pendingLoad) {
        loadScopeLoads.delete(sourceId)
        if (loadScopeLoads.size === 0) {
          providerCatalogFallbackLoads.delete(params.loadScope)
        }
      }
    })
    load = pendingLoad
    loadScopeLoads.set(sourceId, load)
  }

  const result = await load
  throwIfCatalogLoadAborted(params.abortSignal)
  return result
}

/** Owns personalized validation, failure classification, and public fallback. */
async function loadPersonalizedProviderModelCatalogPricing(params: {
  loadScope: object
  capability: ProviderModelCatalogCapability
  personalized: NonNullable<ProviderModelCatalogCapability["personalized"]>
  account: DisplaySiteData
  abortSignal?: AbortSignal
}): Promise<PersonalizedProviderModelCatalogLoadResult> {
  if (!params.account.token.trim()) {
    return loadSharedProviderModelCatalogFallback({
      loadScope: params.loadScope,
      capability: params.capability,
      abortSignal: params.abortSignal,
    })
  }

  try {
    const pricing = await params.personalized.fetchPricing({
      accountId: params.account.id,
      credential: params.account.token,
      abortSignal: params.abortSignal,
    })
    if (
      !isValidProviderModelCatalogPricing(
        pricing,
        params.capability.source.provider,
      )
    ) {
      throw createInvalidFormatError()
    }
    return { pricing, cacheHit: false }
  } catch (error) {
    if (isAbortError(error, params.abortSignal)) throw error

    const category = getPersonalizedCatalogFailureCategory(error)
    const { pricing, cacheHit } = await loadSharedProviderModelCatalogFallback({
      loadScope: params.loadScope,
      capability: params.capability,
      abortSignal: params.abortSignal,
    })
    if (!pricing.model_list_source) {
      throw createInvalidFormatError()
    }

    return {
      cacheHit,
      personalizedFailure: { category, error },
      pricing: {
        ...pricing,
        model_list_source: {
          ...pricing.model_list_source,
          catalogScope: MODEL_CATALOG_SCOPES.PROVIDER,
          catalogFallback: {
            from: MODEL_CATALOG_SCOPES.PERSONALIZED,
            failureCategory: category,
          },
        },
      },
    }
  }
}

/** Native inventories may omit secrets; resolve a selectable active key on load. */
export const isUsableCatalogRuntimeKey = (runtimeKey: AccountRuntimeKey) =>
  runtimeKey.status === ACCOUNT_RUNTIME_KEY_STATUSES.Active &&
  isSelectableAccountRuntimeKey(runtimeKey)

const RUNTIME_KEY_SCOPED_CATALOG_CONCURRENCY = 4

/** Maps items through async workers while preserving input order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
  abortSignal?: AbortSignal,
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(Math.max(concurrency, 1), items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        throwIfCatalogLoadAborted(abortSignal)
        const currentIndex = nextIndex
        nextIndex += 1
        const item = items[currentIndex]
        if (item === undefined) return
        results[currentIndex] = await mapper(item)
      }
    }),
  )

  return results
}

/** Load a selected runtime key and bind its identity before returning any rows. */
export async function loadRuntimeKeyCatalogSource(params: {
  account: DisplaySiteData
  runtimeKey: AccountRuntimeKey
  abortSignal?: AbortSignal
}): Promise<AccountPricingContext> {
  const pricing = await loadAccountRuntimeKeyFallbackPricingResponse(params)
  if (!hasValidCatalogFacts(pricing)) throw createInvalidFormatError()
  return {
    account: params.account,
    pricing,
    sourceIdentity: createAccountRuntimeKeyModelListSourceIdentity({
      accountId: params.account.id,
      runtimeKeyId: params.runtimeKey.id,
      runtimeKeyName: params.runtimeKey.label,
    }),
  }
}

/** Collect independent key failures while preserving account cancellation. */
async function loadRuntimeKeyScopedCatalogPricingContext(
  params: Parameters<typeof loadRuntimeKeyCatalogSource>[0],
): Promise<SettledContextResult> {
  try {
    return { context: await loadRuntimeKeyCatalogSource(params) }
  } catch (error) {
    if (isAbortError(error, params.abortSignal)) throw error
    return { error }
  }
}

/** Loads runtime-key-scoped catalog fallbacks for every account runtime key in comparison mode. */
async function fetchRuntimeKeyScopedCatalogPricingContexts(
  account: DisplaySiteData,
  abortSignal?: AbortSignal,
): Promise<AccountPricingQueryResult> {
  throwIfCatalogLoadAborted(abortSignal)

  const runtimeKeys = (await fetchDisplayAccountRuntimeKeys(account)).filter(
    isUsableCatalogRuntimeKey,
  )
  throwIfCatalogLoadAborted(abortSignal)
  if (runtimeKeys.length === 0) {
    throw createUnsupportedModelPricingError()
  }

  const settledResults = await mapWithConcurrency(
    runtimeKeys,
    RUNTIME_KEY_SCOPED_CATALOG_CONCURRENCY,
    (runtimeKey) =>
      loadRuntimeKeyScopedCatalogPricingContext({
        account,
        runtimeKey,
        abortSignal,
      }),
    abortSignal,
  )
  const contexts = settledResults.flatMap((result) =>
    result.context ? [result.context] : [],
  )
  const errors = settledResults.flatMap((result) =>
    result.error ? [result.error] : [],
  )

  if (contexts.length === 0) {
    const invalidFormatErrors = errors.filter((error) => {
      const typedError = error as { code?: string } | null | undefined
      return typedError?.code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT
    })
    if (
      invalidFormatErrors.length > 0 &&
      invalidFormatErrors.length === errors.length
    ) {
      throw invalidFormatErrors[0]
    }

    const nonInvalidFormatError = errors.find((error) => {
      const typedError = error as { code?: string } | null | undefined
      return typedError?.code !== MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT
    })
    throw nonInvalidFormatError ?? createUnsupportedModelPricingError()
  }

  return {
    contexts,
    ...(errors.length > 0 ? { partialFailureCount: errors.length } : {}),
    ...(errors.length > 0 ? { partialFailureErrors: errors } : {}),
  }
}

/** Resolve the account route into source-isolated catalog contexts. */
export async function loadAccountCatalogSource(params: {
  account: DisplaySiteData
  loadScope: object
  abortSignal?: AbortSignal
  includeRuntimeKeyCatalogs?: boolean
}): Promise<AccountPricingQueryResult & { cacheHit?: boolean }> {
  const { account, abortSignal } = params
  const readiness = resolveModelListAccountSourceReadiness(account)
  if (readiness.route === MODEL_LIST_ACCOUNT_SOURCE_ROUTES.ProviderCatalog) {
    const capability = readiness.providerModelCatalog
    const result: PersonalizedProviderModelCatalogLoadResult =
      capability.personalized
        ? await loadPersonalizedProviderModelCatalogPricing({
            ...params,
            capability,
            personalized: capability.personalized,
          })
        : await loadProviderModelCatalogPricing({ capability, abortSignal })
    const failure = result.personalizedFailure
    const sourceIdentity =
      result.pricing.model_list_source?.catalogScope ===
      MODEL_CATALOG_SCOPES.PERSONALIZED
        ? createPersonalizedCatalogModelListSourceIdentity(account.id)
        : createProviderCatalogModelListSourceIdentity({
            sourceId: capability.source.id,
            provider: capability.source.provider,
            providerName: capability.source.displayName,
          })
    return {
      contexts: [{ account, pricing: result.pricing, sourceIdentity }],
      cacheHit: result.cacheHit,
      ...(failure
        ? { partialFailureCount: 1, partialFailureErrors: [failure.error] }
        : {}),
    }
  }
  if (
    params.includeRuntimeKeyCatalogs &&
    readiness.route ===
      MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog
  ) {
    return fetchRuntimeKeyScopedCatalogPricingContexts(account, abortSignal)
  }
  if (readiness.route !== MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing)
    throw createUnsupportedModelPricingError()
  const result = await loadAccountModelCatalog({
    account,
    capability: readiness.modelPricing,
    abortSignal,
  })
  return {
    contexts: [
      {
        account,
        pricing: result.pricing,
        sourceIdentity: createAccountModelListSourceIdentity(account.id),
      },
    ],
    cacheHit: result.cacheHit,
  }
}

/** Load profile visibility without inferring account group permissions. */
export async function loadProfileModelCatalog(
  params: Parameters<typeof fetchApiCredentialModelIds>[0],
): Promise<ModelCatalogSnapshot> {
  const catalog = buildApiCredentialProfilePricingResponse(
    await fetchApiCredentialModelIds(params),
  )
  return { ...catalog, groupAccess: { kind: "not-applicable" } }
}

type ModelListAccountSourceReadiness = ReturnType<
  typeof resolveModelListAccountSourceReadiness
>

export interface AllAccountsModelLoadTarget {
  id: string
  accounts: DisplaySiteData[]
  account: DisplaySiteData
  readiness: ModelListAccountSourceReadiness
}

/** Collapses provider-wide catalogs while retaining each affected account. */
export function createAllAccountsModelLoadTargets(
  accounts: DisplaySiteData[],
): AllAccountsModelLoadTarget[] {
  const targets = new Map<string, AllAccountsModelLoadTarget>()

  for (const account of accounts) {
    const readiness = resolveModelListAccountSourceReadiness(account)
    const id =
      readiness.route === MODEL_LIST_ACCOUNT_SOURCE_ROUTES.ProviderCatalog &&
      !readiness.providerModelCatalog.personalized
        ? `provider-catalog:${readiness.providerModelCatalog.source.id}`
        : `account:${account.id}`
    const existing = targets.get(id)

    if (existing) {
      existing.accounts.push(account)
      continue
    }

    targets.set(id, {
      id,
      accounts: [account],
      account,
      readiness,
    })
  }

  return Array.from(targets.values())
}
