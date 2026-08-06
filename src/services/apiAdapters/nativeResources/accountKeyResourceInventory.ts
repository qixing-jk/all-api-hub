import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
  type AccountKeyResourceCollection,
  type AccountKeyResourceFacts,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"

const MAX_COLLECTION_PAGES = 100

/** Returns a stable comparison key for a provider-native account-key reference. */
export const accountKeyResourceRefIdentity = (
  ref: AccountKeyResourceRef,
): string =>
  JSON.stringify([ref.accountId, ref.siteType, ref.scopeKey, ref.resourceId])

const awaitAbortablePage = <T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  if (!signal) return promise

  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(
        new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Aborted,
        }),
      )
      return
    }

    const abort = () =>
      reject(
        new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Aborted,
        }),
      )
    signal.addEventListener("abort", abort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener("abort", abort)
        reject(error)
      },
    )
  })
}

/**
 * Loads a complete native key collection while rejecting duplicate resources,
 * cursor cycles, and unexpectedly deep pagination.
 */
export async function collectAccountKeyResourceInventory(
  collection: AccountKeyResourceCollection,
  options: { search?: string; signal?: AbortSignal } = {},
): Promise<AccountKeyResourceFacts[]> {
  const rows: AccountKeyResourceFacts[] = []
  const refs = new Set<string>()
  const cursors = new Set<string>()
  let cursor: string | undefined

  for (let pageCount = 0; pageCount < MAX_COLLECTION_PAGES; pageCount += 1) {
    const page = await awaitAbortablePage(
      collection.list(
        {
          ...(options.search ? { search: options.search } : {}),
          ...(cursor ? { cursor } : {}),
        },
        { signal: options.signal },
      ),
      options.signal,
    )

    for (const item of page.items) {
      const identity = accountKeyResourceRefIdentity(item.ref)
      if (refs.has(identity)) {
        throw new AccountKeyResourceError({
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
        })
      }
      refs.add(identity)
      rows.push(item)
    }

    if (!page.nextCursor) return rows
    if (cursors.has(page.nextCursor)) {
      throw new AccountKeyResourceError({
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
      })
    }
    cursors.add(page.nextCursor)
    cursor = page.nextCursor
  }

  throw new AccountKeyResourceError({
    code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
  })
}
