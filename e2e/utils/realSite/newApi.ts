import type { Page } from "@playwright/test"

import { generateNewApiTotpCode } from "~/services/managedSites/providers/newApiTotp"

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

const REQUIRED_NEW_API_REAL_SITE_ENV_KEYS = [
  "AAH_E2E_NEW_API_BASE_URL",
  "AAH_E2E_NEW_API_USERNAME",
  "AAH_E2E_NEW_API_PASSWORD",
] as const

const NEW_API_REAL_SITE_DEFAULT_LOGIN_PATH = "/login"
const NEW_API_REAL_SITE_DEFAULT_LOGIN_API_PATH = "/api/user/login"
const NEW_API_REAL_SITE_DEFAULT_LOGIN_2FA_API_PATH = "/api/user/login/2fa"

type RequiredNewApiRealSiteEnvKey =
  (typeof REQUIRED_NEW_API_REAL_SITE_ENV_KEYS)[number]

type NewApiRealSiteResolution = {
  config: NewApiRealSiteConfig | null
  missingEnvKeys: RequiredNewApiRealSiteEnvKey[]
}

type NewApiLoginApiPayload = {
  require_2fa?: boolean
}

export interface NewApiRealSiteConfig {
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

export interface NewApiRealSiteLoginResult {
  reusedSession: boolean
  user: Record<string, unknown>
}

const EMPTY_NEW_API_REAL_SITE_SELECTORS: Pick<
  NewApiRealSiteConfig,
  "usernameSelector" | "passwordSelector" | "submitSelector"
> = {}

/**
 * Environment-driven config for the real New API E2E flow.
 *
 * Required:
 * - AAH_E2E_NEW_API_BASE_URL
 * - AAH_E2E_NEW_API_USERNAME
 * - AAH_E2E_NEW_API_PASSWORD
 *
 * Optional overrides:
 * - AAH_E2E_NEW_API_LOGIN_PATH
 * - AAH_E2E_NEW_API_LOGIN_API_PATH
 * - AAH_E2E_NEW_API_LOGIN_2FA_API_PATH
 * - AAH_E2E_NEW_API_USERNAME_SELECTOR
 * - AAH_E2E_NEW_API_PASSWORD_SELECTOR
 * - AAH_E2E_NEW_API_SUBMIT_SELECTOR
 * - AAH_E2E_NEW_API_AGREE_SELECTOR
 * - AAH_E2E_NEW_API_TOTP_SECRET
 */
export function resolveNewApiRealSiteConfig(): NewApiRealSiteResolution {
  const values = Object.fromEntries(
    REQUIRED_NEW_API_REAL_SITE_ENV_KEYS.map((key) => [key, readEnv(key)]),
  ) as Record<RequiredNewApiRealSiteEnvKey, string>

  const missingEnvKeys = REQUIRED_NEW_API_REAL_SITE_ENV_KEYS.filter(
    (key) => !values[key],
  )

  if (missingEnvKeys.length > 0) {
    return {
      config: null,
      missingEnvKeys,
    }
  }

  const baseUrl = normalizeBaseUrl(values.AAH_E2E_NEW_API_BASE_URL)
  const loginPath =
    readEnv("AAH_E2E_NEW_API_LOGIN_PATH") ??
    NEW_API_REAL_SITE_DEFAULT_LOGIN_PATH
  const loginApiPath =
    readEnv("AAH_E2E_NEW_API_LOGIN_API_PATH") ??
    NEW_API_REAL_SITE_DEFAULT_LOGIN_API_PATH
  const login2faApiPath =
    readEnv("AAH_E2E_NEW_API_LOGIN_2FA_API_PATH") ??
    NEW_API_REAL_SITE_DEFAULT_LOGIN_2FA_API_PATH

  return {
    config: {
      baseUrl,
      loginUrl: resolveRealSiteUrl(baseUrl, loginPath),
      loginApiUrl: resolveRealSiteUrl(baseUrl, loginApiPath),
      login2faApiUrl: resolveRealSiteUrl(baseUrl, login2faApiPath),
      username: values.AAH_E2E_NEW_API_USERNAME,
      password: values.AAH_E2E_NEW_API_PASSWORD,
      usernameSelector: readEnv("AAH_E2E_NEW_API_USERNAME_SELECTOR"),
      passwordSelector: readEnv("AAH_E2E_NEW_API_PASSWORD_SELECTOR"),
      submitSelector: readEnv("AAH_E2E_NEW_API_SUBMIT_SELECTOR"),
      agreeSelector: readEnv("AAH_E2E_NEW_API_AGREE_SELECTOR"),
      totpSecret: readEnv("AAH_E2E_NEW_API_TOTP_SECRET"),
    },
    missingEnvKeys: [],
  }
}

export function getNewApiRealSiteSkipReason(
  missingEnvKeys: RequiredNewApiRealSiteEnvKey[],
) {
  if (missingEnvKeys.length === 0) {
    return ""
  }

  return `Missing real-site New API E2E env: ${missingEnvKeys.join(", ")}`
}

export async function loginToRealNewApiSite(
  page: Page,
  config: NewApiRealSiteConfig,
): Promise<NewApiRealSiteLoginResult> {
  await ensureRealSiteOriginPage(page, config.loginUrl)

  const existingUser = await waitForStoredUser(page, 2_500)
  if (existingUser) {
    return {
      reusedSession: true,
      user: existingUser,
    }
  }

  const apiUser = await tryLoginToRealNewApiSiteViaApi(page, config)
  if (apiUser) {
    return {
      reusedSession: false,
      user: apiUser,
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

  await maybeSubmitTotp(page, config)

  const user = await waitForStoredUser(page, 30_000)
  if (!user) {
    throw new Error(
      `Real New API login did not produce localStorage.user at ${config.baseUrl}.`,
    )
  }

  return {
    reusedSession: false,
    user,
  }
}

async function tryLoginToRealNewApiSiteViaApi(
  page: Page,
  config: NewApiRealSiteConfig,
): Promise<Record<string, unknown> | null> {
  const loginApiUrls = Array.from(
    new Set([
      config.loginApiUrl,
      resolveRealSiteUrl(
        config.baseUrl,
        NEW_API_REAL_SITE_DEFAULT_LOGIN_API_PATH,
      ),
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
      const responseText = await response.text()
      const payload = extractNewApiPayload(
        safeParseJson(responseText),
      ) as NewApiLoginApiPayload | null

      if (payload?.require_2fa) {
        await completeNewApiLogin2fa(page, config)
      } else if (!response.ok()) {
        lastErrorMessage = buildNewApiLoginApiErrorMessage(
          response.status(),
          responseText,
          loginApiUrl,
        )
        continue
      }

      const user = await fetchRealNewApiUser(page, config)
      if (!user) {
        lastErrorMessage = buildNewApiLoginApiErrorMessage(
          response.status(),
          responseText,
          loginApiUrl,
        )
        continue
      }

      await ensureRealSiteOriginPage(page, config.loginUrl)
      await seedLocalStorageValues(page, {
        user: JSON.stringify(user),
      })

      return user
    } catch (error) {
      lastErrorMessage = `New API login API request failed at ${loginApiUrl}: ${
        error instanceof Error ? error.message : String(error)
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

async function completeNewApiLogin2fa(
  page: Page,
  config: Pick<NewApiRealSiteConfig, "login2faApiUrl" | "totpSecret">,
) {
  if (!config.totpSecret) {
    throw new Error(
      "Real New API login requires 2FA, but AAH_E2E_NEW_API_TOTP_SECRET is not set.",
    )
  }

  const response = await page.request.post(config.login2faApiUrl, {
    data: {
      code: generateNewApiTotpCode(config.totpSecret),
    },
    failOnStatusCode: false,
  })

  if (!response.ok()) {
    const responseText = await response.text()
    throw new Error(
      buildNewApiLoginApiErrorMessage(
        response.status(),
        responseText,
        config.login2faApiUrl,
      ),
    )
  }
}

async function fetchRealNewApiUser(
  page: Page,
  config: Pick<NewApiRealSiteConfig, "baseUrl">,
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

  const payload = extractNewApiPayload(safeParseJson(await response.text()))
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

function extractNewApiPayload(payload: unknown) {
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

async function maybeRevealUsernamePasswordLogin(page: Page) {
  const usernameInput = await findVisibleLocator(
    page,
    getUsernameCandidates(EMPTY_NEW_API_REAL_SITE_SELECTORS),
    500,
  )
  const passwordInput = await findVisibleLocator(
    page,
    getPasswordCandidates(EMPTY_NEW_API_REAL_SITE_SELECTORS),
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

async function maybeCheckAgreement(page: Page, config: NewApiRealSiteConfig) {
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

async function maybeSubmitTotp(page: Page, config: NewApiRealSiteConfig) {
  const codeInput = await findVisibleLocator(page, getTotpCandidates(), 5_000)
  if (!codeInput) {
    return
  }

  if (!config.totpSecret) {
    throw new Error(
      "Real New API login requested TOTP, but AAH_E2E_NEW_API_TOTP_SECRET is not set.",
    )
  }

  const code = generateNewApiTotpCode(config.totpSecret)
  await fillVerificationCode(page, codeInput, code)

  const submitButton = await requireVisibleLocator(
    page,
    getTotpSubmitCandidates(config),
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

function getUsernameCandidates(
  config: Pick<NewApiRealSiteConfig, "usernameSelector">,
): LocatorCandidate[] {
  return [
    ...(config.usernameSelector
      ? [
          {
            description: "AAH_E2E_NEW_API_USERNAME_SELECTOR",
            getLocator: (page: Page) => page.locator(config.usernameSelector!),
          },
        ]
      : []),
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
  config: Pick<NewApiRealSiteConfig, "passwordSelector">,
): LocatorCandidate[] {
  return [
    ...(config.passwordSelector
      ? [
          {
            description: "AAH_E2E_NEW_API_PASSWORD_SELECTOR",
            getLocator: (page: Page) => page.locator(config.passwordSelector!),
          },
        ]
      : []),
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
  config: Pick<NewApiRealSiteConfig, "submitSelector">,
): LocatorCandidate[] {
  return [
    ...(config.submitSelector
      ? [
          {
            description: "AAH_E2E_NEW_API_SUBMIT_SELECTOR",
            getLocator: (page: Page) => page.locator(config.submitSelector!),
          },
        ]
      : []),
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

function getTotpSubmitCandidates(
  config: Pick<NewApiRealSiteConfig, "submitSelector">,
): LocatorCandidate[] {
  return [
    ...getSubmitCandidates(config),
    {
      description: "verification button text",
      getLocator: (page: Page) =>
        page.getByRole("button", {
          name: /verify|confirm|continue|确认|验证|继续/i,
        }),
    },
  ]
}

function buildNewApiLoginApiErrorMessage(
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
    return `New API login API at ${loginApiUrl} is blocked by a security verification page (HTTP ${status}).`
  }

  if (/requires_2fa|2fa|totp/iu.test(normalizedText)) {
    return "New API real-site login requires 2FA. Set AAH_E2E_NEW_API_TOTP_SECRET for this E2E."
  }

  if (!normalizedText) {
    return `New API login API at ${loginApiUrl} returned HTTP ${status}.`
  }

  return `New API login API at ${loginApiUrl} returned HTTP ${status}: ${normalizedText.slice(0, 280)}`
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
