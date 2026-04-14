import type { Locator, Page } from "@playwright/test"

export type LocatorCandidate = {
  description: string
  getLocator: (page: Page) => Locator
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
