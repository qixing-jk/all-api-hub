import "~/utils/browser/browserEnvironment"

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
