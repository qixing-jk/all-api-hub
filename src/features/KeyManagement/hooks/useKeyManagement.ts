import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import { useAccountData } from "~/hooks/useAccountData"
import toast from "~/lib/notify"
import { createDisplayAccountApiContext } from "~/services/accounts/utils/apiServiceRequest"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  startProductAnalyticsAction,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsModeId,
} from "~/services/productAnalytics/contracts"
import {
  createAutomaticProtectionBypassExecution,
  withProtectionBypassUserCommand,
} from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "../constants"
import {
  KEY_MANAGEMENT_LOAD_STATUSES,
  type KeyManagementAccountSummaryItem,
  type KeyManagementEntry,
  type ServiceCredentialState,
} from "../types"
import { buildServiceCredentialKeyManagementEntry } from "../utils"

/** Bind pending reads and secret actions to the account authentication snapshot. */
const securitySnapshot = (account: DisplaySiteData) =>
  JSON.stringify([
    account.id,
    account.siteType,
    account.baseUrl,
    account.authType,
    account.token,
    account.userId,
    account.cookieAuthSessionCookie,
  ])

type LoadBoundary = {
  snapshot: string
  controller: AbortController
  queues: Map<string, Promise<void>>
}

/** Own account selection and singleton credentials; native inventory has its own controller. */
export function useKeyManagement(routeParams?: Record<string, string>) {
  const { t } = useTranslation(["keyManagement", "messages"])
  const { enabledDisplayData } = useAccountData()
  const [selectedAccount, setSelectedAccount] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [allAccountsFilterAccountIds, setAllAccountsFilterAccountIds] =
    useState<string[]>([])
  const [serviceCredentials, setServiceCredentials] = useState<
    Record<string, ServiceCredentialState>
  >({})
  const statesRef = useRef(serviceCredentials)
  const boundaryRef = useRef<LoadBoundary | null>(null)
  const sourcesRef = useRef(new Map<string, DisplaySiteData>())
  const requestIdsRef = useRef(new Map<string, number>())
  const isAllAccountsMode =
    selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
  const accountById = useMemo(
    () => new Map(enabledDisplayData.map((account) => [account.id, account])),
    [enabledDisplayData],
  )
  const scopedAccounts = useMemo(
    () =>
      isAllAccountsMode
        ? enabledDisplayData
        : accountById.has(selectedAccount)
          ? [accountById.get(selectedAccount)!]
          : [],
    [accountById, enabledDisplayData, isAllAccountsMode, selectedAccount],
  )
  const serviceAccounts = useMemo(
    () =>
      scopedAccounts.filter(
        (account) =>
          getSiteTypeCapabilities(account.siteType).account?.serviceCredential,
      ),
    [scopedAccounts],
  )
  const loadSnapshot = JSON.stringify([
    selectedAccount,
    serviceAccounts.map(securitySnapshot),
  ])

  const update = useCallback((next: Record<string, ServiceCredentialState>) => {
    statesRef.current = next
    setServiceCredentials(next)
  }, [])

  const load = useCallback(
    async (
      accountIds: readonly string[],
      execution: ProtectionBypassExecution,
    ) => {
      const boundary = boundaryRef.current
      if (!boundary || boundary.controller.signal.aborted) return []
      const pending = accountIds.flatMap((id) => {
        const account = sourcesRef.current.get(id)
        if (!account || statesRef.current[id]?.isRotating) return []
        const requestId = (requestIdsRef.current.get(id) ?? 0) + 1
        requestIdsRef.current.set(id, requestId)
        const current = () =>
          boundaryRef.current === boundary &&
          !boundary.controller.signal.aborted &&
          requestIdsRef.current.get(id) === requestId
        update({
          ...statesRef.current,
          [id]: { status: KEY_MANAGEMENT_LOAD_STATUSES.Loading },
        })
        const origin = normalizeUrlForOriginKey(account.baseUrl, {
          stripTrailingSlashes: false,
        })
        const task = (boundary.queues.get(origin) ?? Promise.resolve()).then(
          async () => {
            if (!current()) return null
            try {
              const { serviceCredential, request } =
                createDisplayAccountApiContext(account)
              if (!serviceCredential)
                throw new Error(t("keyManagement:messages.loadFailed"))
              const credential = await serviceCredential.fetch({
                ...request,
                abortSignal: boundary.controller.signal,
                protectionBypassExecution: execution,
              })
              if (!current()) return null
              update({
                ...statesRef.current,
                [id]: {
                  status: KEY_MANAGEMENT_LOAD_STATUSES.Loaded,
                  credential,
                },
              })
              return { success: true }
            } catch (error) {
              if (!current()) return null
              update({
                ...statesRef.current,
                [id]: {
                  status: KEY_MANAGEMENT_LOAD_STATUSES.Error,
                  errorMessage: getErrorMessage(error) || undefined,
                },
              })
              return {
                success: false,
                errorCategory:
                  resolveProductAnalyticsErrorCategoryFromError(error),
              }
            }
          },
        )
        boundary.queues.set(
          origin,
          task.then(() => undefined),
        )
        return [task]
      })
      const results = await Promise.all(pending)
      return results.filter((result) => result !== null)
    },
    [t, update],
  )

  const abortBoundary = useCallback(
    () => boundaryRef.current?.controller.abort(),
    [],
  )
  useLayoutEffect(() => abortBoundary, [abortBoundary])

  useLayoutEffect(() => {
    sourcesRef.current = new Map(
      serviceAccounts.map((account) => [account.id, account]),
    )
    if (
      boundaryRef.current?.snapshot === loadSnapshot &&
      !boundaryRef.current.controller.signal.aborted
    )
      return
    boundaryRef.current?.controller.abort()
    boundaryRef.current = {
      snapshot: loadSnapshot,
      controller: new AbortController(),
      queues: new Map(),
    }
    update({})
    void load(
      serviceAccounts.map((account) => account.id),
      createAutomaticProtectionBypassExecution(
        PROTECTION_BYPASS_FEATURES.KeyManagement,
        PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
        PROTECTION_BYPASS_SURFACES.Options,
      ),
    )
  }, [load, loadSnapshot, serviceAccounts, update])

  useEffect(() => {
    if (!selectedAccount) return
    if (
      isAllAccountsMode
        ? enabledDisplayData.length === 0
        : !accountById.has(selectedAccount)
    )
      setSelectedAccount("")
  }, [
    accountById,
    enabledDisplayData.length,
    isAllAccountsMode,
    selectedAccount,
  ])

  useEffect(() => {
    setAllAccountsFilterAccountIds((current) => {
      const next = isAllAccountsMode
        ? current.filter((id) => accountById.has(id))
        : []
      return next.length === current.length ? current : next
    })
  }, [accountById, isAllAccountsMode])

  const isRouteControlled = routeParams !== undefined
  useEffect(() => {
    if (!isRouteControlled) return
    const requested = routeParams?.accountId?.trim()
    if (!requested) {
      setSelectedAccount("")
      return
    }
    if (!enabledDisplayData.length) return
    setSelectedAccount(
      requested === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE ||
        accountById.has(requested)
        ? requested
        : "",
    )
  }, [
    accountById,
    enabledDisplayData.length,
    isRouteControlled,
    routeParams?.accountId,
  ])

  const refresh = useCallback(
    async (
      ids: string[],
      mode: ProductAnalyticsModeId,
      execution?: ProtectionBypassExecution,
    ) => {
      if (!ids.length) return
      const tracker = startProductAnalyticsAction({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccountTokens,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementHeader,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      const boundary = boundaryRef.current
      const work = async (protection: ProtectionBypassExecution) =>
        load(ids, protection)
      const results = execution
        ? await work(execution)
        : await withProtectionBypassUserCommand(
            PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
            PROTECTION_BYPASS_SURFACES.Options,
            work,
          )
      const failures = results.filter((result) => !result.success)
      void Promise.resolve(
        tracker.complete(
          boundaryRef.current !== boundary || results.length < ids.length
            ? PRODUCT_ANALYTICS_RESULTS.Skipped
            : failures.length
              ? PRODUCT_ANALYTICS_RESULTS.Failure
              : PRODUCT_ANALYTICS_RESULTS.Success,
          {
            ...(failures[0]
              ? { errorCategory: failures[0].errorCategory }
              : {}),
            insights: {
              mode,
              itemCount: ids.length,
              successCount: results.length - failures.length,
              failureCount: failures.length,
            },
          },
        ),
      ).catch(() => undefined)
    },
    [load],
  )

  const refreshServiceCredentials = useCallback(
    (
      accountId?: string,
      options?: { protectionBypassExecution?: ProtectionBypassExecution },
    ) => {
      const target = accountId ?? selectedAccount
      const ids =
        target === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
          ? [...sourcesRef.current.keys()]
          : sourcesRef.current.has(target)
            ? [target]
            : []
      return refresh(
        ids,
        target === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
          ? PRODUCT_ANALYTICS_MODE_IDS.All
          : PRODUCT_ANALYTICS_MODE_IDS.Single,
        options?.protectionBypassExecution,
      )
    },
    [refresh, selectedAccount],
  )

  const retryFailedAccounts = useCallback(
    () =>
      refresh(
        [...sourcesRef.current.keys()].filter(
          (id) =>
            statesRef.current[id]?.status ===
            KEY_MANAGEMENT_LOAD_STATUSES.Error,
        ),
        PRODUCT_ANALYTICS_MODE_IDS.RetryFailed,
      ),
    [refresh],
  )

  const copyServiceCredential = async (account: DisplaySiteData) => {
    const boundary = boundaryRef.current
    const source = sourcesRef.current.get(account.id)
    if (
      !source ||
      !boundary ||
      boundary.controller.signal.aborted ||
      securitySnapshot(source) !== securitySnapshot(account)
    )
      return
    const credential = statesRef.current[account.id]?.credential
    const current = () =>
      boundaryRef.current === boundary &&
      !boundary?.controller.signal.aborted &&
      statesRef.current[account.id]?.credential === credential
    if (!credential?.isAuthenticated || !credential.key) {
      toast.error(t("keyManagement:messages.copyFailed"))
      return
    }
    try {
      await navigator.clipboard.writeText(credential.key)
      if (current())
        toast.success(t("keyManagement:messages.serviceCredentialCopied"))
    } catch {
      if (current()) toast.error(t("keyManagement:messages.copyFailed"))
    }
  }

  const rotateServiceCredential = async (account: DisplaySiteData) => {
    const source = sourcesRef.current.get(account.id)
    const boundary = boundaryRef.current
    if (
      !source ||
      !boundary ||
      boundary.controller.signal.aborted ||
      securitySnapshot(source) !== securitySnapshot(account) ||
      statesRef.current[account.id]?.isRotating
    )
      return
    const { serviceCredential, request } =
      createDisplayAccountApiContext(source)
    if (!serviceCredential?.rotate) {
      toast.error(t("keyManagement:serviceCredential.rotateUnsupported"))
      return
    }
    const requestId = (requestIdsRef.current.get(account.id) ?? 0) + 1
    requestIdsRef.current.set(account.id, requestId)
    const current = () =>
      boundaryRef.current === boundary &&
      !boundary.controller.signal.aborted &&
      requestIdsRef.current.get(account.id) === requestId
    update({
      ...statesRef.current,
      [account.id]: {
        ...statesRef.current[account.id],
        status: KEY_MANAGEMENT_LOAD_STATUSES.Loaded,
        isRotating: true,
        errorMessage: undefined,
      },
    })
    try {
      const origin = normalizeUrlForOriginKey(source.baseUrl, {
        stripTrailingSlashes: false,
      })
      const rotation = (boundary.queues.get(origin) ?? Promise.resolve()).then(
        () =>
          current()
            ? serviceCredential.rotate!({
                ...request,
                abortSignal: boundary.controller.signal,
              })
            : undefined,
      )
      boundary.queues.set(
        origin,
        rotation.then(
          () => undefined,
          () => undefined,
        ),
      )
      const credential = await rotation
      if (!current() || !credential) return
      update({
        ...statesRef.current,
        [account.id]: {
          status: KEY_MANAGEMENT_LOAD_STATUSES.Loaded,
          credential,
        },
      })
      toast.success(t("keyManagement:messages.serviceCredentialRotated"))
    } catch (error) {
      if (!current()) return
      update({
        ...statesRef.current,
        [account.id]: {
          ...statesRef.current[account.id],
          status: KEY_MANAGEMENT_LOAD_STATUSES.Error,
          errorKind: "rotation",
          errorMessage: getErrorMessage(error) || undefined,
          isRotating: false,
        },
      })
      toast.error(t("keyManagement:messages.serviceCredentialRotateFailed"))
    }
  }

  const entries = useMemo(
    (): KeyManagementEntry[] =>
      serviceAccounts.flatMap((account) => {
        const entry = buildServiceCredentialKeyManagementEntry({
          account,
          serviceCredential: serviceCredentials[account.id],
          canRotate: Boolean(
            getSiteTypeCapabilities(account.siteType).account?.serviceCredential
              ?.rotate,
          ),
        })
        return entry ? [entry] : []
      }),
    [serviceAccounts, serviceCredentials],
  )
  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (!isAllAccountsMode ||
            !allAccountsFilterAccountIds.length ||
            allAccountsFilterAccountIds.includes(entry.runtimeKey.accountId)) &&
          entry.runtimeKey.label
            .toLowerCase()
            .includes(searchTerm.trim().toLowerCase()),
      ),
    [entries, searchTerm, isAllAccountsMode, allAccountsFilterAccountIds],
  )
  const isLoading = serviceAccounts.some((account) => {
    const credential = serviceCredentials[account.id]
    return (
      !credential || credential.status === KEY_MANAGEMENT_LOAD_STATUSES.Loading
    )
  })
  const failedAccounts = serviceAccounts
    .filter((account) => {
      const credential = serviceCredentials[account.id]
      return credential?.status === KEY_MANAGEMENT_LOAD_STATUSES.Error
    })
    .map((account) => {
      const credential = serviceCredentials[account.id]
      return {
        accountId: account.id,
        accountName: account.name,
        ...(credential?.errorMessage
          ? { errorMessage: credential.errorMessage }
          : {}),
      }
    })
  const selectedCapabilities = accountById.has(selectedAccount)
    ? getSiteTypeCapabilities(accountById.get(selectedAccount)!.siteType)
        .account
    : undefined
  const currentAccountUnsupportedKeyManagement = Boolean(
    selectedAccount &&
      !isAllAccountsMode &&
      !selectedCapabilities?.serviceCredential &&
      !selectedCapabilities?.keyResourceManagement,
  )
  const currentAccountLoadError =
    !isAllAccountsMode &&
    serviceCredentials[selectedAccount]?.status ===
      KEY_MANAGEMENT_LOAD_STATUSES.Error
      ? serviceCredentials[selectedAccount].errorMessage ||
        t(
          serviceCredentials[selectedAccount].errorKind === "rotation"
            ? "keyManagement:messages.serviceCredentialRotateFailed"
            : "keyManagement:messages.loadFailed",
        )
      : null
  const tokenLoadProgress = isAllAccountsMode
    ? {
        total: serviceAccounts.length,
        loaded: serviceAccounts.filter(
          (account) =>
            serviceCredentials[account.id]?.status ===
            KEY_MANAGEMENT_LOAD_STATUSES.Loaded,
        ).length,
        error: failedAccounts.length,
        loading: serviceAccounts.filter((account) => {
          const credential = serviceCredentials[account.id]
          return (
            !credential ||
            credential.status === KEY_MANAGEMENT_LOAD_STATUSES.Loading
          )
        }).length,
      }
    : null
  const accountSummaryItems = useMemo(
    (): KeyManagementAccountSummaryItem[] =>
      enabledDisplayData
        .filter(
          (account) =>
            !getSiteTypeCapabilities(account.siteType).account
              ?.keyResourceManagement,
        )
        .map((account) => {
          const supported = Boolean(
            getSiteTypeCapabilities(account.siteType).account
              ?.serviceCredential,
          )
          const state = serviceCredentials[account.id]
          const hasEntry =
            state?.status === KEY_MANAGEMENT_LOAD_STATUSES.Loaded &&
            Boolean(state.credential)
          return {
            accountId: account.id,
            name: account.name,
            hasData: hasEntry,
            isLoading:
              supported &&
              (!state || state.status === KEY_MANAGEMENT_LOAD_STATUSES.Loading),
            count: hasEntry
              ? Number(
                  state!
                    .credential!.label.toLowerCase()
                    .includes(searchTerm.trim().toLowerCase()),
                )
              : supported
                ? null
                : 0,
            ...(!supported
              ? { errorType: "unsupported" as const }
              : state?.status === KEY_MANAGEMENT_LOAD_STATUSES.Error
                ? { errorType: "load-failed" as const }
                : {}),
          }
        }),
    [enabledDisplayData, searchTerm, serviceCredentials],
  )

  return {
    displayData: enabledDisplayData,
    selectedAccount,
    setSelectedAccount,
    searchTerm,
    setSearchTerm,
    allAccountsFilterAccountIds,
    setAllAccountsFilterAccountIds,
    serviceCredentials,
    entries,
    filteredEntries,
    isLoading,
    currentAccountLoadError,
    currentAccountUnsupportedKeyManagement,
    tokenLoadProgress,
    failedAccounts,
    accountSummaryItems,
    refreshServiceCredentials,
    retryFailedAccounts,
    copyServiceCredential,
    rotateServiceCredential,
  }
}
