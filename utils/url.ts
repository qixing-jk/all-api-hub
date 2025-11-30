/**
 * 连接 base URL 和 path URL
 * - 将 base URL 和 path URL 连接起来，并将多个 / 字符合并成一个
 * - 如果 base URL 结尾是 /，或者 path URL 开头是 /，那么将其删除
 * @param base - 基础 URL
 * @param path - 需要连接的 URL 路径
 * @returns 连接后的 URL
 */
export function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
}

/**
 * Parse tab and anchor from URL
 * Supports both ?tab=xxx and hash patterns like #tab=xxx or #basic?tab=xxx
 * Also supports direct heading anchors like #heading-id
 * @returns Object containing tab and anchor information
 */
export function parseTabFromUrl(
  options: {
    ignoreAnchors?: string[]
    defaultHashPage?: string
  } = {}
): {
  tab: string | null
  anchor: string | null
  isHeadingAnchor: boolean
} {
  const { ignoreAnchors = [], defaultHashPage } = options
  const rawHash = window.location.hash.slice(1)
  const search = new URLSearchParams(window.location.search)

  let tab: string | null = null
  let anchor: string | null = null
  let isHeadingAnchor = false

  if (search.has("tab")) {
    tab = search.get("tab")
  }

  if (rawHash) {
    const [hashPath, hashQuery] = rawHash.split("?")

    // If hash starts with tab=xxx, use it directly
    if (!tab && hashPath?.startsWith("tab=")) {
      tab = hashPath.split("tab=")[1] || null
    }

    if (!tab && hashQuery) {
      const params = new URLSearchParams(hashQuery)
      tab = params.get("tab")
    }

    const normalizedPath = hashPath?.trim() ?? ""

    if (
      normalizedPath &&
      normalizedPath !== defaultHashPage &&
      !normalizedPath.includes("=") &&
      !ignoreAnchors.includes(normalizedPath)
    ) {
      anchor = normalizedPath
      isHeadingAnchor = true
    }
  }

  return { tab, anchor, isHeadingAnchor }
}

/**
 * Update URL with tab parameter while preserving hash structure
 * @param tab - Tab ID to set in URL
 * @param options - Control whether to replace history and hash page name
 */
export function updateUrlWithTab(
  tab: string,
  options: {
    replaceHistory?: boolean
    hashPage?: string
  } = {}
) {
  const { replaceHistory = true, hashPage } = options
  const url = new URL(window.location.href)
  url.searchParams.set("tab", tab)

  if (hashPage) {
    url.hash = hashPage.startsWith("#") ? hashPage : `#${hashPage}`
  }

  if (replaceHistory) {
    window.history.replaceState(null, "", url.toString())
  } else {
    window.history.pushState(null, "", url.toString())
  }
}

/**
 * Navigate to a heading anchor within a specific tab
 * @param anchor - The heading ID to scroll to
 * @param tab - The tab containing the heading
 * @param options - Additional navigation options
 */
export function navigateToAnchor(
  anchor: string,
  tab?: string,
  options: {
    hashPage?: string
    delay?: number
  } = {}
) {
  const { hashPage, delay = 100 } = options

  if (tab) {
    updateUrlWithTab(tab, { hashPage })
  }

  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      const element = document.getElementById(anchor)
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }, delay)
  })
}
