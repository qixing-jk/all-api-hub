import { t } from "i18next"

import { getApiService } from "~/services/apiService"
import {
  EXTENSION_HEADER_NAME,
  EXTENSION_HEADER_VALUE,
} from "~/utils/cookieHelper"
import { getErrorMessage } from "~/utils/error"

const CF_LOG_PREFIX = "[Content][CloudflareGuard]"

/**
 * Log Cloudflare guard events to console and extension background
 */
function logCloudflareGuard(event: string, details?: Record<string, unknown>) {
  try {
    if (details && Object.keys(details).length > 0) {
      console.log(`${CF_LOG_PREFIX} ${event}`, details)
    } else {
      console.log(`${CF_LOG_PREFIX} ${event}`)
    }
  } catch {
    // ignore logging errors
  }

  try {
    void browser.runtime
      .sendMessage({
        action: "cloudflareGuardLog",
        event,
        details: details ?? null,
      })
      .catch(() => {})
  } catch {
    // ignore relay errors
  }
}

/**
 * Sanitize a URL for logging by removing query parameters and hash
 */
function sanitizeUrlForLog(url: string) {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url
  }
}

/**
 * Type representing the result of Cloudflare challenge detection
 */
type CloudflareChallengeDetection = {
  isChallenge: boolean
  score: number
  reasons: string[]
  title: string
  url: string | null
}

/**
 * Detect if the current page is a Cloudflare challenge page
 * @returns Object containing detection results and confidence score
 */
function detectCloudflareChallengePage(): CloudflareChallengeDetection {
  const reasons: string[] = []
  let score = 0

  const title = String(document.title ?? "")
  const titleLower = title.toLowerCase()

  const currentUrl = (() => {
    try {
      return window.location.href
    } catch {
      return null
    }
  })()

  const parsedUrl = (() => {
    try {
      return currentUrl ? new URL(currentUrl) : null
    } catch {
      return null
    }
  })()

  const urlPathIsCdnCgi = Boolean(parsedUrl?.pathname?.startsWith("/cdn-cgi/"))
  const urlHasCfChlQuery = (() => {
    try {
      if (!parsedUrl) return false
      for (const key of parsedUrl.searchParams.keys()) {
        if (key.startsWith("__cf_chl")) return true
      }
      return false
    } catch {
      return false
    }
  })()

  const hasCfChlOpt = (() => {
    try {
      return (
        typeof (window as any)._cf_chl_opt === "object" &&
        (window as any)._cf_chl_opt !== null
      )
    } catch {
      return false
    }
  })()

  const hasChallengePlatformScript = (() => {
    try {
      return Boolean(
        document.querySelector('script[src*="/cdn-cgi/challenge-platform/"]'),
      )
    } catch {
      return false
    }
  })()

  const hasLegacyTraceJsch = (() => {
    try {
      return Boolean(
        document.querySelector('script[src*="/cdn-cgi/images/trace/jsch/"]'),
      )
    } catch {
      return false
    }
  })()

  const hasChallengeForm = (() => {
    try {
      return Boolean(
        document.querySelector(
          'form.challenge-form, form#challenge-form, form[action*="__cf_chl_f_tk"]',
        ),
      )
    } catch {
      return false
    }
  })()

  const hasCfContent = (() => {
    try {
      return Boolean(document.querySelector("#cf-content"))
    } catch {
      return false
    }
  })()

  const hasCfWrapper = (() => {
    try {
      return Boolean(document.querySelector("#cf-wrapper"))
    } catch {
      return false
    }
  })()

  const hasCfErrorCode1020 = (() => {
    try {
      const el = document.querySelector(".cf-error-code")
      return Boolean(el?.textContent && el.textContent.includes("1020"))
    } catch {
      return false
    }
  })()

  const titleLooksLikeInterstitial =
    titleLower.includes("just a moment") ||
    titleLower.includes("checking your browser") ||
    titleLower.includes("attention required") ||
    title.includes("请稍候")

  const hasTurnstile = (() => {
    try {
      return Boolean(
        document.querySelector(
          'script[src*="challenges.cloudflare.com/turnstile"], iframe[src*="challenges.cloudflare.com"]',
        ),
      )
    } catch {
      return false
    }
  })()

  if (hasCfChlOpt) {
    score += 3
    reasons.push("_cf_chl_opt")
  }
  if (hasChallengePlatformScript) {
    score += 3
    reasons.push("challenge-platform")
  }
  if (hasLegacyTraceJsch) {
    score += 3
    reasons.push("trace-jsch")
  }
  if (hasChallengeForm) {
    score += 3
    reasons.push("challenge-form")
  }
  if (hasCfContent) {
    score += 2
    reasons.push("cf-content")
  }
  if (hasCfWrapper) {
    score += 2
    reasons.push("cf-wrapper")
  }
  if (hasCfErrorCode1020) {
    score += 2
    reasons.push("cf-error-1020")
  }
  if (urlPathIsCdnCgi || urlHasCfChlQuery) {
    score += 2
    reasons.push("cf-url")
  }
  if (titleLooksLikeInterstitial) {
    score += 1
    reasons.push("title")
  }
  if (hasTurnstile) {
    score += 1
    reasons.push("turnstile")
  }

  const hasStrongMarker =
    hasCfChlOpt ||
    hasChallengePlatformScript ||
    hasLegacyTraceJsch ||
    hasChallengeForm

  const hasSupportMarker =
    hasCfContent ||
    hasCfWrapper ||
    hasCfErrorCode1020 ||
    urlPathIsCdnCgi ||
    urlHasCfChlQuery ||
    titleLooksLikeInterstitial

  const isChallenge = Boolean(
    hasStrongMarker || (score >= 3 && hasSupportMarker),
  )

  return {
    isChallenge,
    score,
    reasons,
    title,
    url: currentUrl,
  }
}

/**
 * Registers content-script message handlers for fetching storage data,
 * checking guard status, relaying temp fetches, etc.
 * Each branch replies via sendResponse so browser.runtime ports stay alive.
 */
export function setupContentMessageHandlers() {
  browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === "getLocalStorage") {
      try {
        const { key } = request

        if (key) {
          const value = localStorage.getItem(key)
          sendResponse({ success: true, data: { [key]: value } })
        } else {
          const localStorage = window.localStorage
          const data: Record<string, any> = {}

          for (let i = 0; i < localStorage.length; i++) {
            const storageKey = localStorage.key(i)
            if (storageKey) {
              data[storageKey] = localStorage.getItem(storageKey)
            }
          }

          sendResponse({ success: true, data })
        }
      } catch (error) {
        sendResponse({ success: false, error: getErrorMessage(error) })
      }
      return true
    }

    if (request.action === "getUserFromLocalStorage") {
      ;(async () => {
        try {
          const userStr = localStorage.getItem("user")
          const user = userStr
            ? JSON.parse(userStr)
            : await getApiService(undefined).fetchUserInfo(request.url)

          if (!user || !user.id) {
            sendResponse({
              success: false,
              error: t("messages:content.userInfoNotFound"),
            })
            return
          }

          sendResponse({ success: true, data: { userId: user.id, user } })
        } catch (error) {
          sendResponse({ success: false, error: getErrorMessage(error) })
        }
      })()
      return true
    }

    if (request.action === "checkCloudflareGuard") {
      try {
        const detection = detectCloudflareChallengePage()
        const passed = !detection.isChallenge

        if (request.requestId) {
          logCloudflareGuard("check", {
            requestId: request.requestId,
            origin: (() => {
              try {
                return window.location.origin
              } catch {
                return null
              }
            })(),
            title: detection.title,
            passed,
            detection,
          })
        }

        sendResponse({ success: true, passed, detection })
      } catch (error) {
        if (request.requestId) {
          logCloudflareGuard("checkError", {
            requestId: request.requestId,
            error: getErrorMessage(error),
          })
        }
        sendResponse({ success: false, error: getErrorMessage(error) })
      }
      return true
    }

    if (request.action === "waitAndGetUserInfo") {
      waitForUserInfo()
        .then((userInfo) => {
          sendResponse({ success: true, data: userInfo })
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message })
        })
      return true
    }

    if (request.action === "performTempWindowFetch") {
      ;(async () => {
        try {
          const {
            fetchUrl,
            fetchOptions = {},
            responseType = "json",
            requestId,
          } = request

          if (!fetchUrl) {
            throw new Error("Invalid fetch request")
          }

          if (requestId) {
            logCloudflareGuard("tempFetchStart", {
              requestId,
              fetchUrl: sanitizeUrlForLog(String(fetchUrl)),
              responseType,
            })
          }

          const normalizedOptions = normalizeFetchOptions(fetchOptions)
          normalizedOptions.credentials = "include"
          /**
           * 添加扩展标识头
           * 用于区分是来自扩展的请求，方便服务器做特殊处理
           * @see handleWebRequest
           */
          if (!normalizedOptions.headers) {
            normalizedOptions.headers = {}
          }
          ;(normalizedOptions.headers as Record<string, string>)[
            EXTENSION_HEADER_NAME
          ] = EXTENSION_HEADER_VALUE
          const response = await fetch(fetchUrl, normalizedOptions)

          const headers: Record<string, string> = {}
          response.headers.forEach((value, key) => {
            headers[key] = value
          })

          let data: any = null
          try {
            data = await parseResponseData(response, responseType)
          } catch (parseError) {
            console.warn("[Content] Failed to parse response:", parseError)
          }

          const errorMessage = response.ok
            ? undefined
            : typeof data === "string"
              ? data
              : data?.message
                ? data.message
                : JSON.stringify(data ?? {})

          sendResponse({
            success: response.ok,
            status: response.status,
            headers,
            data,
            error: errorMessage,
          })

          if (requestId) {
            logCloudflareGuard("tempFetchDone", {
              requestId,
              fetchUrl: sanitizeUrlForLog(String(fetchUrl)),
              ok: response.ok,
              status: response.status,
            })
          }
        } catch (error) {
          if (request.requestId) {
            logCloudflareGuard("tempFetchError", {
              requestId: request.requestId,
              fetchUrl: request.fetchUrl
                ? sanitizeUrlForLog(String(request.fetchUrl))
                : null,
              error: getErrorMessage(error),
            })
          }
          sendResponse({ success: false, error: getErrorMessage(error) })
        }
      })()
      return true
    }
  })
}

/**
 * Polls localStorage for user info until available or until timeout elapses.
 * @param maxWaitTime Maximum wait duration in ms before rejecting.
 * @returns User ID and parsed user payload once retrieved.
 */
async function waitForUserInfo(
  maxWaitTime = 5000,
): Promise<{ userId: string; user: any }> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const userStr = localStorage.getItem("user")
      if (userStr) {
        const user = JSON.parse(userStr)
        if (user.id) {
          return { userId: user.id, user }
        }
      }
    } catch (error) {
      console.error(error)
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(t("messages:content.waitUserInfoTimeout"))
}

type TempWindowResponseType = "json" | "text" | "arrayBuffer" | "blob"

/**
 * Normalizes fetch options coming from background scripts.
 * Ensures headers are sanitized and mutations do not affect original objects.
 * @param options Raw RequestInit payload.
 */
function normalizeFetchOptions(options: RequestInit = {}): RequestInit {
  const normalized: RequestInit = { ...options }

  if (options.headers) {
    normalized.headers = sanitizeHeaders(options.headers)
  }

  return normalized
}

/**
 * Converts various header inputs to a plain object accepted by fetch.
 * @param headers Headers instance, tuple array, or object.
 * @returns Plain key/value header map.
 */
function sanitizeHeaders(headers: HeadersInit): Record<string, string> {
  if (headers instanceof Headers) {
    const result: Record<string, string> = {}
    headers.forEach((value, key) => {
      result[key] = value
    })
    return result
  }

  if (Array.isArray(headers)) {
    return headers.reduce(
      (acc, [key, value]) => {
        acc[key] = value
        return acc
      },
      {} as Record<string, string>,
    )
  }

  return Object.entries(headers).reduce(
    (acc, [key, value]) => {
      if (value != null) {
        acc[key] = String(value)
      }
      return acc
    },
    {} as Record<string, string>,
  )
}

/**
 * Parses a fetch Response according to the requested responseType.
 * Falls back to text when JSON parsing fails to avoid throwing.
 */
async function parseResponseData(
  response: Response,
  responseType: TempWindowResponseType,
) {
  switch (responseType) {
    case "text":
      return await response.text()
    case "arrayBuffer": {
      const buffer = await response.arrayBuffer()
      return Array.from(new Uint8Array(buffer))
    }
    case "blob": {
      const blob = await response.blob()
      const blobBuffer = await blob.arrayBuffer()
      return { data: Array.from(new Uint8Array(blobBuffer)), type: blob.type }
    }
    case "json":
    default: {
      const text = await response.text()
      try {
        return JSON.parse(text)
      } catch (error) {
        console.warn(
          "[Content] Failed to parse JSON response, fallback to text",
          error,
        )
        return text
      }
    }
  }
}
