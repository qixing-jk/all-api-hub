import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { type ResolveAccountBrowserSessionOptions } from "~/services/accountBrowserSession"
import { getSiteName } from "~/services/accounts/siteName"
import {
  getActiveTabs,
  onTabActivated,
  onTabUpdated,
} from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import { tryParseOrigin } from "~/utils/core/urlParsing"

interface CurrentTabCookieImportContext {
  origin: string
  tabId?: number
  incognito?: boolean
  cookieStoreId?: string
}

/**
 * Captures the current tab context needed to import cookies from the same browser profile.
 */
function createCurrentTabCookieImportContext(
  tab: browser.tabs.Tab,
  origin: string,
): CurrentTabCookieImportContext {
  return {
    origin,
    ...(typeof tab.id === "number" ? { tabId: tab.id } : {}),
    ...(tab.incognito === true ? { incognito: true } : {}),
    ...(typeof tab.cookieStoreId === "string" && tab.cookieStoreId.trim()
      ? { cookieStoreId: tab.cookieStoreId.trim() }
      : {}),
  }
}

/**
 * Reuses the active tab only when it belongs to the target origin and browser profile.
 */
function createCurrentTabBrowserSessionContext(
  context: CurrentTabCookieImportContext | null,
  targetUrl: string,
): ResolveAccountBrowserSessionOptions["currentTab"] | undefined {
  const targetOrigin = tryParseOrigin(targetUrl)
  if (
    !context ||
    !targetOrigin ||
    targetOrigin !== context.origin ||
    typeof context.tabId !== "number"
  ) {
    return undefined
  }

  return {
    tabId: context.tabId,
    incognito: context.incognito === true,
    ...(context.cookieStoreId ? { cookieStoreId: context.cookieStoreId } : {}),
  }
}

const logger = createLogger("AccountDialogHook")

/** Owns active-tab lookup, title races, and browser profile context for imports. */
export function useAccountCurrentTab({
  mode,
  accountId,
  url,
  setSiteName,
}: {
  mode: DialogMode
  accountId?: string
  url: string
  setSiteName: (name: string) => void
}) {
  const [currentTabUrl, setCurrentTabUrl] = useState<string | null>(null)
  const selectedSiteUrlRef = useRef(url)
  const currentTabCookieImportContextRef =
    useRef<CurrentTabCookieImportContext | null>(null)
  const currentTabSiteNameRef = useRef("")
  const currentTabDetectionRunRef = useRef(0)
  const detectedCookieStoreIdRef = useRef<string | null>(null)
  const hasConsumedAutoFillCurrentSiteUrlRef = useRef(false)
  useLayoutEffect(() => {
    selectedSiteUrlRef.current = url
  }, [url])
  const reset = useCallback((urlOwned: boolean) => {
    currentTabDetectionRunRef.current += 1
    currentTabCookieImportContextRef.current = null
    currentTabSiteNameRef.current = ""
    detectedCookieStoreIdRef.current = null
    hasConsumedAutoFillCurrentSiteUrlRef.current = urlOwned
    setCurrentTabUrl(null)
  }, [])
  const notifyUrlChanged = useCallback((value: string) => {
    selectedSiteUrlRef.current = value
    detectedCookieStoreIdRef.current = null
    hasConsumedAutoFillCurrentSiteUrlRef.current = true
  }, [])
  const rememberCookieStore = useCallback(
    (cookieStoreId: string | undefined) => {
      detectedCookieStoreIdRef.current = cookieStoreId?.trim() || null
    },
    [],
  )
  const getBrowserSessionContext = useCallback(
    (targetUrl: string) =>
      createCurrentTabBrowserSessionContext(
        currentTabCookieImportContextRef.current,
        targetUrl,
      ),
    [],
  )
  const claimCurrentTab = useCallback(
    () => ({ url: currentTabUrl, siteName: currentTabSiteNameRef.current }),
    [currentTabUrl],
  )
  const consumeAutoFill = useCallback(() => {
    if (hasConsumedAutoFillCurrentSiteUrlRef.current) return false
    hasConsumedAutoFillCurrentSiteUrlRef.current = true
    return true
  }, [])
  const getCookieImportContextForUrl = useCallback((targetUrl: string) => {
    if (detectedCookieStoreIdRef.current) {
      return { cookieStoreId: detectedCookieStoreIdRef.current }
    }

    const currentTabContext = currentTabCookieImportContextRef.current
    if (!currentTabContext) {
      return {}
    }

    const targetOrigin = tryParseOrigin(targetUrl)
    if (!targetOrigin || targetOrigin !== currentTabContext.origin) {
      return {}
    }

    return {
      ...(currentTabContext.cookieStoreId
        ? { cookieStoreId: currentTabContext.cookieStoreId }
        : {}),
      ...(typeof currentTabContext.tabId === "number"
        ? { sourceTabId: currentTabContext.tabId }
        : {}),
      ...(currentTabContext.incognito === true
        ? { sourceTabIncognito: true }
        : {}),
    }
  }, [])

  const checkCurrentTab = useCallback(async () => {
    if (mode === DIALOG_MODES.EDIT && accountId) {
      return
    }
    const runId = currentTabDetectionRunRef.current + 1
    currentTabDetectionRunRef.current = runId
    const isCurrentDetectionRun = () =>
      currentTabDetectionRunRef.current === runId
    const clearCurrentTabDetection = () => {
      if (!isCurrentDetectionRun()) return

      currentTabCookieImportContextRef.current = null
      currentTabSiteNameRef.current = ""
      setCurrentTabUrl(null)
      // Preserve a user-selected or typed site name when the URL field is already owned by the user.
      if (!selectedSiteUrlRef.current.trim()) {
        setSiteName("")
      }
    }
    const canApplyCurrentTabTitle = () => !selectedSiteUrlRef.current.trim()

    try {
      const tabs = await getActiveTabs()
      if (!isCurrentDetectionRun()) return
      const tab = tabs[0]
      if (tab?.url) {
        try {
          const urlObj = new URL(tab.url)
          const baseUrl = `${urlObj.protocol}//${urlObj.host}`
          if (!baseUrl.startsWith("http")) {
            clearCurrentTabDetection()
            return
          }
          currentTabCookieImportContextRef.current =
            createCurrentTabCookieImportContext(tab, baseUrl)
          setCurrentTabUrl(baseUrl)
          const resolvedSiteName = await getSiteName(tab)
          if (!isCurrentDetectionRun()) return

          currentTabSiteNameRef.current = resolvedSiteName
          if (canApplyCurrentTabTitle()) {
            setSiteName(resolvedSiteName)
          }
        } catch (error) {
          logger.warn("Failed to parse current tab URL", {
            error,
            tabUrl: tab.url,
          })
          clearCurrentTabDetection()
        }
      } else {
        clearCurrentTabDetection()
      }
    } catch (error) {
      logger.warn("Failed to query current tab", { error })
      clearCurrentTabDetection()
    }
  }, [accountId, mode, setSiteName])

  useEffect(() => {
    // 打开 popup 时立即检测一次
    checkCurrentTab()

    // Tab 激活变化时检测
    const cleanupActivated = onTabActivated(() => {
      checkCurrentTab()
    })

    // Tab URL 或状态更新时检测（只对当前 tab）
    const cleanupUpdated = onTabUpdated(async (tabId) => {
      const tabs = await getActiveTabs()
      if (tabs[0]?.id === tabId) {
        checkCurrentTab()
      }
    })

    // 清理监听器
    return () => {
      cleanupActivated()
      cleanupUpdated()
    }
  }, [checkCurrentTab])

  useEffect(
    () => () => {
      currentTabDetectionRunRef.current += 1
    },
    [],
  )
  return {
    currentTabUrl,
    checkCurrentTab,
    reset,
    notifyUrlChanged,
    rememberCookieStore,
    getBrowserSessionContext,
    getCookieImportContextForUrl,
    claimCurrentTab,
    consumeAutoFill,
  }
}
