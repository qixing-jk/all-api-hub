import { useCallback, useEffect, useRef, useState } from "react"

import { isAccountRelatedTab } from "~/features/AccountManagement/utils/accountOpenTabMatch"
import { readAccountBrowserIdentityFromTab } from "~/services/accountBrowserSession/identityReader"
import { resolveAccountSiteContentSessionHintForOrigin } from "~/services/accounts/accountSiteProfile"
import { isSameAccountSiteOrigin } from "~/services/accounts/accountSiteProfile/urls"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import { findAccountsBySiteIdentity } from "~/services/accounts/identity/accountMatching"
import { excludeInternalTabs } from "~/services/browsingContext/internalTabs"
import {
  OPEN_TAB_MATCH_TIER,
  type OpenTabMatchTiers,
} from "~/services/preferences/utils/sortingPriority"
import type { DisplaySiteData, SiteAccount } from "~/types"
import {
  getActiveTabs,
  getAllTabs,
  onTabActivated,
  onTabRemoved,
  onTabUpdated,
} from "~/utils/browser/tabs"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("AccountDataContext")
const CURRENT_TAB_IDENTITY_CACHE_MS = 1500

type CurrentTabIdentityCache = {
  tabId: number
  url: string
  siteType: SiteAccount["site_type"]
  candidateUserIdsKey: string
  completedAt: number | null
  identity: Promise<string | null>
}

type TabCheckOptions = {
  force?: boolean
  pageIsLoading?: boolean
}

/** Match saved accounts to live tabs and own all browser-listener lifecycles. */
export function useAccountBrowsingContext({
  accounts,
  displayData,
  enabled: hasLoadedAccountData,
}: {
  accounts: SiteAccount[]
  displayData: DisplaySiteData[]
  enabled: boolean
}) {
  const [hasResolvedInitialOpenTabs, setHasResolvedInitialOpenTabs] =
    useState(false)
  const [detectedSiteAccounts, setDetectedSiteAccounts] = useState<
    SiteAccount[]
  >([])
  const [detectedAccount, setDetectedAccount] = useState<SiteAccount | null>(
    null,
  )
  const [isDetecting, setIsDetecting] = useState(true)
  const accountsRef = useRef(accounts)
  accountsRef.current = accounts
  const hasLoadedAccountDataRef = useRef(hasLoadedAccountData)
  hasLoadedAccountDataRef.current = hasLoadedAccountData
  const hasResolvedInitialOpenTabsRef = useRef(hasResolvedInitialOpenTabs)
  hasResolvedInitialOpenTabsRef.current = hasResolvedInitialOpenTabs
  const currentTabUserCacheRef = useRef<CurrentTabIdentityCache | null>(null)

  const currentTabCheckSeqRef = useRef(0)

  const checkCurrentTab = useCallback(async (options?: TabCheckOptions) => {
    // Guard against stale async updates: if a newer check starts while this one is awaiting,
    // this `seq` lets us no-op any state updates from older runs.
    const seq = (currentTabCheckSeqRef.current += 1)
    setIsDetecting(true)

    try {
      // Look up the currently active tab. We need both the URL (for origin matching) and the
      // tab ID (for messaging + deduping repeated checks for the same tab).
      const tabs = await excludeInternalTabs(await getActiveTabs())
      const tab = tabs?.[0]
      const tabUrl = typeof tab?.url === "string" ? tab.url : null
      const tabId = typeof tab?.id === "number" ? tab.id : null

      if (!tab || !tabUrl || tabId === null) {
        if (seq !== currentTabCheckSeqRef.current) return
        // No valid tab context: clear both site-level and user-level detections.
        currentTabUserCacheRef.current = null
        setDetectedSiteAccounts([])
        setDetectedAccount(null)
        return
      }

      let parsedUrl: URL
      try {
        parsedUrl = new URL(tabUrl)
      } catch (error) {
        logger.debug("Failed to parse active tab URL", { tabUrl, error })
        if (seq !== currentTabCheckSeqRef.current) return
        // Invalid URL: clear detection to avoid showing stale state from a previous tab.
        currentTabUserCacheRef.current = null
        setDetectedSiteAccounts([])
        setDetectedAccount(null)
        return
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        if (seq !== currentTabCheckSeqRef.current) return
        // Non-web pages (chrome://, about:, etc.) can't be matched to stored site accounts.
        currentTabUserCacheRef.current = null
        setDetectedSiteAccounts([])
        setDetectedAccount(null)
        return
      }

      // Site-level detection: find any stored accounts that belong to the same origin.
      // This answers "does this site already exist in the user's accounts?".
      const originAccounts = accountsRef.current.filter((account) => {
        return isSameAccountSiteOrigin(
          {
            url: account.site_url,
            siteType: account.site_type,
          },
          { url: tabUrl },
        )
      })
      if (seq !== currentTabCheckSeqRef.current) return
      setDetectedSiteAccounts(originAccounts)

      const [firstOriginAccount] = originAccounts
      if (
        firstOriginAccount === undefined ||
        options?.pageIsLoading ||
        tab.status === "loading"
      ) {
        // A loading page may still host the previous document. Invalidate its
        // identity now and wait for completion before contacting a content script.
        currentTabUserCacheRef.current = null
        setDetectedAccount(null)
        return
      }

      const siteTypeForUserRead =
        resolveAccountSiteContentSessionHintForOrigin({
          origin: parsedUrl.origin,
          candidateAccounts: originAccounts,
        }) ?? firstOriginAccount.site_type

      const candidateUserIds = [
        ...new Set(
          originAccounts
            .map((account) => normalizeAccountIdentity(account.account_info.id))
            .filter((id): id is string => id !== null),
        ),
      ].sort()
      const candidateUserIdsKey = JSON.stringify(candidateUserIds)
      let currentRead = currentTabUserCacheRef.current
      const isSameReadContext =
        currentRead?.tabId === tabId &&
        currentRead.url === tabUrl &&
        currentRead.siteType === siteTypeForUserRead &&
        currentRead.candidateUserIdsKey === candidateUserIdsKey
      const canReuseRead =
        !options?.force &&
        isSameReadContext &&
        currentRead &&
        (currentRead.completedAt === null ||
          Date.now() - currentRead.completedAt < CURRENT_TAB_IDENTITY_CACHE_MS)

      if (!currentRead || !canReuseRead) {
        // Preserve the last ordering during a same-page passive check. Apply a
        // changed or unconfirmed identity when that check settles, without flicker.
        if (!isSameReadContext) setDetectedAccount(null)
        // Cache the promise so a newer tab event waits for the same verification.
        // Completion only updates this entry, never a later tab's cache.
        const entry: CurrentTabIdentityCache = {
          tabId,
          url: tabUrl,
          siteType: siteTypeForUserRead,
          candidateUserIdsKey,
          completedAt: null,
          identity: readAccountBrowserIdentityFromTab({
            tabId,
            baseUrl: parsedUrl.origin,
            siteType: siteTypeForUserRead,
            candidateUserIds,
          }).then((userId) => {
            entry.completedAt = Date.now()
            return userId
          }),
        }
        currentRead = entry
        currentTabUserCacheRef.current = entry
      }

      const verifiedUserId = await currentRead.identity
      if (seq !== currentTabCheckSeqRef.current) return

      if (!verifiedUserId) {
        // We know the site exists in storage (originAccounts), but we can't confirm which login is active.
        setDetectedAccount(null)
        return
      }

      // If we can verify userId, match it to a specific stored account for this origin.
      const matchedAccount =
        findAccountsBySiteIdentity({
          accounts: originAccounts,
          siteUrl: tabUrl,
          userId: verifiedUserId,
        })[0] ?? null

      setDetectedAccount(matchedAccount)
    } catch (error) {
      logger.error("Error detecting current tab account", error)
      if (seq !== currentTabCheckSeqRef.current) return
      // Defensive reset to avoid leaving the UI in a partially-updated state.
      currentTabUserCacheRef.current = null
      setDetectedSiteAccounts([])
      setDetectedAccount(null)
    } finally {
      if (seq === currentTabCheckSeqRef.current) {
        setIsDetecting(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!hasLoadedAccountData) {
      return
    }

    // Tab 激活变化时检测
    const cleanupActivated = onTabActivated(() => {
      void checkCurrentTab({ force: true })
    })

    // Tab URL 或状态更新时检测（只对当前 tab）
    const cleanupUpdated = onTabUpdated(async (tabId, changeInfo) => {
      const tabs = await getActiveTabs()
      if (tabs[0]?.id === tabId) {
        void checkCurrentTab({
          force:
            changeInfo.status === "complete" ||
            typeof changeInfo.url === "string",
          pageIsLoading: changeInfo.status === "loading",
        })
      }
    })

    // 清理监听器
    return () => {
      cleanupActivated()
      cleanupUpdated()
    }
  }, [checkCurrentTab, hasLoadedAccountData])

  useEffect(() => {
    if (!hasLoadedAccountData) {
      return
    }

    // accounts refresh/update may change origin matches; re-check current tab to keep UI hints accurate.
    void checkCurrentTab()
  }, [accounts, checkCurrentTab, hasLoadedAccountData])

  const [matchedTabTiers, setMatchedTabTiers] = useState<OpenTabMatchTiers>({})
  const openTabsCheckSeqRef = useRef(0)
  // Check and match open tabs with accounts
  const checkOpenTabs = useCallback(async () => {
    const seq = (openTabsCheckSeqRef.current += 1)
    try {
      const tabs = await excludeInternalTabs(await getAllTabs())
      if (seq !== openTabsCheckSeqRef.current) return
      if (tabs.length === 0 || displayData.length === 0) {
        setMatchedTabTiers({})
        return
      }

      const [activeTab] = await getActiveTabs()
      if (seq !== openTabsCheckSeqRef.current) return

      // The viewed tab outranks related pages left open elsewhere. It only counts
      // when it survived the internal-page filter, so extension task pages cannot
      // claim the tier even when another tab shows the same URL.
      const activeTabId =
        typeof activeTab?.id === "number" &&
        tabs.some((tab) => tab.id === activeTab.id)
          ? activeTab.id
          : undefined

      const tiers: OpenTabMatchTiers = {}

      // Only recognized sites and explicitly configured pages establish a relation.
      for (const account of displayData) {
        const relatedTabs = tabs.filter((tab) =>
          isAccountRelatedTab(account, tab.url),
        )
        if (relatedTabs.length === 0) continue
        tiers[account.id] = relatedTabs.some((tab) => tab.id === activeTabId)
          ? OPEN_TAB_MATCH_TIER.ACTIVE
          : OPEN_TAB_MATCH_TIER.BACKGROUND
      }

      setMatchedTabTiers(tiers)
    } catch (error) {
      if (seq !== openTabsCheckSeqRef.current) return
      logger.error("Error matching open tabs", error)
      setMatchedTabTiers({})
    } finally {
      if (
        seq === openTabsCheckSeqRef.current &&
        !hasResolvedInitialOpenTabsRef.current
      ) {
        setHasResolvedInitialOpenTabs(true)
      }
    }
  }, [displayData])

  // Update matched scores when displayData changes or tabs change
  useEffect(() => {
    if (!hasLoadedAccountData) {
      return
    }

    void checkOpenTabs()

    // Listen for tab changes
    const cleanupActivated = onTabActivated(() => {
      if (!hasLoadedAccountDataRef.current) {
        return
      }
      void checkOpenTabs()
    })

    const cleanupUpdated = onTabUpdated(() => {
      if (!hasLoadedAccountDataRef.current) {
        return
      }
      void checkOpenTabs()
    })

    const cleanupRemoved = onTabRemoved(() => {
      if (!hasLoadedAccountDataRef.current) {
        return
      }
      void checkOpenTabs()
    })

    return () => {
      // Invalidate scans from the previous account snapshot or an unmounted UI.
      openTabsCheckSeqRef.current += 1
      cleanupActivated()
      cleanupUpdated()
      cleanupRemoved()
    }
  }, [checkOpenTabs, hasLoadedAccountData])

  return {
    detectedSiteAccounts,
    detectedAccount,
    isDetecting,
    matchedTabTiers,
    hasResolvedInitialOpenTabs,
  }
}
