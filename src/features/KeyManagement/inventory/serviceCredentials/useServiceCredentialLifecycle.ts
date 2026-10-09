import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/features/KeyManagement/constants"
import {
  KEY_MANAGEMENT_LOAD_STATUSES,
  type ServiceCredentialState,
} from "~/features/KeyManagement/types"
import toast from "~/lib/notify"
import { createDisplayAccountApiContext } from "~/services/accounts/utils/apiServiceRequest"
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

/** Owns authentication-scoped singleton credential reads, rotation and disclosure. */
export function useServiceCredentialLifecycle(
  serviceAccounts: DisplaySiteData[],
  selectedAccount: string,
) {
  const { t } = useTranslation(["keyManagement", "messages"])
  const [serviceCredentials, setServiceCredentials] = useState<
    Record<string, ServiceCredentialState>
  >({})
  const statesRef = useRef(serviceCredentials)
  const boundaryRef = useRef<LoadBoundary | null>(null)
  const sourcesRef = useRef(new Map<string, DisplaySiteData>())
  const requestIdsRef = useRef(new Map<string, number>())
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

  return {
    serviceCredentials,
    refreshServiceCredentials,
    retryFailedAccounts,
    copyServiceCredential,
    rotateServiceCredential,
  }
}
