import { STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("CommunityResourceCache")
// Two fixed entries keep the cache bounded, including when the remote image URL changes.
const CACHE_NAME = "all-api-hub-community-resources-v1"
const CACHE_KEYS = {
  catalog: "https://all-api-hub.invalid/community/catalog",
  image: "https://all-api-hub.invalid/community/wechat-image",
} as const
const REQUEST_STARTED_HEADER = "x-community-request-started"
type ResourceKind = keyof typeof CACHE_KEYS

/** Reads a persistent response body; unavailable storage is a cache miss for display. */
export async function readCommunityResourceCache(
  kind: ResourceKind,
): Promise<Response | undefined> {
  try {
    return await (await caches.open(CACHE_NAME)).match(CACHE_KEYS[kind])
  } catch (error) {
    logger.warn("Could not read community resource cache", { kind, error })
    return undefined
  }
}

/** Accepts a newly validated response without letting an older request replace a newer one. */
export async function acceptCommunityResourceResponse(
  kind: ResourceKind,
  response: Response,
  requestStartedAt: number,
  signal: AbortSignal,
): Promise<void> {
  try {
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.COMMUNITY_RESOURCES,
      async () => {
        if (signal.aborted) return
        const cache = await caches.open(CACHE_NAME)
        // A read failure must skip the write, rather than overwrite an unknown newer value.
        const previous = await cache.match(CACHE_KEYS[kind])
        const previousStartedAt = Number(
          previous?.headers.get(REQUEST_STARTED_HEADER),
        )
        if (signal.aborted || previousStartedAt > requestStartedAt) return
        const headers = new Headers(response.headers)
        headers.set(REQUEST_STARTED_HEADER, String(requestStartedAt))
        await cache.put(
          CACHE_KEYS[kind],
          new Response(response.body, { headers }),
        )
      },
    )
  } catch (error) {
    // Displaying a successful remote response does not depend on cache permissions or quota.
    logger.warn("Could not cache community resource", { kind, error })
  }
}
