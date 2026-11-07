import { getCookieHeaderForUrlResult } from "~/utils/browser/cookieHelper"
import { getAllCookieStores } from "~/utils/browser/cookies"

const SESSION_COOKIE_PREFIX = "session="

/** Capture the verified New API session from the login tab's actual partition. */
export async function captureNewApiLoginCookieCredential(
  tabId: number,
  origin: string,
): Promise<{ cookie: string } | null> {
  const stores = await getAllCookieStores()
  const store = stores.find((candidate) => candidate.tabIds.includes(tabId))
  if (!store) return null
  const result = await getCookieHeaderForUrlResult(
    new URL("/api/user/self", origin).href,
    {
      storeId: store.id,
      includeSession: true,
    },
  )
  if (result.failureReason) return null
  const cookies = result.header
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.startsWith(SESSION_COOKIE_PREFIX))
  const cookie = cookies[0]
  if (
    cookies.length !== 1 ||
    !cookie?.slice(SESSION_COOKIE_PREFIX.length).trim()
  )
    return null
  return { cookie }
}
