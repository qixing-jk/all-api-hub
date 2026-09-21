import toast from "~/lib/notify"
import type { CredentialExportData } from "~/services/integrations/credentialExport"
import { createLogger } from "~/utils/core/logger"
import { normalizeHttpUrl } from "~/utils/core/url"
import { t } from "~/utils/i18n/core"

/**
 * Unified logger scoped to the AI Toolbox deeplink integration.
 */
const logger = createLogger("AiToolbox")

/**
 * Target app identifiers accepted by the `aitoolbox://` import parser.
 *
 * These are AI Toolbox's own ids and are NOT interchangeable with CC Switch's:
 * the same tool is `grok` here but `grokbuild` there. AI Toolbox rejects the
 * whole link with an unsupported-app error, so the list must stay per-target.
 * @see https://github.com/coulsontl/ai-toolbox/blob/v1.1.5/tauri/src/coding/deeplink/parser.rs
 */
export const AI_TOOLBOX_APPS = [
  "claude",
  "claudedesktop",
  "codex",
  "grok",
  "kimi",
  "gemini",
  "opencode",
  "openclaw",
  "pi",
  "omp",
  "hermes",
  "dsh",
] as const
export type AiToolboxApp = (typeof AI_TOOLBOX_APPS)[number]

/**
 * Whether the exported base URL already carries its version segment. Only
 * meaningful alongside a `sourceApp` that lets AI Toolbox re-derive the root.
 */
export const AI_TOOLBOX_BASE_URL_STYLES = {
  Root: "root",
  Versioned: "versioned",
} as const
export type AiToolboxBaseUrlStyle =
  (typeof AI_TOOLBOX_BASE_URL_STYLES)[keyof typeof AI_TOOLBOX_BASE_URL_STYLES]

/**
 * API protocols AI Toolbox can rebuild a provider around. Omitting the format
 * lets it use the target app's native protocol instead.
 * @see https://github.com/coulsontl/ai-toolbox/blob/v1.1.5/tauri/src/coding/deeplink/portable.rs
 */
export const AI_TOOLBOX_API_FORMATS = {
  AnthropicMessages: "anthropic_messages",
  OpenAIResponses: "openai_responses",
  OpenAIChat: "openai_chat",
  GeminiNative: "gemini_native",
} as const
export type AiToolboxApiFormat =
  (typeof AI_TOOLBOX_API_FORMATS)[keyof typeof AI_TOOLBOX_API_FORMATS]

/**
 * Minimal payload required by the AI Toolbox deeplink import protocol.
 * @see https://github.com/coulsontl/ai-toolbox/blob/v1.1.5/tauri/src/coding/deeplink/parser.rs
 */
interface AiToolboxDeeplinkPayload {
  app: AiToolboxApp
  name: string
  homepage: string
  baseUrl: string
  apiKey: string
  model?: string
  notes?: string
  apiFormat?: AiToolboxApiFormat
  baseUrlStyle?: AiToolboxBaseUrlStyle
}

/**
 * Options for opening a credential in AI Toolbox.
 */
interface OpenInAiToolboxOptions {
  credential: Pick<CredentialExportData, "providerName" | "baseUrl" | "apiKey">
  app: AiToolboxApp
  /** Connection URL to export. Defaults to the credential base URL. */
  endpoint?: string
  model?: string
  notes?: string
  name?: string
  homepage?: string
  apiFormat?: AiToolboxApiFormat
  baseUrlStyle?: AiToolboxBaseUrlStyle
}

/**
 * Build the AI Toolbox deeplink from the provided payload.
 *
 * AI Toolbox mirrors CC Switch's protocol but names the shared connection field
 * `baseUrl` where CC Switch uses `endpoint`.
 * @param payload Structured payload including provider metadata.
 * @returns Formatted aitoolbox:// URL.
 */
function generateAiToolboxURL(payload: AiToolboxDeeplinkPayload) {
  const params = new URLSearchParams()
  params.set("resource", "provider")
  params.set("app", payload.app)
  params.set("name", payload.name)
  params.set("homepage", payload.homepage)
  params.set("baseUrl", payload.baseUrl)
  params.set("apiKey", payload.apiKey)

  if (payload.model) {
    params.set("model", payload.model)
  }
  if (payload.notes) {
    params.set("notes", payload.notes)
  }
  if (payload.apiFormat) {
    params.set("apiFormat", payload.apiFormat)
  }
  if (payload.baseUrlStyle) {
    params.set("baseUrlStyle", payload.baseUrlStyle)
  }

  return `aitoolbox://v1/import?${params.toString()}`
}

/**
 * Attempt to open the AI Toolbox desktop client via deeplink.
 * Validates inputs, normalizes URLs, and surfaces toast feedback.
 * @param options Caller supplied credential and target settings.
 * @returns Whether the operation was initiated successfully.
 */
export function openInAiToolbox(options: OpenInAiToolboxOptions) {
  const {
    credential,
    app,
    model,
    notes,
    name,
    homepage: homepageOverride,
    endpoint: endpointOverride,
    apiFormat,
    baseUrlStyle,
  } = options

  if (!credential) {
    toast.error(t("messages:aiToolbox.missingCredentials"))
    return false
  }

  if (!AI_TOOLBOX_APPS.includes(app)) {
    toast.error(t("messages:aiToolbox.invalidApp"))
    return false
  }

  const normalizedBaseUrl = normalizeHttpUrl(
    endpointOverride ?? credential.baseUrl,
  )
  if (!normalizedBaseUrl) {
    toast.error(t("messages:aiToolbox.invalidBaseUrl"))
    return false
  }

  const homepage = normalizeHttpUrl(homepageOverride ?? credential.baseUrl)
  if (!homepage) {
    toast.error(t("messages:aiToolbox.invalidHomepage"))
    return false
  }

  if (!credential.apiKey) {
    toast.error(t("messages:aiToolbox.missingCredentials"))
    return false
  }

  const providerName = name?.trim() || credential.providerName
  const deeplink = generateAiToolboxURL({
    app,
    name: providerName,
    homepage,
    baseUrl: normalizedBaseUrl,
    apiKey: credential.apiKey,
    model: model?.trim() || undefined,
    notes: notes?.trim() || undefined,
    apiFormat,
    baseUrlStyle,
  })

  try {
    window.open(deeplink, "_blank")
    toast.success(t("messages:aiToolbox.attemptingRedirect"))
    return true
  } catch (error) {
    logger.warn("Failed to open deep link", error)
    toast.error(t("messages:aiToolbox.unableToOpen"))
    return false
  }
}
