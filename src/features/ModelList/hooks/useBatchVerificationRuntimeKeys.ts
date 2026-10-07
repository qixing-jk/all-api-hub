import { useCallback, useRef } from "react"

import { type AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import {
  fetchDisplayAccountRuntimeKeys,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"

import { type AccountBatchVerifyModelItem } from "../batchVerificationState"

/** Own runtime-key promises for one batch verification session. */
export function useBatchVerificationRuntimeKeys() {
  const runtimeKeyCacheRef = useRef(
    new Map<string, Promise<AccountRuntimeKey[]>>(),
  )
  const resolvedRuntimeKeyCacheRef = useRef(
    new Map<string, Promise<AccountRuntimeKey>>(),
  )
  const clearCachedRuntimeKeyPromises = useCallback(() => {
    runtimeKeyCacheRef.current.clear()
    resolvedRuntimeKeyCacheRef.current.clear()
  }, [])

  const getAccountRuntimeKeys = useCallback(
    (item: AccountBatchVerifyModelItem): Promise<AccountRuntimeKey[]> => {
      const account = item.source.account
      const cached = runtimeKeyCacheRef.current.get(account.id)
      if (cached) return cached

      const promise = fetchDisplayAccountRuntimeKeys(account)
      runtimeKeyCacheRef.current.set(account.id, promise)
      return promise
    },
    [],
  )

  const getResolvedRuntimeKey = useCallback(
    (
      item: AccountBatchVerifyModelItem,
      runtimeKey: AccountRuntimeKey,
      abortSignal?: AbortSignal,
    ): Promise<AccountRuntimeKey> => {
      const cacheKey = `${item.source.account.id}:${runtimeKey.id}`
      const cached = resolvedRuntimeKeyCacheRef.current.get(cacheKey)
      const promise =
        cached ??
        resolveDisplayAccountRuntimeKeySecret(item.source.account, runtimeKey, {
          abortSignal,
        })
      if (!cached) {
        const cachedPromise = promise.catch((error) => {
          resolvedRuntimeKeyCacheRef.current.delete(cacheKey)
          throw error
        })
        cachedPromise.catch(() => {})
        resolvedRuntimeKeyCacheRef.current.set(cacheKey, cachedPromise)
      }

      if (!abortSignal || !cached) return promise
      if (abortSignal.aborted) {
        return Promise.reject(
          abortSignal.reason ?? new DOMException("Aborted", "AbortError"),
        )
      }

      return Promise.race([
        promise,
        new Promise<AccountRuntimeKey>((_resolve, reject) => {
          abortSignal.addEventListener(
            "abort",
            () =>
              reject(
                abortSignal.reason ?? new DOMException("Aborted", "AbortError"),
              ),
            { once: true },
          )
        }),
      ])
    },
    [],
  )

  return {
    getAccountRuntimeKeys,
    getResolvedRuntimeKey,
    clearCachedRuntimeKeyPromises,
  }
}
