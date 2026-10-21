import "~/utils/browser/browserEnvironment"

/** Read scoped Cookie metadata; failures must not become an empty session. */
export async function getCookiesForDomain(
  domain: string,
  storeId?: string,
): Promise<browser.cookies.Cookie[]> {
  if (typeof globalThis.browser?.cookies?.getAll !== "function") {
    throw new Error("Browser Cookie API is unavailable")
  }
  const hostname = domain.replace(/^\./, "").toLowerCase()
  const labels = hostname.split(".")
  // A hostname filter misses parent-domain cookies. Query ancestors as well,
  // retaining API-path cookies that a root-URL query would omit. Filter out
  // siblings returned by ancestor queries, and keep the requested store.
  const domains = [hostname]
  for (let i = 1; i < labels.length - 1; i += 1)
    domains.push(labels.slice(i).join("."))
  const batches = await Promise.all(
    domains.map((domain) =>
      browser.cookies.getAll({
        domain,
        ...(storeId ? { storeId } : {}),
      }),
    ),
  )
  const captured = new Map<string, browser.cookies.Cookie>()
  for (const cookie of batches.flat()) {
    const cookieDomain = cookie.domain.replace(/^\./, "").toLowerCase()
    if (
      hostname !== cookieDomain &&
      (cookie.hostOnly || !hostname.endsWith(`.${cookieDomain}`))
    )
      continue
    if (storeId && cookie.storeId !== storeId) continue
    const key = JSON.stringify([
      cookie.storeId,
      cookie.domain,
      cookie.path,
      cookie.name,
      cookie.firstPartyDomain,
      cookie.partitionKey,
    ])
    if (!captured.has(key)) captured.set(key, cookie)
  }
  return [...captured.values()]
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
