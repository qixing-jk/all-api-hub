import type { Page } from "@playwright/test"

import { generateNewApiTotpCode } from "~/services/managedSites/providers/newApiTotp"

import {
  createLocatorFactory,
  ensureRealSiteOriginPage,
  findVisibleLocator,
  maybeCheckAgreement,
  maybeRevealUsernamePasswordLogin,
  normalizeBaseUrl,
  readEnv,
  requireVisibleLocator,
  resolveRealSiteUrl,
  safeParseJson,
  seedLocalStorageValues,
  type LocatorCandidate,
} from "./shared"

const DEFAULT_LOGIN_PATH = "/login"
const DEFAULT_LOGIN_API_PATH = "/api/user/login"
const DEFAULT_LOGIN_2FA_API_PATH = "/api/user/login/2fa"
const AUTH_REFRESH_PATH = "/api/user/auth/refresh"
const AUTH_LOGOUT_PATH = "/api/user/auth/logout"
const AUTH_SESSION_PATH = "/api/user/sessions"
const SECURITY_VERIFICATION_BODY_PATTERN =
  /verify you are human|performing security verification|cloudflare/iu
const AUTH_BUNDLE_MARKER_FIELDS = [
  "access_token",
  "token_type",
  "access_expires_at",
] as const
const SESSION_DIAGNOSTIC_DIGIT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
] as const

type RequiredRealSiteEnvKey<TPrefix extends string> =
  | `AAH_E2E_${TPrefix}_BASE_URL`
  | `AAH_E2E_${TPrefix}_USERNAME`
  | `AAH_E2E_${TPrefix}_PASSWORD`

type CompatibleApiRealSiteResolution<TPrefix extends string> = {
  config: CompatibleApiRealSiteConfig | null
  missingEnvKeys: Array<RequiredRealSiteEnvKey<TPrefix>>
}

export interface CompatibleApiRealSiteConfig {
  baseUrl: string
  loginUrl: string
  loginApiUrl: string
  login2faApiUrl: string
  username: string
  password: string
  usernameSelector?: string
  passwordSelector?: string
  submitSelector?: string
  agreeSelector?: string
  totpSecret?: string
}

export interface CompatibleApiRealSiteLoginResult {
  reusedSession: boolean
  user: Record<string, unknown>
  cleanupOwnedSession?: () => Promise<void>
}

type CompatibleApiLoginApiPayload = {
  require_2fa?: boolean
}

type CompatibleApiResolverOptions<TPrefix extends string> = {
  envPrefix: TPrefix
}

type CompatibleApiLoginOptions = {
  label: string
  envPrefix: string
  authBundle?: boolean
  logSessionDiagnostics?: boolean
}

type CompatibleAuthBundle = {
  kind: "authBundle"
  user: Record<string, unknown>
  accessToken: string
  sessionId: string
}

type CompatibleLegacyUser = {
  kind: "legacyUser"
  user: Record<string, unknown>
}

type CompatibleLoginPayload = CompatibleAuthBundle | CompatibleLegacyUser
type CompatibleLoginPayloadMode = "authBundleFirst" | "legacyFirst"

type AuthBundleProbeResult =
  | CompatibleAuthBundle
  | { kind: "anonymous" | "legacyFallback" }

class TerminalCompatibleApiLoginError extends Error {}

export function resolveCompatibleApiRealSiteConfig<TPrefix extends string>({
  envPrefix,
}: CompatibleApiResolverOptions<TPrefix>): CompatibleApiRealSiteResolution<TPrefix> {
  const envName = <TSuffix extends string>(suffix: TSuffix) =>
    `AAH_E2E_${envPrefix}_${suffix}` as const
  const requiredEnvKeys = [
    envName("BASE_URL"),
    envName("USERNAME"),
    envName("PASSWORD"),
  ] satisfies Array<RequiredRealSiteEnvKey<TPrefix>>

  const values = Object.fromEntries(
    requiredEnvKeys.map((key) => [key, readEnv(key)]),
  ) as Record<RequiredRealSiteEnvKey<TPrefix>, string | undefined>

  const missingEnvKeys = requiredEnvKeys.filter((key) => !values[key])

  if (missingEnvKeys.length > 0) {
    return {
      config: null,
      missingEnvKeys,
    }
  }

  const baseUrl = normalizeBaseUrl(values[envName("BASE_URL")]!)
  const loginPath = readEnv(envName("LOGIN_PATH")) ?? DEFAULT_LOGIN_PATH
  const loginApiPath =
    readEnv(envName("LOGIN_API_PATH")) ?? DEFAULT_LOGIN_API_PATH
  const login2faApiPath =
    readEnv(envName("LOGIN_2FA_API_PATH")) ?? DEFAULT_LOGIN_2FA_API_PATH

  return {
    config: {
      baseUrl,
      loginUrl: resolveRealSiteUrl(baseUrl, loginPath),
      loginApiUrl: resolveRealSiteUrl(baseUrl, loginApiPath),
      login2faApiUrl: resolveRealSiteUrl(baseUrl, login2faApiPath),
      username: values[envName("USERNAME")]!,
      password: values[envName("PASSWORD")]!,
      usernameSelector: readEnv(envName("USERNAME_SELECTOR")),
      passwordSelector: readEnv(envName("PASSWORD_SELECTOR")),
      submitSelector: readEnv(envName("SUBMIT_SELECTOR")),
      agreeSelector: readEnv(envName("AGREE_SELECTOR")),
      totpSecret: readEnv(envName("TOTP_SECRET")),
    },
    missingEnvKeys: [],
  }
}

export function getCompatibleApiRealSiteSkipReason(params: {
  label: string
  missingEnvKeys: string[]
}) {
  if (params.missingEnvKeys.length === 0) {
    return ""
  }

  return `Missing real-site ${params.label} E2E env: ${params.missingEnvKeys.join(", ")}`
}

export async function loginToCompatibleApiRealSite(
  page: Page,
  config: CompatibleApiRealSiteConfig,
  options: CompatibleApiLoginOptions,
): Promise<CompatibleApiRealSiteLoginResult> {
  await ensureRealSiteOriginPage(page, config.loginUrl)
  let loginPayloadMode: CompatibleLoginPayloadMode = options.authBundle
    ? "authBundleFirst"
    : "legacyFirst"

  if (options.authBundle) {
    const probeResult = await probeCompatibleAuthBundle(page, config, options)
    if (probeResult.kind === "authBundle") {
      return await createAuthBundleLoginResult(
        page,
        config,
        options,
        probeResult,
        true,
      )
    }

    if (probeResult.kind === "legacyFallback") {
      loginPayloadMode = "legacyFirst"
      const existingUser = await waitForStoredUser(page, 2_500)
      if (existingUser) {
        return {
          reusedSession: true,
          user: existingUser,
        }
      }
    }
  } else {
    const existingUser = await waitForStoredUser(page, 2_500)
    if (existingUser) {
      return {
        reusedSession: true,
        user: existingUser,
      }
    }
  }

  const apiLoginResult = await tryLoginToCompatibleApiRealSiteViaApi(
    page,
    config,
    options,
    loginPayloadMode,
  )
  if (apiLoginResult) {
    return apiLoginResult
  }

  const locatorFactory = createLocatorFactory(`AAH_E2E_${options.envPrefix}`)
  const emptySelectors: Pick<
    CompatibleApiRealSiteConfig,
    "usernameSelector" | "passwordSelector" | "submitSelector"
  > = {}

  await maybeRevealUsernamePasswordLogin(
    page,
    () => locatorFactory.getUsernameCandidates(emptySelectors),
    () => locatorFactory.getPasswordCandidates(emptySelectors),
  )

  const usernameInput = await requireVisibleLocator(
    page,
    locatorFactory.getUsernameCandidates(config),
    10_000,
  )
  const passwordInput = await requireVisibleLocator(
    page,
    locatorFactory.getPasswordCandidates(config),
    10_000,
  )

  await usernameInput.fill(config.username)
  await passwordInput.fill(config.password)
  await maybeCheckAgreement(page, config.agreeSelector)

  const submitButton = await requireVisibleLocator(
    page,
    locatorFactory.getSubmitCandidates(config),
    10_000,
  )
  await submitButton.click()

  await maybeSubmitTotp(page, config, options)

  if (options.authBundle) {
    const probeResult = await probeCompatibleAuthBundle(page, config, options)
    if (probeResult.kind === "authBundle") {
      return await createAuthBundleLoginResult(
        page,
        config,
        options,
        probeResult,
        false,
      )
    }

    if (probeResult.kind === "anonymous") {
      throw new TerminalCompatibleApiLoginError(
        `Real ${options.label} login did not create an authenticated session.`,
      )
    }
  }

  const user = await waitForStoredUser(page, 30_000)
  if (!user) {
    throw new Error(
      `Real ${options.label} login did not produce localStorage.user at ${config.baseUrl}.`,
    )
  }

  return {
    reusedSession: false,
    user,
  }
}

async function tryLoginToCompatibleApiRealSiteViaApi(
  page: Page,
  config: CompatibleApiRealSiteConfig,
  options: CompatibleApiLoginOptions,
  payloadMode: CompatibleLoginPayloadMode,
): Promise<CompatibleApiRealSiteLoginResult | null> {
  const loginApiUrls = Array.from(
    new Set([
      config.loginApiUrl,
      resolveRealSiteUrl(config.baseUrl, DEFAULT_LOGIN_API_PATH),
    ]),
  )

  let lastErrorMessage = ""

  for (const loginApiUrl of loginApiUrls) {
    try {
      const response = await page.request.post(loginApiUrl, {
        data: {
          username: config.username,
          password: config.password,
        },
        failOnStatusCode: false,
      })
      let responseText = await response.text()
      let responseStatus = response.status()
      const responseOk = response.ok()
      let payload = extractCompatibleApiPayload(safeParseJson(responseText))
      const loginPayload = payload as CompatibleApiLoginApiPayload | null

      if (loginPayload?.require_2fa) {
        let twoFactorResponse
        try {
          twoFactorResponse = await completeCompatibleApiLogin2fa(
            page,
            config,
            options,
          )
        } catch (error) {
          if (
            options.authBundle &&
            !(error instanceof TerminalCompatibleApiLoginError)
          ) {
            throw new TerminalCompatibleApiLoginError(
              `Real ${options.label} 2FA request failed.`,
            )
          }
          throw error
        }
        responseText = twoFactorResponse.responseText
        responseStatus = twoFactorResponse.status
        payload = extractCompatibleApiPayload(safeParseJson(responseText))
      } else if (!responseOk) {
        if (options.authBundle && isTerminalAuthBundleStatus(responseStatus)) {
          throw createAuthSessionStatusError(
            options,
            responseStatus,
            responseText,
          )
        }

        lastErrorMessage = buildCompatibleApiAttemptErrorMessage(
          responseStatus,
          responseText,
          loginApiUrl,
          options,
        )
        continue
      }

      const parsedPayload = parseCompatibleLoginPayload(payload, payloadMode)
      if (options.authBundle) {
        if (parsedPayload?.kind === "authBundle") {
          return await createAuthBundleLoginResult(
            page,
            config,
            options,
            parsedPayload,
            false,
          )
        }

        if (!parsedPayload) {
          throw new TerminalCompatibleApiLoginError(
            `Real ${options.label} auth session response is invalid.`,
          )
        }
      }

      const user =
        parsedPayload?.kind === "legacyUser"
          ? parsedPayload.user
          : await fetchCompatibleApiUser(page, config)
      if (!user) {
        lastErrorMessage = buildCompatibleApiAttemptErrorMessage(
          responseStatus,
          responseText,
          loginApiUrl,
          options,
        )
        continue
      }

      await ensureRealSiteOriginPage(page, config.loginUrl)
      await seedLocalStorageValues(page, {
        user: JSON.stringify(user),
      })

      return {
        reusedSession: false,
        user,
      }
    } catch (error) {
      if (error instanceof TerminalCompatibleApiLoginError) {
        throw error
      }

      lastErrorMessage = `${options.label} login API request failed at ${loginApiUrl}: ${
        options.authBundle
          ? "request failed"
          : error instanceof Error
            ? error.message
            : String(error)
      }`
    }
  }

  if (await looksLikeSecurityVerificationPage(page)) {
    throw new Error(
      lastErrorMessage
        ? `${lastErrorMessage} The real site is currently blocked by a security verification page, so API login cannot proceed.`
        : "The real site is currently blocked by a security verification page, so API login cannot proceed.",
    )
  }

  return null
}

function parseCompatibleApiUser(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const user = payload as Record<string, unknown>

  if (
    !("id" in user || "username" in user) ||
    (user.id == null && !user.username)
  ) {
    return null
  }

  return user
}

function parseCompatibleLoginPayload(
  payload: unknown,
  mode: CompatibleLoginPayloadMode,
): CompatibleLoginPayload | null {
  if (!isRecord(payload)) {
    return null
  }

  const legacyUser = parseCompatibleApiUser(payload)
  if (mode === "legacyFirst" && legacyUser) {
    return { kind: "legacyUser", user: legacyUser }
  }

  if (isRecognizableAuthBundleAttempt(payload)) {
    const accessToken = getNonBlankString(payload.access_token)
    const tokenType = payload.token_type
    const accessExpiresAt = payload.access_expires_at
    const user = parseAuthBundleUser(payload.user)
    const session = isRecord(payload.session) ? payload.session : null
    const sessionId = session ? getNonBlankString(session.sid) : null

    if (
      !accessToken ||
      tokenType !== "Bearer" ||
      typeof accessExpiresAt !== "number" ||
      !Number.isFinite(accessExpiresAt) ||
      accessExpiresAt <= Date.now() / 1_000 ||
      !user ||
      !sessionId ||
      session?.current !== true
    ) {
      return null
    }

    return {
      kind: "authBundle",
      user,
      accessToken,
      sessionId,
    }
  }

  if (legacyUser) {
    return { kind: "legacyUser", user: legacyUser }
  }

  return null
}

function parseAuthBundleUser(payload: unknown) {
  if (!isRecord(payload)) {
    return null
  }

  const username = getNonBlankString(payload.username)
  if (payload.id == null && !username) {
    return null
  }

  return payload
}

function isRecognizableAuthBundleAttempt(payload: unknown) {
  if (!isRecord(payload)) {
    return false
  }

  if (
    AUTH_BUNDLE_MARKER_FIELDS.some((field) =>
      Object.prototype.hasOwnProperty.call(payload, field),
    )
  ) {
    return true
  }

  return Boolean(
    isRecord(payload.session) &&
      (Object.prototype.hasOwnProperty.call(payload.session, "sid") ||
        Object.prototype.hasOwnProperty.call(payload.session, "current")),
  )
}

async function completeCompatibleApiLogin2fa(
  page: Page,
  config: Pick<CompatibleApiRealSiteConfig, "login2faApiUrl" | "totpSecret">,
  options: CompatibleApiLoginOptions,
): Promise<{ ok: boolean; status: number; responseText: string }> {
  if (!config.totpSecret) {
    const error = new Error(
      `Real ${options.label} login requires 2FA, but AAH_E2E_${options.envPrefix}_TOTP_SECRET is not set.`,
    )
    throw options.authBundle
      ? new TerminalCompatibleApiLoginError(error.message)
      : error
  }

  const response = await page.request.post(config.login2faApiUrl, {
    data: {
      code: generateNewApiTotpCode(config.totpSecret),
    },
    failOnStatusCode: false,
  })

  const responseText = await response.text()

  if (!response.ok()) {
    if (options.authBundle) {
      throw createAuthSessionStatusError(
        options,
        response.status(),
        responseText,
      )
    }

    throw new Error(
      buildCompatibleApiLoginApiErrorMessage(
        response.status(),
        responseText,
        config.login2faApiUrl,
        options,
      ),
    )
  }

  return {
    ok: true,
    status: response.status(),
    responseText,
  }
}

async function probeCompatibleAuthBundle(
  page: Page,
  config: Pick<CompatibleApiRealSiteConfig, "baseUrl">,
  options: CompatibleApiLoginOptions,
): Promise<AuthBundleProbeResult> {
  // Pinned rc.22 contract: https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.22/docs/authentication.md
  const origin = new URL(config.baseUrl).origin
  let response

  try {
    response = await page.request.post(
      resolveRealSiteUrl(config.baseUrl, AUTH_REFRESH_PATH),
      {
        failOnStatusCode: false,
        headers: { Origin: origin },
      },
    )
  } catch {
    throw new TerminalCompatibleApiLoginError(
      `Real ${options.label} auth session refresh request failed.`,
    )
  }

  const status = response.status()
  if (status === 401) {
    return { kind: "anonymous" }
  }
  if (status === 404 || status === 405) {
    return { kind: "legacyFallback" }
  }

  const responseText = await response.text()
  if (!response.ok()) {
    throw createAuthSessionStatusError(options, status, responseText)
  }

  const rawResponse = safeParseJson(responseText)
  const rawPayload =
    isRecord(rawResponse) && "data" in rawResponse
      ? rawResponse.data
      : rawResponse
  const payload = extractCompatibleApiPayload(rawResponse)
  const parsedPayload = parseCompatibleLoginPayload(payload, "authBundleFirst")
  if (parsedPayload?.kind === "authBundle") {
    return parsedPayload
  }

  if (
    isRecognizableAuthBundleAttempt(payload) ||
    isRecognizableAuthBundleAttempt(rawPayload)
  ) {
    throw new TerminalCompatibleApiLoginError(
      `Real ${options.label} auth session response is invalid.`,
    )
  }

  return { kind: "legacyFallback" }
}

async function createAuthBundleLoginResult(
  page: Page,
  config: Pick<CompatibleApiRealSiteConfig, "baseUrl">,
  options: CompatibleApiLoginOptions,
  authBundle: CompatibleAuthBundle,
  reusedSession: boolean,
): Promise<CompatibleApiRealSiteLoginResult> {
  const result = {
    reusedSession,
    user: authBundle.user,
    ...(reusedSession
      ? {}
      : {
          cleanupOwnedSession: createOwnedAuthSessionCleanup(
            page,
            config,
            options,
            authBundle,
          ),
        }),
  }

  if (options.logSessionDiagnostics) {
    await logVisibleAuthSessionCount(
      page,
      config,
      options,
      authBundle,
      reusedSession,
    )
  }

  return result
}

async function logVisibleAuthSessionCount(
  page: Page,
  config: Pick<CompatibleApiRealSiteConfig, "baseUrl">,
  options: CompatibleApiLoginOptions,
  authBundle: CompatibleAuthBundle,
  reusedSession: boolean,
) {
  // New API contract: this Bearer-only endpoint lists current-version active
  // sessions (up to 100); log counts only because the response contains SIDs,
  // IPs, and user agents. See https://github.com/QuantumNous/new-api/blob/main/docs/authentication.md.
  let response

  try {
    response = await page.request.get(
      resolveRealSiteUrl(config.baseUrl, AUTH_SESSION_PATH),
      {
        failOnStatusCode: false,
        timeout: 10_000,
        headers: {
          Authorization: `Bearer ${authBundle.accessToken}`,
        },
      },
    )
  } catch {
    console.info(
      `[real-site] ${options.label} session diagnostic unavailable: request failed`,
    )
    return
  }

  if (!response) {
    return
  }

  if (!response.ok()) {
    console.info(
      `[real-site] ${options.label} session diagnostic unavailable: HTTP ${response.status()}`,
    )
    return
  }

  let payload
  try {
    payload = extractCompatibleApiPayload(safeParseJson(await response.text()))
  } catch {
    console.info(
      `[real-site] ${options.label} session diagnostic unavailable: malformed response`,
    )
    return
  }

  if (!Array.isArray(payload)) {
    console.info(
      `[real-site] ${options.label} session diagnostic unavailable: unexpected response shape`,
    )
    return
  }

  const currentCount = payload.filter(
    (session) => isRecord(session) && session.current === true,
  ).length

  console.info(
    `[real-site] ${options.label} session diagnostic: visible_active=${formatSessionDiagnosticCount(payload.length)} current=${formatSessionDiagnosticCount(currentCount)} login=${reusedSession ? "reused" : "fresh"}`,
  )
}

function formatSessionDiagnosticCount(count: number) {
  // GitHub masks standalone numeric secret values (for example a user ID),
  // so spell each digit to keep non-sensitive counts readable in CI logs.
  return String(count)
    .split("")
    .map((digit) => SESSION_DIAGNOSTIC_DIGIT_WORDS[Number(digit)])
    .join("-")
}

function createOwnedAuthSessionCleanup(
  page: Page,
  config: Pick<CompatibleApiRealSiteConfig, "baseUrl">,
  options: CompatibleApiLoginOptions,
  authBundle: CompatibleAuthBundle,
) {
  return async () => {
    const origin = new URL(config.baseUrl).origin
    let response

    try {
      response = await page.request.post(
        resolveRealSiteUrl(config.baseUrl, AUTH_LOGOUT_PATH),
        {
          failOnStatusCode: false,
          headers: {
            Origin: origin,
            Authorization: `Bearer ${authBundle.accessToken}`,
            "X-Auth-Session": authBundle.sessionId,
          },
        },
      )
    } catch {
      throw new Error(`Real ${options.label} auth session cleanup failed.`)
    }

    if (!response.ok()) {
      const responseText = await response.text()
      if (
        response.status() === 409 &&
        getSafeAuthErrorCode(responseText) === "AUTH_SESSION_MISMATCH"
      ) {
        await revokeOwnedAuthSession(page, config, options, authBundle)
        return
      }

      throw createAuthSessionStatusError(
        options,
        response.status(),
        responseText,
        "cleanup",
      )
    }
  }
}

async function revokeOwnedAuthSession(
  page: Page,
  config: Pick<CompatibleApiRealSiteConfig, "baseUrl">,
  options: CompatibleApiLoginOptions,
  authBundle: CompatibleAuthBundle,
) {
  // Pinned rc.22 contract: https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.22/docs/authentication.md
  // AUTH_SESSION_MISMATCH means the refresh cookie and in-memory SID diverged;
  // revoke this run's exact SID with its Bearer instead of touching other sessions.
  const origin = new URL(config.baseUrl).origin
  let response

  try {
    response = await page.request.delete(
      resolveRealSiteUrl(
        config.baseUrl,
        `${AUTH_SESSION_PATH}/${encodeURIComponent(authBundle.sessionId)}`,
      ),
      {
        failOnStatusCode: false,
        headers: {
          Origin: origin,
          Authorization: `Bearer ${authBundle.accessToken}`,
        },
      },
    )
  } catch {
    throw new Error(`Real ${options.label} auth session cleanup failed.`)
  }

  if (!response.ok()) {
    const responseText = await response.text()
    throw createAuthSessionStatusError(
      options,
      response.status(),
      responseText,
      "cleanup",
    )
  }
}

function createAuthSessionStatusError(
  options: CompatibleApiLoginOptions,
  status: number,
  responseText: string,
  action = "request",
) {
  const code = getSafeAuthErrorCode(responseText)
  return new TerminalCompatibleApiLoginError(
    `${options.label} auth session ${action} failed (HTTP ${status}${code ? `, ${code}` : ""})`,
  )
}

function getSafeAuthErrorCode(responseText: string) {
  const parsed = safeParseJson(responseText)
  if (!isRecord(parsed)) {
    return null
  }

  const code = getNonBlankString(parsed.code)
  return code && /^[A-Z][A-Z0-9_]{0,79}$/u.test(code) ? code : null
}

function isTerminalAuthBundleStatus(status: number) {
  return status === 409 || status === 429 || status >= 500
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function getNonBlankString(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed || null
}

async function fetchCompatibleApiUser(
  page: Page,
  config: Pick<CompatibleApiRealSiteConfig, "baseUrl">,
) {
  const response = await page.request.get(
    resolveRealSiteUrl(config.baseUrl, "/api/user/self"),
    {
      failOnStatusCode: false,
    },
  )

  if (!response.ok()) {
    return null
  }

  const payload = extractCompatibleApiPayload(
    safeParseJson(await response.text()),
  )
  if (!payload || typeof payload !== "object") {
    return null
  }

  return parseCompatibleApiUser(payload)
}

function extractCompatibleApiPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const record = payload as {
    success?: unknown
    message?: unknown
    data?: unknown
  }

  if (record.success === false) {
    return null
  }

  return "data" in record ? record.data ?? null : payload
}

async function maybeSubmitTotp(
  page: Page,
  config: CompatibleApiRealSiteConfig,
  options: CompatibleApiLoginOptions,
) {
  const codeInput = await findVisibleLocator(page, getTotpCandidates(), 5_000)
  if (!codeInput) {
    return
  }

  if (!config.totpSecret) {
    throw new Error(
      `Real ${options.label} login requested TOTP, but AAH_E2E_${options.envPrefix}_TOTP_SECRET is not set.`,
    )
  }

  const code = generateNewApiTotpCode(config.totpSecret)
  await fillVerificationCode(page, codeInput, code)

  const locatorFactory = createLocatorFactory(`AAH_E2E_${options.envPrefix}`)
  const submitButton = await requireVisibleLocator(
    page,
    [
      ...locatorFactory.getSubmitCandidates(config),
      {
        description: "verification button text",
        getLocator: (currentPage: Page) =>
          currentPage.getByRole("button", {
            name: /verify|confirm|continue|确认|验证|继续/i,
          }),
      },
    ],
    10_000,
  )
  await submitButton.click()
}

async function fillVerificationCode(
  page: Page,
  codeInput: ReturnType<Page["locator"]>,
  code: string,
) {
  const singleDigitInputs = page.locator(
    [
      'input[inputmode="numeric"][maxlength="1"]',
      'input[autocomplete="one-time-code"][maxlength="1"]',
      'input[maxlength="1"][pattern*="\\d"]',
    ].join(", "),
  )

  if ((await singleDigitInputs.count()) >= code.length) {
    for (const [index, digit] of [...code].entries()) {
      await singleDigitInputs.nth(index).fill(digit)
    }
    return
  }

  await codeInput.fill(code)
}

async function waitForStoredUser(
  page: Page,
  timeoutMs: number,
): Promise<Record<string, unknown> | null> {
  try {
    const result = await page.waitForFunction(
      () => {
        try {
          const raw = window.localStorage.getItem("user")
          if (!raw) {
            return null
          }

          const parsed = JSON.parse(raw)
          if (!parsed || (parsed.id == null && !parsed.username)) {
            return null
          }

          return parsed
        } catch {
          return null
        }
      },
      null,
      { timeout: timeoutMs },
    )

    return (await result.jsonValue()) as Record<string, unknown> | null
  } catch {
    return null
  }
}

function getTotpCandidates(): LocatorCandidate[] {
  return [
    {
      description: "one-time-code input",
      getLocator: (page: Page) =>
        page.locator(
          [
            'input[autocomplete="one-time-code"]',
            'input[inputmode="numeric"]',
            'input[name="code"]',
            'input[placeholder*="code" i]',
            'input[placeholder*="验证码" i]',
          ].join(", "),
        ),
    },
  ]
}

function buildCompatibleApiLoginApiErrorMessage(
  status: number,
  responseText: string,
  loginApiUrl: string,
  options: CompatibleApiLoginOptions,
) {
  const normalizedText = responseText.trim()

  if (SECURITY_VERIFICATION_BODY_PATTERN.test(normalizedText)) {
    return `${options.label} login API at ${loginApiUrl} is blocked by a security verification page (HTTP ${status}).`
  }

  if (/requires_2fa|2fa|totp/iu.test(normalizedText)) {
    return `${options.label} real-site login requires 2FA. Set AAH_E2E_${options.envPrefix}_TOTP_SECRET for this E2E.`
  }

  if (!normalizedText) {
    return `${options.label} login API at ${loginApiUrl} returned HTTP ${status}.`
  }

  return `${options.label} login API at ${loginApiUrl} returned HTTP ${status}: ${normalizedText.slice(0, 280)}`
}

function buildCompatibleApiAttemptErrorMessage(
  status: number,
  responseText: string,
  loginApiUrl: string,
  options: CompatibleApiLoginOptions,
) {
  if (!options.authBundle) {
    return buildCompatibleApiLoginApiErrorMessage(
      status,
      responseText,
      loginApiUrl,
      options,
    )
  }

  if (SECURITY_VERIFICATION_BODY_PATTERN.test(responseText)) {
    return `${options.label} login API at ${loginApiUrl} is blocked by a security verification page (HTTP ${status}).`
  }

  return `${options.label} login API at ${loginApiUrl} returned HTTP ${status}.`
}

async function looksLikeSecurityVerificationPage(page: Page) {
  const url = page.url()
  if (/cdn-cgi|challenge|cloudflare/iu.test(url)) {
    return true
  }

  const bodyText = await page
    .locator("body")
    .textContent()
    .catch(() => "")
  return SECURITY_VERIFICATION_BODY_PATTERN.test(bodyText ?? "")
}
