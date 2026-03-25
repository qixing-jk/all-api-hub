import { useQueries, useQuery } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import type { ModelManagementSource } from "~/features/ModelList/modelManagementSources"
import {
  canManageDisplayAccountTokens,
  fetchDisplayAccountTokens,
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

interface UseModelDataProps {
  selectedSource: ModelManagementSource | null
  accounts: DisplaySiteData[]
}

export interface AccountPricingContext {
  account: DisplaySiteData
  pricing: PricingResponse
}

type AccountErrorType = "invalid-format" | "load-failed"

interface AccountQueryState {
  account: DisplaySiteData
  hasData: boolean
  hasError: boolean
  errorType?: AccountErrorType
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

  const safeDisplayData = useMemo(() => accounts || [], [accounts])

  const currentAccount = useMemo(
    () =>
      selectedSource?.kind === "account"
        ? safeDisplayData.find((acc) => acc.id === selectedSource.account.id)
        : undefined,
    [safeDisplayData, selectedSource],
  )

  const resetFallbackState = useCallback(() => {
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
        : "none",
    [currentAccount],
  )

  useEffect(() => {
    // Fallback state is intentionally transient for the currently selected
    // account, so changing the source scope always drops any cached key data.
    resetFallbackState()
  }, [currentAccountScopeKey, resetFallbackState, selectedSource?.kind])

  const fallbackAvailable = useMemo(
    () => canManageDisplayAccountTokens(currentAccount),
    [currentAccount],
  )

  const queryKey = useMemo(
    () =>
      currentAccount
        ? [
            "model-pricing",
            currentAccount.id,
            currentAccount.baseUrl,
            currentAccount.userId,
          ]
        : ["model-pricing", "none"],
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
        const error = new Error("INVALID_FORMAT")
        ;(error as { code?: string }).code = "INVALID_FORMAT"
        throw error
      }

      await modelPricingCache.set(accountId, data)

      return data
    },
  })

  const selectedFallbackToken = useMemo(() => {
    if (selectedFallbackTokenId !== null) {
      return (
        fallbackTokens.find((token) => token.id === selectedFallbackTokenId) ??
        null
      )
    }

    if (fallbackTokens.length === 1) {
      return fallbackTokens[0]
    }

    return null
  }, [fallbackTokens, selectedFallbackTokenId])

  const loadFallbackTokens = useCallback(async () => {
    if (!currentAccount || !fallbackAvailable) return

    setIsLoadingFallbackTokens(true)
    setFallbackTokenLoadErrorMessage(null)
    setFallbackCatalogLoadErrorMessage(null)

    try {
      const nextTokens = (
        await fetchDisplayAccountTokens(currentAccount)
      ).filter((token) => token.status === 1)

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
      const errorMessage = getErrorMessage(error)
      setFallbackTokenLoadErrorMessage(
        errorMessage
          ? t("status.fallback.loadKeysFailed", { errorMessage })
          : t("status.fallback.loadKeysFailedFallback"),
      )
    } finally {
      setIsLoadingFallbackTokens(false)
    }
  }, [currentAccount, fallbackAvailable, t])

  const loadFallbackCatalog = useCallback(async () => {
    if (!currentAccount || !selectedFallbackToken) return

    setIsLoadingFallbackCatalog(true)
    setFallbackCatalogLoadErrorMessage(null)

    try {
      const pricing = await loadAccountTokenFallbackPricingResponse({
        account: currentAccount,
        token: selectedFallbackToken,
      })

      setFallbackPricingData(pricing)
      setLoadErrorMessage(null)
      setDataFormatError(false)
      toast.success(t("status.dataLoaded"))
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      const sanitizedMessage =
        errorMessage && errorMessage !== ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED
          ? errorMessage
          : t("status.fallback.loadModelsFailedFallback")

      setFallbackCatalogLoadErrorMessage(sanitizedMessage)
      toast.error(sanitizedMessage)
    } finally {
      setIsLoadingFallbackCatalog(false)
    }
  }, [currentAccount, selectedFallbackToken, t])

  useEffect(() => {
    if (selectedSource?.kind !== "account" || !currentAccount) return
    if (!fallbackAvailable) return
    if (!query.isError) return

    const typedError = (query.error ?? undefined) as
      | { code?: string }
      | undefined
    if (typedError?.code === "INVALID_FORMAT") return
    if (hasLoadedFallbackTokens || isLoadingFallbackTokens) return
    if (fallbackTokenLoadErrorMessage) return

    // Retryable account failures should immediately hydrate the fallback key
    // list so the user can pick a key without an extra preparatory click.
    void loadFallbackTokens()
  }, [
    currentAccount,
    fallbackAvailable,
    fallbackTokenLoadErrorMessage,
    hasLoadedFallbackTokens,
    isLoadingFallbackTokens,
    loadFallbackTokens,
    query.error,
    query.isError,
    selectedSource?.kind,
  ])

  useEffect(() => {
    if (selectedSource?.kind !== "account" || !currentAccount) {
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

      if (typedError?.code === "INVALID_FORMAT") {
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

  const pricingData = query.data ?? fallbackPricingData ?? null
  const isFallbackCatalogActive = Boolean(fallbackPricingData && !query.data)

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
      hasLoadedTokens: hasLoadedFallbackTokens,
      isLoadingTokens: isLoadingFallbackTokens,
      isLoadingCatalog: isLoadingFallbackCatalog,
      tokenLoadErrorMessage: fallbackTokenLoadErrorMessage,
      catalogLoadErrorMessage: fallbackCatalogLoadErrorMessage,
      tokens: fallbackTokens,
      selectedTokenId: selectedFallbackTokenId,
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
    hasLoadedFallbackTokens,
    isLoadingFallbackTokens,
    isLoadingFallbackCatalog,
    fallbackTokenLoadErrorMessage,
    fallbackCatalogLoadErrorMessage,
    fallbackTokens,
    selectedFallbackTokenId,
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
      queryKey: ["model-pricing", account.id, account.baseUrl, account.userId],
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
          const error = new Error("INVALID_FORMAT")
          ;(error as { code?: string }).code = "INVALID_FORMAT"
          throw error
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
    return error?.code === "INVALID_FORMAT"
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

        let errorType: AccountErrorType | undefined
        if (error?.code === "INVALID_FORMAT") {
          errorType = "invalid-format"
        } else if (hasError) {
          errorType = "load-failed"
        }

        return {
          account,
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
    selectedSource?.kind === "profile" ? selectedSource.profile : null

  const query = useQuery<PricingResponse, Error>({
    queryKey: currentProfile
      ? [
          "model-catalog",
          "profile",
          currentProfile.id,
          currentProfile.updatedAt,
        ]
      : ["model-catalog", "profile", "none"],
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
  const isAllAccounts = selectedSource?.kind === "all-accounts"
  const isProfileSource = selectedSource?.kind === "profile"

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
