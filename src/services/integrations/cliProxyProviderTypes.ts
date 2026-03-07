import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import type { DisplaySiteData } from "~/types"
import {
  normalizeUrlPathname,
  transformNormalizedUrlPath,
} from "~/utils/core/urlParsing"

export const CLI_PROXY_PROVIDER_TYPES = {
  OPENAI_COMPATIBILITY: "openai-compatibility",
  CODEX_API_KEY: "codex-api-key",
  CLAUDE_API_KEY: "claude-api-key",
  GEMINI_API_KEY: "gemini-api-key",
} as const

export type CliProxyProviderType =
  (typeof CLI_PROXY_PROVIDER_TYPES)[keyof typeof CLI_PROXY_PROVIDER_TYPES]

export type CliProxyModelMapping = {
  name: string
  alias?: string
}

type CliProxyProviderMetadata = {
  baseUrlRequired: boolean
  fieldKey: string
  labelKey: string
  descriptionKey: string
  baseUrlDescriptionKey: string
  baseUrlPlaceholderKey: string
  providerNameVisible: boolean
  supportsModelSuggestions: boolean
}

export const cliProxyProviderMetadata: Record<
  CliProxyProviderType,
  CliProxyProviderMetadata
> = {
  [CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY]: {
    baseUrlRequired: true,
    fieldKey: "openaiCompatibility",
    labelKey: "ui:dialog.cliproxy.providerTypes.openaiCompatibility.label",
    descriptionKey:
      "ui:dialog.cliproxy.providerTypes.openaiCompatibility.description",
    baseUrlDescriptionKey:
      "ui:dialog.cliproxy.descriptions.baseUrlOpenAICompatibility",
    baseUrlPlaceholderKey:
      "ui:dialog.cliproxy.placeholders.baseUrlOpenAICompatibility",
    providerNameVisible: true,
    supportsModelSuggestions: true,
  },
  [CLI_PROXY_PROVIDER_TYPES.CODEX_API_KEY]: {
    baseUrlRequired: true,
    fieldKey: "codexApiKey",
    labelKey: "ui:dialog.cliproxy.providerTypes.codexApiKey.label",
    descriptionKey: "ui:dialog.cliproxy.providerTypes.codexApiKey.description",
    baseUrlDescriptionKey: "ui:dialog.cliproxy.descriptions.baseUrlCodexApiKey",
    baseUrlPlaceholderKey: "ui:dialog.cliproxy.placeholders.baseUrlCodexApiKey",
    providerNameVisible: false,
    supportsModelSuggestions: true,
  },
  [CLI_PROXY_PROVIDER_TYPES.CLAUDE_API_KEY]: {
    baseUrlRequired: false,
    fieldKey: "claudeApiKey",
    labelKey: "ui:dialog.cliproxy.providerTypes.claudeApiKey.label",
    descriptionKey: "ui:dialog.cliproxy.providerTypes.claudeApiKey.description",
    baseUrlDescriptionKey:
      "ui:dialog.cliproxy.descriptions.baseUrlClaudeApiKey",
    baseUrlPlaceholderKey:
      "ui:dialog.cliproxy.placeholders.baseUrlClaudeApiKey",
    providerNameVisible: false,
    supportsModelSuggestions: true,
  },
  [CLI_PROXY_PROVIDER_TYPES.GEMINI_API_KEY]: {
    baseUrlRequired: false,
    fieldKey: "geminiApiKey",
    labelKey: "ui:dialog.cliproxy.providerTypes.geminiApiKey.label",
    descriptionKey: "ui:dialog.cliproxy.providerTypes.geminiApiKey.description",
    baseUrlDescriptionKey:
      "ui:dialog.cliproxy.descriptions.baseUrlGeminiApiKey",
    baseUrlPlaceholderKey:
      "ui:dialog.cliproxy.placeholders.baseUrlGeminiApiKey",
    providerNameVisible: false,
    supportsModelSuggestions: true,
  },
}

const OPENAI_REQUEST_SUFFIXES = [
  "/audio/speech",
  "/audio/transcriptions",
  "/chat/completions",
  "/completions",
  "/embeddings",
  "/images/generations",
  "/models",
  "/moderations",
  "/responses",
] as const

const CODEX_REQUEST_SUFFIXES = [
  "/v1/chat/completions",
  "/chat/completions",
  "/v1/responses",
  "/responses",
] as const

/**
 * Ensures that the given pathname ends with the specified suffix, adding it if necessary.
 */
function ensurePathSuffix(pathname: string, suffix: string) {
  const normalizedPath = normalizeUrlPathname(pathname)
  if (normalizedPath === suffix || normalizedPath.endsWith(suffix)) {
    return normalizedPath
  }
  if (normalizedPath === "/") {
    return suffix
  }
  return `${normalizedPath}${suffix}`
}

/**
 * Removes the specified suffix from the end of the given pathname, if it exists.
 */
function stripTrailingSuffix(pathname: string, suffix: string) {
  const normalizedPath = normalizeUrlPathname(pathname)
  if (!normalizedPath.endsWith(suffix)) {
    return normalizedPath
  }
  const nextPath = normalizedPath.slice(0, -suffix.length)
  return nextPath || "/"
}

/**
 * Removes known OpenAI request path suffixes from the given pathname, if present.
 */
function stripOpenAIRequestPath(pathname: string) {
  let nextPath = normalizeUrlPathname(pathname)

  for (const suffix of OPENAI_REQUEST_SUFFIXES) {
    if (nextPath.endsWith(suffix)) {
      nextPath = nextPath.slice(0, -suffix.length) || "/"
      break
    }
  }

  return nextPath
}

/**
 * Normalizes the base URL for OpenAI-compatible providers by stripping known request paths
 */
function normalizeOpenAICompatibilityBaseUrl(baseUrl: string) {
  return transformNormalizedUrlPath(baseUrl, (pathname) =>
    ensurePathSuffix(stripOpenAIRequestPath(pathname), "/v1"),
  )
}

/**
 * Normalizes the base URL for Claude providers by stripping the "/v1/messages" suffix if present,
 */
function normalizeClaudeBaseUrl(baseUrl: string) {
  return transformNormalizedUrlPath(baseUrl, (pathname) => {
    const normalizedPath = normalizeUrlPathname(pathname)
    if (!normalizedPath.endsWith("/v1/messages")) {
      return normalizedPath
    }

    const nextPath = normalizedPath.slice(0, -"/v1/messages".length)
    return nextPath || "/"
  })
}

/**
 * Normalizes the base URL for Gemini providers by stripping known request paths and version segments
 */
function normalizeGeminiBaseUrl(baseUrl: string) {
  return transformNormalizedUrlPath(baseUrl, (pathname) => {
    const normalizedPath = normalizeUrlPathname(pathname)
    const match = normalizedPath.match(
      /^(.*)\/v\d+(?:beta)?\/models(?:\/[^/]+(?:[:/][^/]+)?)?$/i,
    )

    if (!match) {
      return normalizedPath
    }

    const nextPath = match[1]
    return nextPath || "/"
  })
}

/**
 * Normalizes the base URL for Codex providers by stripping known request paths and version segments
 */
function normalizeCodexBaseUrl(baseUrl: string) {
  return transformNormalizedUrlPath(baseUrl, (pathname) => {
    const normalizedPath = normalizeUrlPathname(pathname)
    const codexBackendIndex = normalizedPath.indexOf("/backend-api/codex")
    if (codexBackendIndex >= 0) {
      const nextPath = normalizedPath.slice(0, codexBackendIndex)
      return nextPath || "/"
    }

    for (const suffix of CODEX_REQUEST_SUFFIXES) {
      if (normalizedPath.endsWith(suffix)) {
        const withoutRequestPath =
          normalizedPath.slice(0, -suffix.length) || "/"
        return stripTrailingSuffix(withoutRequestPath, "/v1")
      }
    }

    return normalizedPath
  })
}

/**
 * Normalizes the CLI proxy provider base URL based on the provider type, applying specific transformations
 */
export function normalizeCliProxyProviderBaseUrl(
  providerType: CliProxyProviderType,
  baseUrl?: string | null,
) {
  const trimmedBaseUrl = baseUrl?.trim() ?? ""
  if (!trimmedBaseUrl) return ""

  switch (providerType) {
    case CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY:
      return normalizeOpenAICompatibilityBaseUrl(trimmedBaseUrl)
    case CLI_PROXY_PROVIDER_TYPES.CLAUDE_API_KEY:
      return normalizeClaudeBaseUrl(trimmedBaseUrl)
    case CLI_PROXY_PROVIDER_TYPES.GEMINI_API_KEY:
      return normalizeGeminiBaseUrl(trimmedBaseUrl)
    case CLI_PROXY_PROVIDER_TYPES.CODEX_API_KEY:
      return normalizeCodexBaseUrl(trimmedBaseUrl)
  }
}

/**
 * Reads the base URL from the account data, handling both string and DisplaySiteData formats.
 */
function readAccountBaseUrl(account: DisplaySiteData | string) {
  return typeof account === "string" ? account : account.baseUrl
}

/**
 * Builds the default CLI proxy provider base URL by reading it from the account data and normalizing it based on the provider type.
 */
export function buildDefaultCliProxyProviderBaseUrl(
  providerType: CliProxyProviderType,
  account: DisplaySiteData | string,
) {
  const accountBaseUrl = readAccountBaseUrl(account).trim()
  if (!accountBaseUrl) return ""

  return normalizeCliProxyProviderBaseUrl(providerType, accountBaseUrl)
}

/**
 * Maps an API type hint to the corresponding CLI proxy provider type, defaulting to OPENAI_COMPATIBILITY if the hint is unrecognized or not provided.
 */
export function mapApiTypeHintToCliProxyProviderType(
  apiTypeHint?: ApiVerificationApiType | null,
): CliProxyProviderType {
  switch (apiTypeHint) {
    case API_TYPES.OPENAI:
      return CLI_PROXY_PROVIDER_TYPES.CODEX_API_KEY
    case API_TYPES.ANTHROPIC:
      return CLI_PROXY_PROVIDER_TYPES.CLAUDE_API_KEY
    case API_TYPES.GOOGLE:
      return CLI_PROXY_PROVIDER_TYPES.GEMINI_API_KEY
    case API_TYPES.OPENAI_COMPATIBLE:
    default:
      return CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY
  }
}

/**
 * Generates a user-friendly display name for a CLI proxy provider based on its type, optional base URL and provider name, and a translation function for localization.
 */
export function getCliProxyProviderDisplayName(
  providerType: CliProxyProviderType,
  options: {
    providerBaseUrl?: string | null
    providerName?: string | null
  },
  translate: (key: string) => string,
) {
  const { providerBaseUrl, providerName } = options
  const normalizedName = providerName?.trim() ?? ""

  if (
    providerType === CLI_PROXY_PROVIDER_TYPES.OPENAI_COMPATIBILITY &&
    normalizedName
  ) {
    return normalizedName
  }

  const label = translate(cliProxyProviderMetadata[providerType].labelKey)
  const normalizedBaseUrl = normalizeCliProxyProviderBaseUrl(
    providerType,
    providerBaseUrl,
  )

  if (!normalizedBaseUrl) {
    return label
  }

  return `${label} (${normalizedBaseUrl})`
}
