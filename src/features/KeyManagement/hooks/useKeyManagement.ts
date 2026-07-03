import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountData } from "~/hooks/useAccountData"
import {
  accountRuntimeKeyToLegacyAccountToken,
  buildServiceCredentialRuntimeKey,
  isAccountTokenRuntimeKey,
  type AccountRuntimeKey,
  type ServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { formatOptionalSkPrefixSiteTokenAuthKey } from "~/services/accountTokens/apiTokenKey"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { getManagedSiteTokenChannelStatus } from "~/services/managedSites/tokenChannelStatus"
import { supportsManagedSiteBaseUrlChannelLookup } from "~/services/managedSites/utils/managedSite"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  startProductAnalyticsAction,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsErrorCategory,
} from "~/services/productAnalytics/contracts"
import type { AccountToken, DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "../constants"
import { type KeyManagementEntry, type ServiceCredentialState } from "../types"
import {
  buildAccountRuntimeKeyEntryIdentityKey,
  buildAccountTokenKeyManagementEntry,
  buildServiceCredentialKeyManagementEntry,
  buildTokenIdentityKey,
  isManagedSiteStatusIdentityForAccount,
} from "../utils"

/**
 * Unified logger scoped to the Key Management options page hooks.
 */
const logger = createLogger("KeyManagementHook")

const keyManagementAnalyticsContext = (
  actionId:
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccountTokens
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.RefreshManagedSiteTokenStatus
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKey
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.RevealAccountTokenKey
    | typeof PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccountToken,
  surfaceId:
    | typeof PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementHeader
    | typeof PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
) => ({
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
  actionId,
  surfaceId,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
})

const managedSiteTokenStatusKindByStatus = (
  status: ManagedSiteTokenChannelStatusResult["status"],
) => {
  switch (status) {
    case "added":
      return PRODUCT_ANALYTICS_STATUS_KINDS.Healthy
    case "not-added":
      return PRODUCT_ANALYTICS_STATUS_KINDS.Warning
    default:
      return PRODUCT_ANALYTICS_STATUS_KINDS.Unknown
  }
}

const summarizeManagedSiteTokenStatusResults = (
  resultsByIdentityKey: Record<string, ManagedSiteTokenChannelStatusResult>,
  itemCount: number,
) => {
  const results = Object.values(resultsByIdentityKey)
  const failureCount = Math.max(itemCount - results.length, 0)
  const hasWarning = results.some((result) => result.status !== "added")

  if (failureCount > 0 || hasWarning) {
    return {
      successCount: results.length,
      failureCount,
      statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Warning,
    }
  }

  return {
    successCount: results.length,
    failureCount: 0,
    statusKind:
      results[0] !== undefined
        ? managedSiteTokenStatusKindByStatus(results[0].status)
        : undefined,
  }
}

const isClipboardPermissionError = (error: unknown) => {
  if (error instanceof DOMException) {
    return (
      error.name === "NotAllowedError" ||
      error.name === "SecurityError" ||
      error.name === "NotFoundError"
    )
  }

  if (error instanceof Error) {
    return /clipboard|denied|permission|notallowed|security/i.test(
      `${error.name} ${error.message}`,
    )
  }

  return false
}

type TokenLoadStatus = "idle" | "loading" | "loaded" | "error"
interface TokenInventoryState {
  status: TokenLoadStatus
  tokens: AccountToken[]
  errorMessage?: string
  errorCategory?: ProductAnalyticsErrorCategory
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

interface TokenLoadAggregateResult {
  successCount: number
  failureCount: number
  errorCategory?: ProductAnalyticsErrorCategory
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

interface ManagedSiteStatusCheckTargetInput {
  identityKey: string
  account: DisplaySiteData
  token: AccountToken
}

const buildServiceCredentialManagedSiteStatusTarget = (
  account: DisplaySiteData,
  runtimeKey: ServiceCredentialRuntimeKey,
): ManagedSiteStatusCheckTargetInput => {
  const statusAccount = {
    ...account,
    baseUrl: runtimeKey.baseUrl,
  }

  return {
    identityKey: buildAccountRuntimeKeyEntryIdentityKey(runtimeKey.id),
    account: statusAccount,
    token: accountRuntimeKeyToLegacyAccountToken({
      ...runtimeKey,
      account: statusAccount,
    }),
  }
}

const toDisplayManagedSiteTokenStatusResult = (
  result: ManagedSiteTokenChannelStatusResult,
): ManagedSiteTokenChannelStatusResult => {
  const displayResult = { ...result }
  delete displayResult.resolvedChannelKeysById
  return displayResult
}

const isFailedAccountTokenLoad = (
  value: FailedAccountTokenLoad | null,
): value is FailedAccountTokenLoad => value !== null

const toApiServiceRequest = (request: unknown): ApiServiceRequest =>
  request as ApiServiceRequest

const MANAGED_SITE_STATUS_CONCURRENCY = 4

const tokenMatchesSearch = (token: AccountToken, searchLower: string) => {
  if (!searchLower) return true

  // Search intentionally matches against token name only (never the raw secret key).
  return token.name.toLowerCase().includes(searchLower)
}

const serviceCredentialMatchesSearch = (
  runtimeKey: AccountRuntimeKey,
  searchLower: string,
) => {
  if (!searchLower) return true

  return runtimeKey.label.toLowerCase().includes(searchLower)
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
  const [allAccountsFilterAccountIds, setAllAccountsFilterAccountIds] =
    useState<string[]>([])
  const [tokenInventories, setTokenInventories] = useState<
    Record<string, TokenInventoryState>
  >({})
  const tokenInventoriesRef = useRef(tokenInventories)
  tokenInventoriesRef.current = tokenInventories
  const [serviceCredentials, setServiceCredentials] = useState<
    Record<string, ServiceCredentialState>
  >({})
  const serviceCredentialsRef = useRef(serviceCredentials)
  serviceCredentialsRef.current = serviceCredentials
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
  const updateManagedSiteTokenStatuses = useCallback(
    (
      updater: (
        prev: Record<string, ManagedSiteTokenStatusState>,
      ) => Record<string, ManagedSiteTokenStatusState>,
    ) => {
      const next = updater(managedSiteTokenStatusesRef.current)
      managedSiteTokenStatusesRef.current = next
      setManagedSiteTokenStatuses(next)
    },
    [],
  )
  const resolvedChannelKeysByIdentityKeyRef = useRef<
    Record<string, Record<number, string>>
  >({})
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
    if (managedSiteType === SITE_TYPES.OCTOPUS) {
      return [
        managedSiteType,
        (octopusBaseUrl ?? "").trim(),
        (octopusUsername ?? "").trim(),
        hashStringForCache((octopusPassword ?? "").trim()),
      ].join("|")
    }

    if (managedSiteType === SITE_TYPES.DONE_HUB) {
      return [
        managedSiteType,
        (doneHubBaseUrl ?? "").trim(),
        (doneHubUserId ?? "").trim(),
        hashStringForCache((doneHubAdminToken ?? "").trim()),
      ].join("|")
    }

    if (managedSiteType === SITE_TYPES.VELOERA) {
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
  const tokenLoadErrorCategoriesRef = useRef<
    Record<string, ProductAnalyticsErrorCategory>
  >({})

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
      updateManagedSiteTokenStatuses((prev) => {
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
    [updateManagedSiteTokenStatuses],
  )

  const invalidateManagedSiteStatusesForAccount = useCallback(
    (accountId: string) => {
      invalidateManagedSiteStatuses((identityKey) =>
        isManagedSiteStatusIdentityForAccount(identityKey, accountId),
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

  const mergeResolvedChannelKeysForIdentity = useCallback(
    (identityKey: string, resolvedChannelKeysById?: Record<number, string>) => {
      if (
        !resolvedChannelKeysById ||
        Object.keys(resolvedChannelKeysById).length === 0
      ) {
        return
      }

      resolvedChannelKeysByIdentityKeyRef.current = {
        ...resolvedChannelKeysByIdentityKeyRef.current,
        [identityKey]: {
          ...(resolvedChannelKeysByIdentityKeyRef.current[identityKey] ?? {}),
          ...resolvedChannelKeysById,
        },
      }
    },
    [],
  )

  const runManagedSiteStatusChecks = useCallback(
    async (params: {
      tokens: AccountToken[]
      targets?: ManagedSiteStatusCheckTargetInput[]
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
        targets: explicitTargets = [],
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
            resolvedChannelKeysByIdentityKey[identityKey] ??
            resolvedChannelKeysByIdentityKeyRef.current[identityKey],
        })
      }

      for (const targetInput of explicitTargets) {
        const cacheKey = [
          targetInput.identityKey,
          managedSiteConfigFingerprint,
        ].join("|")
        const existingEntry =
          managedSiteTokenStatusesRef.current[targetInput.identityKey]

        if (!force && existingEntry?.cacheKey === cacheKey) {
          continue
        }

        uniqueTargets.set(targetInput.identityKey, {
          token: targetInput.token,
          account: targetInput.account,
          identityKey: targetInput.identityKey,
          cacheKey,
          resolvedChannelKeysById:
            resolvedChannelKeysByIdentityKey[targetInput.identityKey] ??
            resolvedChannelKeysByIdentityKeyRef.current[
              targetInput.identityKey
            ],
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

      updateManagedSiteTokenStatuses((prev) => {
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
            const displayResult = toDisplayManagedSiteTokenStatusResult(result)

            if (!isMountedRef.current) {
              return
            }

            const latestEntry =
              managedSiteTokenStatusesRef.current[target.identityKey]

            if (
              !latestEntry ||
              latestEntry.cacheKey !== target.cacheKey ||
              latestEntry.runId !== runId
            ) {
              continue
            }

            resultsByIdentityKey[target.identityKey] = displayResult

            updateManagedSiteTokenStatuses((prev) => {
              const currentEntry = prev[target.identityKey]

              if (
                !currentEntry ||
                currentEntry.cacheKey !== target.cacheKey ||
                currentEntry.runId !== runId
              ) {
                return prev
              }

              mergeResolvedChannelKeysForIdentity(
                target.identityKey,
                result.resolvedChannelKeysById,
              )

              return {
                ...prev,
                [target.identityKey]: {
                  cacheKey: target.cacheKey,
                  runId,
                  isChecking: false,
                  result: displayResult,
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
      managedSiteConfigFingerprint,
      mergeResolvedChannelKeysForIdentity,
      updateManagedSiteTokenStatuses,
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
    }): Promise<TokenLoadStatus | null> => {
      const { accountId, loadEpoch, toastOnError } = params
      const account = accountById.get(accountId)
      if (!account) return null

      const requestEpoch = getNextAccountRequestEpoch(accountId)

      if (!isEpochActive(loadEpoch)) return null
      invalidateManagedSiteStatusesForAccount(accountId)
      setServiceCredentials((prev) => ({
        ...prev,
        [accountId]: {
          status: "idle",
          credential: undefined,
          errorMessage: undefined,
          isRotating: false,
        },
      }))
      setTokenInventories((prev) => ({
        ...prev,
        [accountId]: {
          status: "loading",
          tokens: prev[accountId]?.tokens ?? [],
          errorMessage: undefined,
          errorCategory: undefined,
        },
      }))

      try {
        const { keyManagement, serviceCredential, request } =
          createDisplayAccountApiContext(account)

        if (!keyManagement && serviceCredential) {
          setServiceCredentials((prev) => ({
            ...prev,
            [accountId]: {
              status: "loading",
              credential: prev[accountId]?.credential,
              errorMessage: undefined,
              isRotating: false,
            },
          }))
          const credential = await serviceCredential.fetch(
            toApiServiceRequest(request),
          )

          if (!isEpochActive(loadEpoch)) return null
          if (!isLatestAccountRequest(accountId, requestEpoch)) return null

          setServiceCredentials((prev) => ({
            ...prev,
            [accountId]: {
              status: "loaded",
              credential,
              errorMessage: undefined,
              isRotating: false,
            },
          }))
          setTokenInventories((prev) => ({
            ...prev,
            [accountId]: {
              status: "loaded",
              tokens: [],
              errorMessage: undefined,
              errorCategory: undefined,
            },
          }))
          delete tokenLoadErrorCategoriesRef.current[accountId]
          const runtimeKey = buildServiceCredentialRuntimeKey(
            account,
            credential,
            {
              canRotate: typeof serviceCredential.rotate === "function",
            },
          )
          void runManagedSiteStatusChecks({
            tokens: [],
            targets: [
              buildServiceCredentialManagedSiteStatusTarget(
                account,
                runtimeKey,
              ),
            ],
          })
          return "loaded"
        }

        const tokens = await requireDisplayAccountKeyManagement(
          account,
          keyManagement,
        ).fetchTokens(request)

        if (!isEpochActive(loadEpoch)) return null
        if (!isLatestAccountRequest(accountId, requestEpoch)) return null

        if (!Array.isArray(tokens)) {
          const errorMessage = loadFailedMessageRef.current
          const errorCategory = PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
          tokenLoadErrorCategoriesRef.current[accountId] = errorCategory
          setTokenInventories((prev) => ({
            ...prev,
            [accountId]: {
              status: "error",
              tokens: prev[accountId]?.tokens ?? [],
              errorMessage,
              errorCategory,
            },
          }))
          if (toastOnError) {
            toast.error(errorMessage)
          }
          return "error"
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
            errorCategory: undefined,
          },
        }))
        delete tokenLoadErrorCategoriesRef.current[accountId]
        return "loaded"
      } catch (error) {
        if (!isEpochActive(loadEpoch)) return null
        if (!isLatestAccountRequest(accountId, requestEpoch)) return null

        const errorMessage =
          getErrorMessage(error) || loadFailedMessageRef.current
        const errorCategory =
          resolveProductAnalyticsErrorCategoryFromError(error)
        tokenLoadErrorCategoriesRef.current[accountId] = errorCategory
        logger.error("获取账号密钥失败", errorMessage)
        setServiceCredentials((prev) => {
          const credentialState = prev[accountId]
          if (!credentialState || credentialState.status === "idle") {
            return prev
          }

          return {
            ...prev,
            [accountId]: {
              ...credentialState,
              status: "error",
              errorMessage,
              isRotating: false,
            },
          }
        })
        setTokenInventories((prev) => ({
          ...prev,
          [accountId]: {
            status: "error",
            tokens: prev[accountId]?.tokens ?? [],
            errorMessage,
            errorCategory,
          },
        }))
        if (toastOnError) {
          toast.error(errorMessage)
        }
        return "error"
      }
    },
    [
      accountById,
      getNextAccountRequestEpoch,
      invalidateManagedSiteStatusesForAccount,
      isEpochActive,
      isLatestAccountRequest,
      runManagedSiteStatusChecks,
    ],
  )

  /**
   * Loads tokens for multiple accounts, with light concurrency control:
   * - accounts with the same normalized origin are loaded sequentially
   * - different origins load concurrently
   */
  const loadTokensForAccounts = useCallback(
    async (params: {
      accountIds: string[]
      loadEpoch: number
    }): Promise<TokenLoadAggregateResult> => {
      const { accountIds, loadEpoch } = params
      tokenLoadErrorCategoriesRef.current = {}
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
          const statuses: TokenLoadStatus[] = []
          for (const accountId of originAccountIds) {
            if (!isEpochActive(loadEpoch)) return statuses
            const status = await loadTokensForAccount({
              accountId,
              loadEpoch,
              toastOnError: false,
            })
            if (status === "loaded" || status === "error") {
              statuses.push(status)
            }
          }
          return statuses
        }),
      )

      let successCount = 0
      let failureCount = 0
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          successCount += result.value.filter(
            (status) => status === "loaded",
          ).length
          failureCount += result.value.filter(
            (status) => status === "error",
          ).length
          return
        }
        logger.error("All-accounts token load worker failed unexpectedly", {
          origin: originEntries[index]?.[0] ?? "unknown",
          error: result.reason,
        })
        failureCount +=
          accountsByOrigin.get(originEntries[index]?.[0] ?? "")?.length ?? 0
      })
      const failureCategories = targetAccounts
        .map((account) => tokenLoadErrorCategoriesRef.current[account.id])
        .filter(
          (category): category is ProductAnalyticsErrorCategory =>
            category !== undefined,
        )
      const nonUnknownFailureCategory = failureCategories.find(
        (category) => category !== PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      )
      return {
        successCount,
        failureCount,
        errorCategory: nonUnknownFailureCategory ?? failureCategories[0],
      }
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

      const tracker = startProductAnalyticsAction(
        keyManagementAnalyticsContext(
          PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccountTokens,
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementHeader,
        ),
      )
      const loadEpoch = startNewLoadEpoch()
      setVisibleKeys(new Set())
      setResolvedVisibleKeys({})
      setResolvingVisibleKeys(new Set())

      if (targetAccountId === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE) {
        const targetAccountIds = enabledDisplayData.map((account) => account.id)
        setTokenInventories((prev) => {
          const next: Record<string, TokenInventoryState> = {}
          for (const account of enabledDisplayData) {
            next[account.id] = {
              ...(prev[account.id] ?? {
                status: "idle",
                tokens: [],
              }),
              errorCategory: undefined,
            }
          }
          return next
        })
        setServiceCredentials((prev) => {
          const next: Record<string, ServiceCredentialState> = {}
          for (const account of enabledDisplayData) {
            next[account.id] = prev[account.id] ?? {
              status: "idle",
            }
          }
          return next
        })
        const loadResult = await loadTokensForAccounts({
          accountIds: targetAccountIds,
          loadEpoch,
        })
        if (!isEpochActive(loadEpoch)) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
            insights: {
              mode: PRODUCT_ANALYTICS_MODE_IDS.All,
              itemCount: targetAccountIds.length,
            },
          })
          return
        }
        const successCount = loadResult.successCount
        const failureCount = loadResult.failureCount
        tracker.complete(
          failureCount > 0
            ? PRODUCT_ANALYTICS_RESULTS.Failure
            : PRODUCT_ANALYTICS_RESULTS.Success,
          {
            ...(failureCount > 0 &&
            loadResult.errorCategory &&
            loadResult.errorCategory !==
              PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
              ? { errorCategory: loadResult.errorCategory }
              : {}),
            insights: {
              mode: PRODUCT_ANALYTICS_MODE_IDS.All,
              itemCount: targetAccountIds.length,
              successCount,
              failureCount,
            },
          },
        )
        return
      }

      if (!accountById.get(targetAccountId)) {
        setTokenInventories({})
        setServiceCredentials({})
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
          },
        })
        return
      }

      setTokenInventories((prev) => ({
        ...prev,
        [targetAccountId]: prev[targetAccountId] ?? {
          status: "idle",
          tokens: [],
        },
      }))
      setServiceCredentials((prev) => ({
        ...prev,
        [targetAccountId]: prev[targetAccountId] ?? {
          status: "idle",
        },
      }))

      const status = await loadTokensForAccount({
        accountId: targetAccountId,
        loadEpoch,
        toastOnError: true,
      })
      const result =
        status === "loaded"
          ? PRODUCT_ANALYTICS_RESULTS.Success
          : status === null
            ? PRODUCT_ANALYTICS_RESULTS.Skipped
            : PRODUCT_ANALYTICS_RESULTS.Failure
      const errorCategory =
        result === PRODUCT_ANALYTICS_RESULTS.Failure
          ? tokenLoadErrorCategoriesRef.current[targetAccountId] ??
            tokenInventoriesRef.current[targetAccountId]?.errorCategory ??
            PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
          : undefined
      tracker.complete(result, {
        ...(errorCategory &&
        errorCategory !== PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
          ? { errorCategory }
          : result === PRODUCT_ANALYTICS_RESULTS.Failure
            ? { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown }
            : {}),
        insights: {
          mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        },
      })
    },
    [
      accountById,
      enabledDisplayData,
      selectedAccount,
      loadTokensForAccount,
      loadTokensForAccounts,
      startNewLoadEpoch,
      isEpochActive,
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
    const tracker = startProductAnalyticsAction(
      keyManagementAnalyticsContext(
        PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccountTokens,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementHeader,
      ),
    )
    const loadResult = await loadTokensForAccounts({
      accountIds: failedAccountIds,
      loadEpoch: selectionEpochRef.current,
    })
    const successCount = loadResult.successCount
    const failureCount = loadResult.failureCount
    tracker.complete(
      failureCount > 0
        ? PRODUCT_ANALYTICS_RESULTS.Failure
        : PRODUCT_ANALYTICS_RESULTS.Success,
      {
        ...(failureCount > 0 &&
        loadResult.errorCategory &&
        loadResult.errorCategory !== PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
          ? { errorCategory: loadResult.errorCategory }
          : {}),
        insights: {
          mode: PRODUCT_ANALYTICS_MODE_IDS.RetryFailed,
          itemCount: failedAccountIds.length,
          successCount,
          failureCount,
        },
      },
    )
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
      if (allAccountsFilterAccountIds.length > 0) {
        setAllAccountsFilterAccountIds([])
      }
      return
    }

    const nextAccountIds = allAccountsFilterAccountIds.filter((accountId) =>
      accountById.get(accountId),
    )
    if (nextAccountIds.length !== allAccountsFilterAccountIds.length) {
      setAllAccountsFilterAccountIds(nextAccountIds)
    }
  }, [accountById, allAccountsFilterAccountIds, selectedAccount])

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
      setServiceCredentials({})
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
      if (allAccountsFilterAccountIds.length === 0) {
        return allTokens
      }

      const selectedAccountIds = new Set(allAccountsFilterAccountIds)
      const scopedTokens = allTokens.filter((token) =>
        selectedAccountIds.has(token.accountId),
      )
      return scopedTokens
    }

    return tokenInventories[selectedAccount]?.tokens ?? []
  }, [
    allAccountsFilterAccountIds,
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

  const entries = useMemo((): KeyManagementEntry[] => {
    if (!selectedAccount) return []

    const selectedAccountIds =
      isAllAccountsMode && allAccountsFilterAccountIds.length > 0
        ? new Set(allAccountsFilterAccountIds)
        : null
    const accountCandidates = isAllAccountsMode
      ? enabledDisplayData
      : accountById.get(selectedAccount)
        ? [accountById.get(selectedAccount)!]
        : []

    const tokenEntries: KeyManagementEntry[] = tokens
      .map((token): KeyManagementEntry | null => {
        const account = accountById.get(token.accountId)
        if (!account) return null
        return buildAccountTokenKeyManagementEntry(account, token)
      })
      .filter((entry): entry is KeyManagementEntry => entry !== null)

    const serviceCredentialEntries = accountCandidates
      .filter(
        (account) =>
          selectedAccountIds === null || selectedAccountIds.has(account.id),
      )
      .map((account): KeyManagementEntry | null => {
        return buildServiceCredentialKeyManagementEntry({
          account,
          serviceCredential: serviceCredentials[account.id],
          canRotate:
            typeof createDisplayAccountApiContext(account).serviceCredential
              ?.rotate === "function",
        })
      })
      .filter((entry): entry is KeyManagementEntry => entry !== null)

    return [...serviceCredentialEntries, ...tokenEntries]
  }, [
    accountById,
    allAccountsFilterAccountIds,
    enabledDisplayData,
    isAllAccountsMode,
    selectedAccount,
    serviceCredentials,
    tokens,
  ])

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (isAccountTokenRuntimeKey(entry.runtimeKey)) {
        return tokenMatchesSearch(entry.runtimeKey.token, normalizedSearchTerm)
      }

      return serviceCredentialMatchesSearch(
        entry.runtimeKey,
        normalizedSearchTerm,
      )
    })
  }, [entries, normalizedSearchTerm])

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

  const currentAccountLoadError = useMemo(() => {
    if (
      !selectedAccount ||
      selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
    ) {
      return null
    }

    const tokenInventory = tokenInventories[selectedAccount]
    if (tokenInventory?.status === "error") {
      return tokenInventory.errorMessage ?? loadFailedMessage
    }

    const serviceCredential = serviceCredentials[selectedAccount]
    if (serviceCredential?.status === "error") {
      return serviceCredential.errorMessage ?? loadFailedMessage
    }

    return null
  }, [loadFailedMessage, selectedAccount, serviceCredentials, tokenInventories])

  const accountSummaryItems = useMemo(() => {
    if (!isAllAccountsMode) return []

    const countMap = new Map<string, number>()
    filteredEntries.forEach((entry) => {
      const accountId = entry.runtimeKey.accountId
      countMap.set(accountId, (countMap.get(accountId) ?? 0) + 1)
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
  }, [enabledDisplayData, filteredEntries, isAllAccountsMode, tokenInventories])

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
    const targetTokenCount = statusCheckTokens.length
    const tracker = startProductAnalyticsAction(
      keyManagementAnalyticsContext(
        PRODUCT_ANALYTICS_ACTION_IDS.RefreshManagedSiteTokenStatus,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementHeader,
      ),
    )

    try {
      const results = await runManagedSiteStatusChecks({
        tokens: statusCheckTokens,
        force: true,
      })
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: {
          itemCount: targetTokenCount,
          ...summarizeManagedSiteTokenStatusResults(results, targetTokenCount),
        },
      })
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount: targetTokenCount,
          failureCount: targetTokenCount,
          statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
        },
      })
      throw error
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
    resolvedChannelKeysByIdentityKeyRef.current = {}
    updateManagedSiteTokenStatuses(() => ({}))
  }, [managedSiteConfigFingerprint, updateManagedSiteTokenStatuses])

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
    const tracker = startProductAnalyticsAction(
      keyManagementAnalyticsContext(
        PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKey,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      ),
    )
    try {
      const resolvedToken = await resolveDisplayAccountTokenForSecret(
        account,
        token,
      )
      await navigator.clipboard.writeText(resolvedToken.key)
      toast.success(t("keyManagement:messages.keyCopied", { name: token.name }))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("keyManagement:messages.copyFailed")),
      )
      logger.warn("Failed to copy key to clipboard", error)
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: isClipboardPermissionError(error)
          ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission
          : resolveProductAnalyticsErrorCategoryFromError(error),
      })
    }
  }

  const copyServiceCredential = async (account: DisplaySiteData) => {
    const credential = serviceCredentialsRef.current[account.id]?.credential
    const loadEpoch = selectionEpochRef.current
    const isCopyRequestCurrent = () =>
      isMountedRef.current &&
      isEpochActive(loadEpoch) &&
      serviceCredentialsRef.current[account.id]?.credential === credential

    if (!credential?.key) {
      toast.error(t("keyManagement:messages.copyFailed"))
      return
    }

    try {
      await navigator.clipboard.writeText(credential.key)
      if (!isCopyRequestCurrent()) return
      toast.success(t("keyManagement:messages.serviceCredentialCopied"))
    } catch (error) {
      if (!isCopyRequestCurrent()) return
      toast.error(
        getErrorMessage(error, t("keyManagement:messages.copyFailed")),
      )
      logger.warn("Failed to copy service credential to clipboard", error)
    }
  }

  const rotateServiceCredential = async (account: DisplaySiteData) => {
    const { serviceCredential, request } =
      createDisplayAccountApiContext(account)
    const loadEpoch = selectionEpochRef.current
    const requestEpoch = getNextAccountRequestEpoch(account.id)

    const isRotateRequestCurrent = () =>
      isMountedRef.current &&
      isEpochActive(loadEpoch) &&
      isLatestAccountRequest(account.id, requestEpoch)

    if (!serviceCredential?.rotate) {
      toast.error(t("keyManagement:serviceCredential.rotateUnsupported"))
      return
    }

    setServiceCredentials((prev) => ({
      ...prev,
      [account.id]: {
        ...(prev[account.id] ?? { status: "idle" }),
        isRotating: true,
        errorMessage: undefined,
      },
    }))

    try {
      const credential = await serviceCredential.rotate(
        toApiServiceRequest(request),
      )
      if (!isRotateRequestCurrent()) return

      setServiceCredentials((prev) => ({
        ...prev,
        [account.id]: {
          status: "loaded",
          credential,
          errorMessage: undefined,
          isRotating: false,
        },
      }))
      const runtimeKey = buildServiceCredentialRuntimeKey(account, credential, {
        canRotate: true,
      })
      invalidateManagedSiteStatuses(
        (identityKey) =>
          identityKey === buildAccountRuntimeKeyEntryIdentityKey(runtimeKey.id),
      )
      void runManagedSiteStatusChecks({
        tokens: [],
        targets: [
          buildServiceCredentialManagedSiteStatusTarget(account, runtimeKey),
        ],
        force: true,
      })
      toast.success(t("keyManagement:messages.serviceCredentialRotated"))
    } catch (error) {
      if (!isRotateRequestCurrent()) return

      const errorMessage =
        getErrorMessage(error) ||
        t("keyManagement:messages.serviceCredentialRotateFailed")
      setServiceCredentials((prev) => ({
        ...prev,
        [account.id]: {
          ...(prev[account.id] ?? { status: "error" }),
          status: "error",
          errorMessage,
          isRotating: false,
        },
      }))
      toast.error(errorMessage)
      logger.warn("Failed to rotate service credential", error)
    }
  }

  const getVisibleTokenKey = useCallback(
    (token: Pick<AccountToken, "accountId" | "id" | "key">) => {
      const tokenIdentityKey = buildTokenIdentityKey(token.accountId, token.id)
      const account = accountById.get(token.accountId)
      return formatOptionalSkPrefixSiteTokenAuthKey(
        resolvedVisibleKeys[tokenIdentityKey] ?? token.key,
        account?.siteType,
      )
    },
    [accountById, resolvedVisibleKeys],
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
    const tracker = startProductAnalyticsAction(
      keyManagementAnalyticsContext(
        PRODUCT_ANALYTICS_ACTION_IDS.RevealAccountTokenKey,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      ),
    )
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
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("keyManagement:messages.revealFailed")),
      )
      logger.warn("Failed to resolve key for visibility", error)
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
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

  const removeTokenFromInventory = (
    token: Pick<AccountToken, "accountId" | "id">,
  ) => {
    setTokenInventories((prev) => {
      const inventory = prev[token.accountId]
      if (!inventory) {
        return prev
      }

      const nextTokens = inventory.tokens.filter((item) => item.id !== token.id)
      if (nextTokens.length === inventory.tokens.length) {
        return prev
      }

      return {
        ...prev,
        [token.accountId]: {
          ...inventory,
          tokens: nextTokens,
        },
      }
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
    const tracker = startProductAnalyticsAction(
      keyManagementAnalyticsContext(
        PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccountToken,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      ),
    )
    try {
      const account = enabledDisplayData.find(
        (acc) => acc.id === token.accountId,
      )
      if (!account) {
        toast.error(t("keyManagement:messages.accountNotFound"))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
        return
      }

      const { keyManagement, request } = createDisplayAccountApiContext(account)
      await requireDisplayAccountKeyManagement(
        account,
        keyManagement,
      ).deleteToken({
        request,
        tokenId: token.id,
      })
      clearTokenVisibilityState(token)
      removeTokenFromInventory(token)
      invalidateManagedSiteStatusForToken(token)
      toast.success(
        t("keyManagement:messages.deleteSuccess", { name: token.name }),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)

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
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
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
    serviceCredentials,
    currentAccountLoadError,
    tokenLoadProgress,
    failedAccounts,
    accountSummaryItems,
    managedSiteTokenStatuses,
    isManagedSiteChannelStatusSupported,
    isManagedSiteStatusRefreshing,
    allAccountsFilterAccountIds,
    setAllAccountsFilterAccountIds,
    loadTokens,
    entries,
    filteredTokens,
    filteredEntries,
    getVisibleTokenKey,
    refreshManagedSiteTokenStatuses,
    refreshManagedSiteTokenStatusForToken,
    copyKey,
    copyServiceCredential,
    rotateServiceCredential,
    toggleKeyVisibility,
    retryFailedAccounts,
    handleAddToken,
    handleCloseAddToken,
    handleEditToken,
    handleDeleteToken,
  }
}
