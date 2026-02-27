import { t } from "i18next"
import toast from "react-hot-toast"

import type { ApiToken, DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/logger"
import { normalizeHttpUrl } from "~/utils/url"

/**
 * Unified logger scoped to CC Switch deeplink integration.
 */
const logger = createLogger("CcSwitch")

/**
 * Supported CC Switch client identifiers.
 */
export const CCSWITCH_APPS = ["claude", "codex", "gemini"] as const
export type CCSwitchApp = (typeof CCSWITCH_APPS)[number]

/**
 * Minimal payload required by CC Switch deeplink import protocol.
 */
export interface CCSwitchDeeplinkPayload {
  app: CCSwitchApp
  name: string
  homepage: string
  endpoint: string
  apiKey: string
  model?: string
  notes?: string
}

/**
 * Options for opening in CC Switch
 * @see https://github.com/farion1231/cc-switch/blob/99b5f881e8efb0fe14953081640a997b635af19c/src-tauri/src/deeplink.rs#L19
 */
export interface OpenInCCSwitchOptions {
  account: DisplaySiteData
  token: ApiToken
  app: CCSwitchApp
  model?: string
  notes?: string
  name?: string
  homepage?: string
  endpoint?: string
}

/**
 * Build the CC Switch deeplink from the provided payload.
 * @param payload Structured payload including provider metadata.
 * @returns Formatted ccswitch:// URL.
 */
export function generateCCSwitchURL(payload: CCSwitchDeeplinkPayload) {
  const params = new URLSearchParams()
  params.set("resource", "provider")
  params.set("app", payload.app)
  params.set("name", payload.name)
  params.set("homepage", payload.homepage)
  params.set("endpoint", payload.endpoint)
  params.set("apiKey", payload.apiKey)

  if (payload.model) {
    params.set("model", payload.model)
  }
  if (payload.notes) {
    params.set("notes", payload.notes)
  }

  return `ccswitch://v1/import?${params.toString()}`
}

/**
 * Attempt to open the CC Switch desktop client via deeplink.
 * Validates inputs, normalizes URLs, and surfaces toast feedback.
 * @param options Caller supplied account/token context.
 * @returns Whether the operation was initiated successfully.
 */
export function openInCCSwitch(options: OpenInCCSwitchOptions) {
  const {
    account,
    token,
    app,
    model,
    notes,
    name,
    homepage: homepageOverride,
    endpoint: endpointOverride,
  } = options

  if (!account || !token) {
    toast.error(t("messages:ccswitch.missingCredentials"))
    return false
  }

  if (!CCSWITCH_APPS.includes(app)) {
    toast.error(t("messages:ccswitch.invalidApp"))
    return false
  }

  const normalizedEndpoint = normalizeHttpUrl(
    endpointOverride ?? account.baseUrl,
  )
  if (!normalizedEndpoint) {
    toast.error(t("messages:ccswitch.invalidEndpoint"))
    return false
  }

  const homepage = normalizeHttpUrl(homepageOverride ?? account.baseUrl)
  if (!homepage) {
    toast.error(t("messages:ccswitch.invalidHomepage"))
    return false
  }

  if (!token.key) {
    toast.error(t("messages:ccswitch.missingCredentials"))
    return false
  }

  const deeplink = generateCCSwitchURL({
    app,
    name: name?.trim() || account.name,
    homepage,
    endpoint: normalizedEndpoint,
    apiKey: token.key,
    model,
    notes,
  })

  try {
    window.open(deeplink, "_blank")
    toast.success(t("messages:ccswitch.attemptingRedirect"))
    return true
  } catch (error) {
    logger.warn("Failed to open deep link", error)
    toast.error(t("messages:ccswitch.unableToOpen"))
    return false
  }
}
