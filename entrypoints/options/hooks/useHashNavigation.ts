import { useEffect, useState } from "react"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { navigateWithinOptionsPage } from "~/utils/navigation"

import { menuItems } from "../constants"

// 解析URL hash和参数
/**
 * Parses the current location hash + search params into page + param map.
 * @returns Active page id and query params.
 */
function parseHash() {
  const hash = window.location.hash.slice(1) // 去掉 #

  const params: Record<string, string> = {}
  const searchParams = new URLSearchParams(window.location.search)
  for (const [key, value] of searchParams.entries()) {
    params[key] = value
  }

  if (!hash) {
    return { page: MENU_ITEM_IDS.BASIC, params }
  }

  const [page, ...paramParts] = hash.split("?")

  if (paramParts.length > 0) {
    const paramString = paramParts.join("?")
    const urlParams = new URLSearchParams(paramString)
    for (const [key, value] of urlParams.entries()) {
      params[key] = value
    }
  }

  return { page: page || MENU_ITEM_IDS.BASIC, params }
}

// 更新URL hash
/**
 * Updates the hash (and query params) while staying within the options page.
 * @param page Menu id to navigate to.
 * @param params Optional query parameters.
 */
function updateHash(page: string, params?: Record<string, string>) {
  const hash = `#${page}`
  navigateWithinOptionsPage(hash, params ?? {})
}

/**
 * Hook that synchronizes menu navigation with the URL hash/query parameters.
 * Exposes current page, params, a handler to change pages, and refreshKey bumps.
 */
export function useHashNavigation() {
  const [activeMenuItem, setActiveMenuItem] = useState<string>(
    MENU_ITEM_IDS.BASIC,
  )
  const [routeParams, setRouteParams] = useState<Record<string, string>>({})
  const [refreshKey, setRefreshKey] = useState(0)

  // 初始化路由
  useEffect(() => {
    const { page, params } = parseHash()
    const validPage = menuItems.find((item) => item.id === page)
      ? page
      : MENU_ITEM_IDS.BASIC
    setActiveMenuItem(validPage)
    setRouteParams(params)

    // 监听浏览器前进后退
    const handleHashChange = () => {
      const { page, params } = parseHash()
      if (params.refresh === "true") {
        setRefreshKey((prev) => prev + 1)
      }
      const validPage = menuItems.find((item) => item.id === page)
        ? page
        : MENU_ITEM_IDS.BASIC
      setActiveMenuItem(validPage)
      setRouteParams(params)
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  // 切换菜单项
  const handleMenuItemChange = (
    itemId: string,
    params?: Record<string, string>,
  ) => {
    setActiveMenuItem(itemId)
    setRouteParams(params || {})
    updateHash(itemId, params)
  }

  return { activeMenuItem, routeParams, handleMenuItemChange, refreshKey }
}
