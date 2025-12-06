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
 * Parse tab/anchor information from URL hash and search parameters.
 * Supports both ?tab=xxx and hash patterns like #tab=xxx or #basic?tab=xxx.
 * Also supports direct heading anchors like #heading-id.
 * @param options Options for ignoring anchors or forcing a default hash page.
 * @param options.ignoreAnchors Anchors to skip when parsing headings.
 * @param options.defaultHashPage Hash page treated as the default context.
 * @returns Object containing tab and anchor information.
 */
export function parseTabFromUrl(
  options: {
    ignoreAnchors?: string[]
    defaultHashPage?: string
  } = {},
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
 * Update URL with tab parameter while preserving hash structure.
 * @param tab Tab ID to set in URL.
 * @param options Options controlling history replacement and hash root (supports `replaceHistory` and `hashPage`).
 * @param options.replaceHistory Whether to replace the current history entry (default true).
 * @param options.hashPage Optional hash root (e.g., "#basic") to enforce while updating.
 */
export function updateUrlWithTab(
  tab: string,
  options: {
    replaceHistory?: boolean
    hashPage?: string
  } = {},
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
 * Navigate to a heading anchor within a specific tab.
 * @param anchor Heading ID to scroll to.
 * @param tab Tab containing the heading. Omit to keep current tab.
 * @param options Additional navigation options (supports `hashPage` and `delay`).
 * @param options.hashPage Optional hash page override applied before scrolling.
 * @param options.delay Delay (ms) before scrolling after the next animation frame.
 */
export function navigateToAnchor(
  anchor: string,
  tab?: string,
  options: {
    hashPage?: string
    delay?: number
  } = {},
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
