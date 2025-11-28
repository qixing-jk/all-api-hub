/**
 * Firefox Cookie 助手（WebRequest 方案）
 * 使用 WebRequest 拦截器自动注入 Cookie
 */

// Cookie 缓存
interface CookieCache {
  cookies: string
  timestamp: number
}

const cookieCache = new Map<string, CookieCache>()
const CACHE_DURATION = 10000 // 10秒缓存

// 请求标识头
const EXTENSION_HEADER_NAME = "All-API-Hub"
const EXTENSION_HEADER_VALUE = "true"

// 拦截器注册状态
let isInterceptorRegistered = false
let currentUrlPatterns: string[] = []

/**
 * 获取指定 URL 的 Cookie 请求头
 */
export async function getCookieHeaderForUrl(url: string): Promise<string> {
  // 检查缓存
  const cached = cookieCache.get(url)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log("[Cookie Helper] 使用缓存 Cookie:", url)
    return cached.cookies
  }

  try {
    // 读取 cookies
    const cookies = await browser.cookies.getAll({
      url,
      // Firefox 支持分区 cookie
      partitionKey: {}
    })

    // 过滤并格式化
    const validCookies = cookies.filter((cookie) => {
      // 检查过期时间
      if (cookie.expirationDate && cookie.expirationDate < Date.now() / 1000) {
        return false
      }
      return true
    })

    // 格式化为 Cookie 请求头：name1=value1; name2=value2
    const cookieHeader = validCookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ")

    console.log(
      `[Cookie Helper] 获取到 ${validCookies.length} 个 Cookie: ${url}`
    )

    // 更新缓存
    if (cookieHeader) {
      cookieCache.set(url, {
        cookies: cookieHeader,
        timestamp: Date.now()
      })
    }

    return cookieHeader
  } catch (error) {
    console.warn("[Cookie Helper] 获取 Cookie 失败:", error)
    return ""
  }
}

/**
 * 清除 Cookie 缓存
 */
export function clearCookieCache(url?: string): void {
  if (url) {
    cookieCache.delete(url)
  } else {
    cookieCache.clear()
  }
}

/**
 * 检测是否为 Firefox 浏览器
 */
export function isFirefox(): boolean {
  try {
    return (
      typeof browser !== "undefined" &&
      typeof browser.runtime.getBrowserInfo !== "undefined"
    )
  } catch {
    return false
  }
}

/**
 * WebRequest 拦截处理函数
 */
async function handleWebRequest(details: any) {
  const headers = details.requestHeaders || []

  // 只处理带有扩展标识的请求
  const hasExtensionHeader = headers.some(
    (h: any) =>
      h.name.toLowerCase() === EXTENSION_HEADER_NAME.toLowerCase() &&
      h.value === EXTENSION_HEADER_VALUE
  )

  if (!hasExtensionHeader) {
    return {}
  }

  console.log("[Cookie Helper] 拦截请求:", details.url)

  // 获取 Cookie
  const cookieHeader = await getCookieHeaderForUrl(details.url)

  if (!cookieHeader) {
    console.warn("[Cookie Helper] 未找到 Cookie:", details.url)
    return {}
  }

  // 注入或替换 Cookie 头
  const newHeaders = headers
    .map((h: any) => {
      // 移除扩展标识头
      if (h.name.toLowerCase() === EXTENSION_HEADER_NAME.toLowerCase()) {
        return null
      }
      // 替换 Cookie 头
      if (h.name.toLowerCase() === "cookie") {
        console.log("[Cookie Helper] 已替换 Cookie 头")
        return { name: h.name, value: cookieHeader }
      }
      return h
    })
    .filter(Boolean) as any[]

  // 如果没有 Cookie 头，添加
  if (!headers.some((h: any) => h.name.toLowerCase() === "cookie")) {
    newHeaders.push({ name: "Cookie", value: cookieHeader })
    console.log("[Cookie Helper] 已添加 Cookie 头")
  }

  return { requestHeaders: newHeaders }
}

/**
 * 注册 WebRequest 拦截器
 * @param urlPatterns URL 白名单模式列表
 */
export function registerWebRequestInterceptor(urlPatterns: string[]): void {
  if (!isFirefox()) {
    console.log("[Cookie Helper] 非 Firefox 环境，跳过拦截器注册")
    return
  }

  try {
    // 先注销旧的拦截器
    if (isInterceptorRegistered) {
      browser.webRequest.onBeforeSendHeaders.removeListener(handleWebRequest)
      isInterceptorRegistered = false
      console.log("[Cookie Helper] 已注销旧拦截器")
    }

    // 如果没有 URL 模式，不注册
    if (!urlPatterns || urlPatterns.length === 0) {
      console.log("[Cookie Helper] 无 URL 白名单，跳过注册")
      currentUrlPatterns = []
      return
    }

    // 注册新的拦截器
    browser.webRequest.onBeforeSendHeaders.addListener(
      handleWebRequest,
      { urls: urlPatterns },
      ["blocking", "requestHeaders"]
    )

    isInterceptorRegistered = true
    currentUrlPatterns = urlPatterns
    console.log(
      `[Cookie Helper] 拦截器注册成功，监控 ${urlPatterns.length} 个 URL 模式:`,
      urlPatterns
    )
  } catch (error) {
    console.error("[Cookie Helper] 拦截器注册失败:", error)
    isInterceptorRegistered = false
    currentUrlPatterns = []
  }
}

/**
 * 初始化 WebRequest 拦截器（启动时调用）
 * @param urlPatterns 初始 URL 白名单
 */
export function setupWebRequestInterceptor(urlPatterns: string[] = []): void {
  if (!isFirefox()) {
    console.log("[Cookie Helper] 非 Firefox 环境，跳过初始化")
    return
  }

  registerWebRequestInterceptor(urlPatterns)
}

/**
 * 为请求添加扩展标识头
 */
export function addExtensionHeader(
  headers: HeadersInit = {}
): Record<string, string> {
  if (!isFirefox()) {
    return headers as Record<string, string>
  }

  const headersObj: Record<string, string> =
    headers instanceof Headers
      ? Object.fromEntries(headers.entries())
      : Array.isArray(headers)
        ? Object.fromEntries(headers)
        : { ...headers }

  headersObj[EXTENSION_HEADER_NAME] = EXTENSION_HEADER_VALUE

  return headersObj
}
