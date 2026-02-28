import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import {
  readFreshLdohSiteListCache,
  readLdohSiteListCache,
} from "~/services/integrations/ldohSiteLookup/cache"
import {
  buildLdohSiteLookupIndex,
  matchLdohSiteForAccount,
  type LdohSiteLookupIndex,
} from "~/services/integrations/ldohSiteLookup/matching"
import { requestLdohSiteLookupRefreshSites } from "~/services/integrations/ldohSiteLookup/runtime"
import type {
  LdohSiteListCache,
  LdohSiteSummary,
} from "~/services/integrations/ldohSiteLookup/types"
import { buildLdohSiteSearchUrlFromUrl } from "~/services/integrations/ldohSiteLookup/url"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

const logger = createLogger("LdohSiteLookupContext")

type LdohSiteLookupContextValue = {
  getMatchForAccountUrl: (accountBaseUrl: string) => LdohSiteSummary | null
  getLdohSearchUrlForAccountUrl: (accountBaseUrl: string) => string | null
}

const LdohSiteLookupContext = createContext<LdohSiteLookupContextValue | null>(
  null,
)

/**
 * Builds a matching index from a cache payload.
 * Returns `null` when the cache is missing/expired.
 */
function buildIndexFromCache(
  cache: LdohSiteListCache | null,
): LdohSiteLookupIndex | null {
  if (!cache) return null
  return buildLdohSiteLookupIndex(cache.items)
}

/**
 * Provides a non-blocking, cached LDOH site list lookup.
 *
 * On mount:
 * - Loads any fresh TTL cache from extension storage.
 * - If missing/expired, triggers a single background refresh attempt.
 *
 * IMPORTANT: This provider must remain "quiet" and MUST NOT do per-row network work.
 */
export function LdohSiteLookupProvider({ children }: { children: ReactNode }) {
  // Keep this provider "quiet": attempt a single background refresh per mount.
  const refreshAttemptedRef = useRef(false)
  const isMountedRef = useRef(true)
  const [index, setIndex] = useState<LdohSiteLookupIndex | null>(null)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    void (async () => {
      const fresh = await readFreshLdohSiteListCache()
      if (isMountedRef.current) {
        setIndex(buildIndexFromCache(fresh))
      }

      if (fresh) return
      if (refreshAttemptedRef.current) return

      // Optional diagnostic read so we can log "expired vs missing" without impacting behavior.
      const existing = await readLdohSiteListCache()
      logger.debug("LDOH cache miss/expired; triggering background refresh", {
        hasCache: !!existing,
        expiresAt: existing?.expiresAt ?? null,
      })

      refreshAttemptedRef.current = true

      try {
        await requestLdohSiteLookupRefreshSites({ maxAttempts: 1 })
      } catch (error) {
        logger.debug("Background refresh request failed", {
          error: getErrorMessage(error),
        })
      } finally {
        const refreshed = await readFreshLdohSiteListCache()
        if (isMountedRef.current) {
          setIndex(buildIndexFromCache(refreshed))
        }
      }
    })()
  }, [])

  const getMatchForAccountUrl = useCallback(
    (accountBaseUrl: string) => {
      if (!index) return null
      return matchLdohSiteForAccount(index, accountBaseUrl)
    },
    [index],
  )

  const getLdohSearchUrlForAccountUrl = useCallback(
    (accountBaseUrl: string) => {
      const match = getMatchForAccountUrl(accountBaseUrl)
      if (!match) return null
      return buildLdohSiteSearchUrlFromUrl(match.apiBaseUrl)
    },
    [getMatchForAccountUrl],
  )

  const value = useMemo(
    () => ({ getMatchForAccountUrl, getLdohSearchUrlForAccountUrl }),
    [getMatchForAccountUrl, getLdohSearchUrlForAccountUrl],
  )

  return (
    <LdohSiteLookupContext.Provider value={value}>
      {children}
    </LdohSiteLookupContext.Provider>
  )
}

/**
 * Accessor for the cached LDOH site directory matching helpers.
 *
 * Must be used within a {@link LdohSiteLookupProvider}.
 */
export function useLdohSiteLookupContext(): LdohSiteLookupContextValue {
  const context = useContext(LdohSiteLookupContext)
  if (!context) {
    throw new Error(
      "useLdohSiteLookupContext must be used within a LdohSiteLookupProvider",
    )
  }
  return context
}
