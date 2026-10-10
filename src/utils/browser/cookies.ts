import "~/utils/browser/browserEnvironment"

/** Read scoped Cookie metadata; failures must not become an empty session. */
export async function getCookiesForDomain(
  domain: string,
  storeId?: string,
): Promise<browser.cookies.Cookie[]> {
  if (typeof globalThis.browser?.cookies?.getAll !== "function") {
    throw new Error("Browser Cookie API is unavailable")
  }
  return browser.cookies.getAll({ domain, ...(storeId ? { storeId } : {}) })
}

/**
 * Checks whether browser cookie-store enumeration is available.
 */
export function hasCookieStoresAPI(): boolean {
  return (
    typeof (globalThis as any).browser?.cookies?.getAllCookieStores ===
    "function"
  )
}

/**
 * Lists browser cookie stores when supported.
 */
export async function getAllCookieStores(): Promise<
  browser.cookies.CookieStore[]
> {
  if (!hasCookieStoresAPI()) {
    return []
  }

  return await browser.cookies.getAllCookieStores()
}
