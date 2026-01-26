import { RuntimeActionIds } from "~/constants/runtimeActions"
import { sendRuntimeMessage } from "~/utils/browserApi"

const CF_LOG_PREFIX = "[Content][CloudflareGuard]"

/**
 * Log Cloudflare guard events to console and extension background
 */
export function logCloudflareGuard(
  event: string,
  details?: Record<string, unknown>,
) {
  try {
    if (details && Object.keys(details).length > 0) {
      console.log(`${CF_LOG_PREFIX} ${event}`, details)
    } else {
      console.log(`${CF_LOG_PREFIX} ${event}`)
    }
  } catch {
    // ignore sanitizeUrlForLog errors
  }

  try {
    void sendRuntimeMessage({
      action: RuntimeActionIds.CloudflareGuardLog,
      event,
      details: details ?? null,
    }).catch(() => {})
  } catch {
    // ignore relay errors
  }
}

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
export function detectCloudflareChallengePage(): CloudflareChallengeDetection {
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
