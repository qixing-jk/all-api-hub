import { resolveDeploymentApiOrigin } from "~/constants/deploymentApiOrigins"
import { isAccountSiteType } from "~/constants/siteType"
import { getAccountSiteDefinitions } from "~/services/accountSiteDefinitions/registry"
import {
  toProtocolRoot,
  toVersionedProtocolMount,
} from "~/services/aiApi/protocolAddress"

import { getAccountSiteProductProfile } from "./registry"
import { normalizeAccountSiteProfileUrlForManagedChannel } from "./urls"

/**
 * One inference protocol expressed as its two usable addresses.
 *
 * Consumers disagree about who owns the version segment, so both are resolved
 * together from the same declaration and each caller takes the role it needs.
 */
export type AccountSiteInferenceAddresses = {
  /** Address without the version segment, for consumers that append it. */
  root: string
  /** Address with the version segment, for SDK and gateway consumers. */
  mount: string
}

/** Address roles for one saved account; the browser address remains its identity. */
export type AccountSiteAddresses = {
  browserBaseUrl: string
  managementApiBaseUrl: string
  inferenceApi: {
    openAiCompatible: AccountSiteInferenceAddresses
    anthropic?: AccountSiteInferenceAddresses
  }
}

/** Declared inference addresses as stored in a site definition (mount form). */
type DeclaredInferenceAddresses = {
  openAiCompatible: string
  anthropic?: string
}

/**
 * Declared multi-protocol mappings for well-known inference providers that are
 * not registered as full web-console account sites.
 */
const WELL_KNOWN_INFERENCE_PROVIDER_MAPPINGS: ReadonlyArray<{
  name: string
  matches: (url: URL) => boolean
  resolve: (url: URL, openAiCompatible: string) => DeclaredInferenceAddresses
}> = [
  // Volcengine Ark standard API (火山引擎方舟): OpenAI on /api/v3, Anthropic on /api/compatible
  {
    name: "volcengine-ark",
    matches: (url: URL) =>
      /(?:^|\.)volces\.com$/i.test(url.hostname) &&
      /^\/api\/v3(?:\/|$)/i.test(url.pathname),
    resolve: (url: URL, openAiCompatible: string) => ({
      openAiCompatible,
      anthropic: `${url.origin}/api/compatible`,
    }),
  },
  // Volcengine Ark Coding Plan (火山方舟 Coding Plan): OpenAI on /api/coding/v3,
  // Anthropic on /api/coding. A Coding Plan subscription key is only honored on
  // these reserved paths, not the standard /api/compatible endpoint.
  {
    name: "volcengine-ark-coding-plan",
    matches: (url: URL) =>
      /(?:^|\.)volces\.com$/i.test(url.hostname) &&
      /^\/api\/coding\/v3(?:\/|$)/i.test(url.pathname),
    resolve: (url: URL, openAiCompatible: string) => ({
      openAiCompatible,
      anthropic: `${url.origin}/api/coding`,
    }),
  },
]

/**
 * Resolves browser, management, and inference addresses for one saved account.
 *
 * Nothing here throws: an account whose stored URL cannot be parsed keeps that
 * URL as its addresses, exactly as the API transport does, so one bad account
 * cannot take down a dialog or an export flow.
 */
export function resolveAccountSiteAddresses(input: {
  siteType?: string
  siteUrl: string
}): AccountSiteAddresses {
  const browserBaseUrl = input.siteUrl.trim()
  const managementApiBaseUrl = resolveDeploymentApiOrigin(browserBaseUrl)
  const profile = isAccountSiteType(input.siteType)
    ? getAccountSiteProductProfile(input.siteType)
    : null
  const declaredInferenceUrls = profile?.urls.inferenceApiBaseUrls

  const rawOpenAiBaseUrl =
    declaredInferenceUrls?.openAiCompatible ??
    normalizeAccountSiteProfileUrlForManagedChannel({
      siteType: input.siteType,
      url: browserBaseUrl,
    })

  const rawAnthropicBaseUrl =
    declaredInferenceUrls?.anthropic ??
    findDeclaredInferenceMounts(rawOpenAiBaseUrl)?.anthropic

  return {
    browserBaseUrl,
    managementApiBaseUrl,
    inferenceApi: {
      openAiCompatible: resolveProtocolAddresses(
        "openai-compatible",
        rawOpenAiBaseUrl,
      ),
      ...(rawAnthropicBaseUrl
        ? {
            anthropic: resolveProtocolAddresses(
              "anthropic",
              rawAnthropicBaseUrl,
            ),
          }
        : {}),
    },
  }
}

/** Resolves both roles for one protocol address, tolerating an unusable URL. */
const resolveProtocolAddresses = (
  apiType: "openai-compatible" | "anthropic",
  rawUrl: string,
): AccountSiteInferenceAddresses => {
  const fallback = rawUrl.trim()
  return {
    root: toProtocolRoot(apiType, rawUrl) ?? fallback,
    mount: toVersionedProtocolMount(apiType, rawUrl) ?? fallback,
  }
}

/** Protocol roots declared for an OpenAI-compatible address, when known. */
export function findDeclaredInferenceRoots(
  openAiBaseUrl: string,
): DeclaredInferenceAddresses | undefined {
  const declared = findDeclaredInferenceMounts(openAiBaseUrl)
  if (!declared) return undefined

  return {
    openAiCompatible:
      toProtocolRoot("openai-compatible", declared.openAiCompatible) ??
      declared.openAiCompatible,
    ...(declared.anthropic
      ? {
          anthropic:
            toProtocolRoot("anthropic", declared.anthropic) ??
            declared.anthropic,
        }
      : {}),
  }
}

/** Finds declared multi-protocol mounts matching an OpenAI-compatible address. */
function findDeclaredInferenceMounts(
  openAiBaseUrl: string,
): DeclaredInferenceAddresses | undefined {
  const mount = toVersionedProtocolMount("openai-compatible", openAiBaseUrl)
  if (!mount) return undefined

  for (const definition of getAccountSiteDefinitions()) {
    const urls = definition.productProfile?.urls?.inferenceApiBaseUrls
    if (
      urls?.openAiCompatible &&
      toVersionedProtocolMount("openai-compatible", urls.openAiCompatible) ===
        mount
    ) {
      return {
        openAiCompatible: urls.openAiCompatible,
        ...(urls.anthropic ? { anthropic: urls.anthropic } : {}),
      }
    }
  }

  try {
    const parsed = new URL(mount)
    for (const mapping of WELL_KNOWN_INFERENCE_PROVIDER_MAPPINGS) {
      if (mapping.matches(parsed)) {
        return mapping.resolve(parsed, mount)
      }
    }
  } catch {
    // Ignore invalid URLs
  }

  return undefined
}
