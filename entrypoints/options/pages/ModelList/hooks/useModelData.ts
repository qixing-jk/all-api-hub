import { useQueries, useQuery } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { getApiService } from "~/services/apiService"
import type { PricingResponse } from "~/services/apiService/common/type"
import {
  MODEL_PRICING_CACHE_TTL_MS,
  modelPricingCache,
} from "~/services/modelPricingCache"
import type { DisplaySiteData } from "~/types"

type SelectedAccountValue = string | "all"

interface UseModelDataProps {
  selectedAccount: SelectedAccountValue
  accounts: DisplaySiteData[]
  selectedGroup: string
}

export interface AccountPricingContext {
  account: DisplaySiteData
  pricing: PricingResponse
}

export type AccountErrorType = "invalid-format" | "load-failed"

export interface AccountQueryState {
  account: DisplaySiteData
  hasData: boolean
  hasError: boolean
  errorType?: AccountErrorType
}

interface UseModelDataReturn {
  pricingData: PricingResponse | null
  pricingContexts: AccountPricingContext[]
  isLoading: boolean
  dataFormatError: boolean
  accountQueryStates: AccountQueryState[]
  loadPricingData: (accountId: string) => Promise<void>
}

/**
 * Fetches pricing data for a single selected account with caching and error handling.
 * @param params Input parameters for the hook.
 * @param params.selectedAccount Account id to load pricing for.
 * @param params.accounts All available accounts.
 * @returns Pricing data, loading flags, query states, and reload helper.
 */
function useSingleAccountModelData(params: {
  selectedAccount: string
  accounts: DisplaySiteData[]
}): UseModelDataReturn {
  const { selectedAccount, accounts } = params
  const { t } = useTranslation("modelList")
  const [dataFormatError, setDataFormatError] = useState(false)

  const safeDisplayData = useMemo(() => accounts || [], [accounts])

  const currentAccount = useMemo(
    () => safeDisplayData.find((acc) => acc.id === selectedAccount),
    [safeDisplayData, selectedAccount],
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

      const data = await getApiService(currentAccount.siteType).fetchModelPricing(
        currentAccount,
      )

      if (!Array.isArray(data.data)) {
        const error = new Error("INVALID_FORMAT")
        ;(error as { code?: string }).code = "INVALID_FORMAT"
        throw error
      }

      await modelPricingCache.set(accountId, data)

      return data
    },
  })

  useEffect(() => {
    if (query.isSuccess) {
      setDataFormatError(false)
      toast.success(t("status.dataLoaded"))
      return
    }

    if (query.isError) {
      const typedError = (query.error ?? undefined) as
        | { code?: string }
        | undefined

      if (typedError?.code === "INVALID_FORMAT") {
        setDataFormatError(true)
        toast.error(t("status.formatNotStandard"))
        return
      }

      setDataFormatError(false)
      toast.error(t("status.loadFailed"))
    }
  }, [query.data, query.isSuccess, query.isError, query.error, t])

  const loadPricingData = useCallback(
    async (accountId: string) => {
      if (!currentAccount) return
      if (accountId !== currentAccount.id) return
      await modelPricingCache.invalidate(currentAccount.id)
      await query.refetch()
    },
    [currentAccount, query],
  )

  const pricingContexts: AccountPricingContext[] = useMemo(
    () =>
      currentAccount && query.data
        ? [{ account: currentAccount, pricing: query.data }]
        : [],
    [currentAccount, query.data],
  )

  return {
    pricingData: query.data ?? null,
    pricingContexts,
    isLoading: query.isFetching,
    dataFormatError,
    accountQueryStates: [],
    loadPricingData,
  }
}

/**
 * Fetches pricing data for all accounts concurrently and aggregates results.
 * @param accounts List of accounts to query.
 * @returns Pricing contexts, loading/error flags, and reload helper.
 */
function useAllAccountsModelData(
  accounts: DisplaySiteData[],
): UseModelDataReturn {
  const safeDisplayData = useMemo(() => accounts || [], [accounts])

  const queries = useQueries({
    queries: safeDisplayData.map((account) => ({
      queryKey: ["model-pricing", account.id, account.baseUrl, account.userId],
      enabled: safeDisplayData.length > 0,
      staleTime: MODEL_PRICING_CACHE_TTL_MS,
      refetchOnWindowFocus: false,
      retry: 1,
      queryFn: async () => {
        const cached = await modelPricingCache.get(account.id)
        if (cached && Array.isArray(cached.data)) {
          return cached
        }

        const data = await getApiService(account.siteType).fetchModelPricing(account)

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
  }
}

/**
 * Provides model pricing data for either a single account or all accounts.
 * @param params Hook input parameters.
 * @param params.selectedAccount Selected account id or "all".
 * @param params.accounts Available accounts list.
 * @returns Pricing data, contexts, loading state, and query summaries.
 */
export function useModelData(params: UseModelDataProps): UseModelDataReturn {
  const { selectedAccount, accounts } = params
  const safeDisplayData = useMemo(() => accounts || [], [accounts])
  const isAllAccounts = selectedAccount === "all"

  const singleAccountResult = useSingleAccountModelData({
    selectedAccount: isAllAccounts ? "" : selectedAccount,
    accounts: safeDisplayData,
  })

  const allAccountsResult = useAllAccountsModelData(safeDisplayData)

  return isAllAccounts ? allAccountsResult : singleAccountResult
}
