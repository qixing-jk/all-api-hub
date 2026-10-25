import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { PMAPI_ENDPOINTS } from "./constants"
import { fetchPmApiEnvelope, invalidPmApiResponse } from "./transport"

export type PmApiStatus = {
  name: string
  notice: string
  /** Announcement rows as published; `{title, content}` per the console bar. */
  announcements: unknown[]
  checkinEnabled: boolean
  /** Whether the deployment gates protected POSTs behind its own slider. */
  captchaEnabled: boolean
  captchaScenes: string[]
  /**
   * Whether claiming the daily grant needs the site's own human verification.
   * Verified live on pap.pmcat.top: the POST answers 请先完成人机验证, so an
   * automated claim cannot succeed without the operator finishing the slider.
   */
  requiresManualVerification: boolean
  /**
   * Whether the deployment offers the daily grant. A `checkin` captcha scene
   * does not change this: the site then answers `请先完成人机验证` on the POST
   * (verified live), which execution reports as manual verification instead
   * of hiding the method.
   */
  autoCheckinSupported: boolean
  registerEnabled: boolean
  /** Console CNY price of 1 USD credit; `0` when not published. */
  usdRate: number
  raw: unknown
}

/**
 * The public deployment status; it answers without credentials, so both
 * deployments are readable without a saved account.
 */
export async function fetchPmApiStatus(
  request: ApiServiceRequest,
): Promise<PmApiStatus> {
  const envelope = await fetchPmApiEnvelope(
    // A no-auth probe must not reuse account credentials' observer state.
    { ...request, auth: { ...request.auth, accessToken: undefined } },
    PMAPI_ENDPOINTS.Status,
  )
  const data = envelope.data
  if (!isRecord(data)) return invalidPmApiResponse(PMAPI_ENDPOINTS.Status)
  const captcha = isRecord(data.captcha) ? data.captcha : undefined
  const captchaEnabled = captcha?.enabled === true
  const captchaScenes = Array.isArray(captcha?.scenes)
    ? captcha.scenes.filter((scene) => typeof scene === "string")
    : []
  return {
    name: typeof data.name === "string" ? data.name : "",
    notice: typeof data.notice === "string" ? data.notice : "",
    announcements: Array.isArray(data.announcements) ? data.announcements : [],
    checkinEnabled: data.checkin_enabled === true,
    captchaEnabled,
    captchaScenes,
    requiresManualVerification:
      captchaEnabled && captchaScenes.includes("checkin"),
    registerEnabled: data.register_enabled === true,
    usdRate:
      typeof data.usd_rate === "number" && Number.isFinite(data.usd_rate)
        ? data.usd_rate
        : 0,
    raw: data,
    autoCheckinSupported: data.checkin_enabled === true,
  }
}

/** Per-deployment automated check-in support; see {@link PmApiStatus.autoCheckinSupported}. */
export async function fetchPmApiCheckInSupport(
  request: ApiServiceRequest,
): Promise<boolean | undefined> {
  return (await fetchPmApiStatus(request)).autoCheckinSupported
}
