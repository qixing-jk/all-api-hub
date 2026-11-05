import toast from "~/lib/notify"
import type { CredentialExportData } from "~/services/integrations/credentialExport"
import { createLogger } from "~/utils/core/logger"
import { normalizeHttpUrl } from "~/utils/core/url"
import { t } from "~/utils/i18n/core"

/**
 * Unified logger scoped to CC Switch deeplink integration.
 */
const logger = createLogger("CcSwitch")

/**
 * Supported CC Switch client identifiers.
 */
export const CCSWITCH_APP_IDS = {
  ClaudeCode: "claude",
  ClaudeDesktop: "claude-desktop",
  Codex: "codex",
  Gemini: "gemini",
  Antigravity: "agy",
  Pi: "pi",
  MiniMaxCode: "mcode",
  KimiCode: "kimi",
  DeepSeekHarness: "dsh",
  OhMyPi: "omp",
  GrokBuild: "grokbuild",
  Hermes: "hermes",
  OpenCode: "opencode",
  OpenClaw: "openclaw",
} as const

export const CCSWITCH_APPS = [
  CCSWITCH_APP_IDS.ClaudeCode,
  CCSWITCH_APP_IDS.ClaudeDesktop,
  CCSWITCH_APP_IDS.Codex,
  CCSWITCH_APP_IDS.Gemini,
  CCSWITCH_APP_IDS.Antigravity,
  CCSWITCH_APP_IDS.Pi,
  CCSWITCH_APP_IDS.MiniMaxCode,
  CCSWITCH_APP_IDS.KimiCode,
  CCSWITCH_APP_IDS.DeepSeekHarness,
  CCSWITCH_APP_IDS.OhMyPi,
  CCSWITCH_APP_IDS.GrokBuild,
  CCSWITCH_APP_IDS.Hermes,
  CCSWITCH_APP_IDS.OpenCode,
  CCSWITCH_APP_IDS.OpenClaw,
] as const
export type CCSwitchApp = (typeof CCSWITCH_APPS)[number]

const appsRequiringModel = new Set<CCSwitchApp>([
  CCSWITCH_APP_IDS.Pi,
  CCSWITCH_APP_IDS.MiniMaxCode,
  CCSWITCH_APP_IDS.KimiCode,
  CCSWITCH_APP_IDS.DeepSeekHarness,
  CCSWITCH_APP_IDS.OhMyPi,
])

/**
 * These importers reject links without a model.
 * @see https://github.com/farion1231/cc-switch/blob/v4.0.26/src-tauri/src/deeplink/parser.rs
 */
export const ccSwitchRequiresModel = (app: CCSwitchApp) =>
  appsRequiringModel.has(app)

// CC Switch's Hermes importer fixes api_mode to chat_completions and derives
// the provider ID from name, while ProviderForm requires ^[a-z0-9]+(-[a-z0-9]+)*$.
// Sources: src-tauri/src/deeplink/{provider.rs,mod.rs},
// src/components/providers/forms/ProviderForm.tsx
// https://github.com/farion1231/cc-switch

/**
 * Minimal payload required by CC Switch deeplink import protocol.
 */
interface CCSwitchDeeplinkPayload {
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
interface OpenInCCSwitchOptions {
  credential: Pick<CredentialExportData, "providerName" | "baseUrl" | "apiKey">
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
function generateCCSwitchURL(payload: CCSwitchDeeplinkPayload) {
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

const toHermesProviderSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

const normalizeHermesProviderName = (name: string, endpoint: string) =>
  toHermesProviderSlug(name) ||
  toHermesProviderSlug(new URL(endpoint).hostname) ||
  "provider"

/**
 * Attempt to open the CC Switch desktop client via deeplink.
 * Validates inputs, normalizes URLs, and surfaces toast feedback.
 * @param options Caller supplied credential and target settings.
 * @returns Whether the operation was initiated successfully.
 */
export function openInCCSwitch(options: OpenInCCSwitchOptions) {
  const {
    credential,
    app,
    model,
    notes,
    name,
    homepage: homepageOverride,
    endpoint: endpointOverride,
  } = options

  if (!credential) {
    toast.error(t("messages:ccswitch.missingCredentials"))
    return false
  }

  if (!CCSWITCH_APPS.includes(app)) {
    toast.error(t("messages:ccswitch.invalidApp"))
    return false
  }

  if (ccSwitchRequiresModel(app) && !model?.trim()) {
    toast.error(t("ui:dialog.ccswitch.notices.modelRequired"))
    return false
  }

  const normalizedEndpoint = normalizeHttpUrl(
    endpointOverride ?? credential.baseUrl,
  )
  if (!normalizedEndpoint) {
    toast.error(t("messages:ccswitch.invalidEndpoint"))
    return false
  }

  const homepage = normalizeHttpUrl(homepageOverride ?? credential.baseUrl)
  if (!homepage) {
    toast.error(t("messages:ccswitch.invalidHomepage"))
    return false
  }

  if (!credential.apiKey) {
    toast.error(t("messages:ccswitch.missingCredentials"))
    return false
  }

  const providerName = name?.trim() || credential.providerName
  const deeplink = generateCCSwitchURL({
    app,
    name:
      app === CCSWITCH_APP_IDS.Hermes
        ? normalizeHermesProviderName(providerName, normalizedEndpoint)
        : providerName,
    homepage,
    endpoint: normalizedEndpoint,
    apiKey: credential.apiKey,
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
