import type { Page } from "@playwright/test"

import {
  ensureRealSiteOriginPage,
  findVisibleLocator,
  normalizeBaseUrl,
  readEnv,
  requireVisibleLocator,
  resolveRealSiteUrl,
  safeParseJson,
  seedLocalStorageValues,
  type LocatorCandidate,
} from "./shared"

const REQUIRED_SUB2API_REAL_SITE_ENV_KEYS = [
  "AAH_E2E_SUB2API_BASE_URL",
  "AAH_E2E_SUB2API_USERNAME",
  "AAH_E2E_SUB2API_PASSWORD",
] as const

const SUB2API_REAL_SITE_DEFAULT_LOGIN_PATH = "/login"
const SUB2API_REAL_SITE_DEFAULT_LOGIN_API_PATH = "/api/v1/auth/login"

type RequiredSub2ApiRealSiteEnvKey =
  (typeof REQUIRED_SUB2API_REAL_SITE_ENV_KEYS)[number]

type Sub2ApiRealSiteResolution = {
  config: Sub2ApiRealSiteConfig | null
  missingEnvKeys: RequiredSub2ApiRealSiteEnvKey[]
}

interface Sub2ApiRealSiteConfig {
  baseUrl: string
  loginUrl: string
  loginApiUrl: string
  username: string
  password: string
  usernameSelector?: string
  passwordSelector?: string
  submitSelector?: string
  agreeSelector?: string
}

interface Sub2ApiRealSiteAuthState {
  accessToken: string
  refreshToken: string
  tokenExpiresAt: number | null
  user: Record<string, unknown>
}

interface Sub2ApiRealSiteLoginResult {
  reusedSession: boolean
  authState: Sub2ApiRealSiteAuthState
}

const EMPTY_SUB2API_REAL_SITE_SELECTORS: Pick<
  Sub2ApiRealSiteConfig,
  "usernameSelector" | "passwordSelector" | "submitSelector"
> = {}

/**
 * Environment-driven config for the real Sub2API E2E flow.
 *
 * Required:
 * - AAH_E2E_SUB2API_BASE_URL
 * - AAH_E2E_SUB2API_USERNAME
 * - AAH_E2E_SUB2API_PASSWORD
 *
 * Optional overrides:
 * - AAH_E2E_SUB2API_LOGIN_PATH
 * - AAH_E2E_SUB2API_LOGIN_API_PATH
 * - AAH_E2E_SUB2API_USERNAME_SELECTOR
 * - AAH_E2E_SUB2API_PASSWORD_SELECTOR
 * - AAH_E2E_SUB2API_SUBMIT_SELECTOR
 * - AAH_E2E_SUB2API_AGREE_SELECTOR
 */
export function resolveSub2ApiRealSiteConfig(): Sub2ApiRealSiteResolution {
  const values = Object.fromEntries(
    REQUIRED_SUB2API_REAL_SITE_ENV_KEYS.map((key) => [key, readEnv(key)]),
  ) as Record<RequiredSub2ApiRealSiteEnvKey, string>

  const missingEnvKeys = REQUIRED_SUB2API_REAL_SITE_ENV_KEYS.filter(
    (key) => !values[key],
  )

  if (missingEnvKeys.length > 0) {
    return {
      config: null,
      missingEnvKeys,
    }
  }

  const baseUrl = normalizeBaseUrl(values.AAH_E2E_SUB2API_BASE_URL)
  const loginPath =
    readEnv("AAH_E2E_SUB2API_LOGIN_PATH") ??
    SUB2API_REAL_SITE_DEFAULT_LOGIN_PATH
  const loginApiPath =
    readEnv("AAH_E2E_SUB2API_LOGIN_API_PATH") ??
    SUB2API_REAL_SITE_DEFAULT_LOGIN_API_PATH

  return {
    config: {
      baseUrl,
      loginUrl: resolveLoginUrl(baseUrl, loginPath),
      loginApiUrl: resolveApiUrl(baseUrl, loginApiPath),
      username: values.AAH_E2E_SUB2API_USERNAME,
      password: values.AAH_E2E_SUB2API_PASSWORD,
      usernameSelector: readEnv("AAH_E2E_SUB2API_USERNAME_SELECTOR"),
      passwordSelector: readEnv("AAH_E2E_SUB2API_PASSWORD_SELECTOR"),
      submitSelector: readEnv("AAH_E2E_SUB2API_SUBMIT_SELECTOR"),
      agreeSelector: readEnv("AAH_E2E_SUB2API_AGREE_SELECTOR"),
    },
    missingEnvKeys: [],
  }
}

export function getSub2ApiRealSiteSkipReason(
  missingEnvKeys: RequiredSub2ApiRealSiteEnvKey[],
) {
  if (missingEnvKeys.length === 0) {
    return ""
  }

  return `Missing real-site Sub2API E2E env: ${missingEnvKeys.join(", ")}`
}

export async function loginToRealSub2ApiSite(
  page: Page,
  config: Sub2ApiRealSiteConfig,
): Promise<Sub2ApiRealSiteLoginResult> {
  await ensureRealSiteOriginPage(page, config.loginUrl)

  const existingAuthState = await waitForSub2ApiAuthState(page, 2_500)
  if (existingAuthState) {
    return {
      reusedSession: true,
      authState: existingAuthState,
    }
  }

  const apiAuthState = await tryLoginToRealSub2ApiSiteViaApi(page, config)
  if (apiAuthState) {
    return {
      reusedSession: false,
      authState: apiAuthState,
    }
  }

  await maybeRevealUsernamePasswordLogin(page)

  const usernameInput = await requireVisibleLocator(
    page,
    getUsernameCandidates(config),
    10_000,
  )
  const passwordInput = await requireVisibleLocator(
    page,
    getPasswordCandidates(config),
    10_000,
  )

  await usernameInput.fill(config.username)
  await passwordInput.fill(config.password)
  await maybeCheckAgreement(page, config)

  const submitButton = await requireVisibleLocator(
    page,
    getSubmitCandidates(config),
    10_000,
  )
  await submitButton.click()

  const authState = await waitForSub2ApiAuthState(page, 30_000)
  if (!authState) {
    throw new Error(
      `Real Sub2API login did not produce auth_token/auth_user at ${config.baseUrl}.`,
    )
  }

  return {
    reusedSession: false,
    authState,
  }
}

type Sub2ApiRealSiteLoginApiPayload = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  user?: Record<string, unknown>
  requires_2fa?: boolean
  temp_token?: string
}

async function tryLoginToRealSub2ApiSiteViaApi(
  page: Page,
  config: Sub2ApiRealSiteConfig,
): Promise<Sub2ApiRealSiteAuthState | null> {
  const loginApiUrls = Array.from(
    new Set([
      config.loginApiUrl,
      resolveRealSiteUrl(config.baseUrl, "/auth/login"),
    ]),
  )

  let lastErrorMessage = ""

  for (const loginApiUrl of loginApiUrls) {
    let responseText = ""

    try {
      const response = await page.request.post(loginApiUrl, {
        data: {
          email: config.username,
          password: config.password,
        },
        failOnStatusCode: false,
      })

      responseText = await response.text()
      const parsedAuthState = parseSub2ApiLoginApiResponse(
        safeParseJson(responseText),
      )

      if (parsedAuthState) {
        await seedSub2ApiAuthState(page, parsedAuthState)
        return parsedAuthState
      }

      lastErrorMessage = buildLoginApiErrorMessage(
        response.status(),
        responseText,
        loginApiUrl,
      )
    } catch (error) {
      lastErrorMessage = `Sub2API login API request failed at ${loginApiUrl}: ${
        error instanceof Error ? error.message : String(error)
      }`
    }
  }

  if (await looksLikeSecurityVerificationPage(page)) {
    throw new Error(
      lastErrorMessage
        ? `${lastErrorMessage} The real site is currently blocked by a security verification page, so UI-form login cannot proceed.`
        : "The real site is currently blocked by a security verification page, so UI-form login cannot proceed.",
    )
  }

  return null
}

function parseSub2ApiLoginApiResponse(
  payload: unknown,
): Sub2ApiRealSiteAuthState | null {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const envelope =
    "code" in payload && "data" in payload
      ? (payload as {
          code?: unknown
          data?: unknown
          message?: unknown
          detail?: unknown
        })
      : null

  if (envelope && envelope.code !== 0) {
    const message = [envelope.message, envelope.detail]
      .filter((part) => typeof part === "string" && part.trim())
      .join(" ")

    if (/requires_2fa|2fa|totp/iu.test(message)) {
      throw new Error(
        "Sub2API real-site login requires 2FA. Provide a non-2FA test account for this E2E.",
      )
    }

    return null
  }

  const rawAuth = (envelope?.data ?? payload) as Sub2ApiRealSiteLoginApiPayload

  if (rawAuth?.requires_2fa || typeof rawAuth?.temp_token === "string") {
    throw new Error(
      "Sub2API real-site login requires 2FA. Provide a non-2FA test account for this E2E.",
    )
  }

  const accessToken =
    typeof rawAuth?.access_token === "string" ? rawAuth.access_token.trim() : ""
  const authUser = rawAuth?.user

  if (!accessToken || !authUser || typeof authUser !== "object") {
    return null
  }

  const refreshToken =
    typeof rawAuth.refresh_token === "string"
      ? rawAuth.refresh_token.trim()
      : ""
  const expiresInSeconds =
    typeof rawAuth.expires_in === "number" && rawAuth.expires_in > 0
      ? rawAuth.expires_in
      : null

  return {
    accessToken,
    refreshToken,
    tokenExpiresAt: expiresInSeconds
      ? Date.now() + expiresInSeconds * 1000
      : null,
    user: authUser,
  }
}

async function seedSub2ApiAuthState(
  page: Page,
  authState: Sub2ApiRealSiteAuthState,
) {
  await seedLocalStorageValues(page, {
    auth_token: authState.accessToken,
    auth_user: JSON.stringify(authState.user),
    refresh_token: authState.refreshToken || null,
    token_expires_at:
      typeof authState.tokenExpiresAt === "number"
        ? String(authState.tokenExpiresAt)
        : null,
  })
}

async function maybeRevealUsernamePasswordLogin(page: Page) {
  const usernameInput = await findVisibleLocator(
    page,
    getUsernameCandidates(EMPTY_SUB2API_REAL_SITE_SELECTORS),
    500,
  )
  const passwordInput = await findVisibleLocator(
    page,
    getPasswordCandidates(EMPTY_SUB2API_REAL_SITE_SELECTORS),
    500,
  )

  if (usernameInput && passwordInput) {
    return
  }

  const revealButton = await findVisibleLocator(
    page,
    [
      {
        description: "username-password login switch",
        getLocator: (currentPage) =>
          currentPage.getByRole("button", {
            name: /use email|username|email login|用户名|邮箱/i,
          }),
      },
    ],
    1_000,
  )

  if (!revealButton) {
    return
  }

  await revealButton.click()
}

async function maybeCheckAgreement(page: Page, config: Sub2ApiRealSiteConfig) {
  if (!config.agreeSelector) {
    return
  }

  const checkbox = await findVisibleLocator(
    page,
    [
      {
        description: "agreement checkbox",
        getLocator: (currentPage) => currentPage.locator(config.agreeSelector!),
      },
    ],
    1_000,
  )

  if (!checkbox) {
    return
  }

  const isChecked = await checkbox.evaluate((node) => {
    if (node instanceof HTMLInputElement) {
      return node.checked
    }

    return node.getAttribute("aria-checked") === "true"
  })

  if (!isChecked) {
    await checkbox.click()
  }
}

async function waitForSub2ApiAuthState(
  page: Page,
  timeoutMs: number,
): Promise<Sub2ApiRealSiteAuthState | null> {
  try {
    const result = await page.waitForFunction(
      () => {
        try {
          const accessToken = window.localStorage.getItem("auth_token")?.trim()
          const authUserRaw = window.localStorage.getItem("auth_user")
          if (!accessToken || !authUserRaw) {
            return null
          }

          const user = JSON.parse(authUserRaw)
          if (!user || (user.id == null && !user.username && !user.email)) {
            return null
          }

          const refreshToken =
            window.localStorage.getItem("refresh_token")?.trim() ?? ""
          const tokenExpiresAtRaw =
            window.localStorage.getItem("token_expires_at")
          const parsedTokenExpiresAt = tokenExpiresAtRaw
            ? Number.parseInt(tokenExpiresAtRaw, 10)
            : Number.NaN

          return {
            accessToken,
            refreshToken,
            tokenExpiresAt: Number.isFinite(parsedTokenExpiresAt)
              ? parsedTokenExpiresAt
              : null,
            user,
          }
        } catch {
          return null
        }
      },
      null,
      { timeout: timeoutMs },
    )

    return (await result.jsonValue()) as Sub2ApiRealSiteAuthState | null
  } catch {
    return null
  }
}

function buildLoginApiErrorMessage(
  status: number,
  responseText: string,
  loginApiUrl: string,
) {
  const normalizedText = responseText.trim()

  if (
    /verify you are human|performing security verification|cloudflare/iu.test(
      normalizedText,
    )
  ) {
    return `Sub2API login API at ${loginApiUrl} is blocked by a security verification page (HTTP ${status}).`
  }

  if (/requires_2fa|2fa|totp/iu.test(normalizedText)) {
    return "Sub2API real-site login requires 2FA. Provide a non-2FA test account for this E2E."
  }

  if (!normalizedText) {
    return `Sub2API login API at ${loginApiUrl} returned HTTP ${status}.`
  }

  return `Sub2API login API at ${loginApiUrl} returned HTTP ${status}: ${normalizedText.slice(0, 280)}`
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
  return /verify you are human|performing security verification|cloudflare/iu.test(
    bodyText ?? "",
  )
}

function getUsernameCandidates(
  config: Pick<Sub2ApiRealSiteConfig, "usernameSelector">,
): LocatorCandidate[] {
  return [
    ...(config.usernameSelector
      ? [
          {
            description: "AAH_E2E_SUB2API_USERNAME_SELECTOR",
            getLocator: (page: Page) => page.locator(config.usernameSelector!),
          },
        ]
      : []),
    {
      description: "upstream LoginView email input (#email)",
      getLocator: (page: Page) => page.locator("input#email"),
    },
    {
      description: "standard username/email input",
      getLocator: (page: Page) =>
        page.locator(
          [
            'input[name="username"]',
            'input[name="email"]',
            'input[autocomplete="username"]',
            'input[type="email"]',
            'input[placeholder*="username" i]',
            'input[placeholder*="email" i]',
            'input[placeholder*="用户名" i]',
            'input[placeholder*="邮箱" i]',
          ].join(", "),
        ),
    },
  ]
}

function getPasswordCandidates(
  config: Pick<Sub2ApiRealSiteConfig, "passwordSelector">,
): LocatorCandidate[] {
  return [
    ...(config.passwordSelector
      ? [
          {
            description: "AAH_E2E_SUB2API_PASSWORD_SELECTOR",
            getLocator: (page: Page) => page.locator(config.passwordSelector!),
          },
        ]
      : []),
    {
      description: "upstream LoginView password input (#password)",
      getLocator: (page: Page) => page.locator("input#password"),
    },
    {
      description: "standard password input",
      getLocator: (page: Page) =>
        page.locator(
          [
            'input[name="password"]',
            'input[type="password"]',
            'input[autocomplete="current-password"]',
            'input[placeholder*="password" i]',
            'input[placeholder*="密码" i]',
          ].join(", "),
        ),
    },
  ]
}

function getSubmitCandidates(
  config: Pick<Sub2ApiRealSiteConfig, "submitSelector">,
): LocatorCandidate[] {
  return [
    ...(config.submitSelector
      ? [
          {
            description: "AAH_E2E_SUB2API_SUBMIT_SELECTOR",
            getLocator: (page: Page) => page.locator(config.submitSelector!),
          },
        ]
      : []),
    {
      description: "upstream LoginView primary submit button",
      getLocator: (page: Page) =>
        page.locator("form button.btn.btn-primary.w-full[type='submit']"),
    },
    {
      description: "submit button",
      getLocator: (page: Page) =>
        page.locator('button[type="submit"], input[type="submit"]'),
    },
    {
      description: "common login button text",
      getLocator: (page: Page) =>
        page.getByRole("button", {
          name: /continue|login|sign in|登录|继续/i,
        }),
    },
  ]
}

const resolveLoginUrl = resolveRealSiteUrl
const resolveApiUrl = resolveRealSiteUrl
