import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  getAccountSiteCompatUserIdHeaderRules,
  getAccountSiteDomainRules,
  getAccountSiteTitleRules,
} from "~/services/accountSiteOnboarding/registry"
import { fetchSiteStatus } from "~/services/apiService/newApiFamily/default/accountBootstrap"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { SUB2API_AUTH_ME_ENDPOINT } from "~/services/apiService/sub2api/type"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import {
  canUseTempWindowFetch,
  tempWindowFetch,
} from "~/utils/browser/tempWindowFetch"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("DetectSiteType")
const COMPAT_USER_ID_HEADER_MESSAGE_RULES =
  getAccountSiteCompatUserIdHeaderRules().map(({ headerName, siteType }) => ({
    siteType,
    regex: new RegExp(
      headerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "[-_ ]?"),
      "i",
    ),
  }))
const VOAPI_V2_USER_INFO_ENDPOINT = "/api/user/info"

/**
 * Fetch the raw HTML title from the site root.
 *
 * not get final title after js execution, because some sites may change title after load, but we want the original one for better site type detection accuracy.
 */
export const fetchSiteOriginalTitle = async (
  url: string,
  protectionBypassExecution?: ProtectionBypassExecution,
) => {
  const parseTitle = (html: string) => {
    const match = html.match(/<title>(.*?)<\/title>/i) // simple, case-insensitive title extract
    return match ? match[1] : ""
  }

  const fetchUrl = new URL("/", url).toString()
  const tempRequestId = safeRandomUUID(`fetch-title-${fetchUrl}`)

  // 尝试临时上下文获取标题，确保通过 WAF/盾后读取真实页面内容
  try {
    if (protectionBypassExecution && (await canUseTempWindowFetch())) {
      const tempResult = await tempWindowFetch({
        originUrl: fetchUrl,
        fetchUrl,
        responseType: "text",
        fetchOptions: {
          credentials: "include",
          cache: "no-store",
        },
        requestId: tempRequestId,
        protectionBypassExecution,
      })

      if (tempResult?.success && typeof tempResult.data === "string") {
        const title = parseTitle(tempResult.data)
        logger.debug("原始 document title (temp context)", { title })
        return title
      }
    }
  } catch (error) {
    logger.warn("temp context title fetch failed, fallback", error)
  }

  // 临时上下文失败则直接 fetch，可能拿到缓存或被 WAF 误拦截，但总比没有数据好
  const html = await fetchApi<string>(
    {
      baseUrl: url,
      auth: { authType: AuthTypeEnum.None },
      protectionBypassExecution,
    },
    {
      endpoint: "/",
      responseType: "text",
      options: {
        cache: "no-store",
      },
    },
    true,
  )
  const title = parseTitle(html)
  logger.debug("原始 document title (direct fetch)", { title })
  return title
}

/**
 * Matches one piece of detection text (page title, public site name, or upstream
 * auth message) against the registered title rules.
 */
function matchAccountSiteTitleRules(text: string): AccountSiteType {
  for (const rule of getAccountSiteTitleRules()) {
    if (rule.regex.test(text)) {
      return rule.name
    }
  }

  return SITE_TYPES.UNKNOWN
}

/**
 * Resolves the first detection text that identifies a registered site type,
 * in the order the caller ranked them.
 */
function matchFirstIdentifyingText(
  ...texts: (string | undefined)[]
): AccountSiteType {
  for (const text of texts) {
    if (text === undefined) continue

    const matchedType = matchAccountSiteTitleRules(text)
    if (matchedType !== SITE_TYPES.UNKNOWN) {
      return matchedType
    }
  }

  return SITE_TYPES.UNKNOWN
}

/**
 * Runs ordered matching against an API error message:
 * 1. Known site-specific compat user-id header markers from upstream auth errors
 * 2. Whole-message matching against existing site detection rules
 */
function detectAccountSiteTypeFromApiErrorMessage(
  message: string,
): AccountSiteType {
  const normalizedMessage = message.trim()
  if (!normalizedMessage) {
    return SITE_TYPES.UNKNOWN
  }

  for (const knownRule of COMPAT_USER_ID_HEADER_MESSAGE_RULES) {
    if (knownRule.regex.test(normalizedMessage)) {
      return knownRule.siteType
    }
  }

  return matchAccountSiteTitleRules(normalizedMessage)
}

/**
 * Probes the /api/user/self endpoint using cookie auth and infers the site
 * type from One/New API-family auth error messages when title detection fails.
 */
async function detectNewApiFamilySiteTypeFromCompatAuthError(
  url: string,
  protectionBypassExecution?: ProtectionBypassExecution,
): Promise<AccountSiteType> {
  try {
    await newApiFamilyRequests.data<unknown>(
      {
        baseUrl: url,
        auth: { authType: AuthTypeEnum.Cookie },
        protectionBypassExecution,
      },
      {
        endpoint: "/api/user/self",
        options: {
          cache: "no-store",
        },
      },
    )
  } catch (error) {
    if (error instanceof ApiError) {
      return detectAccountSiteTypeFromApiErrorMessage(error.message)
    }
    throw error
  }
  return SITE_TYPES.UNKNOWN
}

/**
 * Returns whether a parsed response body is a plain JSON object.
 */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Probe Sub2API's JWT identity endpoint without opening a browser context.
 *
 * Source: https://github.com/Wei-Shaw/sub2api
 * `/api/v1/auth/me` is protected by JWT middleware; without Authorization,
 * upstream returns a JSON object with a string `code`. The endpoint-shape signal
 * is enough to identify white-label Sub2API deployments in the current adapter
 * set without relying on the visible page title.
 */
async function detectSub2ApiFromAuthEndpoint(
  url: string,
): Promise<AccountSiteType> {
  try {
    const response = await fetch(new URL(SUB2API_AUTH_ME_ENDPOINT, url), {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
    })

    const contentType = response.headers.get("content-type") || ""
    if (!/\bjson\b/i.test(contentType)) {
      return SITE_TYPES.UNKNOWN
    }

    const responseBody = (await response.json()) as unknown
    if (isJsonObject(responseBody) && typeof responseBody.code === "string") {
      return SITE_TYPES.SUB2API
    }
  } catch (error) {
    logger.debug("Sub2API auth endpoint probe failed", { url, error })
  }

  return SITE_TYPES.UNKNOWN
}

/**
 * VoAPI v2 exposes a protected account-info endpoint that returns a distinctive
 * JSON business envelope even without credentials. Probe it before page-title
 * detection so white-label/self-hosted deployments do not depend on branding.
 *
 * Source: https://github.com/VoAPI/VoAPI and observed `/api/user/info`
 * contract: raw JWT auth, `{ code, data, msg }` envelope, auth failures with
 * numeric non-zero code and null data.
 */
async function detectVoApiV2FromProtectedEndpoint(
  url: string,
): Promise<AccountSiteType> {
  try {
    const response = await fetch(new URL(VOAPI_V2_USER_INFO_ENDPOINT, url), {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
    })

    const contentType = response.headers.get("content-type") || ""
    if (!/\bjson\b/i.test(contentType)) {
      return SITE_TYPES.UNKNOWN
    }

    const responseBody = (await response.json()) as unknown
    if (!isJsonObject(responseBody)) {
      return SITE_TYPES.UNKNOWN
    }

    const code = responseBody.code
    const message = [responseBody.msg, responseBody.message]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
    const hasProtectedEndpointEnvelope =
      typeof code === "number" &&
      "data" in responseBody &&
      responseBody.data === null &&
      /\b(?:unauthorized|auth\s*expire|token|jwt)\b/i.test(message)
    const hasAccountInfoEnvelope =
      code === 0 &&
      isJsonObject(responseBody.data) &&
      ("basicBalance" in responseBody.data ||
        "bindBalance" in responseBody.data)

    if (hasProtectedEndpointEnvelope || hasAccountInfoEnvelope) {
      return SITE_TYPES.VO_API_V2
    }
  } catch (error) {
    logger.debug("VoAPI v2 protected endpoint probe failed", { url, error })
  }

  return SITE_TYPES.UNKNOWN
}

/**
 * Public status fields that only RixAPI deployments report.
 *
 * RixAPI is a closed-source New API fork that keeps its licence state in the
 * public status payload, so these fields identify the backend regardless of the
 * operator's own brand. They are the only structural signal available for
 * white-label deployments: the shell title carries the operator's name, and a
 * logged-in deployment answers `/api/user/self` without an auth error, so neither
 * the title rules nor the compat-header error fallback can classify them.
 *
 * Source: https://github.com/RixAPI/Rix-API. Observed 2026-09-26 on
 * https://platform.ephone.ai (RixAPI 6.5.17, all three fields) and on the vendor
 * demo https://platform.rixapi.com (all three fields).
 */
const RIX_API_STATUS_SIGNATURE_FIELDS = [
  "rix_version_message",
  "rixapi_license_type",
  "rix_license_enabled",
] as const

interface PublicSiteStatusSignals {
  /** Operator-configured brand, used by the shared title rules. */
  systemName?: string
  /** Whether the deployment reports the RixAPI licence signature. */
  identifiesRixApi: boolean
}

/**
 * Reads the public status signals used for site-type detection.
 *
 * Both signals come from one request to the New API-family status endpoint. The
 * endpoint is rooted at the origin, and an absent or unreachable status is not an
 * error: the caller keeps title detection. The caller's bypass context is
 * forwarded so a shielded deployment still answers; whether it applies is the
 * bypass policy's call.
 */
async function fetchPublicSiteStatusSignals(
  url: string,
  protectionBypassExecution?: ProtectionBypassExecution,
): Promise<PublicSiteStatusSignals> {
  const noSignals: PublicSiteStatusSignals = { identifiesRixApi: false }

  const readSignals = async (attempt?: ProtectionBypassExecution) => {
    const siteStatus = await fetchSiteStatus({
      baseUrl: new URL("/", url).toString(),
      auth: { authType: AuthTypeEnum.None },
      ...(attempt ? { protectionBypassExecution: attempt } : {}),
    })
    if (!siteStatus) return noSignals

    const rawStatus = siteStatus as unknown as Record<string, unknown>
    const systemName =
      typeof siteStatus.system_name === "string" &&
      siteStatus.system_name.trim()
        ? siteStatus.system_name
        : undefined

    return {
      ...(systemName ? { systemName } : {}),
      identifiesRixApi: RIX_API_STATUS_SIGNATURE_FIELDS.some((field) =>
        Object.hasOwn(rawStatus, field),
      ),
    }
  }

  // Detection outcomes are the first thing a site-support report needs, and this
  // probe is otherwise invisible outside the network panel.
  const logSignals = (signals: PublicSiteStatusSignals) => {
    logger.info("public site status signals", {
      url,
      systemName: signals.systemName,
      identifiesRixApi: signals.identifiesRixApi,
    })
    return signals
  }

  try {
    return logSignals(await readSignals(protectionBypassExecution))
  } catch (error) {
    logger.debug("public site status probe failed", { url, error })
  }

  if (!protectionBypassExecution) return noSignals

  // A shielded attempt needs a browser context that some deployments never let
  // load, and a plain read is enough for this public endpoint.
  try {
    return logSignals(await readSignals())
  } catch (error) {
    logger.warn("public site status probe failed without bypass", {
      url,
      error,
    })
    return noSignals
  }
}

/**
 * detectAccountSiteTypeFromDomain parses the URL hostname and compares it
 * case-insensitively against account-site domain rules. It returns the matched
 * AccountSiteType rule name, or SITE_TYPES.UNKNOWN when parsing fails or no
 * domain rule matches.
 */
function detectAccountSiteTypeFromDomain(url: string): AccountSiteType {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    const matchedRule = getAccountSiteDomainRules().find((rule) =>
      rule.hostnames.some((allowedHostname) => allowedHostname === hostname),
    )
    return matchedRule?.name ?? SITE_TYPES.UNKNOWN
  } catch {
    return SITE_TYPES.UNKNOWN
  }
}

export const getAccountSiteType = async (
  url: string,
  protectionBypassExecution?: ProtectionBypassExecution,
): Promise<AccountSiteType> => {
  const domainSiteType = detectAccountSiteTypeFromDomain(url)
  if (domainSiteType !== SITE_TYPES.UNKNOWN) {
    return domainSiteType
  }

  const voApiV2SiteType = await detectVoApiV2FromProtectedEndpoint(url)
  if (voApiV2SiteType !== SITE_TYPES.UNKNOWN) {
    return voApiV2SiteType
  }

  const sub2ApiSiteType = await detectSub2ApiFromAuthEndpoint(url)
  if (sub2ApiSiteType !== SITE_TYPES.UNKNOWN) {
    return sub2ApiSiteType
  }

  // The public status name is operator-configured while a white-label shell keeps
  // the stock title, so resolve both and let the name win over the title. The same
  // response carries the RixAPI licence signature, which outranks both: a branded
  // status name only helps when the operator kept the fork's own brand.
  const [title, publicSiteStatus] = await Promise.all([
    fetchSiteOriginalTitle(url, protectionBypassExecution),
    fetchPublicSiteStatusSignals(url, protectionBypassExecution),
  ])

  if (publicSiteStatus.identifiesRixApi) {
    return SITE_TYPES.RIX_API
  }

  const identifyingTextSiteType = matchFirstIdentifyingText(
    publicSiteStatus.systemName,
    title,
  )
  if (identifyingTextSiteType !== SITE_TYPES.UNKNOWN) {
    return identifyingTextSiteType
  }

  return await detectNewApiFamilySiteTypeFromCompatAuthError(
    url,
    protectionBypassExecution,
  )
}
