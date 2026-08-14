import toast from "react-hot-toast"

import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import { encodeUtf8Base64 } from "~/utils/core/base64"
import { createLogger } from "~/utils/core/logger"
import { coerceBaseUrlToPathSuffix } from "~/utils/core/url"
import { t } from "~/utils/i18n/core"

const logger = createLogger("Kelivo")

const KELIVO_SHARE_CODE_PREFIX = "ai-provider:v1:"
const KELIVO_GOOGLE_API_ORIGIN = "https://generativelanguage.googleapis.com"
export const KELIVO_GOOGLE_BASE_URL = `${KELIVO_GOOGLE_API_ORIGIN}/v1beta`

const KELIVO_PROVIDER_TYPES = {
  Claude: "claude",
  Google: "google",
  OpenAI: "openai",
} as const

type KelivoProviderType =
  (typeof KELIVO_PROVIDER_TYPES)[keyof typeof KELIVO_PROVIDER_TYPES]

export interface KelivoProviderExportInput {
  apiType: ApiVerificationApiType
  name: string
  baseUrl: string
  apiKey: string
}

interface KelivoProviderSharePayload {
  type: KelivoProviderType
  name: string
  apiKey: string
  baseUrl?: string
}

const KELIVO_EXPORT_ERROR_CODES = {
  CopyFailed: "copyFailed",
  CustomGoogleEndpoint: "customGoogleEndpoint",
  InvalidBaseUrl: "invalidBaseUrl",
  MissingCredentials: "missingCredentials",
  UnsupportedApiType: "unsupportedApiType",
} as const

type KelivoExportErrorCode =
  (typeof KELIVO_EXPORT_ERROR_CODES)[keyof typeof KELIVO_EXPORT_ERROR_CODES]

class KelivoExportError extends Error {
  constructor(
    readonly code: KelivoExportErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "KelivoExportError"
  }
}

/** Parse and validate a Base URL before placing it in a portable share code. */
function parseHttpBaseUrl(baseUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(baseUrl.trim())
  } catch {
    throw new KelivoExportError(
      KELIVO_EXPORT_ERROR_CODES.InvalidBaseUrl,
      "Kelivo export requires a valid Base URL",
    )
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new KelivoExportError(
      KELIVO_EXPORT_ERROR_CODES.InvalidBaseUrl,
      "Kelivo export requires an HTTP or HTTPS Base URL without credentials, query, or fragment",
    )
  }

  return parsed
}

/** Check whether a Base URL can be represented safely in a Kelivo share code. */
export function isValidKelivoBaseUrl(baseUrl: string): boolean {
  try {
    parseHttpBaseUrl(baseUrl)
    return true
  } catch {
    return false
  }
}

/** Map the app's verification protocols to Kelivo's provider type names. */
function resolveKelivoProviderType(
  apiType: ApiVerificationApiType,
): KelivoProviderType {
  switch (apiType) {
    case API_TYPES.OPENAI:
    case API_TYPES.OPENAI_COMPATIBLE:
      return KELIVO_PROVIDER_TYPES.OpenAI
    case API_TYPES.ANTHROPIC:
      return KELIVO_PROVIDER_TYPES.Claude
    case API_TYPES.GOOGLE:
      return KELIVO_PROVIDER_TYPES.Google
    default:
      throw new KelivoExportError(
        KELIVO_EXPORT_ERROR_CODES.UnsupportedApiType,
        `Unsupported Kelivo API type: ${String(apiType)}`,
      )
  }
}

/** Prepare editable defaults without constraining later user customization. */
export function createKelivoProviderExportDraft(
  input: KelivoProviderExportInput,
): KelivoProviderExportInput {
  const apiType =
    input.apiType === API_TYPES.OPENAI
      ? API_TYPES.OPENAI_COMPATIBLE
      : input.apiType

  return {
    ...input,
    apiType,
    baseUrl:
      apiType === API_TYPES.GOOGLE
        ? KELIVO_GOOGLE_BASE_URL
        : coerceBaseUrlToPathSuffix(input.baseUrl, "/v1"),
  }
}

/**
 * Build the provider share code consumed by Kelivo v1.2.1.
 *
 * Contract source: https://github.com/Chevey339/kelivo/blob/dae00af67681242f820ddfb9c7ea9ead35dcab5b/lib/features/provider/widgets/import_provider_sheet.dart
 * Kelivo accepts `ai-provider:v1:<base64(utf8-json)>`, maps only
 * openai/claude/google provider types, forces imported OpenAI providers to
 * Chat Completions, and deliberately ignores Google baseUrl.
 */
export function buildKelivoProviderShareCode(
  input: KelivoProviderExportInput,
): string {
  const name = input.name.trim()
  const apiKey = input.apiKey.trim()
  if (!name || !apiKey) {
    throw new KelivoExportError(
      KELIVO_EXPORT_ERROR_CODES.MissingCredentials,
      "Kelivo export requires a provider name and complete API key",
    )
  }

  const type = resolveKelivoProviderType(input.apiType)
  const parsedBaseUrl = parseHttpBaseUrl(input.baseUrl)
  const payload: KelivoProviderSharePayload = { type, name, apiKey }

  if (type === KELIVO_PROVIDER_TYPES.Google) {
    if (parsedBaseUrl.origin !== KELIVO_GOOGLE_API_ORIGIN) {
      throw new KelivoExportError(
        KELIVO_EXPORT_ERROR_CODES.CustomGoogleEndpoint,
        "Kelivo cannot preserve a custom Google API endpoint",
      )
    }
  } else {
    payload.baseUrl = parsedBaseUrl.toString().replace(/\/$/, "")
  }

  return `${KELIVO_SHARE_CODE_PREFIX}${encodeUtf8Base64(JSON.stringify(payload))}`
}

/** Select safe localized feedback without exposing credential-bearing input. */
function getKelivoExportErrorMessage(error: unknown): string {
  if (!(error instanceof KelivoExportError)) {
    return t("messages:kelivo.copyFailed")
  }

  switch (error.code) {
    case KELIVO_EXPORT_ERROR_CODES.CustomGoogleEndpoint:
      return t("messages:kelivo.customGoogleEndpointUnsupported")
    case KELIVO_EXPORT_ERROR_CODES.InvalidBaseUrl:
      return t("messages:kelivo.invalidBaseUrl")
    case KELIVO_EXPORT_ERROR_CODES.MissingCredentials:
      return t("messages:kelivo.missingCredentials")
    case KELIVO_EXPORT_ERROR_CODES.UnsupportedApiType:
      return t("messages:kelivo.unsupportedApiType")
    case KELIVO_EXPORT_ERROR_CODES.CopyFailed:
      return t("messages:kelivo.copyFailed")
  }
}

/** Build and copy a Kelivo provider share code with actionable feedback. */
export async function copyKelivoProviderShareCode(
  input: KelivoProviderExportInput,
): Promise<boolean> {
  try {
    const shareCode = buildKelivoProviderShareCode(input)
    if (!navigator.clipboard?.writeText) {
      throw new KelivoExportError(
        KELIVO_EXPORT_ERROR_CODES.CopyFailed,
        "Clipboard writing is unavailable",
      )
    }

    await navigator.clipboard.writeText(shareCode)
    toast.success(t("messages:kelivo.copied"))
    return true
  } catch (error) {
    logger.warn(
      "Failed to copy Kelivo import code",
      error instanceof Error ? error.name : typeof error,
    )
    toast.error(getKelivoExportErrorMessage(error))
    return false
  }
}
