import type { Locator, Page } from "@playwright/test"

export type LocatorCandidate = {
  description: string
  getLocator: (page: Page) => Locator
}

type LoginLocatorConfig = {
  usernameSelector?: string
  passwordSelector?: string
  submitSelector?: string
}

export function readEnv(name: string) {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

export function normalizeBaseUrl(value: string) {
  const url = new URL(value)
  return url.origin
}

export function resolveRealSiteUrl(baseUrl: string, pathOrUrl: string) {
  if (/^https?:\/\//iu.test(pathOrUrl)) {
    return pathOrUrl
  }

  return new URL(pathOrUrl, `${baseUrl}/`).toString()
}

export function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

export async function ensureRealSiteOriginPage(page: Page, url: string) {
  const targetOrigin = new URL(url).origin
  const currentUrl = page.url()

  if (currentUrl) {
    try {
      if (new URL(currentUrl).origin === targetOrigin) {
        return
      }
    } catch {
      // Ignore invalid intermediate URLs and continue with navigation.
    }
  }

  await page.goto(url, { waitUntil: "domcontentloaded" })
}

export async function seedLocalStorageValues(
  page: Page,
  values: Record<string, string | null | undefined>,
) {
  await page.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      if (typeof value === "string") {
        window.localStorage.setItem(key, value)
        continue
      }

      window.localStorage.removeItem(key)
    }
  }, values)
}

export async function requireVisibleLocator(
  page: Page,
  candidates: LocatorCandidate[],
  timeoutMs: number,
) {
  const locator = await findVisibleLocator(page, candidates, timeoutMs)
  if (locator) {
    return locator
  }

  throw new Error(
    `Could not find a visible locator among: ${candidates
      .map((candidate) => candidate.description)
      .join(", ")}`,
  )
}

export async function findVisibleLocator(
  page: Page,
  candidates: LocatorCandidate[],
  timeoutMs: number,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs

  do {
    for (const candidate of candidates) {
      const locator = candidate.getLocator(page).first()
      const count = await locator.count().catch(() => 0)
      if (count === 0) {
        continue
      }

      const isVisible = await locator.isVisible().catch(() => false)
      if (isVisible) {
        return locator
      }
    }

    if (Date.now() < deadline) {
      await page.waitForTimeout(250)
    }
  } while (Date.now() < deadline)

  return null
}

export async function maybeRevealUsernamePasswordLogin(
  page: Page,
  getUsernameCandidates: () => LocatorCandidate[],
  getPasswordCandidates: () => LocatorCandidate[],
) {
  const usernameInput = await findVisibleLocator(
    page,
    getUsernameCandidates(),
    500,
  )
  const passwordInput = await findVisibleLocator(
    page,
    getPasswordCandidates(),
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

export async function maybeCheckAgreement(page: Page, agreeSelector?: string) {
  if (!agreeSelector) {
    return
  }

  const checkbox = await findVisibleLocator(
    page,
    [
      {
        description: "agreement checkbox",
        getLocator: (currentPage) => currentPage.locator(agreeSelector),
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

export function createLocatorFactory(
  envPrefix: string,
  extras: {
    usernameCandidates?: LocatorCandidate[]
    passwordCandidates?: LocatorCandidate[]
    submitCandidates?: LocatorCandidate[]
  } = {},
) {
  return {
    getUsernameCandidates(
      config: Pick<LoginLocatorConfig, "usernameSelector">,
    ): LocatorCandidate[] {
      return [
        ...(config.usernameSelector
          ? [
              {
                description: `${envPrefix}_USERNAME_SELECTOR`,
                getLocator: (page: Page) =>
                  page.locator(config.usernameSelector!),
              },
            ]
          : []),
        ...(extras.usernameCandidates ?? []),
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
    },

    getPasswordCandidates(
      config: Pick<LoginLocatorConfig, "passwordSelector">,
    ): LocatorCandidate[] {
      return [
        ...(config.passwordSelector
          ? [
              {
                description: `${envPrefix}_PASSWORD_SELECTOR`,
                getLocator: (page: Page) =>
                  page.locator(config.passwordSelector!),
              },
            ]
          : []),
        ...(extras.passwordCandidates ?? []),
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
    },

    getSubmitCandidates(
      config: Pick<LoginLocatorConfig, "submitSelector">,
    ): LocatorCandidate[] {
      return [
        ...(config.submitSelector
          ? [
              {
                description: `${envPrefix}_SUBMIT_SELECTOR`,
                getLocator: (page: Page) =>
                  page.locator(config.submitSelector!),
              },
            ]
          : []),
        ...(extras.submitCandidates ?? []),
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
    },
  }
}
