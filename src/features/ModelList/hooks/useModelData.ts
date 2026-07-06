import { useQueries, useQuery } from "@tanstack/react-query"
import type { TFunction } from "i18next"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  createAccountModelListSourceIdentity,
  createAccountRuntimeKeyModelListSourceIdentity,
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelListSourceIdentity,
  type ModelManagementSource,
} from "~/features/ModelList/modelManagementSources"
import {
  hasUsableAccountRuntimeKeySecret,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import {
  ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS,
  getAccountSiteModelListProfile,
  shouldUseAccountSiteRuntimeKeyCatalogFallback,
  supportsAccountSiteDirectModelPricing,
} from "~/services/accounts/accountSiteProfile"
import {
  canManageDisplayAccountTokens,
  fetchDisplayAccountRuntimeKeys,
  InvalidTokenPayloadError,
} from "~/services/accounts/utils/apiServiceRequest"
import type { ModelPricingRequest } from "~/services/apiAdapters/contracts/modelPricing"
import {
  buildApiCredentialProfilePricingResponse,
  fetchApiCredentialModelIds,
} from "~/services/apiCredentialProfiles/modelCatalog"
import {
  ACCOUNT_RUNTIME_KEY_FALLBACK_LOAD_FAILED,
  canLoadModelListAccountFallbackRuntimeKeys,
  loadAccountRuntimeKeyFallbackPricingResponse,
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources"
import type { PricingResponse } from "~/services/modelList/pricingModel"
import {
  MODEL_PRICING_CACHE_TTL_MS,
  modelPricingCache,
} from "~/services/models/modelPricingCache"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  trackProductAnalyticsActionCompleted,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsApiType,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsFailureReason,
  type ProductAnalyticsFailureStage,
  type ProductAnalyticsResult,
  type ProductAnalyticsSourceKind,
} from "~/services/productAnalytics/contracts"
import { buildModelListDiagnostics } from "~/services/productAnalytics/modelListDiagnostics"
import {
  isAbortError,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"

import {
  MODEL_LIST_ACCOUNT_ERROR_TYPES,
  MODEL_LIST_DATA_ERROR_CODES,
  MODEL_LIST_QUERY_KEYS,
  MODEL_LIST_QUERY_SCOPE_VALUES,
  type ModelListAccountErrorType,
} from "../modelDataStates"

interface UseModelDataProps {
  selectedSource: ModelManagementSource | null
  accounts: DisplaySiteData[]
}

export interface AccountPricingContext {
  account: DisplaySiteData
  pricing: PricingResponse
  sourceIdentity?: ModelListSourceIdentity
}

interface AccountQueryState {
  account: DisplaySiteData
  isLoading: boolean
  hasData: boolean
  hasError: boolean
  errorType?: ModelListAccountErrorType
  errorMessage?: string
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

export interface AccountFallbackControls {
  isAvailable: boolean
  isActive: boolean
  statusScope: "account" | "runtime-key"
  runtimeKeys: AccountRuntimeKey[]
  selectedRuntimeKeyId: string | null
  setSelectedRuntimeKeyId: (runtimeKeyId: string | null) => void
  isLoadingRuntimeKeys: boolean
  hasLoadedRuntimeKeys: boolean
  runtimeKeyLoadErrorMessage: string | null
  catalogLoadErrorMessage: string | null
  isLoadingCatalog: boolean
  activeRuntimeKeyName: string | null
  loadRuntimeKeys: () => Promise<void>
  loadCatalog: () => Promise<void>
}

interface UseModelDataReturn {
  pricingData: PricingResponse | null
  pricingContexts: AccountPricingContext[]
  isLoading: boolean
  dataFormatError: boolean
  unsupportedSource: boolean
  accountQueryStates: AccountQueryState[]
  loadPricingData: () => Promise<void>
  loadErrorMessage: string | null
  accountFallback: AccountFallbackControls | null
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

const isUnsupportedModelPricingError = (error: unknown) =>
  error instanceof Error &&
  (error.message === MODEL_PRICING_UNSUPPORTED_ERROR ||
    (error as { code?: string }).code ===
      MODEL_LIST_DATA_ERROR_CODES.UNSUPPORTED_SOURCE)

const shouldRetryModelPricingQuery = (failureCount: number, error: Error) =>
  !isUnsupportedModelPricingError(error) && failureCount < 1

/** Counts only valid model rows so analytics never includes raw model ids. */
function getPricingModelCount(pricing: PricingResponse | null | undefined) {
  return Array.isArray(pricing?.data) ? pricing.data.length : 0
}

/**
 * Maps known loader failures into coarse analytics buckets for telemetry.
 * Unknown is intentionally the fallback to avoid guessing from raw messages.
 */
function getModelDataErrorCategory(
  error: unknown,
): ProductAnalyticsErrorCategory {
  const code =
    error && typeof error === "object"
      ? (error as { code?: unknown }).code
      : undefined

  if (code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT) {
    return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
  }

  return resolveProductAnalyticsErrorCategoryFromError(error)
}

/** Classify whether model catalog loading failed during parsing or execution. */
function getModelDataFailureStage(
  error: unknown,
): ProductAnalyticsFailureStage {
  const code =
    error && typeof error === "object"
      ? (error as { code?: unknown }).code
      : undefined

  return code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT
    ? PRODUCT_ANALYTICS_FAILURE_STAGES.Parse
    : PRODUCT_ANALYTICS_FAILURE_STAGES.Execute
}

/** Derive coupled analytics diagnostics from a single model-data failure. */
function getModelDataFailureDiagnostics(error: unknown): {
  errorCategory: ProductAnalyticsErrorCategory
  failureStage: ProductAnalyticsFailureStage
  failureReason?: ProductAnalyticsFailureReason
} {
  const code =
    error && typeof error === "object"
      ? (error as { code?: unknown }).code
      : undefined

  return {
    errorCategory: getModelDataErrorCategory(error),
    failureStage: getModelDataFailureStage(error),
    ...(code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT
      ? {
          failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape,
        }
      : {}),
  }
}

/** Derive aggregate model catalog diagnostics from the failed account queries. */
function getAggregateModelDataFailureDiagnostics(errors: unknown[]): {
  errorCategory: ProductAnalyticsErrorCategory
  failureStage: ProductAnalyticsFailureStage
  failureReason?: ProductAnalyticsFailureReason
  error?: unknown
} {
  const diagnostics = errors.map((error) => ({
    ...getModelDataFailureDiagnostics(error),
    error,
  }))
  const representativeDiagnostic =
    diagnostics.find(
      (diagnostic) =>
        diagnostic.failureStage === PRODUCT_ANALYTICS_FAILURE_STAGES.Parse,
    ) ??
    diagnostics.find(
      (diagnostic) =>
        diagnostic.errorCategory !== PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    )

  return (
    representativeDiagnostic ?? {
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
    }
  )
}

/** Returns a user-facing, non-secret reason for model-data load failures. */
function getModelDataDisplayErrorReason(
  error: unknown,
  t: TFunction<"modelList">,
) {
  const code =
    error && typeof error === "object"
      ? (error as { code?: unknown }).code
      : undefined

  if (code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT) {
    return t("accountSummary.failureReasons.invalidFormat")
  }

  return getErrorMessage(error) || t("accountSummary.failureReasons.unknown")
}

/** Selects the first useful display reason from a set of load failures. */
function getFirstModelDataDisplayErrorReason(
  errors: unknown[],
  t: TFunction<"modelList">,
) {
  return (
    errors
      .map((error) => getModelDataDisplayErrorReason(error, t))
      .find(Boolean) ?? t("accountSummary.failureReasons.unknown")
  )
}

const MODEL_DATA_ANALYTICS_CONTEXT = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshModelPricingData,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
} as const

/**
 * Tracks a coarse, sanitized model-data load completion outcome.
 * @param params Completion metadata to bucket and forward to analytics.
 * @param params.result Coarse load outcome.
 * @param params.sourceKind Selected model source kind.
 * @param params.errorCategory Optional sanitized failure category.
 * @param params.failureStage Optional sanitized failure stage.
 * @param params.failureReason Optional sanitized failure reason.
 * @param params.error Optional structured error object.
 * @param params.siteType Optional sanitized site type.
 * @param params.requestedAuthMode Optional sanitized auth mode.
 * @param params.apiType Optional sanitized API type.
 * @param params.cacheHit Whether the pricing cache was hit.
 * @param params.fallbackAvailable Whether fallback data was available.
 * @param params.fallbackUsed Whether fallback data was used.
 * @param params.modelCount Number of models loaded, when available.
 * @param params.successCount Number of successful account loads, when available.
 * @param params.failureCount Number of failed account loads, when available.
 */
function trackModelDataLoadCompletion(params: {
  result: ProductAnalyticsResult
  sourceKind: ProductAnalyticsSourceKind
  errorCategory?: ProductAnalyticsErrorCategory
  failureStage?: ProductAnalyticsFailureStage
  failureReason?: ProductAnalyticsFailureReason
  error?: unknown
  siteType?: DisplaySiteData["siteType"]
  requestedAuthMode?: DisplaySiteData["authType"]
  apiType?: ProductAnalyticsApiType
  cacheHit?: boolean
  fallbackAvailable?: boolean
  fallbackUsed?: boolean
  modelCount?: number
  successCount?: number
  failureCount?: number
}) {
  const diagnostics = buildModelListDiagnostics({
    sourceKind: params.sourceKind,
    ...(params.siteType ? { siteType: params.siteType } : {}),
    ...(params.requestedAuthMode
      ? { requestedAuthMode: params.requestedAuthMode }
      : {}),
    ...(params.apiType ? { apiType: params.apiType } : {}),
    ...(typeof params.cacheHit === "boolean"
      ? { cacheHit: params.cacheHit }
      : {}),
    ...(typeof params.fallbackAvailable === "boolean"
      ? { fallbackAvailable: params.fallbackAvailable }
      : {}),
    ...(typeof params.fallbackUsed === "boolean"
      ? { fallbackUsed: params.fallbackUsed }
      : {}),
    ...(typeof params.modelCount === "number"
      ? { modelCount: params.modelCount }
      : {}),
    ...(typeof params.successCount === "number"
      ? { successCount: params.successCount }
      : {}),
    ...(typeof params.failureCount === "number"
      ? { failureCount: params.failureCount }
      : {}),
    ...(params.error ? { error: params.error } : {}),
    ...(params.errorCategory ? { errorCategory: params.errorCategory } : {}),
    ...(params.failureStage ? { stage: params.failureStage } : {}),
    ...(params.failureReason ? { reason: params.failureReason } : {}),
  })

  void trackProductAnalyticsActionCompleted({
    ...MODEL_DATA_ANALYTICS_CONTEXT,
    result: params.result,
    ...(params.errorCategory ? { errorCategory: params.errorCategory } : {}),
    diagnostics,
  })
}

/** Builds the pricing query key from non-secret account identity fields. */
function createModelPricingQueryKey(
  account?: Pick<
    DisplaySiteData,
    "id" | "baseUrl" | "userId" | "siteType" | "authType"
  >,
) {
  return account
    ? [
        MODEL_LIST_QUERY_KEYS.PRICING,
        account.id,
        account.baseUrl,
        account.userId,
        account.siteType,
        account.authType,
      ]
    : [MODEL_LIST_QUERY_KEYS.PRICING, MODEL_LIST_QUERY_SCOPE_VALUES.NONE]
}

/** Builds an all-accounts pricing query key without changing persistence cache scope. */
function createAllAccountsModelPricingQueryKey(
  account: Pick<
    DisplaySiteData,
    "id" | "baseUrl" | "userId" | "siteType" | "authType"
  >,
) {
  return [
    MODEL_LIST_QUERY_KEYS.PRICING,
    MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
    account.id,
    account.baseUrl,
    account.userId,
    account.siteType,
    account.authType,
  ]
}

/** Builds the persisted pricing-cache key from non-secret account fields. */
function createModelPricingCacheKey(
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

/** Builds the adapter pricing request from a display account. */
function createDisplayAccountModelPricingRequest(
  account: DisplaySiteData,
  abortSignal?: AbortSignal,
): ModelPricingRequest {
  return {
    baseUrl: account.baseUrl,
    accountId: account.id,
    abortSignal,
    auth: {
      authType: account.authType,
      userId: account.userId,
      accessToken: account.token,
      cookie: account.cookieAuthSessionCookie,
    },
  }
}

const RUNTIME_KEY_SCOPED_CATALOG_CONCURRENCY = 4

/** Checks that a pricing response exposes the expected model row array. */
function hasValidPricingData(data: PricingResponse) {
  return Array.isArray(data.data)
}

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
        if (abortSignal?.aborted) {
          throw abortSignal.reason ?? new DOMException("Aborted", "AbortError")
        }
        const currentIndex = nextIndex
        nextIndex += 1
        results[currentIndex] = await mapper(items[currentIndex])
      }
    }),
  )

  return results
}

/** Loads one runtime-key-scoped catalog as a row source context. */
async function loadRuntimeKeyScopedCatalogPricingContext(params: {
  account: DisplaySiteData
  runtimeKey: AccountRuntimeKey
  abortSignal?: AbortSignal
}): Promise<SettledContextResult> {
  try {
    const pricing = await loadAccountRuntimeKeyFallbackPricingResponse(params)
    if (!hasValidPricingData(pricing)) {
      throw createInvalidFormatError()
    }

    return {
      context: {
        account: params.account,
        pricing,
        sourceIdentity: createAccountRuntimeKeyModelListSourceIdentity({
          accountId: params.account.id,
          runtimeKeyId: params.runtimeKey.id,
          runtimeKeyName: params.runtimeKey.label,
        }),
      },
    }
  } catch (error) {
    if (isAbortError(error, params.abortSignal)) {
      throw error
    }

    return { error }
  }
}

/** Loads runtime-key-scoped catalog fallbacks for every account runtime key in comparison mode. */
async function fetchRuntimeKeyScopedCatalogPricingContexts(
  account: DisplaySiteData,
  abortSignal?: AbortSignal,
): Promise<AccountPricingQueryResult> {
  if (abortSignal?.aborted) {
    throw abortSignal.reason ?? new DOMException("Aborted", "AbortError")
  }

  const runtimeKeys = (await fetchDisplayAccountRuntimeKeys(account)).filter(
    hasUsableAccountRuntimeKeySecret,
  )
  if (abortSignal?.aborted) {
    throw abortSignal.reason ?? new DOMException("Aborted", "AbortError")
  }
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

/** Builds the profile catalog query key from stable profile revision data. */
function createProfileCatalogQueryKey(profile?: {
  id: string
  updatedAt: number
}) {
  return profile
    ? [
        MODEL_LIST_QUERY_KEYS.CATALOG,
        MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE,
        profile.id,
        profile.updatedAt,
      ]
    : [
        MODEL_LIST_QUERY_KEYS.CATALOG,
        MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE,
        MODEL_LIST_QUERY_SCOPE_VALUES.NONE,
      ]
}

/**
 * Fetches pricing data for a single selected account with caching and error handling.
 * @param params Input parameters for the hook.
 * @param params.selectedSource Account-backed source to load pricing for.
 * @param params.accounts All available accounts.
 * @returns Pricing data, loading flags, query states, and reload helper.
 */
function useSingleAccountModelData(params: {
  selectedSource: ModelManagementSource | null
  accounts: DisplaySiteData[]
}): UseModelDataReturn {
  const { selectedSource, accounts } = params
  const { t } = useTranslation("modelList")
  const [dataFormatError, setDataFormatError] = useState(false)
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null)
  const [fallbackPricingData, setFallbackPricingData] =
    useState<PricingResponse | null>(null)
  const [fallbackRuntimeKeys, setFallbackRuntimeKeys] = useState<
    AccountRuntimeKey[]
  >([])
  const [hasLoadedFallbackRuntimeKeys, setHasLoadedFallbackRuntimeKeys] =
    useState(false)
  const [isLoadingFallbackRuntimeKeys, setIsLoadingFallbackRuntimeKeys] =
    useState(false)
  const [
    fallbackRuntimeKeyLoadErrorMessage,
    setFallbackRuntimeKeyLoadErrorMessage,
  ] = useState<string | null>(null)
  const [selectedFallbackRuntimeKeyId, setSelectedFallbackRuntimeKeyId] =
    useState<string | null>(null)
  const [isLoadingFallbackCatalog, setIsLoadingFallbackCatalog] =
    useState(false)
  const [fallbackCatalogLoadErrorMessage, setFallbackCatalogLoadErrorMessage] =
    useState<string | null>(null)
  const [fallbackStateScopeKey, setFallbackStateScopeKey] = useState<string>(
    MODEL_LIST_QUERY_SCOPE_VALUES.NONE,
  )

  const safeDisplayData = useMemo(() => accounts || [], [accounts])

  const currentAccount = useMemo(
    () =>
      selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
        ? safeDisplayData.find((acc) => acc.id === selectedSource.account.id)
        : undefined,
    [safeDisplayData, selectedSource],
  )
  const fallbackCatalogAbortControllerRef = useRef<AbortController | null>(null)

  const resetFallbackState = useCallback(() => {
    fallbackRuntimeKeysRequestIdRef.current += 1
    fallbackCatalogRequestIdRef.current += 1
    fallbackCatalogAbortControllerRef.current?.abort()
    fallbackCatalogAbortControllerRef.current = null
    setFallbackStateScopeKey(MODEL_LIST_QUERY_SCOPE_VALUES.NONE)
    setFallbackPricingData(null)
    setFallbackRuntimeKeys([])
    setHasLoadedFallbackRuntimeKeys(false)
    setIsLoadingFallbackRuntimeKeys(false)
    setFallbackRuntimeKeyLoadErrorMessage(null)
    setSelectedFallbackRuntimeKeyId(null)
    setIsLoadingFallbackCatalog(false)
    setFallbackCatalogLoadErrorMessage(null)
  }, [])

  const currentAccountScopeKey = useMemo(
    () =>
      currentAccount
        ? [
            currentAccount.id,
            currentAccount.baseUrl,
            currentAccount.userId,
          ].join("|")
        : MODEL_LIST_QUERY_SCOPE_VALUES.NONE,
    [currentAccount],
  )

  const currentAccountScopeKeyRef = useRef(currentAccountScopeKey)
  currentAccountScopeKeyRef.current = currentAccountScopeKey

  const fallbackRuntimeKeysRequestIdRef = useRef(0)
  const fallbackCatalogRequestIdRef = useRef(0)

  useEffect(() => {
    // Fallback state is intentionally transient for the currently selected
    // account, so changing the source scope always drops any cached key data.
    resetFallbackState()
  }, [currentAccountScopeKey, resetFallbackState, selectedSource?.kind])

  const fallbackAvailable = useMemo(
    () =>
      canManageDisplayAccountTokens(currentAccount) ||
      canLoadModelListAccountFallbackRuntimeKeys(currentAccount),
    [currentAccount],
  )

  const isActiveFallbackRuntimeKeysRequest = useCallback(
    (scopeKey: string, requestId: number) =>
      currentAccountScopeKeyRef.current === scopeKey &&
      fallbackRuntimeKeysRequestIdRef.current === requestId,
    [],
  )

  const isActiveFallbackCatalogRequest = useCallback(
    (scopeKey: string, requestId: number) =>
      currentAccountScopeKeyRef.current === scopeKey &&
      fallbackCatalogRequestIdRef.current === requestId,
    [],
  )

  const scopedFallbackState = useMemo(() => {
    const isCurrentFallbackScope =
      !!currentAccount && fallbackStateScopeKey === currentAccountScopeKey

    return {
      fallbackPricingData: isCurrentFallbackScope ? fallbackPricingData : null,
      fallbackRuntimeKeys: isCurrentFallbackScope ? fallbackRuntimeKeys : [],
      hasLoadedFallbackRuntimeKeys: isCurrentFallbackScope
        ? hasLoadedFallbackRuntimeKeys
        : false,
      isLoadingFallbackRuntimeKeys: isCurrentFallbackScope
        ? isLoadingFallbackRuntimeKeys
        : false,
      fallbackRuntimeKeyLoadErrorMessage: isCurrentFallbackScope
        ? fallbackRuntimeKeyLoadErrorMessage
        : null,
      selectedFallbackRuntimeKeyId: isCurrentFallbackScope
        ? selectedFallbackRuntimeKeyId
        : null,
      isLoadingFallbackCatalog: isCurrentFallbackScope
        ? isLoadingFallbackCatalog
        : false,
      fallbackCatalogLoadErrorMessage: isCurrentFallbackScope
        ? fallbackCatalogLoadErrorMessage
        : null,
    }
  }, [
    currentAccount,
    currentAccountScopeKey,
    fallbackCatalogLoadErrorMessage,
    fallbackPricingData,
    fallbackStateScopeKey,
    fallbackRuntimeKeyLoadErrorMessage,
    fallbackRuntimeKeys,
    hasLoadedFallbackRuntimeKeys,
    isLoadingFallbackCatalog,
    isLoadingFallbackRuntimeKeys,
    selectedFallbackRuntimeKeyId,
  ])

  const scopedFallbackPricingData = scopedFallbackState.fallbackPricingData
  const scopedFallbackRuntimeKeys = scopedFallbackState.fallbackRuntimeKeys
  const scopedHasLoadedFallbackRuntimeKeys =
    scopedFallbackState.hasLoadedFallbackRuntimeKeys
  const scopedIsLoadingFallbackRuntimeKeys =
    scopedFallbackState.isLoadingFallbackRuntimeKeys
  const scopedFallbackRuntimeKeyLoadErrorMessage =
    scopedFallbackState.fallbackRuntimeKeyLoadErrorMessage
  const scopedSelectedFallbackRuntimeKeyId =
    scopedFallbackState.selectedFallbackRuntimeKeyId
  const scopedIsLoadingFallbackCatalog =
    scopedFallbackState.isLoadingFallbackCatalog
  const scopedFallbackCatalogLoadErrorMessage =
    scopedFallbackState.fallbackCatalogLoadErrorMessage

  const queryKey = useMemo(
    () => createModelPricingQueryKey(currentAccount),
    [currentAccount],
  )
  const trackedDirectLoadKeyRef = useRef<string | null>(null)
  const directLoadCacheHitRef = useRef(false)

  const query = useQuery<PricingResponse, Error>({
    queryKey,
    enabled: !!currentAccount,
    staleTime: MODEL_PRICING_CACHE_TTL_MS,
    refetchOnWindowFocus: false,
    retry: shouldRetryModelPricingQuery,
    queryFn: async ({ signal }) => {
      if (!currentAccount) {
        throw new Error("No account selected")
      }

      const readiness = resolveModelListAccountSourceReadiness(currentAccount)
      if (readiness.route !== MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing) {
        throw createUnsupportedModelPricingError()
      }

      const cacheKey = createModelPricingCacheKey(currentAccount)

      const cached = await modelPricingCache.get(cacheKey)
      if (cached && Array.isArray(cached.data)) {
        directLoadCacheHitRef.current = true
        return cached
      }
      directLoadCacheHitRef.current = false

      const data = await readiness.modelPricing.fetchPricing(
        createDisplayAccountModelPricingRequest(currentAccount, signal),
      )

      if (!Array.isArray(data.data)) {
        throw createInvalidFormatError()
      }

      await modelPricingCache.set(cacheKey, data)

      return data
    },
  })

  const selectedFallbackRuntimeKey = useMemo(() => {
    if (scopedSelectedFallbackRuntimeKeyId !== null) {
      return (
        scopedFallbackRuntimeKeys.find(
          (runtimeKey) => runtimeKey.id === scopedSelectedFallbackRuntimeKeyId,
        ) ?? null
      )
    }

    if (scopedFallbackRuntimeKeys.length === 1) {
      return scopedFallbackRuntimeKeys[0]
    }

    return null
  }, [scopedFallbackRuntimeKeys, scopedSelectedFallbackRuntimeKeyId])

  const loadFallbackRuntimeKeys = useCallback(async () => {
    if (!currentAccount || !fallbackAvailable) return
    const requestScopeKey = currentAccountScopeKey
    const requestId = ++fallbackRuntimeKeysRequestIdRef.current

    setFallbackStateScopeKey(requestScopeKey)
    setIsLoadingFallbackRuntimeKeys(true)
    setFallbackRuntimeKeyLoadErrorMessage(null)
    setFallbackCatalogLoadErrorMessage(null)

    try {
      const runtimeKeys = (
        await fetchDisplayAccountRuntimeKeys(currentAccount)
      ).filter(hasUsableAccountRuntimeKeySecret)

      if (!isActiveFallbackRuntimeKeysRequest(requestScopeKey, requestId)) {
        return
      }

      setFallbackStateScopeKey(requestScopeKey)
      setFallbackRuntimeKeys(runtimeKeys)
      setHasLoadedFallbackRuntimeKeys(true)
      setSelectedFallbackRuntimeKeyId((currentRuntimeKeyId) => {
        if (
          currentRuntimeKeyId !== null &&
          runtimeKeys.some(
            (runtimeKey) => runtimeKey.id === currentRuntimeKeyId,
          )
        ) {
          return currentRuntimeKeyId
        }

        if (runtimeKeys.length === 1) {
          return runtimeKeys[0].id
        }

        return null
      })
    } catch (error) {
      if (!isActiveFallbackRuntimeKeysRequest(requestScopeKey, requestId)) {
        return
      }

      const errorMessage =
        error instanceof InvalidTokenPayloadError
          ? t("status.fallback.loadKeysFailedFallback")
          : getErrorMessage(error)

      setFallbackStateScopeKey(requestScopeKey)
      setFallbackRuntimeKeyLoadErrorMessage(
        errorMessage &&
          errorMessage !== t("status.fallback.loadKeysFailedFallback")
          ? t("status.fallback.loadKeysFailed", { errorMessage })
          : t("status.fallback.loadKeysFailedFallback"),
      )
    } finally {
      if (isActiveFallbackRuntimeKeysRequest(requestScopeKey, requestId)) {
        setIsLoadingFallbackRuntimeKeys(false)
      }
    }
  }, [
    currentAccount,
    currentAccountScopeKey,
    fallbackAvailable,
    isActiveFallbackRuntimeKeysRequest,
    t,
  ])

  const loadFallbackCatalog = useCallback(async () => {
    if (!currentAccount || !selectedFallbackRuntimeKey) return
    const requestScopeKey = currentAccountScopeKey
    const requestId = ++fallbackCatalogRequestIdRef.current
    fallbackCatalogAbortControllerRef.current?.abort()
    const abortController = new AbortController()
    fallbackCatalogAbortControllerRef.current = abortController

    setFallbackStateScopeKey(requestScopeKey)
    setIsLoadingFallbackCatalog(true)
    setFallbackCatalogLoadErrorMessage(null)

    try {
      const pricing = await loadAccountRuntimeKeyFallbackPricingResponse({
        account: currentAccount,
        runtimeKey: selectedFallbackRuntimeKey,
        abortSignal: abortController.signal,
      })

      if (!isActiveFallbackCatalogRequest(requestScopeKey, requestId)) {
        return
      }

      setFallbackStateScopeKey(requestScopeKey)
      setFallbackPricingData(pricing)
      setLoadErrorMessage(null)
      setDataFormatError(false)
      toast.success(t("status.dataLoaded"))
      trackModelDataLoadCompletion({
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelFallbackCatalog,
        fallbackAvailable: true,
        fallbackUsed: true,
        modelCount: getPricingModelCount(pricing),
      })
    } catch (error) {
      if (
        abortController.signal.aborted ||
        !isActiveFallbackCatalogRequest(requestScopeKey, requestId)
      ) {
        return
      }

      const errorMessage = getErrorMessage(error)
      const sanitizedMessage =
        errorMessage &&
        errorMessage !== ACCOUNT_RUNTIME_KEY_FALLBACK_LOAD_FAILED
          ? errorMessage
          : t("status.fallback.loadModelsFailedFallback")

      setFallbackStateScopeKey(requestScopeKey)
      setFallbackCatalogLoadErrorMessage(sanitizedMessage)
      toast.error(sanitizedMessage)
      trackModelDataLoadCompletion({
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelFallbackCatalog,
        errorCategory: getModelDataErrorCategory(error),
        failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        error,
        fallbackAvailable: true,
        fallbackUsed: true,
      })
    } finally {
      if (fallbackCatalogAbortControllerRef.current === abortController) {
        fallbackCatalogAbortControllerRef.current = null
      }
      if (isActiveFallbackCatalogRequest(requestScopeKey, requestId)) {
        setIsLoadingFallbackCatalog(false)
      }
    }
  }, [
    currentAccount,
    currentAccountScopeKey,
    isActiveFallbackCatalogRequest,
    selectedFallbackRuntimeKey,
    t,
  ])

  useEffect(() => {
    return () => {
      fallbackCatalogAbortControllerRef.current?.abort()
      fallbackCatalogAbortControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (
      selectedSource?.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT ||
      !currentAccount
    ) {
      return
    }
    if (!fallbackAvailable) return
    if (!query.isError) return

    const typedError = (query.error ?? undefined) as
      | { code?: string }
      | undefined
    if (typedError?.code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT) return
    if (
      scopedHasLoadedFallbackRuntimeKeys ||
      scopedIsLoadingFallbackRuntimeKeys
    )
      return
    if (scopedFallbackRuntimeKeyLoadErrorMessage) return

    // Retryable account failures should immediately hydrate the fallback key
    // list so the user can pick a key without an extra preparatory click.
    void loadFallbackRuntimeKeys()
  }, [
    currentAccount,
    fallbackAvailable,
    scopedFallbackRuntimeKeyLoadErrorMessage,
    scopedHasLoadedFallbackRuntimeKeys,
    scopedIsLoadingFallbackRuntimeKeys,
    loadFallbackRuntimeKeys,
    query.error,
    query.isError,
    selectedSource?.kind,
  ])

  useEffect(() => {
    if (
      selectedSource?.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT ||
      !currentAccount
    ) {
      return
    }
    if (!fallbackAvailable) return
    if (!shouldUseAccountSiteRuntimeKeyCatalogFallback(currentAccount)) return
    if (!query.isError) return
    if (!isUnsupportedModelPricingError(query.error)) return
    if (!scopedHasLoadedFallbackRuntimeKeys) return
    if (scopedFallbackRuntimeKeys.length !== 1) return
    if (!selectedFallbackRuntimeKey) return
    if (scopedFallbackPricingData) return
    if (scopedIsLoadingFallbackCatalog) return
    if (scopedFallbackCatalogLoadErrorMessage) return

    void loadFallbackCatalog()
  }, [
    currentAccount,
    fallbackAvailable,
    loadFallbackCatalog,
    query.error,
    query.isError,
    scopedFallbackCatalogLoadErrorMessage,
    scopedFallbackPricingData,
    scopedFallbackRuntimeKeys.length,
    scopedHasLoadedFallbackRuntimeKeys,
    scopedIsLoadingFallbackCatalog,
    selectedFallbackRuntimeKey,
    selectedSource?.kind,
  ])

  useEffect(() => {
    if (
      selectedSource?.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT ||
      !currentAccount
    ) {
      setDataFormatError(false)
      setLoadErrorMessage(null)
      return
    }

    if (query.isFetching) {
      setLoadErrorMessage(null)
      return
    }

    if (query.isSuccess) {
      setDataFormatError(false)
      setLoadErrorMessage(null)
      resetFallbackState()
      toast.success(t("status.dataLoaded"))
      const trackingKey = `${currentAccountScopeKey}:success:${query.dataUpdatedAt}`
      if (trackedDirectLoadKeyRef.current !== trackingKey) {
        trackedDirectLoadKeyRef.current = trackingKey
        trackModelDataLoadCompletion({
          result: PRODUCT_ANALYTICS_RESULTS.Success,
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
          siteType: currentAccount.siteType,
          requestedAuthMode: currentAccount.authType,
          cacheHit: directLoadCacheHitRef.current,
          modelCount: getPricingModelCount(query.data),
        })
      }
      return
    }

    if (query.isError) {
      const typedError = (query.error ?? undefined) as
        | { code?: string }
        | undefined

      if (typedError?.code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT) {
        setDataFormatError(true)
        setLoadErrorMessage(null)
        toast.error(t("status.formatNotStandard"))
        const trackingKey = `${currentAccountScopeKey}:invalid-format:${query.errorUpdatedAt}`
        if (trackedDirectLoadKeyRef.current !== trackingKey) {
          trackedDirectLoadKeyRef.current = trackingKey
          trackModelDataLoadCompletion({
            result: PRODUCT_ANALYTICS_RESULTS.Failure,
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Parse,
            error: query.error,
            siteType: currentAccount.siteType,
            requestedAuthMode: currentAccount.authType,
          })
        }
        return
      }

      setDataFormatError(false)
      if (
        !supportsAccountSiteDirectModelPricing(currentAccount) &&
        isUnsupportedModelPricingError(query.error) &&
        fallbackAvailable
      ) {
        setLoadErrorMessage(null)
        return
      }

      const message = t("status.loadFailed")
      setLoadErrorMessage(message)
      toast.error(message)
      const trackingKey = `${currentAccountScopeKey}:failure:${query.errorUpdatedAt}`
      if (trackedDirectLoadKeyRef.current !== trackingKey) {
        trackedDirectLoadKeyRef.current = trackingKey
        trackModelDataLoadCompletion({
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
          errorCategory: getModelDataErrorCategory(query.error),
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
          error: query.error,
          siteType: currentAccount.siteType,
          requestedAuthMode: currentAccount.authType,
        })
      }
    }
  }, [
    query.data,
    query.isError,
    query.isFetching,
    query.isSuccess,
    query.error,
    query.dataUpdatedAt,
    query.errorUpdatedAt,
    currentAccount,
    currentAccountScopeKey,
    fallbackAvailable,
    selectedSource?.kind,
    t,
    resetFallbackState,
  ])

  const loadPricingData = useCallback(async () => {
    if (!currentAccount) return
    if (scopedFallbackPricingData && selectedFallbackRuntimeKey) {
      await loadFallbackCatalog()
      return
    }

    await modelPricingCache.invalidate(
      createModelPricingCacheKey(currentAccount),
    )
    await query.refetch()
  }, [
    currentAccount,
    loadFallbackCatalog,
    query,
    scopedFallbackPricingData,
    selectedFallbackRuntimeKey,
  ])

  const pricingData = query.data ?? scopedFallbackPricingData ?? null
  const isFallbackCatalogActive = Boolean(
    scopedFallbackPricingData && !query.data,
  )
  const unsupportedSource = Boolean(
    query.isError &&
      isUnsupportedModelPricingError(query.error) &&
      currentAccount &&
      getAccountSiteModelListProfile(currentAccount.siteType)
        .tokenScopedCatalogFallback !==
        ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.RuntimeKey,
  )

  const pricingContexts: AccountPricingContext[] = useMemo(
    () =>
      currentAccount && pricingData
        ? [
            {
              account: currentAccount,
              pricing: pricingData,
              sourceIdentity:
                isFallbackCatalogActive && selectedFallbackRuntimeKey
                  ? createAccountRuntimeKeyModelListSourceIdentity({
                      accountId: currentAccount.id,
                      runtimeKeyId: selectedFallbackRuntimeKey.id,
                      runtimeKeyName: selectedFallbackRuntimeKey.label,
                    })
                  : createAccountModelListSourceIdentity(currentAccount.id),
            },
          ]
        : [],
    [
      currentAccount,
      isFallbackCatalogActive,
      pricingData,
      selectedFallbackRuntimeKey,
    ],
  )

  const accountFallback = useMemo<AccountFallbackControls | null>(() => {
    if (!currentAccount) {
      return null
    }

    return {
      isAvailable: fallbackAvailable,
      isActive: isFallbackCatalogActive,
      statusScope:
        getAccountSiteModelListProfile(currentAccount.siteType).statusScope ===
        "token"
          ? "runtime-key"
          : "account",
      runtimeKeys: scopedFallbackRuntimeKeys,
      selectedRuntimeKeyId: scopedSelectedFallbackRuntimeKeyId,
      setSelectedRuntimeKeyId: setSelectedFallbackRuntimeKeyId,
      isLoadingRuntimeKeys: scopedIsLoadingFallbackRuntimeKeys,
      hasLoadedRuntimeKeys: scopedHasLoadedFallbackRuntimeKeys,
      runtimeKeyLoadErrorMessage: scopedFallbackRuntimeKeyLoadErrorMessage,
      catalogLoadErrorMessage: scopedFallbackCatalogLoadErrorMessage,
      isLoadingCatalog: scopedIsLoadingFallbackCatalog,
      activeRuntimeKeyName:
        isFallbackCatalogActive && selectedFallbackRuntimeKey
          ? selectedFallbackRuntimeKey.label
          : null,
      loadRuntimeKeys: loadFallbackRuntimeKeys,
      loadCatalog: loadFallbackCatalog,
    }
  }, [
    currentAccount,
    fallbackAvailable,
    isFallbackCatalogActive,
    scopedHasLoadedFallbackRuntimeKeys,
    scopedIsLoadingFallbackRuntimeKeys,
    scopedIsLoadingFallbackCatalog,
    scopedFallbackRuntimeKeyLoadErrorMessage,
    scopedFallbackCatalogLoadErrorMessage,
    scopedFallbackRuntimeKeys,
    scopedSelectedFallbackRuntimeKeyId,
    selectedFallbackRuntimeKey,
    loadFallbackRuntimeKeys,
    loadFallbackCatalog,
  ])

  return {
    pricingData,
    pricingContexts,
    isLoading: query.isFetching || scopedIsLoadingFallbackCatalog,
    dataFormatError,
    unsupportedSource,
    accountQueryStates: [],
    loadPricingData,
    loadErrorMessage,
    accountFallback,
  }
}

/**
 * Fetches pricing data for all accounts concurrently and aggregates results.
 * @param accounts List of accounts to query.
 * @param enabled When true, triggers fetches; when false, keeps queries idle.
 * @returns Pricing contexts, loading/error flags, and reload helper.
 */
function useAllAccountsModelData(
  accounts: DisplaySiteData[],
  enabled: boolean,
): UseModelDataReturn {
  const { t } = useTranslation("modelList")
  const safeDisplayData = useMemo(() => accounts || [], [accounts])

  const queries = useQueries({
    queries: safeDisplayData.map((account) => ({
      queryKey: createAllAccountsModelPricingQueryKey(account),
      /**
       * Only load pricing when the UI is explicitly in "all accounts" mode.
       * This avoids triggering expensive background fetches while the user is
       * still selecting a single account.
       */
      enabled: enabled && safeDisplayData.length > 0,
      staleTime: MODEL_PRICING_CACHE_TTL_MS,
      refetchOnWindowFocus: false,
      retry: shouldRetryModelPricingQuery,
      queryFn: async ({ signal }) => {
        const readiness = resolveModelListAccountSourceReadiness(account)
        if (
          readiness.route ===
          MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog
        ) {
          return fetchRuntimeKeyScopedCatalogPricingContexts(account, signal)
        }

        if (
          readiness.route !== MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing
        ) {
          throw createUnsupportedModelPricingError()
        }

        const cacheKey = createModelPricingCacheKey(account)
        const cached = await modelPricingCache.get(cacheKey)
        if (cached && Array.isArray(cached.data)) {
          return {
            contexts: [
              {
                account,
                pricing: cached,
                sourceIdentity: createAccountModelListSourceIdentity(
                  account.id,
                ),
              },
            ],
          }
        }

        const data = await readiness.modelPricing.fetchPricing(
          createDisplayAccountModelPricingRequest(account, signal),
        )

        if (!Array.isArray(data.data)) {
          throw createInvalidFormatError()
        }

        await modelPricingCache.set(cacheKey, data)

        return {
          contexts: [
            {
              account,
              pricing: data,
              sourceIdentity: createAccountModelListSourceIdentity(account.id),
            },
          ],
        }
      },
    })),
  })
  const trackedAggregateLoadKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    if (safeDisplayData.length === 0) {
      const trackingKey = `${MODEL_LIST_QUERY_SCOPE_VALUES.NONE}:skipped`
      if (trackedAggregateLoadKeyRef.current !== trackingKey) {
        trackedAggregateLoadKeyRef.current = trackingKey
        trackModelDataLoadCompletion({
          result: PRODUCT_ANALYTICS_RESULTS.Skipped,
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAllAccounts,
          modelCount: 0,
          successCount: 0,
          failureCount: 0,
        })
      }
      return
    }

    if (queries.length !== safeDisplayData.length) return
    if (queries.some((query) => query.isPending || query.isFetching)) return
    if (!queries.every((query) => query.isSuccess || query.isError)) return

    const successCount = queries.filter((query) => query.isSuccess).length
    const failedQueries = queries.filter(
      (query) => query.isError || (query.data?.partialFailureCount ?? 0) > 0,
    )
    const failureCount = failedQueries.length
    const modelCount = queries.reduce(
      (count, query) =>
        count +
        (query.data?.contexts ?? []).reduce(
          (contextCount, context) =>
            contextCount + getPricingModelCount(context.pricing),
          0,
        ),
      0,
    )
    const trackingKey = queries
      .map((query, index) =>
        [
          safeDisplayData[index]?.id,
          query.isSuccess ? "success" : "failure",
          query.data?.partialFailureCount ?? 0,
          query.dataUpdatedAt,
          query.errorUpdatedAt,
        ].join(":"),
      )
      .join("|")

    if (trackedAggregateLoadKeyRef.current === trackingKey) return
    trackedAggregateLoadKeyRef.current = trackingKey

    const failureDiagnostics =
      failureCount > 0
        ? getAggregateModelDataFailureDiagnostics(
            failedQueries.flatMap((query) => [
              ...(query.error ? [query.error] : []),
              ...(query.data?.partialFailureErrors ?? []),
            ]),
          )
        : null

    // Conservative aggregate semantics: any account failure makes the overall
    // load a failure, because the rendered catalog is incomplete.
    trackModelDataLoadCompletion({
      result:
        failureCount > 0
          ? PRODUCT_ANALYTICS_RESULTS.Failure
          : PRODUCT_ANALYTICS_RESULTS.Success,
      sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAllAccounts,
      ...(failureDiagnostics
        ? { errorCategory: failureDiagnostics.errorCategory }
        : {}),
      ...(failureDiagnostics
        ? { failureStage: failureDiagnostics.failureStage }
        : {}),
      ...(failureDiagnostics?.failureReason
        ? { failureReason: failureDiagnostics.failureReason }
        : {}),
      ...(failureDiagnostics?.error ? { error: failureDiagnostics.error } : {}),
      modelCount,
      successCount,
      failureCount,
    })
  }, [enabled, queries, safeDisplayData])

  const pricingContexts: AccountPricingContext[] = useMemo(() => {
    return queries.flatMap((query) => query.data?.contexts ?? [])
  }, [queries])

  const isLoading = queries.some((query) => query.isFetching)

  const dataFormatError = queries.some((query) => {
    const error = query.error as { code?: string } | null | undefined
    return error?.code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT
  })

  const loadPricingData = useCallback(async () => {
    await Promise.all(
      safeDisplayData.map(async (account, index) => {
        await modelPricingCache.invalidate(createModelPricingCacheKey(account))
        const query = queries[index]
        if (query) {
          await query.refetch()
        }
      }),
    )
  }, [queries, safeDisplayData])

  const accountQueryStates: AccountQueryState[] = useMemo(
    () =>
      safeDisplayData.map((account, index) => {
        const query = queries[index]
        const error = query?.error as { code?: string } | null | undefined
        const partialFailureCount = query?.data?.partialFailureCount ?? 0
        const partialFailureErrors = query?.data?.partialFailureErrors ?? []
        const hasData = (query?.data?.contexts.length ?? 0) > 0
        const hasPartialFailure = hasData && partialFailureCount > 0
        const hasError = !!query?.error || partialFailureCount > 0
        const isLoading =
          !hasData && Boolean(query?.isPending || query?.isFetching)

        let errorType: ModelListAccountErrorType | undefined
        let errorMessage: string | undefined
        if (error?.code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT) {
          errorType = MODEL_LIST_ACCOUNT_ERROR_TYPES.INVALID_FORMAT
          errorMessage = t("accountSummary.failureReasons.invalidFormat")
        } else if (isUnsupportedModelPricingError(query?.error)) {
          errorType = MODEL_LIST_ACCOUNT_ERROR_TYPES.UNSUPPORTED_SOURCE
          errorMessage = t("accountSummary.failureReasons.unsupportedSource")
        } else if (hasPartialFailure) {
          errorType = MODEL_LIST_ACCOUNT_ERROR_TYPES.PARTIAL_LOAD_FAILED
          errorMessage = t("accountSummary.partialLoadFailedReason", {
            reason: getFirstModelDataDisplayErrorReason(
              partialFailureErrors,
              t,
            ),
          })
        } else if (hasError) {
          errorType = MODEL_LIST_ACCOUNT_ERROR_TYPES.LOAD_FAILED
          errorMessage = query?.error
            ? getModelDataDisplayErrorReason(query.error, t)
            : undefined
        }

        return {
          account,
          isLoading,
          hasData,
          hasError,
          errorType,
          errorMessage,
        }
      }),
    [queries, safeDisplayData, t],
  )

  const loadErrorMessage = useMemo(() => {
    const failedQuery = queries.find((query) => query.isError)
    if (!failedQuery?.error) {
      return null
    }

    return t("status.loadFailedWithReason", {
      reason: getModelDataDisplayErrorReason(failedQuery.error, t),
    })
  }, [queries, t])

  return {
    pricingData: null,
    pricingContexts,
    isLoading,
    dataFormatError,
    unsupportedSource: false,
    accountQueryStates,
    loadPricingData,
    loadErrorMessage,
    accountFallback: null,
  }
}

/**
 * Loads a model catalog directly from a stored API credential profile.
 * @param selectedSource Profile-backed source, when selected.
 * @returns Profile-backed pricing response shim plus loading metadata.
 */
function useProfileModelData(
  selectedSource: ModelManagementSource | null,
): UseModelDataReturn {
  const { t } = useTranslation("modelList")

  const currentProfile =
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
      ? selectedSource.profile
      : null

  const query = useQuery<PricingResponse, Error>({
    queryKey: createProfileCatalogQueryKey(currentProfile ?? undefined),
    enabled: !!currentProfile,
    staleTime: MODEL_PRICING_CACHE_TTL_MS,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async ({ signal }) => {
      if (!currentProfile) {
        throw new Error("No profile selected")
      }

      const modelIds = await fetchApiCredentialModelIds({
        apiType: currentProfile.apiType,
        baseUrl: currentProfile.baseUrl,
        apiKey: currentProfile.apiKey,
        abortSignal: signal,
      })

      return buildApiCredentialProfilePricingResponse(modelIds)
    },
  })
  const trackedProfileLoadKeyRef = useRef<string | null>(null)

  const loadErrorMessage = useMemo(() => {
    if (!currentProfile || !query.isError) {
      return null
    }

    const secretsToRedact = [
      currentProfile.apiKey,
      currentProfile.baseUrl,
    ].filter(Boolean)

    return (
      toSanitizedErrorSummary(query.error, secretsToRedact) ||
      t("status.loadFailed")
    )
  }, [currentProfile, query.error, query.isError, t])

  useEffect(() => {
    if (!currentProfile) return

    if (query.isFetching) {
      return
    }

    if (query.isSuccess) {
      toast.success(t("status.dataLoaded"))
      const trackingKey = `${currentProfile.id}:success:${query.dataUpdatedAt}`
      if (trackedProfileLoadKeyRef.current !== trackingKey) {
        trackedProfileLoadKeyRef.current = trackingKey
        trackModelDataLoadCompletion({
          result: PRODUCT_ANALYTICS_RESULTS.Success,
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelProfile,
          apiType: currentProfile.apiType,
          modelCount: getPricingModelCount(query.data),
        })
      }
      return
    }

    if (loadErrorMessage) {
      toast.error(
        t("status.profileLoadFailed", {
          errorMessage: loadErrorMessage,
        }),
      )
      const trackingKey = `${currentProfile.id}:failure:${query.errorUpdatedAt}`
      if (trackedProfileLoadKeyRef.current !== trackingKey) {
        trackedProfileLoadKeyRef.current = trackingKey
        trackModelDataLoadCompletion({
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelProfile,
          errorCategory: getModelDataErrorCategory(query.error),
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
          error: query.error,
          apiType: currentProfile.apiType,
        })
      }
    }
  }, [
    currentProfile,
    loadErrorMessage,
    query.data,
    query.dataUpdatedAt,
    query.error,
    query.errorUpdatedAt,
    query.isFetching,
    query.isSuccess,
    t,
  ])

  const loadPricingData = useCallback(async () => {
    if (!currentProfile) return
    await query.refetch()
  }, [currentProfile, query])

  return {
    pricingData: query.data ?? null,
    pricingContexts: [],
    isLoading: query.isFetching,
    dataFormatError: false,
    unsupportedSource: false,
    accountQueryStates: [],
    loadPricingData,
    loadErrorMessage,
    accountFallback: null,
  }
}

/**
 * Provides model pricing data for either a single account or all accounts.
 * @param params Hook input parameters.
 * @param params.selectedSource Selected model-management source.
 * @param params.accounts Available accounts list.
 * @returns Pricing data, contexts, loading state, and query summaries.
 */
export function useModelData(params: UseModelDataProps): UseModelDataReturn {
  const { selectedSource, accounts } = params
  const safeDisplayData = useMemo(() => accounts || [], [accounts])
  const isAllAccounts =
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
  const isProfileSource =
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE

  const singleAccountResult = useSingleAccountModelData({
    selectedSource: isAllAccounts || isProfileSource ? null : selectedSource,
    accounts: safeDisplayData,
  })

  const allAccountsResult = useAllAccountsModelData(
    safeDisplayData,
    isAllAccounts,
  )

  const profileResult = useProfileModelData(
    isProfileSource ? selectedSource : null,
  )

  if (isAllAccounts) return allAccountsResult
  if (isProfileSource) return profileResult
  return singleAccountResult
}
