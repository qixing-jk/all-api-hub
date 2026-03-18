import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { DONE_HUB, OCTOPUS, VELOERA } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountData } from "~/hooks/useAccountData"
import {
  createDisplayAccountApiContext,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { getManagedSiteTokenChannelStatus } from "~/services/managedSites/tokenChannelStatus"
import { supportsManagedSiteBaseUrlChannelLookup } from "~/services/managedSites/utils/managedSite"
import type { AccountToken, DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "../constants"
import { buildTokenIdentityKey } from "../utils"

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

interface ManagedSiteTokenStatusState {
  cacheKey: string
  runId: number
  isChecking: boolean
  result?: ManagedSiteTokenChannelStatusResult
  checkedAt?: number
}

type ManagedSiteTokenChannelStatusResult = Awaited<
  ReturnType<typeof getManagedSiteTokenChannelStatus>
>

interface RefreshManagedSiteTokenStatusOptions {
  resolvedChannelKeysById?: Record<number, string>
}

const isFailedAccountTokenLoad = (
  value: FailedAccountTokenLoad | null,
): value is FailedAccountTokenLoad => value !== null

const MANAGED_SITE_STATUS_CONCURRENCY = 4

const tokenMatchesSearch = (token: AccountToken, searchLower: string) => {
  if (!searchLower) return true

  // Search intentionally matches against token name only (never the raw secret key).
  return token.name.toLowerCase().includes(searchLower)
}

const normalizeOrigin = (baseUrl: string) => {
  return normalizeUrlForOriginKey(baseUrl, { stripTrailingSlashes: false })
}

const hashStringForCache = (value: string) => {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16)
}

/**
 * Manages key management page state: selection, loading, filtering, and CRUD handlers.
 * @param routeParams Optional route params containing preselected accountId.
 * @returns State, derived data, and handlers for token management UI.
 */
export function useKeyManagement(routeParams?: Record<string, string>) {
  const { t } = useTranslation(["keyManagement", "messages"])
  const { enabledDisplayData } = useAccountData()
  const {
    managedSiteType,
    newApiBaseUrl,
    newApiAdminToken,
    newApiUserId,
    newApiUsername,
    newApiPassword,
    newApiTotpSecret,
    doneHubBaseUrl,
    doneHubAdminToken,
    doneHubUserId,
    veloeraBaseUrl,
    veloeraAdminToken,
    veloeraUserId,
    octopusBaseUrl,
    octopusUsername,
    octopusPassword,
  } = useUserPreferencesContext()
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
  const [resolvedVisibleKeys, setResolvedVisibleKeys] = useState<
    Record<string, string>
  >({})
  const [resolvingVisibleKeys, setResolvingVisibleKeys] = useState<Set<string>>(
    new Set(),
  )
  const [isAddTokenOpen, setIsAddTokenOpen] = useState(false)
  const [editingToken, setEditingToken] = useState<AccountToken | null>(null)
  const [managedSiteTokenStatuses, setManagedSiteTokenStatuses] = useState<
    Record<string, ManagedSiteTokenStatusState>
  >({})
  const managedSiteTokenStatusesRef = useRef(managedSiteTokenStatuses)
  managedSiteTokenStatusesRef.current = managedSiteTokenStatuses
  const [isManagedSiteStatusRefreshing, setIsManagedSiteStatusRefreshing] =
    useState(false)

  const loadFailedMessage = t("keyManagement:messages.loadFailed")
  const loadFailedMessageRef = useRef(loadFailedMessage)
  loadFailedMessageRef.current = loadFailedMessage

  const isAllAccountsMode =
    selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
  const isManagedSiteChannelStatusSupported = useMemo(() => {
    return supportsManagedSiteBaseUrlChannelLookup(managedSiteType)
  }, [managedSiteType])

  const accountById = useMemo(() => {
    return new Map(enabledDisplayData.map((account) => [account.id, account]))
  }, [enabledDisplayData])

  const managedSiteConfigFingerprint = useMemo(() => {
    if (managedSiteType === OCTOPUS) {
      return [
        managedSiteType,
        (octopusBaseUrl ?? "").trim(),
        (octopusUsername ?? "").trim(),
        hashStringForCache((octopusPassword ?? "").trim()),
      ].join("|")
    }

    if (managedSiteType === DONE_HUB) {
      return [
        managedSiteType,
        (doneHubBaseUrl ?? "").trim(),
        (doneHubUserId ?? "").trim(),
        hashStringForCache((doneHubAdminToken ?? "").trim()),
      ].join("|")
    }

    if (managedSiteType === VELOERA) {
      return [
        managedSiteType,
        (veloeraBaseUrl ?? "").trim(),
        (veloeraUserId ?? "").trim(),
        hashStringForCache((veloeraAdminToken ?? "").trim()),
      ].join("|")
    }

    return [
      managedSiteType,
      (newApiBaseUrl ?? "").trim(),
      (newApiUserId ?? "").trim(),
      hashStringForCache((newApiAdminToken ?? "").trim()),
      (newApiUsername ?? "").trim(),
      hashStringForCache((newApiPassword ?? "").trim()),
      hashStringForCache((newApiTotpSecret ?? "").trim()),
    ].join("|")
  }, [
    doneHubAdminToken,
    doneHubBaseUrl,
    doneHubUserId,
    managedSiteType,
    newApiAdminToken,
    newApiBaseUrl,
    newApiPassword,
    newApiTotpSecret,
    newApiUserId,
    newApiUsername,
    octopusBaseUrl,
    octopusPassword,
    octopusUsername,
    veloeraAdminToken,
    veloeraBaseUrl,
    veloeraUserId,
  ])

  const normalizedSearchTerm = searchTerm.trim().toLowerCase()

  const selectionEpochRef = useRef(0)
  const accountRequestEpochRef = useRef<Record<string, number>>({})
  const managedSiteStatusRunIdRef = useRef(0)
  const isMountedRef = useRef(true)

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

  const buildManagedSiteStatusCacheKey = useCallback(
    (token: Pick<AccountToken, "accountId" | "id">) => {
      return [
        buildTokenIdentityKey(token.accountId, token.id),
        managedSiteConfigFingerprint,
      ].join("|")
    },
    [managedSiteConfigFingerprint],
  )

  const invalidateManagedSiteStatuses = useCallback(
    (shouldRemove: (identityKey: string) => boolean) => {
      setManagedSiteTokenStatuses((prev) => {
        let didChange = false
        const next: Record<string, ManagedSiteTokenStatusState> = {}

        for (const [identityKey, entry] of Object.entries(prev)) {
          if (shouldRemove(identityKey)) {
            didChange = true
            continue
          }

          next[identityKey] = entry
        }

        return didChange ? next : prev
      })
    },
    [],
  )

  const invalidateManagedSiteStatusesForAccount = useCallback(
    (accountId: string) => {
      invalidateManagedSiteStatuses((identityKey) =>
        identityKey.startsWith(`${accountId}:`),
      )
    },
    [invalidateManagedSiteStatuses],
  )

  const invalidateManagedSiteStatusForToken = useCallback(
    (token: Pick<AccountToken, "accountId" | "id">) => {
      const identityKey = buildTokenIdentityKey(token.accountId, token.id)
      invalidateManagedSiteStatuses(
        (candidateIdentityKey) => candidateIdentityKey === identityKey,
      )
    },
    [invalidateManagedSiteStatuses],
  )

  const runManagedSiteStatusChecks = useCallback(
    async (params: {
      tokens: AccountToken[]
      force?: boolean
      resolvedChannelKeysByIdentityKey?: Record<string, Record<number, string>>
    }): Promise<Record<string, ManagedSiteTokenChannelStatusResult>> => {
      const resultsByIdentityKey: Record<
        string,
        ManagedSiteTokenChannelStatusResult
      > = {}

      if (!isManagedSiteChannelStatusSupported) {
        return resultsByIdentityKey
      }

      const {
        tokens,
        force = false,
        resolvedChannelKeysByIdentityKey = {},
      } = params
      const uniqueTargets = new Map<
        string,
        {
          token: AccountToken
          account: (typeof enabledDisplayData)[number]
          identityKey: string
          cacheKey: string
          resolvedChannelKeysById?: Record<number, string>
        }
      >()

      for (const token of tokens) {
        const account = accountById.get(token.accountId)
        if (!account) {
          continue
        }

        const identityKey = buildTokenIdentityKey(token.accountId, token.id)
        const cacheKey = buildManagedSiteStatusCacheKey(token)
        const existingEntry = managedSiteTokenStatusesRef.current[identityKey]

        if (!force && existingEntry?.cacheKey === cacheKey) {
          continue
        }

        uniqueTargets.set(identityKey, {
          token,
          account,
          identityKey,
          cacheKey,
          resolvedChannelKeysById:
            resolvedChannelKeysByIdentityKey[identityKey],
        })
      }

      const targets = Array.from(uniqueTargets.values())

      if (targets.length === 0) {
        return resultsByIdentityKey
      }

      const runId = force
        ? managedSiteStatusRunIdRef.current + 1
        : managedSiteStatusRunIdRef.current

      if (force) {
        managedSiteStatusRunIdRef.current = runId
      }

      setManagedSiteTokenStatuses((prev) => {
        const next = { ...prev }

        for (const target of targets) {
          next[target.identityKey] = {
            cacheKey: target.cacheKey,
            runId,
            isChecking: true,
          }
        }

        return next
      })

      const queue = [...targets]
      const workerCount = Math.min(
        MANAGED_SITE_STATUS_CONCURRENCY,
        queue.length,
      )

      await Promise.allSettled(
        Array.from({ length: workerCount }, async () => {
          while (queue.length > 0) {
            const target = queue.shift()

            if (!target) {
              return
            }

            const result = await getManagedSiteTokenChannelStatus({
              account: target.account,
              token: target.token,
              resolvedChannelKeysById: target.resolvedChannelKeysById,
            })
            resultsByIdentityKey[target.identityKey] = result

            if (!isMountedRef.current) {
              return
            }

            setManagedSiteTokenStatuses((prev) => {
              const currentEntry = prev[target.identityKey]

              if (
                !currentEntry ||
                currentEntry.cacheKey !== target.cacheKey ||
                currentEntry.runId !== runId
              ) {
                return prev
              }

              return {
                ...prev,
                [target.identityKey]: {
                  cacheKey: target.cacheKey,
                  runId,
                  isChecking: false,
                  result,
                  checkedAt: Date.now(),
                },
              }
            })
          }
        }),
      )

      return resultsByIdentityKey
    },
    [
      accountById,
      buildManagedSiteStatusCacheKey,
      isManagedSiteChannelStatusSupported,
    ],
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
      invalidateManagedSiteStatusesForAccount(accountId)
      setTokenInventories((prev) => ({
        ...prev,
        [accountId]: {
          status: "loading",
          tokens: prev[accountId]?.tokens ?? [],
          errorMessage: undefined,
        },
      }))

      try {
        const { service, request } = createDisplayAccountApiContext(account)
        const tokens = await service.fetchAccountTokens(request)

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
          toast.error(errorMessage)
        }
      }
    },
    [
      accountById,
      getNextAccountRequestEpoch,
      invalidateManagedSiteStatusesForAccount,
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
      setResolvedVisibleKeys({})
      setResolvingVisibleKeys(new Set())

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
      setResolvedVisibleKeys({})
      setResolvingVisibleKeys(new Set())
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

  const statusCheckTokens = useMemo(() => {
    return tokens.filter(
      (token) => tokenInventories[token.accountId]?.status === "loaded",
    )
  }, [tokenInventories, tokens])

  const refreshManagedSiteTokenStatuses = useCallback(async () => {
    if (
      !isManagedSiteChannelStatusSupported ||
      statusCheckTokens.length === 0
    ) {
      return
    }

    setIsManagedSiteStatusRefreshing(true)

    try {
      await runManagedSiteStatusChecks({
        tokens: statusCheckTokens,
        force: true,
      })
    } finally {
      if (isMountedRef.current) {
        setIsManagedSiteStatusRefreshing(false)
      }
    }
  }, [
    isManagedSiteChannelStatusSupported,
    runManagedSiteStatusChecks,
    statusCheckTokens,
  ])

  const refreshManagedSiteTokenStatusForToken = useCallback(
    async (
      token: AccountToken,
      options?: RefreshManagedSiteTokenStatusOptions,
    ) => {
      if (!isManagedSiteChannelStatusSupported) {
        return
      }

      if (tokenInventoriesRef.current[token.accountId]?.status !== "loaded") {
        return
      }

      invalidateManagedSiteStatusForToken(token)
      const identityKey = buildTokenIdentityKey(token.accountId, token.id)

      const results = await runManagedSiteStatusChecks({
        tokens: [token],
        force: true,
        resolvedChannelKeysByIdentityKey: options?.resolvedChannelKeysById
          ? {
              [identityKey]: options.resolvedChannelKeysById,
            }
          : undefined,
      })

      return results[identityKey]
    },
    [
      invalidateManagedSiteStatusForToken,
      isManagedSiteChannelStatusSupported,
      runManagedSiteStatusChecks,
    ],
  )

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      managedSiteStatusRunIdRef.current += 1
    }
  }, [])

  useEffect(() => {
    managedSiteStatusRunIdRef.current += 1
    setManagedSiteTokenStatuses({})
  }, [managedSiteConfigFingerprint])

  useEffect(() => {
    if (
      !isManagedSiteChannelStatusSupported ||
      statusCheckTokens.length === 0
    ) {
      return
    }

    void runManagedSiteStatusChecks({ tokens: statusCheckTokens })
  }, [
    isManagedSiteChannelStatusSupported,
    runManagedSiteStatusChecks,
    statusCheckTokens,
  ])

  useEffect(() => {
    if (isManagedSiteChannelStatusSupported) {
      return
    }

    setIsManagedSiteStatusRefreshing(false)
  }, [isManagedSiteChannelStatusSupported])

  const copyKey = async (account: DisplaySiteData, token: AccountToken) => {
    try {
      const resolvedToken = await resolveDisplayAccountTokenForSecret(
        account,
        token,
      )
      await navigator.clipboard.writeText(resolvedToken.key)
      toast.success(t("keyManagement:messages.keyCopied", { name: token.name }))
    } catch (error) {
      toast.error(t("keyManagement:messages.copyFailed"))
      logger.warn("Failed to copy key to clipboard", error)
    }
  }

  const getVisibleTokenKey = useCallback(
    (token: Pick<AccountToken, "accountId" | "id" | "key">) => {
      const tokenIdentityKey = buildTokenIdentityKey(token.accountId, token.id)
      return resolvedVisibleKeys[tokenIdentityKey] ?? token.key
    },
    [resolvedVisibleKeys],
  )

  const toggleKeyVisibility = async (
    account: DisplaySiteData,
    token: AccountToken,
  ) => {
    const tokenIdentityKey = buildTokenIdentityKey(token.accountId, token.id)

    if (visibleKeys.has(tokenIdentityKey)) {
      setVisibleKeys((prev) => {
        const newSet = new Set(prev)
        newSet.delete(tokenIdentityKey)
        return newSet
      })
      return
    }

    if (resolvedVisibleKeys[tokenIdentityKey] !== undefined) {
      setVisibleKeys((prev) => {
        const newSet = new Set(prev)
        newSet.add(tokenIdentityKey)
        return newSet
      })
      return
    }

    if (resolvingVisibleKeys.has(tokenIdentityKey)) {
      return
    }

    const visibilityRequestEpoch = selectionEpochRef.current
    setResolvingVisibleKeys((prev) => {
      const next = new Set(prev)
      next.add(tokenIdentityKey)
      return next
    })

    try {
      const resolvedToken = await resolveDisplayAccountTokenForSecret(
        account,
        token,
      )

      if (!isMountedRef.current || !isEpochActive(visibilityRequestEpoch)) {
        return
      }

      setResolvedVisibleKeys((prev) => ({
        ...prev,
        [tokenIdentityKey]: resolvedToken.key,
      }))
      setVisibleKeys((prev) => {
        const newSet = new Set(prev)
        newSet.add(tokenIdentityKey)
        return newSet
      })
    } catch (error) {
      toast.error(t("keyManagement:messages.revealFailed"))
      logger.warn("Failed to resolve key for visibility", error)
    } finally {
      if (isMountedRef.current) {
        setResolvingVisibleKeys((prev) => {
          if (!prev.has(tokenIdentityKey)) {
            return prev
          }

          const next = new Set(prev)
          next.delete(tokenIdentityKey)
          return next
        })
      }
    }
  }

  const clearTokenVisibilityState = (
    token: Pick<AccountToken, "accountId" | "id">,
  ) => {
    const tokenIdentityKey = buildTokenIdentityKey(token.accountId, token.id)

    setVisibleKeys((prev) => {
      const newSet = new Set(prev)
      if (!newSet.has(tokenIdentityKey)) {
        return prev
      }

      newSet.delete(tokenIdentityKey)
      return newSet
    })
    setResolvingVisibleKeys((prev) => {
      if (!prev.has(tokenIdentityKey)) {
        return prev
      }

      const next = new Set(prev)
      next.delete(tokenIdentityKey)
      return next
    })
    setResolvedVisibleKeys((prev) => {
      if (!(tokenIdentityKey in prev)) {
        return prev
      }

      const { [tokenIdentityKey]: _removedKey, ...rest } = prev
      return rest
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

      const { service, request } = createDisplayAccountApiContext(account)
      await service.deleteApiToken(request, token.id)
      clearTokenVisibilityState(token)
      invalidateManagedSiteStatusForToken(token)
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
      toast.error(errorMessage)
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
    resolvingVisibleKeys,
    isAddTokenOpen,
    editingToken,
    tokenInventories,
    tokenLoadProgress,
    failedAccounts,
    accountSummaryItems,
    managedSiteTokenStatuses,
    isManagedSiteChannelStatusSupported,
    isManagedSiteStatusRefreshing,
    allAccountsFilterAccountId,
    setAllAccountsFilterAccountId,
    loadTokens,
    filteredTokens,
    getVisibleTokenKey,
    refreshManagedSiteTokenStatuses,
    refreshManagedSiteTokenStatusForToken,
    copyKey,
    toggleKeyVisibility,
    retryFailedAccounts,
    handleAddToken,
    handleCloseAddToken,
    handleEditToken,
    handleDeleteToken,
  }
}
