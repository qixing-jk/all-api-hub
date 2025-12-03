import { t } from "i18next"
import toast from "react-hot-toast"

import type { ApiToken, DisplaySiteData } from "~/types"

export const CCSWITCH_APPS = ["claude", "codex", "gemini"] as const
export type CCSwitchApp = (typeof CCSWITCH_APPS)[number]

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

function normalizeUrl(url: string | undefined | null) {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null

  const prefixed = /^(https?:)?\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    const parsed = new URL(prefixed)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    return parsed.toString().replace(/\/$/, "")
  } catch (error) {
    console.error("[ccSwitch] Invalid URL: ", error)
    return null
  }
}

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

  const endpoint = normalizeUrl(endpointOverride ?? account.baseUrl)
  if (!endpoint) {
    toast.error(t("messages:ccswitch.invalidEndpoint"))
    return false
  }

  const homepage = normalizeUrl(homepageOverride ?? account.baseUrl)
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
    endpoint,
    apiKey: token.key,
    model,
    notes,
  })

  try {
    window.open(deeplink, "_blank")
    toast.success(t("messages:ccswitch.attemptingRedirect"))
    return true
  } catch (error) {
    console.error("[ccSwitch] Failed to open deep link", error)
    toast.error(t("messages:ccswitch.unableToOpen"))
    return false
  }
}
