import { useEffect, useState } from "react"

import { menuItems } from "../constants"

// 解析URL hash和参数
function parseHash() {
  const hash = window.location.hash.slice(1) // 去掉 #

  const params: Record<string, string> = {}
  const searchParams = new URLSearchParams(window.location.search)
  for (const [key, value] of searchParams.entries()) {
    params[key] = value
  }

  if (!hash) {
    return { page: "basic", params }
  }

  const [page, ...paramParts] = hash.split("?")

  if (paramParts.length > 0) {
    const paramString = paramParts.join("?")
    const urlParams = new URLSearchParams(paramString)
    for (const [key, value] of urlParams.entries()) {
      params[key] = value
    }
  }

  return { page: page || "basic", params }
}

// 更新URL hash
function updateHash(page: string, params?: Record<string, string>) {
  let hash = `#${page}`
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams(params)
    hash += `?${searchParams.toString()}`
  }
  window.history.replaceState(null, "", hash)
}

export function useHashNavigation() {
  const [activeMenuItem, setActiveMenuItem] = useState("basic")
  const [routeParams, setRouteParams] = useState<Record<string, string>>({})
  const [refreshKey, setRefreshKey] = useState(0)

  // 初始化路由
  useEffect(() => {
    const { page, params } = parseHash()
    const validPage = menuItems.find((item) => item.id === page)
      ? page
      : "basic"
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
        : "basic"
      setActiveMenuItem(validPage)
      setRouteParams(params)
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  // 切换菜单项
  const handleMenuItemChange = (
    itemId: string,
    params?: Record<string, string>
  ) => {
    setActiveMenuItem(itemId)
    setRouteParams(params || {})
    updateHash(itemId, params)
  }

  return { activeMenuItem, routeParams, handleMenuItemChange, refreshKey }
}
