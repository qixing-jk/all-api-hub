import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import { REQUEST_SCHEDULING_PRIORITIES } from "~/services/apiTransport/requestScheduling"
import { hashProviderCatalogValue } from "~/services/integrations/providerCatalogExport"
import { createManagedSiteOperationContext } from "~/services/managedSites/operationContext"
import { getManagedSiteRuntimeConfigFingerprint } from "~/services/managedSites/runtimeConfig"
import {
  getManagedSiteTokenChannelStatus,
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  resolveManagedSiteTokenChannelStatusWithVerifiedKey,
  type ManagedSiteTokenChannelStatus,
} from "~/services/managedSites/tokenChannelStatus"
import { supportsManagedSiteBaseUrlChannelLookup } from "~/services/managedSites/utils/managedSite"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { createAutomaticProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"

type StatusEntry = {
  cacheKey: string
  runId: number
  isChecking: boolean
  result?: ManagedSiteTokenChannelStatus
}
type RefreshOptions = {
  protectionBypassExecution?: ProtectionBypassExecution
  resolvedChannelKeysByResourceKey?: Record<string, string>
}
type CheckOptions = RefreshOptions & { force?: boolean }

/** Keep channel plaintext in operation refs, outside React state and display results. */
function displayStatus(
  result: Awaited<ReturnType<typeof getManagedSiteTokenChannelStatus>>,
): ManagedSiteTokenChannelStatus {
  const { resolvedChannelKeysByResourceKey: _keys, ...display } = result
  return display
}

/** Check managed-site associations for current runtime keys, including native resources. */
export function useManagedSiteKeyStatuses(
  runtimeKeys: readonly AccountRuntimeKey[],
) {
  const { managedSiteType, preferences } = useUserPreferencesContext()
  const supported = supportsManagedSiteBaseUrlChannelLookup(managedSiteType)
  const configFingerprint = getManagedSiteRuntimeConfigFingerprint(
    preferences,
    managedSiteType,
  )
  const targets = useMemo(
    () =>
      new Map(
        runtimeKeys.map((key) => [
          key.id,
          {
            key,
            cacheKey: hashProviderCatalogValue(
              JSON.stringify([
                key.id,
                key.account,
                key.baseUrl,
                key.secret,
                key.modelAccess,
                configFingerprint,
              ]),
            ),
          },
        ]),
      ),
    [runtimeKeys, configFingerprint],
  )
  const snapshot = JSON.stringify(
    [...targets].map(([id, target]) => [id, target.cacheKey]),
  )
  const targetsRef = useRef(targets)
  const mountedRef = useRef(true)
  const controllersRef = useRef(new Map<string, AbortController>())
  const channelKeysRef = useRef(new Map<string, Record<string, string>>())
  const statesRef = useRef<Record<string, StatusEntry>>({})
  const nextRunRef = useRef(0)
  const refreshCountRef = useRef(0)
  const [states, setStates] = useState<Record<string, StatusEntry>>({})
  const [refreshing, setRefreshing] = useState(false)

  const update = useCallback((next: Record<string, StatusEntry>) => {
    statesRef.current = next
    if (mountedRef.current) setStates(next)
  }, [])

  useLayoutEffect(() => {
    mountedRef.current = true
    const controllers = controllersRef.current
    const channelKeys = channelKeysRef.current
    return () => {
      mountedRef.current = false
      for (const controller of controllers.values()) controller.abort()
      controllers.clear()
      channelKeys.clear()
    }
  }, [])

  useLayoutEffect(() => {
    targetsRef.current = targets
    const next = { ...statesRef.current }
    let changed = false
    for (const [id, state] of Object.entries(next)) {
      if (
        !supported ||
        targets.get(id)?.cacheKey !== state.cacheKey ||
        (state.isChecking && !controllersRef.current.has(id))
      ) {
        controllersRef.current.get(id)?.abort()
        controllersRef.current.delete(id)
        channelKeysRef.current.delete(id)
        delete next[id]
        changed = true
      }
    }
    if (changed) update(next)
  }, [snapshot, supported, targets, update])

  const check = useCallback(
    async (ids: readonly string[], options: CheckOptions = {}) => {
      if (!supported) return {}
      // One operation context per scan: every key in it reuses the channel search
      // and candidate-secret reads that an earlier key's base URL already resolved.
      // Each scan is also fresh, so it never joins a search that predates its start.
      const operationContext = createManagedSiteOperationContext({
        freshChannelSearches: true,
      })
      const queue = ids.flatMap((id) => {
        const target = targetsRef.current.get(id)
        if (
          !target ||
          (!options.force &&
            statesRef.current[id]?.cacheKey === target.cacheKey)
        )
          return []
        controllersRef.current.get(id)?.abort()
        if (options.force) channelKeysRef.current.delete(id)
        const controller = new AbortController()
        controllersRef.current.set(id, controller)
        return [
          {
            ...target,
            id,
            controller,
            runId: ++nextRunRef.current,
            operationContext,
          },
        ]
      })
      if (!queue.length) return {}
      update({
        ...statesRef.current,
        ...Object.fromEntries(
          queue.map((target) => [
            target.id,
            {
              cacheKey: target.cacheKey,
              runId: target.runId,
              isChecking: true,
            },
          ]),
        ),
      })
      const results: Record<string, ManagedSiteTokenChannelStatus> = {}
      await Promise.allSettled(
        Array.from({ length: Math.min(4, queue.length) }, async () => {
          while (queue.length) {
            const target = queue.shift()!
            const current = () =>
              mountedRef.current &&
              !target.controller.signal.aborted &&
              targetsRef.current.get(target.id)?.cacheKey === target.cacheKey &&
              statesRef.current[target.id]?.runId === target.runId
            if (!current()) continue
            let result: Awaited<
              ReturnType<typeof getManagedSiteTokenChannelStatus>
            >
            try {
              result = await getManagedSiteTokenChannelStatus({
                runtimeKey: target.key,
                signal: target.controller.signal,
                requestScheduling: {
                  priority: options.force
                    ? REQUEST_SCHEDULING_PRIORITIES.Foreground
                    : REQUEST_SCHEDULING_PRIORITIES.Background,
                },
                operationContext: target.operationContext,
                resolvedChannelKeysByResourceKey:
                  options.resolvedChannelKeysByResourceKey ??
                  channelKeysRef.current.get(target.id),
                protectionBypassExecution:
                  options.protectionBypassExecution ??
                  createAutomaticProtectionBypassExecution(
                    PROTECTION_BYPASS_FEATURES.KeyManagement,
                    PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
                    PROTECTION_BYPASS_SURFACES.Options,
                  ),
              })
            } catch {
              if (!current()) continue
              result = {
                status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
                reason:
                  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.BACKEND_SEARCH_FAILED,
              }
            } finally {
              if (controllersRef.current.get(target.id) === target.controller)
                controllersRef.current.delete(target.id)
            }
            if (!current()) continue
            if (result.resolvedChannelKeysByResourceKey)
              channelKeysRef.current.set(target.id, {
                ...channelKeysRef.current.get(target.id),
                ...result.resolvedChannelKeysByResourceKey,
              })
            results[target.id] = displayStatus(result)
            update({
              ...statesRef.current,
              [target.id]: {
                cacheKey: target.cacheKey,
                runId: target.runId,
                isChecking: false,
                result: results[target.id],
              },
            })
          }
        }),
      )
      return results
    },
    [supported, update],
  )

  useEffect(() => {
    void check([...targets.keys()])
  }, [snapshot, targets, check])

  const refresh = useCallback(
    async (options?: RefreshOptions) => {
      const ids = [...targetsRef.current.keys()]
      if (!supported || !ids.length) return
      const tracker = startProductAnalyticsAction({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshManagedSiteTokenStatus,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementHeader,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      refreshCountRef.current += 1
      setRefreshing(true)
      try {
        const results = await check(ids, { ...options, force: true })
        const values = Object.values(results)
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: {
            itemCount: ids.length,
            successCount: values.length,
            failureCount: ids.length - values.length,
            statusKind:
              values.length < ids.length ||
              values.some(
                (value) =>
                  value.status !== MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
              )
                ? PRODUCT_ANALYTICS_STATUS_KINDS.Warning
                : PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
          },
        })
      } finally {
        refreshCountRef.current -= 1
        if (mountedRef.current) setRefreshing(refreshCountRef.current > 0)
      }
    },
    [check, supported],
  )

  const refreshKey = useCallback(
    async (key: AccountRuntimeKey, options?: RefreshOptions) =>
      (await check([key.id], { ...options, force: true }))[key.id],
    [check],
  )

  const confirm = useCallback(
    async (
      key: AccountRuntimeKey,
      status: ManagedSiteTokenChannelStatus,
      options: { resourceRef: ManagedResourceRef; channelKey: string },
    ) => {
      const target = targetsRef.current.get(key.id)
      const before = statesRef.current[key.id]
      if (!target || !before || !supported) return
      const resolved = await resolveDisplayAccountRuntimeKeySecret(
        target.key.account,
        target.key,
      )
      if (
        !mountedRef.current ||
        targetsRef.current.get(key.id)?.cacheKey !== target.cacheKey ||
        statesRef.current[key.id]?.runId !== before.runId
      )
        return
      const result = resolveManagedSiteTokenChannelStatusWithVerifiedKey({
        status,
        tokenKey: resolved.secret,
        ...options,
        siteType: managedSiteType,
      })
      if (result.resolvedChannelKeysByResourceKey)
        channelKeysRef.current.set(key.id, {
          ...channelKeysRef.current.get(key.id),
          ...result.resolvedChannelKeysByResourceKey,
        })
      const display = displayStatus(result)
      update({
        ...statesRef.current,
        [key.id]: { ...before, result: display, isChecking: false },
      })
      return display
    },
    [managedSiteType, supported, update],
  )

  return { states, supported, refreshing, refresh, refreshKey, confirm }
}
