import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import toast from "~/lib/notify"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import { CHANNEL_CONFIG_STORAGE_KEYS } from "~/services/core/storageKeys"
import { channelConfigStorage } from "~/services/managedSites/configuration/channelConfigStorage"
import type { ManagedSiteRuntimeConfig } from "~/services/managedSites/configuration/runtimeConfig"
import {
  createManagedChannelResourceRef,
  getManagedResourceRefKey,
  isManagedResourceRefForSite,
  toManagedUpstreamResourceRef,
} from "~/services/managedSites/managedResourceIdentity"
import { onStorageChanged } from "~/utils/browser/storage"

interface ExclusionSession {
  contextKey: string
  target: {
    siteType: ManagedSiteRuntimeConfig["siteType"]
    config: { baseUrl: string }
  }
  active: boolean
  request: number
  ready: boolean
  saving: Set<string>
}

/** Owns persisted participation state and accepts reads/writes only in the active target. */
export function useModelSyncExclusions(
  target: ManagedSiteRuntimeConfig | null,
  contextKey: string,
) {
  const { t } = useTranslation("managedSiteModelSync")
  const sessionRef = useRef<ExclusionSession | null>(null)
  const [state, setState] = useState({
    contextKey,
    keys: new Set<string>(),
    isLoading: true,
    error: null as string | null,
  })
  const [savingKeys, setSavingKeys] = useState(new Set<string>())
  const siteType = target?.siteType
  const baseUrl = target?.config.baseUrl

  const load = useCallback(
    async (session: ExclusionSession) => {
      const request = ++session.request
      const isCurrent = () => session.active && request === session.request
      try {
        const configs = await channelConfigStorage.getConfigsForScope({
          managedSiteType: session.target.siteType,
          scopeKey: session.target.config.baseUrl,
        })
        if (!isCurrent()) return
        const keys = new Set(
          Object.values(configs)
            .filter((config) => config.modelSyncExcluded)
            .map(({ resourceRef }) =>
              getManagedResourceRefKey(
                createManagedChannelResourceRef(
                  resourceRef.managedSiteType,
                  resourceRef.scopeKey,
                  resourceRef.resourceId,
                ),
              ),
            ),
        )
        session.ready = true
        setState({
          contextKey: session.contextKey,
          keys,
          isLoading: false,
          error: null,
        })
      } catch {
        if (!isCurrent()) return
        session.ready = false
        setState((current) => ({
          ...current,
          contextKey: session.contextKey,
          isLoading: false,
          error: t("execution.exclusions.loadFailed"),
        }))
      }
    },
    [t],
  )

  useEffect(() => {
    setState({
      contextKey,
      keys: new Set(),
      isLoading: Boolean(siteType && baseUrl),
      error: null,
    })
    setSavingKeys(new Set())
    if (!siteType || !baseUrl) {
      sessionRef.current = null
      return
    }
    const session: ExclusionSession = {
      contextKey,
      target: { siteType, config: { baseUrl } },
      active: true,
      request: 0,
      ready: false,
      saving: new Set(),
    }
    sessionRef.current = session
    void load(session)
    const unsubscribe = onStorageChanged((changes, area) => {
      if (
        area === "local" &&
        CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_RESOURCE_CONFIGS in changes
      ) {
        void load(session)
      }
    })
    return () => {
      session.active = false
      unsubscribe()
    }
  }, [contextKey, siteType, baseUrl, load])

  const reload = async () => {
    const session = sessionRef.current
    if (session?.active && session.contextKey === contextKey)
      await load(session)
  }
  const setExcluded = async (ref: ManagedResourceRef, excluded: boolean) => {
    const session = sessionRef.current
    if (
      !session?.active ||
      !session.ready ||
      session.contextKey !== contextKey ||
      !isManagedResourceRefForSite(ref, session.target)
    )
      return
    const key = getManagedResourceRefKey(ref)
    if (session.saving.has(key)) return
    session.saving.add(key)
    setSavingKeys(new Set(session.saving))
    try {
      await channelConfigStorage.setModelSyncExcluded(
        toManagedUpstreamResourceRef(ref),
        excluded,
      )
      if (session.active) await load(session)
      if (session.active) {
        toast.success(
          t(
            excluded
              ? "execution.exclusions.savedExcluded"
              : "execution.exclusions.savedIncluded",
          ),
        )
      }
    } catch {
      if (session.active) toast.error(t("execution.exclusions.saveFailed"))
    } finally {
      session.saving.delete(key)
      if (session.active) setSavingKeys(new Set(session.saving))
    }
  }

  const isCurrent = state.contextKey === contextKey
  return {
    isLoading: !isCurrent || state.isLoading,
    error: isCurrent ? state.error : null,
    hasPendingSave: isCurrent && savingKeys.size > 0,
    isExcluded: (ref: ManagedResourceRef) =>
      isCurrent && state.keys.has(getManagedResourceRefKey(ref)),
    isSaving: (ref: ManagedResourceRef) =>
      isCurrent && savingKeys.has(getManagedResourceRefKey(ref)),
    setExcluded,
    reload,
  }
}
