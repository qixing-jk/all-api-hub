import { useQueries, useQuery } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelManagementSource,
} from "~/features/ModelList/modelManagementSources"
import {
  canManageDisplayAccountTokens,
  fetchDisplayAccountTokens,
  InvalidTokenPayloadError,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED,
  buildApiCredentialProfilePricingResponse,
  fetchApiCredentialModelIds,
  loadAccountTokenFallbackPricingResponse,
} from "~/services/apiCredentialProfiles/modelCatalog"
import { getApiService } from "~/services/apiService"
import type { PricingResponse } from "~/services/apiService/common/type"
import {
  MODEL_PRICING_CACHE_TTL_MS,
  modelPricingCache,
} from "~/services/models/modelPricingCache"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { ApiToken, DisplaySiteData } from "~/types"
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
}

interface AccountQueryState {
  account: DisplaySiteData
  isLoading: boolean
  hasData: boolean
  hasError: boolean
  errorType?: ModelListAccountErrorType
}

export interface AccountFallbackControls {
  isAvailable: boolean
  isActive: boolean
  hasLoadedTokens: boolean
  isLoadingTokens: boolean
  isLoadingCatalog: boolean
  tokenLoadErrorMessage: string | null
  catalogLoadErrorMessage: string | null
  tokens: ApiToken[]
  selectedTokenId: number | null
  activeTokenName: string | null
  loadTokens: () => Promise<void>
  setSelectedTokenId: (tokenId: number | null) => void
  loadCatalog: () => Promise<void>
}

interface UseModelDataReturn {
  pricingData: PricingResponse | null
  pricingContexts: AccountPricingContext[]
  isLoading: boolean
  dataFormatError: boolean
  accountQueryStates: AccountQueryState[]
  loadPricingData: () => Promise<void>
  loadErrorMessage: string | null
  accountFallback: AccountFallbackControls | null
}

/**
 *
 */
function createInvalidFormatError() {
  const error = new Error(MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT)
  ;(error as { code?: string }).code =
    MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT
  return error
}

/**
 *
 */
function createModelPricingQueryKey(
  account?: Pick<DisplaySiteData, "id" | "baseUrl" | "userId">,
) {
  return account
    ? [
        MODEL_LIST_QUERY_KEYS.PRICING,
        account.id,
        account.baseUrl,
        account.userId,
      ]
    : [MODEL_LIST_QUERY_KEYS.PRICING, MODEL_LIST_QUERY_SCOPE_VALUES.NONE]
}

/**
 *
 */
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
  const [fallbackTokens, setFallbackTokens] = useState<ApiToken[]>([])
  const [hasLoadedFallbackTokens, setHasLoadedFallbackTokens] = useState(false)
  const [isLoadingFallbackTokens, setIsLoadingFallbackTokens] = useState(false)
  const [fallbackTokenLoadErrorMessage, setFallbackTokenLoadErrorMessage] =
    useState<string | null>(null)
  const [selectedFallbackTokenId, setSelectedFallbackTokenId] = useState<
    number | null
  >(null)
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

  const resetFallbackState = useCallback(() => {
    fallbackTokensRequestIdRef.current += 1
    fallbackCatalogRequestIdRef.current += 1
    setFallbackStateScopeKey(MODEL_LIST_QUERY_SCOPE_VALUES.NONE)
    setFallbackPricingData(null)
    setFallbackTokens([])
    setHasLoadedFallbackTokens(false)
    setIsLoadingFallbackTokens(false)
    setFallbackTokenLoadErrorMessage(null)
    setSelectedFallbackTokenId(null)
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

  const fallbackTokensRequestIdRef = useRef(0)
  const fallbackCatalogRequestIdRef = useRef(0)

  useEffect(() => {
    // Fallback state is intentionally transient for the currently selected
    // account, so changing the source scope always drops any cached key data.
    resetFallbackState()
  }, [currentAccountScopeKey, resetFallbackState, selectedSource?.kind])

  const fallbackAvailable = useMemo(
    () => canManageDisplayAccountTokens(currentAccount),
    [currentAccount],
  )

  const isActiveFallbackTokensRequest = useCallback(
    (scopeKey: string, requestId: number) =>
      currentAccountScopeKeyRef.current === scopeKey &&
      fallbackTokensRequestIdRef.current === requestId,
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
      fallbackTokens: isCurrentFallbackScope ? fallbackTokens : [],
      hasLoadedFallbackTokens: isCurrentFallbackScope
        ? hasLoadedFallbackTokens
        : false,
      isLoadingFallbackTokens: isCurrentFallbackScope
        ? isLoadingFallbackTokens
        : false,
      fallbackTokenLoadErrorMessage: isCurrentFallbackScope
        ? fallbackTokenLoadErrorMessage
        : null,
      selectedFallbackTokenId: isCurrentFallbackScope
        ? selectedFallbackTokenId
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
    fallbackTokenLoadErrorMessage,
    fallbackTokens,
    hasLoadedFallbackTokens,
    isLoadingFallbackCatalog,
    isLoadingFallbackTokens,
    selectedFallbackTokenId,
  ])

  const scopedFallbackPricingData = scopedFallbackState.fallbackPricingData
  const scopedFallbackTokens = scopedFallbackState.fallbackTokens
  const scopedHasLoadedFallbackTokens =
    scopedFallbackState.hasLoadedFallbackTokens
  const scopedIsLoadingFallbackTokens =
    scopedFallbackState.isLoadingFallbackTokens
  const scopedFallbackTokenLoadErrorMessage =
    scopedFallbackState.fallbackTokenLoadErrorMessage
  const scopedSelectedFallbackTokenId =
    scopedFallbackState.selectedFallbackTokenId
  const scopedIsLoadingFallbackCatalog =
    scopedFallbackState.isLoadingFallbackCatalog
  const scopedFallbackCatalogLoadErrorMessage =
    scopedFallbackState.fallbackCatalogLoadErrorMessage

  const queryKey = useMemo(
    () => createModelPricingQueryKey(currentAccount),
    [currentAccount],
  )

  const query = useQuery<PricingResponse, Error>({
    queryKey,
    enabled: !!currentAccount,
    staleTime: MODEL_PRICING_CACHE_TTL_MS,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () => {
      if (!currentAccount) {
        throw new Error("No account selected")
      }

      const accountId = currentAccount.id

      const cached = await modelPricingCache.get(accountId)
      if (cached && Array.isArray(cached.data)) {
        return cached
      }

      const data = await getApiService(
        currentAccount.siteType,
      ).fetchModelPricing({
        baseUrl: currentAccount.baseUrl,
        accountId: currentAccount.id,
        auth: {
          authType: currentAccount.authType,
          userId: currentAccount.userId,
          accessToken: currentAccount.token,
          cookie: currentAccount.cookieAuthSessionCookie,
        },
      })

      if (!Array.isArray(data.data)) {
        throw createInvalidFormatError()
      }

      await modelPricingCache.set(accountId, data)

      return data
    },
  })

  const selectedFallbackToken = useMemo(() => {
    if (scopedSelectedFallbackTokenId !== null) {
      return (
        scopedFallbackTokens.find(
          (token) => token.id === scopedSelectedFallbackTokenId,
        ) ?? null
      )
    }

    if (scopedFallbackTokens.length === 1) {
      return scopedFallbackTokens[0]
    }

    return null
  }, [scopedFallbackTokens, scopedSelectedFallbackTokenId])

  const loadFallbackTokens = useCallback(async () => {
    if (!currentAccount || !fallbackAvailable) return
    const requestScopeKey = currentAccountScopeKey
    const requestId = ++fallbackTokensRequestIdRef.current

    setFallbackStateScopeKey(requestScopeKey)
    setIsLoadingFallbackTokens(true)
    setFallbackTokenLoadErrorMessage(null)
    setFallbackCatalogLoadErrorMessage(null)

    try {
      const nextTokens = (
        await fetchDisplayAccountTokens(currentAccount)
      ).filter((token) => token.status === 1)

      if (!isActiveFallbackTokensRequest(requestScopeKey, requestId)) {
        return
      }

      setFallbackStateScopeKey(requestScopeKey)
      setFallbackTokens(nextTokens)
      setHasLoadedFallbackTokens(true)
      setSelectedFallbackTokenId((currentTokenId) => {
        if (
          currentTokenId !== null &&
          nextTokens.some((token) => token.id === currentTokenId)
        ) {
          return currentTokenId
        }

        if (nextTokens.length === 1) {
          return nextTokens[0].id
        }

        return null
      })
    } catch (error) {
      if (!isActiveFallbackTokensRequest(requestScopeKey, requestId)) {
        return
      }

      const errorMessage =
        error instanceof InvalidTokenPayloadError
          ? t("status.fallback.loadKeysFailedFallback")
          : getErrorMessage(error)

      setFallbackStateScopeKey(requestScopeKey)
      setFallbackTokenLoadErrorMessage(
        errorMessage &&
          errorMessage !== t("status.fallback.loadKeysFailedFallback")
          ? t("status.fallback.loadKeysFailed", { errorMessage })
          : t("status.fallback.loadKeysFailedFallback"),
      )
    } finally {
      if (isActiveFallbackTokensRequest(requestScopeKey, requestId)) {
        setIsLoadingFallbackTokens(false)
      }
    }
  }, [
    currentAccount,
    currentAccountScopeKey,
    fallbackAvailable,
    isActiveFallbackTokensRequest,
    t,
  ])

  const loadFallbackCatalog = useCallback(async () => {
    if (!currentAccount || !selectedFallbackToken) return
    const requestScopeKey = currentAccountScopeKey
    const requestId = ++fallbackCatalogRequestIdRef.current

    setFallbackStateScopeKey(requestScopeKey)
    setIsLoadingFallbackCatalog(true)
    setFallbackCatalogLoadErrorMessage(null)

    try {
      const pricing = await loadAccountTokenFallbackPricingResponse({
        account: currentAccount,
        token: selectedFallbackToken,
      })

      if (!isActiveFallbackCatalogRequest(requestScopeKey, requestId)) {
        return
      }

      setFallbackStateScopeKey(requestScopeKey)
      setFallbackPricingData(pricing)
      setLoadErrorMessage(null)
      setDataFormatError(false)
      toast.success(t("status.dataLoaded"))
    } catch (error) {
      if (!isActiveFallbackCatalogRequest(requestScopeKey, requestId)) {
        return
      }

      const errorMessage = getErrorMessage(error)
      const sanitizedMessage =
        errorMessage && errorMessage !== ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED
          ? errorMessage
          : t("status.fallback.loadModelsFailedFallback")

      setFallbackStateScopeKey(requestScopeKey)
      setFallbackCatalogLoadErrorMessage(sanitizedMessage)
      toast.error(sanitizedMessage)
    } finally {
      if (isActiveFallbackCatalogRequest(requestScopeKey, requestId)) {
        setIsLoadingFallbackCatalog(false)
      }
    }
  }, [
    currentAccount,
    currentAccountScopeKey,
    isActiveFallbackCatalogRequest,
    selectedFallbackToken,
    t,
  ])

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
    if (scopedHasLoadedFallbackTokens || scopedIsLoadingFallbackTokens) return
    if (scopedFallbackTokenLoadErrorMessage) return

    // Retryable account failures should immediately hydrate the fallback key
    // list so the user can pick a key without an extra preparatory click.
    void loadFallbackTokens()
  }, [
    currentAccount,
    fallbackAvailable,
    scopedFallbackTokenLoadErrorMessage,
    scopedHasLoadedFallbackTokens,
    scopedIsLoadingFallbackTokens,
    loadFallbackTokens,
    query.error,
    query.isError,
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
        return
      }

      setDataFormatError(false)
      const message = t("status.loadFailed")
      setLoadErrorMessage(message)
      toast.error(message)
    }
  }, [
    query.data,
    query.isError,
    query.isFetching,
    query.isSuccess,
    query.error,
    currentAccount,
    selectedSource?.kind,
    t,
    resetFallbackState,
  ])

  const loadPricingData = useCallback(async () => {
    if (!currentAccount) return
    await modelPricingCache.invalidate(currentAccount.id)
    await query.refetch()
  }, [currentAccount, query])

  const pricingData = query.data ?? scopedFallbackPricingData ?? null
  const isFallbackCatalogActive = Boolean(
    scopedFallbackPricingData && !query.data,
  )

  const pricingContexts: AccountPricingContext[] = useMemo(
    () =>
      currentAccount && pricingData
        ? [{ account: currentAccount, pricing: pricingData }]
        : [],
    [currentAccount, pricingData],
  )

  const accountFallback = useMemo<AccountFallbackControls | null>(() => {
    if (!currentAccount) {
      return null
    }

    return {
      isAvailable: fallbackAvailable,
      isActive: isFallbackCatalogActive,
      hasLoadedTokens: scopedHasLoadedFallbackTokens,
      isLoadingTokens: scopedIsLoadingFallbackTokens,
      isLoadingCatalog: scopedIsLoadingFallbackCatalog,
      tokenLoadErrorMessage: scopedFallbackTokenLoadErrorMessage,
      catalogLoadErrorMessage: scopedFallbackCatalogLoadErrorMessage,
      tokens: scopedFallbackTokens,
      selectedTokenId: scopedSelectedFallbackTokenId,
      activeTokenName:
        isFallbackCatalogActive && selectedFallbackToken
          ? selectedFallbackToken.name
          : null,
      loadTokens: loadFallbackTokens,
      setSelectedTokenId: setSelectedFallbackTokenId,
      loadCatalog: loadFallbackCatalog,
    }
  }, [
    currentAccount,
    fallbackAvailable,
    isFallbackCatalogActive,
    scopedHasLoadedFallbackTokens,
    scopedIsLoadingFallbackTokens,
    scopedIsLoadingFallbackCatalog,
    scopedFallbackTokenLoadErrorMessage,
    scopedFallbackCatalogLoadErrorMessage,
    scopedFallbackTokens,
    scopedSelectedFallbackTokenId,
    selectedFallbackToken,
    loadFallbackTokens,
    loadFallbackCatalog,
  ])

  return {
    pricingData,
    pricingContexts,
    isLoading: query.isFetching,
    dataFormatError,
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
      queryKey: createModelPricingQueryKey(account),
      /**
       * Only load pricing when the UI is explicitly in "all accounts" mode.
       * This avoids triggering expensive background fetches while the user is
       * still selecting a single account.
       */
      enabled: enabled && safeDisplayData.length > 0,
      staleTime: MODEL_PRICING_CACHE_TTL_MS,
      refetchOnWindowFocus: false,
      retry: 1,
      queryFn: async () => {
        const cached = await modelPricingCache.get(account.id)
        if (cached && Array.isArray(cached.data)) {
          return cached
        }

        const data = await getApiService(account.siteType).fetchModelPricing({
          baseUrl: account.baseUrl,
          accountId: account.id,
          auth: {
            authType: account.authType,
            userId: account.userId,
            accessToken: account.token,
            cookie: account.cookieAuthSessionCookie,
          },
        })

        if (!Array.isArray(data.data)) {
          throw createInvalidFormatError()
        }

        await modelPricingCache.set(account.id, data)

        return data
      },
    })),
  })

  const pricingContexts: AccountPricingContext[] = useMemo(() => {
    return safeDisplayData
      .map((account, index) => {
        const query = queries[index]
        if (!query || !query.data) return null
        return {
          account,
          pricing: query.data,
        }
      })
      .filter((item): item is AccountPricingContext => item !== null)
  }, [queries, safeDisplayData])

  const isLoading = queries.some((query) => query.isFetching)

  const dataFormatError = queries.some((query) => {
    const error = query.error as { code?: string } | null | undefined
    return error?.code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT
  })

  const loadPricingData = useCallback(async () => {
    await Promise.all(
      safeDisplayData.map(async (account, index) => {
        await modelPricingCache.invalidate(account.id)
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
        const hasData = !!query?.data
        const hasError = !!query?.error
        const isLoading =
          !hasData && Boolean(query?.isPending || query?.isFetching)

        let errorType: ModelListAccountErrorType | undefined
        if (error?.code === MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT) {
          errorType = MODEL_LIST_ACCOUNT_ERROR_TYPES.INVALID_FORMAT
        } else if (hasError) {
          errorType = MODEL_LIST_ACCOUNT_ERROR_TYPES.LOAD_FAILED
        }

        return {
          account,
          isLoading,
          hasData,
          hasError,
          errorType,
        }
      }),
    [queries, safeDisplayData],
  )

  return {
    pricingData: null,
    pricingContexts,
    isLoading,
    dataFormatError,
    accountQueryStates,
    loadPricingData,
    loadErrorMessage: queries.some((query) => query.isError)
      ? t("status.loadFailed")
      : null,
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
    queryFn: async () => {
      if (!currentProfile) {
        throw new Error("No profile selected")
      }

      const modelIds = await fetchApiCredentialModelIds({
        apiType: currentProfile.apiType,
        baseUrl: currentProfile.baseUrl,
        apiKey: currentProfile.apiKey,
      })

      return buildApiCredentialProfilePricingResponse(modelIds)
    },
  })

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
      return
    }

    if (loadErrorMessage) {
      toast.error(
        t("status.profileLoadFailed", {
          errorMessage: loadErrorMessage,
        }),
      )
    }
  }, [currentProfile, loadErrorMessage, query.isFetching, query.isSuccess, t])

  const loadPricingData = useCallback(async () => {
    if (!currentProfile) return
    await query.refetch()
  }, [currentProfile, query])

  return {
    pricingData: query.data ?? null,
    pricingContexts: [],
    isLoading: query.isFetching,
    dataFormatError: false,
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
