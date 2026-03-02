import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useAccountData } from "~/hooks/useAccountData"
import { getApiService } from "~/services/apiService"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "../constants"
import { AccountToken } from "../type"

/**
 * Unified logger scoped to the Key Management options page hooks.
 */
const logger = createLogger("KeyManagementHook")

type TokenLoadStatus = "idle" | "loading" | "loaded" | "error"

interface TokenInventoryState {
  status: TokenLoadStatus
  tokens: AccountToken[]
  errorMessage?: string
}

interface FailedAccountTokenLoad {
  accountId: string
  accountName: string
  errorMessage?: string
}

interface TokenLoadProgress {
  total: number
  loaded: number
  loading: number
  error: number
}

const isFailedAccountTokenLoad = (
  value: FailedAccountTokenLoad | null,
): value is FailedAccountTokenLoad => value !== null

const tokenMatchesSearch = (token: AccountToken, searchLower: string) => {
  if (!searchLower) return true

  // Search intentionally matches against token name only (never the raw secret key).
  return token.name.toLowerCase().includes(searchLower)
}

const normalizeOrigin = (baseUrl: string) => {
  try {
    return new URL(baseUrl).origin
  } catch {
    return baseUrl.trim()
  }
}

/**
 * Manages key management page state: selection, loading, filtering, and CRUD handlers.
 * @param routeParams Optional route params containing preselected accountId.
 * @returns State, derived data, and handlers for token management UI.
 */
export function useKeyManagement(routeParams?: Record<string, string>) {
  const { t } = useTranslation(["keyManagement", "messages"])
  const { enabledDisplayData } = useAccountData()
  const [selectedAccount, setSelectedAccount] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")
  const [allAccountsFilterAccountId, setAllAccountsFilterAccountId] = useState<
    string | null
  >(null)
  const [tokenInventories, setTokenInventories] = useState<
    Record<string, TokenInventoryState>
  >({})
  const tokenInventoriesRef = useRef(tokenInventories)
  tokenInventoriesRef.current = tokenInventories
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [isAddTokenOpen, setIsAddTokenOpen] = useState(false)
  const [editingToken, setEditingToken] = useState<AccountToken | null>(null)

  const loadFailedMessage = t("keyManagement:messages.loadFailed")
  const loadFailedMessageRef = useRef(loadFailedMessage)
  loadFailedMessageRef.current = loadFailedMessage

  const isAllAccountsMode =
    selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE

  const accountById = useMemo(() => {
    return new Map(enabledDisplayData.map((account) => [account.id, account]))
  }, [enabledDisplayData])

  const normalizedSearchTerm = searchTerm.trim().toLowerCase()

  const selectionEpochRef = useRef(0)
  const accountRequestEpochRef = useRef<Record<string, number>>({})

  const startNewLoadEpoch = useCallback(() => {
    selectionEpochRef.current += 1
    return selectionEpochRef.current
  }, [])

  const isEpochActive = useCallback((epoch: number) => {
    return selectionEpochRef.current === epoch
  }, [])

  const getNextAccountRequestEpoch = useCallback((accountId: string) => {
    const nextEpoch = (accountRequestEpochRef.current[accountId] ?? 0) + 1
    accountRequestEpochRef.current[accountId] = nextEpoch
    return nextEpoch
  }, [])

  const isLatestAccountRequest = useCallback(
    (accountId: string, requestEpoch: number) => {
      return accountRequestEpochRef.current[accountId] === requestEpoch
    },
    [],
  )

  /**
   * Loads tokens for a single account and updates inventory state.
   * Uses (loadEpoch, requestEpoch) guards to prevent stale writes when selection
   * changes or a newer request for the same account is issued.
   */
  const loadTokensForAccount = useCallback(
    async (params: {
      accountId: string
      loadEpoch: number
      toastOnError: boolean
    }) => {
      const { accountId, loadEpoch, toastOnError } = params
      const account = accountById.get(accountId)
      if (!account) return

      const requestEpoch = getNextAccountRequestEpoch(accountId)

      if (!isEpochActive(loadEpoch)) return
      setTokenInventories((prev) => ({
        ...prev,
        [accountId]: {
          status: "loading",
          tokens: prev[accountId]?.tokens ?? [],
          errorMessage: undefined,
        },
      }))

      try {
        const tokens = await getApiService(account.siteType).fetchAccountTokens(
          {
            baseUrl: account.baseUrl,
            accountId: account.id,
            auth: {
              authType: account.authType,
              userId: account.userId,
              accessToken: account.token,
              cookie: account.cookieAuthSessionCookie,
            },
          },
        )

        if (!isEpochActive(loadEpoch)) return
        if (!isLatestAccountRequest(accountId, requestEpoch)) return

        if (!Array.isArray(tokens)) {
          const errorMessage = loadFailedMessageRef.current
          setTokenInventories((prev) => ({
            ...prev,
            [accountId]: {
              status: "error",
              tokens: prev[accountId]?.tokens ?? [],
              errorMessage,
            },
          }))
          if (toastOnError) {
            toast.error(errorMessage)
          }
          return
        }

        const tokensWithAccount = tokens.map((token) => ({
          ...token,
          accountId: account.id,
          accountName: account.name,
        }))

        setTokenInventories((prev) => ({
          ...prev,
          [accountId]: {
            status: "loaded",
            tokens: tokensWithAccount,
            errorMessage: undefined,
          },
        }))
      } catch (error) {
        if (!isEpochActive(loadEpoch)) return
        if (!isLatestAccountRequest(accountId, requestEpoch)) return

        const errorMessage =
          getErrorMessage(error) || loadFailedMessageRef.current
        logger.error("获取账号密钥失败", errorMessage)
        setTokenInventories((prev) => ({
          ...prev,
          [accountId]: {
            status: "error",
            tokens: prev[accountId]?.tokens ?? [],
            errorMessage,
          },
        }))
        if (toastOnError) {
          toast.error(loadFailedMessageRef.current)
        }
      }
    },
    [
      accountById,
      getNextAccountRequestEpoch,
      isEpochActive,
      isLatestAccountRequest,
    ],
  )

  /**
   * Loads tokens for multiple accounts, with light concurrency control:
   * - accounts with the same normalized origin are loaded sequentially
   * - different origins load concurrently
   */
  const loadTokensForAccounts = useCallback(
    async (params: { accountIds: string[]; loadEpoch: number }) => {
      const { accountIds, loadEpoch } = params
      const targetAccounts = accountIds.flatMap((id) => {
        const account = accountById.get(id)
        return account ? [account] : []
      })

      const accountsByOrigin = new Map<string, string[]>()
      for (const account of targetAccounts) {
        const origin = normalizeOrigin(account.baseUrl)
        const list = accountsByOrigin.get(origin) ?? []
        list.push(account.id)
        accountsByOrigin.set(origin, list)
      }

      const originEntries = Array.from(accountsByOrigin.entries())
      const results = await Promise.allSettled(
        originEntries.map(async ([, originAccountIds]) => {
          for (const accountId of originAccountIds) {
            if (!isEpochActive(loadEpoch)) return
            await loadTokensForAccount({
              accountId,
              loadEpoch,
              toastOnError: false,
            })
          }
        }),
      )

      results.forEach((result, index) => {
        if (result.status !== "rejected") return
        logger.error("All-accounts token load worker failed unexpectedly", {
          origin: originEntries[index]?.[0] ?? "unknown",
          error: result.reason,
        })
      })
    },
    [accountById, isEpochActive, loadTokensForAccount],
  )

  /**
   * Refreshes tokens based on the current selection:
   * - single account: loads that account and shows toast on failure
   * - all accounts: loads each enabled account with per-account error isolation
   */
  const loadTokens = useCallback(
    async (accountId?: string) => {
      const targetAccountId = accountId ?? selectedAccount
      if (!targetAccountId || enabledDisplayData.length === 0) return

      const loadEpoch = startNewLoadEpoch()
      setVisibleKeys(new Set())

      if (targetAccountId === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE) {
        setTokenInventories((prev) => {
          const next: Record<string, TokenInventoryState> = {}
          for (const account of enabledDisplayData) {
            next[account.id] = prev[account.id] ?? {
              status: "idle",
              tokens: [],
            }
          }
          return next
        })
        await loadTokensForAccounts({
          accountIds: enabledDisplayData.map((account) => account.id),
          loadEpoch,
        })
        return
      }

      if (!accountById.get(targetAccountId)) {
        setTokenInventories({})
        return
      }

      setTokenInventories((prev) => ({
        ...prev,
        [targetAccountId]: prev[targetAccountId] ?? {
          status: "idle",
          tokens: [],
        },
      }))

      await loadTokensForAccount({
        accountId: targetAccountId,
        loadEpoch,
        toastOnError: true,
      })
    },
    [
      accountById,
      enabledDisplayData,
      selectedAccount,
      loadTokensForAccount,
      loadTokensForAccounts,
      startNewLoadEpoch,
    ],
  )

  const loadTokensRef = useRef(loadTokens)
  loadTokensRef.current = loadTokens

  const retryFailedAccounts = useCallback(async () => {
    if (!isAllAccountsMode) return

    const failedAccountIds = enabledDisplayData
      .filter(
        (account) =>
          tokenInventoriesRef.current[account.id]?.status === "error",
      )
      .map((account) => account.id)

    if (failedAccountIds.length === 0) return
    await loadTokensForAccounts({
      accountIds: failedAccountIds,
      loadEpoch: selectionEpochRef.current,
    })
  }, [enabledDisplayData, isAllAccountsMode, loadTokensForAccounts])

  useEffect(() => {
    if (!selectedAccount) return

    if (selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE) {
      if (enabledDisplayData.length === 0) {
        setSelectedAccount("")
      }
      return
    }

    const accountExists = enabledDisplayData.some(
      (account) => account.id === selectedAccount,
    )
    if (!accountExists) {
      setSelectedAccount("")
    }
  }, [selectedAccount, enabledDisplayData])

  useEffect(() => {
    if (selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE) {
      if (allAccountsFilterAccountId !== null) {
        setAllAccountsFilterAccountId(null)
      }
      return
    }

    if (
      allAccountsFilterAccountId &&
      !accountById.get(allAccountsFilterAccountId)
    ) {
      setAllAccountsFilterAccountId(null)
    }
  }, [accountById, allAccountsFilterAccountId, selectedAccount])

  useEffect(() => {
    if (routeParams?.accountId && enabledDisplayData.length > 0) {
      const accountExists = enabledDisplayData.some(
        (acc) => acc.id === routeParams.accountId,
      )
      if (accountExists) {
        setSelectedAccount(routeParams.accountId)
      }
    }
  }, [routeParams?.accountId, enabledDisplayData])

  useEffect(() => {
    if (selectedAccount) {
      void loadTokensRef.current()
    } else {
      setTokenInventories({})
      setVisibleKeys(new Set())
    }
  }, [selectedAccount, enabledDisplayData])

  const allTokens = useMemo(() => {
    return enabledDisplayData.flatMap(
      (account) => tokenInventories[account.id]?.tokens ?? [],
    )
  }, [enabledDisplayData, tokenInventories])

  const tokens = useMemo(() => {
    if (!selectedAccount) return []

    if (isAllAccountsMode) {
      const scopedTokens = allAccountsFilterAccountId
        ? allTokens.filter(
            (token) => token.accountId === allAccountsFilterAccountId,
          )
        : allTokens
      return scopedTokens
    }

    return tokenInventories[selectedAccount]?.tokens ?? []
  }, [
    allAccountsFilterAccountId,
    allTokens,
    isAllAccountsMode,
    selectedAccount,
    tokenInventories,
  ])

  const filteredTokens = useMemo(() => {
    return tokens.filter((token) =>
      tokenMatchesSearch(token, normalizedSearchTerm),
    )
  }, [normalizedSearchTerm, tokens])

  const isLoading = useMemo(() => {
    if (!selectedAccount) return false

    if (isAllAccountsMode) {
      return enabledDisplayData.some(
        (account) => tokenInventories[account.id]?.status === "loading",
      )
    }

    return tokenInventories[selectedAccount]?.status === "loading"
  }, [enabledDisplayData, isAllAccountsMode, selectedAccount, tokenInventories])

  const tokenLoadProgress = useMemo((): TokenLoadProgress | null => {
    if (!isAllAccountsMode) return null

    const total = enabledDisplayData.length
    let loaded = 0
    let loading = 0
    let error = 0

    for (const account of enabledDisplayData) {
      const status = tokenInventories[account.id]?.status ?? "idle"
      if (status === "loaded") loaded += 1
      if (status === "loading") loading += 1
      if (status === "error") error += 1
    }

    return { total, loaded, loading, error }
  }, [enabledDisplayData, isAllAccountsMode, tokenInventories])

  const failedAccounts = useMemo((): FailedAccountTokenLoad[] => {
    if (!isAllAccountsMode) return []

    return enabledDisplayData
      .map((account): FailedAccountTokenLoad | null => {
        const inventory = tokenInventories[account.id]
        if (inventory?.status !== "error") return null
        return {
          accountId: account.id,
          accountName: account.name,
          errorMessage: inventory.errorMessage,
        }
      })
      .filter(isFailedAccountTokenLoad)
  }, [enabledDisplayData, isAllAccountsMode, tokenInventories])

  const accountSummaryItems = useMemo(() => {
    if (!isAllAccountsMode) return []

    const countMap = new Map<string, number>()
    allTokens
      .filter((token) => tokenMatchesSearch(token, normalizedSearchTerm))
      .forEach((token) => {
        countMap.set(token.accountId, (countMap.get(token.accountId) ?? 0) + 1)
      })

    return enabledDisplayData.map((account) => ({
      accountId: account.id,
      name: account.name,
      count: countMap.get(account.id) ?? 0,
      errorType:
        tokenInventories[account.id]?.status === "error"
          ? ("load-failed" as const)
          : undefined,
    }))
  }, [
    allTokens,
    enabledDisplayData,
    isAllAccountsMode,
    normalizedSearchTerm,
    tokenInventories,
  ])

  const copyKey = async (key: string, name: string) => {
    try {
      await navigator.clipboard.writeText(key)
      toast.success(t("keyManagement:messages.keyCopied", { name }))
    } catch (error) {
      toast.error(t("keyManagement:messages.copyFailed"))
      logger.warn("Failed to copy key to clipboard", error)
    }
  }

  const toggleKeyVisibility = (tokenIdentityKey: string) => {
    setVisibleKeys((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(tokenIdentityKey)) {
        newSet.delete(tokenIdentityKey)
      } else {
        newSet.add(tokenIdentityKey)
      }
      return newSet
    })
  }

  const handleAddToken = () => {
    setIsAddTokenOpen(true)
  }

  const handleCloseAddToken = () => {
    setIsAddTokenOpen(false)
    setEditingToken(null)
    if (selectedAccount) {
      void loadTokens()
    }
  }

  const handleEditToken = (token: AccountToken) => {
    setEditingToken(token)
    setIsAddTokenOpen(true)
  }

  const handleDeleteToken = async (token: AccountToken) => {
    if (
      !window.confirm(
        t("keyManagement:messages.deleteConfirm", { name: token.name }),
      )
    ) {
      return
    }

    try {
      const account = enabledDisplayData.find(
        (acc) => acc.id === token.accountId,
      )
      if (!account) {
        toast.error(t("keyManagement:messages.accountNotFound"))
        return
      }

      await getApiService(account.siteType).deleteApiToken(
        {
          baseUrl: account.baseUrl,
          accountId: account.id,
          auth: {
            authType: account.authType,
            userId: account.userId,
            accessToken: account.token,
            cookie: account.cookieAuthSessionCookie,
          },
        },
        token.id,
      )
      toast.success(
        t("keyManagement:messages.deleteSuccess", { name: token.name }),
      )

      if (selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE) {
        void loadTokensForAccount({
          accountId: token.accountId,
          loadEpoch: selectionEpochRef.current,
          toastOnError: false,
        })
      } else if (selectedAccount) {
        void loadTokens()
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error) || String(error)
      logger.error("删除密钥失败", errorMessage)
      toast.error(t("keyManagement:messages.deleteFailed"))
    }
  }

  return {
    displayData: enabledDisplayData,
    selectedAccount,
    setSelectedAccount,
    searchTerm,
    setSearchTerm,
    tokens,
    isLoading,
    visibleKeys,
    isAddTokenOpen,
    editingToken,
    tokenInventories,
    tokenLoadProgress,
    failedAccounts,
    accountSummaryItems,
    allAccountsFilterAccountId,
    setAllAccountsFilterAccountId,
    loadTokens,
    filteredTokens,
    copyKey,
    toggleKeyVisibility,
    retryFailedAccounts,
    handleAddToken,
    handleCloseAddToken,
    handleEditToken,
    handleDeleteToken,
  }
}
